import type { ParsedStream, StreamUsage } from './integrity.js';

/** Normalized metrics from `codex exec --json`. Codex reports total input, including cache reads. */
export interface ParsedCodexStream extends ParsedStream {
  connectionState: 'connected' | 'unknown';
  /** Normal (uncached) input, cache writes, cache reads, output, and cost when reported. */
  usage: StreamUsage;
  /** Raw Codex input_tokens, which includes cached_input_tokens. */
  totalInputTokens: number | null;
  usageComplete: boolean;
  /** True when Codex invoked a built-in tool outside the configured browser MCP server. */
  policyViolation: boolean;
  mcpStatuses: string[];
  /** Non-fatal CLI warning items, such as a built-in tool being ignored by configuration. */
  diagnostics: string[];
}

const emptyUsage = (): StreamUsage => ({
  inputTokens: null, cacheWriteTokens: null, cacheReadTokens: null, outputTokens: null, costUsd: null,
});

const disallowedToolTypes = new Set([
  'command_execution', 'web_search', 'file_change', 'view_image', 'image_generation', 'collab_tool_call',
]);

const finiteNonnegative = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Parse text and image blocks from MCP observation payloads without counting repeated snapshots. */
function countContent(value: unknown): { chars: number; images: number } {
  let chars = 0;
  let images = 0;
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (typeof item === 'string') { chars += item.length; return; }
    if (!item || typeof item !== 'object') return;
    const block = item as Record<string, unknown>;
    if (block.type === 'text' && typeof block.text === 'string') chars += block.text.length;
    else if (block.type === 'image') images++;
    else if (Array.isArray(block.content)) block.content.forEach(visit);
  };
  visit(value);
  return { chars, images };
}

/** Parse newline-delimited Codex `exec --json` events, ignoring malformed and partial lines. */
export function parseCodexStream(stream: string, expectedServer?: string): ParsedCodexStream {
  const startedItems = new Map<string, string>();
  const startedServers = new Map<string, string>();
  const countedCalls = new Set<string>();
  const countedResults = new Set<string>();
  const countedErrors = new Set<string>();
  const turnIds = new Set<string>();
  const completedTurnIds = new Set<string>();
  const resolvedModels = new Set<string>();
  let sawInit = false;
  let sawResult = false;
  let resultError = false;
  let resultText: string | null = null;
  let initModel: string | null = null;
  let successfulMcpCall = false;
  let policyViolation = false;
  const diagnostics = new Set<string>();
  let observationChars = 0;
  let observationImages = 0;
  let fallbackId = 0;

  // Each turn completion reports its own usage. Missing fields stay unknown in their totals.
  let totalInputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalOutputTokens = 0;
  let inputKnown = true;
  let cacheReadKnown = true;
  let cacheWriteKnown = true;
  let outputKnown = true;
  let usageTurns = 0;
  let usageComplete = true;

  for (const line of stream.split(/\r?\n/)) {
    let event: Record<string, unknown>;
    try { event = record(JSON.parse(line)); } catch { continue; }
    const type = typeof event.type === 'string' ? event.type : '';
    if (disallowedToolTypes.has(type)) policyViolation = true;
    if (type === 'thread.started' || type === 'turn.started') sawInit = true;
    if (type === 'turn.started' && typeof event.turn_id === 'string') turnIds.add(event.turn_id);

    if (typeof event.model === 'string') {
      resolvedModels.add(event.model);
      if (!initModel && (type === 'thread.started' || type === 'turn.started')) initModel = event.model;
    }

    if (type === 'agent_message') {
      if (typeof event.text === 'string') resultText = event.text;
      else if (typeof record(event.item).text === 'string') resultText = record(event.item).text as string;
    }

    if (type === 'turn.failed' || type === 'error') resultError = true;
    if (type === 'turn.completed') {
      sawResult = true;
      const completionId = typeof event.turn_id === 'string' ? event.turn_id : `completion-${completedTurnIds.size}`;
      if (completedTurnIds.has(completionId)) continue;
      completedTurnIds.add(completionId);
      if (typeof event.turn_id === 'string') turnIds.add(event.turn_id);
      const usage = record(event.usage);
      const input = finiteNonnegative(usage.input_tokens);
      const cacheRead = finiteNonnegative(usage.cached_input_tokens);
      const cacheWrite = finiteNonnegative(usage.cache_write_input_tokens);
      const output = finiteNonnegative(usage.output_tokens);
      usageTurns++;
      if (input === null) inputKnown = false; else totalInputTokens += input;
      if (cacheRead === null) cacheReadKnown = false; else totalCacheReadTokens += cacheRead;
      if (cacheWrite === null) cacheWriteKnown = false; else totalCacheWriteTokens += cacheWrite;
      if (output === null) outputKnown = false; else totalOutputTokens += output;
      if (input === null || cacheRead === null || output === null) usageComplete = false;
    }

    if (type === 'item.started' || type === 'item.completed') {
      const item = record(event.item);
      const itemType = typeof item.type === 'string' ? item.type : '';
      const id = typeof item.id === 'string' ? item.id : `${itemType}-${fallbackId++}`;
      if (type === 'item.started') {
        startedItems.set(id, itemType);
        if (typeof item.server === 'string') startedServers.set(id, item.server);
      }
      const knownType = itemType || startedItems.get(id) || '';
      if (disallowedToolTypes.has(knownType)) policyViolation = true;
      if (knownType === 'error') {
        const message = typeof item.message === 'string' ? item.message : typeof item.text === 'string' ? item.text : '';
        if (message) diagnostics.add(message);
      }
      if (knownType === 'agent_message' && typeof item.text === 'string') resultText = item.text;

      if (knownType === 'mcp_tool_call') {
        countedCalls.add(id);
        const server = typeof item.server === 'string' ? item.server : startedServers.get(id) ?? '';
        if (expectedServer === undefined || expectedServer === server) successfulMcpCall = true;
        else if (server) policyViolation = true;
      }
      if (type === 'item.completed' && knownType === 'mcp_tool_call') {
        const result = record(item.result);
        if (!countedResults.has(id)) {
          countedResults.add(id);
          const counts = countContent(result.content ?? item.content);
          observationChars += counts.chars;
          observationImages += counts.images;
        }
        const hasError = item.error !== undefined && item.error !== null && item.error !== false ||
          result.isError === true || item.status === 'failed' || item.status === 'error';
        if (hasError) countedErrors.add(id);
      }
    }
  }

  // A result with no explicit turn ID still proves one completed turn.
  const turns = turnIds.size > 0 ? turnIds.size : (sawResult ? Math.max(1, completedTurnIds.size) : null);
  const totalInput = usageTurns > 0 && inputKnown ? totalInputTokens : null;
  const cacheRead = usageTurns > 0 && cacheReadKnown ? totalCacheReadTokens : null;
  const cacheWrite = usageTurns > 0 && cacheWriteKnown ? totalCacheWriteTokens : null;
  const output = usageTurns > 0 && outputKnown ? totalOutputTokens : null;
  const normalInputTokens = totalInput === null || cacheRead === null
    ? null : Math.max(0, totalInput - cacheRead);
  const usage = emptyUsage();
  usage.inputTokens = normalInputTokens;
  usage.cacheWriteTokens = cacheWrite;
  usage.cacheReadTokens = cacheRead;
  usage.outputTokens = output;
  return {
    connected: successfulMcpCall,
    connectionState: successfulMcpCall ? 'connected' : 'unknown',
    initModel,
    resolvedModels: [...resolvedModels],
    toolCalls: countedCalls.size,
    toolErrors: countedErrors.size,
    observationChars,
    observationImages,
    turns,
    resultText,
    resultError,
    sawResult,
    sawInit,
    usage,
    totalInputTokens: totalInput,
    usageComplete: usageTurns > 0 && usageComplete && !resultError,
    policyViolation,
    mcpStatuses: successfulMcpCall ? ['connected'] : [],
    diagnostics: [...diagnostics],
  };
}
