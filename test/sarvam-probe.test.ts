import { afterEach, describe, expect, it, vi } from 'vitest';
import { probeSarvam, sarvamProbeMain, SARVAM_CANDIDATES } from '../bench/agent/sarvam-probe.js';
import type { SarvamRequest, SarvamCompletion } from '../bench/agent/sarvam.js';

const result = (request: SarvamRequest): SarvamCompletion => ({
  model: request.model,
  content: request.tools ? null : Array.isArray(request.messages[0]?.content) ? 'red' : request.messages[0]?.content === 'Reply with OK.' ? 'OK' : '{"value":7}',
  ...(request.tools ? { toolCalls: [{ type: 'function', function: { name: 'record_value', arguments: '{"value":7}' } }] } : {}),
  usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14, cachedTokens: 0 }, latencyMs: 200,
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Sarvam capability probe', () => {
  it('tests every candidate and validates JSON, image semantics and tool arguments', async () => {
    const complete = vi.fn(async (request: SarvamRequest) => result(request));
    const listModels = vi.fn(async () => ['sarvam-105b', 'gemma4', 'deepseekv4.1-flash', 'glm5.3']);
    const rows = await probeSarvam({ complete, listModels });
    expect(rows.map(row => row.model)).toEqual(SARVAM_CANDIDATES);
    expect(complete).toHaveBeenCalledTimes(36);
    expect(rows.every(row => row.listed === 'yes' && row.responds && row.promptJson === '3/3' && row.formatJson === '3/3' && row.image && row.tools && row.errors === 0)).toBe(true);
    expect(rows[0]).toMatchObject({ promptTokens: 90, completionTokens: 36, medianMs: 200, unknownUsage: false });
    expect(rows[0]!.estimatedInr).toBeGreaterThan(0);
    for (const [request] of complete.mock.calls) {
      if (request.response_format) expect(request.messages[0]!.content).not.toMatch(/json/i);
      if (request.model.startsWith('deepseek') || request.model.startsWith('glm')) expect(request).toMatchObject({ reasoning_effort: 'low', max_tokens: 2048 });
    }
  });

  it('continues after denied capabilities and rejects JSON or tool near misses', async () => {
    const complete = vi.fn(async (request: SarvamRequest) => {
      if (request.model === 'sarvam-105b') throw new Error('denied');
      const response = result(request);
      if (Array.isArray(request.messages[0]?.content)) response.content = 'blue';
      else if (request.tools) response.toolCalls![0]!.function.arguments = '{"value":"7"}';
      else if (request.messages[0]?.content !== 'Reply with OK.') response.content = '```json\n{"value":7}\n```';
      return response;
    });
    const rows = await probeSarvam({ complete, listModels: async () => { throw new Error('not supported'); } });
    expect(rows[0]).toMatchObject({ listed: '?', responds: false, errors: 9, medianMs: null, unknownUsage: true });
    expect(rows[1]).toMatchObject({ listed: '?', responds: true, promptJson: '0/3', formatJson: '0/3', image: false, tools: false });
    expect(complete).toHaveBeenCalledTimes(36);
  });

  it('requires at least three reliability samples', async () => {
    const complete = vi.fn(async (request: SarvamRequest) => result(request));
    await expect(probeSarvam({ complete, listModels: async () => [] }, 1)).rejects.toThrow('from 3 to 20');
    expect(complete).not.toHaveBeenCalled();
  });

  it('reports budget-limited responses separately', async () => {
    const rows = await probeSarvam({ complete: async request => ({ ...result(request), finishReason: 'length' }), listModels: async () => [] });
    expect(rows.every(row => row.budgetLimited === 9)).toBe(true);
  });

  it('requires actual function calls rather than text or another tool type', async () => {
    const rows = await probeSarvam({ complete: async request => {
      const response = result(request);
      if (request.tools && request.model === 'sarvam-105b') response.toolCalls![0]!.type = 'other';
      if (request.tools && request.model === 'gemma-4-31b') {
        response.toolCalls = [];
        response.content = '{"name":"record_value","arguments":{"value":7}}';
      }
      return response;
    }, listModels: async () => [] });
    expect(rows.map(row => row.tools)).toEqual([false, false, true, true]);
  });

  it('fails the command before networking when the key is missing', async () => {
    vi.stubEnv('SARVAM_API_KEY', '');
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const table = vi.spyOn(console, 'table').mockImplementation(() => {});
    await expect(sarvamProbeMain()).rejects.toThrow('SARVAM_API_KEY is required');
    expect(fetcher).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(table).not.toHaveBeenCalled();
  });
});
