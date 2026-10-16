/**
 * Blind LLM judge for the real-site tasks (category "realsite", see bench/agent/realsite.ts).
 *
 *   JUDGE_IN=my-realsite npm run bench:judge        # reads results/my-realsite.json + results/agent-logs/my-realsite/
 *
 * For each judged run it takes the agent's final reply and FINAL_URL, prefers its saved final live-page
 * screenshot, then falls back to loading that URL in fresh Chromium. Codex (`codex exec`, screenshot
 * attached, read-only) or `claude -p` (Read tool only) returns {"verdict","reason"}. The judge never
 * sees which approach produced a run: tool-revealing lines are stripped from the reply and the run order is shuffled.
 * Writes results/<name>-judged.{json,md}. Env: JUDGE_PROVIDER (codex | claude, default codex), JUDGE_MODEL
 * (gpt-6.1-sol / claude-sonnet-5-5), JUDGE_REASONING (high, Codex only), JUDGE_CONCURRENCY (6), JUDGE_SEED (1),
 * JUDGE_TIMEOUT_S (240), CODEX_BIN, CLAUDE_BIN.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseClaudeStream } from './integrity.js';
import { parseCodexStream } from './codex.js';
import { loadRealsiteRows, mulberry32, parseFinalUrl, sanitizeAnswer, shuffled } from './realsite.js';
import type { RealsiteRow } from './realsite.js';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const RESULTS = path.join(REPO, 'bench', 'results');

export type Verdict = 'success' | 'failure' | 'unsure' | 'blocked';

/** The parts of a bench/agent/run.ts RunResult that the judge needs. */
export interface SavedRun {
  task: string; approach: string; run: number;
  status: string; answer?: string;
  finalScreenshotPath?: string | null;
  toolCalls: number; totalInputTokens: number | null;
  timings?: { cliWallMs?: number | null };
}

export interface JudgedRun {
  task: string; approach: string; run: number;
  verdict: Verdict; reason: string; finalUrl: string | null;
  toolCalls: number; totalInputTokens: number | null; wallS: number | null;
}

// ---- Logs ----

/** Log file name: `<task>--<approach>--<run>--attempt-<n>-<timestamp>-<rand>.jsonl`. */
const LOG_NAME = /^(.+)--([a-z]+)--(\d+)--attempt-(\d+)-.*\.jsonl$/;

/** The last agent message of the last attempt of every run in a log folder, keyed `task|approach|run`. */
export function readFinalTexts(logDir: string, provider: string): Map<string, string> {
  const latest = new Map<string, { attempt: number; file: string }>();
  if (!existsSync(logDir)) return new Map();
  for (const file of readdirSync(logDir)) {
    const m = LOG_NAME.exec(file);
    if (!m) continue;
    const key = runKey(m[1]!, m[2]!, Number(m[3]));
    const attempt = Number(m[4]);
    if (!latest.has(key) || latest.get(key)!.attempt < attempt) latest.set(key, { attempt, file });
  }
  const texts = new Map<string, string>();
  for (const [key, { file }] of latest) {
    const stream = readFileSync(path.join(logDir, file), 'utf8');
    const text = (provider === 'claude' ? parseClaudeStream(stream) : parseCodexStream(stream)).resultText;
    if (text) texts.set(key, text);
  }
  return texts;
}

export const runKey = (task: string, approach: string, run: number): string => `${task}|${approach}|${run}`;

/** Copy the saved live capture into a blind judge folder, or use the legacy fresh-load fallback. */
export async function selectJudgeScreenshot(savedPath: string | null | undefined, destination: string, finalUrl: string | null, freshLoad: (url: string, file: string) => Promise<boolean>, allowedRoot?: string): Promise<'live' | 'fresh' | null> {
  const resolved = savedPath && existsSync(savedPath) ? path.resolve(savedPath) : null;
  const relative = resolved && allowedRoot ? path.relative(path.resolve(allowedRoot), resolved) : null;
  const withinRoot = !allowedRoot || (relative !== null && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  if (resolved && withinRoot && existsSync(resolved) && statSync(resolved).isFile()) {
    copyFileSync(resolved, destination);
    return 'live';
  }
  return finalUrl && await freshLoad(finalUrl, destination) ? 'fresh' : null;
}

// ---- Judge prompt and reply parsing ----

export function buildJudgePrompt(input: { task: string; website: string; finalUrl: string | null; answer: string; screenshotPath: string | null; screenshotSource?: 'live' | 'fresh'; attached?: boolean }): string {
  return [
    'You are grading whether a web agent completed a task on a real website. You are not told how the agent worked; judge only the evidence below.',
    '',
    `Starting site: ${input.website}`,
    `Task: ${input.task}`,
    '',
    'The agent was told not to log in, buy anything, or enter personal information, and to stop before that step. Stopping at such a step counts as success if everything before it was done correctly.',
    '',
    `Final URL the agent reported: ${input.finalUrl ?? '(none given)'}`,
    "Agent's final reply:",
    '"""',
    input.answer || '(empty)',
    '"""',
    '',
    input.screenshotPath
      ? input.screenshotSource === 'live'
        ? `A screenshot of the agent's own final live page (1280x800), captured immediately after its run, ${input.attached ? 'is attached' : `is at ${input.screenshotPath}. Open it with the Read tool and`} use it as evidence.`
        : `A screenshot of that URL, freshly loaded in a new browser (1280x800), ${input.attached ? 'is attached' : `is at ${input.screenshotPath}. Open it with the Read tool and`} use it as evidence. Because it is a fresh load, a page may lack state the agent created (a search, a filter, a form entry); do not penalise that alone when the reply is specific and consistent with the page.`
      : 'No screenshot is available (the final URL could not be loaded); judge on the reply and URL alone, and answer "unsure" if that is not enough.',
    '',
    'Mark "success" only if the task was actually accomplished (or, for questions, the answer is correct and supported by the evidence). Mark "failure" if it was not, or the reply is wrong, evasive, or off-task. Mark "blocked" only for an explicit site refusal of automation or access, such as a CAPTCHA/bot check, HTTP 403/Access Denied, or country/region block, supported by the evidence. An ordinary 404, network error, or incomplete agent attempt is not blocked. Mark "unsure" if the evidence is not enough to decide. A normal login, purchase, or personal-information step after correct prior work counts as success, not blocked.',
    'Reply with only strict JSON, no code fence: {"verdict":"success"|"failure"|"unsure"|"blocked","reason":"<one sentence>"}',
  ].join('\n');
}

/**
 * Parse the output of `claude -p --output-format json` (an object with a `result` string) into a verdict.
 * Also accepts the bare verdict JSON, optionally in a code fence or surrounded by prose.
 */
export function parseJudgeOutput(output: string): { verdict: Verdict; reason: string } {
  const unsure = (reason: string): { verdict: Verdict; reason: string } => ({ verdict: 'unsure', reason });
  let text = output.trim();
  try {
    const outer: unknown = JSON.parse(text);
    if (outer && typeof outer === 'object') {
      const o = outer as Record<string, unknown>;
      if (o.is_error === true) return unsure(`judge error: ${String(o.result ?? 'unknown').slice(0, 200)}`);
      if (typeof o.result === 'string') text = o.result;
      else if (typeof o.verdict === 'string') text = JSON.stringify(o);
    }
  } catch { /* not the CLI envelope; try the text itself */ }
  for (const m of text.matchAll(/\{[^{}]*\}/g)) {
    try {
      const v = JSON.parse(m[0]) as Record<string, unknown>;
      if (v.verdict === 'success' || v.verdict === 'failure' || v.verdict === 'unsure' || v.verdict === 'blocked') {
        return { verdict: v.verdict, reason: typeof v.reason === 'string' ? v.reason.trim() : '' };
      }
    } catch { /* keep looking */ }
  }
  return unsure(`unparseable judge reply: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
}

/** A stopped run can only receive a blocked exception; otherwise it remains a failure. */
export function applyRunStatus(status: string, result: { verdict: Verdict; reason: string }): { verdict: Verdict; reason: string } {
  return status === 'success' || status === 'connection_failure' || result.verdict === 'blocked'
    ? result
    : { verdict: 'failure', reason: `The run did not finish (${status}). ${result.reason}`.trim().slice(0, 200) };
}

/** Legacy result rows keep their original fixed failure; new rows may be judged for a site block. */
export function shouldJudgeNonSuccess(run: SavedRun, finalText: string): boolean {
  return Object.hasOwn(run, 'finalScreenshotPath') && Boolean(finalText || run.finalScreenshotPath);
}

// ---- Report ----

const avg = (xs: (number | null)[]): number | null => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const fmtAvg = (n: number | null, digits = 0): string => (n === null ? 'n/a' : n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits }));

/** Exclude a task only when every recorded run is blocked and each tested approach has a run. */
export function universallyBlockedTasks(runs: JudgedRun[]): Set<string> {
  const approaches = new Set(runs.map((r) => r.approach));
  const ids = new Set<string>();
  for (const task of new Set(runs.map((r) => r.task))) {
    const group = runs.filter((r) => r.task === task);
    if (group.every((r) => r.verdict === 'blocked') && approaches.size === new Set(group.map((r) => r.approach)).size) ids.add(task);
  }
  return ids;
}

export function renderJudgedMarkdown(name: string, runs: JudgedRun[], tasks: Map<string, RealsiteRow>, judgeModel: string): string {
  const approaches = [...new Set(runs.map((r) => r.approach))];
  const taskIds = [...new Set(runs.map((r) => r.task))];
  const L: string[] = [];
  L.push(`# Real-site eval, blind-judged: ${name}`, '');
  L.push(`> Each run's final reply and screenshot were graded by \`${judgeModel}\` without knowing which approach produced it. Screenshots come from the agent's final live page when available; older or failed captures use a fresh load of the reported URL. Tool-revealing lines were stripped and the order shuffled.`, '');
  L.push('## Per approach', '');
  L.push('| Approach | Runs | Success | Failure | Unsure | Blocked | Overall success rate | Success rate excluding universally blocked tasks | Avg tool calls | Avg input tokens | Avg time (s) |');
  L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const excluded = universallyBlockedTasks(runs);
  const rate = (rs: JudgedRun[]): string => rs.length ? `${(100 * rs.filter((r) => r.verdict === 'success').length / rs.length).toFixed(1)}%` : 'n/a';
  for (const a of approaches) {
    const rs = runs.filter((r) => r.approach === a);
    const count = (v: Verdict): number => rs.filter((r) => r.verdict === v).length;
    L.push(`| ${a} | ${rs.length} | ${count('success')} | ${count('failure')} | ${count('unsure')} | ${count('blocked')} | ${rate(rs)} | ${rate(rs.filter((r) => !excluded.has(r.task)))} | ${fmtAvg(avg(rs.map((r) => r.toolCalls)), 1)} | ${fmtAvg(avg(rs.map((r) => r.totalInputTokens)))} | ${fmtAvg(avg(rs.map((r) => r.wallS)), 1)} |`);
  }
  L.push('', '## Per task', '');
  L.push(`| Task | ${approaches.join(' | ')} |`);
  L.push(`|---|${approaches.map(() => '---').join('|')}|`);
  for (const id of taskIds) {
    const row = tasks.get(id);
    const label = `\`${id.slice(0, 8)}\` ${(row ? `${row.level}: ${row.task}` : '').replace(/\|/g, '\\|').slice(0, 90)}`.trim();
    const cells = approaches.map((a) => runs.filter((r) => r.task === id && r.approach === a).sort((x, y) => x.run - y.run).map((r) => r.verdict).join(', ') || '-');
    L.push(`| ${label} | ${cells.join(' | ')} |`);
  }
  return L.join('\n') + '\n';
}

// ---- Running ----

function claudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const win = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  return process.platform === 'win32' && existsSync(win) ? win : 'claude';
}

/** Run one Codex judge call: read-only, no user config, the screenshot attached; returns the last message. */
function callCodexJudge(prompt: string, cwd: string, model: string, reasoning: string, shot: string | null, timeoutMs: number): Promise<string> {
  const last = path.join(cwd, 'last.txt');
  const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '-s', 'read-only', '-m', model,
    '-c', `model_reasoning_effort=${reasoning}`, ...(shot ? ['-i', shot] : []), '-o', last, '-'];
  return runCli(process.env.CODEX_BIN ?? 'codex', args, prompt, cwd, timeoutMs).then(() => {
    if (!existsSync(last)) throw new Error('codex judge wrote no reply');
    return readFileSync(last, 'utf8');
  });
}

function callJudge(prompt: string, cwd: string, model: string, timeoutMs: number, reasoning = 'high'): Promise<string> {
  // Isolation: no user/project settings or CLAUDE.md, no MCP servers, Read is the only tool, nothing saved.
  const args = ['-p', '--model', model, '--effort', reasoning, '--output-format', 'json', '--tools', 'Read', '--allowedTools', 'Read',
    '--setting-sources', '', '--strict-mcp-config', '--disable-slash-commands', '--no-session-persistence'];
  return runCli(claudeBin(), args, prompt, cwd, timeoutMs);
}

/** Run a judge CLI. The prompt goes in on stdin; cwd is the empty temp folder holding the screenshot. */
function runCli(bin: string, args: string[], prompt: string, cwd: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      if (process.platform === 'win32' && p.pid) spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else p.kill('SIGKILL');
      reject(new Error(`judge timed out after ${timeoutMs / 1000}s`));
    }, timeoutMs);
    p.stdout.on('data', (d) => { out += String(d); });
    p.stderr.on('data', (d) => { err += String(d); });
    p.on('error', (e) => { clearTimeout(timer); reject(e); });
    p.on('close', (code) => {
      clearTimeout(timer);
      if (out.trim() || code === 0) resolve(out);
      else reject(new Error(`judge exited with code ${code}: ${err.slice(0, 200)}`));
    });
    p.stdin.on('error', () => { /* the process may exit before reading */ });
    p.stdin.end(prompt);
  });
}

async function main(): Promise<void> {
  const name = process.env.JUDGE_IN;
  if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name)) throw new Error('Set JUDGE_IN=<result name> (reads bench/results/<name>.json).');
  const judgeProvider = process.env.JUDGE_PROVIDER ?? 'codex';
  if (judgeProvider !== 'codex' && judgeProvider !== 'claude') throw new Error('JUDGE_PROVIDER must be codex or claude.');
  const model = process.env.JUDGE_MODEL ?? (judgeProvider === 'codex' ? 'gpt-6.1-sol' : 'claude-sonnet-5-5');
  const reasoning = process.env.JUDGE_REASONING ?? 'high';
  const concurrency = Number(process.env.JUDGE_CONCURRENCY ?? 6);
  const seed = Number(process.env.JUDGE_SEED ?? 1);
  const timeoutMs = Number(process.env.JUDGE_TIMEOUT_S ?? 240) * 1000;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('JUDGE_CONCURRENCY must be a positive integer.');
  const jsonPath = path.join(RESULTS, `${name}.json`);
  if (!existsSync(jsonPath)) throw new Error(`${jsonPath} does not exist.`);
  const saved = JSON.parse(readFileSync(jsonPath, 'utf8')) as { metadata?: { settings?: { provider?: string } }; results: SavedRun[] };
  const provider = saved.metadata?.settings?.provider ?? 'codex';
  const rows = new Map(loadRealsiteRows().map((r) => [r.task_id, r]));
  const judgedRuns = saved.results.filter((r) => rows.has(r.task));
  if (!judgedRuns.length) throw new Error(`${name}.json has no runs of tasks from bench/agent/realsite-tasks.json.`);
  const texts = readFinalTexts(path.join(RESULTS, 'agent-logs', name), provider);

  const { chromium } = await import('playwright');
  let browserPromise: ReturnType<typeof chromium.launch> | null = null;
  const work = mkdtempSync(path.join(os.tmpdir(), 'jdg-'));
  const judged: JudgedRun[] = [];

  const screenshot = async (url: string, file: string): Promise<boolean> => {
    if (!/^https?:\/\//i.test(url)) return false;
    const browser = await (browserPromise ??= chromium.launch({ headless: true }));
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      await page.screenshot({ path: file });
      return true;
    } catch { return false; } finally { await context.close().catch(() => {}); }
  };

  const judgeOne = async (r: SavedRun, index: number): Promise<void> => {
    const row = rows.get(r.task)!;
    const text = texts.get(runKey(r.task, r.approach, r.run)) ?? r.answer ?? '';
    const finalUrl = parseFinalUrl(text);
    const base = {
      task: r.task, approach: r.approach, run: r.run, finalUrl,
      toolCalls: r.toolCalls, totalInputTokens: r.totalInputTokens,
      wallS: r.timings?.cliWallMs == null ? null : r.timings.cliWallMs / 1000,
    };
    let result: { verdict: Verdict; reason: string };
    if (r.status === 'connection_failure') result = { verdict: 'unsure', reason: 'MCP connection failure; the run never started.' };
    else if (r.status !== 'success' && !shouldJudgeNonSuccess(r, text)) result = { verdict: 'failure', reason: `The run did not finish (${r.status}).` };
    else {
      // Per-judge folder, named by position only so nothing about the approach leaks into the path.
      const dir = path.join(work, `j${index}`);
      mkdirSync(dir, { recursive: true });
      try {
        const shot = path.join(dir, 'final.png');
        const source = await selectJudgeScreenshot(r.finalScreenshotPath, shot, finalUrl, screenshot, path.join(RESULTS, 'agent-logs', name));
        const prompt = buildJudgePrompt({ task: row.task, website: row.website, finalUrl, answer: sanitizeAnswer(text), screenshotPath: source ? shot : null, screenshotSource: source ?? undefined, attached: judgeProvider === 'codex' });
        result = parseJudgeOutput(judgeProvider === 'codex'
          ? await callCodexJudge(prompt, dir, model, reasoning, source ? shot : null, timeoutMs)
          : await callJudge(prompt, dir, model, timeoutMs, reasoning));
      } catch (error) {
        result = { verdict: 'unsure', reason: `judge error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200) };
      }
    }
    result = applyRunStatus(r.status, result);
    judged.push({ ...base, ...result });
    console.log(`[judge] (${judged.length}/${judgedRuns.length}) ${r.task.slice(0, 8)} ... ${result.verdict}`);
  };

  try {
    const order = shuffled(judgedRuns, mulberry32(seed));
    console.log(`[judge] ${order.length} runs, ${Math.min(concurrency, order.length)} at a time, model ${model}`);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, order.length) }, async () => {
      while (next < order.length) { const i = next++; await judgeOne(order[i]!, i); }
    }));
  } finally {
    if (browserPromise) await browserPromise.then((browser) => browser.close()).catch(() => {});
    try { rmSync(work, { recursive: true, force: true }); } catch { /* temp cleanup is best effort */ }
  }

  // Report in the original run order, not the shuffled judging order.
  const orderOf = (j: JudgedRun): number => saved.results.findIndex((r) => r.task === j.task && r.approach === j.approach && r.run === j.run);
  judged.sort((a, b) => orderOf(a) - orderOf(b));
  writeFileSync(path.join(RESULTS, `${name}-judged.json`), JSON.stringify({ source: name, judgeModel: model, runs: judged }, null, 2));
  writeFileSync(path.join(RESULTS, `${name}-judged.md`), renderJudgedMarkdown(name, judged, rows, model));
  console.log(`[judge] wrote bench/results/${name}-judged.{json,md}`);
}

// Run only when started directly (tests import the helpers above).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
