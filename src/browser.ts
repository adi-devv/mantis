import { chromium } from 'playwright';
import type { Browser, BrowserContext, ElementHandle, Page } from 'playwright';
import { capture, resolve } from './capture/index.js';
import type { Snapshot } from './capture/index.js';
import { findInSnapshot, translate } from './translate.js';
import type { ReadOptions } from './translate.js';
import { SiteMemory, originOf } from './memory.js';
import { NO_CHANGE, diffSnapshots, headerLines } from './diff.js';
import { listMedia, describeElement, formatData } from './fallback/media.js';
import type { Target } from './fallback/media.js';
import { detectCaptcha } from './fallback/captcha.js';
import { recognize, closeOcr } from './fallback/ocr.js';
import { downscale, pngSize } from './fallback/look.js';
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
  let timers = 0, net = 0;
  const live = new Map();
  window.__mantisSetTimeout = st.bind(window);
  window.setTimeout = function (fn, ms, ...rest) {
    if (typeof fn !== 'function' || Number(ms || 0) > 1000) return st.call(this, fn, ms, ...rest);
    timers++;
    let id;
    const end = () => { if (live.delete(id)) timers--; };
    id = st.call(this, function () { end(); return fn.apply(this, arguments); }, ms, ...rest);
    live.set(id, end);
    return id;
  };
  window.clearTimeout = function (id) { const end = live.get(id); if (end) end(); return ct.call(this, id); };
  const f = window.fetch;
  if (f) window.fetch = function () {
    net++;
    const done = () => { net--; };
    let p;
    try { p = f.apply(this, arguments); } catch (e) { done(); throw e; }
    p.then(done, done);
    return p;
  };
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    net++;
    let over = false;
    const done = () => { if (!over) { over = true; net--; } };
    this.addEventListener('loadend', done);
    try { return send.apply(this, arguments); } catch (e) { done(); throw e; }
  };
  window.__mantisBusy = () => timers > 0 || net > 0;
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
    this.browser = await chromium.launch({ headless });
    this.context = await this.browser.newContext({ viewport: { width: 1280, height: 800 } });
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
      const hydrating = disabled.filter((n) => n.states.includes('disabled')).length >= 3;
      const gated = !dialogAlreadyShown && (hydrating || blocked.some((n) => n.covered) || (blocked.length >= 2 && blocked.length * 2 >= controls.length));
      let snap = initial.snap;
      if (gated && await this.waitForLateDialog(page, disabled.map((n) => n.id!).filter((id) => id !== undefined))) {
        snap = (await this.observe(page)).snap;
      }
      let text = this.render(snap);
      const captcha = await detectCaptcha(page);
      if (captcha) text += `\n${captcha}`;
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
      try {
        await el.click({ timeout: this.actionTimeout });
      } catch (e) {
        const msg = String(e instanceof Error ? e.message : e);
        if (/intercepts pointer events/.test(msg) && await this.clickAssociatedLabel(el)) {
          // A visible label can legitimately receive the pointer for its control.
        } else if (/element is not visible|waiting for element to be visible|outside of the viewport|intercepts pointer events/.test(msg) && await this.clickSrOnly(page, el, id)) {
          // The snapshot verified a screen-reader-only control.
        } else {
          throw new ActionError(this.explain(e, label));
        }
      } finally {
        await el.dispose();
      }
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
            await el.setChecked(on, { timeout: this.actionTimeout });
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

  /** Scroll the page up/down by most of a screen, or bring element `#id` into view. */
  async scroll(target: 'up' | 'down' | number = 'down'): Promise<string> {
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
    }, { quiet: true });
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
      const { el, label } = await this.visualTarget(page, target);
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
        headed = await chromium.launch({ headless: false });
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
      const msg = await fn(page);
      await this.settle(page);
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
        else if (after) lines.push(this.render(after.snap));
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

  /** Remember how each number was last described, for action messages. */
  private remember(snap: Snapshot): void {
    this.labels.clear();
    for (const n of snap.nodes) {
      if (n.kind === 'interactive' && n.id !== undefined) {
        const name = n.name ? ` ${n.inferred ? '~' : ''}"${n.name.replace(/"/g, "'")}"` : '';
        this.labels.set(n.id, `#${n.id} ${n.role}${name}${n.secret ? ' (password)' : ''}`);
      }
    }
  }

  private async target(page: Page, id: number): Promise<{ el: ElementHandle<Element>; label: string }> {
    const found = await resolve(page, id);
    if (!found.ok) {
      throw new ActionError(
        found.reason === 'unknown'
          ? `no element #${id} on this page; call read() to see current numbers`
          : `#${id} no longer exists (the page changed); call read() to refresh`,
      );
    }
    return { el: found.el, label: this.labels.get(id) ?? `#${id}` };
  }

  private explain(e: unknown, label: string): string {
    const msg = String(e instanceof Error ? e.message : e);
    const plain = label.replace(' (password)', '');
    if (/intercepts pointer events/.test(msg)) {
      return `${plain} is covered by another element (an overlay or dialog); dismiss that first`;
    }
    if (/element is not visible|waiting for element to be visible/.test(msg)) {
      return `${plain} is not visible; try scroll(#id) or read() again`;
    }
    if (/not enabled|disabled/.test(msg) && /Timeout/.test(msg)) return `${plain} is disabled`;
    if (/detached from the DOM|not attached/.test(msg)) return `${plain} no longer exists; call read() to refresh`;
    if (/not an <input>|not editable|Element is not/.test(msg)) return `${plain} is not a text field`;
    if (/Timeout/.test(msg)) return `${plain} did not become clickable in time`;
    return `${plain}: ${brief(e)}`;
  }

  /** A label may intercept a pointer aimed at its own native control. No other overlay qualifies. */
  private async clickAssociatedLabel(el: ElementHandle<Element>): Promise<boolean> {
    return el.evaluate((target) => {
      if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement || target instanceof HTMLButtonElement)) return false;
      const r = target.getBoundingClientRect();
      if (!r.width || !r.height) return false;
      const x = Math.max(0, Math.min(innerWidth - 1, r.left + r.width / 2));
      const y = Math.max(0, Math.min(innerHeight - 1, r.top + r.height / 2));
      let hit: Element | null = document.elementFromPoint(x, y);
      // elementFromPoint on document returns the host; descend through open roots.
      while (hit?.shadowRoot) {
        const inner = hit.shadowRoot.elementFromPoint(x, y);
        if (!inner || inner === hit) break;
        hit = inner;
      }
      const parent = (node: Element): Element | null => node.parentElement ?? (node.getRootNode() instanceof ShadowRoot ? (node.getRootNode() as ShadowRoot).host : null);
      for (let node = hit; node; node = parent(node)) {
        if (node instanceof HTMLLabelElement && node.control === target) {
          node.click();
          return true;
        }
      }
      return false;
    }).catch(() => false);
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
   */
  private async settle(page: Page): Promise<void> {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await page.evaluate(
          ({ quiet, max, busyMax }) =>
            new Promise<void>((done) => {
              const w = window as unknown as { __mantisSetTimeout?: typeof setTimeout; __mantisBusy?: () => boolean };
              const st = w.__mantisSetTimeout ?? setTimeout;
              const start = Date.now();
              let timer: ReturnType<typeof setTimeout>;
              const finish = (): void => {
                obs.disconnect();
                clearTimeout(timer);
                clearTimeout(cap);
                done();
              };
              const check = (): void => {
                if (w.__mantisBusy?.() && Date.now() - start < busyMax) timer = st(check, 50);
                else finish();
              };
              const obs = new MutationObserver(() => {
                clearTimeout(timer);
                timer = st(check, quiet);
              });
              obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
              timer = st(check, quiet);
              const cap = st(finish, max);
            }),
          { quiet: 150, max: 3000, busyMax: 1500 },
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
