/** Small OpenAI-compatible Sarvam client. Never surface request secrets or response bodies in errors. */
import { spawnSync } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type SarvamContentPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } };
/** Kept deliberately OpenAI-compatible: assistant tool calls are sent back verbatim on the next turn. */
export interface SarvamMessage {
  role: string;
  content: string | SarvamContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: SarvamToolCall[];
  /** Some reasoning models require this opaque continuation field after a tool call. */
  reasoning_content?: string;
}
export interface SarvamRequest {
  model: string;
  messages: SarvamMessage[];
  response_format?: { type: 'json_object' };
  tools?: unknown[];
  tool_choice?: unknown;
  reasoning_effort?: string | null;
  max_tokens?: number;
  temperature?: number;
}
export interface SarvamUsage {
  promptTokens: number | null;
  completionTokens: number | null;
  cachedTokens: number | null;
  totalTokens: number | null;
}
export interface SarvamToolCall { id?: string; type?: string; function: { name: string; arguments: string } }
export interface SarvamCompletion {
  content: string | null;
  toolCalls?: SarvamToolCall[];
  usage: SarvamUsage;
  latencyMs: number;
  model: string;
  finishReason?: string;
  reasoningContent?: string;
  /** Transport-only counters; no provider payload is retained. */
  attempts?: number;
  rateLimits?: number;
}
export interface SarvamClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  /** Additional attempts after a transient failure. */
  retries?: number;
  sleep?: (ms: number) => Promise<void>;
}

export interface SarvamTransportStats { attempts: number; rateLimits: number }

const sleepFor = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));
const numberFromEnv = (name: string, fallback: number, min: number, max: number): number => {
  const value = Number(process.env[name] ?? fallback);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
};
const safeTmpdir = (): string => {
  try { return os.tmpdir(); } catch { return process.env.TEMP || process.env.TMP || '.'; }
};
const LIMIT_FILE = path.join(safeTmpdir(), 'mantis-sarvam-rate-limit-v1.json');
const LOCK_FILE = `${LIMIT_FILE}.lock`;
const WINDOW_MS = 60_000;
type SharedLimitState = { timestamps: number[]; cooldownUntil: number };
const emptyLimitState = (): SharedLimitState => ({ timestamps: [], cooldownUntil: 0 });
const readLimitState = (): SharedLimitState => {
  try {
    const raw = JSON.parse(readFileSync(LIMIT_FILE, 'utf8')) as Partial<SharedLimitState>;
    return {
      timestamps: Array.isArray(raw.timestamps) ? raw.timestamps.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)) : [],
      cooldownUntil: typeof raw.cooldownUntil === 'number' && Number.isFinite(raw.cooldownUntil) ? raw.cooldownUntil : 0,
    };
  } catch { return emptyLimitState(); }
};
const lockFile = async (sleep: (ms: number) => Promise<void>): Promise<(() => void)> => {
  for (;;) {
    try {
      const fd = openSync(LOCK_FILE, 'wx');
      return () => { try { closeSync(fd); unlinkSync(LOCK_FILE); } catch { /* best-effort temp cleanup */ } };
    } catch {
      // An interrupted process can leave a lock behind. It is safe to reclaim only stale locks.
      try { if (Date.now() - statSync(LOCK_FILE).mtimeMs > 120_000) unlinkSync(LOCK_FILE); }
      catch { /* another process released it */ }
      await sleep(25 + Math.floor(Math.random() * 25));
    }
  }
};

/**
 * Process-wide concurrency plus a tiny lock/timestamp ledger shared by sibling
 * processes. The ledger intentionally stores only times and cooldowns, never keys
 * or request data.
 */
class SarvamLimiter {
  private active = 0;
  private readonly waiters: (() => void)[] = [];
  private observedCooldownUntil = 0;
  constructor(private readonly rpm: number, private readonly concurrency: number, private readonly sleep: (ms: number) => Promise<void>) {}

  private async processSlot(): Promise<() => void> {
    while (this.active >= this.concurrency) await new Promise<void>(resolve => this.waiters.push(resolve));
    this.active++;
    return () => { this.active--; this.waiters.shift()?.(); };
  }

  async acquire(): Promise<() => void> {
    const release = await this.processSlot();
    try {
      let waitedForCooldown = false;
      for (;;) {
        const unlock = await lockFile(this.sleep);
        let wait = 0;
        try {
          const now = Date.now();
          const state = readLimitState();
          state.timestamps = state.timestamps.filter((at) => at > now - WINDOW_MS && at <= now + WINDOW_MS);
          if (state.cooldownUntil > now && state.cooldownUntil > this.observedCooldownUntil && !waitedForCooldown) {
            wait = state.cooldownUntil - now; waitedForCooldown = true; this.observedCooldownUntil = state.cooldownUntil;
          }
          else if (state.timestamps.length >= this.rpm) wait = Math.max(1, state.timestamps[0]! + WINDOW_MS - now);
          else {
            state.timestamps.push(now);
            writeFileSync(LIMIT_FILE, JSON.stringify(state), 'utf8');
            return release;
          }
          writeFileSync(LIMIT_FILE, JSON.stringify(state), 'utf8');
        } finally { unlock(); }
        await this.sleep(wait);
      }
    } catch (error) { release(); throw error; }
  }

  async cooldown(ms: number): Promise<void> {
    const unlock = await lockFile(this.sleep);
    try {
      const state = readLimitState();
      state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + Math.max(0, ms));
      writeFileSync(LIMIT_FILE, JSON.stringify(state), 'utf8');
    } finally { unlock(); }
  }
}

let sharedLimiter: SarvamLimiter | undefined;
const limiter = (sleep: (ms: number) => Promise<void>): SarvamLimiter => {
  // The process-wide limiter is intentionally configured once: changing env vars
  // midway through a run must not let a later client evade the shared budget.
  return sharedLimiter ??= new SarvamLimiter(numberFromEnv('SARVAM_RPM', 30, 1, 10_000), numberFromEnv('SARVAM_CONCURRENCY', 2, 1, 100), sleep);
};
/** Test-only escape hatch; production code never needs to reset a process limiter. */
export function resetSarvamLimiterForTests(): void {
  sharedLimiter = undefined;
  for (const file of [LIMIT_FILE, LOCK_FILE]) try { unlinkSync(file); } catch { /* absent is expected */ }
}

const ALIASES: Record<string, string> = {
  'gemma-4-31b': 'gemma4', 'deepseek-v4.1-flash': 'deepseekv4.1-flash', 'glm-5.3': 'glm5.3',
};
export const resolveSarvamModel = (name: string): string => {
  const normalized = name.trim().toLowerCase();
  return Object.hasOwn(ALIASES, normalized) ? ALIASES[normalized]! : name.trim();
};

/** Load only Sarvam/judge settings, without overriding the shell or reading an unignored dotenv file. */
export function loadSarvamEnv(file = path.resolve(import.meta.dirname, '..', '..', '.env')): boolean {
  if (!existsSync(file)) return false;
  // Trust just this known directory for this read-only command; do not change global Git settings.
  const directory = path.dirname(path.resolve(file));
  const ignored = spawnSync('git', ['-c', `safe.directory=${directory.replace(/\\/g, '/')}`, 'check-ignore', '--quiet', '--', path.resolve(file)], {
    cwd: path.dirname(path.resolve(file)), stdio: 'ignore', windowsHide: true,
  });
  if (ignored.status !== 0) return false;
  let source: string;
  try { source = readFileSync(file, 'utf8'); } catch { throw new Error('Could not read ignored Sarvam environment file'); }
  for (const line of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?((?:SARVAM|JUDGE)_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match || process.env[match[1]!] !== undefined) continue;
    let value = match[2]!.trim();
    if (value.startsWith('"') || value.startsWith("'")) {
      const quote = value[0]!;
      const end = value.indexOf(quote, 1);
      if (end < 0 || !/^\s*(?:#.*)?$/.test(value.slice(end + 1))) continue;
      value = value.slice(1, end);
    } else value = value.replace(/\s+#.*$/, '').trim();
    process.env[match[1]!] = value;
  }
  return true;
}

const count = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

export class SarvamClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limiter: SarvamLimiter;
  private stats: SarvamTransportStats = { attempts: 0, rateLimits: 0 };

  constructor(options: SarvamClientOptions = {}) {
    this.apiKey = options.apiKey ?? process.env.SARVAM_API_KEY ?? '';
    if (!this.apiKey.trim()) throw new Error('SARVAM_API_KEY is required');
    try {
      const url = new URL(options.baseUrl ?? process.env.SARVAM_BASE_URL ?? 'https://api.sarvam.ai/v2');
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
      this.baseUrl = url.toString().replace(/\/+$/, '');
    } catch { throw new Error('SARVAM_BASE_URL must be an HTTP(S) version base URL without credentials, query, or fragment'); }
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    // Six total attempts: the initial call plus five retries.
    this.retries = options.retries ?? 5;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0 || !Number.isInteger(this.retries) || this.retries < 0 || this.retries > 5) {
      throw new Error('Invalid Sarvam timeout or retry settings');
    }
    this.sleep = options.sleep ?? sleepFor;
    this.limiter = limiter(this.sleep);
  }

  transportStats(): SarvamTransportStats { return { ...this.stats }; }

  private async request(endpoint: string, body?: unknown): Promise<{ data: unknown; stats: SarvamTransportStats }> {
    const requestStats: SarvamTransportStats = { attempts: 0, rateLimits: 0 };
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        let response: Response;
        const release = await this.limiter.acquire();
        try {
          requestStats.attempts++; this.stats.attempts++;
          response = await this.fetcher(`${this.baseUrl}${endpoint}`, {
              method: body === undefined ? 'GET' : 'POST',
              headers: { 'api-subscription-key': this.apiKey, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
              ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
            });
        } catch {
          if (attempt >= this.retries) throw new Error(controller.signal.aborted ? 'Sarvam request timed out' : 'Sarvam network request failed');
          await this.sleep(this.backoff(attempt));
          continue;
        } finally { release(); }
        if (!response.ok) {
          const retry = (response.status === 429 || response.status >= 500) && attempt < this.retries;
          if (!retry) throw new Error(`Sarvam HTTP ${response.status}`);
          let delay = this.backoff(attempt);
          if (response.status === 429) {
            requestStats.rateLimits++; this.stats.rateLimits++;
            const retryAfter = this.retryAfter(response.headers.get('retry-after'));
            delay = Math.max(delay, retryAfter);
            await this.limiter.cooldown(delay);
          }
          // Do not consume or log error payloads, which may echo request data.
          await response.body?.cancel().catch(() => {});
          // A 429 publishes a shared cooldown; the next acquire performs that
          // wait once for this worker and every other worker observes it too.
          if (response.status !== 429) await this.sleep(delay);
          continue;
        }
        try { return { data: await response.json(), stats: requestStats }; }
        catch { throw new Error(controller.signal.aborted ? 'Sarvam request timed out' : 'Sarvam response was not valid JSON'); }
      } finally {
        clearTimeout(timer);
      }
    }
  }

  private backoff(attempt: number): number {
    const cap = Math.min(60_000, 500 * 2 ** attempt);
    return Math.round(cap * (0.5 + Math.random()));
  }

  private retryAfter(value: string | null): number {
    if (!value) return 0;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(value);
    return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
  }

  async listModels(): Promise<string[]> {
    const data = object((await this.request('/models')).data);
    if (!Array.isArray(data?.data)) throw new Error('Sarvam model list had an invalid schema');
    return data.data.flatMap(entry => {
      const id = object(entry)?.id;
      return typeof id === 'string' ? [id] : [];
    });
  }

  async complete(request: SarvamRequest): Promise<SarvamCompletion> {
    const model = resolveSarvamModel(request.model);
    const started = performance.now();
    const response = await this.request('/chat/completions', { ...request, model });
    const data = object(response.data);
    const choices = data?.choices;
    const message = Array.isArray(choices) ? object(object(choices[0])?.message) : null;
    if (!message || !(typeof message.content === 'string' || message.content === null || message.content === undefined)) {
      throw new Error('Sarvam completion had an invalid schema');
    }
    const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls.flatMap(value => {
      const call = object(value), fn = object(call?.function);
      return call && typeof fn?.name === 'string' && typeof fn.arguments === 'string'
        ? [{ ...(typeof call.id === 'string' ? { id: call.id } : {}), ...(typeof call.type === 'string' ? { type: call.type } : {}), function: { name: fn.name, arguments: fn.arguments } }]
        : [];
    }) : [];
    if (message.content === undefined && !toolCalls.length) throw new Error('Sarvam completion had an invalid schema');
    const usage = object(data?.usage), details = object(usage?.prompt_tokens_details);
    return {
      content: typeof message.content === 'string' ? message.content : null,
      ...(toolCalls.length ? { toolCalls } : {}),
      usage: {
        promptTokens: count(usage?.prompt_tokens), completionTokens: count(usage?.completion_tokens),
        cachedTokens: count(details?.cached_tokens ?? usage?.cached_tokens ?? usage?.prompt_cache_hit_tokens), totalTokens: count(usage?.total_tokens),
      },
      latencyMs: performance.now() - started,
      model: typeof data?.model === 'string' ? data.model : model,
      attempts: response.stats.attempts,
      rateLimits: response.stats.rateLimits,
      ...(typeof message.reasoning_content === 'string' ? { reasoningContent: message.reasoning_content } : {}),
      ...(Array.isArray(choices) && typeof object(choices[0])?.finish_reason === 'string'
        ? { finishReason: object(choices[0])!.finish_reason as string } : {}),
    };
  }
}

/** INR per million tokens, docs.sarvam.ai pricing checked 2026-10-17; estimates, not billing data. */
export const SARVAM_PRICING_DATE = '2026-10-17';
const PRICES: Record<string, [number, number, number]> = {
  'sarvam-105b': [15, 5, 60], gemma4: [35, 10, 90], 'deepseekv4.1-flash': [25, 0.5, 105], 'glm5.3': [126, 20, 390],
};
export function estimateSarvamCost(model: string, usage: SarvamUsage): number | null {
  const resolved = resolveSarvamModel(model);
  const prices = Object.hasOwn(PRICES, resolved) ? PRICES[resolved] : undefined;
  if (!prices || usage.promptTokens === null || usage.completionTokens === null) return null;
  const cached = Math.min(usage.promptTokens, usage.cachedTokens ?? 0);
  return ((usage.promptTokens - cached) * prices[0] + cached * prices[1] + usage.completionTokens * prices[2]) / 1_000_000;
}
