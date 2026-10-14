import type { ElementHandle, Page } from 'playwright';
import { walker } from './walker.js';
import type { RawNode, WalkResult } from './walker.js';

export type { RawNode, NodeKind } from './walker.js';
export type Snapshot = WalkResult;

const CONTEXT_LOST = /Execution context was destroyed|Target (page, context or browser )?has been closed|navigation/i;

/** Run the DOM walker in the page and return the raw node list. */
export async function capture(page: Page): Promise<Snapshot> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await page.evaluate(`(${walker.toString()})()`) as Snapshot;
    } catch (e) {
      // A navigation can land mid-evaluate; wait for the new document and retry once.
      if (attempt >= 1 || !CONTEXT_LOST.test(String(e))) throw e;
      await page.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
  }
}

export type Resolved =
  | { ok: true; el: ElementHandle<Element> }
  | { ok: false; reason: 'unknown' | 'gone' };

/** Look up the live element behind a number handed out by a previous capture. */
export async function resolve(page: Page, id: number): Promise<Resolved> {
  const status = await page.evaluate((n) => {
    const w = window as unknown as { __mantis?: { byId: Map<number, WeakRef<Element>> } };
    const ref = w.__mantis?.byId.get(n);
    if (!ref) return 'unknown';
    const el = ref.deref();
    return el && el.isConnected ? 'ok' : 'gone';
  }, id);
  if (status !== 'ok') return { ok: false, reason: status as 'unknown' | 'gone' };
  const handle = await page.evaluateHandle((n) => {
    const w = window as unknown as { __mantis?: { byId: Map<number, WeakRef<Element>> } };
    return w.__mantis?.byId.get(n)?.deref() ?? null;
  }, id);
  const el = handle.asElement();
  if (!el) {
    await handle.dispose();
    return { ok: false, reason: 'gone' };
  }
  return { ok: true, el };
}
