import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

export const RESULT_SCHEMA_VERSION = 3;

export type AttemptStatus = 'success' | 'wrong_answer' | 'connection_failure' | 'timeout' | 'crash' | 'cli_error';

export function classifyAttempt(input: {
  sawInit: boolean; connected: boolean; sawResult: boolean; resultError: boolean; timedOut: boolean;
  launchError: string | null; exitCode: number | null; answerMatches: boolean;
  hasFixtureCheck: boolean; fixtureOk: boolean | null;
}): AttemptStatus {
  if (input.timedOut) return 'timeout';
  if (input.launchError) return 'crash';
  if (input.sawInit && !input.connected) return 'connection_failure';
  if (input.resultError) return 'cli_error';
  if (!input.sawResult) return input.exitCode !== 0 ? 'crash' : 'cli_error';
  if (!input.connected) return 'connection_failure';
  if (!input.answerMatches || (input.hasFixtureCheck && input.fixtureOk !== true)) return 'wrong_answer';
  return 'success';
}

export interface StreamUsage {
  inputTokens: number | null;
  cacheWriteTokens: number | null;
  cacheReadTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
}

export interface ParsedStream {
  connected: boolean;
  initModel: string | null;
  resolvedModels: string[];
  toolCalls: number;
  observationChars: number;
  observationImages: number;
  turns: number | null;
  resultText: string | null;
  usage: StreamUsage;
  usageComplete: boolean;
  resultError: boolean;
  toolErrors: number;
  mcpStatuses: string[];
  sawResult: boolean;
  sawInit: boolean;
}

const emptyUsage = (): StreamUsage => ({
  inputTokens: null, cacheWriteTokens: null, cacheReadTokens: null, outputTokens: null, costUsd: null,
});

const finiteNonnegative = (n: unknown): number | null => typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;

function sumKnown(a: number | null, b: number | null): number | null {
  return a === null && b === null ? null : (a ?? 0) + (b ?? 0);
}

function usageFrom(value: unknown): Partial<StreamUsage> {
  if (!value || typeof value !== 'object') return {};
  const u = value as Record<string, unknown>;
  return {
    inputTokens: finiteNonnegative(u.input_tokens),
    cacheWriteTokens: finiteNonnegative(u.cache_creation_input_tokens),
    cacheReadTokens: finiteNonnegative(u.cache_read_input_tokens),
    outputTokens: finiteNonnegative(u.output_tokens),
  };
}

/** Parse actual Claude stream-json events without treating a missing final event as zero usage. */
export function parseClaudeStream(stream: string): ParsedStream {
  let sawInit = false;
  let mcpStatuses: string[] = [];
  let initModel: string | null = null;
  let resolvedModels: string[] = [];
  let toolCalls = 0;
  let observationChars = 0;
  let observationImages = 0;
  let turns: number | null = null;
  let resultText: string | null = null;
  let resultError = false;
  let toolErrors = 0;
  let sawResult = false;
  let usage = emptyUsage();
  const usageMessages = new Set<string>();
  const toolUseIds = new Set<string>();
  const observedToolResults = new Set<string>();

  for (const line of stream.split(/\r?\n/)) {
    let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    const type = event.type;
    if (type === 'system' && event.subtype === 'init') {
      sawInit = true;
      const servers = Array.isArray(event.mcp_servers) ? event.mcp_servers as Record<string, unknown>[] : [];
      mcpStatuses = servers.map((s) => typeof s.status === 'string' ? s.status : 'unknown');
      if (typeof event.model === 'string') { initModel = event.model; resolvedModels.push(event.model); }
    }
    if (type === 'assistant') {
      const message = event.message && typeof event.message === 'object' ? event.message as Record<string, unknown> : {};
      if (typeof message.model === 'string') resolvedModels.push(message.model);
      const content = Array.isArray(message.content) ? message.content as Record<string, unknown>[] : [];
      for (const call of content.filter((c) => c.type === 'tool_use')) {
        const id = typeof call.id === 'string' ? call.id : JSON.stringify(call);
        if (!toolUseIds.has(id)) { toolUseIds.add(id); toolCalls++; }
      }
      const identity = typeof message.id === 'string' ? message.id : typeof event.uuid === 'string' ? event.uuid : line;
      if (!usageMessages.has(identity)) {
        usageMessages.add(identity);
        const msgUsage = usageFrom(message.usage);
        usage.inputTokens = sumKnown(usage.inputTokens, msgUsage.inputTokens ?? null);
        usage.cacheWriteTokens = sumKnown(usage.cacheWriteTokens, msgUsage.cacheWriteTokens ?? null);
        usage.cacheReadTokens = sumKnown(usage.cacheReadTokens, msgUsage.cacheReadTokens ?? null);
        usage.outputTokens = sumKnown(usage.outputTokens, msgUsage.outputTokens ?? null);
      }
    }
    if (type === 'user') {
      const message = event.message && typeof event.message === 'object' ? event.message as Record<string, unknown> : {};
      const content = Array.isArray(message.content) ? message.content as Record<string, unknown>[] : [];
      for (const result of content.filter((c) => c.type === 'tool_result')) {
        const identity = typeof result.tool_use_id === 'string' ? result.tool_use_id : JSON.stringify(result);
        if (observedToolResults.has(identity)) continue;
        observedToolResults.add(identity);
        if (result.is_error === true) toolErrors++;
        const countBlocks = (block: unknown): void => {
          if (Array.isArray(block)) { block.forEach(countBlocks); return; }
          if (typeof block === 'string') { observationChars += block.length; return; }
          if (!block || typeof block !== 'object') return;
          const item = block as Record<string, unknown>;
          if (item.type === 'text' && typeof item.text === 'string') observationChars += item.text.length;
          else if (item.type === 'image') observationImages++;
          else if (Array.isArray(item.content)) item.content.forEach(countBlocks);
        };
        countBlocks(result.content);
      }
    }
    if (type === 'result') {
      sawResult = true;
      resultText = typeof event.result === 'string' ? event.result : '';
      resultError = event.is_error === true;
      turns = finiteNonnegative(event.num_turns);
      const resultUsage = usageFrom(event.usage);
      // The final result is cumulative. Prefer it over summed assistant-message usage.
      usage.inputTokens = resultUsage.inputTokens ?? null;
      usage.cacheWriteTokens = resultUsage.cacheWriteTokens ?? null;
      usage.cacheReadTokens = resultUsage.cacheReadTokens ?? null;
      usage.outputTokens = resultUsage.outputTokens ?? null;
      usage.costUsd = finiteNonnegative(event.total_cost_usd);
      if (typeof event.model === 'string') resolvedModels.push(event.model);
    }
  }
  resolvedModels = [...new Set(resolvedModels)];
  return {
    connected: sawInit && mcpStatuses.length > 0 && mcpStatuses.every((status) => status === 'connected'),
    initModel, resolvedModels, toolCalls, observationChars, observationImages, turns, resultText, usage, usageComplete: sawResult, resultError, toolErrors, mcpStatuses, sawResult, sawInit,
  };
}

export interface ConfigForFingerprint {
  provider: 'codex' | 'claude' | 'sarvam';
  tasks: string[];
  approaches: string[];
  runs: number;
  model: string;
  reasoning: string;
  timeoutMs: number;
  concurrency: number;
  toolRestrictions: Record<string, unknown>;
  runtime: { nodeVersion: string; platform: string; arch: string };
  environment: Record<string, string | null>;
  browserPaths: Record<string, string | null>;
}

export interface RunMetadata {
  schemaVersion: number;
  configFingerprint: string;
  settings: ConfigForFingerprint;
  sourceHashes: Record<string, string>;
  cliVersion: string | null;
}

export function hashSources(repo: string, files: string[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [
    file.replaceAll('\\', '/'), createHash('sha256').update(readFileSync(path.join(repo, file))).digest('hex'),
  ]));
}

export function makeMetadata(settings: ConfigForFingerprint, sourceHashes: Record<string, string>, cliVersion: string | null): RunMetadata {
  const stable = JSON.stringify({ settings, sourceHashes, cliVersion });
  return {
    schemaVersion: RESULT_SCHEMA_VERSION,
    configFingerprint: createHash('sha256').update(stable).digest('hex'),
    settings, sourceHashes, cliVersion,
  };
}

export function assertCompatibleResume(value: unknown, expected: RunMetadata): asserts value is { metadata: RunMetadata; results: unknown[] } {
  if (!value || typeof value !== 'object') throw new Error('Cannot resume: results file is not an object. Use AGENT_OVERWRITE=1 to replace it.');
  const stored = value as Record<string, unknown>;
  const metadata = stored.metadata as Partial<RunMetadata> | undefined;
  if (!metadata || metadata.schemaVersion !== RESULT_SCHEMA_VERSION) {
    throw new Error(`Cannot resume: results schema is missing or incompatible (expected ${RESULT_SCHEMA_VERSION}). Use a new AGENT_OUT or AGENT_OVERWRITE=1.`);
  }
  if (metadata.configFingerprint !== expected.configFingerprint) {
    throw new Error('Cannot resume: benchmark configuration fingerprint differs because settings or source hashes changed. Use a new AGENT_OUT or AGENT_OVERWRITE=1.');
  }
  if (!Array.isArray(stored.results)) throw new Error('Cannot resume: results array is missing. Use AGENT_OVERWRITE=1 to replace it.');
}

export function validatePositiveInt(name: string, value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer; received ${JSON.stringify(value)}.`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n > max) throw new Error(`${name} must be between 1 and ${max}; received ${JSON.stringify(value)}.`);
  return n;
}

export function validateFlag(name: string, value: string | undefined): boolean {
  if (value === undefined || value === '0') return false;
  if (value === '1') return true;
  throw new Error(`${name} must be 0 or 1; received ${JSON.stringify(value)}.`);
}

/** Aggregate attempt costs without turning wholly unknown failed-stream usage into zero. */
export function aggregateUsage(attempts: { usage: StreamUsage; complete: boolean }[]): StreamUsage {
  const aggregate = (key: keyof StreamUsage): number | null => {
    const values = attempts.map((a) => a.usage[key]);
    if (values.length === 0 || attempts.some((a) => !a.complete) || values.some((v) => v === null)) return null;
    return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  };
  return {
    inputTokens: aggregate('inputTokens'), cacheWriteTokens: aggregate('cacheWriteTokens'),
    cacheReadTokens: aggregate('cacheReadTokens'), outputTokens: aggregate('outputTokens'), costUsd: aggregate('costUsd'),
  };
}
