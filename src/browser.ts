import { chromium } from 'playwright';
import type { Browser, BrowserContext, ElementHandle, Page } from 'playwright';
import { capture, resolve } from './capture/index.js';
import type { Snapshot } from './capture/index.js';
import { translate } from './translate.js';

export interface MantisOptions {
  /** Run Chromium without a window. Default true; MANTIS_HEADLESS=0 shows it. */
  headless?: boolean;
  /** How long a click/type/select waits for the element to become actionable. */
  actionTimeoutMs?: number;
}

/** A failure the agent should see as a plain message. */
class ActionError extends Error {}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** First meaningful line of a Playwright error, without the call log. */
function brief(e: unknown): string {
  const first = String(e instanceof Error ? e.message : e).split('\n')[0] ?? '';
  return first.replace(/^[\w.]+: /, '').trim().slice(0, 200) || 'unknown error';
}

/** "/login → /dashboard" within one origin, full URLs otherwise. */
function urlChange(from: string, to: string): string {
  if (to.startsWith('chrome-error:')) return `${from} → (load error)`;
  try {
    const a = new URL(from);
    const b = new URL(to);
    if (a.origin === b.origin) return `${a.pathname + a.search + a.hash} → ${b.pathname + b.search + b.hash}`;
  } catch { /* fall through to full URLs */ }
  return `${from} → ${to}`;
}

/**
 * One Chromium, one active page. Actions return short text; read() returns the
 * numbered view of the page.
 */
export class MantisBrowser {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private labels = new Map<number, string>();
  private notes: string[] = [];
  private readonly actionTimeout: number;

  constructor(private readonly opts: MantisOptions = {}) {
    this.actionTimeout = opts.actionTimeoutMs ?? 5000;
  }

  async launch(): Promise<void> {
    if (this.browser) return;
    const headless = this.opts.headless ?? process.env.MANTIS_HEADLESS !== '0';
    this.browser = await chromium.launch({ headless });
    this.context = await this.browser.newContext({ viewport: { width: 1280, height: 800 } });
    // Transpilers (tsx, vitest) wrap named functions in a __name() helper that does not
    // exist in the page; define it (as a string, so it is not itself wrapped).
    await this.context.addInitScript("Object.defineProperty(globalThis, '__name', { value: (f) => f, configurable: true });");
    this.context.on('page', (p) => this.adopt(p));
    this.adopt(await this.context.newPage());
  }

  async close(): Promise<void> {
    const b = this.browser;
    this.browser = this.context = this.page = null;
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
      return this.view(page);
    });
  }

  async read(): Promise<string> {
    return this.guard(async () => this.view(await this.activePage()));
  }

  async click(id: number): Promise<string> {
    return this.act(async (page) => {
      const { el, label } = await this.target(page, id);
      try {
        await el.click({ timeout: this.actionTimeout });
      } catch (e) {
        throw new ActionError(this.explain(e, label));
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
        return `selected "${found.picked}" in ${label}`;
      } catch (e) {
        throw e instanceof ActionError ? e : new ActionError(this.explain(e, label));
      } finally {
        await el.dispose();
      }
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
    });
  }

  async back(): Promise<string> {
    return this.act(async (page) => {
      const from = page.url();
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => null);
      return page.url() !== from ? 'went back' : 'cannot go back: no earlier page';
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

  /** Run an action, wait for the page to settle, and report URL/title changes. */
  private act(fn: (page: Page) => Promise<string>): Promise<string> {
    return this.guard(async () => {
      const page = await this.activePage();
      const before = await this.where(page);
      const msg = await fn(page);
      await this.settle(page);
      const lines = [msg];
      const now = this.page ?? page;
      if (now !== page) {
        await this.settle(now);
        lines.push('opened in a new tab (now active)');
      }
      const after = await this.where(now);
      if (after.url !== before.url) lines.push(`url: ${urlChange(before.url, after.url)}`);
      if (after.url.startsWith('chrome-error:')) lines.push('the page failed to load');
      else if (after.title !== before.title) lines.push(`title: "${before.title}" → "${after.title}"`);
      lines.push(...this.notes.splice(0));
      return lines.join('\n');
    });
  }

  private async where(page: Page): Promise<{ url: string; title: string }> {
    return { url: page.url(), title: await page.title().catch(() => '') };
  }

  private async view(page: Page): Promise<string> {
    const snap = await capture(page);
    this.labels.clear();
    for (const n of snap.nodes) {
      if (n.kind === 'interactive' && n.id !== undefined) {
        const name = n.name ? ` "${n.name.replace(/"/g, "'")}"` : '';
        this.labels.set(n.id, `#${n.id} ${n.role}${name}${n.secret ? ' (password)' : ''}`);
      }
    }
    const text = translate(snap);
    return this.notes.length ? `${text}\n${this.notes.splice(0).join('\n')}` : text;
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

  /** Wait for load, then for the DOM to stop mutating (300ms quiet, 3s cap). */
  private async settle(page: Page): Promise<void> {
    await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await page.evaluate(
          ({ quiet, max }) =>
            new Promise<void>((done) => {
              let timer: ReturnType<typeof setTimeout>;
              const finish = (): void => {
                obs.disconnect();
                clearTimeout(timer);
                clearTimeout(cap);
                done();
              };
              const obs = new MutationObserver(() => {
                clearTimeout(timer);
                timer = setTimeout(finish, quiet);
              });
              obs.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
              timer = setTimeout(finish, quiet);
              const cap = setTimeout(finish, max);
            }),
          { quiet: 300, max: 3000 },
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
