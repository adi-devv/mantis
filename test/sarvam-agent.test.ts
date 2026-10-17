import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { SarvamClient } from '../bench/agent/sarvam.js';
import { mcpToolsToOpenAi, runSarvamAgent, SARVAM_IMAGE_HISTORY_LIMIT, trimSarvamImageHistory } from '../bench/agent/sarvam-agent.js';
import type { SarvamMessage } from '../bench/agent/sarvam.js';

const key = 'test-only-secret';
const reply = (message: object) => Response.json({ model: 'gemma4', choices: [{ message }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12, prompt_tokens_details: { cached_tokens: 0 } } });
const tools = { tools: [{ name: 'open', description: 'open a URL', inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] } }] };
const base = (client: SarvamClient, mcp: { call: ReturnType<typeof vi.fn> }, maxSteps = 4) => runSarvamAgent({ client, mcp, model: 'gemma-4-31b', prompt: 'Do the task', server: 'mantis', allow: ['mcp__mantis'], deny: ['mcp__mantis__bench_capture'], maxSteps });

describe('Sarvam benchmark agent loop', () => {
  it('keeps the Sarvam result-summary runner syntactically loadable', async () => {
    const source = readFileSync(new URL('../bench/agent/run.ts', import.meta.url), 'utf8');
    await expect(transform(source, { loader: 'ts', format: 'esm', target: 'node20' })).resolves.toMatchObject({ code: expect.any(String) });
    expect(source).toContain("process.env.BENCH_SCREENSHOT_MCP");
    expect(source).toContain("SCREENSHOT_MCP.endsWith('.ts')");
  });

  it('round-trips an OpenAI-style tool call through fake MCP using mocked fetch', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(reply({ content: null, reasoning_content: 'internal chain preserved', tool_calls: [{ id: 'one', type: 'function', function: { name: 'open', arguments: '{"url":"https://fixture.test"}' } }] }))
      .mockResolvedValueOnce(reply({ content: 'ANSWER: done' }));
    const client = new SarvamClient({ apiKey: key, fetch: fetcher });
    const mcp = { call: vi.fn().mockResolvedValueOnce(tools).mockResolvedValueOnce({ content: [{ type: 'text', text: 'opened' }] }) };
    const result = await base(client, mcp);
    expect(mcp.call).toHaveBeenNthCalledWith(1, 'tools/list', {}, undefined);
    expect(mcp.call).toHaveBeenNthCalledWith(2, 'tools/call', { name: 'open', arguments: { url: 'https://fixture.test' } }, undefined);
    expect(result).toMatchObject({ resultText: 'ANSWER: done', toolCalls: 1, turns: 2, connected: true, totalInputTokens: 20 });
    const second = JSON.parse(fetcher.mock.calls[1]![1]?.body as string);
    expect(second.messages.at(-2)).toMatchObject({ role: 'assistant', reasoning_content: 'internal chain preserved' });
    expect(second.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'one', content: 'opened' });
    expect(JSON.parse(fetcher.mock.calls[0]![1]?.body as string)).toMatchObject({ max_tokens: 2048 });
  });

  it('gives 105b a completion budget and explicitly disables its thinking mode', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply({ content: 'ANSWER: done' }));
    const mcp = { call: vi.fn().mockResolvedValue(tools) };
    await runSarvamAgent({ client: new SarvamClient({ apiKey: key, fetch: fetcher }), mcp, model: 'sarvam-105b', prompt: 'Do it', server: 'mantis', allow: ['mcp__mantis'], maxSteps: 1 });
    expect(JSON.parse(fetcher.mock.calls[0]![1]?.body as string)).toMatchObject({ model: 'sarvam-105b', max_tokens: 2048, reasoning_effort: null });
  });

  it('returns the malformed-JSON retry to the model once, without calling MCP', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [{ id: 'bad', type: 'function', function: { name: 'open', arguments: '{bad' } }] }))
      .mockResolvedValueOnce(reply({ content: 'ANSWER: recovered' }));
    const mcp = { call: vi.fn().mockResolvedValue(tools) };
    const result = await base(new SarvamClient({ apiKey: key, fetch: fetcher }), mcp);
    expect(result.resultText).toBe('ANSWER: recovered');
    expect(result.toolErrors).toBe(1);
    expect(mcp.call).toHaveBeenCalledTimes(1);
    const retry = JSON.parse(fetcher.mock.calls[1]![1]?.body as string);
    expect(retry.messages.at(-1).content).toContain('Retry');
  });

  it('ends cleanly at the configured step budget', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => reply({ content: null, tool_calls: [{ id: 'again', type: 'function', function: { name: 'open', arguments: '{"url":"https://fixture.test"}' } }] }));
    const mcp = { call: vi.fn().mockResolvedValueOnce(tools).mockResolvedValue({ content: [{ type: 'text', text: 'opened' }] }) };
    const result = await base(new SarvamClient({ apiKey: key, fetch: fetcher }), mcp, 2);
    expect(result).toMatchObject({ resultError: true, resultText: 'Agent step budget exhausted.', toolCalls: 2, turns: 2 });
  });

  it('normalizes MCP schemas and carries screenshot bytes in a separate vision turn', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [{ id: 'shot', type: 'function', function: { name: 'open', arguments: '{}' } }] }))
      .mockResolvedValueOnce(reply({ content: 'FINAL_URL: https://fixture.test/done' }));
    const trace: unknown[] = [];
    const mcp = { call: vi.fn().mockResolvedValueOnce({ tools: [{ name: 'open', inputSchema: { $schema: 'https://example.test/schema', type: 'object', properties: {} } }] })
      .mockResolvedValueOnce({ content: [{ type: 'text', text: 'opened' }, { type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' }] }) };
    await runSarvamAgent({ client: new SarvamClient({ apiKey: key, fetch: fetcher }), mcp, model: 'gemma-4-31b', prompt: 'Do it', server: 'mantis', allow: ['mcp__mantis'], maxSteps: 2, trace: (event) => trace.push(event) });
    const second = JSON.parse(fetcher.mock.calls[1]![1]?.body as string);
    expect(second.tools[0].function.parameters).not.toHaveProperty('$schema');
    expect(second.messages.at(-2)).toMatchObject({ role: 'tool', tool_call_id: 'shot', content: 'opened' });
    expect(second.messages.at(-1)).toMatchObject({ role: 'user' });
    expect(second.messages.at(-1).content.some((part: { type: string }) => part.type === 'image_url')).toBe(true);
    expect(trace).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'sarvam.tool_result', arguments: {}, resultText: 'opened' }),
      expect.objectContaining({ type: 'sarvam.summary', resultText: 'FINAL_URL: https://fixture.test/done' }),
    ]));
  });

  it('finishes every tool reply in a batch before appending image observations', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [
        { id: 'one', type: 'function', function: { name: 'open', arguments: '{}' } },
        { id: 'two', type: 'function', function: { name: 'open', arguments: '{}' } },
      ] }))
      .mockResolvedValueOnce(reply({ content: 'done' }));
    const mcp = { call: vi.fn().mockResolvedValueOnce(tools)
      .mockResolvedValueOnce({ content: [{ type: 'image', data: 'aQ==', mimeType: 'image/png' }] })
      .mockResolvedValueOnce({ content: [{ type: 'image', data: 'ag==', mimeType: 'image/png' }] }) };
    await runSarvamAgent({ client: new SarvamClient({ apiKey: key, fetch: fetcher }), mcp, model: 'gemma-4-31b', prompt: 'Do it', server: 'mantis', allow: ['mcp__mantis'], maxSteps: 2 });
    const messages = JSON.parse(fetcher.mock.calls[1]![1]?.body as string).messages;
    expect(messages.slice(-3).map((message: { role: string }) => message.role)).toEqual(['tool', 'tool', 'user']);
    expect(messages.at(-3)).toMatchObject({ tool_call_id: 'one' });
    expect(messages.at(-2)).toMatchObject({ tool_call_id: 'two' });
  });

  it('does not send image bytes to a non-vision model', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(reply({ content: null, tool_calls: [{ id: 'shot', type: 'function', function: { name: 'open', arguments: '{}' } }] }))
      .mockResolvedValueOnce(reply({ content: 'done' }));
    const mcp = { call: vi.fn().mockResolvedValueOnce(tools).mockResolvedValueOnce({ content: [{ type: 'image', data: 'aW1hZ2U=', mimeType: 'image/png' }] }) };
    await runSarvamAgent({ client: new SarvamClient({ apiKey: key, fetch: fetcher }), mcp, model: 'glm-5.3', prompt: 'Do it', server: 'mantis', allow: ['mcp__mantis'], maxSteps: 2 });
    expect(JSON.stringify(JSON.parse(fetcher.mock.calls[1]![1]?.body as string).messages)).not.toContain('image_url');
    expect(mcpToolsToOpenAi({ tools: [{ name: 'ignored', inputSchema: { type: 'object' } }] }, 'mantis', ['mcp__other'])).toEqual([]);
  });

  it('caps long screenshot history while retaining the latest image observations', () => {
    const messages: SarvamMessage[] = Array.from({ length: SARVAM_IMAGE_HISTORY_LIMIT + 3 }, (_, index) => ({
      role: 'user', content: [{ type: 'text', text: `screenshot ${index}` }, { type: 'image_url', image_url: { url: `data:image/png;base64,${index}` } }],
    }));
    trimSarvamImageHistory(messages);
    const images = messages.flatMap((message) => Array.isArray(message.content) ? message.content : []).filter((part) => part.type === 'image_url');
    expect(images).toHaveLength(SARVAM_IMAGE_HISTORY_LIMIT);
    expect(messages.slice(0, 3).every((message) => JSON.stringify(message.content).includes('Earlier image observation omitted'))).toBe(true);
    expect(messages.at(-1)?.content).toEqual([{ type: 'text', text: `screenshot ${SARVAM_IMAGE_HISTORY_LIMIT + 2}` }, { type: 'image_url', image_url: { url: `data:image/png;base64,${SARVAM_IMAGE_HISTORY_LIMIT + 2}` } }]);
  });

  it('leaves an image history below the cap untouched', () => {
    const messages: SarvamMessage[] = [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,aQ==' } }] }];
    const content = messages[0]!.content;
    trimSarvamImageHistory(messages);
    expect(messages[0]!.content).toBe(content);
  });
});
