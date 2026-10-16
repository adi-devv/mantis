import type { ElementHandle, Frame, Page } from 'playwright';
import { walker } from './walker.js';
import type { RawNode, WalkResult } from './walker.js';

export type { RawNode, NodeKind } from './walker.js';
export type Snapshot = WalkResult;

const CONTEXT_LOST = /Execution context was destroyed|Target (page, context or browser )?has been closed|navigation/i;

// The result goes back as one JSON string: Playwright's structured serializer is several times
// slower on a 3000-node result than a native JSON.stringify / JSON.parse round trip.
const WALK = (includeSrOnly: boolean): string => `JSON.stringify((${walker.toString()})(${includeSrOnly}))`;

/** Numbers inside a child frame start at its base, so they never clash with the page's or each other's. */
const FRAME_STEP = 10_000;
const MAX_FRAME_DEPTH = 3;
const MAX_FRAMES = 20;
const frameBase = new WeakMap<Frame, number>();
const frameByBase = new Map<number, WeakRef<Frame>>();

/** The frame's number range; ranges of frames that are gone are reused (like the page restarting at #1). */
function baseOf(frame: Frame): number {
  const own = frameBase.get(frame);
  if (own !== undefined && frameByBase.get(own)?.deref() === frame) return own;
  let b = FRAME_STEP;
  for (;; b += FRAME_STEP) {
    const f = frameByBase.get(b)?.deref();
    if (!f || f.isDetached()) break;
  }
  frameBase.set(frame, b);
  frameByBase.set(b, new WeakRef(frame));
  return b;
}

async function walk(frame: Frame, base: number, includeSrOnly = false): Promise<Snapshot> {
  // A reused range: a document still holding an older range starts over in the new one.
  const script = base
    ? `((w) => { if (w.__mantisBase !== ${base}) { w.__mantisBase = ${base}; delete w.__mantis; } return ${WALK(includeSrOnly)}; })(window)`
    : WALK(includeSrOnly);
  for (let attempt = 0; ; attempt++) {
    try {
      return JSON.parse((await frame.evaluate(script)) as string) as Snapshot;
    } catch (e) {
      // A navigation can land mid-evaluate; wait for the new document and retry once.
      if (attempt >= 1 || !CONTEXT_LOST.test(String(e))) throw e;
      await frame.waitForLoadState('domcontentloaded').catch(() => undefined);
    }
  }
}

/** The frame an iframe placeholder (registry number `id` in `frame`) shows, if it is reachable. */
async function childFrame(frame: Frame, id: number): Promise<Frame | null> {
  const h = await frame
    .evaluateHandle((n) => (window as unknown as { __mantis?: { byId: Map<number, WeakRef<Element>> } }).__mantis?.byId.get(n)?.deref() ?? null, id)
    .catch(() => null);
  const el = h?.asElement();
  const child = el ? await el.contentFrame().catch(() => null) : null;
  await h?.dispose().catch(() => undefined);
  return child;
}

/** Fill each iframe placeholder with the frame's own nodes (numbers from the frame's own range). */
async function fillFrames(frame: Frame, snap: Snapshot, depth: number, budget: { frames: number }): Promise<void> {
  if (!snap.nodes.some((n) => n.frame !== undefined)) return;
  const out: RawNode[] = [];
  const remap: number[] = [];
  for (const [i, n] of snap.nodes.entries()) {
    remap[i] = out.length;
    out.push({ ...n, parent: n.parent >= 0 ? remap[n.parent]! : -1 });
    if (n.frame === undefined) continue;
    const at = out.length - 1;
    const child = depth <= MAX_FRAME_DEPTH && budget.frames > 0 ? await childFrame(frame, n.frame) : null;
    if (!child) continue;
    budget.frames--;
    const inner = await walk(child, baseOf(child)).catch(() => null);
    if (!inner) continue;
    await fillFrames(child, inner, depth + 1, budget);
    if (!out[at]!.name && inner.title) out[at]!.name = inner.title.slice(0, 60);
    const [fx, fy] = n.box ?? [0, 0];
    const start = out.length;
    for (const c of inner.nodes) {
      out.push({
        ...c,
        parent: c.parent >= 0 ? start + c.parent : at,
        depth: c.depth + n.depth + 1,
        inViewport: c.inViewport && n.inViewport,
        box: c.box ? [c.box[0] + fx, c.box[1] + fy, c.box[2], c.box[3]] : undefined,
      });
    }
    snap.truncated ||= inner.truncated;
  }
  // A frame that showed nothing (blank, unreachable, all hidden) is not worth a line.
  const filled = new Set(out.map((n) => n.parent));
  const index: number[] = [];
  const kept: RawNode[] = [];
  out.forEach((n, i) => {
    if (n.frame !== undefined && !filled.has(i)) return;
    index[i] = kept.length;
    kept.push({ ...n, parent: n.parent >= 0 ? index[n.parent]! : -1 });
  });
  snap.nodes = kept;
}

/** Run the DOM walker in the page and its visible iframes, and return the raw node list. */
export async function capture(page: Page): Promise<Snapshot> {
  const snap = await walk(page.mainFrame(), 0);
  await fillFrames(page.mainFrame(), snap, 1, { frames: MAX_FRAMES });
  if (!snap.nodes.length) {
    const fallback = await walk(page.mainFrame(), 0, true);
    await fillFrames(page.mainFrame(), fallback, 1, { frames: MAX_FRAMES });
    // A canvas marker or empty frame is not enough evidence of readable page content.
    if (fallback.nodes.some((n) =>
      (n.kind === 'heading' || n.kind === 'interactive' || n.kind === 'prose' ||
        (n.kind === 'text' && !n.name.startsWith('[canvas'))) && /[\p{L}\p{N}]/u.test(n.name))) {
      return fallback;
    }
  }
  return snap;
}

export type Resolved =
  | { ok: true; el: ElementHandle<Element> }
  | { ok: false; reason: 'unknown' | 'gone' };

/** Look up the live element behind a number handed out by a previous capture (in any frame). */
export async function resolve(page: Page, id: number): Promise<Resolved> {
  let frame: Frame = page.mainFrame();
  if (id > FRAME_STEP) {
    const f = frameByBase.get(Math.floor((id - 1) / FRAME_STEP) * FRAME_STEP)?.deref();
    if (!f || f.page() !== page) return { ok: false, reason: 'unknown' };
    if (f.isDetached()) return { ok: false, reason: 'gone' };
    frame = f;
  }
  const status = await frame.evaluate((n) => {
    const w = window as unknown as { __mantis?: { byId: Map<number, WeakRef<Element>> } };
    const ref = w.__mantis?.byId.get(n);
    if (!ref) return 'unknown';
    const el = ref.deref();
    return el && el.isConnected ? 'ok' : 'gone';
  }, id);
  if (status !== 'ok') return { ok: false, reason: status as 'unknown' | 'gone' };
  const handle = await frame.evaluateHandle((n) => {
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
