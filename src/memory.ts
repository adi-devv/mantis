import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { plural, quote } from './translate.js';
import type { RegionHook, RegionInfo } from './translate.js';

/**
 * Site memory: most sites repeat the same header / nav / sidebar / footer on every page, so a
 * region the agent has already seen on this site is replaced by a one-line summary.
 *
 * Two layers, one signature:
 *  - session memory: regions shown earlier in this MantisBrowser ("same as before");
 *  - persistent memory: regions seen in earlier sessions on the same origin ("known layout").
 *
 * Privacy: the only thing ever written to disk is, per origin, a hash of each region's rendering
 * (ids stripped), an item count and a timestamp. No text, names, values or URLs.
 */

/** Persistent entries older than this are ignored and dropped. */
export const MEMORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A region needs at least this many body lines (the `[nav]` line excluded) to be worth a summary. */
export const MIN_BODY_LINES = 3;
/** Most signatures kept per origin on disk (oldest dropped first). */
const MAX_ENTRIES = 300;
/** Entries are only rewritten for a repeat sighting when they are at least this old. */
const TOUCH_AFTER_MS = 24 * 60 * 60 * 1000;
/** The "known layout" line shows names up to about this many characters. */
const KNOWN_LINE_CHARS = 100;

// ---- pure helpers (unit-tested) -----------------------------------------------

/** Hash of a region's rendering with ids stripped: ids differ per page load, content does not. */
export function regionSignature(r: Pick<RegionInfo, 'role' | 'name' | 'lines'>): string {
  const body = r.lines.join('\n').replace(/#\d+/g, '#');
  return createHash('sha256').update(`${r.role}\u0000${r.name}\u0000${body}`).digest('hex').slice(0, 24);
}

/** Roles an agent usually came for (search boxes, inputs); hiding them behind a summary costs a round trip. */
const INPUT_ROLES = new Set(['textbox', 'searchbox', 'combobox']);

/** A region may be summarised only if it is not special, holds no text input, and is big enough to be worth it. */
export function isCollapsible(r: Pick<RegionInfo, 'blocked' | 'lines' | 'items'>): boolean {
  return !r.blocked && !r.items.some((i) => INPUT_ROLES.has(i.role)) && r.lines.length - 1 >= MIN_BODY_LINES;
}

/** `[nav]` or `[nav "Main"]`, exactly as the region line reads in the view. */
export function regionLabel(r: Pick<RegionInfo, 'role' | 'name'>): string {
  return `[${r.role}${r.name ? ` "${quote(r.name)}"` : ''}]`;
}

/** The text that `read({region})` needs to find this region again. */
function regionQuery(r: Pick<RegionInfo, 'role' | 'name'>): string {
  return r.name && !r.name.includes('"') && r.name.length <= 30 ? `${r.role} ${r.name}` : r.role;
}

/** `(#3–#10)`: the numbers that belong to this region (empty when it has no controls). */
export function idRange(items: RegionInfo['items']): string {
  if (!items.length) return '';
  const ids = items.map((i) => i.id);
  const lo = Math.min(...ids);
  const hi = Math.max(...ids);
  return lo === hi ? `(#${lo})` : `(#${lo}–#${hi})`;
}

/** `8 links`, `5 links, 1 searchbox`; falls back to the line count for regions without controls. */
export function describeItems(r: Pick<RegionInfo, 'items' | 'lines'>): string {
  if (!r.items.length) return `${r.lines.length - 1} lines of text`;
  const counts = new Map<string, number>();
  for (const i of r.items) counts.set(i.role, (counts.get(i.role) ?? 0) + 1);
  const parts = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([role, n]) => (n === 1 ? `1 ${role}` : `${n} ${plural(role)}`));
  const rest = counts.size - parts.length;
  return parts.join(', ') + (rest > 0 ? `, +${rest} more kinds` : '');
}

/** Region seen earlier in this session. */
export function sameAsBeforeLine(r: RegionInfo): string {
  const ids = idRange(r.items);
  return `${regionLabel(r)} same as before — ${describeItems(r)}${ids ? ' ' + ids : ''}; read({region: "${regionQuery(r)}"}) to expand`;
}

/** Region only known from an earlier session: enough names to act on without expanding. */
export function knownLayoutLine(r: RegionInfo): string {
  const ids = idRange(r.items);
  const head = `${regionLabel(r)} (known layout) — ${describeItems(r)}`;
  const names = r.items.map((i) => (i.name ? `${i.inferred ? '~' : ''}${i.name.replace(/\s+/g, ' ')}` : '')).filter(Boolean);
  const shown: string[] = [];
  let size = head.length + 2;
  for (const n of names) {
    const clipped = n.length > 24 ? n.slice(0, 23) + '…' : n;
    if (size + clipped.length + 3 > KNOWN_LINE_CHARS) break;
    shown.push(clipped);
    size += clipped.length + 3;
  }
  if (!shown.length) return `${head}${ids ? ' ' + ids : ''}; read({region: "${regionQuery(r)}"}) to expand`;
  const more = shown.length < names.length;
  return `${head}: ${shown.join(' · ')}${more ? ' · …' : ''}${ids ? (more ? '' : ' ') + ids : ''}`;
}

// ---- the store ------------------------------------------------------------------

export interface MemoryOptions {
  /** Default: on, unless MANTIS_MEMORY=0. */
  enabled?: boolean;
  /** Default: MANTIS_MEMORY_DIR, else ~/.cache/mantis/sites. */
  dir?: string;
  /** Clock, injectable for tests. */
  now?: () => number;
}

interface Entry {
  /** Number of controls the region had. */
  n: number;
  /** Last seen, epoch ms. */
  t: number;
}

/** The site a URL belongs to, or null when memory does not apply (about:, data:, error pages). */
export function originOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
    if (u.protocol === 'file:') return 'file://'; // local files count as one site
  } catch {
    // not a URL
  }
  return null;
}

const OFF = /^(0|false|off|no)$/i;

export class SiteMemory {
  readonly enabled: boolean;
  readonly dir: string;
  private readonly now: () => number;
  /** origin -> signatures this session has already shown in full. */
  private readonly seen = new Map<string, Set<string>>();
  /** origin -> persisted entries (loaded once, lazily). */
  private readonly disk = new Map<string, Map<string, Entry>>();

  constructor(opts: MemoryOptions = {}, env: NodeJS.ProcessEnv = process.env) {
    this.enabled = opts.enabled ?? !OFF.test(env.MANTIS_MEMORY ?? '');
    this.dir = opts.dir ?? env.MANTIS_MEMORY_DIR ?? join(homedir(), '.cache', 'mantis', 'sites');
    this.now = opts.now ?? Date.now;
  }

  /** The hook translate() uses for a page on `origin`; undefined when memory is off or does not apply. */
  hook(origin: string | null): RegionHook | undefined {
    if (!this.enabled || !origin) return undefined;
    return {
      collapse: (regions) => regions.map((r) => this.summary(origin, r)),
      shown: (full, collapsed) => this.record(origin, full, collapsed),
    };
  }

  /** Clear everything remembered about a site, in this session and on disk. */
  forget(origin: string): void {
    this.seen.delete(origin);
    this.disk.set(origin, new Map());
    try {
      rmSync(this.file(origin), { force: true });
    } catch {
      // unwritable: nothing more to do
    }
  }

  /** File that holds the signatures of one origin. */
  file(origin: string): string {
    return join(this.dir, `${createHash('sha256').update(origin).digest('hex').slice(0, 24)}.json`);
  }

  private summary(origin: string, r: RegionInfo): string[] | null {
    if (!isCollapsible(r)) return null;
    const sig = regionSignature(r);
    if (this.seen.get(origin)?.has(sig)) return [sameAsBeforeLine(r)];
    const e = this.load(origin).get(sig);
    if (e && this.now() - e.t <= MEMORY_TTL_MS) return [knownLayoutLine(r)];
    return null;
  }

  private record(origin: string, full: RegionInfo[], collapsed: RegionInfo[]): void {
    const entries = this.load(origin);
    const now = this.now();
    let dirty = false;
    let seen = this.seen.get(origin);
    for (const r of full) {
      if (!isCollapsible(r)) continue;
      const sig = regionSignature(r);
      if (!seen) this.seen.set(origin, (seen = new Set()));
      seen.add(sig);
      const old = entries.get(sig);
      if (!old || old.n !== r.items.length || now - old.t >= TOUCH_AFTER_MS || now - old.t > MEMORY_TTL_MS) {
        entries.set(sig, { n: r.items.length, t: now });
        dirty = true;
      }
    }
    for (const r of collapsed) {
      const sig = regionSignature(r);
      const old = entries.get(sig);
      if (old && now - old.t >= TOUCH_AFTER_MS) {
        entries.set(sig, { ...old, t: now });
        dirty = true;
      }
    }
    if (dirty) this.save(origin, entries);
  }

  /** Persisted entries for an origin; a missing, expired, corrupt or unreadable file is just empty. */
  private load(origin: string): Map<string, Entry> {
    const cached = this.disk.get(origin);
    if (cached) return cached;
    const entries = new Map<string, Entry>();
    try {
      const data: unknown = JSON.parse(readFileSync(this.file(origin), 'utf8'));
      const regions = (data as { v?: unknown; regions?: unknown } | null)?.regions;
      if ((data as { v?: unknown } | null)?.v === 1 && regions && typeof regions === 'object') {
        for (const [sig, e] of Object.entries(regions as Record<string, unknown>)) {
          const { n, t } = (e ?? {}) as Partial<Entry>;
          if (/^[0-9a-f]{24}$/.test(sig) && Number.isFinite(n) && Number.isFinite(t) && this.now() - (t as number) <= MEMORY_TTL_MS) {
            entries.set(sig, { n: n as number, t: t as number });
          }
        }
      }
    } catch {
      // no file yet, or corrupt: start empty
    }
    this.disk.set(origin, entries);
    return entries;
  }

  private save(origin: string, entries: Map<string, Entry>): void {
    try {
      const keep = [...entries].filter(([, e]) => this.now() - e.t <= MEMORY_TTL_MS).sort((a, b) => b[1].t - a[1].t).slice(0, MAX_ENTRIES);
      entries.clear();
      for (const [sig, e] of keep) entries.set(sig, e);
      mkdirSync(this.dir, { recursive: true });
      const target = this.file(origin);
      const tmp = `${target}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ v: 1, regions: Object.fromEntries(entries) }));
      renameSync(tmp, target);
    } catch {
      // unwritable (read-only home, full disk): memory keeps working for this session only
    }
  }
}
