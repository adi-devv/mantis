/**
 * In-page DOM walker.
 *
 * `walker` is serialized (Function#toString) and executed inside the page via
 * page.evaluate, so it must stay fully self-contained: no imports, no references
 * to anything outside its own body. Only `import type`-style declarations (erased
 * at compile time) may live at module level.
 *
 * Iframes: the walker only marks them (a region node carrying `frame`); capture() walks
 * each frame separately and splices its nodes in. Known gap: closed shadow roots are
 * unreadable from script.
 */

export type NodeKind = 'interactive' | 'heading' | 'region' | 'text' | 'prose';

export interface RawNode {
  kind: NodeKind;
  /** Stable element number; only interactive nodes have one. */
  id?: number;
  /** Iframe placeholder regions only: registry number of the <iframe> element (not shown). */
  frame?: number;
  /** Role for interactive nodes, region label (header, nav, dialog, ...) for regions. */
  role: string;
  name: string;
  /** Heading level 1-6. */
  level?: number;
  /** Plain state words: disabled, checked, required, expanded, ... */
  states: string[];
  /** Current value of inputs / selects (password values are masked). */
  value?: string;
  href?: string;
  /** Option labels for native <select>. */
  options?: string[];
  /** Input holds a secret (password). */
  secret?: boolean;
  /** Dialog regions only: the dialog blocks the rest of the page. */
  covers?: boolean;
  /** Index (in the node array) of the containing region, or -1 for top level. */
  parent: number;
  /** Region nesting depth. */
  depth: number;
  inViewport: boolean;
  /** Interactive only: another element is on top at the element's center. */
  covered: boolean;
  /** Interactive only: `name` is a guess from icons/tooltips/href/nearby text, not an accessible name. */
  inferred?: boolean;
  /** Interactive only: visible message explaining why the field is in error. */
  errorText?: string;
  /** Page-unique id of the outermost repeated-sibling row (tr, li, card...) this node sits in. */
  row?: number;
  /** Id of the sibling group the row belongs to; rows of one group are candidates for compaction. */
  rowGroup?: number;
  /** Text nodes only: this is a live message (role=alert / status / aria-live), kept for diffs. */
  live?: 'alert' | 'status';
  /** Inside a prose paragraph (an inline link in running text). */
  inline?: boolean;
  /** Interactive only: a text-entry field that has keyboard focus (site memory never hides it). */
  focused?: boolean;
  /** Control found only by the empty-page screen-reader-content pass. */
  srOnly?: boolean;
  /** This content belongs to a closed disclosure whose trigger must be opened first. */
  requiresOpen?: { id: number; name: string };
  /** Bounding box in document coordinates: [x, y, width, height], rounded. */
  box?: [number, number, number, number];
}

export interface WalkResult {
  url: string;
  title: string;
  nodes: RawNode[];
  /** Capture stopped early because the page exceeded the node cap. */
  truncated: boolean;
  /** Viewport and document size in px (used to derive regions on landmark-less pages). */
  page?: { vw: number; vh: number; docW: number; docH: number };
}

export function walker(includeSrOnly = false): WalkResult {
  interface Registry {
    ids: WeakMap<Element, number>;
    next: number;
    byId: Map<number, WeakRef<Element>>;
  }
  // Numbers in a child frame start at its base (10001, 20001, ...) so they never clash with the page's.
  const win = window as unknown as { __mantis?: Registry; __mantisBase?: number };
  const reg: Registry = (win.__mantis ??= { ids: new WeakMap(), next: (win.__mantisBase ?? 0) + 1, byId: new Map() });
  /** Elements given a click-type listener by page script (recorded by Mantis's init script, if loaded). */
  const clickListeners = (window as unknown as { __mantisClick?: WeakSet<Element> }).__mantisClick;

  const MAX_NODES = 3000;
  const SKIP = new Set([
    'script', 'style', 'noscript', 'template', 'head', 'svg', 'canvas',
    'object', 'embed', 'link', 'meta', 'title', 'audio', 'video', 'datalist',
  ]);
  const INTERACTIVE_ROLES = new Set([
    'button', 'link', 'checkbox', 'radio', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'switch', 'combobox', 'textbox', 'searchbox', 'option', 'slider', 'spinbutton',
  ]);
  const LANDMARK_ROLES: Record<string, string> = {
    banner: 'header', navigation: 'nav', main: 'main', complementary: 'aside',
    contentinfo: 'footer', search: 'search',
  };
  const TAG_REGIONS: Record<string, string> = {
    header: 'header', nav: 'nav', main: 'main', aside: 'aside', footer: 'footer', search: 'search',
  };
  // Derived from INTERACTIVE_ROLES so the selector can't drift from the roles interactiveRole() accepts.
  const INTERACTIVE_SEL =
    'a[href],button,input:not([type=hidden]),select,textarea,summary,' +
    Array.from(INTERACTIVE_ROLES, (r) => `[role=${r}]`).join(',') +
    ',[contenteditable]:not([contenteditable=false]),[onclick]';
  // A live region with one of these explicit roles is a widget holding choices, not a status message.
  const COMPOSITE_ROLES = new Set(['menu', 'menubar', 'listbox', 'tree', 'grid', 'radiogroup', 'tablist']);
  // A node whose subtree contains any of these is not a plain text leaf.
  const LEAF_BLOCKER =
    ':not(span,b,i,em,strong,small,sub,sup,br,code,abbr,mark,u,s,time,cite,q,wbr,font,img,bdi,del,ins,var,kbd,samp),' +
    '[role],[onclick],[tabindex],[contenteditable]';

  const nodes: RawNode[] = [];
  let truncated = false;

  const vw = document.documentElement.clientWidth || window.innerWidth;
  // In quirks mode (no doctype) clientHeight is the whole document, which would make everything "in view".
  const vh = document.compatMode === 'BackCompat' ? window.innerHeight : document.documentElement.clientHeight || window.innerHeight;
  const docW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);

  // Private-use code points are icon-font glyphs (Font Awesome etc.): no meaning as text.
  const collapse = (s: string): string => s.replace(/[-]/g, ' ').replace(/\s+/g, ' ').trim();
  const cap = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
  const inDoc = (r: DOMRect): boolean =>
    r.right + window.scrollX > 0 && r.bottom + window.scrollY > 0 &&
    r.left + window.scrollX < docW && r.top + window.scrollY < docH;
  const inView = (r: DOMRect): boolean => r.bottom > 0 && r.right > 0 && r.top < vh && r.left < vw;

  function childrenOf(e: Element): Node[] {
    if (e.shadowRoot) return Array.from(e.shadowRoot.childNodes);
    if (e.localName === 'slot') {
      const assigned = (e as HTMLSlotElement).assignedNodes({ flatten: true });
      if (assigned.length) return assigned;
    }
    return Array.from(e.childNodes);
  }

  /** Non-interactive roles whose aria-label is their content (star ratings, gauges). */
  const LABELLED_ROLES = new Set(['img', 'image', 'meter', 'progressbar']);

  /** Clipped, near-transparent and tiny content is useful only on an otherwise empty page. */
  function screenReaderOnly(e: Element, cs: CSSStyleDeclaration, r: DOMRect): boolean {
    const clip = cs.clip.replace(/\s+/g, '').toLowerCase();
    const path = cs.clipPath.replace(/\s+/g, '').toLowerCase();
    return (r.width <= 1.5 && r.height <= 1.5) ||
      /^rect\((?:0(?:px)?,){3}0(?:px)?\)$/.test(clip) ||
      /^inset\((?:50%|100%)(?:\)|\s)/.test(cs.clipPath.trim().toLowerCase()) ||
      path === 'inset(50%)' || path === 'inset(100%)' ||
      (Number.isFinite(parseFloat(cs.opacity)) && parseFloat(cs.opacity) > 0 && parseFloat(cs.opacity) < 0.01);
  }

  /** Rendered text of a subtree, skipping hidden parts; stops once past `limit` chars. */
  function deepText(root: Element, limit: number, ratingMetadata = true, withHidden = false): string {
    let out = '';
    const rec = (e: Element, isRoot: boolean): void => {
      if (out.length > limit) return;
      const t = e.localName;
      let block = false;
      if (!isRoot) {
        if (SKIP.has(t) || (!withHidden && e.getAttribute('aria-hidden') === 'true') || (e as HTMLElement).inert) return;
        if (t === 'img') { out += ' ' + (e.getAttribute('alt') || (ratingMetadata ? e.getAttribute('title') : '') || '') + ' '; return; }
        if (t === 'input') {
          const ty = (e as HTMLInputElement).type;
          if (ty === 'button' || ty === 'submit' || ty === 'reset') out += ' ' + (e as HTMLInputElement).value + ' ';
          return;
        }
        if (t === 'textarea' || t === 'select') return;
        const cs = getComputedStyle(e);
        if (cs.display === 'none') return;
        if (cs.visibility === 'hidden') { for (const c of childrenOf(e)) if (c.nodeType === 1) rec(c as Element, false); return; }
        const semantic = explicitRole(e);
        if (semantic && LABELLED_ROLES.has(semantic)) {
          const label = collapse(e.getAttribute('aria-label') || (ratingMetadata ? e.getAttribute('title') : '') || '');
          if (label) { out += ' ' + label + ' '; return; }
        }
        const rating = ratingMetadata ? ratingText(e) : '';
        if (rating) { out += ' ' + rating + ' '; return; }
        block = !cs.display.startsWith('inline') && cs.display !== 'contents';
      }
      if (block) out += ' ';
      for (const c of childrenOf(e)) {
        if (c.nodeType === 3) out += c.nodeValue ?? '';
        else if (c.nodeType === 1) rec(c as Element, false);
        if (out.length > limit) break;
      }
      if (block) out += ' ';
    };
    if (root.localName === 'img') return root.getAttribute('alt') || (ratingMetadata ? root.getAttribute('title') : '') || '';
    rec(root, true);
    return collapse(out);
  }

  function byIdRef(el: Element, attr: string): string {
    const ids = el.getAttribute(attr);
    if (!ids) return '';
    const root = el.getRootNode() as Document | ShadowRoot;
    const parts: string[] = [];
    for (const id of ids.split(/\s+/)) {
      const t = root.getElementById?.(id) ?? document.getElementById(id);
      if (t) parts.push(deepText(t, 200));
    }
    return collapse(parts.join(' '));
  }

  function explicitRole(el: Element): string {
    const r = (el.getAttribute('role') || '').trim().split(/\s+/)[0].toLowerCase();
    return r === 'presentation' || r === 'none' || r === 'generic' ? '' : r;
  }

  function inputRole(type: string): string {
    switch (type) {
      case 'button': case 'submit': case 'reset': case 'image': case 'file': return 'button';
      case 'checkbox': return 'checkbox';
      case 'radio': return 'radio';
      case 'range': return 'slider';
      case 'number': return 'spinbutton';
      case 'search': return 'searchbox';
      default: return 'textbox';
    }
  }

  /** Role a native element has with no role attribute ('' if none of interest). */
  function implicitRole(el: Element): string {
    const t = el.localName;
    if (t === 'a' || t === 'area') return el.hasAttribute('href') ? 'link' : '';
    if (t === 'button' || t === 'summary') return 'button';
    if (t === 'select') {
      const s = el as HTMLSelectElement;
      return s.multiple || s.size > 1 ? 'listbox' : 'combobox';
    }
    if (t === 'textarea') return 'textbox';
    if (t === 'option') return 'option';
    if (t === 'input') return inputRole((el as HTMLInputElement).type);
    return '';
  }

  /** Role if this element is an interactive control, else ''. */
  const SCRIPT_CLICK_NEVER = new Set(['html', 'body', 'label', 'main', 'nav', 'header', 'footer', 'aside', 'section', 'article', 'form', 'ul', 'ol', 'table', 'tbody', 'tr']);
  const CONTAINER_SEL = 'h1,h2,h3,h4,h5,h6,p,ul,ol,table,form,section,article,main,nav,header,footer,aside';

  function interactiveRole(el: Element, explicit: string, cs: CSSStyleDeclaration): string {
    const t = el.localName;
    const native =
      (t === 'input' && (el as HTMLInputElement).type !== 'hidden') ||
      t === 'select' || t === 'textarea' || t === 'button' || t === 'summary' ||
      ((t === 'a' || t === 'area') && el.hasAttribute('href'));
    if (native) return INTERACTIVE_ROLES.has(explicit) ? explicit : implicitRole(el);
    if (INTERACTIVE_ROLES.has(explicit)) return explicit;
    // Delegated click handlers often leave each item without a role, listener, or pointer cursor.
    // The ARIA container still establishes that its immediate items are choices.
    const parentRole = el.parentElement ? explicitRole(el.parentElement) : '';
    if ((parentRole === 'listbox' || parentRole === 'menu') &&
      (t === 'li' || t === 'div') && !el.querySelector(INTERACTIVE_SEL) &&
      collapse(el.textContent || '') && cs.pointerEvents !== 'none') {
      return parentRole === 'listbox' ? 'option' : 'menuitem';
    }
    const ce = el.getAttribute('contenteditable');
    if (ce !== null && ce !== 'false') return 'textbox';
    const clickish =
      el.hasAttribute('onclick') ||
      (el.hasAttribute('tabindex') && (el as HTMLElement).tabIndex >= 0 && cs.cursor === 'pointer');
    if (clickish && !el.querySelector(INTERACTIVE_SEL)) return 'clickable';
    // Made clickable only by script (no role, link or tabindex; invisible to the accessibility tree):
    // a click listener on the element itself, or where a pointer cursor starts (frameworks that
    // listen once at the root). Only small elements with content and nothing interactive inside.
    if (SCRIPT_CLICK_NEVER.has(t) || el.querySelector(INTERACTIVE_SEL)) return '';
    const listener = clickListeners?.has(el) === true;
    const pointerStart = cs.cursor === 'pointer' && (!el.parentElement || getComputedStyle(el.parentElement).cursor !== 'pointer');
    if (!listener && !pointerStart) return '';
    // A container (event delegation root, a section of the page) is not one clickable thing.
    if (el.querySelector(CONTAINER_SEL)) return '';
    if (listener && cs.cursor !== 'pointer') {
      for (const d of Array.from(el.querySelectorAll('*')).slice(0, 60)) if (getComputedStyle(d).cursor === 'pointer') return '';
    }
    const b = el.getBoundingClientRect();
    if (b.width * b.height > 0.25 * vw * vh || b.width < 4 || b.height < 4) return '';
    if (!collapse(el.textContent || '') && !el.querySelector('img,svg,i,[class*=icon]')) return '';
    return 'clickable';
  }

  function accName(el: Element, role: string): string {
    const t = el.localName;
    let n = byIdRef(el, 'aria-labelledby');
    if (n) return cap(n, 80);
    n = collapse(el.getAttribute('aria-label') || '');
    if (n) return cap(n, 80);
    const labels = (el as HTMLInputElement).labels;
    if (labels && labels.length) {
      n = collapse(Array.from(labels).map((l) => deepText(l, 200)).join(' '));
      if (n) return cap(n, 80);
    }
    if (t === 'input') {
      const inp = el as HTMLInputElement;
      if (inp.type === 'button' || inp.type === 'submit' || inp.type === 'reset') {
        n = collapse(inp.value) || (inp.type === 'submit' ? 'Submit' : inp.type === 'reset' ? 'Reset' : '');
        if (n) return cap(n, 80);
      }
      if (inp.type === 'image') {
        n = collapse(el.getAttribute('alt') || inp.value || '');
        if (n) return cap(n, 80);
      }
    } else {
      n = withoutIconText(el, deepText(el, 200, false));
      if (n) return cap(n, 80);
    }
    n = collapse(el.getAttribute('title') || '');
    if (n) return cap(n, 80);
    n = collapse(el.getAttribute('placeholder') || '');
    if (n) return cap(n, 80);
    return '';
  }

  // ---- name inference for unnamed controls --------------------------------
  // Evidence only, in order: SVG title/aria-label, icon class or ligature, tooltip attributes, href,
  // adjacent text. The caller marks the result as inferred. No evidence -> no name.

  const ICON_FONT_CLASS = /(^|\s)material-(icons|symbols)[\w-]*(\s|$)/;
  const ICON_PREFIX =
    /^(?:fa[srlbdt]?|bi|icon|icons|ico|lucide|ti|tabler-icon|mdi|glyphicon|octicon|ri|bx[sl]?|feather|ion|ionicon|uil|uis|iconoir|ph|codicon|remixicon)-(.+)$/;
  const ICON_NOISE = new Set([
    'fw', 'lg', 'sm', 'xs', 'xl', 'xxs', 'spin', 'pulse', 'solid', 'regular', 'light', 'thin', 'duotone', 'brands',
    'stack', 'inverse', 'border', 'li', 'ul', 'rotate', 'flip', 'btn', 'button', 'only', 'wrapper', 'wrap',
    'container', 'left', 'right', 'small', 'large', 'medium', 'default', 'primary', 'secondary', 'md', 'bold',
    'fill', 'outline', 'link', 'text', 'inline', 'base', 'size', 'color', 'sharp', 'rounded', 'round', 'twotone',
    'before', 'after', 'font', 'svg', 'img', 'image', 'icon', 'icons', 'i', 'mr', 'ml', 'me', 'ms',
  ]);
  const ICON_ALIAS: Record<string, string> = {
    x: 'close', times: 'close', xmark: 'close', cross: 'close', 'x lg': 'close', 'x circle': 'close',
    'times circle': 'close', 'xmark circle': 'close', 'magnifying glass': 'search', magnify: 'search',
    gear: 'settings', cog: 'settings', cogs: 'settings', bars: 'menu', hamburger: 'menu', navicon: 'menu',
    ellipsis: 'more', 'ellipsis v': 'more', 'ellipsis h': 'more', 'more vert': 'more', 'more horiz': 'more',
    'three dots': 'more', dots: 'more', pen: 'edit', pencil: 'edit', 'pencil alt': 'edit', 'pen to square': 'edit',
    plus: 'add', 'plus lg': 'add', 'plus circle': 'add', 'trash can': 'trash', 'trash alt': 'trash',
    'trash 2': 'trash', bin: 'trash', 'delete bin': 'trash', 'ellipsis vertical': 'more',
    'ellipsis horizontal': 'more', 'arrow path': 'refresh', sync: 'refresh', redo: 'refresh',
  };
  const SOCIAL_HOSTS: Record<string, string> = {
    'facebook.com': 'facebook', 'twitter.com': 'twitter', 'x.com': 'x', 'instagram.com': 'instagram',
    'linkedin.com': 'linkedin', 'youtube.com': 'youtube', 'github.com': 'github', 'tiktok.com': 'tiktok',
    'reddit.com': 'reddit', 'discord.com': 'discord', 'discord.gg': 'discord', 't.me': 'telegram',
    'wa.me': 'whatsapp', 'pinterest.com': 'pinterest', 'gitlab.com': 'gitlab',
  };
  const TOOLTIP_ATTRS = ['title', 'data-tooltip', 'data-title', 'data-original-title', 'data-tip', 'data-bs-title',
    'data-tooltip-content', 'data-hint', 'tooltip'];
  const GENERIC_PATH = new Set(['index', 'default', 'page', 'item', 'view', 'html', 'php', 'aspx', 'null', 'undefined', 'redirect']);

  function classOf(e: Element): string {
    return e.getAttribute('class') || '';
  }

  /** Ligature icon fonts (material-icons "delete") render their name as text: not a real label. */
  function withoutIconText(el: Element, n: string): string {
    const ic = n ? iconFontText(el) : '';
    if (!ic) return n;
    return n === ic ? '' : collapse(n.startsWith(ic) ? n.slice(ic.length) : n.endsWith(ic) ? n.slice(0, -ic.length) : n);
  }

  /** Text that comes from ligature icon fonts (class material-icons ...) inside `el`. */
  function iconFontText(el: Element): string {
    const parts: string[] = [];
    const pick = (e: Element): void => {
      if (ICON_FONT_CLASS.test(classOf(e))) parts.push(collapse(e.textContent || ''));
    };
    pick(el);
    for (const d of Array.from(el.querySelectorAll('[class*=material-]')).slice(0, 6)) pick(d);
    return collapse(parts.join(' '));
  }

  function aliasIcon(raw: string): string {
    let w = raw.toLowerCase().replace(/[_\s]+/g, '-');
    w = w.replace(/^(ios|md|logo)-/, '');
    w = w.replace(/-(fill|filled|line|o|outline|outlined|solid|regular|sharp|rounded|bold|thin|light|duotone|twotone|alt)$/, '');
    w = w.replace(/-\d+(px)?$/, '');
    if (!/[a-z]/.test(w) || ICON_NOISE.has(w)) return '';
    const words = w.replace(/-/g, ' ').trim();
    if (words.length < 1 || words.length > 30) return '';
    return ICON_ALIAS[words] ?? words;
  }

  function iconFromClasses(e: Element): string {
    for (const tok of classOf(e).split(/\s+/)) {
      const m = ICON_PREFIX.exec(tok);
      if (!m) continue;
      const w = aliasIcon(m[1]);
      if (w) return w;
    }
    return '';
  }

  function nameFromHref(a: Element): string {
    const raw = a.getAttribute('href') || '';
    if (/^mailto:/i.test(raw)) return 'email';
    if (/^tel:/i.test(raw)) return 'phone';
    let u: URL;
    try { u = new URL((a as HTMLAnchorElement).href, location.href); } catch { return ''; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'file:') return '';
    const how = u.searchParams.get('how');
    if (how === 'up') return 'upvote';
    if (how === 'un' || how === 'unvote') return 'unvote';
    if (how === 'down') return 'downvote';
    const segs = u.pathname.toLowerCase().split('/').filter(Boolean).map((x) => { try { return decodeURIComponent(x); } catch { return x; } });
    for (const sg of segs) {
      if (/^(upvote|downvote|unvote|like|unlike|follow|unfollow|share|bookmark|subscribe|print|download|rss|feed)$/.test(sg)) return sg;
    }
    const host = u.hostname.replace(/^www\./, '');
    if (u.origin !== location.origin) {
      for (const h of Object.keys(SOCIAL_HOSTS)) if (host === h || host.endsWith('.' + h)) return SOCIAL_HOSTS[h];
    }
    if (u.origin === location.origin && !segs.length && !u.search) return 'home';
    const last = (segs[segs.length - 1] || '').replace(/\.\w{1,5}$/, '');
    if (/^[a-z][a-z_-]{2,24}$/.test(last) && !GENERIC_PATH.has(last)) return last.replace(/[_-]+/g, ' ');
    if (u.origin !== location.origin && !segs.length) return host;
    return '';
  }

  /** Short visible text right next to the control (same parent, nothing interactive in it). */
  function adjacentText(el: Element): string {
    const from = (n: Node | null): string => {
      if (!n) return '';
      let t = '';
      if (n.nodeType === 3) t = collapse(n.nodeValue ?? '');
      else if (n.nodeType === 1) {
        const e = n as Element;
        if (SKIP.has(e.localName) || e.querySelector(INTERACTIVE_SEL) || e.matches(INTERACTIVE_SEL)) return '';
        // Only inline neighbours: a heading or block above is a title for the section, not for this control.
        if (!getComputedStyle(e).display.startsWith('inline')) return '';
        t = deepText(e, 60);
      }
      return t.length >= 2 && t.length <= 30 && /[\p{L}]/u.test(t) ? t : '';
    };
    const side = (e: Element): string => from(e.previousSibling) || from(e.nextSibling);
    let t = side(el);
    const p = el.parentElement;
    if (!t && p && p.children.length === 1 && p.childNodes.length === 1) t = side(p);
    return t;
  }

  function inferName(el: Element, role: string): string {
    // 1. SVG title / aria-label inside
    for (const svg of Array.from(el.querySelectorAll('svg')).slice(0, 3)) {
      const t = collapse(svg.querySelector('title')?.textContent || '');
      if (t) return t;
      const al = collapse(svg.getAttribute('aria-label') || '');
      if (al) return al;
    }
    const inner = el.querySelector('[aria-label]');
    if (inner) { const al = collapse(inner.getAttribute('aria-label') || ''); if (al) return al; }
    // 2. icon class names / ligatures / sprite ids / image file names
    let w = iconFromClasses(el);
    if (w) return w;
    const withClass = Array.from(el.querySelectorAll('[class]')).slice(0, 12);
    for (const d of withClass) { w = iconFromClasses(d); if (w) return w; }
    // Common icon libraries place the glyph name in a data attribute instead of a class.
    for (const e of [el, ...Array.from(el.querySelectorAll('[data-icon],[data-lucide],[data-feather]')).slice(0, 8)]) {
      for (const attr of ['data-icon', 'data-lucide', 'data-feather']) {
        const raw = (e.getAttribute(attr) || '').replace(/^(?:mdi|fa|lucide|feather|tabler):/i, '');
        if (!/^[a-z][a-z0-9_-]{1,30}$/i.test(raw)) continue;
        w = aliasIcon(raw);
        if (w) return w;
      }
    }
    const lig = iconFontText(el);
    if (/^[a-z][a-z0-9_]{1,30}$/i.test(lig)) { w = aliasIcon(lig); if (w) return w; }
    const use = el.querySelector('use');
    const ref = use ? use.getAttribute('href') || use.getAttribute('xlink:href') || '' : '';
    if (ref.includes('#')) {
      const frag = ref.slice(ref.indexOf('#') + 1).replace(/^(icon|ic|i|svg|symbol)[-_]/i, '');
      w = aliasIcon(frag);
      if (w) return w;
    }
    const img = el.querySelector('img');
    if (img && !img.getAttribute('alt')) {
      const base = ((img.getAttribute('src') || '').split(/[?#]/)[0].split('/').pop() || '').replace(/\.\w{2,4}$/, '');
      if (/^[a-z][a-z_-]{2,20}$/i.test(base)) { w = aliasIcon(base); if (w) return w; }
    }
    // 3. tooltip attributes on the control or something inside it
    const tipEls: Element[] = [el, ...Array.from(el.querySelectorAll(TOOLTIP_ATTRS.map((a) => `[${a}]`).join(','))).slice(0, 4)];
    for (const e of tipEls) {
      for (const a of TOOLTIP_ATTRS) {
        const v = collapse(e.getAttribute(a) || '');
        if (v) return v;
      }
    }
    // 4. a dismiss class on the control or its icon: close-btn, btn-close, modal-close, closeButton
    for (const e of [el, ...Array.from(el.querySelectorAll('[class]')).slice(0, 6)]) {
      const parts = classOf(e).replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase().split(/[\s_-]+/);
      if (parts.includes('close') || parts.includes('dismiss')) return 'close';
    }
    // 5. where the link goes
    if (role === 'link') { const h = nameFromHref(el); if (h) return h; }
    // 6. text right next to it
    return adjacentText(el);
  }

  const peerCache = new Map<string, Element[]>();
  const unnamed: { node: RawNode; el: Element; role: string }[] = [];
  /** Last resort for a control with no accessible name or icon evidence. */
  function contextualName(el: Element, role: string): string {
    const group = el.closest('article,section,form,dialog,[role=dialog],[role=group],[role=region],nav,[role=navigation],main,aside,header,footer,[role=main],[role=complementary],[role=banner],[role=contentinfo]');
    const heading = group?.querySelector('h1,h2,h3,h4,h5,h6,[role=heading]');
    const context = collapse((heading && !heading.contains(el) ? deepText(heading, 50) : '') ||
      group?.getAttribute('aria-label') || '');
    if (context) return `${cap(context, 25)} ${role}`;
    const siblings = el.parentElement ? Array.from(el.parentElement.children).filter((s) =>
      s.localName === el.localName && (s.matches(INTERACTIVE_SEL) || s.hasAttribute('onclick'))) : [];
    if (siblings.length > 1) return `${role} ${siblings.indexOf(el) + 1} of ${siblings.length}`;
    // Separate wrappers often contain one icon button each. Use their document position
    // rather than giving every otherwise identical control the same bare role.
    let peers = peerCache.get(el.localName);
    if (!peers) {
      peers = Array.from(document.querySelectorAll(el.localName)).filter((s) =>
        s.matches(INTERACTIVE_SEL) || s.hasAttribute('onclick'));
      peerCache.set(el.localName, peers);
    }
    const at = peers.indexOf(el);
    return at >= 0 ? `${role} ${at + 1}` : role;
  }

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  /**
   * A name that is an identifier, not words: one whitespace-free string that is a URI with a scheme
   * (gid://..., urn:...; not a plain web address), a UUID, or 16+ chars of hex/digits/_-:/. .
   * "SKU-1234 blue" (words around a code) is a real name.
   */
  function isMachineToken(raw: string): boolean {
    const s = raw.replace(/…$/, '');
    if (!s || /\s/.test(s)) return false;
    if (/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(s)) return !/^(?:https?|ftp|wss?|file):/i.test(s);
    if (/^urn:\S+$/i.test(s) || UUID.test(s)) return true;
    return s.length >= 16 && /^[0-9a-f_:/.-]+$/i.test(s) && /[0-9a-f]/i.test(s);
  }

  const ROW_STOP = new Set(['body', 'html', 'main', 'form', 'nav', 'header', 'footer', 'aside', 'section', 'article',
    'dialog', 'fieldset', 'details', 'ul', 'ol', 'table', 'tbody', 'thead']);
  /**
   * Text of the row a control sits in, for a control whose own name is empty or a machine token.
   * Walks up (at most 5 levels) through ancestors holding exactly this one interactive control; the
   * first one with short text wins (a li/tr/row or any non-inline block). Screen-reader-only text counts,
   * aria-hidden text only when nothing else is there. Two or more controls, a structural container or a
   * long text end the search: nothing is borrowed.
   */
  function rowName(el: Element): string {
    let a = el.parentElement;
    for (let d = 0; a && d < 5; d++, a = a.parentElement) {
      if (ROW_STOP.has(a.localName)) return '';
      if (a.querySelectorAll(INTERACTIVE_SEL).length + (a.matches(INTERACTIVE_SEL) ? 1 : 0) !== 1) return '';
      const rowish = a.localName === 'li' || a.localName === 'tr' || /^(?:row|option|listitem)$/.test(explicitRole(a));
      if (!rowish && getComputedStyle(a).display.startsWith('inline')) continue;
      const t = deepText(a, 160, false) || deepText(a, 160, false, true);
      if (!t) { if (rowish) return ''; continue; }
      if (t.length > 120 || !/[\p{L}\p{N}]/u.test(t) || isMachineToken(t)) return '';
      return cap(t, 80);
    }
    return '';
  }

  /** Only descriptive rating metadata; arbitrary tooltips remain outside page text. */
  function ratingText(el: Element): string {
    const label = collapse(el.getAttribute('aria-label') || el.getAttribute('title') || '');
    return /\b(?:ratings?|stars?)\b|\b\d(?:\.\d)?\s*(?:\/|out of)\s*\d\b/i.test(label) ? label : '';
  }

  function regionInfo(el: Element, explicit: string): { label: string; name: string } | null {
    const tag = el.localName;
    let label = '';
    if (explicit) {
      label =
        LANDMARK_ROLES[explicit] ??
        (explicit === 'dialog' || explicit === 'alertdialog' ? 'dialog'
          : explicit === 'region' ? 'region' : explicit === 'form' ? 'form' : '');
    }
    if (!label) {
      label = TAG_REGIONS[tag] ??
        (tag === 'dialog' ? 'dialog' : tag === 'form' ? 'form' : tag === 'section' ? 'region' : '');
    }
    if (!label && el.getAttribute('aria-modal') === 'true') label = 'dialog';
    if (!label) return null;
    let name = byIdRef(el, 'aria-labelledby') || collapse(el.getAttribute('aria-label') || '');
    if (!name && (label === 'form' || label === 'region')) name = collapse(el.getAttribute('title') || '');
    if (!name && label === 'dialog') {
      const h = el.querySelector('h1,h2,h3,h4,h5,h6,[role=heading]');
      if (h) name = deepText(h, 100);
    }
    if ((label === 'region' || label === 'form') && !name) return null;
    return { label, name: cap(name, 60) };
  }

  function overlapArea(r: DOMRect): number {
    return Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) *
      Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
  }

  function coversPage(el: Element, r: DOMRect): boolean {
    if (el.getAttribute('aria-modal') === 'true') return true;
    try { if (el.matches(':modal')) return true; } catch { /* :modal unsupported */ }
    if (overlapArea(r) >= 0.5 * vw * vh) return true;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).position === 'fixed' && overlapArea(a.getBoundingClientRect()) >= 0.9 * vw * vh) return true;
    }
    return false;
  }

  function composedContains(a: Node, b: Node): boolean {
    for (let n: Node | null = b; n; n = n.parentNode ?? (n as ShadowRoot).host ?? null) {
      if (n === a) return true;
    }
    return false;
  }

  /** Tiny/visually-hidden native controls are operated through their rendered label. */
  function labelPointerTarget(el: Element, r: DOMRect): { label: HTMLLabelElement; rect: DOMRect } | null {
    const labels = (el as HTMLInputElement).labels;
    if (!labels?.length) return null;
    const cs = getComputedStyle(el);
    const localOpacity = parseFloat(cs.opacity);
    // screenReaderOnly also recognizes near-transparent elements; opacity itself needs a hit test.
    const clippedOrSrOnly = screenReaderOnly(el, cs, r) &&
      !(Number.isFinite(localOpacity) && localOpacity > 0 && localOpacity < 0.01);
    const alwaysHidden = r.width <= 4 || r.height <= 4 || clippedOrSrOnly;
    const transparent = effectiveOpacity(el) < 0.01;
    if (!alwaysHidden && !transparent) return null;
    if (!alwaysHidden && inView(r)) {
      const x = (Math.max(r.left, 0) + Math.min(r.right, vw)) / 2;
      const y = (Math.max(r.top, 0) + Math.min(r.bottom, vh)) / 2;
      const root = el.getRootNode();
      const scope: Document | ShadowRoot = root instanceof ShadowRoot ? root : document;
      const hit = scope.elementFromPoint(x, y);
      if (hit === el || !!hit && el.contains(hit)) return null;
    }
    for (const label of Array.from(labels)) {
      const style = getComputedStyle(label);
      const rect = label.getBoundingClientRect();
      if (style.display !== 'none' && style.visibility === 'visible' && effectiveOpacity(label) > 0 &&
          rect.width >= 4 && rect.height >= 4 && inDoc(rect)) return { label, rect };
    }
    return null;
  }

  function isCovered(el: Element, r: DOMRect): boolean {
    const labelTarget = labelPointerTarget(el, r);
    const hitRect = labelTarget?.rect ?? r;
    if (!inView(hitRect)) return false;
    const x = (Math.max(hitRect.left, 0) + Math.min(hitRect.right, vw)) / 2;
    const y = (Math.max(hitRect.top, 0) + Math.min(hitRect.bottom, vh)) / 2;
    const root = (labelTarget?.label ?? el).getRootNode();
    const scope: Document | ShadowRoot = root instanceof ShadowRoot ? root : document;
    const hit = scope.elementFromPoint(x, y);
    if (!hit) return false;
    if (composedContains(el, hit) || composedContains(hit, el)) return false;
    if (labelTarget && composedContains(labelTarget.label, hit)) return false;
    const control = el as HTMLInputElement;
    const labels = control.labels;
    if (labels && Array.from(labels).some((label) => composedContains(label, hit))) return false;
    // A custom label in an open shadow tree may use for=; verify the association through
    // the control's ID and root rather than treating an arbitrary enclosing body as a label.
    if (el.id && hit.closest('label')?.htmlFor === el.id && hit.getRootNode() === el.getRootNode()) return false;
    return true;
  }

  function hrefOf(el: Element): string | undefined {
    const raw = el.getAttribute('href');
    if (!raw || raw.startsWith('#') || /^javascript:/i.test(raw)) return undefined;
    try {
      const u = new URL((el as HTMLAnchorElement).href, location.href);
      const s = u.origin === location.origin ? u.pathname + u.search : u.host + u.pathname + u.search;
      return cap(s, 60);
    } catch {
      return undefined;
    }
  }

  // ---- repeated sibling rows (tr, li, cards) ---------------------------------
  let curRow = -1;
  let curGroup = -1;
  let nextRow = 1;
  let inProse = false;
  let suppressText = false;
  const PROSE_TAGS = new Set(['p', 'blockquote', 'dd', 'figcaption', 'li']);
  const BLOCK_SEL =
    'div,p,ul,ol,table,section,article,h1,h2,h3,h4,h5,h6,blockquote,pre,form,nav,header,footer,aside,main,li,dl,dt,dd,tr,td,fieldset,figure,details,hr';

  /** Rows among `kids`: runs of >=3 repeats of a block of 1-3 siblings (by tag + classes). */
  function detectRows(kids: Element[]): Map<Element, { row: number; group: number }> | null {
    if (kids.length < 3) return null;
    // Only things that are rows/cards in practice; bare <td>, <span>, <a>... siblings are layout, not rows.
    const rowish = (e: Element): boolean =>
      /^(tr|li|article|dt|dd)$/.test(e.localName) || e.getAttribute('role') === 'row' || e.getAttribute('role') === 'listitem' ||
      (/^(div|section|a)$/.test(e.localName) && e.classList.length > 0);
    if (!kids.every(rowish) && kids.filter(rowish).length < 3) return null;
    const sig = kids.map((k) => k.localName + '.' + Array.from(k.classList).sort().join('.'));
    let out: Map<Element, { row: number; group: number }> | null = null;
    let i = 0;
    while (i < kids.length) {
      let found = false;
      for (let k = 1; k <= 3 && !found; k++) {
        let reps = 1;
        const same = (a: number, b: number): boolean => {
          for (let t = 0; t < k; t++) if (sig[a + t] !== sig[b + t]) return false;
          return true;
        };
        while (i + (reps + 1) * k <= kids.length && same(i, i + reps * k)) reps++;
        const distinct = new Set(sig.slice(i, i + k)).size;
        if (reps >= 3 && kids.slice(i, i + k).every(rowish) && (k === 1 || distinct >= 2)) {
          // A row is a small unit (a table row, a card): a "row" holding half the page is a layout wrapper.
          let small = true;
          for (let rr = 0; rr < reps && small; rr++) {
            let count = 0;
            for (let t = 0; t < k; t++) {
              const e = kids[i + rr * k + t];
              count += e.querySelectorAll(INTERACTIVE_SEL).length + (e.matches(INTERACTIVE_SEL) ? 1 : 0);
            }
            small = count <= 14;
          }
          if (small) {
            const group = nextRow++;
            out ??= new Map();
            for (let rr = 0; rr < reps; rr++) {
              const row = nextRow++;
              for (let t = 0; t < k; t++) out.set(kids[i + rr * k + t], { row, group });
            }
          }
          i += reps * k;
          found = true;
        }
      }
      if (!found) i++;
    }
    return out;
  }

  function stamp(n: RawNode, r: DOMRect): RawNode {
    n.box = [Math.round(r.left + window.scrollX), Math.round(r.top + window.scrollY), Math.round(r.width), Math.round(r.height)];
    if (curRow >= 0) { n.row = curRow; n.rowGroup = curGroup; }
    if (inProse && n.kind === 'interactive') n.inline = true;
    return n;
  }

  // ---- visual meaning --------------------------------------------------------

  function parseColor(c: string): { r: number; g: number; b: number; a: number } | null {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)/.exec(c);
    if (!m) return null;
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  function isRedish(c: string): boolean {
    const p = parseColor(c);
    return !!p && p.a > 0.5 && p.r >= 170 && p.g <= 100 && p.b <= 100 && p.r - Math.max(p.g, p.b) >= 90;
  }
  /** 0 = plain; 1 = colored or dark opaque background (looks like a filled call-to-action). */
  function emphasis(cs: CSSStyleDeclaration): number {
    const p = parseColor(cs.backgroundColor);
    if (!p || p.a < 0.6) return 0;
    const mx = Math.max(p.r, p.g, p.b) / 255;
    const mn = Math.min(p.r, p.g, p.b) / 255;
    const l = (mx + mn) / 2;
    const sat = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
    return (sat >= 0.35 && l > 0.15 && l < 0.85) || l < 0.2 ? 1 : 0;
  }
  function effectiveOpacity(el: Element): number {
    let o = 1;
    let a: Element | null = el;
    for (let d = 0; a && d < 5; d++, a = a.parentElement) {
      const v = parseFloat(getComputedStyle(a).opacity);
      if (!Number.isNaN(v)) o *= v;
    }
    return o;
  }
  function isVisibleBox(e: Element): boolean {
    const cs = getComputedStyle(e);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    const b = e.getBoundingClientRect();
    return b.width > 0 && b.height > 0;
  }
  const ERROR_CLASS = /(^|[\s_-])(error|errors|invalid|danger|err|err-msg|field-error|form-error|help-block|validation)([\s_-]|$)/i;
  const FIELD_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton']);

  /** Visible message that explains why a field is wrong (aria-linked, or right next to it). */
  function findErrorText(el: Element, invalid: boolean): string {
    const linked: Element[] = [];
    for (const attrName of ['aria-errormessage', 'aria-describedby']) {
      const ids = (el.getAttribute(attrName) || '').split(/\s+/).filter(Boolean);
      const root = el.getRootNode() as Document | ShadowRoot;
      for (const id of ids) {
        const t = root.getElementById?.(id) ?? document.getElementById(id);
        if (t) linked.push(t);
      }
    }
    const adjacent: Element[] = [];
    const sib = el.nextElementSibling;
    if (sib) adjacent.push(sib);
    const p = el.parentElement;
    if (p && p !== document.body && p.nextElementSibling && p.querySelectorAll(INTERACTIVE_SEL).length <= 1) {
      adjacent.push(p.nextElementSibling);
    }
    const ok = (e: Element, trust: boolean): string => {
      if (!isVisibleBox(e) || e.querySelector(INTERACTIVE_SEL)) return '';
      const looksLikeError = e.getAttribute('role') === 'alert' || ERROR_CLASS.test(classOf(e));
      if (!looksLikeError && !(trust && invalid)) return '';
      const t = deepText(e, 120);
      return t.length >= 2 && t.length <= 120 ? cap(t, 70) : '';
    };
    for (const e of linked) { const t = ok(e, true); if (t) return t; }
    for (const e of adjacent) { const t = ok(e, false); if (t) return t; }
    return '';
  }

  const NAV_CONTEXT =
    'nav,[role=navigation],[role=tablist],[role=menubar],[role=menu],.nav,.navbar,.tabs,.menu,[class*=nav-],[class*=-nav],[class*=tabs],[class*=menu]';
  const ACTIVE_CLASS = /(^|\s)(active|current|selected|is-active|is-current|is-selected)(\s|$)/;

  let deepActive: Element | null = document.activeElement;
  while (deepActive?.shadowRoot?.activeElement) deepActive = deepActive.shadowRoot.activeElement;

  const buttonish: { node: RawNode; el: Element; r: DOMRect; cs: CSSStyleDeclaration }[] = [];

  /**
   * A visible panel can retain text while its native controls are hidden. Preserve the text, but
   * identify the collapsed trigger that controls the panel so it is not mistaken for an action.
   */
  function closedControllerFor(el: Element): { id: number; name: string } | undefined {
    const parent = (node: Element): Element | null => {
      const root = node.getRootNode();
      return node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
    };
    const rootOf = (node: Element): Document | ShadowRoot => {
      const root = node.getRootNode();
      return root instanceof ShadowRoot ? root : document;
    };
    const idOf = (node: Element): number => {
      let id = reg.ids.get(node);
      if (id === undefined) {
        id = reg.next++;
        reg.ids.set(node, id);
        reg.byId.set(id, new WeakRef(node));
      }
      return id;
    };
    const describe = (node: Element): { id: number; name: string } | undefined => {
      const role = interactiveRole(node, explicitRole(node), getComputedStyle(node));
      if (!role || !node.getClientRects().length) return undefined;
      return { id: idOf(node), name: cap(accName(node, role) || collapse(node.textContent || '') || role, 60) };
    };
    for (let node: Element | null = parent(el); node; node = parent(node)) {
      if (node instanceof HTMLDetailsElement && !node.open) {
        const summary = Array.from(childrenOf(node)).find((child): child is HTMLElement => child instanceof HTMLElement && child.localName === 'summary');
        if (summary && summary !== el) {
          const found = describe(summary);
          if (found) return found;
        }
      }
    }
    const ids = new Set<string>();
    for (let node: Element | null = el; node; node = parent(node)) if (node.id) ids.add(node.id);
    if (!ids.size) return undefined;
    // `aria-controls` does not cross a shadow boundary. Requiring this explicit
    // relationship avoids labelling arbitrary nearby or ancestor controls as a filter.
    for (const trigger of Array.from(rootOf(el).querySelectorAll('[aria-expanded="false"][aria-controls]'))) {
      if ((trigger.getAttribute('aria-controls') || '').split(/\s+/).some((id) => ids.has(id))) {
        const found = describe(trigger);
        if (found) return found;
      }
    }
    return undefined;
  }

  function emitInteractive(el: Element, role: string, parent: number, depth: number, r: DOMRect, srOnly = false, requiresOpen?: { id: number; name: string }): void {
    const t = el.localName;
    const states: string[] = [];
    let ownName = accName(el, role);
    if (ownName && isMachineToken(ownName)) ownName = rowName(el) || ownName;
    const node: RawNode = {
      kind: 'interactive', role, name: ownName, states, parent, depth,
      inViewport: inView(r), covered: isCovered(el, r),
    };
    if (srOnly) node.srOnly = true;
    if (requiresOpen) node.requiresOpen = requiresOpen;
    if (!node.name) {
      const guess = cap(inferName(el, role), 40);
      if (guess) { node.name = guess; node.inferred = true; }
      else if (/^(?:input|select|textarea)$/.test(t)) node.name = rowName(el);
    }
    // Unnamed links keep their href as the identifier (translate shows it when the name is empty).
    if (!node.name && !el.hasAttribute('href')) unnamed.push({ node, el, role });
    const input = el as HTMLInputElement;
    const attr = (a: string): string | null => el.getAttribute(a);
    const ecs = getComputedStyle(el);

    if (t === 'input') {
      const ty = input.type;
      if (['email', 'password', 'tel', 'url', 'date', 'datetime-local', 'time', 'month', 'week', 'color', 'file'].includes(ty)) {
        states.push(ty);
      }
      if (ty === 'password') node.secret = true;
    }
    if ((t === 'button' || t === 'input') && input.type === 'submit' && input.form) states.push('submit');
    if ((el as HTMLInputElement).required || attr('aria-required') === 'true') states.push('required');
    if (el.matches(':disabled') || attr('aria-disabled') === 'true') states.push('disabled');
    else if (!srOnly && ((!rescued.has(el) && effectiveOpacity(el) < 0.5) || ecs.pointerEvents === 'none')) states.push('looks disabled');
    if (((t === 'input' || t === 'textarea') && input.readOnly) || attr('aria-readonly') === 'true') states.push('readonly');
    if (role === 'checkbox' || role === 'radio' || role === 'switch' || role === 'menuitemcheckbox' || role === 'menuitemradio') {
      if (t === 'input' && input.indeterminate) states.push('mixed');
      else if (input.checked === true || attr('aria-checked') === 'true') states.push('checked');
      else if (attr('aria-checked') === 'mixed') states.push('mixed');
    }
    if ((el as HTMLOptionElement).selected === true || attr('aria-selected') === 'true') states.push('selected');
    const expanded = attr('aria-expanded');
    if (expanded === 'true') states.push('expanded');
    else if (expanded === 'false') states.push('collapsed');
    else if (t === 'summary' && el.parentElement instanceof HTMLDetailsElement) {
      states.push(el.parentElement.open ? 'expanded' : 'collapsed');
    }
    if (attr('aria-pressed') === 'true') states.push('pressed');
    const cur = attr('aria-current');
    if (cur && cur !== 'false') states.push('current');
    else if (!states.includes('selected') && (role === 'link' || role === 'tab' || role === 'menuitem')) {
      // Nav item highlighted only by CSS class ("active"), on the item or its <li>.
      const li = el.parentElement;
      const activeClass = ACTIVE_CLASS.test(classOf(el)) || (li !== null && li.localName === 'li' && ACTIVE_CLASS.test(classOf(li)));
      if (activeClass && el.closest(NAV_CONTEXT)) states.push(role === 'tab' ? 'selected' : 'current');
    }

    let invalid = attr('aria-invalid') === 'true';
    if (!invalid) { try { invalid = el.matches(':user-invalid'); } catch { /* unsupported */ } }
    const field = FIELD_ROLES.has(role) || t === 'input' || t === 'textarea' || t === 'select';
    let errorText = '';
    let redLook = false;
    if (field) {
      errorText = findErrorText(el, invalid);
      redLook = (parseFloat(ecs.borderTopWidth) > 0 && isRedish(ecs.borderTopColor)) || isRedish(ecs.color);
    }
    if (invalid || errorText || redLook) {
      states.push('error');
      if (errorText) node.errorText = errorText;
    }

    let value = '';
    if (t === 'select') {
      const sel = el as HTMLSelectElement;
      value = Array.from(sel.selectedOptions).map((o) => collapse(o.label || o.text)).join(', ');
      const opts = Array.from(sel.options).map((o) => cap(collapse(o.label || o.text), 30));
      node.options = opts.length > 12 ? [...opts.slice(0, 12), `…+${opts.length - 12} more`] : opts;
    } else if (t === 'textarea' || (t === 'input' && node.role !== 'checkbox' && node.role !== 'radio' && node.role !== 'button')) {
      value = input.value;
    } else if ((el as HTMLElement).isContentEditable) {
      value = collapse(el.textContent || '');
    } else if (role === 'slider' || role === 'spinbutton') {
      value = attr('aria-valuenow') || '';
    }
    if (value) node.value = node.secret ? '•••' : cap(value, 60);

    if (t === 'a' || t === 'area') node.href = hrefOf(el);

    let id = reg.ids.get(el);
    if (id === undefined) {
      id = reg.next++;
      reg.ids.set(el, id);
      reg.byId.set(id, new WeakRef(el));
    }
    node.id = id;
    if (el === deepActive && (field || (el as HTMLElement).isContentEditable)) node.focused = true;
    stamp(node, r);
    nodes.push(node);
    if (role === 'button' || (t === 'a' && /(^|[\s_-])(btn|button|cta)([\s_-]|$)/i.test(classOf(el)))) {
      buttonish.push({ node, el, r, cs: ecs });
    }
  }

  /** Mark the most prominent button of each form / dialog as `primary`. */
  function markPrimary(): void {
    const groups = new Map<Element, typeof buttonish>();
    for (const b of buttonish) {
      if (b.node.states.includes('disabled') || b.node.states.includes('looks disabled')) continue;
      const g = b.el.closest('form,dialog,[role=dialog],[role=alertdialog],[aria-modal=true]');
      if (!g) continue;
      (groups.get(g) ?? groups.set(g, []).get(g)!).push(b);
    }
    for (const [g, list] of groups) {
      let winner: (typeof list)[number] | undefined;
      if (list.length >= 2) {
        const maxH = Math.max(...list.map((b) => b.r.height)) || 1; // height, not area: label length must not make a button "bigger"
        const scored = list
          .map((b) => ({ b, score: emphasis(b.cs) + b.r.height / maxH }))
          .sort((x, y) => y.score - x.score);
        if (scored[0].score - scored[1].score >= 0.3) winner = scored[0].b;
      }
      if (!winner && g.localName === 'form') {
        const subs = list.filter((b) => {
          const e = b.el as HTMLInputElement;
          return !!e.form && (e.localName === 'button' || e.localName === 'input') && e.type === 'submit';
        });
        if (subs.length === 1) winner = subs[0];
      }
      if (winner) {
        const s = winner.node.states;
        const k = s.indexOf('submit');
        if (k >= 0) s.splice(k, 1);
        s.push('primary');
      }
    }
  }

  /** A visible canvas (a chart or drawing) gets one line, so the agent knows media()/data() can read it. */
  function canvasMark(el: Element, parent: number, depth: number): void {
    if (el.getAttribute('aria-hidden') === 'true') return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 80 || r.height < 40 || !inDoc(r)) return;
    let id = reg.ids.get(el);
    if (id === undefined) {
      id = reg.next++;
      reg.ids.set(el, id);
      reg.byId.set(id, new WeakRef(el));
    }
    const label = collapse(el.getAttribute('aria-label') || el.getAttribute('title') || '');
    const name = `${label ? ` "${label}"` : ''} ${Math.round(r.width)}×${Math.round(r.height)}: chart or drawing; data({id: ${id}})`;
    nodes.push(stamp({ kind: 'text', id, role: 'canvas', name, states: [], parent, depth, inViewport: inView(r), covered: false }, r));
  }

  /** A visible iframe becomes a region placeholder; capture() fills it with the frame's own nodes. */
  function frameMark(el: Element, parent: number, depth: number): void {
    if (el.getAttribute('aria-hidden') === 'true') return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility !== 'visible' || parseFloat(cs.opacity) === 0) return;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 20 || !inDoc(r)) return;
    let id = reg.ids.get(el);
    if (id === undefined) {
      id = reg.next++;
      reg.ids.set(el, id);
      reg.byId.set(id, new WeakRef(el));
    }
    let name = collapse(el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('name') || '');
    if (!name) { try { name = new URL((el as HTMLIFrameElement).src).hostname; } catch { /* srcdoc / about:blank */ } }
    nodes.push(stamp({ kind: 'region', role: 'iframe', name: cap(name, 60), frame: id, states: [], parent, depth, inViewport: inView(r), covered: false }, r));
  }

  /** Controls emitted from inside an opacity:0 wrapper (their inherited opacity must not read as "looks disabled"). */
  const rescued = new WeakSet<Element>();

  /**
   * Is this stacked element part of a page-level overlay (cookie banner, signup popup, modal) that sits
   * over `control` without containing it? Same notion as coversPage: a modal dialog, or a position:fixed box.
   * A hit on a shadow host (a web-component popup whose fixed box lives in its shadow root) is followed
   * down to the element really hit at (x, y).
   */
  function inOverlay(h: Element, control: Element, x: number, y: number): boolean {
    let deep = h;
    for (let k = 0; k < 8 && deep.shadowRoot && !composedContains(deep, control); k++) {
      const inner = deep.shadowRoot.elementFromPoint(x, y);
      if (!inner || inner === deep) break;
      deep = inner;
    }
    for (let n: Element | null = deep; n; n = n.parentElement ?? ((n.getRootNode() as ShadowRoot).host ?? null)) {
      if (composedContains(n, control)) return false;
      if (n.getAttribute('aria-modal') === 'true') return true;
      try { if (n.matches(':modal')) return true; } catch { /* :modal unsupported */ }
      if (getComputedStyle(n).position === 'fixed') return true;
    }
    return false;
  }

  /**
   * An opacity:0 element's text is dropped, but a native control inside it (or the element itself, the
   * "transparent click target" pattern: an invisible checkbox stretched over its row) can still be fully
   * operable. Emit those, never the text. A control counts only when it could really be used: visible,
   * not pointer-events:none, not aria-hidden/inert, a real box in the document, and on top. When its centre
   * is in the viewport we hit-test it with the stack at that point, skipping page-level overlays (fixed
   * popups, modals; the control is then emitted flagged covered); any other element on top hides it, as
   * does a covered menu. When the centre is off screen we cannot hit-test without scrolling, so we accept
   * it on the style checks alone.
   */
  function rescueControls(root: Element, parent: number, depth: number): void {
    const sel = 'select,input:not([type=hidden]),textarea';
    const found = Array.from(root.querySelectorAll(sel));
    if (root.matches(sel)) found.unshift(root);
    for (const c of found) {
      if (nodes.length >= MAX_NODES) { truncated = true; return; }
      if (c.closest('[aria-hidden="true"],[inert]')) continue;
      const cs = getComputedStyle(c);
      if (cs.visibility !== 'visible' || cs.pointerEvents === 'none' || cs.display === 'none' || (c !== root && parseFloat(cs.opacity) === 0)) continue;
      const r = c.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || !inDoc(r)) continue;
      const labelTarget = labelPointerTarget(c, r);
      const hitRect = labelTarget?.rect ?? r;
      const x = hitRect.left + hitRect.width / 2;
      const y = hitRect.top + hitRect.height / 2;
      if (x >= 0 && y >= 0 && x < vw && y < vh) {
        const hitRoot = (labelTarget?.label ?? c).getRootNode();
        const scope: Document | ShadowRoot = hitRoot instanceof ShadowRoot ? hitRoot : document;
        const labels = (c as HTMLInputElement).labels;
        let top: Element | undefined;
        for (const h of scope.elementsFromPoint(x, y)) {
          if (inOverlay(h, c, x, y)) continue;
          top = h;
          break;
        }
        if (!top) continue;
        if (!composedContains(c, top) &&
            !(labelTarget && composedContains(labelTarget.label, top)) &&
            !(labels && Array.from(labels).some((l) => composedContains(l, top!)))) continue;
      }
      const role = interactiveRole(c, explicitRole(c), cs);
      if (!role) continue;
      rescued.add(c);
      emitInteractive(c, role, parent, depth, r);
    }
  }

  function createsFixedContainingBlock(cs: CSSStyleDeclaration): boolean {
    if (cs.transform !== 'none' || cs.perspective !== 'none' || cs.filter !== 'none' || cs.backdropFilter !== 'none') return true;
    if (/(?:^|\s)(?:paint|layout|strict|content)(?:\s|$)/.test(cs.contain)) return true;
    if (/(?:^|,)\s*(?:transform|perspective|filter)(?:\s|,|$)/.test(cs.willChange)) return true;
    return (cs as CSSStyleDeclaration & { containerType?: string }).containerType !== undefined &&
      (cs as CSSStyleDeclaration & { containerType?: string }).containerType !== 'normal';
  }

  /**
   * A zero-sized overflow container normally hides its whole subtree. A fixed or absolutely
   * positioned descendant can escape when its containing block is outside that clip. Only pay for
   * this bounded check at the otherwise-pruned container; if it cannot settle the question cheaply,
   * preserve the prune.
   */
  function hasPositionedEscape(root: Element): boolean {
    const rootStyle = getComputedStyle(root);
    const rootBlocks = createsFixedContainingBlock(rootStyle);
    const pending: { el: Element; blockedForFixed: boolean; blockedForAbsolute: boolean }[] = [];
    for (const child of childrenOf(root)) {
      if (child.nodeType === 1) pending.push({
        el: child as Element,
        blockedForFixed: rootBlocks,
        blockedForAbsolute: rootBlocks || rootStyle.position !== 'static',
      });
    }
    let scanned = 0;
    let foundEscape = false;
    while (pending.length && scanned < 400) {
      const { el, blockedForFixed, blockedForAbsolute } = pending.shift()!;
      scanned++;
      if (SKIP.has(el.localName) || el.getAttribute('aria-hidden') === 'true' || (el as HTMLElement).inert) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.contentVisibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      const escapes = (cs.position === 'fixed' || cs.position === 'absolute') && cs.visibility === 'visible' &&
        r.width > 0 && r.height > 0 &&
        ((cs.position === 'fixed' && !blockedForFixed) || (cs.position === 'absolute' && !blockedForAbsolute));
      if (escapes) {
        foundEscape = true;
        continue;
      }
      if (cs.visibility === 'visible' && r.width > 0 && r.height > 0) return false;
      const blocks = createsFixedContainingBlock(cs);
      for (const child of childrenOf(el)) if (child.nodeType === 1) pending.push({
        el: child as Element,
        blockedForFixed: blockedForFixed || blocks,
        blockedForAbsolute: blockedForAbsolute || blocks || cs.position !== 'static',
      });
    }
    // Reaching the cap with descendants left is deliberately treated as no escape: retain the cheap prune.
    return pending.length === 0 && foundEscape;
  }

  function visit(el: Element, parent: number, depth: number, box: DOMRect, inheritedSr = false, inheritedOpen?: { id: number; name: string }): void {
    if (nodes.length >= MAX_NODES) { truncated = true; return; }
    if (el.localName === 'canvas') { canvasMark(el, parent, depth); return; }
    if (SKIP.has(el.localName)) return;
    if (el.localName === 'iframe' || el.localName === 'frame') { frameMark(el, parent, depth); return; }
    if (el.getAttribute('aria-hidden') === 'true' || (el as HTMLElement).inert) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.contentVisibility === 'hidden') return;
    if (parseFloat(cs.opacity) === 0) { rescueControls(el, parent, depth); return; }

    const contents = cs.display === 'contents';
    const r = contents ? box : el.getBoundingClientRect();
    const requiresOpen = inheritedOpen ?? closedControllerFor(el);
    const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
    if (!includeSrOnly && !contents && (r.width === 0 || r.height === 0) && clips && !hasPositionedEscape(el)) return; // e.g. collapsed accordion panel
    const srOnly = inheritedSr || screenReaderOnly(el, cs, r);
    // A zero-size positioned wrapper can hold a normally rendered absolute child.
    const childSr = inheritedSr || (srOnly && (r.width > 1.5 || r.height > 1.5 ||
      cs.clip !== 'auto' || cs.clipPath !== 'none' || (parseFloat(cs.opacity) > 0 && parseFloat(cs.opacity) < 0.01)));
    const shown = cs.visibility === 'visible' &&
      (contents || (r.width > 0 && r.height > 0 && inDoc(r)));

    const explicit = explicitRole(el);
    const role = interactiveRole(el, explicit, cs);
    if (role) {
      if (shown) emitInteractive(el, role, parent, depth, r, srOnly, requiresOpen);
      return;
    }

    const tag = el.localName;
    if (shown && explicit && LABELLED_ROLES.has(explicit)) {
      const label = collapse(el.getAttribute('aria-label') || el.getAttribute('title') || '');
      if (label && !suppressText) {
        const node = stamp({ kind: 'text', role: 'text', name: cap(label, 120), states: [], parent, depth, inViewport: inView(r), covered: false }, r);
        if (requiresOpen) node.requiresOpen = requiresOpen;
        nodes.push(node);
        if (!el.querySelector(INTERACTIVE_SEL)) return;
      }
    }
    if (shown && !suppressText && !LABELLED_ROLES.has(explicit)) {
      const rating = ratingText(el);
      if (rating) {
        const node = stamp({ kind: 'text', role: 'text', name: cap(rating, 120), states: [], parent, depth, inViewport: inView(r), covered: false }, r);
        if (requiresOpen) node.requiresOpen = requiresOpen;
        nodes.push(node);
        if (!el.querySelector(INTERACTIVE_SEL)) return;
      }
    }
    if (/^h[1-6]$/.test(tag) || explicit === 'heading') {
      if (shown) {
        const name = cap(deepText(el, 200), 80);
        const lvl = tag.length === 2 && tag[0] === 'h' ? Number(tag[1]) : Number(el.getAttribute('aria-level')) || 2;
        if (name) {
          const node = stamp({ kind: 'heading', role: 'heading', name, level: lvl, states: [], parent, depth, inViewport: inView(r), covered: false }, r);
          if (requiresOpen) node.requiresOpen = requiresOpen;
          nodes.push(node);
        }
      }
      // Links inside headings (article cards) still need to be emitted.
      if (!el.querySelector(INTERACTIVE_SEL)) return;
      visitChildren(el, parent, depth, r, false, childSr);
      return;
    }

    // Toasts and status messages: kept even when no control is next to them, so diffs can report them.
    const liveAttr = el.getAttribute('aria-live');
    const live: 'alert' | 'status' | '' =
      explicit === 'alert' ? 'alert'
        : explicit === 'status' || explicit === 'log' || (liveAttr !== null && liveAttr !== 'off' && explicit !== 'alertdialog' && explicit !== 'dialog')
          ? 'status' : '';
    if (live && shown && !suppressText && !COMPOSITE_ROLES.has(explicit)) {
      const msg = cap(deepText(el, 200), 120);
      if (msg && /[\p{L}\p{N}]/u.test(msg)) {
        const node = stamp({ kind: 'text', role: 'text', name: msg, live, states: [], parent, depth, inViewport: inView(r), covered: false }, r);
        if (requiresOpen) node.requiresOpen = requiresOpen;
        nodes.push(node);
        if (!el.querySelector(INTERACTIVE_SEL)) return;
        const prev = suppressText;
        suppressText = true;
        visitChildren(el, parent, depth, r);
        suppressText = prev;
        return;
      }
    }

    let childParent = parent;
    let childDepth = depth;
    const region = cs.visibility === 'visible' ? regionInfo(el, explicit) : null;
    let proseHere = false;
    if (region) {
      nodes.push(stamp({
        kind: 'region', role: region.label, name: region.name, states: [], parent, depth,
        covers: region.label === 'dialog' ? coversPage(el, r) : undefined,
        inViewport: inView(r), covered: false,
      }, r));
      childParent = nodes.length - 1;
      childDepth = depth + 1;
    } else if (shown && !suppressText) {
      const t = deepText(el, 81);
      const isProseTag = PROSE_TAGS.has(tag);
      // A visually present label can be the only useful representation of an option whose
      // native control is hidden until its closed group is opened. Keep that text with the
      // controller guidance instead of letting the hidden descendant suppress it.
      const collapsedHiddenLabel = !!requiresOpen && tag === 'label';
      if (t && t.length <= 80 && !el.shadowRoot && (!el.querySelector(LEAF_BLOCKER) || collapsedHiddenLabel)) {
        const node = stamp({ kind: isProseTag && t.length >= 40 ? 'prose' : 'text', role: 'text', name: t, states: [], parent, depth, inViewport: inView(r), covered: false }, r);
        if (requiresOpen) node.requiresOpen = requiresOpen;
        nodes.push(node);
        return;
      }
      if ((t.length > 80 || (isProseTag && t.length >= 40)) && !el.shadowRoot && !el.querySelector(BLOCK_SEL)) {
        // A paragraph of running text (maybe with inline links): keep it as prose, unless it is
        // mostly link text (a headline card), which the links already cover.
        const full = deepText(el, 600);
        let linkLen = 0;
        for (const a of Array.from(el.querySelectorAll('a,button')).slice(0, 60)) linkLen += deepText(a, 200).length;
        const plain = full.length - linkLen;
        if (plain >= 40 && plain >= full.length * 0.5) {
          const node = stamp({ kind: 'prose', role: 'text', name: cap(full, 1200), states: [], parent, depth, inViewport: inView(r), covered: false }, r);
          if (requiresOpen) node.requiresOpen = requiresOpen;
          nodes.push(node);
          proseHere = true;
        }
      }
    }

    const prevProse = inProse;
    const prevSuppress = suppressText;
    if (proseHere) { inProse = true; suppressText = true; }
    visitChildren(el, childParent, childDepth, r, shown, childSr, requiresOpen);
    inProse = prevProse;
    suppressText = prevSuppress;
  }

  /** Visit child nodes of `el`, tagging repeated sibling rows; text nodes become `text` nodes. */
  function visitChildren(el: Element, parent: number, depth: number, r: DOMRect, textShown = false, inheritedSr = false, inheritedOpen?: { id: number; name: string }): void {
    const kids = childrenOf(el);
    const rows = curRow < 0 ? detectRows(kids.filter((c): c is Element => c.nodeType === 1)) : null;
    for (const c of kids) {
      if (c.nodeType === 3) {
        const t = collapse(c.nodeValue ?? '');
        if (textShown && !suppressText && t.length <= 80 && /[\p{L}\p{N}]/u.test(t)) {
          const node = stamp({ kind: 'text', role: 'text', name: t, states: [], parent, depth, inViewport: inView(r), covered: false }, r);
          if (inheritedOpen) node.requiresOpen = inheritedOpen;
          nodes.push(node);
        }
      } else if (c.nodeType === 1) {
        const info = rows?.get(c as Element);
        if (info) {
          curRow = info.row;
          curGroup = info.group;
          visit(c as Element, parent, depth, r, inheritedSr, inheritedOpen);
          curRow = curGroup = -1;
        } else {
          visit(c as Element, parent, depth, r, inheritedSr, inheritedOpen);
        }
      }
    }
  }

  const rootEl = document.body ?? document.documentElement;
  visit(rootEl, -1, 0, rootEl.getBoundingClientRect());

  markPrimary();

  // A lone unnamed control stays a bare role (no evidence to guess from). Several identical
  // bare controls are indistinguishable, so give those a hint from context or position.
  const bareByRole = new Map<string, number>();
  for (const u of unnamed) bareByRole.set(u.role, (bareByRole.get(u.role) ?? 0) + 1);
  const hinted: { node: RawNode; hint: string }[] = [];
  for (const u of unnamed) {
    if ((bareByRole.get(u.role) ?? 0) < 2) continue;
    const hint = contextualName(u.el, u.role);
    if (hint !== u.role) hinted.push({ node: u.node, hint });
  }
  // A shared context ("Play Area button") still does not tell controls apart: number the repeats.
  const hintCount = new Map<string, number>();
  for (const h of hinted) hintCount.set(h.hint, (hintCount.get(h.hint) ?? 0) + 1);
  const hintSeen = new Map<string, number>();
  for (const h of hinted) {
    const total = hintCount.get(h.hint) ?? 1;
    const at = (hintSeen.get(h.hint) ?? 0) + 1;
    hintSeen.set(h.hint, at);
    h.node.name = total > 1 && !/ \d+( of \d+)?$/.test(h.hint) ? `${h.hint} ${at} of ${total}` : h.hint;
    h.node.inferred = true;
  }

  // Visible text is kept even away from controls (prices, status lines, table cells): dropping it
  // silently loses what the accessibility tree would have shown. Budgets trim it later, with a note.
  const keep = nodes.map(() => true);
  // Drop regions left with no content, then compact indices.
  const filled = nodes.map(() => false);
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].kind === 'region' && !filled[i] && nodes[i].frame === undefined) keep[i] = false;
    if (keep[i] && nodes[i].parent >= 0) filled[nodes[i].parent] = true;
  }
  const remap: number[] = [];
  const out: RawNode[] = [];
  nodes.forEach((n, i) => {
    if (!keep[i]) { remap[i] = -1; return; }
    remap[i] = out.length;
    out.push({ ...n, parent: n.parent >= 0 ? remap[n.parent] : -1 });
  });

  return { url: location.href, title: document.title, nodes: out, truncated, page: { vw, vh, docW, docH } };
}
