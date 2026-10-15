import { describe, expect, it } from 'vitest';
import {
  aggregateUsage, assertCompatibleResume, classifyAttempt, makeMetadata, parseClaudeStream, validateFlag, validatePositiveInt,
} from '../bench/agent/integrity.js';

describe('real-agent benchmark integrity helpers', () => {
  it('parses connected stream events and keeps normal and cache token counts separate', () => {
    const parsed = parseClaudeStream([
      JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-4-6', mcp_servers: [{ name: 'mantis', status: 'connected' }] }),
      JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-4-6-20250514', content: [{ type: 'tool_use', name: 'read' }] } }),
      JSON.stringify({ type: 'result', result: 'ANSWER: 42', num_turns: 2, is_error: false, total_cost_usd: 0.012, usage: { input_tokens: 100, cache_creation_input_tokens: 30, cache_read_input_tokens: 50, output_tokens: 12 } }),
    ].join('\n'));
    expect(parsed.connected).toBe(true);
    expect(parsed.toolCalls).toBe(1);
    expect(parsed.resolvedModels).toEqual(['claude-sonnet-4-6', 'claude-sonnet-4-6-20250514']);
    expect(parsed.usage).toEqual({ inputTokens: 100, cacheWriteTokens: 30, cacheReadTokens: 50, outputTokens: 12, costUsd: 0.012 });
  });

  it('does not count repeated assistant message snapshots twice or invent absent cache counts', () => {
    const message = { id: 'msg-1', model: 'claude-sonnet-4-6-20250514', usage: { input_tokens: 10, output_tokens: 2 }, content: [{ type: 'tool_use', id: 'tool-1', name: 'read' }] };
    const parsed = parseClaudeStream([
      JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-4-6', mcp_servers: [{ status: 'connected' }] }),
      JSON.stringify({ type: 'assistant', message }),
      JSON.stringify({ type: 'assistant', message }),
    ].join('\n'));
    expect(parsed.toolCalls).toBe(1);
    expect(parsed.usage.inputTokens).toBe(10);
    expect(parsed.usage.outputTokens).toBe(2);
    expect(parsed.usage.cacheWriteTokens).toBeNull();
    expect(parsed.usage.cacheReadTokens).toBeNull();
  });

  it('keeps a connected timeout attempt distinct from a pre-connect failure and leaves missing usage unknown', () => {
    const parsed = parseClaudeStream(`${JSON.stringify({ type: 'system', subtype: 'init', mcp_servers: [{ name: 'tree', status: 'connected' }] })}\n${JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'navigate' }] } })}`);
    expect(parsed.connected).toBe(true);
    expect(parsed.sawResult).toBe(false);
    expect(parsed.usage).toEqual({ inputTokens: null, cacheWriteTokens: null, cacheReadTokens: null, outputTokens: null, costUsd: null });
    const failed = parseClaudeStream(JSON.stringify({ type: 'system', subtype: 'init', mcp_servers: [{ name: 'tree', status: 'failed' }] }));
    expect(failed.connected).toBe(false);
    expect(failed.mcpStatuses).toEqual(['failed']);
  });

  it('does not promote assistant-stream lower bounds to complete usage when final fields are absent', () => {
    const parsed = parseClaudeStream([
      JSON.stringify({ type: 'assistant', message: { id: 'm', usage: { input_tokens: 20, cache_creation_input_tokens: 4, cache_read_input_tokens: 8, output_tokens: 3 }, content: [] } }),
      JSON.stringify({ type: 'result', result: 'partial', usage: { input_tokens: 20, output_tokens: 3 }, total_cost_usd: 0.02 }),
    ].join('\n'));
    expect(parsed.usageComplete).toBe(true);
    expect(parsed.usage).toEqual({ inputTokens: 20, cacheWriteTokens: null, cacheReadTokens: null, outputTokens: 3, costUsd: 0.02 });
  });

  it('counts deduplicated browser observations and allows recovered tool errors to succeed', () => {
    const toolResult = { type: 'tool_result', tool_use_id: 'call-1', is_error: true, content: [{ type: 'text', text: 'hello' }, { type: 'image', source: {} }] };
    const parsed = parseClaudeStream([
      JSON.stringify({ type: 'system', subtype: 'init', mcp_servers: [{ status: 'connected' }] }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'call-1', name: 'browser_read' }] } }),
      JSON.stringify({ type: 'user', message: { content: [toolResult] } }),
      JSON.stringify({ type: 'user', message: { content: [toolResult] } }),
      JSON.stringify({ type: 'result', result: 'ANSWER: confirmed', is_error: false, usage: { input_tokens: 9, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 2 }, total_cost_usd: 0.001 }),
    ].join('\n'));
    expect(parsed.toolErrors).toBe(1);
    expect(parsed.observationChars).toBe(5);
    expect(parsed.observationImages).toBe(1);
    expect(classifyAttempt({ sawInit: true, connected: true, sawResult: true, resultError: false, timedOut: false, launchError: null, exitCode: 0, answerMatches: true, hasFixtureCheck: true, fixtureOk: true })).toBe('success');
  });

  it('classifies a connected timeout and a crashed process as attempted failures', () => {
    const common = { sawInit: true, connected: true, sawResult: false, resultError: false, launchError: null, answerMatches: false, hasFixtureCheck: false, fixtureOk: null };
    expect(classifyAttempt({ ...common, timedOut: true, exitCode: null })).toBe('timeout');
    expect(classifyAttempt({ ...common, timedOut: false, exitCode: 1 })).toBe('crash');
    expect(classifyAttempt({ ...common, connected: false, timedOut: true, exitCode: null })).toBe('timeout');
  });

  it('aggregates retry usage without silently converting wholly unknown usage to zero', () => {
    const unknown = { inputTokens: null, cacheWriteTokens: null, cacheReadTokens: null, outputTokens: null, costUsd: null };
    const known = { inputTokens: 100, cacheWriteTokens: 20, cacheReadTokens: 10, outputTokens: 7, costUsd: 0.01 };
    expect(aggregateUsage([{ usage: unknown, complete: false }])).toEqual(unknown);
    expect(aggregateUsage([{ usage: unknown, complete: false }, { usage: known, complete: true }])).toEqual(unknown);
    expect(aggregateUsage([{ usage: known, complete: true }, { usage: known, complete: true }])).toEqual({ inputTokens: 200, cacheWriteTokens: 40, cacheReadTokens: 20, outputTokens: 14, costUsd: 0.02 });
  });

  it('requires resume schema and fingerprint compatibility', () => {
    const settings = {
      provider: 'claude' as const, tasks: ['x'], approaches: ['mantis'], runs: 1, model: 'claude-sonnet-4-6', reasoning: 'not-applicable', timeoutMs: 1000, concurrency: 1,
      toolRestrictions: {}, runtime: { nodeVersion: 'v20.14.0', platform: 'win32', arch: 'x64' }, environment: {}, browserPaths: {},
    };
    const expected = makeMetadata(settings, { 'bench/agent/run.ts': 'abc' }, '2.0.0');
    expect(() => assertCompatibleResume({ metadata: expected, results: [] }, expected)).not.toThrow();
    expect(() => assertCompatibleResume({ metadata: { ...expected, schemaVersion: 1 }, results: [] }, expected)).toThrow(/schema/);
    expect(() => assertCompatibleResume({ metadata: { ...expected, configFingerprint: 'changed' }, results: [] }, expected)).toThrow(/fingerprint/);
  });

  it('rejects malformed environment settings rather than coercing them', () => {
    expect(validatePositiveInt('AGENT_RUNS', '2', 1)).toBe(2);
    expect(() => validatePositiveInt('AGENT_RUNS', '2.5', 1)).toThrow(/positive integer/);
    expect(() => validatePositiveInt('AGENT_RUNS', 'Infinity', 1)).toThrow(/positive integer/);
    expect(validateFlag('AGENT_RESUME', '1')).toBe(true);
    expect(validateFlag('AGENT_RESUME', undefined)).toBe(false);
    expect(() => validateFlag('AGENT_RESUME', 'yes')).toThrow(/0 or 1/);
  });
});
