/**
 * The small, provider-owned part of the agent benchmark.  Keeping it independent
 * from the process runner makes the model/tool protocol testable without a browser.
 */
import { estimateSarvamCost, resolveSarvamModel, sarvamModelSupportsImages } from './sarvam.js';
import type { SarvamClient, SarvamContentPart, SarvamMessage, SarvamToolCall, SarvamUsage } from './sarvam.js';
import type { StreamUsage } from './integrity.js';

export interface SarvamMcp {
  call(method: string, params: object, timeoutMs?: number, signal?: AbortSignal): Promise<any>;
}
export interface SarvamTraceEvent { type: string; [key: string]: unknown }
export interface SarvamAgentOptions {
  client: Pick<SarvamClient, 'complete'>;
  mcp: SarvamMcp;
  model: string;
  prompt: string;
  server: string;
  allow: string[];
  deny?: string[];
  maxSteps: number;
  toolTimeoutMs?: number;
  trace?: (event: SarvamTraceEvent) => void;
  /** The harness uses this to capture a frame without routing a direct call through its proxy. */
  onToolResult?: () => void;
  /** Cancels completion, limiter waits, and outstanding harness tool calls. */
  signal?: AbortSignal;
}
export interface SarvamAgentResult {
  connected: boolean;
  initModel: string | null;
  resolvedModels: string[];
  toolCalls: number;
  toolErrors: number;
  observationChars: number;
  observationImages: number;
  turns: number | null;
  resultText: string | null;
  resultError: boolean;
  sawResult: boolean;
  sawInit: boolean;
  mcpStatuses: string[];
  usage: StreamUsage;
  totalInputTokens: number | null;
  usageComplete: boolean;
  costInr: number | null;
  apiAttempts: number;
  rateLimits: number;
  diagnostics: string[];
}

/** Keep provider requests bounded when an agent repeatedly asks for screenshots. */
export const SARVAM_IMAGE_HISTORY_LIMIT = 8;
const OMITTED_IMAGE_NOTE = '[Earlier image observation omitted to keep the request within the image history limit.]';

/**
 * Retains the latest visual observations and replaces older image blocks with a
 * compact note. Tool text, tool-call ordering, and sub-cap histories are left
 * untouched so the next completion remains protocol-compatible.
 */
export function trimSarvamImageHistory(messages: SarvamMessage[], limit = SARVAM_IMAGE_HISTORY_LIMIT): void {
  let images = 0;
  for (const message of messages) {
    if (Array.isArray(message.content)) images += message.content.filter((part) => part.type === 'image_url').length;
  }
  let omit = Math.max(0, images - limit);
  if (!omit) return;
  for (const message of messages) {
    if (!Array.isArray(message.content) || !omit) continue;
    message.content = message.content.map((part) => {
      if (part.type !== 'image_url' || !omit) return part;
      omit--;
      return { type: 'text', text: OMITTED_IMAGE_NOTE };
    });
  }
}

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const textContent = (value: unknown): { text: string; images: SarvamContentPart[]; count: number } => {
  const text: string[] = []; const images: SarvamContentPart[] = []; let count = 0;
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) { item.forEach(visit); return; }
    if (typeof item === 'string') { text.push(item); count += item.length; return; }
    const block = object(item); if (!block) return;
    if (block.type === 'text' && typeof block.text === 'string') { text.push(block.text); count += block.text.length; return; }
    if (block.type === 'image') {
      const data = typeof block.data === 'string' ? block.data : null;
      const mime = typeof block.mimeType === 'string' ? block.mimeType : 'image/png';
      if (data) images.push({ type: 'image_url', image_url: { url: `data:${mime};base64,${data}` } });
      return;
    }
    if (Array.isArray(block.content)) block.content.forEach(visit);
  };
  visit(value); return { text: text.join('\n'), images, count };
};
const permitted = (server: string, name: string, allow: string[], deny: string[]): boolean => {
  const raw = `mcp__${server}__${name}`;
  return !deny.includes(raw) && allow.some(entry => entry === `mcp__${server}` || entry === raw);
};
/** Provider function schemas must not include JSON Schema document metadata. */
export function sarvamFunctionSchema(value: unknown): Record<string, unknown> {
  const schema = object(value) ?? { type: 'object', properties: {} };
  const clean = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(clean);
    const entry = object(input);
    if (!entry) return input;
    return Object.fromEntries(Object.entries(entry)
      .filter(([key]) => key !== '$schema' && key !== '$id')
      .map(([key, child]) => [key, clean(child)]));
  };
  return clean(schema) as Record<string, unknown>;
}
export function mcpToolsToOpenAi(value: unknown, server: string, allow: string[], deny: string[] = []): unknown[] {
  const tools = object(value)?.tools;
  if (!Array.isArray(tools)) return [];
  return tools.flatMap(item => {
    const tool = object(item);
    if (!tool) return [];
    const name = typeof tool.name === 'string' ? tool.name : null;
    if (!name || !permitted(server, name, allow, deny)) return [];
    const parameters = sarvamFunctionSchema(tool.inputSchema);
    return [{ type: 'function', function: { name, description: typeof tool.description === 'string' ? tool.description : name, parameters } }];
  });
}
const emptyUsage = (): StreamUsage => ({ inputTokens: null, cacheWriteTokens: null, cacheReadTokens: null, outputTokens: null, costUsd: null });
function addUsage(total: SarvamUsage, next: SarvamUsage): SarvamUsage {
  const sum = (a: number | null, b: number | null): number | null => a === null || b === null ? null : a + b;
  return { promptTokens: sum(total.promptTokens, next.promptTokens), completionTokens: sum(total.completionTokens, next.completionTokens), cachedTokens: sum(total.cachedTokens, next.cachedTokens), totalTokens: sum(total.totalTokens, next.totalTokens) };
}

export async function runSarvamAgent(options: SarvamAgentOptions): Promise<SarvamAgentResult> {
  const trace = (event: SarvamTraceEvent): void => options.trace?.(event);
  const aborted = (): boolean => options.signal?.aborted === true;
  const abortMessage = (): string => 'Sarvam agent timed out';
  const mcpCall = (method: string, params: object): Promise<any> => options.signal
    ? options.mcp.call(method, params, options.toolTimeoutMs, options.signal)
    : options.mcp.call(method, params, options.toolTimeoutMs);
  const toolsResult = await mcpCall('tools/list', {});
  const tools = mcpToolsToOpenAi(toolsResult, options.server, options.allow, options.deny ?? []);
  trace({ type: 'sarvam.init', model: options.model, tools: tools.length });
  const messages: SarvamMessage[] = [{ role: 'user', content: options.prompt }];
  let usage: SarvamUsage = { promptTokens: 0, completionTokens: 0, cachedTokens: 0, totalTokens: 0 };
  let usageKnown = true, calls = 0, errors = 0, chars = 0, images = 0, malformed = 0, apiAttempts = 0, rateLimits = 0;
  const models = new Set<string>(); const diagnostics: string[] = [];
  for (let turn = 1; turn <= options.maxSteps; turn++) {
    if (aborted()) return result(abortMessage(), true, turn - 1, true);
    const resolved = resolveSarvamModel(options.model);
    const reasoning = ['deepseekv4.1-flash', 'glm5.3'].includes(resolved);
    let reply;
    try {
      reply = await options.client.complete({ model: options.model, messages, tools, tool_choice: 'auto', max_tokens: 2048, signal: options.signal,
        ...(resolved === 'sarvam-105b' ? { reasoning_effort: null } : reasoning ? { reasoning_effort: 'low' } : {}) });
    } catch (error) {
      if (aborted()) return result(abortMessage(), true, turn - 1, true);
      throw error;
    }
    models.add(reply.model); usageKnown &&= reply.usage.promptTokens !== null && reply.usage.completionTokens !== null;
    usage = addUsage(usage, reply.usage);
    apiAttempts += reply.attempts ?? 1; rateLimits += reply.rateLimits ?? 0;
    trace({ type: 'sarvam.completion', turn, model: reply.model, finishReason: reply.finishReason ?? null, content: reply.content ?? '', toolCalls: reply.toolCalls ?? [],
      attempts: reply.attempts ?? 1, rateLimits: reply.rateLimits ?? 0, promptTokens: reply.usage.promptTokens, completionTokens: reply.usage.completionTokens });
    if (!reply.toolCalls?.length) {
      return result(reply.content ?? '', false, turn, true);
    }
    messages.push({ role: 'assistant', content: reply.content, tool_calls: reply.toolCalls, ...(reply.reasoningContent ? { reasoning_content: reply.reasoningContent } : {}) });
    const imageObservations: SarvamContentPart[] = [];
    for (const call of reply.toolCalls) {
      if (aborted()) return result(abortMessage(), true, turn, true);
      let args: object;
      try {
        const decoded = JSON.parse(call.function.arguments);
        if (!object(decoded)) throw new Error('arguments must be an object');
        args = decoded;
      } catch {
        malformed++;
        errors++; diagnostics.push(`Malformed JSON arguments for ${call.function.name}`);
        trace({ type: 'sarvam.tool_error', name: call.function.name, error: 'malformed_arguments', retry: malformed === 1 });
        messages.push({ role: 'tool', tool_call_id: call.id ?? `malformed-${turn}`, content: 'Tool arguments must be a JSON object. Retry the tool call once with valid JSON.' });
        if (malformed > 1) return result('Tool call arguments remained invalid after one retry.', true, turn, true);
        continue;
      }
      if (!permitted(options.server, call.function.name, options.allow, options.deny ?? [])) {
        errors++; diagnostics.push(`Disallowed tool requested: ${call.function.name}`);
        messages.push({ role: 'tool', tool_call_id: call.id ?? `denied-${turn}`, content: 'This tool is not available.' });
        continue;
      }
      calls++;
      try {
        const response = await mcpCall('tools/call', { name: call.function.name, arguments: args });
        options.onToolResult?.();
        const content = textContent(object(response)?.content ?? response);
        chars += content.count; images += content.images.length;
        const isError = object(response)?.isError === true; if (isError) errors++;
        // Sarvam accepts tool results as text only.  A multimodal `tool` message caused
        // 400s after screenshot tools; retain the required tool response, then put any
        // supported image in a separate ordinary user turn.
        const rendered = content.text || (content.images.length ? `[${content.images.length} image result omitted: this model does not support image tool results]` : JSON.stringify(object(response)?.content ?? response));
        messages.push({ role: 'tool', tool_call_id: call.id ?? `tool-${calls}`, content: rendered });
        if (sarvamModelSupportsImages(options.model)) imageObservations.push(...content.images);
        trace({ type: 'sarvam.tool_result', name: call.function.name, arguments: args, error: isError, resultText: rendered, chars: content.count, images: content.images.length });
      } catch (error) {
        if (aborted()) return result(abortMessage(), true, turn, true);
        errors++; diagnostics.push(`MCP tool failed: ${call.function.name}`);
        messages.push({ role: 'tool', tool_call_id: call.id ?? `tool-${calls}`, content: 'The browser tool failed. Choose another action or retry.' });
        trace({ type: 'sarvam.tool_error', name: call.function.name, arguments: args, error: 'mcp_failed', resultText: 'The browser tool failed. Choose another action or retry.' });
      }
    }
    // Tool calls from one assistant reply form one atomic batch: providers require
    // every tool response before the next ordinary user message.
    if (imageObservations.length) {
      messages.push({ role: 'user', content: [{ type: 'text', text: 'The preceding tool returned these image observations.' }, ...imageObservations] });
      trimSarvamImageHistory(messages);
    }
  }
  return result('Agent step budget exhausted.', true, options.maxSteps, true);

  function result(text: string, resultError: boolean, turns: number, sawResult: boolean): SarvamAgentResult {
    const normal = usageKnown && usage.promptTokens !== null && usage.cachedTokens !== null ? Math.max(0, usage.promptTokens - usage.cachedTokens) : null;
    const stream = emptyUsage(); stream.inputTokens = normal; stream.cacheReadTokens = usageKnown ? usage.cachedTokens : null;
    stream.cacheWriteTokens = 0; stream.outputTokens = usageKnown ? usage.completionTokens : null;
    const complete = usageKnown && usage.promptTokens !== null && usage.completionTokens !== null;
    trace({ type: 'sarvam.summary', resultText: text, attempts: apiAttempts, rateLimits, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens });
    return { connected: true, initModel: [...models][0] ?? resolveSarvamModel(options.model), resolvedModels: [...models], toolCalls: calls, toolErrors: errors, observationChars: chars, observationImages: images, turns, resultText: text, resultError, sawResult, sawInit: true, mcpStatuses: ['connected'], usage: stream, totalInputTokens: usageKnown ? usage.promptTokens : null, usageComplete: complete, costInr: complete ? estimateSarvamCost(options.model, usage) : null, apiAttempts, rateLimits, diagnostics };
  }
}
