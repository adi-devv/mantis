import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertDifferentJudgeModel, builtInJudgeRows, callSarvamJudge, judgeBenchmark, recordedAgentModels, selectSarvamJudgeModel } from '../bench/agent/judge.js';
import type { SavedBenchmark, SavedRun } from '../bench/agent/judge.js';
import type { SarvamCompletion, SarvamRequest } from '../bench/agent/sarvam.js';

const dirs: string[] = [];
afterEach(() => { vi.unstubAllEnvs(); for (const folder of dirs.splice(0)) rmSync(folder, { recursive: true, force: true }); });
const folder = (): string => { const f = mkdtempSync(path.join(os.tmpdir(), 'sarvam-judge-')); dirs.push(f); return f; };
const completion = (content: string, model = 'gemma4'): SarvamCompletion => ({ content, model, usage: { promptTokens: 3, completionTokens: 2, cachedTokens: 0, totalTokens: 5 }, latencyMs: 1 });
const row = { task_id: 'synthetic-task', website: 'https://example.test', task: 'Find the blue item.', level: 'easy', checks: { answerIncludes: ['blue'] } };
const run = (overrides: Partial<SavedRun> = {}): SavedRun => ({ task: row.task_id, approach: 'mantis', run: 1, status: 'success', answer: 'The item is blue.', toolCalls: 1, totalInputTokens: 10, ...overrides });

describe('Sarvam judge model identity', () => {
  it('includes standard benchmark tasks in the judge catalog without treating arbitrary ids as tasks', () => {
    const rows = builtInJudgeRows();
    expect(rows.find((entry) => entry.task_id === 'form-subscribe')).toMatchObject({ website: 'local fixture' });
    expect(rows.find((entry) => entry.task_id === 'not-a-benchmark-task')).toBeUndefined();
  });

  it('selects image/text defaults and honors explicit aliases', () => {
    expect(selectSarvamJudgeModel(true)).toBe('gemma4');
    expect(selectSarvamJudgeModel(false)).toBe('deepseekv4.1-flash');
    expect(selectSarvamJudgeModel(true, 'glm-5.3')).toBe('glm5.3');
  });

  it('checks actual saved model metadata including retries, but ignores unrelated model names', () => {
    const saved: SavedBenchmark = { model: 'other-agent', metadata: { settings: { model: 'configured-agent' } }, results: [run({ initModel: 'initial-agent', resolvedModels: ['gemma4'], attempts: [{ initModel: 'retry-agent', resolvedModels: ['glm5.3'] }] })] };
    expect(recordedAgentModels(saved)).toEqual(['other-agent', 'configured-agent', 'initial-agent', 'gemma4', 'retry-agent', 'glm5.3']);
    expect(() => assertDifferentJudgeModel('gemma-4-31b', recordedAgentModels(saved))).toThrow('must differ');
    expect(() => assertDifferentJudgeModel('deepseek-v4.1-flash', recordedAgentModels(saved))).not.toThrow();
  });
});

describe('Sarvam strict judge schema', () => {
  it('accepts a legitimate unsure and sends blind image labels with inline image bytes and no tools', async () => {
    const shot = path.join(folder(), 'f1.png');
    writeFileSync(shot, 'image bytes');
    const complete = vi.fn(async (_request: SarvamRequest) => completion('{"verdict":"unsure","reason":"The required detail is not visible.","evidence":["F1"]}'));
    const result = await callSarvamJudge({ complete }, 'same judge prompt', 'gemma4', [shot], { requireEvidence: true, evidenceIds: ['F1'] });
    expect(result).toEqual({ verdict: 'unsure', reason: 'The required detail is not visible.', evidence: ['F1'] });
    const request = complete.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(request).toEqual(expect.objectContaining({ model: 'gemma4' }));
    expect(request).not.toHaveProperty('tools');
    expect(request).toMatchObject({ response_format: { type: 'json_object' }, max_tokens: 2048 });
    expect(JSON.stringify(request)).toContain('Attached image: f1.png');
    expect(JSON.stringify(request)).toContain(Buffer.from('image bytes').toString('base64'));
    expect(JSON.stringify(request)).not.toContain(path.dirname(shot));
  });

  it('retries malformed JSON/schema with backoff and rejects an invented frame near miss', async () => {
    const complete = vi.fn().mockResolvedValueOnce(completion('```json\n{}\n```')).mockResolvedValueOnce(completion('{"verdict":"success","reason":"Found it.","evidence":["F99"]}')).mockResolvedValueOnce(completion('{"verdict":"success","reason":"Found it.","evidence":["F1"]}'));
    const sleep = vi.fn(async (_ms: number) => {});
    expect(await callSarvamJudge({ complete }, 'prompt', 'gemma4', [], { sleep, requireEvidence: true, evidenceIds: ['F1'] })).toEqual({ verdict: 'success', reason: 'Found it.', evidence: ['F1'] });
    expect(sleep.mock.calls).toEqual([[500], [1000]]);
    await expect(callSarvamJudge({ complete: vi.fn(async () => completion('{"verdict":"success","reason":12}')) }, 'prompt', 'gemma4', [], { retries: 0 })).rejects.toThrow('malformed verdict JSON');
  });
});

describe('Sarvam benchmark pipeline', () => {
  it('preflights all actual packet models before any call, including a later alias collision', async () => {
    const resultsDir = folder();
    const logs = path.join(resultsDir, 'agent-logs', 'synthetic'); mkdirSync(logs, { recursive: true });
    const shot = path.join(logs, 'identifying-mantis.final.png'); writeFileSync(shot, 'image');
    const complete = vi.fn(async () => completion('{"verdict":"success","reason":"Blue item found."}'));
    const saved: SavedBenchmark = { model: 'other-agent', results: [run({ run: 1 }), run({ run: 2, finalScreenshotPath: shot, resolvedModels: ['gemma-4-31b'] })] };
    await expect(judgeBenchmark('synthetic', { provider: 'sarvam', saved, rows: [row], resultsDir, write: false, freshScreenshots: false, quiet: true, sarvamClient: { complete } })).rejects.toThrow('must differ');
    expect(complete).not.toHaveBeenCalled();
    expect(existsSync(path.join(resultsDir, 'synthetic-judged.json'))).toBe(false);
  });

  it('reuses packet prompts/checks, records mixed actual selections, and does not write when disabled', async () => {
    const resultsDir = folder();
    const logs = path.join(resultsDir, 'agent-logs', 'synthetic'); mkdirSync(logs, { recursive: true });
    const shot = path.join(logs, 'identifying-mantis.final.png'); writeFileSync(shot, 'image');
    const sidecar = path.join(logs, 'capture.evidence.json');
    writeFileSync(sidecar, JSON.stringify({ frames: [{ id: 'F1', file: path.basename(shot), url: 'https://example.test/item', text: 'The blue item', final: true }] }));
    const complete = vi.fn(async (request: SarvamRequest) => completion(JSON.stringify({ verdict: 'success', reason: 'Blue item found.', ...(request.model === 'gemma4' ? { evidence: ['F1'] } : {}) }), request.model));
    const report = await judgeBenchmark('synthetic', { provider: 'sarvam', saved: { model: 'other-agent', results: [run({ evidencePath: sidecar, evidenceFrames: ['F1'] }), run({ run: 2, approach: 'tree' })] }, rows: [row], resultsDir, write: false, freshScreenshots: false, quiet: true, sarvamClient: { complete } });
    expect(report.judgeProvider).toBe('sarvam');
    expect(report.judgeModels.sort()).toEqual(['deepseekv4.1-flash', 'gemma4']);
    expect(report.judgeModel).toContain('mixed');
    expect(report.runs[0]).toEqual(expect.objectContaining({ verdict: 'success', judgeVerdict: 'success', frameCount: 1, checks: { pass: true, failed: [] } }));
    expect(JSON.stringify(complete.mock.calls)).toContain('F1 (final, captured after the agent finished)');
    expect(JSON.stringify(complete.mock.calls)).not.toContain('identifying-mantis');
    expect(complete.mock.calls.find(([request]) => request.model === 'deepseekv4.1-flash')?.[0]).toEqual(expect.objectContaining({ reasoning_effort: 'low', max_tokens: 2048, response_format: { type: 'json_object' } }));
    expect(existsSync(path.join(resultsDir, 'synthetic-judged.json'))).toBe(false);
  });

  it('rejects a server-resolved model collision rather than retaining a verdict', async () => {
    const complete = vi.fn(async () => completion('{"verdict":"success","reason":"Found."}', 'agent-model'));
    await expect(judgeBenchmark('synthetic', { provider: 'sarvam', saved: { model: 'agent-model', results: [run()] }, rows: [row], resultsDir: folder(), write: false, freshScreenshots: false, quiet: true, sarvamClient: { complete } })).rejects.toThrow('must differ');
  });

  it('excludes a partially missing saved packet from calibration before calling the judge', async () => {
    const resultsDir = folder(); const logs = path.join(resultsDir, 'agent-logs', 'synthetic'); mkdirSync(logs, { recursive: true });
    writeFileSync(path.join(logs, 'first.png'), 'image');
    const sidecar = path.join(logs, 'packet.evidence.json');
    writeFileSync(sidecar, JSON.stringify({ frames: [{ id: 'F1', file: 'first.png', url: 'https://example.test', text: 'blue' }, { id: 'F2', file: 'missing.png', url: 'https://example.test', text: 'blue', final: true }] }));
    const complete = vi.fn(async () => completion('{"verdict":"success","reason":"Found.","evidence":["F1"]}'));
    const result = await judgeBenchmark('synthetic', { provider: 'sarvam', saved: { model: 'agent-model', results: [run({ evidencePath: sidecar, evidenceFrames: ['first.png', 'missing.png'] })] }, rows: [row], resultsDir, write: false, freshScreenshots: false, requireSavedEvidence: true, quiet: true, sarvamClient: { complete } });
    expect(result.runs).toEqual([]);
    expect(result.skipped[0]?.reason).toContain('missing or incomplete');
    expect(complete).not.toHaveBeenCalled();
  });

  it('cannot promote a site failure as universal when a cohort member was skipped', async () => {
    const resultsDir = folder(); const logs = path.join(resultsDir, 'agent-logs', 'synthetic'); mkdirSync(logs, { recursive: true });
    const shot = path.join(logs, 'capture.png'); writeFileSync(shot, 'image');
    const complete = vi.fn(async () => completion('{"verdict":"site_broken","reason":"Server error shown."}'));
    const result = await judgeBenchmark('synthetic', { provider: 'sarvam', saved: { model: 'agent-model', results: [run({ finalScreenshotPath: shot }), run({ approach: 'tree' })] }, rows: [row], resultsDir, write: false, freshScreenshots: false, requireSavedEvidence: true, quiet: true, sarvamClient: { complete } });
    expect(result.runs[0]?.verdict).toBe('failure');
    expect(result.siteBrokenTasks).toEqual([]);
    expect(result.skipped).toHaveLength(1);
  });
});
