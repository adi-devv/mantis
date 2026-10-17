import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { calibrateSarvam, compareCalibration, renderCalibration } from '../bench/agent/sarvam-calibrate.js';
import { judgeBenchmark } from '../bench/agent/judge.js';
import type { JudgeOptions, JudgeReport, JudgedRun, Verdict } from '../bench/agent/judge.js';
import type { SarvamRequest } from '../bench/agent/sarvam.js';

const dirs: string[] = [];
afterEach(() => { for (const folder of dirs.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const folder = (): string => { const f = mkdtempSync(path.join(os.tmpdir(), 'sarvam-calibration-')); dirs.push(f); return f; };
const run = (approach: string, verdict: Verdict, n = 1): JudgedRun => ({ task: 'synthetic-task', approach, run: n, verdict, reason: `${verdict} reason`, finalUrl: null, toolCalls: 1, totalInputTokens: 10, wallS: 1 });
const report = (runs: JudgedRun[]): JudgeReport => ({ source: 'synthetic', judgeProvider: 'sarvam', judgeModel: 'gemma4', judgeModels: ['gemma4'], siteBrokenTasks: [], runs, skipped: [] });

describe('Sarvam calibration agreement', () => {
  it('matches task, approach, and repetition, and exposes raw disagreements masked by checks', () => {
    const baseline = [{ ...run('mantis', 'failure'), judgeVerdict: 'success' as const }, run('tree', 'success'), run('mantis', 'blocked', 2)];
    const current = report([run('tree', 'success'), { ...run('mantis', 'failure'), judgeVerdict: 'unsure' }, run('mantis', 'failure', 2)]);
    const calibration = compareCalibration('synthetic', baseline, current);
    expect(calibration.final.total).toBe(3);
    expect(calibration.final.matches).toBe(2);
    expect(calibration.final.matrix[0]?.[0]).toBe(1);
    expect(calibration.final.matrix[3]?.[1]).toBe(1);
    expect(calibration.raw.matches).toBe(1);
    expect(calibration.independentRawPairs).toBe(1);
    expect(calibration.rawProxyPairs).toBe(2);
    expect(calibration.disagreements.map((d) => [d.approach, d.run, d.old, d.new])).toEqual([['mantis', 1, 'failure', 'failure'], ['mantis', 2, 'blocked', 'failure']]);
    expect(renderCalibration(calibration)).toContain('2 use a final-verdict proxy');
    expect(renderCalibration(calibration)).toContain('synthetic-task / mantis / run 2');
  });

  it('keeps unmatched identities and judge errors out of the confusion matrix', () => {
    const current = report([{ ...run('mantis', 'unsure'), judgeError: 'Sarvam HTTP 429' }, run('tree', 'success', 2)]);
    current.skipped.push({ task: 'synthetic-task', approach: 'screenshot', run: 1, reason: 'No saved screenshot.' });
    const calibration = compareCalibration('synthetic', [run('mantis', 'success'), run('tree', 'success'), run('screenshot', 'success')], current);
    expect(calibration.final.total).toBe(0);
    expect(calibration.issues.map((i) => i.kind).sort()).toEqual(['error', 'skipped', 'unmatched', 'unmatched']);
    expect(calibration.issues.some((i) => i.identity === 'synthetic-task|tree|1')).toBe(true);
    const invalid = compareCalibration('synthetic', [{ ...run('mantis', 'failure'), judgeVerdict: 'bogus' as Verdict }], report([run('mantis', 'failure')]));
    expect(invalid.final.total).toBe(0);
    expect(invalid.issues[0]?.reason).toContain('Invalid raw');
  });

  it('reports deterministic and status routing separately from model agreement', () => {
    const baseline = [{ ...run('mantis', 'success'), grading: 'deterministic' as const }, { ...run('tree', 'failure'), grading: 'status' as const }];
    const current = report([{ ...run('mantis', 'success'), grading: 'deterministic' as const }, { ...run('tree', 'failure'), grading: 'judge' as const }]);
    const calibration = compareCalibration('synthetic', baseline, current);
    expect(calibration.final.total).toBe(0);
    expect(calibration.routing).toEqual({ deterministic: 1, status: 0, mixed: 1 });
    expect(renderCalibration(calibration)).toContain('Routing outcomes excluded from model agreement');
  });
});

describe('Sarvam calibration saved-source pipeline', () => {
  it('reuses saved image evidence, skips a missing-image near miss, and leaves all originals byte-identical', async () => {
    const resultsDir = folder();
    const logs = path.join(resultsDir, 'agent-logs', 'synthetic'); mkdirSync(logs, { recursive: true });
    const shot = path.join(logs, 'source-mantis.final.png'); writeFileSync(shot, 'image bytes');
    const rawPath = path.join(resultsDir, 'synthetic.json');
    const baselinePath = path.join(resultsDir, 'synthetic-judged.json');
    writeFileSync(rawPath, JSON.stringify({ model: 'agent-model', results: ['mantis', 'tree'].map((approach) => ({ task: 'synthetic-task', approach, run: 1, status: 'success', answer: 'The blue item.', finalScreenshotPath: approach === 'mantis' ? shot : path.join(logs, 'missing.png'), toolCalls: 1, totalInputTokens: 10 })) }));
    writeFileSync(baselinePath, JSON.stringify({ source: 'synthetic', judgeModel: 'gpt-6.1-sol', runs: [run('mantis', 'failure'), run('tree', 'success')] }));
    const originalRaw = readFileSync(rawPath, 'utf8'); const originalBaseline = readFileSync(baselinePath, 'utf8');
    const complete = vi.fn(async (request: SarvamRequest) => ({ content: '{"verdict":"success","reason":"Blue item shown."}', model: request.model, usage: { promptTokens: null, completionTokens: null, cachedTokens: null, totalTokens: null }, latencyMs: 1 }));
    const judge = vi.fn(async (name: string, options: JudgeOptions) => {
      expect(options).toEqual(expect.objectContaining({ provider: 'sarvam', write: false, freshScreenshots: false, requireSavedEvidence: true }));
      return judgeBenchmark(name, { ...options, sarvamClient: { complete } });
    });
    const calibration = await calibrateSarvam({ resultsDir, names: ['synthetic'], rows: [{ task_id: 'synthetic-task', task: 'Find the blue item.', website: 'https://example.test', level: 'easy' }], judge });
    expect(complete).toHaveBeenCalledOnce();
    expect(calibration.final.total).toBe(1);
    expect(calibration.disagreements[0]).toEqual(expect.objectContaining({ approach: 'mantis', old: 'failure', new: 'success' }));
    expect(calibration.issues).toEqual([expect.objectContaining({ kind: 'skipped', identity: 'synthetic-task|tree|1', reason: expect.stringContaining('No saved final screenshot') })]);
    expect(readFileSync(rawPath, 'utf8')).toBe(originalRaw);
    expect(readFileSync(baselinePath, 'utf8')).toBe(originalBaseline);
    expect(readdirSync(resultsDir).sort()).toEqual(['agent-logs', 'synthetic-judged.json', 'synthetic.json']);
  });

  it('skips non-Sol and metadata-free baselines without requesting a judge', async () => {
    const resultsDir = folder();
    writeFileSync(path.join(resultsDir, 'other-judged.json'), JSON.stringify({ source: 'other', judgeModel: 'claude-sonnet-5-5', runs: [] }));
    writeFileSync(path.join(resultsDir, 'broken-judged.json'), JSON.stringify({ judgeModel: 'gpt-6.1-sol', runs: [] }));
    const judge = vi.fn();
    const calibration = await calibrateSarvam({ resultsDir, rows: [], judge });
    expect(judge).not.toHaveBeenCalled();
    expect(calibration.final.total).toBe(0);
    expect(calibration.issues.map((i) => i.reason)).toEqual([expect.stringContaining('source metadata'), expect.stringContaining('Not a Codex')]);
  });
});
