import { chromium } from 'playwright';
import type { Browser, BrowserContext, ElementHandle, Page } from 'playwright';
import { capture, resolve } from './capture/index.js';
import type { RawNode, Snapshot } from './capture/index.js';
import { findInSnapshot, translate } from './translate.js';
import type { ReadOptions } from './translate.js';
import { SiteMemory, originOf } from './memory.js';
import { NO_CHANGE, diffSnapshots, headerLines } from './diff.js';
import { listMedia, describeElement, formatData } from './fallback/media.js';
import type { Target } from './fallback/media.js';
import { detectCaptcha } from './fallback/captcha.js';
import { recognize, closeOcr } from './fallback/ocr.js';
import { downscale, pngSize } from './fallback/look.js';
import { chromiumExecutable, userAgentFor } from './userAgent.js';
import { parseUntil, describeUntil, waitForHuman, DEFAULT_TIMEOUT_SECONDS } from './fallback/askHuman.js';

/** Transpiler helper shim for pages (see launch()). */
const NAME_SHIM = "Object.defineProperty(globalThis, '__name', { value: (f) => f, configurable: true });";

export interface MantisOptions {
  /** Run Chromium without a window. Default true; MANTIS_HEADLESS=0 shows it. */
  headless?: boolean;
  /** How long a click/type/select waits for the element to become actionable. */
  actionTimeoutMs?: number;
  /** Site memory (collapse regions already seen on this site). Default on; MANTIS_MEMORY=0 turns it off. */
  memory?: boolean;
  /** Where site memory is stored between sessions. Default MANTIS_MEMORY_DIR or ~/.cache/mantis/sites. */
  memoryDir?: string;
}

/** A failure the agent should see as a plain message. */
class ActionError extends Error {}

/**
 * Runs in every page before its own scripts. Tags the document (so a navigation is told apart from
 * a re-render) and counts short pending timers and in-flight fetch/XHR, so settle() can wait for
 * work an action kicked off, such as content that appears 500ms after a click.
 */
const TRACKER = `(() => {
  if (window.__mantisDoc) return;
  window.__mantisDoc = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const st = window.setTimeout, ct = window.clearTimeout;
  // Every pending short timer and request remembers its "origin": when the work that caused it began.
  // Work started inside a tracked timer callback inherits that timer's origin, so a polling chain
  // (a timer re-arming itself) keeps its first origin forever and is told apart from what an action
  // started. settle() only waits for work whose origin is at or after the action.
  let currentOrigin = null;
  const live = new Map(); // timer id -> origin
  const reqs = new Set(); // one entry {origin} per in-flight request
  const originNow = () => (currentOrigin !== null ? currentOrigin : performance.now());
  window.__mantisSetTimeout = st.bind(window);
  window.setTimeout = function (fn, ms, ...rest) {
    if (typeof fn !== 'function') return st.call(this, fn, ms, ...rest);
    const origin = originNow();
    const short = Number(ms || 0) <= 1000;
    let id;
    id = st.call(this, function () {
      live.delete(id);
      const prev = currentOrigin;
      currentOrigin = origin;
      try { return fn.apply(this, arguments); } finally { currentOrigin = prev; }
    }, ms, ...rest);
    if (short) live.set(id, origin);
    return id;
  };
  window.clearTimeout = function (id) { live.delete(id); return ct.call(this, id); };
  const f = window.fetch;
  if (f) window.fetch = function () {
    const req = { origin: originNow() };
    reqs.add(req);
    const done = () => { reqs.delete(req); };
    let p;
    try { p = f.apply(this, arguments); } catch (e) { done(); throw e; }
    p.then(done, done);
    return p;
  };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    const req = { origin: originNow() };
    reqs.add(req);
    const done = () => { reqs.delete(req); };
    this.addEventListener('loadend', done);
    try { return send.apply(this, arguments); } catch (e) { done(); throw e; }
  };
  // Is a short timer or request that began at or after \`since\` (performance.now()) still pending? No argument: any.
  window.__mantisBusy = (since) => {
    const from = since === undefined ? -Infinity : since;
    for (const origin of live.values()) if (origin >= from) return true;
    for (const req of reqs) if (req.origin >= from) return true;
    return false;
  };
  // Elements given a click-type listener in script: clickable even without a role, link or tabindex.
  const clicky = new WeakSet();
  window.__mantisClick = clicky;
  const CLICK_EVENTS = new Set(['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart']);
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (CLICK_EVENTS.has(type) && this instanceof Element) clicky.add(this);
    return add.call(this, type, fn, opts);
  };
  const onclick = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onclick');
  if (onclick && onclick.set) {
    Object.defineProperty(HTMLElement.prototype, 'onclick', {
      ...onclick,
      set(fn) { if (fn) clicky.add(this); return onclick.set.call(this, fn); },
    });
  }
  // Bumped by anything that can change what a scan sees, so an unchanged page can reuse its last scan.
  window.__mantisMut = 0;
  const bump = () => { window.__mantisMut++; };
  new MutationObserver(bump).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  for (const ev of ['scroll', 'input', 'change', 'focusin', 'focusout', 'resize', 'load', 'mouseover', 'mouseout', 'toggle', 'transitionend', 'animationend']) {
    addEventListener(ev, bump, { capture: true, passive: true });
  }
})();`;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** First meaningful line of a Playwright error, without the call log. */
function brief(e: unknown): string {
  const first = String(e instanceof Error ? e.message : e).split('\n')[0] ?? '';
  return first.replace(/^[\w.]+: /, '').trim().slice(0, 200) || 'unknown error';
}

/** The final actionability state reported by Playwright for a failed click. */
export type ClickFailure = 'not-visible' | 'outside-viewport' | 'intercepted';

/**
 * Read Playwright's final actionability state rather than its retry log preamble.
 * "waiting for element to be visible" is emitted for every click attempt, including
 * ones that did become visible and later timed out waiting for navigation.
 */
export function classifyClickError(e: unknown): ClickFailure | null {
  const message = String(e instanceof Error ? e.message : e);
  const states: Array<{ at: number; failure: ClickFailure | null }> = [];
  const add = (pattern: RegExp, failure: ClickFailure | null): void => {
    for (const match of message.matchAll(pattern)) states.push({ at: match.index ?? -1, failure });
  };
  add(/element is not visible/gi, 'not-visible');
  add(/(?:element is )?outside of the viewport/gi, 'outside-viewport');
  add(/intercepts pointer events/gi, 'intercepted');
  // These are successful later states, not failures. Keep them in the sequence so
  // a retry-log preamble cannot outweigh a click that reached navigation waiting.
  add(/element is visible, enabled and stable/gi, null);
  add(/waiting for scheduled navigations/gi, null);
  states.sort((a, b) => a.at - b.at);
  return states.at(-1)?.failure ?? null;
}

/** How long Playwright keeps retrying a click on an element something else is covering. */
const COVERED_CLICK_TIMEOUT = 600;

/** Navigation gets its own budget after a click has dispatched. */
const NAVIGATION_TIMEOUT = 5000;
/** A main-frame request starts immediately for ordinary document navigations. */
const NAVIGATION_START_TIMEOUT = 250;
/** A brief, bounded chance for a non-interactive painted veil to finish clearing. */
const VEIL_CLEAR_TIMEOUT = 1500;
const VEIL_RECHECK_MS = 100;

/**
 * Page-side predicate for a visually hidden labelable control and its rendered label.
 * This is deliberately self-contained because Playwright serializes evaluate callbacks.
 */
function renderedLabelForHiddenControl(target: Element): HTMLLabelElement | null {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement)) return null;
  const rect = target.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const parent = (node: Element): Element | null =>
    node.parentElement ?? (node.getRootNode() instanceof ShadowRoot ? (node.getRootNode() as ShadowRoot).host : null);
  const effectiveOpacity = (element: Element): number => {
    let opacity = 1;
    for (let node: Element | null = element; node; node = parent(node)) {
      const value = parseFloat(getComputedStyle(node).opacity);
      if (!Number.isNaN(value)) opacity *= value;
    }
    return opacity;
  };
  const style = getComputedStyle(target);
  const clip = style.clip.replace(/\s+/g, '').toLowerCase();
  const path = style.clipPath.replace(/\s+/g, '').toLowerCase();
  const alwaysHidden = rect.width <= 4 || rect.height <= 4 ||
    /^rect\((?:0(?:px)?,){3}0(?:px)?\)$/.test(clip) || path === 'inset(50%)' || path === 'inset(100%)';
  const transparent = effectiveOpacity(target) < 0.01;
  if ((!alwaysHidden && !transparent) || !target.labels) return null;
  if (!alwaysHidden) {
    const left = Math.max(rect.left, 0);
    const right = Math.min(rect.right, innerWidth);
    const top = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, innerHeight);
    // Preserve the hidden-control path when there is no visible centre to test.
    if (left < right && top < bottom) {
      const root = target.getRootNode();
      const scope: Document | ShadowRoot = root instanceof ShadowRoot ? root : document;
      const hit = scope.elementFromPoint((left + right) / 2, (top + bottom) / 2);
      if (hit === target || !!hit && target.contains(hit)) return null;
    }
  }
  for (const label of Array.from(target.labels)) {
    const labelStyle = getComputedStyle(label);
    const labelRect = label.getBoundingClientRect();
    if (labelStyle.display !== 'none' && labelStyle.visibility === 'visible' &&
        effectiveOpacity(label) > 0 && labelRect.width >= 4 && labelRect.height >= 4) return label;
  }
  return null;
}

/** The unrelated element on top of a click target (see coveredBy). */
interface Cover {
  desc: string;
  hitId?: number;
  close?: { id: number; name: string };
  controls: { id: number; name: string }[];
  /** A dialog, or a layer that offers a numbered control the agent can use. */
  interactive: boolean;
  /** A nearby loading signal makes the short recheck especially likely to help. */
  busy: boolean;
  /** Nothing visible in the overlay (no text, background, border, shadow or content): a real pointer is blocked but a user would not see why. */
  invisible: boolean;
}

/**
 * One Chromium, one active page. Actions return short text; read() returns the
 * numbered view of the page.
 */
export class MantisBrowser {
  /** Last scan and the page state it was taken at (see observe / unchanged). */
  private last: { page: Page; doc: string; mut: number; snap: Snapshot } | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private labels = new Map<number, string>();
  /** Role and name each number had when last read; kept across reads so an id that went stale can be matched by what it was. */
  private known = new Map<number, { role: string; name: string }>();
  private notes: string[] = [];
  private scratch: BrowserContext | null = null;
  private readonly actionTimeout: number;
  private readonly memory: SiteMemory;

  constructor(private readonly opts: MantisOptions = {}) {
    this.actionTimeout = opts.actionTimeoutMs ?? 5000;
    this.memory = new SiteMemory({ enabled: opts.memory, dir: opts.memoryDir });
  }

  async launch(): Promise<void> {
    if (this.browser) return;
    const headless = this.opts.headless ?? process.env.MANTIS_HEADLESS !== '0';
    this.browser = await chromium.launch({ headless, ...chromiumExecutable() });
    // Headless Chromium announces itself as "HeadlessChrome", which some sites answer with a degraded page.
    const userAgent = headless || process.env.MANTIS_USER_AGENT ? await userAgentFor(this.browser) : undefined;
    this.context = await this.browser.newContext({ viewport: { width: 1280, height: 800 }, ...(userAgent ? { userAgent } : {}) });
    // Transpilers (tsx, vitest) wrap named functions in a __name() helper that does not
    // exist in the page; define it (as a string, so it is not itself wrapped).
    await this.context.addInitScript("Object.defineProperty(globalThis, '__name', { value: (f) => f, configurable: true });");
    await this.context.addInitScript(TRACKER);
    this.context.on('page', (p) => this.adopt(p));
    this.adopt(await this.context.newPage());
  }

  async close(): Promise<void> {
    const b = this.browser;
    this.browser = this.context = this.page = this.scratch = null;
    await closeOcr();
    await b?.close().catch(() => undefined);
  }

  /** Raw structured snapshot of the active page (library use). */
  async snapshot(): Promise<Snapshot> {
    return capture(await this.activePage());
  }

  async open(url: string): Promise<string> {
    return this.guard(async () => {
      const page = await this.activePage();
      const target = /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`;
      for (let attempt = 0; ; attempt++) {
        try {
          await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30_000 });
          break;
        } catch (e) {
          // Chromium commits the error page of an earlier failed load late, which can
          // interrupt this navigation. Let things quiet down; if we ended up where we
          // wanted to be, that is success, otherwise retry.
          if (attempt < 2 && /interrupted by another navigation/.test(String(e))) {
            await sleep(300);
            await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => undefined);
            if (page.url() === new URL(target).href) break;
            continue;
          }
          if (/net::/.test(String(e))) await page.waitForURL(/^chrome-error:/, { timeout: 3000 }).catch(() => undefined);
          throw new ActionError(`could not open ${target}: ${brief(e)}`);
        }
      }
      await this.settle(page);
      const initial = await this.observe(page);
      const controls = initial.snap.nodes.filter((n) => n.kind === 'interactive');
      const disabled = controls.filter((n) => n.states.includes('disabled') || n.states.includes('looks disabled'));
      const blocked = controls.filter((n) => n.covered || disabled.includes(n));
      const dialogAlreadyShown = initial.snap.nodes.some((n) => n.kind === 'region' && n.role === 'dialog' && n.inViewport);
      // A majority of controls being blocked is a meaningful late-dialog signal. A single
      // covered control can also signal a backdrop, even before the dialog is represented.
      // Several truly disabled controls on first load usually mean the page is still hydrating.
      const hydrating = this.hasDisabledControls(initial.snap);
      const gated = !dialogAlreadyShown && (hydrating || blocked.some((n) => n.covered) || (blocked.length >= 2 && blocked.length * 2 >= controls.length));
      let snap = initial.snap;
      if (gated && await this.waitForLateDialog(page, disabled.map((n) => n.id!).filter((id) => id !== undefined))) {
        snap = (await this.observe(page)).snap;
      }
      let text = this.render(snap);
      const captcha = await detectCaptcha(page);
      if (captcha) text += `\n${captcha}`;
      if (hydrating && this.hasDisabledControls(snap)) text += `\n${this.hydrationNote()}`;
      return this.notes.length ? `${text}\n${this.notes.splice(0).join('\n')}` : text;
    });
  }

  /**
   * The numbered view of the page. `region` narrows to one region; `full` turns trimming off;
   * `fresh` shows regions in full that site memory would otherwise summarise (as `full` and `region` also do).
   */
  async read(opts: ReadOptions = {}): Promise<string> {
    return this.guard(async () => this.view(await this.activePage(), opts));
  }

  /** Search the whole page, including parts read() trimmed or summarised, for controls and text. */
  async find(query: string): Promise<string> {
    return this.guard(async () => {
      const { snap } = await this.observe(await this.activePage());
      this.remember(snap);
      return findInSnapshot(snap, query);
    });
  }

  /** Clear what site memory holds about the current site (this session and on disk). */
  async forget(): Promise<string> {
    return this.guard(async () => {
      const page = await this.activePage();
      const origin = originOf(page.url());
      if (!this.memory.enabled) return 'site memory is off (MANTIS_MEMORY=0); nothing to forget';
      if (!origin) return 'no site is open; nothing to forget';
      this.memory.forget(origin);
      return `forgot everything remembered about ${origin === 'file://' ? 'local files' : origin}; the next read shows every region in full`;
    });
  }

  async click(id: number): Promise<string> {
    return this.act(async (page) => {
      const { el, label } = await this.target(page, id);
      const inactive = await this.inactiveController(el);
      if (inactive) {
        await el.dispose();
        throw new ActionError(this.inactiveMessage(label, inactive));
      }
      const associatedLabel = await this.renderedAssociatedLabel(el);
      let cover = await this.coveredBy(el, associatedLabel);
      let navigation: ReturnType<MantisBrowser['watchNavigation']> | null = null;
      let dispatched = false;
      try {
        // A painted layer with no dialog or controls is often a loading veil. Re-hit-test it for a
        // short, fixed interval instead of spending the normal click timeout on something nobody can dismiss.
        if (cover && !cover.interactive && !cover.invisible) {
          cover = await this.waitForVeilToClear(el, associatedLabel, cover);
          // An empty layer still intercepts a real pointer, but has nothing an agent could dismiss.
          // Let the normal click path reach its existing click-through fallback.
          if (cover && !cover.invisible) throw new ActionError(this.coveredMessage(label, cover, await this.linkHref(el)));
        }
        const clickTarget = associatedLabel && !cover ? associatedLabel : el;
        const clickTimeout = cover ? COVERED_CLICK_TIMEOUT : this.actionTimeout;
        navigation = this.watchNavigation(page);
        // The watcher is installed first so a navigation from this dispatch is not missed.
        // Its detection and completion budgets begin only after Playwright has dispatched.
        await clickTarget.click({ timeout: clickTimeout, noWaitAfter: true });
        dispatched = true;
      } catch (e) {
        if (e instanceof ActionError) throw e;
        const msg = String(e instanceof Error ? e.message : e);
        // ElementHandle's noWaitAfter is deprecated in recent Playwright releases and may still
        // surface its timeout after the click has already dispatched. Playwright's own navigation
        // wait is the proof the action fired; an unrelated main-frame navigation is not.
        if (/waiting for scheduled navigations to finish/i.test(msg)) {
          dispatched = true;
        } else if (!(dispatched = await this.clickFallback(page, el, id, msg, associatedLabel))) {
          const blocked = cover && /intercepts pointer events|Timeout/.test(msg) ? cover : null;
          // An empty transparent layer is nothing the agent could dismiss: click the element itself.
          if (blocked?.invisible) {
            await el.evaluate((n) => n instanceof HTMLElement ? n.click() : n.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
            dispatched = true;
          } else {
            navigation?.cancel();
            throw new ActionError(blocked ? this.coveredMessage(label, blocked) : this.explain(e, label));
          }
        }
      } finally {
        await associatedLabel?.dispose().catch(() => undefined);
        await el.dispose();
      }
      if (dispatched && navigation) await this.waitForTriggeredNavigation(navigation);
      else navigation?.cancel();
      return `clicked ${label}`;
    });
  }

  async type(id: number, text: string, submit = false): Promise<string> {
    return this.act(async (page) => {
      const { el, label } = await this.target(page, id);
      try {
        await el.fill(text, { timeout: this.actionTimeout });
        if (submit) await el.press('Enter', { timeout: this.actionTimeout });
      } catch (e) {
        throw new ActionError(this.explain(e, label));
      } finally {
        await el.dispose();
      }
      const shown = label.includes('(password)') ? '•••' : `"${text.length > 40 ? text.slice(0, 39) + '…' : text}"`;
      return `typed ${shown} into ${label.replace(' (password)', '')}${submit ? ' and pressed Enter' : ''}`;
    });
  }

  async select(id: number, option: string): Promise<string> {
    return this.act(async (page) => {
      const { el, label } = await this.target(page, id);
      try {
        const picked = await this.chooseOption(el, label, option);
        return `selected "${picked}" in ${label}`;
      } catch (e) {
        throw e instanceof ActionError ? e : new ActionError(this.explain(e, label));
      } finally {
        await el.dispose();
      }
    });
  }

  /** Match `option` against a <select>'s options (value, exact label, case-insensitive label, substring) and choose it. */
  private async chooseOption(el: ElementHandle<Element>, label: string, option: string): Promise<string> {
    const found = await el.evaluate((node, want) => {
      if (!(node instanceof HTMLSelectElement)) return { notSelect: true as const };
      const opts = Array.from(node.options).map((o, index) => ({
        index, value: o.value, label: (o.label || o.text).replace(/\s+/g, ' ').trim(),
      }));
      const w = want.toLowerCase();
      const hit =
        opts.find((o) => o.value === want) ??
        opts.find((o) => o.label === want) ??
        opts.find((o) => o.label.toLowerCase() === w) ??
        opts.find((o) => o.label.toLowerCase().includes(w));
      return { index: hit ? hit.index : -1, labels: opts.map((o) => o.label), picked: hit?.label };
    }, option);
    if ('notSelect' in found) {
      throw new ActionError(`${label} is not a <select>; click it, then click the option you want`);
    }
    if (found.index < 0) {
      throw new ActionError(`no option "${option}" in ${label}; options: ${found.labels.slice(0, 15).join(' | ')}`);
    }
    await el.selectOption({ index: found.index }, { timeout: this.actionTimeout });
    return found.picked ?? option;
  }

  /** Fill several fields in one call: text, dropdown option, or true/false for checkboxes and radios. */
  async fill(fields: { id: number; value: string | boolean }[]): Promise<string> {
    return this.act(async (page) => {
      if (!fields.length) throw new ActionError('no fields given');
      const done: number[] = [];
      const parts: string[] = [];
      for (const { id, value } of fields) {
        let el: ElementHandle<Element> | undefined;
        let name = '';
        try {
          const t = await this.target(page, id);
          el = t.el;
          const secret = t.label.includes('(password)');
          name = t.label.replace(' (password)', '').replace(/^#\d+ /, '');
          const kind = await el.evaluate((n) =>
            n instanceof HTMLSelectElement
              ? 'select'
              : n instanceof HTMLInputElement && (n.type === 'checkbox' || n.type === 'radio')
                ? 'check'
                : 'text',
          );
          if (kind === 'select') {
            parts.push(`selected "${await this.chooseOption(el, name, String(value))}" in ${name}`);
          } else if (kind === 'check') {
            const on = /^(true|on|yes)$/i.test(String(value));
            if (!on && !/^(false|off|no)$/i.test(String(value))) {
              throw new ActionError(`${name} is a checkbox; use true or false, not "${value}"`);
            }
            await this.setChecked(page, el, id, on, name);
            parts.push(`${on ? 'checked' : 'unchecked'} ${name}`);
          } else {
            const text = String(value);
            await el.fill(text, { timeout: this.actionTimeout });
            const shown = secret ? '•••' : `"${text.length > 40 ? text.slice(0, 39) + '…' : text}"`;
            parts.push(`${shown} into ${name}`);
          }
          done.push(id);
        } catch (e) {
          const why = e instanceof ActionError ? e.message : this.explain(e, name || `#${id}`);
          const so = done.length ? `filled ${done.map((d) => `#${d}`).join(', ')}` : 'nothing filled';
          throw new ActionError(`${so}; #${id}: ${why}`);
        } finally {
          await el?.dispose();
        }
      }
      return `filled ${parts.length} field${parts.length === 1 ? '' : 's'}: ${parts.join('; ')}`;
    });
  }

  async press(key: string): Promise<string> {
    return this.act(async (page) => {
      try {
        await page.keyboard.press(key);
      } catch (e) {
        throw new ActionError(`could not press "${key}": ${brief(e)}`);
      }
      return `pressed ${key}`;
    });
  }

  /**
   * Scroll the page up/down by most of a screen, or bring element `#id` into view.
   * With a direction and `inside` (an id), scroll the list/panel that contains `#inside` instead.
   */
  async scroll(target: 'up' | 'down' | number = 'down', inside?: number): Promise<string> {
    return this.act(async (page) => {
      if (typeof target === 'number') {
        const { el, label } = await this.target(page, target);
        try {
          await el.scrollIntoViewIfNeeded({ timeout: this.actionTimeout });
        } catch (e) {
          throw new ActionError(this.explain(e, label));
        } finally {
          await el.dispose();
        }
        return `scrolled ${label} into view`;
      }
      if (inside === undefined) return this.scrollPage(page, target);
      const { el } = await this.target(page, inside);
      let r;
      try {
        r = await el.evaluate((node, dir) => {
          const parent = (n: Element): Element | null => n.parentElement ?? (n.getRootNode() instanceof ShadowRoot ? (n.getRootNode() as ShadowRoot).host : null);
          let box: Element | null = null;
          for (let n: Element | null = node; n && n !== document.body && n !== document.documentElement; n = parent(n)) {
            if (n.scrollHeight > n.clientHeight + 4 && /auto|scroll|overlay/.test(getComputedStyle(n).overflowY)) { box = n; break; }
          }
          if (!box) return null;
          const before = box.scrollTop;
          box.scrollBy({ top: (dir === 'down' ? 1 : -1) * Math.round(box.clientHeight * 0.8), behavior: 'instant' as ScrollBehavior });
          const max = box.scrollHeight - box.clientHeight;
          const name = (box.getAttribute('aria-label') ?? '').replace(/\s+/g, ' ').trim();
          return { moved: box.scrollTop !== before, pct: max > 0 ? Math.round((box.scrollTop / max) * 100) : 100, name: name.length > 40 ? name.slice(0, 39) + '…' : name };
        }, target);
      } catch (e) {
        throw new ActionError(this.explain(e, `#${inside}`));
      } finally {
        await el.dispose();
      }
      if (!r) return `#${inside} is not inside a scrollable list; ${await this.scrollPage(page, target)}`;
      const where = r.name ? `"${r.name}"` : `the list containing #${inside}`;
      return r.moved
        ? `scrolled ${target} inside ${where}; now at ${r.pct}% of it`
        : `scroll ${target} inside ${where}: already at the ${target === 'down' ? 'bottom' : 'top'} of it`;
    }, { quiet: true });
  }

  /** Scroll the page, or its largest inner scroll container when the page itself cannot scroll. */
  private async scrollPage(page: Page, target: 'up' | 'down'): Promise<string> {
    const r = await page.evaluate((dir) => {
      const dy = (dir === 'down' ? 1 : -1) * Math.round(window.innerHeight * 0.8);
      let scroller: Element = document.scrollingElement ?? document.documentElement;
      const before = scroller.scrollTop;
      window.scrollBy(0, dy);
      if (scroller.scrollTop === before) {
        // The page itself does not scroll; look for the largest inner scroll container.
        let best = 0;
        for (const e of Array.from(document.querySelectorAll('*'))) {
          const area = e.clientWidth * e.clientHeight;
          if (area > best && e.scrollHeight > e.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(e).overflowY)) {
            best = area;
            scroller = e;
          }
        }
        if (scroller !== (document.scrollingElement ?? document.documentElement)) scroller.scrollBy(0, dy);
      }
      const max = scroller.scrollHeight - scroller.clientHeight;
      return { moved: scroller.scrollTop !== before || scroller !== (document.scrollingElement ?? document.documentElement), pct: max > 0 ? Math.round((scroller.scrollTop / max) * 100) : 100, max };
    }, target);
    if (r.max <= 0) return `scroll ${target}: nothing to scroll (page fits on screen)`;
    return r.moved ? `scrolled ${target}; now at ${r.pct}% of page` : `scroll ${target}: already at the ${target === 'down' ? 'bottom' : 'top'}`;
  }

  async back(): Promise<string> {
    return this.act(async (page) => {
      const from = page.url();
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => null);
      return page.url() !== from ? 'went back' : 'cannot go back: no earlier page';
    }, { quiet: true });
  }

  // ---- fallback ladder: data -> ocr -> look -> ask_human -------------------

  /** Visible images, canvases and chart-like SVGs, each with a number usable by data/ocr/look. */
  async media(): Promise<string> {
    return this.guard(async () => listMedia(await this.activePage()));
  }

  /** Hidden text behind a visual element: alt/caption/filename, SVG text, in-memory chart data. */
  async data(target: Target): Promise<string> {
    return this.guard(async () => {
      const page = await this.activePage();
      let resolved: { el: ElementHandle<Element>; label: string };
      try {
        resolved = await this.visualTarget(page, target);
      } catch (e) {
        if (!(e instanceof ActionError)) throw e;
        const media = await listMedia(page).catch(() => '');
        const canvas = media.match(/^#(\d+) canvas\b/m);
        const hint = canvas ? `; a canvas is available — try data({id: ${canvas[1]}})` : '';
        throw new ActionError(`${e.message}${hint}`);
      }
      const { el, label } = resolved;
      try {
        return formatData(label, await describeElement(el));
      } finally {
        await el.dispose();
      }
    });
  }

  /** Text inside an image/canvas via OCR (tesseract.js). Never returns the image. */
  async ocr(target: Target): Promise<string> {
    return this.guard(async () => {
      const page = await this.activePage();
      const { el, label } = await this.visualTarget(page, target);
      try {
        const png = await this.shot(el, label);
        const { text, confidence } = await recognize(png).catch((e: unknown) => {
          throw new ActionError(e instanceof Error ? e.message : String(e));
        });
        if (!text) return `ocr ${label}: no text recognised (confidence ${confidence}%). Try look(id) as a last resort.`;
        const body = text.length > 1500 ? text.slice(0, 1499).trimEnd() + '…' : text;
        const warn = confidence < 60 ? ' - low confidence, text may be wrong; consider look(id)' : '';
        return `ocr ${label} (confidence ${confidence}%${warn}):\n${body}`;
      } finally {
        await el.dispose();
      }
    });
  }

  /** The one tool that returns an image: a PNG of a single element, at most 800px on its longest side. */
  async look(target: Target): Promise<{ png: Buffer; text: string } | { error: string }> {
    try {
      const page = await this.activePage();
      const { el, label } = await this.visualTarget(page, target);
      try {
        const raw = await this.shot(el, label);
        const png = await downscale(raw, () => this.scratchPage());
        const { width, height } = pngSize(png);
        return { png, text: `look ${label}: ${width}×${height} PNG` };
      } finally {
        await el.dispose();
      }
    } catch (e) {
      return { error: `error: ${e instanceof ActionError ? e.message : brief(e)}` };
    }
  }

  /**
   * Hand control to a human (CAPTCHA, 2FA, payment, login). Mantis never solves CAPTCHAs.
   * Headless: opens a headed window with the same cookies/storage and URL, waits, then carries
   * the state back and reloads. Headed (or MANTIS_ASK_HUMAN_HEADLESS=1, tests only): waits on the same page.
   */
  async askHuman(reason: string, until?: string, timeoutSeconds = DEFAULT_TIMEOUT_SECONDS): Promise<string> {
    return this.guard(async () => {
      let cond;
      try {
        cond = parseUntil(until);
      } catch (e) {
        throw new ActionError((e as Error).message);
      }
      const page = await this.activePage();
      if (cond.kind === 'selector_gone' || cond.kind === 'selector_present') {
        const sel = cond.selector;
        await page.evaluate((s) => void document.querySelector(s), sel).catch(() => {
          throw new ActionError(`invalid CSS selector "${sel}"`);
        });
      }
      const timeoutMs = Math.max(0.1, timeoutSeconds) * 1000;
      const what = describeUntil(cond);
      const secs = `${Math.round(timeoutSeconds * 10) / 10}s`;
      console.error(`[mantis] human needed: ${reason} (waiting for ${what}, up to ${secs})`);

      if (!this.isHeadless() || process.env.MANTIS_ASK_HUMAN_HEADLESS === '1') {
        const ok = await waitForHuman(page, cond, { timeoutMs });
        if (!ok) return `error: timed out after ${secs} waiting for ${what} (${reason}); the page is unchanged, call read() to see it`;
        const now = this.page ?? page;
        await this.settle(now);
        return `human step done (${reason})\n${await this.view(now)}`;
      }

      // Headless: let the human work in a visible window that carries over this session.
      const state = await this.context!.storageState();
      const url = page.url();
      let headed: Browser;
      try {
        headed = await chromium.launch({ headless: false, ...chromiumExecutable() });
      } catch (e) {
        throw new ActionError(
          `cannot open a visible browser window for the human (${brief(e)}). ` +
            'Run Mantis with MANTIS_HEADLESS=0 on a machine with a display, or complete this step yourself.',
        );
      }
      try {
        const ctx = await headed.newContext({ viewport: null, storageState: state });
        await ctx.addInitScript(NAME_SHIM);
        const hp = await ctx.newPage();
        if (url && !url.startsWith('chrome-error:') && url !== 'about:blank') {
          await hp.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
        }
        const ok = await waitForHuman(hp, cond, { timeoutMs });
        if (!ok) return `error: timed out after ${secs} waiting for ${what} (${reason}); nothing was changed, call read() to see the page`;
        const finalUrl = hp.url();
        const newState = await ctx.storageState();
        await headed.close().catch(() => undefined);
        await this.swapContext(newState);
        const fresh = await this.activePage();
        if (finalUrl && finalUrl !== 'about:blank') {
          await fresh.goto(finalUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => undefined);
        }
        await this.settle(fresh);
        return `human step done (${reason}); session carried over\n${await this.view(fresh)}`;
      } finally {
        await headed.close().catch(() => undefined);
      }
    });
  }

  // ---- internals ---------------------------------------------------------

  private adopt(p: Page): void {
    this.page = p;
    p.on('dialog', (d) => {
      const accept = d.type() === 'alert' || d.type() === 'beforeunload';
      this.notes.push(`dialog: ${d.type()} "${d.message().slice(0, 120)}" (${accept ? 'accepted' : 'dismissed'})`);
      void (accept ? d.accept() : d.dismiss()).catch(() => undefined);
    });
    p.on('close', () => {
      if (this.page === p) this.page = this.context?.pages().at(-1) ?? null;
    });
  }

  private async activePage(): Promise<Page> {
    await this.launch();
    if (!this.page) this.adopt(await this.context!.newPage());
    return this.page!;
  }

  private async guard(fn: () => Promise<string>): Promise<string> {
    try {
      return await fn();
    } catch (e) {
      return `error: ${e instanceof ActionError ? e.message : brief(e)}`;
    }
  }

  /**
   * Run an action, wait for the page to settle, and report what changed: a diff
   * when the same document is still showing, the full view after a navigation.
   */
  private act(fn: (page: Page) => Promise<string>, opts: { quiet?: boolean } = {}): Promise<string> {
    return this.guard(async () => {
      const page = await this.activePage();
      const before = (await this.unchanged(page)) ?? (await this.observe(page).catch(() => null));
      if (before) this.remember(before.snap);
      // Stamp the action's start in-page so settle() ignores timers/requests that were already running.
      await page.evaluate(() => { (window as unknown as { __mantisEpoch?: number }).__mantisEpoch = performance.now(); }).catch(() => undefined);
      const msg = await fn(page);
      await this.settle(page, true);
      const lines = [msg];
      const now = this.page ?? page;
      if (now !== page) {
        await this.settle(now);
        lines.push('opened in a new tab (now active)');
      }
      const after = await this.observe(now).catch(() => null);
      if (before && after && now === page && before.doc !== null && before.doc === after.doc) {
        this.remember(after.snap);
        const d = diffSnapshots(before.snap, after.snap);
        if (!(opts.quiet && d === NO_CHANGE)) lines.push(d);
      } else {
        // A different document (ids restart, a diff would mislead): say where we are, show it whole.
        if (before && after) lines.push(...headerLines(before.snap, after.snap));
        if ((after?.snap.url ?? now.url()).startsWith('chrome-error:')) lines.push('the page failed to load');
        else if (after) {
          lines.push(this.render(after.snap));
          if (this.hasDisabledControls(after.snap)) lines.push(this.hydrationNote());
        }
      }
      lines.push(...this.notes.splice(0));
      return lines.join('\n');
    });
  }

  /** Scan the page; remembered so the next action can skip its "before" scan if nothing changed. */
  private async observe(page: Page): Promise<{ snap: Snapshot; doc: string | null }> {
    const before = await this.pageState(page); // read first: a change during the scan must not be missed
    const snap = await capture(page);
    // Changes inside an iframe don't move the page's counter, so pages with frames are always rescanned.
    const reusable = before.doc && before.mut >= 0 && !snap.nodes.some((n) => n.frame !== undefined);
    this.last = reusable ? { page, doc: before.doc!, mut: before.mut, snap } : null;
    return { snap, doc: before.doc };
  }

  /** The last scan, if this page has not changed since (DOM, scroll, input, focus, size, hover). */
  private async unchanged(page: Page): Promise<{ snap: Snapshot; doc: string | null } | null> {
    const l = this.last;
    if (!l || l.page !== page) return null;
    const now = await this.pageState(page);
    return now.doc === l.doc && now.mut === l.mut ? { snap: l.snap, doc: l.doc } : null;
  }

  private async pageState(page: Page): Promise<{ doc: string | null; mut: number }> {
    return page
      .evaluate(() => {
        const w = window as unknown as { __mantisDoc?: string; __mantisMut?: number };
        return { doc: w.__mantisDoc ?? null, mut: w.__mantisMut ?? -1 };
      })
      .catch(() => ({ doc: null, mut: -1 }));
  }

  private async view(page: Page, opts: ReadOptions = {}): Promise<string> {
    let text = this.render((await this.observe(page)).snap, opts);
    const captcha = await detectCaptcha(page);
    if (captcha) text += `\n${captcha}`;
    return this.notes.length ? `${text}\n${this.notes.splice(0).join('\n')}` : text;
  }

  private render(snap: Snapshot, opts: ReadOptions = {}): string {
    this.remember(snap);
    return translate(snap, undefined, opts, this.memory.hook(originOf(snap.url)));
  }

  private hasDisabledControls(snap: Snapshot): boolean {
    return snap.nodes.filter((n) => n.kind === 'interactive' && n.states.includes('disabled')).length >= 3;
  }

  private hydrationNote(): string {
    return `Some controls are still disabled; the page may be loading. Actions wait up to ${this.actionTimeout / 1000}s for them to enable.`;
  }

  /** Remember how each number was last described, for action messages. */
  private remember(snap: Snapshot): void {
    this.labels.clear();
    for (const n of snap.nodes) {
      if (n.kind === 'interactive' && n.id !== undefined) {
        this.labels.set(n.id, this.labelOf(n));
        if (n.name) this.known.set(n.id, { role: n.role, name: n.name });
        else this.known.delete(n.id);
      }
    }
  }

  private labelOf(n: RawNode): string {
    const name = n.name ? ` ${n.inferred ? '~' : ''}"${n.name.replace(/"/g, "'")}"` : '';
    return `#${n.id} ${n.role}${name}${n.secret ? ' (password)' : ''}`;
  }

  /** A number whose element a re-render replaced: follow it to the one control with the same role and name now. */
  private async rematch(page: Page, id: number): Promise<{ el: ElementHandle<Element>; label: string } | null> {
    const was = this.known.get(id);
    if (!was) return null;
    const same = (await capture(page)).nodes.filter((n) => n.kind === 'interactive' && n.id !== undefined && n.role === was.role && n.name === was.name);
    if (same.length !== 1) return null;
    const found = await resolve(page, same[0]!.id!);
    return found.ok ? { el: found.el, label: `${this.labelOf(same[0]!)} (was #${id}; the page re-rendered)` } : null;
  }

  private async target(page: Page, id: number): Promise<{ el: ElementHandle<Element>; label: string }> {
    const found = await resolve(page, id);
    if (!found.ok) {
      const again = found.reason === 'gone' ? await this.rematch(page, id) : null;
      if (again) return again;
      throw new ActionError(
        found.reason === 'unknown'
          ? `no element #${id} on this page; call read() to see current numbers`
          : `#${id} no longer exists (the page changed); call read() to refresh`,
      );
    }
    return { el: found.el, label: this.labels.get(id) ?? `#${id}` };
  }

  /** A target may still have a box while its disclosure is logically closed. */
  private async inactiveController(el: ElementHandle<Element>): Promise<{ id: number; name: string } | null> {
    return el.evaluate((target) => {
      const parent = (node: Element): Element | null => {
        const root = node.getRootNode();
        return node.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
      };
      const rootOf = (node: Element): Document | ShadowRoot => {
        const root = node.getRootNode();
        return root instanceof ShadowRoot ? root : document;
      };
      const registry = (window as unknown as { __mantis?: { ids: WeakMap<Element, number> } }).__mantis;
      const describe = (node: Element): { id: number; name: string } | null => {
        const id = registry?.ids.get(node);
        if (id === undefined || !node.getClientRects().length) return null;
        const name = (node.getAttribute('aria-label') || node.getAttribute('title') ||
          (node instanceof HTMLElement ? node.innerText : node.textContent) || node.localName)
          .replace(/\s+/g, ' ').trim().slice(0, 60);
        return { id, name: name || node.localName };
      };
      for (let node: Element | null = parent(target); node; node = parent(node)) {
        if (node instanceof HTMLDetailsElement && !node.open) {
          const summary = Array.from(node.children).find((child): child is HTMLElement => child instanceof HTMLElement && child.localName === 'summary');
          // The summary is the opener itself, never an inactive child of its own details.
          const found = summary && summary !== target ? describe(summary) : null;
          if (found) return found;
        }
      }
      const ids = new Set<string>();
      for (let node: Element | null = target; node; node = parent(node)) if (node.id) ids.add(node.id);
      if (!ids.size) return null;
      // ARIA disclosure relationships are document/shadow-root local. Do not infer a
      // controller from an unrelated expanded-looking ancestor or another component.
      for (const trigger of Array.from(rootOf(target).querySelectorAll('[aria-expanded="false"][aria-controls]'))) {
        if ((trigger.getAttribute('aria-controls') || '').split(/\s+/).some((id) => ids.has(id))) {
          const found = describe(trigger);
          if (found) return found;
        }
      }
      return null;
    }).catch(() => null);
  }

  /**
   * What sits on top of the element's center, if it is something unrelated to the element (an overlay).
   * Hit-tests through open shadow roots. A descendant, an ancestor and an associated label all
   * count as the element itself, as does anything when the center cannot be tested.
   */
  private async coveredBy(el: ElementHandle<Element>, label: ElementHandle<Element> | null = null): Promise<Cover | null> {
    return el.evaluate((target, associatedLabel) => {
      const r0 = target.getBoundingClientRect();
      if (!r0.width || !r0.height || getComputedStyle(target).pointerEvents === 'none') return null;
      const pointerTarget = associatedLabel ?? target;
      const off = (r: DOMRect): boolean => r.left + r.width / 2 < 0 || r.top + r.height / 2 < 0 || r.left + r.width / 2 >= innerWidth || r.top + r.height / 2 >= innerHeight;
      if (off(pointerTarget.getBoundingClientRect())) pointerTarget.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      const parent = (node: Element): Element | null => node.parentElement ?? (node.getRootNode() instanceof ShadowRoot ? (node.getRootNode() as ShadowRoot).host : null);
      // The unrelated element on top of the center right now, or null.
      const probe = (): Element | null => {
        const r = pointerTarget.getBoundingClientRect();
        if (off(r)) return null;
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const root = pointerTarget.getRootNode() as Document | ShadowRoot;
        let top: Element | null = (root instanceof ShadowRoot ? root : document).elementFromPoint(x, y);
        while (top?.shadowRoot) {
          const inner = top.shadowRoot.elementFromPoint(x, y);
          if (!inner || inner === top) break;
          top = inner;
        }
        if (!top || top === document.documentElement || top === document.body) return null;
        for (let n: Element | null = top; n; n = parent(n)) if (n === target) return null; // the element or inside it
        for (let n: Element | null = target; n; n = parent(n)) if (n === top) return null; // wraps the element
        if (pointerTarget !== target && pointerTarget.contains(top)) return null; // inside the associated label
        return top;
      };
      let hit = probe();
      if (!hit) return null;
      // A sticky/fixed bar over the center is not a blocker: Playwright scrolls past it. Centre the element and look again.
      const floats = (): boolean => {
        for (let n: Element | null = hit; n && n !== document.documentElement && !n.contains(pointerTarget); n = parent(n)) {
          const pos = getComputedStyle(n).position;
          if (pos === 'fixed' || pos === 'sticky') return true;
        }
        return false;
      };
      if (floats()) {
        pointerTarget.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
        hit = probe();
        if (!hit) return null;
      }
      const reg = (window as unknown as { __mantis?: { ids: WeakMap<Element, number> } }).__mantis;
      const idOfNode = (node: Element): number | undefined => reg?.ids.get(node);
      const text = (node: Element): string => {
        const renderedText = node instanceof HTMLElement ? node.innerText : node.textContent;
        return (node.getAttribute('aria-label') || renderedText || '').replace(/\s+/g, ' ').trim();
      };
      const describe = (node: Element): string => {
        const attrs: string[] = [];
        const cls = (node.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        if (cls) attrs.push(`.${cls}`);
        const role = node.getAttribute('role');
        if (role) attrs.push(` role=${role}`);
        const name = text(node);
        if (name) attrs.push(` "${name.length > 40 ? name.slice(0, 39) + '…' : name}"`);
        return `<${node.localName}${attrs.join('')}>`;
      };
      // A close/dismiss control in the same overlay, if it has a number from the last read.
      const CLOSE = /^(close|dismiss|cancel|no thanks|not now|decline|reject|[x×✕✖])$/i;
      let close: { id: number; name: string } | undefined;
      let hitId: number | undefined;
      // A label associated with the target is a legitimate pointer proxy, not a loading veil.
      let interactive = false;
      for (let n: Element | null = hit; n; n = parent(n)) {
        if (n instanceof HTMLLabelElement && n.control === target) { interactive = true; break; }
      }
      const controls: { id: number; name: string }[] = [];
      const seenControls = new Set<number>();
      let busy = !!hit.closest('[aria-busy="true"]') || !!document.querySelector('[role="progressbar"], progress');
      const focusable = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"]), [contenteditable="true"], [role="button"], [role="link"], [role="menuitem"]';
      const rendered = (node: Element): boolean => {
        if (!node.getClientRects().length) return false;
        for (let ancestor: Element | null = node; ancestor; ancestor = parent(ancestor)) {
          const style = getComputedStyle(ancestor);
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        }
        return true;
      };
      for (let n: Element | null = hit; n && n !== document.documentElement && !n.contains(pointerTarget); n = parent(n)) {
        hitId ??= idOfNode(n);
        if (n.matches('dialog, [role="dialog"], [role="alertdialog"], [aria-modal="true"]')) interactive = true;
        if (n.getAttribute('aria-busy') === 'true' || n.querySelector('[role="progressbar"], progress, [aria-busy="true"]')) busy = true;
        const scope: ParentNode = n.parentElement ? n : (n.getRootNode() as ParentNode); // top of a shadow tree: search the whole tree
        const candidates = n.matches(focusable)
          ? [n, ...Array.from(scope.querySelectorAll(focusable)).filter((b) => b !== n)]
          : Array.from(scope.querySelectorAll(focusable));
        for (const b of candidates) {
          if (b !== n && !n.contains(b)) continue;
          if (!rendered(b) || (b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true') continue;
          const name = (b.getAttribute('aria-label') || b.getAttribute('title') || b.textContent || '').replace(/\s+/g, ' ').trim();
          const id = idOfNode(b);
          if (id !== undefined && !seenControls.has(id)) { seenControls.add(id); controls.push({ id, name: name || b.localName }); }
          if (!close && id !== undefined && CLOSE.test(name)) close = { id, name };
        }
      }
       // Arbitrary links/buttons in page content do not make a layer dismissible. A semantic modal
       // or an explicitly named close control does; those are safe, actionable dismissal advice.
       if (close) interactive = true;
      // Visually empty: the hit element has no text, content, background, border or shadow, and no layer above
      // it (up to the one that holds the target) paints over the center. Ancestors' content elsewhere does not matter.
      const clear = (c: string): boolean => c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c) || /\/\s*0(\.0+)?%?\s*\)$/.test(c);
      const paints = (node: Element): boolean => {
        const cs = getComputedStyle(node);
        return !clear(cs.backgroundColor) || cs.backgroundImage !== 'none' || (cs.backdropFilter || 'none') !== 'none' || cs.filter !== 'none';
      };
      const empty = (node: Element): boolean => {
        if (/\S/.test(node.textContent ?? '') || node.matches('img, svg, canvas, video, iframe, input, button, a, [role]') || node.querySelector('img, svg, canvas, video, iframe, input, button, a, [role]')) return false;
        const cs = getComputedStyle(node);
        const border = ['top', 'right', 'bottom', 'left'].every((s) => {
          const style = cs.getPropertyValue(`border-${s}-style`);
          return style === 'none' || style === 'hidden' || parseFloat(cs.getPropertyValue(`border-${s}-width`)) === 0;
        });
        return !paints(node) && border && cs.boxShadow === 'none';
      };
      let invisible = empty(hit);
      for (let n: Element | null = parent(hit); invisible && n && n !== document.documentElement && !n.contains(pointerTarget); n = parent(n)) if (paints(n)) invisible = false;
      return { desc: describe(hit), hitId, close, controls, interactive, busy, invisible };
    }, label).catch(() => null);
  }

  /** Re-hit-test a painted, control-free layer for a bounded period, then return the blocker that remains. */
  private async waitForVeilToClear(el: ElementHandle<Element>, label: ElementHandle<Element> | null, initial: Cover): Promise<Cover | null> {
    const deadline = Date.now() + VEIL_CLEAR_TIMEOUT;
    let cover: Cover | null = initial;
    while (Date.now() < deadline) {
      // Prefer checking sooner when a region advertises loading, but always give painted veils this bounded chance.
      await sleep(Math.min(cover?.busy ? VEIL_RECHECK_MS / 2 : VEIL_RECHECK_MS, deadline - Date.now()));
      cover = await this.coveredBy(el, label);
      if (!cover || cover.interactive || cover.invisible) return cover;
    }
    return cover;
  }

  /** An anchor's resolved destination is useful when a non-interactive veil makes its link unreachable. */
  private async linkHref(el: ElementHandle<Element>): Promise<string | null> {
    return el.evaluate((node) => node instanceof HTMLAnchorElement && node.href ? node.href : null).catch(() => null);
  }

  private coveredMessage(label: string, cover: Cover, href: string | null = null): string {
    const plain = label.replace(' (password)', '');
    const by = cover.hitId !== undefined ? `${cover.desc} (#${cover.hitId})` : cover.desc;
    const close = cover.close ? ` (try #${cover.close.id} "${cover.close.name}")` : '';
    if (!cover.interactive && !cover.invisible) {
      const direct = href ? `; href ${href}; try open("${href}")` : '';
      return `${plain} is covered by another element, a non-dismissible layer, ${by}; nothing to dismiss (the page may be loading or the region is inactive)${direct}`;
    }
    const controls = cover.controls.filter((control) => control.id !== cover.close?.id).slice(0, 3)
      .map((control) => `#${control.id} "${control.name}"`).join(', ');
    return `${plain} is covered by another element, ${by}; dismiss that first${close}${controls ? ` (controls: ${controls})` : ''}`;
  }

  private inactiveMessage(label: string, controller: { id: number; name: string }): string {
    return `${label.replace(' (password)', '')} is inside a collapsed or inactive section; open #${controller.id} "${controller.name}" first`;
  }

  private explain(e: unknown, label: string): string {
    const msg = String(e instanceof Error ? e.message : e);
    const plain = label.replace(' (password)', '');
    const clickFailure = classifyClickError(e);
    if (clickFailure === 'intercepted') {
      return `${plain} is covered by another element; call read() to inspect what is blocking it`;
    }
    if (clickFailure === 'not-visible') {
      return `${plain} is not visible; try scroll(#id) or read() again`;
    }
    if (/not enabled|disabled/.test(msg) && /Timeout/.test(msg)) return `${plain} is disabled`;
    if (/detached from the DOM|not attached/.test(msg)) return `${plain} no longer exists; call read() to refresh`;
    if (/not an <input>|not editable|Element is not/.test(msg)) return `${plain} is not a text field`;
    if (/Timeout/.test(msg)) return `${plain} did not become clickable in time`;
    return `${plain}: ${brief(e)}`;
  }

  /** Observe before dispatch without spending either navigation budget until dispatch has happened. */
  private watchNavigation(page: Page): { started: Promise<boolean>; finished: Promise<'finished' | 'aborted'>; cancel: () => void } {
    const controller = new AbortController();
    const started = page.waitForRequest(
      (request) => request.isNavigationRequest() && request.frame() === page.mainFrame(),
      { timeout: 0, signal: controller.signal },
    ).then(() => true, () => false);
    // A rejected navigation is still a terminal outcome: Chromium may have committed its
    // error document (or another document) by the time act() observes the page.
    const finished = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 0, signal: controller.signal })
      .then(() => 'finished' as const, () => 'aborted' as const);
    return { started, finished, cancel: () => controller.abort() };
  }

  private async waitForTriggeredNavigation(navigation: { started: Promise<boolean>; finished: Promise<'finished' | 'aborted'>; cancel: () => void }): Promise<void> {
    let startTimer: ReturnType<typeof setTimeout> | undefined;
    const started = await Promise.race([
      navigation.started,
      new Promise<false>((resolve) => { startTimer = setTimeout(() => resolve(false), NAVIGATION_START_TIMEOUT); }),
    ]);
    if (startTimer) clearTimeout(startTimer);
    if (!started) {
      navigation.cancel();
      return;
    }
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      navigation.finished,
      new Promise<'timed-out'>((resolve) => { finishTimer = setTimeout(() => resolve('timed-out'), NAVIGATION_TIMEOUT); }),
    ]);
    if (finishTimer) clearTimeout(finishTimer);
    navigation.cancel();
    if (outcome === 'timed-out') throw new ActionError('click was dispatched, but the navigation did not finish in time');
  }

  /**
   * Fallbacks for a control Playwright could not click: a visible label that owns it, then a
   * snapshot-verified screen-reader-only control. True when one of them fired.
   */
  private async clickFallback(page: Page, el: ElementHandle<Element>, id: number, msg: string, associatedLabel: ElementHandle<Element> | null = null): Promise<boolean> {
    const failure = classifyClickError(msg);
    // A visible label can legitimately receive the pointer for its control.
    if (failure === 'intercepted' && await this.clickAssociatedLabel(el, associatedLabel)) return true;
    // The snapshot verified a screen-reader-only control.
    return failure !== null && await this.clickSrOnly(page, el, id);
  }

  /**
   * Set a checkbox/radio. If it cannot be clicked directly (visually hidden native input styled via its label),
   * use the click fallbacks, but only to reach the wanted state: never toggle it the wrong way.
   */
  private async setChecked(page: Page, el: ElementHandle<Element>, id: number, on: boolean, label: string): Promise<void> {
    const state = () => el.evaluate((n) => n instanceof HTMLInputElement ? { checked: n.checked, disabled: n.disabled, radio: n.type === 'radio' } : null).catch(() => null);
    const verify = async (): Promise<void> => {
      if ((await state())?.checked !== on) throw new ActionError(`${label} did not reach the requested state`);
    };
    const current = await state();
    if (!current || current.disabled) {
      await el.setChecked(on, { timeout: this.actionTimeout });
      await verify();
      return;
    }
    if (current.checked === on) return;
    // A radio cannot be unchecked by clicking it.
    if (current.radio && !on) throw new ActionError(`${label} is a radio; select another option instead`);
    const inactive = await this.inactiveController(el);
    if (inactive) throw new ActionError(this.inactiveMessage(label, inactive));
    const associatedLabel = await this.renderedAssociatedLabel(el);
    const cover = await this.coveredBy(el, associatedLabel);
    try {
      if (associatedLabel && !cover) await associatedLabel.click({ timeout: this.actionTimeout });
      else await el.setChecked(on, { timeout: cover ? COVERED_CLICK_TIMEOUT : this.actionTimeout });
      await verify();
    } catch (e) {
      if (e instanceof ActionError) throw e;
      const msg = String(e instanceof Error ? e.message : e);
      if (cover && /intercepts pointer events|Timeout/.test(msg)) throw new ActionError(this.coveredMessage(label, cover));
      if (classifyClickError(msg) === null) throw e;
      const cur = await state();
      if (!cur || cur.disabled) throw e;
      if (cur.checked === on) return;
      if (cur.radio && !on) throw e;
      if (!(await this.clickFallback(page, el, id, msg, associatedLabel)) || (await state())?.checked !== on) throw e;
    } finally {
      await associatedLabel?.dispose().catch(() => undefined);
    }
  }

  /** A label may intercept a pointer aimed at its own native control. No other overlay qualifies. */
  private async clickAssociatedLabel(el: ElementHandle<Element>, renderedLabel: ElementHandle<Element> | null = null): Promise<boolean> {
    const label = renderedLabel ?? await this.renderedAssociatedLabel(el);
    if (label) {
      try {
        await label.click({ timeout: COVERED_CLICK_TIMEOUT });
        return true;
      } catch {
        return false;
      } finally {
        if (!renderedLabel) await label.dispose().catch(() => undefined);
      }
    }
    const handle = await el.evaluateHandle((target) => {
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement)) return null;
      const parent = (node: Element): Element | null => node.parentElement ?? (node.getRootNode() instanceof ShadowRoot ? (node.getRootNode() as ShadowRoot).host : null);
      const hitAt = (element: Element): Element | null => {
        const rect = element.getBoundingClientRect();
        const x = Math.max(0, Math.min(innerWidth - 1, rect.left + rect.width / 2));
        const y = Math.max(0, Math.min(innerHeight - 1, rect.top + rect.height / 2));
        const root = element.getRootNode() as Document | ShadowRoot;
        let hit: Element | null = (root instanceof ShadowRoot ? root : document).elementFromPoint(x, y);
        while (hit?.shadowRoot) {
          const inner = hit.shadowRoot.elementFromPoint(x, y);
          if (!inner || inner === hit) break;
          hit = inner;
        }
        return hit;
      };
      const hit = hitAt(target);
      for (let node = hit; node; node = parent(node)) {
        if (node instanceof HTMLLabelElement && node.control === target) return node;
      }
      return null;
    }).catch(() => null);
    const interceptedLabel = handle?.asElement();
    if (!interceptedLabel) {
      await handle?.dispose().catch(() => undefined);
      return false;
    }
    try {
      await interceptedLabel.click({ timeout: COVERED_CLICK_TIMEOUT });
      return true;
    } catch {
      return false;
    } finally {
      await handle?.dispose().catch(() => undefined);
    }
  }

  private async renderedAssociatedLabel(el: ElementHandle<Element>): Promise<ElementHandle<Element> | null> {
    const handle = await el.evaluateHandle(renderedLabelForHiddenControl).catch(() => null);
    const label = handle?.asElement();
    if (!label) await handle?.dispose().catch(() => undefined);
    return label ?? null;
  }

  /** Snapshot eligibility is established by the walker's narrow screen-reader-only predicate. */
  private async clickSrOnly(page: Page, el: ElementHandle<Element>, id: number): Promise<boolean> {
    const snap = (await this.observe(page).catch(() => null))?.snap;
    if (!snap?.nodes.some((n) => n.id === id && n.srOnly === true)) return false;
    return el.evaluate((node) => {
      if (!(node instanceof HTMLElement) || !node.isConnected) return false;
      if (node instanceof HTMLInputElement && (node.type === 'checkbox' || node.type === 'radio')) {
        node.click();
        return true;
      }
      node.focus();
      node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      node.click();
      node.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
      return true;
    }).catch(() => false);
  }

  /** Observe only a blocked page for a rendered dialog or a disabled control becoming enabled. */
  private async waitForLateDialog(page: Page, disabledIds: number[]): Promise<boolean> {
    return page.evaluate((ids) => new Promise<boolean>((done) => {
      const registry = (window as unknown as { __mantis?: { byId: Map<number, WeakRef<Element>> } }).__mantis;
      const initial = new Map(ids.map((id) => [id, registry?.byId.get(id)?.deref()]));
      const rendered = (el: Element): boolean => {
        if (el.closest('template')) return false;
        for (let node: Element | null = el; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') return false;
        }
        return el.getClientRects().length > 0;
      };
      const changed = (): boolean => {
        if (Array.from(document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"], [aria-modal="true"]')).some(rendered)) return true;
        return Array.from(initial.values()).some((el) => {
          if (!el?.isConnected) return false;
          const style = getComputedStyle(el);
          const blocked = el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' ||
            style.pointerEvents === 'none' || Number(style.opacity) < 0.5;
          return !blocked;
        });
      };
      if (changed()) { done(true); return; }
      const finish = (value: boolean): void => { observer.disconnect(); clearTimeout(timer); done(value); };
      const observer = new MutationObserver(() => { if (changed()) finish(true); });
      observer.observe(document, { subtree: true, childList: true, attributes: true });
      const timer = setTimeout(() => finish(false), 1500);
    }), disabledIds).catch(() => false);
  }

  private isHeadless(): boolean {
    return this.opts.headless ?? process.env.MANTIS_HEADLESS !== '0';
  }

  /** Resolve an id or CSS selector to a live element, with a label for messages. */
  private async visualTarget(page: Page, t: Target): Promise<{ el: ElementHandle<Element>; label: string }> {
    if (t.id !== undefined) return this.target(page, t.id);
    if (t.selector) {
      let el: ElementHandle<Element> | null;
      try {
        el = await page.$(t.selector);
      } catch {
        throw new ActionError(`invalid CSS selector "${t.selector}"`);
      }
      if (!el) throw new ActionError(`nothing matches selector "${t.selector}"; call media() to list images and charts`);
      return { el, label: `"${t.selector}"` };
    }
    throw new ActionError('give an element number (id) from read()/media(), or a CSS selector');
  }

  /** PNG of one element, scrolled into view; never the whole page. */
  private async shot(el: ElementHandle<Element>, label: string): Promise<Buffer> {
    try {
      await el.scrollIntoViewIfNeeded({ timeout: this.actionTimeout });
      return await el.screenshot({ type: 'png', timeout: this.actionTimeout * 2 });
    } catch (e) {
      throw new ActionError(`could not capture ${label}: ${brief(e)}`);
    }
  }

  /** A blank page in a separate context for image work; never becomes the active page. */
  private async scratchPage(): Promise<Page> {
    await this.launch();
    if (!this.scratch) {
      this.scratch = await this.browser!.newContext();
      await this.scratch.addInitScript(NAME_SHIM);
    }
    return this.scratch.pages()[0] ?? this.scratch.newPage();
  }

  /** Replace the browser context with a fresh one holding `state` (cookies + localStorage). */
  private async swapContext(state: Awaited<ReturnType<BrowserContext['storageState']>>): Promise<void> {
    const old = this.context;
    const ctx = await this.browser!.newContext({ viewport: { width: 1280, height: 800 }, storageState: state });
    await ctx.addInitScript(NAME_SHIM);
    await ctx.addInitScript(TRACKER);
    ctx.on('page', (p) => this.adopt(p));
    this.context = ctx;
    this.adopt(await ctx.newPage());
    await old?.close().catch(() => undefined);
  }

  /**
   * Wait for load, then for the page to go quiet: no DOM mutation for 150ms (3s cap) and no short
   * timer or request still pending (1.5s cap), so delayed effects of an action are included.
   * After an action only work begun since it counts (not background polling), and attributes that
   * keep changing on one element (animation) stop resetting the quiet timer.
   */
  private async settle(page: Page, afterAction = false): Promise<void> {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await page.evaluate(
          ({ quiet, max, busyMax, useEpoch }) =>
            new Promise<void>((done) => {
              const w = window as unknown as { __mantisSetTimeout?: typeof setTimeout; __mantisBusy?: (since?: number) => boolean; __mantisEpoch?: number };
              const st = w.__mantisSetTimeout ?? setTimeout;
              // Only work begun since the action counts as pending; a missing epoch (new document) counts everything.
              const since = useEpoch ? (w.__mantisEpoch ?? 0) : 0;
              const start = Date.now();
              let timer: ReturnType<typeof setTimeout>;
              const finish = (): void => {
                obs.disconnect();
                clearTimeout(timer);
                clearTimeout(cap);
                done();
              };
              const check = (): void => {
                if (w.__mantisBusy?.(since) && Date.now() - start < busyMax) timer = st(check, 50);
                else finish();
              };
              // An element whose same attribute keeps changing (carousel, spinner, ticker) is an animation:
              // after its 3rd change it no longer resets the quiet timer. New or removed content always does.
              // A carousel advancing across many slides touches each element only once or twice, so the same
              // change is also counted per kind (attribute + tag + first class).
              const repeats = new WeakMap<Node, Map<string, number>>();
              const kinds = new Map<string, number>();
              const NOISE = new Set(['script', 'style', 'link', 'meta', 'noscript', 'template']);
              const noise = (n: Node): boolean => {
                if (n.nodeType === 8) return true;
                if (n.nodeType === 3) return !(n.textContent ?? '').trim();
                if (!(n instanceof Element)) return false;
                if (NOISE.has(n.localName)) return true;
                if (n.localName === 'iframe' || n.localName === 'img') {
                  const r = n.getBoundingClientRect();
                  return r.width <= 1 && r.height <= 1;
                }
                return false;
              };
              const animated = (m: MutationRecord): boolean => {
                if (m.type === 'characterData') return false;
                if (m.type === 'childList') {
                  // Analytics and ad scripts injecting into <head>, or only tags that show nothing, are not new content.
                  const t = m.target;
                  if (t instanceof Element && (t.localName === 'head' || t.closest('head'))) return true;
                  const moved = [...Array.from(m.addedNodes), ...Array.from(m.removedNodes)];
                  return moved.length > 0 && moved.every(noise);
                }
                let per = repeats.get(m.target);
                if (!per) repeats.set(m.target, (per = new Map()));
                const name = m.attributeName ?? '';
                const n = (per.get(name) ?? 0) + 1;
                per.set(name, n);
                let repeated = n >= 3;
                if (m.target instanceof Element) {
                  const cls = m.target.classList[0];
                  if (cls) {
                    const kind = `${name}|${m.target.localName}|${cls}`;
                    const k = (kinds.get(kind) ?? 0) + 1;
                    kinds.set(kind, k);
                    if (k >= 3) repeated = true;
                  }
                }
                return repeated;
              };
              const obs = new MutationObserver((records) => {
                let real = false;
                for (const m of records) if (!animated(m)) real = true;
                if (!real) return;
                clearTimeout(timer);
                timer = st(check, quiet);
              });
              obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
              timer = st(check, quiet);
              const cap = st(finish, max);
            }),
          { quiet: 150, max: 3000, busyMax: 1500, useEpoch: afterAction },
        );
        return;
      } catch {
        // A navigation replaced the document under us; wait for it and try once more.
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
        await sleep(50);
      }
    }
  }
}
