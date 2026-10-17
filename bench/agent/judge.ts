/**
 * Blind LLM judge for the real-site tasks (category "realsite", see bench/agent/realsite.ts).
 *
 *   JUDGE_IN=my-realsite npm run bench:judge        # reads results/my-realsite.json + results/agent-logs/my-realsite/
 *
 * For each judged run it takes the agent's final reply and FINAL_URL, prefers its saved final live-page
 * screenshot, then falls back to loading that URL in fresh Chromium. Codex (`codex exec`, screenshot
 * attached, read-only) or `claude -p` (Read tool only) returns {"verdict","reason"}. The judge never
 * sees which approach produced a run: tool-revealing lines are stripped from the reply and the run order is shuffled.
 * Newer runs also carry evidence frames (bench/agent/evidence.ts): the judge then sees a chronological packet of
 * harness-captured frames (URL, page text, image) instead of one final screenshot. Rows that explicitly opt into a
 * complete deterministic grader are decided from their final captured state before any model call; legacy `checks`
 * still only veto a judged verdict.
 * Writes results/<name>-judged.{json,md}. Env: JUDGE_PROVIDER (codex | claude | sarvam, default codex), JUDGE_MODEL
 * (gpt-6.1-sol / claude-sonnet-5-5), JUDGE_REASONING (high, Codex only), JUDGE_CONCURRENCY (6), JUDGE_SEED (1),
 * JUDGE_TIMEOUT_S (240), CODEX_BIN, CLAUDE_BIN.
 */
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromiumExecutable } from '../../src/userAgent.js';
import { parseClaudeStream } from './integrity.js';
import { parseCodexStream } from './codex.js';
import { evaluateChecks, evaluateDeterministicGrader, loadRealsiteRows, mulberry32, parseFinalUrl, sanitizeAnswer, shuffled } from './realsite.js';
import type { RealsiteRow } from './realsite.js';
import { TASKS } from './tasks.js';
import { evidenceShowsOnlySiteErrors } from './evidence.js';
import type { EvidenceFrame, EvidenceSidecar, FormValue } from './evidence.js';
import { decodePng, encodePng, fitWithin } from './png.js';
import { loadSarvamEnv, resolveSarvamModel, SarvamClient, sarvamModelSupportsImages } from './sarvam.js';
import type { SarvamContentPart } from './sarvam.js';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const RESULTS = path.join(REPO, 'bench', 'results');

export type Verdict = 'success' | 'failure' | 'unsure' | 'blocked' | 'site_broken';

/** The parts of a bench/agent/run.ts RunResult that the judge needs. */
export interface SavedRun {
  task: string; approach: string; run: number;
  status: string; answer?: string;
  finalScreenshotPath?: string | null;
  /** Evidence-format rows (newer runs) have `evidenceFrames`, even when empty; older rows lack the property. */
  evidencePath?: string | null; evidenceFrames?: string[];
  toolCalls: number; totalInputTokens: number | null;
  timings?: { cliWallMs?: number | null };
  initModel?: string | null; resolvedModels?: string[];
  attempts?: { initModel?: string | null; resolvedModels?: string[] }[];
}

export interface JudgedRun {
  task: string; approach: string; run: number;
  verdict: Verdict; reason: string; finalUrl: string | null;
  toolCalls: number; totalInputTokens: number | null; wallS: number | null;
  /** Evidence-format rows only: frame IDs the judge cited, frames shown, the judge's own verdict, deterministic checks. */
  evidence?: string[]; frameCount?: number; finalFrame?: string | null; judgeVerdict?: Verdict;
  checks?: { pass: boolean; failed: string[] } | null;
  /** How this verdict was reached, so deterministic successes never look model-judged. */
  grading?: 'deterministic' | 'judge' | 'status';
  deterministic?: { pass: boolean; failed: string[] } | null;
  /** Per-run signal used to make the task-level site_broken decision. */
  siteFailure?: boolean;
  judgeModel?: string; judgeError?: string;
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
    const text = provider === 'sarvam' ? parseSarvamTrace(stream) : (provider === 'claude' ? parseClaudeStream(stream) : parseCodexStream(stream)).resultText;
    if (text) texts.set(key, text);
  }
  return texts;
}

/** Sarvam logs are harness traces, not Codex event streams.  Prefer the summary, then the last final completion. */
export function parseSarvamTrace(stream: string): string | null {
  let final: string | null = null;
  for (const line of stream.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line) as { type?: unknown; resultText?: unknown; content?: unknown; toolCalls?: unknown };
      if (event.type === 'sarvam.summary' && typeof event.resultText === 'string') final = event.resultText;
      else if (event.type === 'sarvam.completion' && typeof event.content === 'string' && (!Array.isArray(event.toolCalls) || event.toolCalls.length === 0)) final = event.content;
    } catch { /* a truncated diagnostic line is not a final reply */ }
  }
  return final;
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

const RULES =
  'Mark "success" only if the task was actually accomplished (or, for questions, the answer is correct and supported by the evidence). Mark "failure" if it was not, or the reply is wrong, evasive, or off-task. If the reply says a required login, purchase, or personal-information prompt stopped it but no such prompt is visible on a live capture, mark "unsure" unless other evidence shows failure. If the task asks for a result the site computes and the agent gives its own estimate or calculation instead, mark "failure". Mark "blocked" only for an explicit site refusal of automation or access, such as a CAPTCHA/bot check, HTTP 403/Access Denied, or country/region block, supported by the evidence. Mark "site_broken" only when the evidence shows the site itself failed (for example a browser load error or server error page) before usable task content was available; do not use it for an agent mistake, incomplete attempt, ordinary missing result, or merely an empty evidence packet. An ordinary 404 is not blocked and is site_broken only when the evidence establishes that the requested site content itself is broken. Mark "unsure" if the evidence is not enough to decide. A normal login, purchase, or personal-information step after correct prior work counts as success, not blocked.';

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
    RULES,
    'Reply with only strict JSON, no code fence: {"verdict":"success"|"failure"|"unsure"|"blocked"|"site_broken","reason":"<one sentence>"}',
  ].join('\n');
}

// ---- Evidence packet (newer runs) ----

/** One harness frame as the judge sees it: blind image name, page text as captured, no step numbers or tool names. */
export interface PacketFrame { id: string; url: string; text: string; final: boolean; forms?: FormValue[]; image: string }

const EARLIER_EXCERPT_CHARS = 1_200;
const FINAL_EXCERPT_CHARS = 30_000;
const EARLIER_FRAME_MAX = { width: 640, height: 400 };

const excerpt = (text: string, max: number): string => {
  const t = text.trim();
  return t ? (t.length > max ? `${t.slice(0, max)} [...]` : t) : '(no text)';
};

/**
 * The judge prompt for a run with evidence frames: the frames in chronological order, each with its URL, image and
 * page text. When there are no frames, `freshImage` (a fresh load of the final URL) or nothing replaces them.
 */
export function buildEvidencePrompt(input: { task: string; website: string; finalUrl: string | null; answer: string; frames: PacketFrame[]; attached: boolean; imagesUnavailable?: boolean; freshImage?: string }): string {
  const { frames, attached } = input;
  const where = (image: string): string => input.imagesUnavailable ? 'unavailable for this judge model' : (attached ? `${image} (attached)` : `${image} (open it with the Read tool)`);
  const hasFinal = frames.some((f) => f.final);
  const evidence: string[] = frames.length
    ? [
      `Evidence: ${frames.length} frame${frames.length === 1 ? '' : 's'} captured by the evaluation harness (not by the agent) after the agent's browser actions, in chronological order. ` +
        (hasFinal ? 'Earlier frames are downscaled to about 640x400; the final frame is full size (1280x800).' : 'Frames are downscaled to about 640x400.'),
      ...frames.flatMap((f, i) => {
        const note = f.final ? ' (final, captured after the agent finished)' : i === frames.length - 1 ? ' (last frame captured during the run)' : '';
        return [
          '',
          `${f.id}${note}`,
          `URL: ${f.url || '(unknown)'}`,
          `Image: ${where(f.image)}`,
          f.final ? 'Page text:' : `Page text (first ${EARLIER_EXCERPT_CHARS.toLocaleString('en-US')} characters):`,
          '"""', excerpt(f.text, f.final ? FINAL_EXCERPT_CHARS : EARLIER_EXCERPT_CHARS), '"""',
          ...(f.final ? ['Form values:', ...(f.forms?.length ? f.forms.map((v) => `- ${v.label || '(unlabelled)'}: ${v.value}`) : ['none'])] : []),
        ];
      }),
    ]
    : input.freshImage && !input.imagesUnavailable
      ? [`No frames were captured during the run. ${attached ? 'The attached image' : `The image at ${input.freshImage} (open it with the Read tool)`} is a fresh load of the final URL in a new browser (1280x800). It only shows that the page exists, not the state the agent's session reached (searches, filters, cart, form entries); do not penalise a page that lacks such state when the reply is specific and consistent with it.`]
      : input.imagesUnavailable
        ? ['Images are unavailable for this judge model. No frame text was captured; judge on the reply and URL alone, and answer "unsure" if the reply alone is not enough.']
        : ['No evidence is available (no frames were captured and the final URL could not be loaded); judge on the reply and URL alone, and answer "unsure" if the reply alone is not enough.'];
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
    ...evidence,
    '',
    RULES + ' Missing verification of a required detail (variant, price, inputs, results, or a claimed required gate) means unsure unless evidence establishes failure. An explicitly substituted self-calculation fails when the task requires a site-generated result; missing on-screen output alone does not establish substitution.' +
      (frames.length ? ' Base your verdict on the frames; cite the frame IDs you rely on.' : ''),
    'Reply with only strict JSON, no code fence: {"verdict":"success"|"failure"|"unsure"|"blocked"|"site_broken","reason":"<one sentence>","evidence":["F1",...]}',
  ].join('\n');
}

/** Newer runs record `evidenceFrames` (even when empty); only they get the evidence packet and answer-key checks. */
export const isEvidenceRun = (run: SavedRun): boolean => Object.hasOwn(run, 'evidenceFrames');

/**
 * Return a deterministic result only for a successful evidence-format run.
 * Legacy and interrupted runs return null for the existing status/model path;
 * an opted-in run with unavailable terminal evidence falls back to the normal
 * adjudicator; only an observed final state can deterministically fail.
 */
export function deterministicGradeForRun(row: RealsiteRow, status: string, evidenceRun: boolean, answer: string, frames: PacketFrame[]): { pass: boolean; failed: string[] } | null {
  const finalFrames = frames.filter((frame) => frame.final);
  const accessBlock = frames.some((frame) => /\b(?:captcha|access denied|forbidden|unusual traffic|verify you are human|bot check|country\/region (?:not )?available)\b/i.test(frame.text));
  // A block is a model-adjudicated outcome, not an answer-key failure.
  return evidenceRun && status === 'success' && finalFrames.length === 1 && !accessBlock
    ? evaluateDeterministicGrader(row.deterministic, answer, frames)
    : null;
}

/** The sidecar written by run.ts, only if it sits inside `allowedRoot` and has the expected shape; otherwise null. */
export function readEvidenceSidecar(sidecarPath: string | null | undefined, allowedRoot: string): EvidenceSidecar | null {
  if (!sidecarPath || !existsSync(sidecarPath)) return null;
  const relative = path.relative(path.resolve(allowedRoot), path.resolve(sidecarPath));
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  try {
    const raw = JSON.parse(readFileSync(sidecarPath, 'utf8')) as { frames?: unknown };
    if (!Array.isArray(raw.frames)) return null;
    const frames = raw.frames.filter((f): f is EvidenceFrame => !!f && typeof f === 'object' && typeof f.id === 'string' && typeof f.file === 'string' && typeof f.url === 'string' && typeof f.text === 'string');
    return { ...(raw as EvidenceSidecar), frames };
  } catch { return null; }
}

/** Earlier frames shrink to fit 640x400 (never enlarged); the final frame and undecodable PNGs are kept as captured. */
export function prepareFrameImage(png: Buffer, final: boolean): { png: Buffer; downscaled: boolean } {
  if (final) return { png, downscaled: false };
  try {
    const image = decodePng(png);
    const small = fitWithin(image, EARLIER_FRAME_MAX.width, EARLIER_FRAME_MAX.height);
    return small === image ? { png, downscaled: false } : { png: encodePng(small), downscaled: true };
  } catch { return { png, downscaled: false }; }
}

/**
 * Copy a run's evidence frames into the blind judge folder as f1.png..fn.png and return them in order. `texts` holds the
 * page text of every frame in the sidecar (also those whose image is missing), for the deterministic checks.
 */
export function buildEvidencePacket(sidecarPath: string | null | undefined, allowedRoot: string, destDir: string): { frames: PacketFrame[]; texts: string[]; siteFailure: boolean } {
  const sidecar = readEvidenceSidecar(sidecarPath, allowedRoot);
  if (!sidecar) return { frames: [], texts: [], siteFailure: false };
  const folder = path.dirname(path.resolve(sidecarPath!));
  const frames: PacketFrame[] = [];
  sidecar.frames.forEach((frame, i) => {
    const source = path.join(folder, path.basename(frame.file)); // a basename only: never leave the run's log folder
    if (!existsSync(source) || !statSync(source).isFile()) return;
    const image = `f${i + 1}.png`;
    writeFileSync(path.join(destDir, image), prepareFrameImage(readFileSync(source), frame.final === true).png);
    frames.push({ id: frame.id, url: frame.url, text: frame.text, final: frame.final === true, ...(frame.final ? { forms: frame.forms ?? [] } : {}), image });
  });
  return { frames, texts: sidecar.frames.map((f) => f.text), siteFailure: evidenceShowsOnlySiteErrors(sidecar.frames) };
}

/**
 * Parse the output of `claude -p --output-format json` (an object with a `result` string) into a verdict.
 * Also accepts the bare verdict JSON, optionally in a code fence or surrounded by prose.
 */
export function parseJudgeOutput(output: string): { verdict: Verdict; reason: string; evidence?: string[] } {
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
      if (v.verdict === 'success' || v.verdict === 'failure' || v.verdict === 'unsure' || v.verdict === 'blocked' || v.verdict === 'site_broken') {
        const reason = typeof v.reason === 'string' ? v.reason.trim() : '';
        // Cited frame IDs (F1, F2..): keep the well-formed ones, in order, without repeats.
        const cited = Array.isArray(v.evidence) ? [...new Set(v.evidence.filter((id): id is string => typeof id === 'string' && /^F\d+$/.test(id)))] : [];
        return cited.length ? { verdict: v.verdict, reason, evidence: cited } : { verdict: v.verdict, reason };
      }
    } catch { /* keep looking */ }
  }
  return unsure(`unparseable judge reply: ${text.slice(0, 120).replace(/\s+/g, ' ')}`);
}

/** A stopped run can receive a supported blocked/site-broken exception; otherwise it remains a failure. */
export function applyRunStatus(status: string, result: { verdict: Verdict; reason: string }): { verdict: Verdict; reason: string } {
  return status === 'success' || status === 'connection_failure' || result.verdict === 'blocked' || result.verdict === 'site_broken'
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

/**
 * A site is broken at task level only when every run from every tested approach carries either the judge's
 * site_broken verdict or the strict deterministic error-page signal. A passing answer-key check is usable content.
 */
export function universallySiteBrokenTasks(runs: JudgedRun[]): Set<string> {
  const approaches = new Set(runs.map((r) => r.approach));
  const ids = new Set<string>();
  for (const task of new Set(runs.map((r) => r.task))) {
    const group = runs.filter((r) => r.task === task);
    const complete = approaches.size === new Set(group.map((r) => r.approach)).size;
    if (complete && group.every((r) => r.checks?.pass !== true && (r.siteFailure === true || r.verdict === 'site_broken'))) ids.add(task);
  }
  return ids;
}

/** Promote only universal site failures; an isolated site_broken judgment remains an ordinary failed run. */
export function finalizeSiteBrokenVerdicts(runs: JudgedRun[]): JudgedRun[] {
  const broken = universallySiteBrokenTasks(runs);
  return runs.map((run) => broken.has(run.task)
    ? { ...run, verdict: 'site_broken' }
    : run.verdict === 'site_broken'
      ? { ...run, verdict: 'failure', reason: `Site failure was not universal across approaches. ${run.reason}`.trim() }
      : run);
}

export function renderJudgedMarkdown(name: string, runs: JudgedRun[], tasks: Map<string, RealsiteRow>, judgeModel: string): string {
  runs = finalizeSiteBrokenVerdicts(runs);
  const approaches = [...new Set(runs.map((r) => r.approach))];
  const taskIds = [...new Set(runs.map((r) => r.task))];
  const L: string[] = [];
  L.push(`# Real-site eval, blind-judged: ${name}`, '');
  L.push(`> Each current-format run was graded blind by \`${judgeModel}\` from the agent's final reply and a judge evidence packet of per-step harness frames (page image, URL, text, and final form values), unless an explicitly opted-in complete deterministic grader decided it first. Legacy substring checks can override a judge verdict. Legacy runs use the final live-page screenshot, or a fresh load when unavailable. Tool-revealing lines were stripped and the order shuffled.`, '');
  L.push('## Per approach', '');
  L.push('| Approach | Runs | Success | Failure | Unsure | Blocked | Site broken | Overall success rate | Success rate excluding universally blocked / site-broken tasks | Avg tool calls | Avg input tokens | Avg time (s) |');
  L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  const blocked = universallyBlockedTasks(runs);
  const siteBroken = universallySiteBrokenTasks(runs);
  const excluded = new Set([...blocked, ...siteBroken]);
  const rate = (rs: JudgedRun[]): string => rs.length ? `${(100 * rs.filter((r) => r.verdict === 'success').length / rs.length).toFixed(1)}%` : 'n/a';
  for (const a of approaches) {
    const rs = runs.filter((r) => r.approach === a);
    const count = (v: Verdict): number => rs.filter((r) => r.verdict === v).length;
    L.push(`| ${a} | ${rs.length} | ${count('success')} | ${count('failure')} | ${count('unsure')} | ${count('blocked')} | ${count('site_broken')} | ${rate(rs)} | ${rate(rs.filter((r) => !excluded.has(r.task)))} | ${fmtAvg(avg(rs.map((r) => r.toolCalls)), 1)} | ${fmtAvg(avg(rs.map((r) => r.totalInputTokens)))} | ${fmtAvg(avg(rs.map((r) => r.wallS)), 1)} |`);
  }
  L.push('', `Universally blocked tasks: ${blocked.size ? [...blocked].map((id) => `\`${id}\``).join(', ') : 'none'}. Site-broken tasks: ${siteBroken.size ? [...siteBroken].map((id) => `\`${id}\``).join(', ') : 'none'}.`);
  L.push('', '## Per task', '');
  L.push(`| Task | ${approaches.join(' | ')} |`);
  L.push(`|---|${approaches.map(() => '---').join('|')}|`);
  for (const id of taskIds) {
    const row = tasks.get(id);
    const label = `\`${id.slice(0, 8)}\` ${(row ? `${row.level}: ${row.task}` : '').replace(/\|/g, '\\|').slice(0, 90)}`.trim();
    const cells = approaches.map((a) => runs.filter((r) => r.task === id && r.approach === a).sort((x, y) => x.run - y.run).map((r) => r.verdict).join(', ') || '-');
    L.push(`| ${label} | ${cells.join(' | ')} |`);
  }
  if (runs.some((r) => r.frameCount !== undefined || r.checks !== undefined || r.judgeVerdict !== undefined || r.evidence !== undefined)) L.push(...renderEvidenceSection(runs));
  return L.join('\n') + '\n';
}

/** Appended after the usual tables, only when some run has evidence or check data. */
function renderEvidenceSection(runs: JudgedRun[]): string[] {
  const L: string[] = ['', '## Evidence and checks', ''];
  const withEvidence = runs.filter((r) => r.frameCount !== undefined || r.evidence !== undefined);
  // A cited frame is "earlier" unless it is the final one (the last frame when no frame was marked final).
  const citesEarlier = (r: JudgedRun): boolean => (r.evidence ?? []).some((id) => id !== (r.finalFrame ?? `F${r.frameCount ?? 0}`));
  L.push('| Approach | Evidence runs | Success | Failure | Unsure | Blocked | Site broken | Deterministic | Judge fallback | Status-only | With frames | Citing an earlier frame |');
  L.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const a of [...new Set(runs.map((r) => r.approach))]) {
    const rs = withEvidence.filter((r) => r.approach === a);
    const count = (v: Verdict): number => rs.filter((r) => r.verdict === v).length;
    const provenance = (kind: NonNullable<JudgedRun['grading']>): number => rs.filter((r) => r.grading === kind).length;
    L.push(`| ${a} | ${rs.length} | ${count('success')} | ${count('failure')} | ${count('unsure')} | ${count('blocked')} | ${count('site_broken')} | ${provenance('deterministic')} | ${provenance('judge')} | ${provenance('status')} | ${rs.filter((r) => (r.frameCount ?? 0) > 0).length} | ${rs.filter(citesEarlier).length} |`);
  }
  L.push('', '### Check vs judge disagreements', '');
  const clash = runs.filter((r) => r.checks && (r.checks.pass ? (r.judgeVerdict ?? r.verdict) === 'failure' : (r.judgeVerdict ?? r.verdict) !== 'failure'));
  if (!clash.length) L.push('None.');
  for (const r of clash) {
    L.push(`- \`${r.task.slice(0, 8)}\` ${r.approach} run ${r.run}: judge ${r.judgeVerdict ?? r.verdict}; ${r.checks!.pass ? 'checks passed' : `checks failed (${r.checks!.failed.join('; ')})`}`);
  }
  return L;
}

// ---- Running ----

function claudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const win = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  return process.platform === 'win32' && existsSync(win) ? win : 'claude';
}

/** Run one Codex judge call: read-only, no user config, the images attached; returns the last message. */
function callCodexJudge(prompt: string, cwd: string, model: string, reasoning: string, shots: string[], timeoutMs: number): Promise<string> {
  const last = path.join(cwd, 'last.txt');
  const args = ['exec', '--ephemeral', '--skip-git-repo-check', '--ignore-user-config', '-s', 'read-only', '-m', model,
    '-c', `model_reasoning_effort=${reasoning}`, ...shots.flatMap((shot) => ['-i', shot]), '-o', last, '-'];
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

export type JudgeProvider = 'codex' | 'claude' | 'sarvam';
export interface SavedBenchmark {
  model?: string;
  metadata?: { settings?: { provider?: string; model?: string } };
  results: SavedRun[];
}
export interface JudgeReport {
  source: string; judgeProvider: JudgeProvider; judgeModel: string; judgeModels: string[];
  siteBrokenTasks: string[]; runs: JudgedRun[];
  skipped: { task: string; approach: string; run: number; reason: string }[];
}
export interface JudgeOptions {
  provider?: JudgeProvider; model?: string; resultsDir?: string;
  saved?: SavedBenchmark; rows?: RealsiteRow[];
  write?: boolean; freshScreenshots?: boolean; requireSavedEvidence?: boolean;
  runKeys?: Set<string>; quiet?: boolean;
  expectedFrameCounts?: Map<string, number>;
  sarvamClient?: Pick<SarvamClient, 'complete'>;
}

/** Standard benchmark rows are judged too; only gated rows carry deterministic checks. */
export function builtInJudgeRows(): RealsiteRow[] {
  return TASKS.filter((task) => !task.judged).map((task) => ({
    task_id: task.id,
    website: task.site === 'local' ? 'local fixture' : 'live website',
    task: task.prompt('http://fixture.invalid'),
    level: task.category,
  }));
}

/** Only recorded model identities count; current environment settings do not describe a historical run. */
export function recordedAgentModels(saved: SavedBenchmark): string[] {
  return [...new Set([
    saved.model, saved.metadata?.settings?.model,
    ...saved.results.flatMap((r) => [r.initModel, ...(r.resolvedModels ?? []),
      ...(r.attempts ?? []).flatMap((a) => [a.initModel, ...(a.resolvedModels ?? [])])]),
  ].filter((m): m is string => typeof m === 'string' && Boolean(m.trim())).map((m) => resolveSarvamModel(m.trim())))];
}

class JudgeModelCollision extends Error {}
export function assertDifferentJudgeModel(model: string, agentModels: string[]): void {
  if (agentModels.includes(resolveSarvamModel(model))) throw new JudgeModelCollision(`Judge model ${resolveSarvamModel(model)} must differ from the recorded agent model.`);
}

export function selectSarvamJudgeModel(hasImages: boolean, explicitModel?: string): string {
  return resolveSarvamModel(explicitModel ?? (hasImages ? 'gemma-4-31b' : 'deepseek-v4.1-flash'));
}

/** Sarvam receives the same blind prompt and frames as the CLI judges, with no filesystem tools. */
export async function callSarvamJudge(client: Pick<SarvamClient, 'complete'>, prompt: string, model: string, shots: string[], options: { retries?: number; sleep?: (ms: number) => Promise<void>; evidenceIds?: string[]; requireEvidence?: boolean; onModel?: (model: string) => void } = {}): Promise<{ verdict: Verdict; reason: string; evidence?: string[]; attempts?: number; rateLimits?: number; promptTokens?: number | null; completionTokens?: number | null }> {
  const content: SarvamContentPart[] = [{ type: 'text', text: prompt }];
  for (const shot of sarvamModelSupportsImages(model) ? shots : []) {
    content.push({ type: 'text', text: `Attached image: ${path.basename(shot)}` });
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${readFileSync(shot).toString('base64')}` } });
  }
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const retries = options.retries ?? 2;
  let structuredOutput = true;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const resolved = resolveSarvamModel(model);
    const reasoningModel = ['deepseekv4.1-flash', 'glm5.3'].includes(resolved);
    let response;
    try {
      response = await client.complete({ model, messages: [{ role: 'user', content }], max_tokens: 2048, temperature: 0,
        ...(resolved === 'sarvam-105b' ? { reasoning_effort: null } : reasoningModel ? { reasoning_effort: 'low' } : {}),
        ...(structuredOutput ? { response_format: { type: 'json_object' } } : {}) });
    } catch (error) {
      // Some beta model routes do not implement response_format. Keep the strict
      // prompt and fall back to prompt-only JSON without treating that as a verdict.
      if (structuredOutput && error instanceof Error && error.message === 'Sarvam HTTP 400') { structuredOutput = false; attempt--; continue; }
      throw error;
    }
    options.onModel?.(resolveSarvamModel(response.model));
    try {
      const value: unknown = JSON.parse(response.content ?? '');
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
      const v = value as Record<string, unknown>;
      const verdicts: Verdict[] = ['success', 'failure', 'unsure', 'blocked', 'site_broken'];
      if (!verdicts.includes(v.verdict as Verdict) || typeof v.reason !== 'string' || !v.reason.trim()) throw new Error();
      if (Object.keys(v).some((key) => !['verdict', 'reason', 'evidence'].includes(key))) throw new Error();
      if ((options.requireEvidence || v.evidence !== undefined) && (!Array.isArray(v.evidence) || v.evidence.some((id) => typeof id !== 'string' || !/^F\d+$/.test(id) || (options.evidenceIds && !options.evidenceIds.includes(id))))) throw new Error();
      return { verdict: v.verdict as Verdict, reason: v.reason.trim(), ...(Array.isArray(v.evidence) ? { evidence: [...new Set(v.evidence as string[])] } : {}),
        ...(response.attempts === undefined ? {} : { attempts: response.attempts, rateLimits: response.rateLimits ?? 0,
          ...(response.usage.promptTokens === null ? {} : { promptTokens: response.usage.promptTokens }),
          ...(response.usage.completionTokens === null ? {} : { completionTokens: response.usage.completionTokens }) }) };
    } catch {
      if (attempt === retries) throw new Error('Sarvam judge returned malformed verdict JSON after retries.');
      await sleep(500 * 2 ** attempt);
    }
  }
  throw new Error('Sarvam judge returned no verdict.');
}

/** Reusable judging pipeline; calibration disables writes and fresh page loads. */
export async function judgeBenchmark(name: string, options: JudgeOptions = {}): Promise<JudgeReport> {
  if (!name || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(name)) throw new Error('Set JUDGE_IN=<result name> (reads bench/results/<name>.json).');
  const judgeProvider = options.provider ?? process.env.JUDGE_PROVIDER ?? 'codex';
  if (judgeProvider !== 'codex' && judgeProvider !== 'claude' && judgeProvider !== 'sarvam') throw new Error('JUDGE_PROVIDER must be codex, claude or sarvam.');
  if (judgeProvider === 'sarvam') loadSarvamEnv();
  const explicitModel = options.model ?? process.env.JUDGE_MODEL;
  const model = explicitModel ?? (judgeProvider === 'codex' ? 'gpt-6.1-sol' : judgeProvider === 'claude' ? 'claude-sonnet-5-5' : 'automatic (images: gemma4; text: deepseekv4.1-flash)');
  const reasoning = process.env.JUDGE_REASONING ?? 'high';
  const concurrency = Number(process.env.JUDGE_CONCURRENCY ?? (judgeProvider === 'sarvam' ? 2 : 6));
  const seed = Number(process.env.JUDGE_SEED ?? 1);
  const timeoutMs = Number(process.env.JUDGE_TIMEOUT_S ?? 240) * 1000;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('JUDGE_CONCURRENCY must be a positive integer.');
  const resultsDir = options.resultsDir ?? RESULTS;
  const jsonPath = path.join(resultsDir, `${name}.json`);
  if (!options.saved && !existsSync(jsonPath)) throw new Error(`${jsonPath} does not exist.`);
  const saved = options.saved ?? JSON.parse(readFileSync(jsonPath, 'utf8')) as SavedBenchmark;
  if (!Array.isArray(saved.results)) throw new Error('Source result has no results array.');
  const agentModels = recordedAgentModels(saved);
  if (judgeProvider !== 'sarvam' || explicitModel) assertDifferentJudgeModel(judgeProvider === 'sarvam' ? resolveSarvamModel(model) : model, agentModels);
  // Missing credentials fail before worker errors can turn them into "unsure" verdicts.
  const sarvam = judgeProvider === 'sarvam' ? options.sarvamClient ?? new SarvamClient({ timeoutMs }) : null;
  const provider = saved.metadata?.settings?.provider ?? 'codex';
  const catalog = options.rows ?? [...loadRealsiteRows(), ...builtInJudgeRows()];
  const rows = new Map(catalog.map((r) => [r.task_id, r]));
  const judgedRuns = saved.results.filter((r) => rows.has(r.task) && (!options.runKeys || options.runKeys.has(runKey(r.task, r.approach, r.run))));
  if (!judgedRuns.length) throw new Error(`${name}.json has no runs of known benchmark tasks.`);
  const logs = path.join(resultsDir, 'agent-logs', name);
  const texts = readFinalTexts(logs, provider);

  const { chromium } = await import('playwright');
  const browserHolder: { promise: ReturnType<typeof chromium.launch> | null } = { promise: null };
  const work = mkdtempSync(path.join(os.tmpdir(), 'jdg-'));
  const judged: JudgedRun[] = [];
  const skipped: JudgeReport['skipped'] = [];
  const log = (message: string): void => { if (!options.quiet) console.log(message); };

  const screenshot = async (url: string, file: string): Promise<boolean> => {
    if (options.freshScreenshots === false) return false;
    if (!/^https?:\/\//i.test(url)) return false;
    const browser = await (browserHolder.promise ??= chromium.launch({ headless: true, ...chromiumExecutable() }));
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    try {
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
      await page.screenshot({ path: file });
      return true;
    } catch { return false; } finally { await context.close().catch(() => {}); }
  };

  const prepare = async (r: SavedRun, index: number) => {
    const row = rows.get(r.task)!;
    const text = texts.get(runKey(r.task, r.approach, r.run)) ?? r.answer ?? '';
    const finalUrl = parseFinalUrl(text);
    const base = {
      task: r.task, approach: r.approach, run: r.run, finalUrl,
      toolCalls: r.toolCalls, totalInputTokens: r.totalInputTokens,
      wallS: r.timings?.cliWallMs == null ? null : r.timings.cliWallMs / 1000,
    };
    const evidenceRun = isEvidenceRun(r);
    // Per-judge folder, named by position only so nothing about the approach leaks into the path.
    const dir = path.join(work, `j${index}`);
    mkdirSync(dir, { recursive: true });
    const packet = evidenceRun && r.status !== 'connection_failure' ? buildEvidencePacket(r.evidencePath, logs, dir) : { frames: [] as PacketFrame[], texts: [] as string[], siteFailure: false };
    if (options.requireSavedEvidence && evidenceRun) {
      const sidecar = readEvidenceSidecar(r.evidencePath, logs);
      const baselineCount = options.expectedFrameCounts?.get(runKey(r.task, r.approach, r.run));
      if (!sidecar || sidecar.frames.length !== packet.frames.length || (r.evidenceFrames?.length ?? 0) !== packet.frames.length || (baselineCount !== undefined && baselineCount !== packet.frames.length)) {
        skipped.push({ task: r.task, approach: r.approach, run: r.run, reason: 'Saved evidence packet is missing or incomplete, or differs from the baseline frame count; fresh page loads are disabled.' });
        return null;
      }
    }
    const canJudge = r.status === 'success' || (r.status !== 'connection_failure' && shouldJudgeNonSuccess(r, text));
    const answer = sanitizeAnswer(text);
    // Select from the packet that will be available, before deciding whether its
    // bytes may travel to the selected Sarvam model.
    const selectedModel = judgeProvider === 'sarvam'
      ? selectSarvamJudgeModel(evidenceRun ? packet.frames.length > 0 || Boolean(canJudge && finalUrl) : Boolean(r.finalScreenshotPath), explicitModel)
      : model;
    const supportsImages = process.env.JUDGE_IMAGES === 'off' ? false : judgeProvider !== 'sarvam' || sarvamModelSupportsImages(selectedModel);
    const attached = judgeProvider !== 'claude' && supportsImages;
    let shots: string[] = [];
    let savedImages: string[] = [];
    let prompt: string;
    if (evidenceRun) {
      const fresh = canJudge && !packet.frames.length && finalUrl && await screenshot(finalUrl, path.join(dir, 'fresh.png')) ? 'fresh.png' : undefined;
      const names = fresh ? [fresh] : packet.frames.map((f) => f.image);
      savedImages = names.map((n) => path.join(dir, n));
      shots = supportsImages ? savedImages : [];
      prompt = buildEvidencePrompt({ task: row.task, website: row.website, finalUrl, answer, attached,
        imagesUnavailable: !supportsImages, freshImage: fresh && (attached ? fresh : path.join(dir, fresh)),
        frames: packet.frames.map((f) => ({ ...f, image: attached ? f.image : path.join(dir, f.image) })),
      });
    } else {
      const shot = path.join(dir, 'final.png');
      const source = canJudge ? await selectJudgeScreenshot(r.finalScreenshotPath, shot, finalUrl, screenshot, logs) : null;
      savedImages = source ? [shot] : [];
      shots = supportsImages ? savedImages : [];
      prompt = buildJudgePrompt({ task: row.task, website: row.website, finalUrl, answer, screenshotPath: source ? (attached ? 'final.png' : shot) : null, screenshotSource: source ?? undefined, attached });
    }
    if (options.requireSavedEvidence && !savedImages.length) {
      skipped.push({ task: r.task, approach: r.approach, run: r.run, reason: evidenceRun ? 'No saved evidence frame images are available; fresh page loads are disabled.' : 'No saved final screenshot is available; fresh page loads are disabled.' });
      return null;
    }
    assertDifferentJudgeModel(selectedModel, agentModels);
    return { r, text, base, evidenceRun, dir, packet, shots, prompt, selectedModel };
  };

  const judgeOne = async (prepared: NonNullable<Awaited<ReturnType<typeof prepare>>>): Promise<void> => {
    const { r, text, base, evidenceRun, dir, packet, shots, prompt, selectedModel } = prepared;
    let actualModel = selectedModel;
    const row = rows.get(r.task)!;
    let result: { verdict: Verdict; reason: string; evidence?: string[] };
    let judgeError: string | undefined;
    // Complete graders are an explicit opt-in. They may only decide a completed
    // evidence-format run; an old run, an interrupted run, or a row without a
    // final harness capture follows the normal judged/status path below.
    const deterministic = deterministicGradeForRun(row, r.status, evidenceRun, text, packet.frames);
    let grading: NonNullable<JudgedRun['grading']>;
    if (deterministic) {
      result = deterministic.pass
        ? { verdict: 'success', reason: 'Complete deterministic grader passed on the final captured state.' }
        : { verdict: 'failure', reason: `Deterministic grader failed: ${deterministic.failed.join('; ')}.` };
      grading = 'deterministic';
    } else if (r.status === 'connection_failure') {
      result = { verdict: 'unsure', reason: 'MCP connection failure; the run never started.' };
      grading = 'status';
    } else if (r.status !== 'success' && !shouldJudgeNonSuccess(r, text)) {
      result = { verdict: 'failure', reason: `The run did not finish (${r.status}).` };
      grading = 'status';
    } else {
      try {
        result = sarvam ? await callSarvamJudge(sarvam, prompt, selectedModel, shots, { requireEvidence: evidenceRun, evidenceIds: packet.frames.map((f) => f.id), onModel: (resolved) => { assertDifferentJudgeModel(resolved, agentModels); actualModel = resolved; } })
          : parseJudgeOutput(judgeProvider === 'codex'
            ? await callCodexJudge(prompt, dir, selectedModel, reasoning, shots, timeoutMs)
            : await callJudge(prompt, dir, selectedModel, timeoutMs, reasoning));
      } catch (error) {
        if (error instanceof JudgeModelCollision) throw error;
        judgeError = `judge error: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200);
        result = { verdict: 'unsure', reason: judgeError };
      }
      grading = 'judge';
    }
    const { evidence, ...plain } = result;
    result = applyRunStatus(r.status, plain);
    let extra: Partial<JudgedRun> = {};
    if (evidenceRun) {
      const judgeVerdict = grading === 'judge' ? result.verdict : undefined;
      // Deterministic answer-key checks (evidence-format rows only); a failed check overrides the judge.
      const checks = r.status === 'connection_failure' ? null : evaluateChecks(row.checks, text, packet.texts);
      if (grading !== 'deterministic' && checks && !checks.pass) result = { verdict: 'failure', reason: `Checks failed: ${checks.failed.join('; ')}. ${result.reason}`.trim() };
      extra = {
        evidence, frameCount: packet.frames.length, finalFrame: packet.frames.find((f) => f.final)?.id ?? null,
        ...(judgeVerdict ? { judgeVerdict } : {}), checks, deterministic, grading,
        siteFailure: deterministic?.pass !== true && (packet.siteFailure || judgeVerdict === 'site_broken'),
      };
    } else {
      extra = { grading };
    }
    judged.push({ ...base, ...result, ...extra, judgeModel: actualModel, ...(judgeError ? { judgeError } : {}) });
    log(`[judge] (${judged.length}/${judgedRuns.length}) ${r.task.slice(0, 8)} ... ${result.verdict}`);
  };

  try {
    const order = shuffled(judgedRuns, mulberry32(seed));
    log(`[judge] ${order.length} runs, ${Math.min(concurrency, order.length)} at a time, model ${model}`);
    // Prepare every packet and check all selected models before any billable judge request.
    const prepared: NonNullable<Awaited<ReturnType<typeof prepare>>>[] = [];
    let next = 0;
    const preparations = await Promise.allSettled(Array.from({ length: Math.min(concurrency, order.length) }, async () => {
      while (next < order.length) { const i = next++; const item = await prepare(order[i]!, i); if (item) prepared.push(item); }
    }));
    const preparationError = preparations.find((r) => r.status === 'rejected');
    if (preparationError?.status === 'rejected') throw preparationError.reason;
    next = 0;
    const calls = await Promise.allSettled(Array.from({ length: Math.min(concurrency, prepared.length) }, async () => {
      while (next < prepared.length) { const i = next++; await judgeOne(prepared[i]!); }
    }));
    const callError = calls.find((r) => r.status === 'rejected');
    if (callError?.status === 'rejected') throw callError.reason;
  } finally {
    if (browserHolder.promise) await browserHolder.promise.then((browser) => browser.close()).catch(() => {});
    try { rmSync(work, { recursive: true, force: true }); } catch { /* temp cleanup is best effort */ }
  }

  // Report in the original run order, not the shuffled judging order.
  const orderOf = (j: JudgedRun): number => saved.results.findIndex((r) => r.task === j.task && r.approach === j.approach && r.run === j.run);
  judged.sort((a, b) => orderOf(a) - orderOf(b));
  // Omitted cohort members cannot establish a universal site failure for the remaining runs.
  const judgedKeys = new Set(judged.map((r) => runKey(r.task, r.approach, r.run)));
  const omitted: JudgedRun[] = saved.results.filter((r) => rows.has(r.task) && !judgedKeys.has(runKey(r.task, r.approach, r.run))).map((r) => ({
    task: r.task, approach: r.approach, run: r.run, verdict: 'unsure', reason: 'Not rejudged.', finalUrl: null,
    toolCalls: r.toolCalls, totalInputTokens: r.totalInputTokens, wallS: null,
  }));
  const cohort = [...judged, ...omitted];
  const finalRuns = finalizeSiteBrokenVerdicts(cohort).filter((r) => judgedKeys.has(runKey(r.task, r.approach, r.run)));
  const siteBrokenTasks = [...universallySiteBrokenTasks(cohort)];
  const judgeModels = [...new Set(judged.map((r) => r.judgeModel!))];
  const judgeModel = judgeModels.length === 1 ? judgeModels[0]! : judgeModels.length ? `mixed (${judgeModels.join(', ')})` : model;
  const report: JudgeReport = { source: name, judgeProvider, judgeModel, judgeModels, siteBrokenTasks, runs: finalRuns, skipped };
  if (options.write !== false) {
    writeFileSync(path.join(resultsDir, `${name}-judged.json`), JSON.stringify(report, null, 2));
    writeFileSync(path.join(resultsDir, `${name}-judged.md`), renderJudgedMarkdown(name, finalRuns, rows, judgeModel));
    log(`[judge] wrote bench/results/${name}-judged.{json,md}`);
  }
  return report;
}

// Run only when started directly (tests import the helpers above).
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  loadSarvamEnv();
  judgeBenchmark(process.env.JUDGE_IN ?? '').catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });
}
