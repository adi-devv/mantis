/**
 * Evidence frames for the blind judge: the harness (not the agent) captures the viewport and the page state
 * (URL, visible text, form values) after the agent's browser actions. This module holds the pure parts: the
 * in-page state function, parsing of its output, near-duplicate removal and the cap on kept frames, and the
 * sidecar written next to the run log. Capture itself lives in run.ts; the judge reads the sidecar.
 */
import { decodePng, grayThumb, thumbDiff } from './png.js';

export interface FormValue { label: string; value: string }
export interface EvidenceFrame {
  id: string; /** F1.. in chronological order */
  step: number; /** agent tool calls completed when captured */
  url: string;
  file: string; /** basename of the PNG, in the same folder as the sidecar */
  text: string; final?: boolean; forms?: FormValue[];
}
export interface EvidenceSidecar { frames: EvidenceFrame[]; captured: number; kept: number; captureMs: number }

export const FINAL_TEXT_CAP = 30_000;
export const STEP_TEXT_CAP = 8_000;
export const MAX_FRAMES = 12;

/**
 * Arrow function source evaluated in the page (Playwright `page.evaluate(string)` or Playwright MCP
 * `browser_evaluate`). Self-contained; returns a JSON string { url, title, text, forms }.
 */
export const PAGE_STATE_FUNCTION = `() => {
  const clip = (s, n) => String(s == null ? '' : s).replace(/\\s+/g, ' ').trim().slice(0, n);
  const skip = ['hidden', 'submit', 'button', 'password', 'image', 'reset'];
  const forms = [];
  for (const el of document.querySelectorAll('input, select, textarea')) {
    if (forms.length >= 100) break;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (el.tagName === 'INPUT' && skip.includes(type)) continue;
    const box = el.getBoundingClientRect();
    if (!box.width && !box.height) continue;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const labelledBy = (el.getAttribute('aria-labelledby') || '').split(/\\s+/).map((id) => (document.getElementById(id) || {}).textContent || '').join(' ');
    const attached = el.labels ? Array.from(el.labels).map((l) => l.textContent || '').join(' ') : '';
    const label = clip(el.getAttribute('aria-label') || labelledBy || attached || el.getAttribute('placeholder') || el.getAttribute('name') || el.id, 80);
    let value;
    if (el.tagName === 'SELECT') value = Array.from(el.selectedOptions).map((o) => o.textContent || '').join(', ');
    else if (type === 'checkbox' || type === 'radio') value = el.checked ? 'checked' : 'unchecked';
    else value = el.value;
    forms.push({ label, value: clip(value, 200) });
  }
  const body = document.body;
  return JSON.stringify({ url: location.href, title: document.title, text: body ? body.innerText.slice(0, ${FINAL_TEXT_CAP}) : '', forms });
}`;

export interface PageState { url: string; title: string; text: string; forms: FormValue[] }

/** Parse PAGE_STATE_FUNCTION output: the raw JSON, or the Playwright MCP "### Result" wrapper around it. */
export function parsePageState(text: string): PageState | null {
  let value: unknown = text.trim();
  const wrapped = /^### Result\s*\n([\s\S]*?)(?:\n### |$)/.exec(value as string);
  if (wrapped) value = wrapped[1]!.trim();
  // The JSON string may be JSON-quoted once (MCP wrapper) or not at all.
  for (let i = 0; i < 3 && typeof value === 'string'; i++) {
    try { value = JSON.parse(value); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const o = value as Record<string, unknown>;
  if (typeof o.url !== 'string' || typeof o.text !== 'string') return null;
  const forms = Array.isArray(o.forms)
    ? o.forms.flatMap((f): FormValue[] => {
      const v = f as Record<string, unknown> | null;
      return v && typeof v.label === 'string' && typeof v.value === 'string' ? [{ label: v.label, value: v.value }] : [];
    })
    : [];
  return { url: o.url, title: typeof o.title === 'string' ? o.title : '', text: o.text, forms };
}

/**
 * Drop near-duplicate frames and cap the count. Input is chronological; the last element is the final frame.
 * A frame is dropped when it is within `threshold` of the previous kept frame and on the same URL (if the frame
 * before the final one is a near-duplicate of the final, that earlier one goes instead). Above `max`, the first and
 * last stay and the frames with the biggest change from their predecessor fill the rest, in chronological order.
 */
export function selectFrames<T extends { thumb: Uint8Array; url: string }>(frames: T[], max = MAX_FRAMES, threshold = 2): T[] {
  if (frames.length === 0) return [];
  const final = frames[frames.length - 1]!;
  if (max <= 1) return [final];
  const seq: T[] = [];
  for (const frame of frames.slice(0, -1)) {
    const prev = seq[seq.length - 1];
    if (prev && prev.url === frame.url && thumbDiff(prev.thumb, frame.thumb) < threshold) continue;
    seq.push(frame);
  }
  const last = seq[seq.length - 1];
  if (last && last.url === final.url && thumbDiff(last.thumb, final.thumb) < threshold) seq.pop();
  seq.push(final);
  if (seq.length <= max) return seq;
  const score = (i: number): number => thumbDiff(seq[i - 1]!.thumb, seq[i]!.thumb) + (seq[i - 1]!.url !== seq[i]!.url ? 50 : 0);
  const middle = Array.from({ length: seq.length - 2 }, (_, k) => k + 1).sort((a, b) => score(b) - score(a) || a - b).slice(0, max - 2);
  const keep = new Set([0, seq.length - 1, ...middle]);
  return seq.filter((_, i) => keep.has(i));
}

/** One harness capture held in memory until the run ends. */
export interface CapturedFrame { step: number; url: string; text: string; forms: FormValue[]; png: Buffer; thumb: Uint8Array; final?: boolean }

/** A frame from the PNG bytes and the page-state text; null if the PNG cannot be decoded. */
export function toCapturedFrame(png: Buffer, state: string | null, step: number, final = false): CapturedFrame | null {
  try {
    const parsed = state === null ? null : parsePageState(state);
    return { step, url: parsed?.url ?? '', text: parsed?.text ?? '', forms: parsed?.forms ?? [], png, thumb: grayThumb(decodePng(png)), ...(final ? { final: true } : {}) };
  } catch { return null; }
}

/**
 * Select the frames to keep and name their files. Earlier frames are `<unique>.step-NN.png` (a `-b`, `-c`..
 * suffix when two share a step); the final one is `<unique>.final.png`. Earlier text is capped for the sidecar.
 */
export function packEvidence(frames: CapturedFrame[], unique: string, captureMs: number): { sidecar: EvidenceSidecar; pngs: { file: string; png: Buffer }[] } {
  const kept = selectFrames(frames);
  const used = new Map<number, number>();
  const pngs: { file: string; png: Buffer }[] = [];
  const out = kept.map((frame, i): EvidenceFrame => {
    let file = `${unique}.final.png`;
    if (!frame.final) {
      const n = used.get(frame.step) ?? 0;
      used.set(frame.step, n + 1);
      file = `${unique}.step-${String(frame.step).padStart(2, '0')}${n ? `-${String.fromCharCode(97 + n)}` : ''}.png`;
    }
    pngs.push({ file, png: frame.png });
    const entry: EvidenceFrame = { id: `F${i + 1}`, step: frame.step, url: frame.url, file, text: frame.text.slice(0, frame.final ? FINAL_TEXT_CAP : STEP_TEXT_CAP) };
    if (frame.final) { entry.final = true; entry.forms = frame.forms; }
    return entry;
  });
  return { sidecar: { frames: out, captured: frames.length, kept: out.length, captureMs }, pngs };
}
