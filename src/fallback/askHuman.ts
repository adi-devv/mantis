import type { Page } from 'playwright';
import { capture } from '../capture/index.js';

/** What ends a human hand-off. */
export type Until =
  | { kind: 'default' }
  | { kind: 'url_change' }
  | { kind: 'selector_gone'; selector: string }
  | { kind: 'selector_present'; selector: string };

export const DEFAULT_TIMEOUT_SECONDS = 300;

export function parseUntil(until?: string): Until {
  const s = (until ?? '').trim();
  if (!s) return { kind: 'default' };
  if (s === 'url_change') return { kind: 'url_change' };
  const m = s.match(/^(selector_gone|selector_present):(.+)$/s);
  if (m && m[2].trim()) return { kind: m[1] as 'selector_gone' | 'selector_present', selector: m[2].trim() };
  throw new Error(`unknown until "${s}"; use url_change, selector_gone:<css> or selector_present:<css>`);
}

export function describeUntil(u: Until): string {
  switch (u.kind) {
    case 'url_change': return 'the URL to change';
    case 'selector_gone': return `"${u.selector}" to disappear`;
    case 'selector_present': return `"${u.selector}" to appear`;
    default: return 'the URL or the page contents to change';
  }
}

/** Fraction of interactive elements (role + name) that differ between two views of a page. */
export function drift(a: Set<string>, b: Set<string>): number {
  let diff = 0;
  for (const x of a) if (!b.has(x)) diff++;
  for (const x of b) if (!a.has(x)) diff++;
  return diff / Math.max(a.size, b.size, 1);
}

async function signature(page: Page): Promise<Set<string>> {
  const snap = await capture(page);
  return new Set(snap.nodes.filter((n) => n.kind === 'interactive').map((n) => `${n.role}|${n.name}`));
}

async function selectorVisible(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }, selector);
}

export interface WaitOptions {
  timeoutMs: number;
  pollMs?: number;
}

/**
 * Poll `page` until the condition holds, the page is closed (the human is done) or time runs out.
 * Resolves to true when the condition was met, false on timeout.
 */
export async function waitForHuman(page: Page, until: Until, opts: WaitOptions): Promise<boolean> {
  const poll = opts.pollMs ?? 500;
  const deadline = Date.now() + opts.timeoutMs;
  const startUrl = page.url();
  let baseline: Set<string> | null = null;
  if (until.kind === 'default') baseline = await signature(page).catch(() => null);
  const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

  while (Date.now() < deadline) {
    if (page.isClosed()) return true;
    try {
      switch (until.kind) {
        case 'url_change':
          if (page.url() !== startUrl) return true;
          break;
        case 'selector_gone':
          if (!(await selectorVisible(page, until.selector))) return true;
          break;
        case 'selector_present':
          if (await selectorVisible(page, until.selector)) return true;
          break;
        default: {
          if (page.url() !== startUrl) return true;
          const now = await signature(page);
          if (baseline && drift(baseline, now) >= 0.4) return true;
          baseline ??= now;
        }
      }
    } catch {
      // Mid-navigation evaluate failures: just poll again.
    }
    await sleep(Math.min(poll, Math.max(0, deadline - Date.now())));
  }
  return false;
}
