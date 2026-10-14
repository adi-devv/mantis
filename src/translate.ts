import type { RawNode, Snapshot } from './capture/index.js';

/** Soft cap on the text view; past this, offscreen content is dropped progressively. */
export const BUDGET_CHARS = 6000;

/** Prose budget: paragraphs shown in the default view before "…N more paragraphs". */
const PROSE_MAX = 8;
const PROSE_CHARS = 120;

export interface ReadOptions {
  /** Only this region (case-insensitive substring of its label/name, e.g. "nav", "sidebar"). */
  region?: string;
  /** No trimming: every paragraph, every link, every href, no run collapsing, no budget. */
  full?: boolean;
}

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
  /** Longest name inside a compacted row line. */
  rowName: number;
}

const LEVELS: Level[] = [
  { over: 8, keep: 5, dropOffscreenText: false, dropOffscreenAll: false, rowName: 60 },
  { over: 8, keep: 5, dropOffscreenText: false, dropOffscreenAll: false, rowName: 44 },
  { over: 8, keep: 5, dropOffscreenText: true, dropOffscreenAll: false, rowName: 44 },
  { over: 4, keep: 3, dropOffscreenText: true, dropOffscreenAll: false, rowName: 40 },
  { over: 3, keep: 2, dropOffscreenText: true, dropOffscreenAll: true, rowName: 40 },
];
const FULL_LEVEL: Level = { over: Infinity, keep: 0, dropOffscreenText: false, dropOffscreenAll: false, rowName: 0 };

export const quote = (s: string): string => s.replace(/"/g, "'");
const norm = (s: string): string => s.toLowerCase().replace(/[\s:*]+$/g, '').trim();
const plural = (role: string): string => role + (/[xs]$/.test(role) ? 'es' : 's');
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const GENERIC_LINK = /^(click here|here|read more|more|learn more|link|details|this|view|open|go|continue|download|see more|more info)$/i;
const ROW_FILLER = new Set(['by', 'at', 'of', 'on', 'in', 'to', 'from', 'via', 'and', 'or', 'with']);

interface LineOpts {
  omitRole?: boolean;
  showHref?: boolean;
  /** Clip the name to this many chars (0/undefined: no clipping). */
  maxName?: number;
}

/** One control as a line: `#14 button "Save" (primary)`; guessed names are marked `~"name"`. */
export function interactiveLine(n: RawNode, o: LineOpts = {}): string {
  const parts = n.states.map((s) => (s === 'error' && n.errorText ? `error: "${quote(clip(n.errorText, 60))}"` : s));
  if (n.value) parts.push(`value "${quote(n.value)}"`);
  if (n.options?.length) parts.push(`options: ${n.options.map(quote).join(' | ')}`);
  if (n.href && o.showHref) parts.push(`href ${n.href}`);
  if (n.covered) parts.push('covered');
  const shown = o.maxName ? clip(n.name, o.maxName) : n.name;
  const name = shown ? ` ${n.inferred ? '~' : ''}"${quote(shown)}"` : '';
  return `#${n.id}${o.omitRole ? '' : ' ' + n.role}${name}${parts.length ? ` (${parts.join(', ')})` : ''}`;
}

/** Plain text line; live messages (alerts, toasts) are flagged. */
export function textLine(n: RawNode): string {
  const mark = n.live === 'alert' ? '⚠ ' : n.live === 'status' ? 'ℹ ' : '';
  return `${mark}"${quote(n.name)}"`;
}

function regionLine(n: RawNode): string {
  const name = n.name ? ` "${quote(n.name)}"` : '';
  return `[${n.role}${name}${n.covers ? ' — covers page' : ''}]`;
}

// ---- regions for landmark-less pages ---------------------------------------

const LANDMARKS = new Set(['header', 'nav', 'main', 'footer', 'aside']);

/**
 * Pages with no header/nav/main/footer landmarks get coarse regions from bounding boxes:
 * [top bar] (full-width strip at the top), [sidebar] (narrow tall column at a side),
 * [bottom] (strip at the end), [main] (the rest). Conservative: if nothing but "main"
 * would come out, the page is returned unchanged.
 */
export function deriveRegions(snap: Snapshot): RawNode[] {
  const nodes = snap.nodes;
  const pg = snap.page;
  if (!pg || nodes.some((n) => n.kind === 'region' && LANDMARKS.has(n.role))) return nodes;
  const W = pg.vw;
  const H = pg.docH;

  type Label = 'top bar' | 'sidebar' | 'bottom' | 'main';
  const cand: number[] = [];
  nodes.forEach((n, i) => {
    if (n.parent !== -1 || !n.box) return;
    if (n.kind === 'region' && n.role === 'dialog') return;
    cand.push(i);
  });
  if (cand.length < 4) return nodes;

  const label = new Map<number, Label>();
  const span = (idxs: number[]): { l: number; r: number; t: number; b: number } => ({
    l: Math.min(...idxs.map((i) => nodes[i].box![0])),
    r: Math.max(...idxs.map((i) => nodes[i].box![0] + nodes[i].box![2])),
    t: Math.min(...idxs.map((i) => nodes[i].box![1])),
    b: Math.max(...idxs.map((i) => nodes[i].box![1] + nodes[i].box![3])),
  });

  // Bars/strips are chrome, not content: items of a repeated row (list entries) never count.
  const band = (first: number, pool: number[]): number[] => {
    const [, y, , h] = nodes[first].box!;
    return pool.filter((i) => {
      const [, yy, , hh] = nodes[i].box!;
      const c = yy + hh / 2;
      return hh > 0 && c >= y && c <= y + h;
    });
  };
  const flat = cand.filter((i) => nodes[i].row === undefined && nodes[i].box![3] > 0);
  const byTop = [...flat].sort((a, b) => nodes[a].box![1] - nodes[b].box![1]);
  // the topmost line of items, if it sits near the top edge
  const top = byTop.length && nodes[byTop[0]].box![1] + nodes[byTop[0]].box![3] <= 100 ? band(byTop[0], flat) : [];
  const topSpan = top.length >= 2 ? span(top) : null;
  if (topSpan && topSpan.r - topSpan.l >= 0.45 * W) top.forEach((i) => label.set(i, 'top bar'));

  const byBottom = flat.filter((i) => !label.has(i)).sort((a, b) => nodes[b].box![1] + nodes[b].box![3] - nodes[a].box![1] - nodes[a].box![3]);
  // the last line of items, if it sits near the end of the document
  const bottom = byBottom.length && nodes[byBottom[0]].box![1] >= H - 140 && nodes[byBottom[0]].box![1] >= 0.6 * H ? band(byBottom[0], byBottom) : [];
  const botSpan = bottom.length >= 2 ? span(bottom) : null;
  if (botSpan && botSpan.r - botSpan.l >= 0.45 * W && cand.length - bottom.length - top.length >= 2) {
    bottom.forEach((i) => label.set(i, 'bottom'));
  }

  for (const side of ['left', 'right'] as const) {
    const col = cand.filter((i) => {
      if (label.has(i) || nodes[i].row !== undefined) return false;
      const [x, , w] = nodes[i].box!;
      // flush against its side of the page, and narrow
      return side === 'left' ? x <= 0.1 * W && x + w <= 0.3 * W : x + w >= 0.9 * W && x >= 0.7 * W;
    });
    if (col.length < 3) continue;
    const s = span(col);
    const rest = cand.filter((i) => !label.has(i) && !col.includes(i));
    // A sidebar is a column of its own: nothing else shares its horizontal band (page-wide wrappers aside).
    const shared = rest.some((i) => {
      const [x, y, w, h] = nodes[i].box!;
      return w < 0.9 * W && x < s.r && x + w > s.l && y < s.b && y + h > s.t;
    });
    if (s.r - s.l <= 0.32 * W && s.b - s.t >= 200 && rest.length >= 2 && !shared) col.forEach((i) => label.set(i, 'sidebar'));
  }

  if (!label.size) return nodes;
  cand.forEach((i) => { if (!label.has(i)) label.set(i, 'main'); });

  // Rebuild the array with a synthetic region node ahead of each label's first member.
  const out: RawNode[] = [];
  const remap: number[] = [];
  const synth = new Map<Label, number>();
  nodes.forEach((n, i) => {
    const lb = label.get(i);
    if (lb && !synth.has(lb)) {
      synth.set(lb, out.length);
      out.push({
        kind: 'region', role: lb, name: '', states: [], parent: -1, depth: 0,
        inViewport: true, covered: false,
      });
    }
    remap[i] = out.length;
    out.push({ ...n, parent: lb ? synth.get(lb)! : n.parent >= 0 ? remap[n.parent] : -1 });
  });
  return out;
}

// ---- region filter ---------------------------------------------------------

function onlyRegion(nodes: RawNode[], query: string): RawNode[] | string {
  const q = query.toLowerCase().trim();
  const label = (n: RawNode): string => `${n.role}${n.name ? ' ' + n.name : ''}`.toLowerCase();
  const matches = (i: number): boolean => nodes[i].kind === 'region' && label(nodes[i]).includes(q);
  const inMatch = (i: number): boolean => {
    for (let p = nodes[i].parent; p >= 0; p = nodes[p].parent) if (matches(p)) return true;
    return false;
  };
  const roots = nodes.map((_, i) => i).filter((i) => matches(i) && !inMatch(i));
  if (!roots.length) {
    const names = nodes.filter((n) => n.kind === 'region').map((n) => `[${n.role}${n.name ? ` "${n.name}"` : ''}]`);
    const uniq = [...new Set(names)].slice(0, 12);
    return `error: no region matching "${query}"${uniq.length ? `; regions on this page: ${uniq.join(' ')}` : '; this page has no regions'}`;
  }
  const rootSet = new Set(roots);
  const keep = new Set<number>();
  nodes.forEach((_, i) => {
    if (rootSet.has(i)) keep.add(i);
    else for (let p = nodes[i].parent; p >= 0; p = nodes[p].parent) if (rootSet.has(p)) { keep.add(i); break; }
  });
  const remap: number[] = [];
  const out: RawNode[] = [];
  nodes.forEach((n, i) => {
    if (!keep.has(i)) return;
    remap[i] = out.length;
    out.push({ ...n, parent: rootSet.has(i) || n.parent < 0 ? -1 : remap[n.parent] });
  });
  return out;
}

// ---- rendering -------------------------------------------------------------

interface Ctx {
  full: boolean;
  /** How many links carry each (not guessed) name: 2-3 copies get an href to tell them apart. */
  dupNames: Map<string, number>;
}

function renderBody(nodes: RawNode[], lvl: Level, ctx: Ctx): { lines: string[]; dropped: number } {
  let dropped = 0;
  let proseShown = 0;
  const kids = new Map<number, number[]>();
  nodes.forEach((n, i) => {
    const list = kids.get(n.parent);
    if (list) list.push(i);
    else kids.set(n.parent, [i]);
  });

  /** hrefs are the biggest token waste; show one only when the name does not tell links apart. */
  const showHref = (n: RawNode): boolean => {
    if (ctx.full) return true;
    if (!n.href) return false;
    if (!n.name) return true;
    if (n.inferred || n.row !== undefined || n.inline) return false; // list rows: the name already says which one
    const copies = ctx.dupNames.get(norm(n.name)) ?? 0;
    return GENERIC_LINK.test(n.name) || (copies >= 2 && copies <= 3);
  };
  const line = (n: RawNode, o: LineOpts = {}): string => interactiveLine(n, { ...o, showHref: showHref(n) });

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
    while (j + 1 < items.length && nodes[items[j + 1]].kind === 'interactive' && nodes[items[j + 1]].role === role &&
      !nodes[items[j + 1]].inline) j++;
    return j;
  };

  /** Compact `a · b · c` rendering of the items of one repeated row. */
  const rowLine = (idxs: number[], showRole: boolean): string => {
    const parts: string[] = [];
    let prefix = '';
    let lastRole = showRole ? '' : 'link'; // roles are spelled out on the first row of a run only
    idxs.forEach((ix, p) => {
      const n = nodes[ix];
      if (n.kind === 'interactive') {
        parts.push(line(n, { omitRole: n.role === lastRole, maxName: lvl.rowName }));
        lastRole = n.role;
        return;
      }
      const t = n.name.replace(/\s+(by|from|at)$/i, ''); // "579 points by" -> "579 points"
      const near = (m?: RawNode): boolean => m?.kind === 'interactive' && (norm(m.name) === norm(t) || m.errorText === t);
      if (near(nodes[idxs[p - 1]]) || near(nodes[idxs[p + 1]])) return;
      if (ROW_FILLER.has(t.toLowerCase()) || !/[\p{L}\p{N}]/u.test(t)) return;
      if (/^\d+\.$/.test(t) && !parts.length) { prefix = t + ' '; return; }
      parts.push(clip(t, 50));
    });
    return prefix + parts.join(' · ');
  };

  const shapeOf = (idxs: number[]): string[] =>
    idxs.map((ix) => (nodes[ix].kind === 'interactive' ? nodes[ix].role : 't')).sort();
  const similar = (a: string[], b: string[]): boolean => {
    const pool = [...b];
    let common = 0;
    for (const t of a) {
      const at = pool.indexOf(t);
      if (at >= 0) { common++; pool.splice(at, 1); }
    }
    return common >= 0.6 * Math.max(a.length, b.length);
  };

  /** Row runs (>=3 similar consecutive rows with >=2 controls each): start position -> one line per row. */
  const compactRows = (items: number[]): Map<number, { end: number; text: string }> => {
    const out = new Map<number, { end: number; text: string }>();
    if (ctx.full) return out;
    interface Seg { start: number; end: number; group: number; ok: boolean; shape: string[] }
    const segs: Seg[] = [];
    for (let k = 0; k < items.length; ) {
      const n = nodes[items[k]];
      if (n.row === undefined) { k++; continue; }
      let j = k;
      while (j + 1 < items.length && nodes[items[j + 1]].row === n.row) j++;
      const idxs = items.slice(k, j + 1);
      const ok =
        idxs.every((ix) => nodes[ix].kind === 'interactive' || (nodes[ix].kind === 'text' && !nodes[ix].live)) &&
        idxs.filter((ix) => nodes[ix].kind === 'interactive').length >= 2;
      segs.push({ start: k, end: j, group: n.rowGroup ?? -1, ok, shape: shapeOf(idxs) });
      k = j + 1;
    }
    for (let s = 0; s < segs.length; ) {
      if (!segs[s].ok) { s++; continue; }
      let e = s;
      while (e + 1 < segs.length && segs[e + 1].ok && segs[e + 1].start === segs[e].end + 1 &&
        segs[e + 1].group === segs[s].group && similar(segs[e].shape, segs[e + 1].shape)) e++;
      if (e - s + 1 >= 3) {
        for (let q = s; q <= e; q++) {
          out.set(segs[q].start, { end: segs[q].end, text: rowLine(items.slice(segs[q].start, segs[q].end + 1), q === s) });
        }
      }
      s = e + 1;
    }
    return out;
  };

  const renderList = (idxs: number[], depth: number, owner = ''): string[] => {
    const pad = '  '.repeat(depth);
    const items = idxs.filter((i) => survives(nodes[i]));
    const rows = compactRows(items);
    const out: string[] = [];
    let skippedProse = 0;
    let k = 0;
    while (k < items.length) {
      const compact = rows.get(k);
      if (compact) {
        if (compact.text) out.push(pad + compact.text);
        k = compact.end + 1;
        continue;
      }
      const n = nodes[items[k]];
      const next = k + 1 < items.length ? nodes[items[k + 1]] : undefined;
      const prev = k > 0 ? nodes[items[k - 1]] : undefined;

      if (n.kind === 'region') {
        const inner = renderList(kids.get(items[k]) ?? [], depth + 1, n.name);
        if (inner.length) out.push(pad + regionLine(n), ...inner);
        k++;
      } else if (n.kind === 'prose') {
        let j = k + 1;
        while (j < items.length && nodes[items[j]].inline) j++;
        const links = items.slice(k + 1, j).filter((ix) => nodes[ix].kind === 'interactive');
        if (ctx.full || (n.inViewport && proseShown < PROSE_MAX)) {
          proseShown++;
          out.push(`${pad}"${quote(ctx.full ? n.name : clip(n.name, PROSE_CHARS))}"`);
          if (links.length) {
            const cap = ctx.full ? links.length : 8;
            const parts: string[] = [];
            let lastRole = '';
            for (const ix of links.slice(0, cap)) {
              const l = nodes[ix];
              parts.push(line(l, { omitRole: l.role === lastRole, maxName: ctx.full ? 0 : 40 }));
              lastRole = l.role;
            }
            if (links.length > cap) {
              parts.push(`…+${links.length - cap} more (#${nodes[links[cap]].id}–#${nodes[links[links.length - 1]].id})`);
            }
            out.push(`${pad}  links: ${parts.join(' · ')}`);
          }
        } else {
          skippedProse++;
        }
        k = j;
      } else if (n.kind === 'interactive') {
        const j = runEnd(items, k);
        const runLen = j - k + 1;
        if (runLen > lvl.over && runLen - lvl.keep >= 2) {
          for (let m = k; m < k + lvl.keep; m++) out.push(pad + line(nodes[items[m]]));
          const first = nodes[items[k + lvl.keep]].id;
          const last = nodes[items[j]].id;
          out.push(`${pad}…and ${runLen - lvl.keep} more ${plural(n.role)} (#${first}–#${last})`);
          k = j + 1;
        } else {
          out.push(pad + line(n));
          k++;
        }
      } else if (n.kind === 'heading') {
        if (k === 0 && owner && norm(n.name) === norm(owner)) { k++; continue; } // repeats the region title
        const hashes = '#'.repeat(Math.min(n.level ?? 1, 4));
        if (next?.kind === 'interactive' && norm(next.name) === norm(n.name)) {
          // Heading that is just a link (article cards): one line, keeps the id.
          out.push(`${pad}${hashes} ${line(next)}`);
          k += 2;
        } else {
          out.push(`${pad}${hashes} ${quote(n.name)}`);
          k++;
        }
      } else {
        // text: skip when it only repeats a neighbouring control's name (or its error message)
        const dup = (m?: RawNode): boolean =>
          m?.kind === 'interactive' && (norm(m.name) === norm(n.name) || (!!m.errorText && norm(m.errorText) === norm(n.name)));
        if (dup(next) || dup(prev)) {
          k++;
        } else if (n.live) {
          out.push(`${pad}${textLine(n)}`);
          k++;
        } else if (next?.kind === 'interactive' && !next.inline && runEnd(items, k + 1) - k <= lvl.over) {
          out.push(`${pad}"${quote(n.name)}" ${line(next)}`);
          k += 2;
        } else {
          out.push(`${pad}"${quote(n.name)}"`);
          k++;
        }
      }
    }
    if (skippedProse) out.push(`${pad}…${skippedProse} more paragraph${skippedProse === 1 ? '' : 's'}`);
    return out;
  };

  // A dialog that blocks the page goes first: it is the only thing the agent can act on.
  const top = kids.get(-1) ?? [];
  const blocking = (i: number): boolean => nodes[i].kind === 'region' && nodes[i].covers === true;
  const ordered = [...top.filter(blocking), ...top.filter((i) => !blocking(i))];
  return { lines: renderList(ordered, 0), dropped };
}

/** Snapshot -> the numbered text view an agent reads. */
export function translate(snap: Snapshot, budget: number = BUDGET_CHARS, opts: ReadOptions = {}): string {
  const header = `Page: ${snap.title || '(no title)'}  (${snap.url.length > 160 ? snap.url.slice(0, 159) + '…' : snap.url})`;
  const tail: string[] = [];
  if (snap.truncated) tail.push('(capture stopped: page has more than 3000 elements)');

  let nodes = deriveRegions(snap);
  const head = [header];
  if (opts.region) {
    const picked = onlyRegion(nodes, opts.region);
    if (typeof picked === 'string') return picked;
    nodes = picked;
    budget = Math.max(budget, 2 * BUDGET_CHARS); // the agent asked for this region: allow more room
    head.push(`(region "${opts.region}" only)`);
  }
  const full = opts.full === true;
  if (full) budget = Infinity;

  const dupNames = new Map<string, number>();
  for (const n of nodes) {
    if (n.kind === 'interactive' && n.href && n.name && !n.inferred) {
      dupNames.set(norm(n.name), (dupNames.get(norm(n.name)) ?? 0) + 1);
    }
  }
  const ctx: Ctx = { full, dupNames };
  const levels = full ? [FULL_LEVEL] : LEVELS;

  let result = renderBody(nodes, levels[0], ctx);
  const fits = (r: { lines: string[] }): boolean => [...head, ...r.lines, ...tail].join('\n').length <= budget;
  for (let i = 1; !fits(result) && i < levels.length; i++) result = renderBody(nodes, levels[i], ctx);

  let lines = result.lines;
  let note = result.dropped > 0 ? `(trimmed: ${result.dropped} items offscreen — scroll or read again)` : '';
  if (!fits(result)) {
    // Last resort: cut lines to the budget.
    let size = head.join('\n').length + tail.join('\n').length + 80;
    let cut = 0;
    while (cut < lines.length && size + lines[cut].length + 1 <= budget) size += lines[cut++].length + 1;
    const left = lines.length - cut;
    lines = lines.slice(0, cut);
    note = `(trimmed: ${left + result.dropped} more lines — scroll or read again)`;
  }
  if (!lines.length) lines = ['(no visible content)'];
  return [...head, ...lines, ...tail, ...(note ? [note] : [])].join('\n');
}
