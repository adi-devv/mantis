import { describe, expect, it } from 'vitest';
import { parseCodexStream } from '../bench/agent/codex.js';

const line = (event: Record<string, unknown>): string => JSON.stringify(event);

describe('parseCodexStream', () => {
  it('normalizes reported Codex usage and parses the completed MCP observation', () => {
    const parsed = parseCodexStream([
      line({ type: 'thread.started', thread_id: 'thread-1' }),
      line({ type: 'turn.started', turn_id: 'turn-1' }),
      line({ type: 'item.started', item: { id: 'call-1', type: 'mcp_tool_call', server: 'mantis', tool: 'open' } }),
      line({ type: 'item.completed', item: { id: 'call-1', type: 'mcp_tool_call', server: 'mantis', tool: 'open', result: { content: [{ type: 'text', text: 'page text' }, { type: 'image', data: 'ignored' }] } } }),
      line({ type: 'item.completed', item: { id: 'msg-1', type: 'agent_message', text: 'ANSWER: done' } }),
      line({ type: 'turn.completed', turn_id: 'turn-1', usage: { input_tokens: 10649, cached_input_tokens: 8960, cache_write_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 3 } }),
    ].join('\n'), 'mantis');

    expect(parsed.connected).toBe(true);
    expect(parsed.connectionState).toBe('connected');
    expect(parsed.toolCalls).toBe(1);
    expect(parsed.toolErrors).toBe(0);
    expect(parsed.observationChars).toBe('page text'.length);
    expect(parsed.observationImages).toBe(1);
    expect(parsed.turns).toBe(1);
    expect(parsed.resultText).toBe('ANSWER: done');
    expect(parsed.sawInit).toBe(true);
    expect(parsed.sawResult).toBe(true);
    expect(parsed.usage).toEqual({ inputTokens: 1689, cacheWriteTokens: 0, cacheReadTokens: 8960, outputTokens: 5, costUsd: null });
    expect(parsed.totalInputTokens).toBe(10649);
    expect(parsed.usageComplete).toBe(true);
    expect(parsed.resolvedModels).toEqual([]);
    expect(parsed.policyViolation).toBe(false);
  });

  it('deduplicates repeated item snapshots and treats a returned tool error as connection evidence', () => {
    const failedCall = { id: 'call-2', type: 'mcp_tool_call', server: 'tree', tool: 'click', status: 'failed', result: { isError: true, content: [{ type: 'text', text: 'element missing' }] } };
    const parsed = parseCodexStream([
      line({ type: 'thread.started', thread_id: 'thread-2' }),
      line({ type: 'item.started', item: failedCall }),
      line({ type: 'item.completed', item: failedCall }),
      line({ type: 'item.completed', item: failedCall }),
      line({ type: 'turn.completed', turn_id: 'turn-2', usage: { input_tokens: 8, cached_input_tokens: 1, output_tokens: 2 } }),
    ].join('\n'), 'tree');

    expect(parsed.toolCalls).toBe(1);
    expect(parsed.toolErrors).toBe(1);
    expect(parsed.observationChars).toBe('element missing'.length);
    expect(parsed.connected).toBe(true);
    expect(parsed.resultError).toBe(false);
  });

  it('keeps raw total input available when cached-input details are missing', () => {
    const parsed = parseCodexStream(line({
      type: 'turn.completed', turn_id: 'turn-3', usage: { input_tokens: 100, output_tokens: 9 },
    }));
    expect(parsed.totalInputTokens).toBe(100);
    expect(parsed.usage.inputTokens).toBeNull();
    expect(parsed.usage.cacheReadTokens).toBeNull();
    expect(parsed.usage.cacheWriteTokens).toBeNull();
    expect(parsed.usage.outputTokens).toBe(9);
    expect(parsed.usage.costUsd).toBeNull();
    expect(parsed.usageComplete).toBe(false);
  });

  it('flags disallowed built-in commands and web search while retaining non-fatal warning items', () => {
    const warning = parseCodexStream(line({ type: 'item.completed', item: { id: 'warning', type: 'error', message: 'Codex is ignoring a configured tool.' } }));
    expect(warning.diagnostics).toEqual(['Codex is ignoring a configured tool.']);
    expect(warning.resultError).toBe(false);

    const parsed = parseCodexStream([
      line({ type: 'item.completed', item: { id: 'warning', type: 'error', message: 'Codex is ignoring a configured tool.' } }),
      line({ type: 'item.started', item: { id: 'shell-1', type: 'command_execution', command: 'echo not allowed' } }),
      line({ type: 'item.completed', item: { id: 'shell-1', type: 'command_execution', status: 'completed' } }),
      line({ type: 'web_search', query: 'not allowed' }),
      line({ type: 'turn.completed', turn_id: 'turn-before-failure', usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 1 } }),
      line({ type: 'turn.failed', error: 'turn failed' }),
    ].join('\n'));
    expect(parsed.policyViolation).toBe(true);
    expect(parsed.diagnostics).toEqual(['Codex is ignoring a configured tool.']);
    expect(parsed.resultError).toBe(true);
    expect(parsed.usageComplete).toBe(false);
  });

  it('flags MCP calls to a server outside the configured browser server and external built-ins', () => {
    const parsed = parseCodexStream([
      line({ type: 'item.started', item: { id: 'other-server', type: 'mcp_tool_call', server: 'filesystem', tool: 'read_file' } }),
      line({ type: 'item.completed', item: { id: 'other-server', type: 'mcp_tool_call', server: 'filesystem', tool: 'read_file', result: { content: [] } } }),
      line({ type: 'item.completed', item: { id: 'image-1', type: 'view_image' } }),
      line({ type: 'item.completed', item: { id: 'collab-1', type: 'collab_tool_call' } }),
    ].join('\n'), 'mantis');
    expect(parsed.connected).toBe(false);
    expect(parsed.toolCalls).toBe(1);
    expect(parsed.policyViolation).toBe(true);
  });

  it('ignores malformed lines and leaves absent turn usage unknown', () => {
    const parsed = parseCodexStream(`not json\n${line({ type: 'thread.started', thread_id: 'thread-4' })}\n${line({ type: 'agent_message', text: 'partial answer' })}`);
    expect(parsed.sawInit).toBe(true);
    expect(parsed.sawResult).toBe(false);
    expect(parsed.resultText).toBe('partial answer');
    expect(parsed.turns).toBeNull();
    expect(parsed.totalInputTokens).toBeNull();
    expect(parsed.usageComplete).toBe(false);
  });
});
