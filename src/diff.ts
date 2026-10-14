import type { RawNode, Snapshot } from './capture/index.js';
import { interactiveLine as fmtInteractive, textLine } from './translate.js';

/** Soft cap on the diff body; past this the diff degrades to summaries. */
export const DIFF_BUDGET_CHARS = 1200;

export const NO_CHANGE = '(no visible change)';

const quote = (s: string): string => s.replace(/"/g, "'");
const norm = (s: string): string => s.toLowerCase().replace(/[\s:*]+$/g, '').trim();
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/** "/login → /dashboard" within one origin, full URLs otherwise. */
export function urlChange(from: string, to: string): string {
  if (to.startsWith('chrome-error:')) return `${from} → (load error)`;
  try {
    const a = new URL(from);
    const b = new URL(to);
    if (a.origin === b.origin) return `${a.pathname + a.search + a.hash} → ${b.pathname + b.search + b.hash}`;
  } catch { /* fall through to full URLs */ }
  return `${from} → ${to}`;
}

/** The `url:` / `title:` lines for a before/after pair (empty when neither changed). */
export function headerLines(before: Pick<Snapshot, 'url' | 'title'>, after: Pick<Snapshot, 'url' | 'title'>): string[] {
  const out: string[] = [];
  if (after.url !== before.url) out.push(`url: ${urlChange(before.url, after.url)}`);
  if (!after.url.startsWith('chrome-error:') && after.title !== before.title) {
    out.push(`title: "${before.title}" → "${after.title}"`);
  }
  return out;
}

// ---- line formats (kept in step with translate.ts) -------------------------

/** Same format as the full view; hrefs kept (a new link is something to follow) unless the name is a guess. */
function interactiveLine(n: RawNode): string {
  return fmtInteractive(n, { showHref: !n.inferred });
}

function regionLabel(n: RawNode): string {
  const name = n.name ? ` "${quote(n.name)}"` : '';
  return `[${n.role}${name}${n.covers ? ' — covers page' : ''}]`;
}

const bareRegion = (n: RawNode): string => `[${n.role}${n.name ? ` "${quote(n.name)}"` : ''}]`;
const hashes = (n: RawNode): string => '#'.repeat(Math.min(n.level ?? 1, 4));

/** `#12–#14` runs for a list of ids, at most `max` runs shown. */
function idRanges(ids: number[], max = 4): string {
  const sorted = [...ids].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < sorted.length; ) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    runs.push(j > i ? `#${sorted[i]}–#${sorted[j]}` : `#${sorted[i]}`);
    i = j + 1;
  }
  return runs.length > max ? `${runs.slice(0, max).join(', ')}, …` : runs.join(', ');
}

// ---- snapshot indexing -----------------------------------------------------

interface Indexed {
  nodes: RawNode[];
  /** Region key per node index (regions: their own key). Regions have no ids, so a key is the
   *  chain of ancestor labels plus an occurrence counter for look-alike siblings. */
  regionKey: string[];
  /** Key of the region that contains each node ('' = page top level). */
  container: string[];
  /** Text nodes that merely repeat the name of the adjacent control: never reported. */
  dup: boolean[];
  /** Multiset key of a heading/text node. */
  textKey: (string | undefined)[];
  byId: Map<number, RawNode>;
  regionKeys: Set<string>;
  textCount: Map<string, number>;
}

function index(snap: Snapshot): Indexed {
  const nodes = snap.nodes;
  const regionKey: string[] = nodes.map(() => '');
  const container: string[] = nodes.map(() => '');
  const seen = new Map<string, number>();
  const regionKeys = new Set<string>();
  nodes.forEach((n, i) => {
    const parentKey = n.parent >= 0 && n.parent < i ? regionKey[n.parent] : '';
    container[i] = parentKey;
    if (n.kind !== 'region') return;
    const base = `${parentKey}/${n.role} "${n.name}"`;
    const k = (seen.get(base) ?? 0) + 1;
    seen.set(base, k);
    regionKey[i] = `${base}#${k}`;
    regionKeys.add(regionKey[i]);
  });

  const adjacentControl = (i: number, d: number): RawNode | undefined => {
    const m = nodes[i + d];
    return m && m.kind === 'interactive' && m.parent === nodes[i].parent ? m : undefined;
  };
  const dup = nodes.map((n, i) => {
    if (n.kind !== 'text') return false;
    const same = (m?: RawNode): boolean => !!m && norm(m.name) === norm(n.name);
    return same(adjacentControl(i, 1)) || same(adjacentControl(i, -1));
  });

  const textKey: (string | undefined)[] = [];
  const textCount = new Map<string, number>();
  const byId = new Map<number, RawNode>();
  nodes.forEach((n, i) => {
    if (n.kind === 'interactive' && n.id !== undefined) byId.set(n.id, n);
    if ((n.kind === 'text' || n.kind === 'heading') && !dup[i]) {
      const key = `${container[i]}|${n.kind}|${n.name}`;
      textKey[i] = key;
      textCount.set(key, (textCount.get(key) ?? 0) + 1);
    }
  });
  return { nodes, regionKey, container, dup, textKey, byId, regionKeys, textCount };
}

/** Indices of heading/text nodes beyond the number of identical ones in `other`. */
function surplusText(a: Indexed, b: Indexed): number[] {
  const used = new Map<string, number>();
  const out: number[] = [];
  a.nodes.forEach((_, i) => {
    const key = a.textKey[i];
    if (key === undefined) return;
    const k = (used.get(key) ?? 0) + 1;
    used.set(key, k);
    if (k > (b.textCount.get(key) ?? 0)) out.push(i);
  });
  return out;
}

// ---- change detection ------------------------------------------------------

function describeChange(a: RawNode, b: RawNode): { clauses: string[]; covered?: boolean } {
  const clauses: string[] = [];
  if (a.role !== b.role) clauses.push(`role ${a.role} → ${b.role}`);
  if (a.name !== b.name) clauses.push(`name "${quote(a.name)}" → "${quote(b.name)}"`);
  const va = a.value ?? '';
  const vb = b.value ?? '';
  if (va !== vb) clauses.push(`value "${quote(va)}" → "${quote(vb)}"`);
  const gained = b.states.filter((s) => !a.states.includes(s));
  const lost = a.states.filter((s) => !b.states.includes(s));
  if (gained.length) clauses.push(`now ${gained.join(', ')}`);
  if (lost.length) clauses.push(`no longer ${lost.join(', ')}`);
  if ((a.options ?? []).join('|') !== (b.options ?? []).join('|')) clauses.push('options changed');
  return { clauses, covered: a.covered !== b.covered ? b.covered : undefined };
}

// ---- the diff --------------------------------------------------------------

interface Group {
  /** Header for a newly appeared region (e.g. a dialog). */
  header?: string;
  /** New region that blocks the page: its contents are what the agent can act on. */
  blocking: boolean;
  /** Region label that prefixes the first line when the region already existed. */
  where: string;
  items: string[];
  /** Number of items counting everything (for summaries). */
  interactive: number;
}

interface Parts {
  groups: Group[];
  changes: string[];
  removedRuns: string[];
  removedText: string[];
  regionLines: string[];
}

function collect(before: Snapshot, after: Snapshot): Parts {
  const A = index(before);
  const B = index(after);

  // ---- added ----
  const groups: Group[] = [];
  const groupOf = new Map<string, Group>();
  const getGroup = (container: string, where: string): Group => {
    let g = groupOf.get(container);
    if (!g) {
      g = { blocking: false, where, items: [], interactive: 0 };
      groupOf.set(container, g);
      groups.push(g);
    }
    return g;
  };

  // Text that changed in place ("Count: 1" → "Count: 2") reads better as one line.
  const addedText = surplusText(B, A);
  const goneText = surplusText(A, B);
  const pairLines: string[] = [];
  const paired = new Set<number>();
  const pairedGone = new Set<number>();
  {
    const bucket = (idxs: number[], ix: Indexed): Map<string, number[]> => {
      const m = new Map<string, number[]>();
      for (const i of idxs) {
        const k = `${ix.container[i]}\u0000${ix.nodes[i].kind}`;
        (m.get(k) ?? m.set(k, []).get(k)!).push(i);
      }
      return m;
    };
    const ba = bucket(addedText, B);
    const bg = bucket(goneText, A);
    for (const [k, ai] of ba) {
      const gi = bg.get(k);
      if (!gi || gi.length !== ai.length || ai.length > 3) continue;
      ai.forEach((bi, n) => {
        const nb = B.nodes[bi];
        const na = A.nodes[gi[n]];
        const tag = nb.kind === 'heading' ? `${hashes(nb)} ` : '';
        pairLines.push(`~ ${tag}"${quote(clip(na.name, 50))}" → "${quote(clip(nb.name, 50))}"`);
        paired.add(bi);
        pairedGone.add(gi[n]);
      });
    }
  }

  const consumed = new Set<number>();
  const addedTextSet = new Set(addedText);
  const isAdded = (i: number): boolean => {
    const n = B.nodes[i];
    if (n.kind === 'interactive') return n.id !== undefined && !A.byId.has(n.id);
    if (n.kind === 'region') return !A.regionKeys.has(B.regionKey[i]);
    return addedTextSet.has(i) && !paired.has(i);
  };

  B.nodes.forEach((n, i) => {
    if (consumed.has(i)) return;
    if (n.kind === 'region') {
      if (isAdded(i)) {
        const g = getGroup(B.regionKey[i], bareRegion(n));
        g.header = regionLabel(n);
        g.blocking = n.covers === true;
      }
      return;
    }
    if (!isAdded(i)) return;
    const parent = n.parent >= 0 ? B.nodes[n.parent] : undefined;
    const g = getGroup(B.container[i], parent ? bareRegion(parent) : '');
    const next = B.nodes[i + 1];
    const nextIsAddedControl =
      next && next.kind === 'interactive' && next.parent === n.parent && isAdded(i + 1);
    if (n.kind === 'interactive') {
      g.items.push(interactiveLine(n));
      g.interactive++;
    } else if (n.kind === 'heading') {
      if (parent && n.parent === i - 1 && norm(n.name) === norm(parent.name)) return; // repeats the region title
      if (nextIsAddedControl && norm(next.name) === norm(n.name)) {
        g.items.push(`${hashes(n)} ${interactiveLine(next)}`);
        g.interactive++;
        consumed.add(i + 1);
      } else {
        g.items.push(`${hashes(n)} ${quote(n.name)}`);
      }
    } else if (nextIsAddedControl && !n.live) {
      g.items.push(`${textLine(n)} ${interactiveLine(next)}`);
      g.interactive++;
      consumed.add(i + 1);
    } else {
      g.items.push(textLine(n));
    }
  });

  // ---- removed ----
  const regionsGone = new Set<string>();
  A.nodes.forEach((n, i) => {
    if (n.kind === 'region' && !B.regionKeys.has(A.regionKey[i])) regionsGone.add(A.regionKey[i]);
  });
  const inGoneRegion = (i: number): boolean => {
    for (let p = A.nodes[i].parent; p >= 0; p = A.nodes[p].parent) if (regionsGone.has(A.regionKey[p])) return true;
    return false;
  };

  const regionLines: string[] = [];
  A.nodes.forEach((n, i) => {
    if (n.kind !== 'region' || !regionsGone.has(A.regionKey[i])) return;
    const parentGone = n.parent >= 0 && regionsGone.has(A.regionKey[n.parent]);
    if (parentGone) return;
    // Everything that was in it and is not somewhere else now.
    let items = 0;
    const inside = (j: number): boolean => {
      for (let p = A.nodes[j].parent; p >= 0; p = A.nodes[p].parent) if (p === i) return true;
      return false;
    };
    A.nodes.forEach((m, j) => {
      if (j === i || !inside(j) || m.kind === 'region') return;
      if (m.kind === 'interactive') { if (m.id !== undefined && !B.byId.has(m.id)) items++; }
      else if (!A.dup[j]) items++;
    });
    const verb = n.role === 'dialog' ? 'closed' : 'removed';
    regionLines.push(`- ${bareRegion(n)} ${verb}${items ? ` (${items} item${items === 1 ? '' : 's'})` : ''}`);
  });

  const goneIds: RawNode[] = [];
  A.nodes.forEach((n, i) => {
    if (n.kind === 'interactive' && n.id !== undefined && !B.byId.has(n.id) && !inGoneRegion(i)) goneIds.push(n);
  });
  goneIds.sort((a, b) => a.id! - b.id!);
  const removedRuns: string[] = [];
  for (let i = 0; i < goneIds.length; ) {
    let j = i;
    while (j + 1 < goneIds.length && goneIds[j + 1].id === goneIds[j].id! + 1 && goneIds[j + 1].role === goneIds[i].role) j++;
    removedRuns.push(j > i ? `#${goneIds[i].id}–#${goneIds[j].id} ${goneIds[i].role}` : `#${goneIds[i].id} ${goneIds[i].role}`);
    i = j + 1;
  }
  const removedText = goneText
    .filter((i) => !pairedGone.has(i) && !inGoneRegion(i))
    .map((i) => {
      const n = A.nodes[i];
      return n.kind === 'heading' ? `${hashes(n)} ${quote(clip(n.name, 40))}` : `"${quote(clip(n.name, 40))}"`;
    });

  // ---- changed ----
  const changes: string[] = [...pairLines];
  const coveredOn: number[] = [];
  const coveredOff: number[] = [];
  const perElement: string[] = [];
  B.nodes.forEach((n) => {
    if (n.kind !== 'interactive' || n.id === undefined) return;
    const a = A.byId.get(n.id);
    if (!a) return;
    const { clauses, covered } = describeChange(a, n);
    if (covered === true) coveredOn.push(n.id);
    else if (covered === false) coveredOff.push(n.id);
    if (clauses.length) perElement.push(`~ ${interactiveHead(n)}: ${clauses.join('; ')}`);
  });
  // Regions whose "covers page" flag flipped.
  B.nodes.forEach((n, i) => {
    if (n.kind !== 'region' || !A.regionKeys.has(B.regionKey[i])) return;
    const j = A.regionKey.indexOf(B.regionKey[i]);
    if (j >= 0 && (A.nodes[j].covers === true) !== (n.covers === true)) {
      changes.push(`~ ${bareRegion(n)}: ${n.covers ? 'now covers page' : 'no longer covers page'}`);
    }
  });
  const coverLine = (ids: number[], now: boolean): void => {
    if (!ids.length) return;
    if (ids.length >= 3) changes.push(`~ ${ids.length} items ${now ? 'now covered' : 'no longer covered'} (${idRanges(ids)})`);
    else for (const id of ids) changes.push(`~ ${interactiveHead(B.byId.get(id)!)}: ${now ? 'now covered' : 'no longer covered'}`);
  };
  changes.push(...perElement);
  coverLine(coveredOn, true);
  coverLine(coveredOff, false);

  return { groups, changes, removedRuns, removedText, regionLines };
}

/** `#14 button "Save"` without states: the stable part of a changed element. */
function interactiveHead(n: RawNode): string {
  return `#${n.id} ${n.role}${n.name ? ` ${n.inferred ? '~' : ''}"${quote(n.name)}"` : ''}`;
}

type Level = 0 | 1 | 2;

function render(p: Parts, level: Level): string[] {
  const out: string[] = [];
  const where = (g: Group): string => g.where || 'page';

  for (const g of p.groups) {
    const total = g.items.length;
    let items = g.items;
    let summary = '';
    if (level === 1 && total > 6) {
      items = g.items.slice(0, 4);
      summary = `… and ${total - 4} more new items in ${where(g)} — call read() to see them`;
    } else if (level >= 2) {
      if (g.header && g.blocking) {
        // The only things the agent can act on: keep the controls, drop the prose.
        const keep = g.items.filter((s) => /^#\d+ /.test(s)).slice(0, 8);
        items = keep;
        if (total > keep.length) summary = `… ${total - keep.length} more in ${where(g)} — call read() to see them`;
      } else if (total > 0) {
        items = [];
        summary = `${total} new item${total === 1 ? '' : 's'} in ${where(g)} — call read() to see ${total === 1 ? 'it' : 'them'}`;
      }
    }
    const lines: string[] = [];
    if (g.header) lines.push(g.header);
    lines.push(...items);
    if (summary) lines.push(summary);
    lines.forEach((l, k) => {
      const prefix = !g.header && g.where && k === 0 && items.length ? `${g.where} ` : '';
      out.push(`+ ${prefix}${l}`);
    });
  }

  const capChanges = level === 0 ? Infinity : level === 1 ? 8 : 4;
  p.changes.slice(0, capChanges).forEach((l) => out.push(l));
  if (p.changes.length > capChanges) out.push(`~ … and ${p.changes.length - capChanges} more changed — call read() to see them`);

  out.push(...p.regionLines);

  const capRuns = level === 0 ? Infinity : level === 1 ? 6 : 3;
  const bits = [...p.removedRuns];
  const runs = bits.slice(0, capRuns);
  const texts = p.removedText.slice(0, level === 0 ? 3 : level === 1 ? 2 : 1);
  const hidden = bits.length - runs.length + p.removedText.length - texts.length;
  const all = [...runs, ...texts];
  if (all.length) out.push(`- removed: ${all.join(', ')}${hidden > 0 ? `, …+${hidden} more` : ''}`);
  return out;
}

/**
 * What changed between two snapshots of the same page, as short text lines
 * (`url:`/`title:` first, then `+` added, `~` changed, `-` removed).
 * Pure: no browser needed. Returns "(no visible change)" when nothing differs.
 * Callers should not diff snapshots of different documents (ids restart per page load).
 */
export function diffSnapshots(before: Snapshot, after: Snapshot, budget: number = DIFF_BUDGET_CHARS): string {
  const head = headerLines(before, after);
  const parts = collect(before, after);
  const size = (lines: string[]): number => [...head, ...lines].join('\n').length;

  let body: string[] = [];
  for (const level of [0, 1, 2] as const) {
    body = render(parts, level);
    if (size(body) <= budget) break;
  }
  if (size(body) > budget) {
    const note = '… (diff truncated — call read() for the full view)';
    const kept: string[] = [];
    let used = head.join('\n').length + note.length + 2;
    for (const line of body) {
      if (used + line.length + 1 > budget) break;
      kept.push(line);
      used += line.length + 1;
    }
    body = [...kept, note];
  }
  const lines = [...head, ...body];
  return lines.length ? lines.join('\n') : NO_CHANGE;
}
