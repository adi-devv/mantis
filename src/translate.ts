import type { RawNode, Snapshot } from './capture/index.js';

/** Soft cap on the text view; past this, offscreen content is dropped progressively. */
export const BUDGET_CHARS = 6000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface Level {
  /** Collapse runs of same-role siblings longer than this... */
  over: number;
  /** ...keeping this many. */
  keep: number;
  dropOffscreenText: boolean;
  dropOffscreenAll: boolean;
}

const LEVELS: Level[] = [
  { over: 8, keep: 5, dropOffscreenText: false, dropOffscreenAll: false },
  { over: 8, keep: 5, dropOffscreenText: true, dropOffscreenAll: false },
  { over: 4, keep: 3, dropOffscreenText: true, dropOffscreenAll: false },
  { over: 3, keep: 2, dropOffscreenText: true, dropOffscreenAll: true },
];

const quote = (s: string): string => s.replace(/"/g, "'");
const norm = (s: string): string => s.toLowerCase().replace(/[\s:*]+$/g, '').trim();
const plural = (role: string): string => role + (/[xs]$/.test(role) ? 'es' : 's');

function interactiveLine(n: RawNode): string {
  const parts = [...n.states];
  if (n.value) parts.push(`value "${quote(n.value)}"`);
  if (n.options?.length) parts.push(`options: ${n.options.map(quote).join(' | ')}`);
  if (n.href) parts.push(`href ${n.href}`);
  if (n.covered) parts.push('covered');
  const name = n.name ? ` "${quote(n.name)}"` : '';
  return `#${n.id} ${n.role}${name}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

function regionLine(n: RawNode): string {
  const name = n.name ? ` "${quote(n.name)}"` : '';
  return `[${n.role}${name}${n.covers ? ' — covers page' : ''}]`;
}

function renderBody(snap: Snapshot, lvl: Level): { lines: string[]; dropped: number } {
  const nodes = snap.nodes;
  let dropped = 0;
  const kids = new Map<number, number[]>();
  nodes.forEach((n, i) => {
    const list = kids.get(n.parent);
    if (list) list.push(i);
    else kids.set(n.parent, [i]);
  });

  const survives = (n: RawNode): boolean => {
    if (n.kind === 'region' || n.inViewport) return true;
    if (lvl.dropOffscreenAll || (lvl.dropOffscreenText && n.kind === 'text')) {
      dropped++;
      return false;
    }
    return true;
  };

  const runEnd = (items: number[], k: number): number => {
    const role = nodes[items[k]].role;
    let j = k;
    while (j + 1 < items.length && nodes[items[j + 1]].kind === 'interactive' && nodes[items[j + 1]].role === role) j++;
    return j;
  };

  const renderList = (idxs: number[], depth: number, owner = ''): string[] => {
    const pad = '  '.repeat(depth);
    const items = idxs.filter((i) => survives(nodes[i]));
    const out: string[] = [];
    let k = 0;
    while (k < items.length) {
      const n = nodes[items[k]];
      const next = k + 1 < items.length ? nodes[items[k + 1]] : undefined;
      const prev = k > 0 ? nodes[items[k - 1]] : undefined;

      if (n.kind === 'region') {
        const inner = renderList(kids.get(items[k]) ?? [], depth + 1, n.name);
        if (inner.length) out.push(pad + regionLine(n), ...inner);
        k++;
      } else if (n.kind === 'interactive') {
        const j = runEnd(items, k);
        const runLen = j - k + 1;
        if (runLen > lvl.over && runLen - lvl.keep >= 2) {
          for (let m = k; m < k + lvl.keep; m++) out.push(pad + interactiveLine(nodes[items[m]]));
          const first = nodes[items[k + lvl.keep]].id;
          const last = nodes[items[j]].id;
          out.push(`${pad}…and ${runLen - lvl.keep} more ${plural(n.role)} (#${first}–#${last})`);
          k = j + 1;
        } else {
          out.push(pad + interactiveLine(n));
          k++;
        }
      } else if (n.kind === 'heading') {
        if (k === 0 && owner && norm(n.name) === norm(owner)) { k++; continue; } // repeats the region title
        const hashes = '#'.repeat(Math.min(n.level ?? 1, 4));
        if (next?.kind === 'interactive' && norm(next.name) === norm(n.name)) {
          // Heading that is just a link (article cards): one line, keeps the id.
          out.push(`${pad}${hashes} ${interactiveLine(next)}`);
          k += 2;
        } else {
          out.push(`${pad}${hashes} ${quote(n.name)}`);
          k++;
        }
      } else {
        // text: skip when it only repeats a neighbouring control's name
        const dup = (m?: RawNode): boolean => m?.kind === 'interactive' && norm(m.name) === norm(n.name);
        if (dup(next) || dup(prev)) {
          k++;
        } else if (next?.kind === 'interactive' && runEnd(items, k + 1) - k <= lvl.over) {
          out.push(`${pad}"${quote(n.name)}" ${interactiveLine(next)}`);
          k += 2;
        } else {
          out.push(`${pad}"${quote(n.name)}"`);
          k++;
        }
      }
    }
    return out;
  };

  // A dialog that blocks the page goes first: it is the only thing the agent can act on.
  const top = kids.get(-1) ?? [];
  const blocking = (i: number): boolean => nodes[i].kind === 'region' && nodes[i].covers === true;
  const ordered = [...top.filter(blocking), ...top.filter((i) => !blocking(i))];
  return { lines: renderList(ordered, 0), dropped };
}

/** Snapshot -> the numbered text view an agent reads. */
export function translate(snap: Snapshot, budget: number = BUDGET_CHARS): string {
  const header = `Page: ${snap.title || '(no title)'}  (${snap.url.length > 160 ? snap.url.slice(0, 159) + '…' : snap.url})`;
  const tail: string[] = [];
  if (snap.truncated) tail.push('(capture stopped: page has more than 3000 elements)');

  let result = renderBody(snap, LEVELS[0]);
  const fits = (r: { lines: string[] }): boolean => [header, ...r.lines, ...tail].join('\n').length <= budget;
  for (let i = 1; !fits(result) && i < LEVELS.length; i++) result = renderBody(snap, LEVELS[i]);

  let lines = result.lines;
  let note = result.dropped > 0 ? `(trimmed: ${result.dropped} items offscreen — scroll or read again)` : '';
  if (!fits(result)) {
    // Last resort: cut lines to the budget.
    let size = header.length + tail.join('\n').length + 80;
    let cut = 0;
    while (cut < lines.length && size + lines[cut].length + 1 <= budget) size += lines[cut++].length + 1;
    const left = lines.length - cut;
    lines = lines.slice(0, cut);
    note = `(trimmed: ${left + result.dropped} more lines — scroll or read again)`;
  }
  if (!lines.length) lines = ['(no visible content)'];
  return [header, ...lines, ...tail, ...(note ? [note] : [])].join('\n');
}
