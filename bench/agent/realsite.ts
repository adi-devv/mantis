/**
 * Real-site tasks for the agent eval: Online-Mind2Web-style rows from bench/agent/realsite-tasks.json
 * (an array of { task_id, website, confirmed_task, level }; `task` is accepted for `confirmed_task`). Real sites have no regex answer, so these tasks are
 * `judged: true` and graded afterwards by a blind LLM judge (bench/agent/judge.ts). The task's own
 * `expect` only checks that the agent finished (it printed the FINAL_URL line).
 *
 * Select them with AGENT_TASKS=cat:realsite. AGENT_REALSITE_N (default 10) rows are sampled, stratified
 * by level, with a seeded shuffle (AGENT_REALSITE_SEED, default 1), so the same N and seed always pick the same tasks.
 * If the JSON file is missing there are simply no realsite tasks.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AgentTask } from './tasks.js';

export interface RealsiteRow { task_id: string; website: string; task: string; level: string }

export const REALSITE_FILE = path.join(import.meta.dirname, 'realsite-tasks.json');

/** Small seeded PRNG (mulberry32): returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates shuffle with a supplied PRNG; returns a new array. */
export function shuffled<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

const LEVEL_ORDER = ['easy', 'medium', 'hard'];
const levelRank = (level: string): number => {
  const i = LEVEL_ORDER.indexOf(level.toLowerCase());
  return i === -1 ? LEVEL_ORDER.length : i;
};

/**
 * Deterministic seeded sample of `n` rows, stratified by `level` in proportion to the level sizes
 * (largest-remainder allocation). The result does not depend on the input order, and its order is shuffled
 * so a partial run is not biased towards one level.
 */
export function sampleRealsite(rows: readonly RealsiteRow[], n: number, seed: number): RealsiteRow[] {
  const rand = mulberry32(seed);
  const sorted = [...rows].sort((a, b) => (a.task_id < b.task_id ? -1 : a.task_id > b.task_id ? 1 : 0));
  const groups = new Map<string, RealsiteRow[]>();
  for (const row of sorted) groups.set(row.level, [...(groups.get(row.level) ?? []), row]);
  const levels = [...groups.keys()].sort((a, b) => levelRank(a) - levelRank(b) || (a < b ? -1 : 1));
  const total = sorted.length;
  const want = Math.min(Math.max(0, Math.floor(n)), total);
  if (want === 0) return [];
  const quota = new Map<string, number>();
  const remainder: { level: string; frac: number }[] = [];
  let given = 0;
  for (const level of levels) {
    const exact = (groups.get(level)!.length / total) * want;
    quota.set(level, Math.floor(exact));
    given += Math.floor(exact);
    remainder.push({ level, frac: exact - Math.floor(exact) });
  }
  // Remaining slots go to the largest fractional parts (stable by level order), never above a group's size.
  remainder.sort((a, b) => b.frac - a.frac);
  for (let i = 0; given < want; i = (i + 1) % remainder.length) {
    const { level } = remainder[i]!;
    if (quota.get(level)! < groups.get(level)!.length) { quota.set(level, quota.get(level)! + 1); given++; }
  }
  const picked: RealsiteRow[] = [];
  for (const level of levels) picked.push(...shuffled(groups.get(level)!, rand).slice(0, quota.get(level)!));
  return shuffled(picked, rand);
}

/** All valid rows of the JSON file ([] when the file is missing). Rows with missing fields are skipped. */
export function loadRealsiteRows(file: string = REALSITE_FILE): RealsiteRow[] {
  if (!existsSync(file)) return [];
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) throw new Error(`${file} must contain a JSON array of { task_id, website, confirmed_task, level }.`);
  const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return raw.flatMap((item): RealsiteRow[] => {
    const o = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const task_id = text(o.task_id);
    const website = text(o.website);
    // Online-Mind2Web calls the task text `confirmed_task`; plain `task` is also accepted.
    const task = text(o.confirmed_task) ?? text(o.task);
    if (!task_id || !website || !task) return [];
    return [{ task_id, website, task, level: text(o.level) ?? 'unknown' }];
  });
}

export function realsitePrompt(row: Pick<RealsiteRow, 'website' | 'task'>): string {
  return `Start at ${row.website}. ${row.task} Do not log in, buy anything, or enter personal information; stop before that step. ` +
    'Finish with the page showing the evidence for your answer, including relevant inputs and site-generated results. Leave any required sign-in, purchase, or personal-information prompt open. State what is currently visible and distinguish it from earlier observations or your own calculations. Do not substitute your own estimate for a requested site result. ' +
    'When done, reply with your answer or what you did, then a last line "FINAL_URL: <url of the page you ended on>".';
}

export function realsiteTask(row: RealsiteRow): AgentTask {
  return {
    id: row.task_id,
    category: 'realsite',
    site: 'live',
    prompt: () => realsitePrompt(row),
    expect: /FINAL_URL:/,
    judged: true,
  };
}

function envInt(name: string, value: string | undefined, fallback: number, min: number): number {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || !Number.isSafeInteger(Number(value))) {
    throw new Error(`${name} must be an integer >= ${min}; received ${JSON.stringify(value)}.`);
  }
  return Number(value);
}

/** The sampled realsite tasks, per AGENT_REALSITE_N / AGENT_REALSITE_SEED. */
export function loadRealsiteTasks(env: NodeJS.ProcessEnv = process.env, file: string = REALSITE_FILE): AgentTask[] {
  const rows = loadRealsiteRows(file);
  if (!rows.length) return [];
  const n = envInt('AGENT_REALSITE_N', env.AGENT_REALSITE_N, 10, 1);
  const seed = envInt('AGENT_REALSITE_SEED', env.AGENT_REALSITE_SEED, 1, 0);
  return sampleRealsite(rows, n, seed).map(realsiteTask);
}

// ---- Parsing of the agent's final reply (shared with the judge) ----

/** The URL on the last `FINAL_URL:` line, or null. Tolerates markdown links, backticks, angle brackets and trailing punctuation. */
export function parseFinalUrl(text: string): string | null {
  const matches = [...text.matchAll(/FINAL_URL:[ \t]*([^\r\n]*)/gi)];
  for (let i = matches.length - 1; i >= 0; i--) {
    let value = matches[i]![1]!.trim();
    const link = /\]\((\S+?)\)/.exec(value);
    if (link) value = link[1]!;
    const url = /https?:\/\/[^\s<>`"'()\[\]]+/i.exec(value);
    if (url) return url[0].replace(/[.,;:!?*_]+$/, '');
  }
  return null;
}

// Substring match on purpose: names appear inside identifiers such as mcp__playwright__browser_click.
const TOOL_WORDS = /mcp|mantis|playwright|snapshot|accessibility tree|screenshot|browser_\w+|\btool calls?\b/i;
// Pixel coordinates from a click-by-position tool: x=123, y=456 / (123, 456) / [123,456] / at 123,456 / "coordinates".
const COORDS = /\b[xy]\s*[=:]\s*\d{1,4}\b|[(\[]\s*\d{1,4}\s*,\s*\d{1,4}\s*[)\]]|\bat\s+\d{1,4}\s*,\s*\d{1,4}\b|\bcoordinates?\b/i;
const REF_TOKENS = /(?<![\w$.])e\d{1,5}\b|(?<![\w&])#\d{1,5}\b|\bref[ =:]*\[?\w*\d+/i;

/**
 * The final reply with anything that could reveal the browsing tool removed, so a judge cannot tell which
 * approach produced it: whole lines that mention a tool word or a numbered element ref (e42, #12, ref=...),
 * pixel coordinates, the FINAL_URL line (it is passed separately), and surrounding blank space.
 */
export function sanitizeAnswer(text: string): string {
  const kept = text.split(/\r?\n/).filter((line) => !/^\s*FINAL_URL:/i.test(line) && !TOOL_WORDS.test(line) && !COORDS.test(line) && !REF_TOKENS.test(line));
  return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
