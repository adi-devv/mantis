import { afterEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SarvamClient, estimateSarvamCost, loadSarvamEnv, resetSarvamLimiterForTests, resolveSarvamModel } from '../bench/agent/sarvam.js';

const key = 'test-only-secret';
const completion = (extra: Record<string, unknown> = {}) => Response.json({
  model: 'gemma4', choices: [{ message: { content: '{"value":7}' } }],
  usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120, prompt_tokens_details: { cached_tokens: 10 } }, ...extra,
});
const request = { model: 'gemma-4-31b', messages: [{ role: 'user', content: 'Hello' }] };

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); resetSarvamLimiterForTests(); });

describe('SarvamClient', () => {
  it('uses the verified endpoint/header, resolves model aliases, and normalizes usage', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion());
    const result = await new SarvamClient({ apiKey: key, baseUrl: 'https://example.invalid/v2/', fetch: fetcher }).complete(request);
    const [url, options] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://example.invalid/v2/chat/completions');
    expect(options?.headers).toMatchObject({ 'api-subscription-key': key });
    expect(JSON.parse(options?.body as string)).toMatchObject({ model: 'gemma4', messages: request.messages });
    expect(result).toMatchObject({ model: 'gemma4', content: '{"value":7}', usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120, cachedTokens: 10 } });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('retries 429 with Retry-After and transient 5xx with exponential backoff', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('do not log', { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(new Response('do not log', { status: 503 }))
      .mockResolvedValueOnce(completion());
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    await expect(new SarvamClient({ apiKey: key, fetch: fetcher, sleep }).complete(request)).resolves.toMatchObject({ content: '{"value":7}' });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(1_900);
    expect(sleep.mock.calls[1]?.[0]).toBe(1000);
  });

  it('records attempt, token, and 429-safe transport telemetry without response bodies', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('secret provider body', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(completion());
    const result = await new SarvamClient({ apiKey: key, fetch: fetcher, sleep: async () => {} }).complete(request);
    expect(result).toMatchObject({ attempts: 2, rateLimits: 1, usage: { promptTokens: 100, completionTokens: 20 } });
  });

  it('retries network failures without exposing exceptions', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error(key)).mockResolvedValueOnce(completion());
    const sleep = vi.fn<(ms: number) => Promise<void>>().mockResolvedValue();
    await expect(new SarvamClient({ apiKey: key, fetch: fetcher, sleep }).complete(request)).resolves.toMatchObject({ model: 'gemma4' });
    expect(sleep.mock.calls.some(([ms]) => ms >= 250 && ms <= 750)).toBe(true);
    fetcher.mockRejectedValue(new Error(key));
    await expect(new SarvamClient({ apiKey: key, fetch: fetcher, retries: 0 }).complete(request)).rejects.toThrow('Sarvam network request failed');
  });

  it('rejects malformed JSON without reflecting response bodies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(key));
    await expect(new SarvamClient({ apiKey: key, fetch: fetcher }).complete(request)).rejects.toThrow('Sarvam response was not valid JSON');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed completion schema and sanitizes HTTP failures', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ detail: key })).mockResolvedValueOnce(new Response(key, { status: 401 }));
    const client = new SarvamClient({ apiKey: key, fetch: fetcher });
    await expect(client.complete(request)).rejects.toThrow('Sarvam completion had an invalid schema');
    await expect(client.complete(request)).rejects.toThrow(/^Sarvam HTTP 401$/);
  });

  it('requires a key before making any request', () => {
    vi.stubEnv('SARVAM_API_KEY', '');
    const fetcher = vi.fn<typeof fetch>();
    expect(() => new SarvamClient({ fetch: fetcher })).toThrow('SARVAM_API_KEY is required');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('supports null text for tool calls and missing usage remains unknown', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(completion({ choices: [{ message: { content: null, reasoning_content: 'continue this opaque reasoning', tool_calls: [{ id: 'call', type: 'function', function: { name: 'record_value', arguments: '{"value":7}' } }] } }], usage: {} }));
    const result = await new SarvamClient({ apiKey: key, fetch: fetcher }).complete(request);
    expect(result.toolCalls?.[0]?.function).toEqual({ name: 'record_value', arguments: '{"value":7}' });
    expect(result.reasoningContent).toBe('continue this opaque reasoning');
    expect(result.usage).toEqual({ promptTokens: null, completionTokens: null, cachedTokens: null, totalTokens: null });
  });

  it('lists models without trusting unrelated response fields', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ data: [{ id: 'gemma4' }, { id: 12 }, null] }));
    expect(await new SarvamClient({ apiKey: key, fetch: fetcher }).listModels()).toEqual(['gemma4']);
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://api.sarvam.ai/v2/models');
  });

  it('aborts stalled requests and keeps the timeout error secret-free', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(new Error(key)), { once: true });
    }));
    await expect(new SarvamClient({ apiKey: key, fetch: fetcher, timeoutMs: 5, retries: 0 }).complete(request)).rejects.toThrow('Sarvam request timed out');
  });

  it('rejects credentials or query strings in base URLs with a static error', () => {
    for (const baseUrl of [`https://user:${key}@example.invalid/v2`, `https://example.invalid/v2?key=${key}`]) {
      expect(() => new SarvamClient({ apiKey: key, baseUrl })).toThrow(/^SARVAM_BASE_URL must be/);
    }
  });
});

describe('Sarvam configuration and cost', () => {
  it('only resolves known aliases and handles prototype-like near misses', () => {
    expect(resolveSarvamModel(' DEEPSEEK-V4.1-FLASH ')).toBe('deepseekv4.1-flash');
    expect(resolveSarvamModel('constructor')).toBe('constructor');
    expect(resolveSarvamModel('toString')).toBe('toString');
    expect(estimateSarvamCost('constructor', { promptTokens: 1, completionTokens: 1, cachedTokens: null, totalTokens: 2 })).toBeNull();
  });

  it('estimates INR from input, cache and output, and leaves missing usage unknown', () => {
    expect(estimateSarvamCost('gemma-4-31b', { promptTokens: 1_000_000, cachedTokens: 100_000, completionTokens: 100_000, totalTokens: 1_100_000 })).toBe(41.5);
    expect(estimateSarvamCost('gemma4', { promptTokens: null, cachedTokens: null, completionTokens: 2, totalTokens: null })).toBeNull();
  });

  it('loads only ignored dotenv settings and preserves the shell', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'mantis-sarvam-env-'));
    const file = path.join(directory, '.env');
    try {
      expect(spawnSync('git', ['init', '--quiet', directory], { stdio: 'ignore', windowsHide: true }).status).toBe(0);
      writeFileSync(file, `SARVAM_API_KEY=${key}\nSARVAM_BASE_URL=https://example.invalid/v2 # comment\nJUDGE_MODEL='gemma-4-31b'\nAGENT_MODEL=never-load\n`);
      vi.stubEnv('SARVAM_API_KEY', 'from-shell');
      vi.stubEnv('SARVAM_BASE_URL', undefined);
      vi.stubEnv('JUDGE_MODEL', undefined);
      vi.stubEnv('AGENT_MODEL', undefined);
      expect(loadSarvamEnv(file)).toBe(false);
      expect(process.env.JUDGE_MODEL).toBeUndefined();
      writeFileSync(path.join(directory, '.gitignore'), '.env\n');
      expect(loadSarvamEnv(file)).toBe(true);
      expect(process.env.SARVAM_API_KEY).toBe('from-shell');
      expect(process.env.SARVAM_BASE_URL).toBe('https://example.invalid/v2');
      expect(process.env.JUDGE_MODEL).toBe('gemma-4-31b');
      expect(process.env.AGENT_MODEL).toBeUndefined();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
