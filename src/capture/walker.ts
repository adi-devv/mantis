/**
 * In-page DOM walker.
 *
 * `walker` is serialized (Function#toString) and executed inside the page via
 * page.evaluate, so it must stay fully self-contained: no imports, no references
 * to anything outside its own body. Only `import type`-style declarations (erased
 * at compile time) may live at module level.
 *
 * Known gaps: closed shadow roots are unreadable from script, and iframes are
 * skipped entirely (same-origin frames would need frame-aware element handles
 * and coordinate translation; deferred).
 */

export type NodeKind = 'interactive' | 'heading' | 'region' | 'text';

export interface RawNode {
  kind: NodeKind;
  /** Stable element number; only interactive nodes have one. */
  id?: number;
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
}

export interface WalkResult {
  url: string;
  title: string;
  nodes: RawNode[];
  /** Capture stopped early because the page exceeded the node cap. */
  truncated: boolean;
}

export function walker(): WalkResult {
  interface Registry {
    ids: WeakMap<Element, number>;
    next: number;
    byId: Map<number, WeakRef<Element>>;
  }
  const win = window as unknown as { __mantis?: Registry };
  const reg: Registry = (win.__mantis ??= { ids: new WeakMap(), next: 1, byId: new Map() });

  const MAX_NODES = 3000;
  const SKIP = new Set([
    'script', 'style', 'noscript', 'template', 'head', 'svg', 'canvas', 'iframe', 'frame',
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
  const INTERACTIVE_SEL =
    'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],' +
    '[role=checkbox],[role=radio],[role=tab],[role=menuitem],[role=switch],[role=combobox],' +
    '[role=textbox],[role=searchbox],[role=option],[contenteditable]:not([contenteditable=false]),[onclick]';
  // A node whose subtree contains any of these is not a plain text leaf.
  const LEAF_BLOCKER =
    ':not(span,b,i,em,strong,small,sub,sup,br,code,abbr,mark,u,s,time,cite,q,wbr,font,img,bdi,del,ins,var,kbd,samp),' +
    '[role],[onclick],[tabindex],[contenteditable]';

  const nodes: RawNode[] = [];
  let truncated = false;

  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = document.documentElement.clientHeight || window.innerHeight;
  const docW = Math.max(document.documentElement.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const docH = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);

  const collapse = (s: string): string => s.replace(/\s+/g, ' ').trim();
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

  /** Rendered text of a subtree, skipping hidden parts; stops once past `limit` chars. */
  function deepText(root: Element, limit: number): string {
    let out = '';
    const rec = (e: Element, isRoot: boolean): void => {
      if (out.length > limit) return;
      const t = e.localName;
      let block = false;
      if (!isRoot) {
        if (SKIP.has(t) || e.getAttribute('aria-hidden') === 'true') return;
        if (t === 'img') { out += ' ' + (e.getAttribute('alt') || '') + ' '; return; }
        if (t === 'input') {
          const ty = (e as HTMLInputElement).type;
          if (ty === 'button' || ty === 'submit' || ty === 'reset') out += ' ' + (e as HTMLInputElement).value + ' ';
          return;
        }
        if (t === 'textarea' || t === 'select') return;
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
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
    if (root.localName === 'img') return root.getAttribute('alt') || '';
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
  function interactiveRole(el: Element, explicit: string, cs: CSSStyleDeclaration): string {
    const t = el.localName;
    const native =
      (t === 'input' && (el as HTMLInputElement).type !== 'hidden') ||
      t === 'select' || t === 'textarea' || t === 'button' || t === 'summary' ||
      ((t === 'a' || t === 'area') && el.hasAttribute('href'));
    if (native) return INTERACTIVE_ROLES.has(explicit) ? explicit : implicitRole(el);
    if (INTERACTIVE_ROLES.has(explicit)) return explicit;
    const ce = el.getAttribute('contenteditable');
    if (ce !== null && ce !== 'false') return 'textbox';
    const clickish =
      el.hasAttribute('onclick') ||
      (el.hasAttribute('tabindex') && (el as HTMLElement).tabIndex >= 0 && cs.cursor === 'pointer');
    if (clickish && !el.querySelector(INTERACTIVE_SEL)) return 'clickable';
    return '';
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
      n = deepText(el, 200);
      if (n) return cap(n, 80);
    }
    n = collapse(el.getAttribute('title') || '');
    if (n) return cap(n, 80);
    n = collapse(el.getAttribute('placeholder') || '');
    if (n) return cap(n, 80);
    return '';
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

  function isCovered(el: Element, r: DOMRect): boolean {
    if (!inView(r)) return false;
    const x = (Math.max(r.left, 0) + Math.min(r.right, vw)) / 2;
    const y = (Math.max(r.top, 0) + Math.min(r.bottom, vh)) / 2;
    const root = el.getRootNode();
    const scope: Document | ShadowRoot = root instanceof ShadowRoot ? root : document;
    const hit = scope.elementFromPoint(x, y);
    if (!hit) return false;
    return !(composedContains(el, hit) || composedContains(hit, el));
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

  function emitInteractive(el: Element, role: string, parent: number, depth: number, r: DOMRect): void {
    const t = el.localName;
    const states: string[] = [];
    const node: RawNode = {
      kind: 'interactive', role, name: accName(el, role), states, parent, depth,
      inViewport: inView(r), covered: isCovered(el, r),
    };
    const input = el as HTMLInputElement;
    const attr = (a: string): string | null => el.getAttribute(a);

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
    let invalid = attr('aria-invalid') === 'true';
    if (!invalid) { try { invalid = el.matches(':user-invalid'); } catch { /* unsupported */ } }
    if (invalid) states.push('invalid');

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
    nodes.push(node);
  }

  function visit(el: Element, parent: number, depth: number, box: DOMRect): void {
    if (nodes.length >= MAX_NODES) { truncated = true; return; }
    if (SKIP.has(el.localName)) return;
    if (el.getAttribute('aria-hidden') === 'true' || (el as HTMLElement).inert) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.contentVisibility === 'hidden' || parseFloat(cs.opacity) === 0) return;

    const contents = cs.display === 'contents';
    const r = contents ? box : el.getBoundingClientRect();
    const clips = cs.overflowX !== 'visible' || cs.overflowY !== 'visible';
    if (!contents && (r.width === 0 || r.height === 0) && clips) return; // e.g. collapsed accordion panel
    const shown = cs.visibility === 'visible' && (contents || (r.width > 0 && r.height > 0 && inDoc(r)));

    const explicit = explicitRole(el);
    const role = interactiveRole(el, explicit, cs);
    if (role) {
      if (shown) emitInteractive(el, role, parent, depth, r);
      return;
    }

    const tag = el.localName;
    if (/^h[1-6]$/.test(tag) || explicit === 'heading') {
      if (shown) {
        const name = cap(deepText(el, 200), 80);
        const lvl = tag.length === 2 && tag[0] === 'h' ? Number(tag[1]) : Number(el.getAttribute('aria-level')) || 2;
        if (name) {
          nodes.push({ kind: 'heading', role: 'heading', name, level: lvl, states: [], parent, depth, inViewport: inView(r), covered: false });
        }
      }
      // Links inside headings (article cards) still need to be emitted.
      if (!el.querySelector(INTERACTIVE_SEL)) return;
      for (const c of childrenOf(el)) if (c.nodeType === 1) visit(c as Element, parent, depth, r);
      return;
    }

    let childParent = parent;
    let childDepth = depth;
    const region = cs.visibility === 'visible' ? regionInfo(el, explicit) : null;
    if (region) {
      nodes.push({
        kind: 'region', role: region.label, name: region.name, states: [], parent, depth,
        covers: region.label === 'dialog' ? coversPage(el, r) : undefined,
        inViewport: inView(r), covered: false,
      });
      childParent = nodes.length - 1;
      childDepth = depth + 1;
    } else if (shown) {
      const t = deepText(el, 81);
      if (t && t.length <= 80 && !el.shadowRoot && !el.querySelector(LEAF_BLOCKER)) {
        nodes.push({ kind: 'text', role: 'text', name: t, states: [], parent, depth, inViewport: inView(r), covered: false });
        return;
      }
    }

    for (const c of childrenOf(el)) {
      if (c.nodeType === 3) {
        const t = collapse(c.nodeValue ?? '');
        if (shown && t.length <= 80 && /[\p{L}\p{N}]/u.test(t)) {
          nodes.push({ kind: 'text', role: 'text', name: t, states: [], parent: childParent, depth: childDepth, inViewport: inView(r), covered: false });
        }
      } else if (c.nodeType === 1) {
        visit(c as Element, childParent, childDepth, r);
      }
    }
  }

  const rootEl = document.body ?? document.documentElement;
  visit(rootEl, -1, 0, rootEl.getBoundingClientRect());

  // Plain text is only worth its tokens next to a control (labels, hints, errors).
  const keep = nodes.map(() => true);
  nodes.forEach((n, i) => {
    if (n.kind !== 'text') return;
    const adjacent = (m: RawNode | undefined): boolean => !!m && m.kind === 'interactive' && m.parent === n.parent;
    keep[i] = adjacent(nodes[i - 1]) || adjacent(nodes[i + 1]);
  });
  // Drop regions left with no content, then compact indices.
  const filled = nodes.map(() => false);
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (nodes[i].kind === 'region' && !filled[i]) keep[i] = false;
    if (keep[i] && nodes[i].parent >= 0) filled[nodes[i].parent] = true;
  }
  const remap: number[] = [];
  const out: RawNode[] = [];
  nodes.forEach((n, i) => {
    if (!keep[i]) { remap[i] = -1; return; }
    remap[i] = out.length;
    out.push({ ...n, parent: n.parent >= 0 ? remap[n.parent] : -1 });
  });

  return { url: location.href, title: document.title, nodes: out, truncated };
}
