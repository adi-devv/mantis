/** Rejudge saved Sol baselines without changing baseline files or loading fresh pages. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { judgeBenchmark, recordedAgentModels, runKey } from './judge.js';
import type { JudgeOptions, JudgeReport, JudgedRun, SavedBenchmark, Verdict } from './judge.js';
import { loadRealsiteRows } from './realsite.js';
import type { RealsiteRow } from './realsite.js';
import { loadSarvamEnv, SarvamClient } from './sarvam.js';

export const CALIBRATION_VERDICTS: Verdict[] = ['success', 'failure', 'unsure', 'blocked', 'site_broken'];
export interface Agreement {
  total: number; matches: number; matrix: number[][];
}
export interface CalibrationIssue { source: string; identity?: string; kind: 'skipped' | 'unmatched' | 'error'; reason: string }
export interface CalibrationDisagreement {
  source: string; task: string; approach: string; run: number;
  old: Verdict; new: Verdict; oldRaw: Verdict; newRaw: Verdict;
  rawProxy: boolean; oldReason: string; newReason: string;
}
export interface CalibrationReport {
  final: Agreement; raw: Agreement; rawProxyPairs: number; independentRawPairs: number;
  disagreements: CalibrationDisagreement[]; issues: CalibrationIssue[]; sources: string[];
}
export interface CalibrationOptions {
  resultsDir?: string; names?: string[]; rows?: RealsiteRow[];
  judge?: (name: string, options: JudgeOptions) => Promise<JudgeReport>;
  model?: string;
}

const emptyAgreement = (): Agreement => ({ total: 0, matches: 0, matrix: CALIBRATION_VERDICTS.map(() => CALIBRATION_VERDICTS.map(() => 0)) });
export const createCalibrationReport = (): CalibrationReport => ({ final: emptyAgreement(), raw: emptyAgreement(), rawProxyPairs: 0, independentRawPairs: 0, disagreements: [], issues: [], sources: [] });
const identity = (r: Pick<JudgedRun, 'task' | 'approach' | 'run'>): string => runKey(r.task, r.approach, r.run);
function countAgreement(stats: Agreement, old: Verdict, current: Verdict): void {
  stats.total++;
  if (old === current) stats.matches++;
  stats.matrix[CALIBRATION_VERDICTS.indexOf(old)]![CALIBRATION_VERDICTS.indexOf(current)]!++;
}

/** Match exact task/approach/repetition identities; failed judge calls never become "unsure" agreement data. */
export function compareCalibration(source: string, baseline: JudgedRun[], current: JudgeReport, report = createCalibrationReport()): CalibrationReport {
  const oldByKey = new Map(baseline.map((r) => [identity(r), r]));
  const seen = new Set<string>();
  for (const skip of current.skipped) {
    seen.add(identity(skip));
    report.issues.push({ source, identity: identity(skip), kind: 'skipped', reason: skip.reason });
  }
  for (const run of current.runs) {
    const key = identity(run);
    const old = oldByKey.get(key);
    seen.add(key);
    if (!old) { report.issues.push({ source, identity: key, kind: 'unmatched', reason: 'Sarvam run has no matching Sol baseline.' }); continue; }
    if (run.judgeError || old.judgeError || /^judge error:|^unparseable judge reply:/i.test(old.reason)) { report.issues.push({ source, identity: key, kind: 'error', reason: run.judgeError ?? old.judgeError ?? 'Sol baseline has a judge error, not a verdict.' }); continue; }
    if (!CALIBRATION_VERDICTS.includes(old.verdict) || !CALIBRATION_VERDICTS.includes(run.verdict)) {
      report.issues.push({ source, identity: key, kind: 'error', reason: 'Invalid verdict in calibration input.' }); continue;
    }
    const oldRaw = old.judgeVerdict ?? old.verdict;
    const newRaw = run.judgeVerdict ?? run.verdict;
    if (!CALIBRATION_VERDICTS.includes(oldRaw) || !CALIBRATION_VERDICTS.includes(newRaw)) {
      report.issues.push({ source, identity: key, kind: 'error', reason: 'Invalid raw judge verdict in calibration input.' }); continue;
    }
    const rawProxy = old.judgeVerdict === undefined || run.judgeVerdict === undefined;
    countAgreement(report.final, old.verdict, run.verdict);
    countAgreement(report.raw, oldRaw, newRaw);
    if (rawProxy) report.rawProxyPairs++; else report.independentRawPairs++;
    if (old.verdict !== run.verdict || oldRaw !== newRaw) report.disagreements.push({
      source, task: run.task, approach: run.approach, run: run.run,
      old: old.verdict, new: run.verdict, oldRaw, newRaw, rawProxy,
      oldReason: old.reason, newReason: run.reason,
    });
  }
  for (const old of baseline) if (!seen.has(identity(old))) report.issues.push({ source, identity: identity(old), kind: 'unmatched', reason: 'Sol baseline run was not rejudged (task row or source run missing).' });
  return report;
}

/** All outputs are returned to the caller; this command never writes a baseline, raw result, or report file. */
export async function calibrateSarvam(options: CalibrationOptions = {}): Promise<CalibrationReport> {
  const resultsDir = options.resultsDir ?? path.resolve(import.meta.dirname, '..', 'results');
  const rows = options.rows ?? loadRealsiteRows();
  const names = options.names?.map((n) => n.replace(/-judged\.json$/, ''));
  if (names?.some((n) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(n))) throw new Error('Calibration names must be result basenames, without paths.');
  const files = names ? names.map((n) => `${n}-judged.json`) : readdirSync(resultsDir).filter((f) => f.endsWith('-judged.json')).sort();
  const report = createCalibrationReport();
  for (const file of files) {
    const label = file.replace(/-judged\.json$/, '');
    try {
      const baseline = JSON.parse(readFileSync(path.join(resultsDir, file), 'utf8')) as { source?: string; judgeModel?: string; judgeProvider?: string; runs?: JudgedRun[] };
      if (baseline.judgeModel !== 'gpt-6.1-sol' || (baseline.judgeProvider && baseline.judgeProvider !== 'codex')) {
        report.issues.push({ source: label, kind: 'skipped', reason: 'Not a Codex gpt-6.1-sol baseline.' }); continue;
      }
      const source = baseline.source;
      if (!source || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(source) || !Array.isArray(baseline.runs)) {
        report.issues.push({ source: label, kind: 'skipped', reason: 'Baseline is missing valid source metadata or runs; cannot reconstruct its original judge packet.' }); continue;
      }
      const rawPath = path.join(resultsDir, `${source}.json`);
      if (!existsSync(rawPath)) { report.issues.push({ source, kind: 'skipped', reason: 'Original raw result is missing; cannot reconstruct agent replies and evidence paths.' }); continue; }
      const saved = JSON.parse(readFileSync(rawPath, 'utf8')) as SavedBenchmark;
      if (!Array.isArray(saved.results) || !recordedAgentModels(saved).length) { report.issues.push({ source, kind: 'skipped', reason: 'Original raw result is missing results or saved agent model metadata.' }); continue; }
      const keys = new Set(baseline.runs.map(identity));
      const eligible = saved.results.some((r) => keys.has(identity(r)) && rows.some((row) => row.task_id === r.task));
      if (!eligible) { report.issues.push({ source, kind: 'skipped', reason: 'No matching original source runs and task rows (check bench/agent/realsite-tasks.json).' }); continue; }
      const current = await (options.judge ?? judgeBenchmark)(source, {
        provider: 'sarvam', model: options.model, resultsDir, saved, rows,
        write: false, freshScreenshots: false, requireSavedEvidence: true, runKeys: keys, quiet: true,
        expectedFrameCounts: new Map(baseline.runs.filter((r) => r.frameCount !== undefined).map((r) => [identity(r), r.frameCount!])),
      });
      report.sources.push(source);
      compareCalibration(source, baseline.runs, current, report);
    } catch (error) {
      // No provider responses or credentials are included in this report.
      report.issues.push({ source: label, kind: 'error', reason: error instanceof Error ? error.message : 'Calibration failed.' });
    }
  }
  return report;
}

export function renderCalibration(report: CalibrationReport): string {
  const lines = ['Sarvam vs gpt-6.1-sol calibration (saved evidence only; no files modified)'];
  for (const [name, stats] of [['Final verdict', report.final], ['Raw judge verdict', report.raw]] as const) {
    lines.push('', `${name} exact agreement: ${stats.matches}/${stats.total}${stats.total ? ` (${(100 * stats.matches / stats.total).toFixed(1)}%)` : ' (no comparable runs)'}`,
      'Confusion matrix: rows = Sol, columns = Sarvam',
      `| Sol \\ Sarvam | ${CALIBRATION_VERDICTS.join(' | ')} |`,
      `|---|${CALIBRATION_VERDICTS.map(() => '---:').join('|')}|`);
    CALIBRATION_VERDICTS.forEach((v, i) => lines.push(`| ${v} | ${stats.matrix[i]!.join(' | ')} |`));
  }
  lines.push('', `Raw comparison: ${report.independentRawPairs} pairs have independent judgeVerdict values; ${report.rawProxyPairs} use a final-verdict proxy where judgeVerdict was not saved.`, '', 'Per-task disagreements:');
  if (!report.disagreements.length) lines.push('None.');
  for (const d of report.disagreements) lines.push(`- ${d.source}: ${d.task} / ${d.approach} / run ${d.run}: final ${d.old} -> ${d.new}; raw ${d.oldRaw} -> ${d.newRaw}${d.rawProxy ? ' (final proxy)' : ''}`, `  Sol: ${d.oldReason}`, `  Sarvam: ${d.newReason}`);
  lines.push('', 'Skipped / unmatched / errors (excluded from agreement):');
  if (!report.issues.length) lines.push('None.');
  for (const issue of report.issues) lines.push(`- ${issue.kind}: ${issue.source}${issue.identity ? ` / ${issue.identity}` : ''}: ${issue.reason}`);
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  loadSarvamEnv();
  // Validate credentials/configuration once, before processing baseline files.
  try { new SarvamClient(); } catch (error) { console.error(error instanceof Error ? error.message : 'Sarvam configuration failed.'); process.exit(1); }
  const names = process.argv.slice(2).flatMap((n) => n.split(',')).filter(Boolean);
  const selected = names.length ? names : process.env.CALIBRATE_IN?.split(',').map((n) => n.trim()).filter(Boolean);
  calibrateSarvam({ names: selected }).then((report) => { console.log(renderCalibration(report)); if (report.issues.some((i) => i.kind === 'error')) process.exitCode = 1; }).catch((error) => { console.error(error instanceof Error ? error.message : 'Calibration failed.'); process.exitCode = 1; });
}
