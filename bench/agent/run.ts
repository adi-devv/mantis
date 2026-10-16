/**
 * Real-agent eval: Codex CLI (`codex exec`) or Claude Code does each task with one browser approach at a time
 * and we record whether it got the answer right, turns, tokens, cost and time. Unlike bench/run.ts
 * this has an LLM in the loop, so results vary run to run; repeat runs to see the spread.
 *
 *   npx tsx bench/agent/run.ts                          # pilot: 2 tasks x 5 approaches x 1 run
 *   AGENT_TASKS=all AGENT_RUNS=3 npx tsx bench/agent/run.ts
 *   AGENT_TASKS=cat:forms AGENT_APPROACHES=mantis,tree npx tsx bench/agent/run.ts
 *   AGENT_RESUME=1 ...                                   (continue a stopped run)
 *   AGENT_PROVIDER=codex AGENT_MODEL=gpt-6.1-sol AGENT_REASONING=medium ... (defaults)
 *
 * Needs a logged-in Codex CLI (default) or Claude Code CLI. Codex reports token usage but no USD cost.
 */
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromiumForMcp } from '../adapters.js';
import { startFixtures } from '../fixtures.js';
import { PILOT, TASKS } from './tasks.js';
import type { AgentTask } from './tasks.js';
import { aggregateUsage, assertCompatibleResume, classifyAttempt, hashSources, makeMetadata, parseClaudeStream, validateFlag, validatePositiveInt } from './integrity.js';
import type { AttemptStatus, RunMetadata, StreamUsage } from './integrity.js';
import { codexArgs, rawMcpToolName } from './codex-config.js';
import { parseCodexStream } from './codex.js';
import type { ParsedCodexStream } from './codex.js';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(REPO, 'bench', 'results');
type Provider = 'codex' | 'claude';
const PROVIDER_VALUE = process.env.AGENT_PROVIDER ?? 'codex';
if (PROVIDER_VALUE !== 'codex' && PROVIDER_VALUE !== 'claude') throw new Error(`AGENT_PROVIDER must be codex or claude; received ${JSON.stringify(PROVIDER_VALUE)}.`);
const PROVIDER: Provider = PROVIDER_VALUE;
const MODEL = process.env.AGENT_MODEL ?? (PROVIDER === 'codex' ? 'gpt-6.1-sol' : 'claude-haiku-5-5');
const REASONING = process.env.AGENT_REASONING ?? 'medium';
if (PROVIDER === 'codex' && !['low', 'medium', 'high', 'xhigh', 'max'].includes(REASONING)) throw new Error(`AGENT_REASONING must be low, medium, high, xhigh, or max; received ${JSON.stringify(REASONING)}.`);
const RUNS = validatePositiveInt('AGENT_RUNS', process.env.AGENT_RUNS, 1, 1000);
const TIMEOUT_S = validatePositiveInt('AGENT_TIMEOUT_S', process.env.AGENT_TIMEOUT_S, 600, 86_400);
const TIMEOUT_MS = TIMEOUT_S * 1000;
/** Runs in flight at once. Each run is its own provider CLI process, MCP server and browser. */
const CONCURRENCY = validatePositiveInt('AGENT_CONCURRENCY', process.env.AGENT_CONCURRENCY, 3, 64);
const RESUME = validateFlag('AGENT_RESUME', process.env.AGENT_RESUME);
const OVERWRITE = validateFlag('AGENT_OVERWRITE', process.env.AGENT_OVERWRITE);
if (RESUME && OVERWRITE) throw new Error('AGENT_RESUME=1 and AGENT_OVERWRITE=1 cannot be used together.');
if (!MODEL.trim() || /[\r\n\0]/.test(MODEL)) throw new Error(`AGENT_MODEL must be a non-empty single-line model name; received ${JSON.stringify(MODEL)}.`);


type Approach = 'mantis' | 'tree' | 'devtools' | 'browseruse' | 'screenshot';
const node = process.execPath;
const MCP_CHROMIUM = chromiumForMcp();
const CODEX_BIN = process.env.CODEX_BIN ?? 'codex';
const VENV_PY = path.join(REPO, 'bench', 'agent', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const TSX = import.meta.resolve('tsx');
interface ServerSpec { command: string; args: string[]; env?: Record<string, string> }

/** Capture through the still-running approach server, after the CLI has closed its bridge. */
async function captureFinalPage(port: number, approach: Approach, file: string): Promise<void> {
  const socket = net.connect(port, '127.0.0.1');
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  let buffer = '';
  const timer = setTimeout(() => socket.destroy(new Error('capture timed out')), 15_000);
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 1);
      if (!line) continue;
      try {
        const message = JSON.parse(line);
        if (typeof message.id !== 'number') continue;
        const request = pending.get(message.id);
        if (!request) continue;
        pending.delete(message.id);
        if (message.error) request.reject(new Error(message.error.message ?? 'MCP error'));
        else request.resolve(message.result);
      } catch { /* ignore malformed server output */ }
    }
  });
  socket.on('error', (error) => { for (const p of pending.values()) p.reject(error); pending.clear(); });
  socket.on('close', () => { for (const p of pending.values()) p.reject(new Error('capture connection closed')); pending.clear(); });
  let id = 0;
  const call = (method: string, params: object): Promise<any> => new Promise((resolve, reject) => {
    const next = ++id;
    pending.set(next, { resolve, reject });
    socket.write(JSON.stringify({ jsonrpc: '2.0', id: next, method, params }) + '\n');
  });
  try {
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    await call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'bench-capture', version: '1.0' } });
    socket.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tool = approach === 'tree' ? 'browser_take_screenshot' : 'bench_capture';
    const args = approach === 'tree' ? { type: 'png', fullPage: false, scale: 'css' } : {};
    const result = await call('tools/call', { name: tool, arguments: args });
    if (result.isError) throw new Error('capture tool failed');
    const data = result.content?.find((item: { type: string; mimeType?: string }) => item.type === 'image' && item.mimeType === 'image/png')?.data;
    if (typeof data !== 'string') throw new Error('capture returned no PNG');
    writeFileSync(file, Buffer.from(data, 'base64'));
  } finally { clearTimeout(timer); socket.destroy(); }
}

function sourceFilesUnder(folder: string): string[] {
  return readdirSync(path.join(REPO, folder), { withFileTypes: true }).flatMap((entry) => {
    const relative = path.posix.join(folder.replaceAll('\\', '/'), entry.name);
    return entry.isDirectory() ? sourceFilesUnder(relative) : entry.isFile() ? [relative] : [];
  }).sort();
}

/**
 * Start the approach's MCP server ourselves, let it warm up, and expose it on a local port. Claude
 * Code then launches bench/agent/bridge.mjs, which connects instantly. Without this, a slow-starting
 * server (browser-use: ~6 s of Python imports) is still "pending" when the agent starts, the model gets
 * no tools and imitates tool calls as text. Startup time stays out of every approach's measured time.
 */
async function startServer(spec: ServerSpec, warmMs: number, log: string): Promise<{ port: number; stop: () => void; failure: () => string | null }> {
  const child: ChildProcess = spawn(spec.command, spec.args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...(spec.env ?? {}) } });
  let stderr = '';
  let stopping = false;
  let childFailure: string | null = null;
  const sockets = new Set<net.Socket>();
  const failed = new Promise<never>((_, reject) => {
    child.once('error', (error) => { childFailure = error.message; reject(error); });
    child.once('exit', (code, signal) => {
      if (!stopping) {
        childFailure = `server exited during startup (code ${code ?? 'null'}, signal ${signal ?? 'none'})`;
        reject(new Error(childFailure));
      }
    });
  });
  void failed.catch(() => {});
  child.stderr?.on('data', (d) => { stderr += d; });
  child.stdin?.on('error', () => { /* a reconnecting MCP client may close its socket */ });
  child.stdout?.on('error', (error) => { if (!stopping) childFailure = `server stdout failed: ${error.message}`; });
  const srv = net.createServer((sock) => {
    sockets.add(sock);
    sock.on('error', () => { /* MCP clients can disconnect while the child remains healthy */ });
    sock.on('close', () => {
      sockets.delete(sock);
      sock.unpipe(child.stdin!);
      child.stdout!.unpipe(sock);
    });
    sock.pipe(child.stdin!, { end: false });
    child.stdout!.pipe(sock, { end: false });
  });
  try {
    await new Promise<void>((ok, fail) => {
      srv.once('error', fail);
      srv.listen(0, '127.0.0.1', ok);
    });
    await Promise.race([new Promise((ok) => setTimeout(ok, warmMs)), failed]);
    if (childFailure) throw new Error(childFailure);
  } catch (error) {
    stopping = true;
    srv.close();
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    else child.kill('SIGKILL');
    throw error;
  }
  const port = (srv.address() as net.AddressInfo).port;
  let stopped = false;
  return {
    port,
    failure: () => childFailure,
    stop: () => {
      if (stopped) return;
      stopped = true;
      stopping = true;
      srv.close();
      for (const sock of sockets) sock.destroy();
      child.stdout?.unpipe();
      child.stdin?.end();
      writeFileSync(log, stderr);
      // The server may have started a browser: end the whole process tree.
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
      else child.kill('SIGKILL');
    },
  };
}

const APPROACHES: Record<Approach, { label: string; server: (dir: string) => Record<string, ServerSpec>; warmMs?: number; allow: string[]; deny?: string[] }> = {
  mantis: {
    label: 'Mantis',
    server: (dir) => ({ mantis: { command: node, args: [path.join(REPO, 'bench', 'agent', 'bridge.mjs'), '--mantis-server'], env: { MANTIS_MEMORY_DIR: path.join(dir, 'mem') } } }),
    allow: ['mcp__mantis'],
    deny: ['mcp__mantis__bench_capture'],
  },
  tree: {
    label: 'Accessibility tree (Playwright MCP)',
    server: (dir) => ({
      playwright: {
        command: node,
        // Same browser binary as the token benchmark (Playwright MCP otherwise looks for an installed Chrome).
        args: [
          path.join(REPO, 'node_modules', '@playwright', 'mcp', 'cli.js'), '--headless', '--isolated', '--viewport-size', '1280x800', '--output-dir', path.join(dir, 'tree-output'),
          ...(MCP_CHROMIUM ? ['--executable-path', MCP_CHROMIUM] : []),
        ],
      },
    }),
    allow: [
      'navigate', 'navigate_back', 'snapshot', 'click', 'type', 'fill_form', 'select_option', 'press_key', 'hover',
      'wait_for', 'find', 'tabs', 'handle_dialog', 'take_screenshot',
    ].map((t) => `mcp__playwright__browser_${t}`),
    // Running page JavaScript would bypass the approach being measured.
    deny: ['mcp__playwright__browser_evaluate', 'mcp__playwright__browser_run_code_unsafe'],
  },
  devtools: {
    label: 'Chrome DevTools MCP',
    // Main script directly: the bin wrapper refuses Node < 20.19, the server itself runs fine.
    server: () => ({
      devtools: {
        command: node,
        args: [
          path.join(REPO, 'node_modules', 'chrome-devtools-mcp', 'build', 'src', 'bin', 'chrome-devtools-mcp-main.js'),
          '--headless', '--isolated', ...(MCP_CHROMIUM ? ['--executablePath', MCP_CHROMIUM] : []), '--viewport', '1280x800',
          // Same rule as the other tools: no page JavaScript; only navigation and input tools.
          '--javascriptEvaluation=false', '--categoryPerformance=false', '--categoryNetwork=false', '--categoryDebugging=false',
          '--categoryMemory=false', '--categoryEmulation=false', '--usageStatistics=false', '--performanceCrux=false', '--pageIdRouting=false',
        ],
        env: { CHROME_DEVTOOLS_MCP_NO_USAGE_STATISTICS: '1' },
      },
    }),
    allow: ['mcp__devtools'],
  },
  browseruse: {
    label: 'browser-use (MCP)',
    server: (dir) => {
      // Per-run config: headless, temp profile, no telemetry or extension downloads. It finds Playwright's
      // Chromium itself (an explicit executable_path fails to start on Windows).
      const cfgDir = path.join(dir, 'browseruse');
      mkdirSync(cfgDir, { recursive: true });
      writeFileSync(path.join(cfgDir, 'config.json'), JSON.stringify({
        browser_profile: { bench: {
          id: 'bench', default: true, headless: true, user_data_dir: path.join(dir, 'bu-profile'),
          window_size: { width: 1280, height: 800 },
        } },
        llm: {}, agent: {},
      }));
      return {
        browseruse: {
          command: VENV_PY,
          args: ['-m', 'browser_use.mcp'],
          env: {
            BROWSER_USE_CONFIG_DIR: cfgDir, BROWSER_USE_HEADLESS: 'true', ANONYMIZED_TELEMETRY: 'false',
            BROWSER_USE_CLOUD_SYNC: 'false', BROWSER_USE_DISABLE_EXTENSIONS: 'true', BROWSER_USE_VERSION_CHECK: 'false',
          },
        },
      };
    },
    warmMs: 12_000,
    allow: ['mcp__browseruse'],
    // Tools that need an OpenAI key (an LLM inside the tool), and raw HTML, which bypasses its page view.
    deny: ['mcp__browseruse__browser_extract_content', 'mcp__browseruse__retry_with_browser_use_agent', 'mcp__browseruse__browser_get_html'],
  },
  screenshot: {
    label: 'Screenshots (click by x,y)',
    // tsx by absolute URL: runs start in an empty temp folder where a bare 'tsx' does not resolve.
    server: () => ({ screenshot: { command: node, args: ['--import', TSX, path.join(REPO, 'bench', 'agent', 'screenshot-mcp.ts')] } }),
    allow: ['mcp__screenshot'],
    deny: ['mcp__screenshot__bench_capture'],
  },
};

function preflightApproaches(approaches: Approach[]): void {
  const requirements: Record<Approach, string> = {
    mantis: path.join(REPO, 'dist', 'server.js'),
    tree: path.join(REPO, 'node_modules', '@playwright', 'mcp', 'cli.js'),
    devtools: path.join(REPO, 'node_modules', 'chrome-devtools-mcp', 'build', 'src', 'bin', 'chrome-devtools-mcp-main.js'),
    browseruse: VENV_PY,
    screenshot: path.join(REPO, 'bench', 'agent', 'screenshot-mcp.ts'),
  };
  const missing = [path.join(REPO, 'dist', 'server.js'), ...approaches.map((a) => requirements[a])].filter((p, i, list) => list.indexOf(p) === i && !existsSync(p));
  if (missing.length) throw new Error(`Benchmark preflight failed; required approach dependencies are missing: ${missing.join(', ')}. Install/build them before starting the selected agent CLI.`);
  if (!existsSync(node)) throw new Error(`Benchmark preflight failed; Node executable is missing: ${node}`);
  if (MCP_CHROMIUM && !existsSync(MCP_CHROMIUM)) throw new Error(`Benchmark preflight failed; Playwright Chromium is missing: ${MCP_CHROMIUM}`);
}

function claudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const win = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  return process.platform === 'win32' && existsSync(win) ? win : 'claude';
}

interface AttemptResult {
  attempt: number;
  finalScreenshotPath: string | null;
  status: AttemptStatus;
  connected: boolean;
  connectionState: 'connected' | 'failed' | 'unknown';
  error: string;
  answer: string;
  initModel: string | null;
  resolvedModels: string[];
  turns: number | null;
  toolCalls: number;
  toolErrors: number;
  observationChars: number;
  observationImages: number;
  totalInputTokens: number | null;
  usageComplete: boolean;
  usage: StreamUsage;
  timings: { mcpStartupMs: number; cliStartupMs: number | null; cliExecutionMs: number | null; cliWallMs: number | null; verificationMs: number; cleanupMs: number };
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  fixtureCheck: { ok: boolean | null; details?: string } | null;
  diagnostics: string[];
}

interface RunResult {
  task: string; approach: Approach; run: number;
  finalScreenshotPath?: string | null;
  status: AttemptStatus; ok: boolean; error: string; answer: string;
  /** A connection failure is excluded from correctness; a timeout after launch remains attempted. */
  valid: boolean;
  turns: number | null; toolCalls: number; toolErrors: number; observationChars: number; observationImages: number;
  inputTokens: number | null; cacheWriteTokens: number | null; cacheReadTokens: number | null;
  /** Legacy total of normal + cache input tokens. */
  totalInputTokens: number | null;
  outputTokens: number | null; costUsd: number | null;
  timings: { mcpStartupMs: number; cliStartupMs: number | null; cliExecutionMs: number | null; cliWallMs: number | null; verificationMs: number; cleanupMs: number };
  resolvedModels: string[];
  attempts: AttemptResult[];
}

async function runOnce(task: AgentTask, approach: Approach, base: string, run: number, attempt: number, fixtures: Awaited<ReturnType<typeof startFixtures>>, logDir: string): Promise<AttemptResult> {
  const startupStarted = Date.now();
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mantis-agent-'));
  mkdirSync(logDir, { recursive: true });
  const unique = `${task.id}--${approach}--${run}--attempt-${attempt}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const serverLog = path.join(logDir, `${unique}.server.log`);
  const attemptId = `${task.id}-${approach}-${run}-${attempt}-${Date.now()}`;
  let server: Awaited<ReturnType<typeof startServer>> | null = null;
  let mcpStartupMs = 0;
  let cliStart: number | null = null;
  let processResult: { out: string; exitCode: number | null; signal: string | null; timedOut: boolean; launchError: string | null; initAt: number | null; exitAt: number | null } = {
    out: '', exitCode: null, signal: null, timedOut: false, launchError: null, initAt: null, exitAt: null,
  };
  let startupError: string | null = null;
  let fixtureCheck: AttemptResult['fixtureCheck'] = null;
  let verificationMs = 0;
  let cleanupMs = 0;
  let parsed: ReturnType<typeof parseClaudeStream> | ReturnType<typeof parseCodexStream> = parseClaudeStream('');
  let finalScreenshotPath: string | null = null;
  try {
    const cfg = path.join(dir, 'mcp.json');
    const [name, spec] = Object.entries(APPROACHES[approach].server(dir))[0]!;
    server = await startServer(spec, APPROACHES[approach].warmMs ?? 2_000, serverLog);
    mcpStartupMs = Date.now() - startupStarted;
    if (server.failure()) throw new Error(server.failure()!);
    const bridge = { command: node, args: [path.join(REPO, 'bench', 'agent', 'bridge.mjs'), String(server.port)] };
    writeFileSync(cfg, JSON.stringify({ mcpServers: { [name]: bridge } }));
    const taskBase = task.site === 'local' ? fixtures.baseFor(task.id, attemptId) : base;
    // Judged real-site prompts already say how to end the reply (FINAL_URL line); the judge reads the whole reply.
    const prompt = task.judged
      ? `${task.prompt(taskBase)}\n\nUse only the browser tools you have.`
      : `${task.prompt(taskBase)}\n\nUse only the browser tools you have. When you are done, end your reply with one line: ANSWER: <answer>`;
    const a = APPROACHES[approach];
    const codexServer = {
      name, command: node, args: bridge.args,
      enabledTools: a.allow.map((tool) => rawMcpToolName(name, tool)).filter((tool): tool is string => tool !== null),
      disabledTools: (a.deny ?? []).map((tool) => rawMcpToolName(name, tool)).filter((tool): tool is string => tool !== null),
    };
    const cliCommand = PROVIDER === 'codex' ? CODEX_BIN : claudeBin();
    const args = PROVIDER === 'codex'
      ? codexArgs({ model: MODEL, reasoning: REASONING, prompt, cwd: dir, server: codexServer })
      : [
        '-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--mcp-config', cfg,
        '--setting-sources', '', '--allowedTools', ...a.allow, ...(a.deny ? ['--disallowedTools', ...a.deny] : []),
      ];
    cliStart = Date.now();
    processResult = await new Promise<typeof processResult>((done) => {
      // Wait for MCP servers to connect before the first turn (otherwise the model may start with no tools).
      const env = { ...process.env, MCP_CONNECTION_NONBLOCKING: 'false', MCP_TIMEOUT: '60000' };
      const p = spawn(cliCommand, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env });
      let stream = '';
      let stderr = '';
      const stdoutLog = createWriteStream(path.join(logDir, `${unique}.jsonl`));
      stdoutLog.on('error', () => { /* keep the attempt alive if the diagnostic log cannot be written */ });
      let timedOut = false;
      let settled = false;
      let initAt: number | null = null;
      let killGrace: ReturnType<typeof setTimeout> | undefined;
      const finish = (result: typeof processResult): void => {
        if (settled) return;
        settled = true;
        if (killGrace) clearTimeout(killGrace);
        done(result);
      };
      p.stdout.on('data', (d) => {
        stream += String(d);
        stdoutLog.write(d);
        if (initAt === null && (PROVIDER === 'codex'
          ? /"type"\s*:\s*"thread\.started"/.test(stream)
          : /"type"\s*:\s*"system".*"subtype"\s*:\s*"init"/.test(stream))) initAt = Date.now();
      });
      p.stderr.on('data', (d) => { stderr += String(d); });
      const terminateTree = (): void => {
        if (process.platform === 'win32' && p.pid) {
          const killed = spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          if (killed.status !== 0) p.kill('SIGKILL');
        } else p.kill('SIGKILL');
      };
      const timer = setTimeout(() => {
        timedOut = true;
        terminateTree();
        // A descendant can keep stdout open; stop waiting after bounded tree termination.
        killGrace = setTimeout(() => {
          const result = { out: stream, exitCode: null, signal: 'termination-timeout', timedOut, launchError: null, initAt, exitAt: Date.now() };
          stdoutLog.end(() => finish(result));
        }, 5_000);
      }, TIMEOUT_MS);
      p.on('error', (error) => {
        clearTimeout(timer);
        if (killGrace) clearTimeout(killGrace);
        const result = { out: stream, exitCode: null, signal: null, timedOut, launchError: error.message, initAt, exitAt: Date.now() };
        stdoutLog.end(() => finish(result));
      });
      p.on('close', (code, signal) => {
        clearTimeout(timer);
        if (killGrace) clearTimeout(killGrace);
        const exitAt = Date.now();
        try { writeFileSync(path.join(logDir, `${unique}.stderr.log`), stderr); } catch { /* event JSON remains available */ }
        const result = { out: stream, exitCode: code, signal, timedOut, launchError: null, initAt, exitAt };
        stdoutLog.end(() => finish(result));
      });
    });
    parsed = PROVIDER === 'codex' ? parseCodexStream(processResult.out, name) : parseClaudeStream(processResult.out);
    if (task.judged && (approach === 'mantis' || approach === 'tree' || approach === 'screenshot')) {
      const shot = path.join(logDir, `${unique}.final.png`);
      try {
        await captureFinalPage(server.port, approach, shot);
        finalScreenshotPath = shot;
      } catch (error) {
        console.warn(`[agent] final capture failed for ${unique}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (task.site === 'local' && task.check) {
      const verifyStart = Date.now();
      fixtureCheck = await fixtures.verify(task.id, attemptId);
      verificationMs = Date.now() - verifyStart;
    }
  } catch (error) {
    startupError = error instanceof Error ? error.message : String(error);
    if (!mcpStartupMs) mcpStartupMs = Date.now() - startupStarted;
    writeFileSync(serverLog, startupError);
  } finally {
    const cleanupStart = Date.now();
    try { server?.stop(); } catch { /* preserve the recorded attempt if cleanup fails */ }
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* temporary profile cleanup is best effort */ }
    cleanupMs = Date.now() - cleanupStart;
  }
  const answer = (task.judged
    ? (parsed.resultText ?? '').replace(/^\s*FINAL_URL:.*$/gim, '')
    : (/ANSWER:\s*(.+)/i.exec(parsed.resultText ?? '')?.[1] ?? (parsed.resultText ?? '').slice(-200))).trim().slice(0, 160);
  const connected = parsed.connected;
  const connectionState = connected ? 'connected' : parsed.sawInit ? 'failed' : 'unknown';
  let status = classifyAttempt({
    sawInit: parsed.sawInit, connected, sawResult: parsed.sawResult, resultError: parsed.resultError,
    timedOut: processResult.timedOut, launchError: processResult.launchError ?? startupError,
    exitCode: processResult.exitCode, answerMatches: task.expect.test(parsed.resultText ?? ''),
    hasFixtureCheck: !!task.check, fixtureOk: fixtureCheck?.ok ?? null,
  });
  const codexConfigFailure = PROVIDER === 'codex' && (parsed as ParsedCodexStream).diagnostics.some((message: string) =>
    /Code Mode is unavailable|codex-code-mode-host/i.test(message));
  if (codexConfigFailure) status = 'cli_error';
  if (PROVIDER === 'codex' && 'policyViolation' in parsed && parsed.policyViolation) status = 'cli_error';
  let error = '';
  if (status === 'connection_failure') error = `MCP connection failed: ${parsed.mcpStatuses.join(', ') || 'no server reported connected'}`;
  else if (status === 'timeout') error = `timed out after ${TIMEOUT_S}s`;
  else if (status === 'crash') error = processResult.launchError || startupError || `${PROVIDER} CLI exited with code ${processResult.exitCode ?? 'unknown'}`;
  else if (status === 'cli_error') error = codexConfigFailure
    ? 'Codex Code Mode host is unavailable; check the installed CLI companion executable and configuration.'
    : PROVIDER === 'codex' && 'policyViolation' in parsed && parsed.policyViolation
    ? 'Codex used a local command tool outside the browser MCP comparison.'
    : (parsed.resultText ?? `${PROVIDER} CLI returned no result`).slice(0, 200);
  else if (status === 'wrong_answer') error = fixtureCheck?.details || 'answer did not match the expected result';
  const cliExitAt = processResult.exitAt;
  const cliWallMs = cliStart === null || cliExitAt === null ? null : cliExitAt - cliStart;
  return {
    attempt, finalScreenshotPath, status, connected, connectionState, error, answer, initModel: parsed.initModel, resolvedModels: parsed.resolvedModels,
    turns: parsed.turns, toolCalls: parsed.toolCalls, toolErrors: parsed.toolErrors,
    observationChars: parsed.observationChars, observationImages: parsed.observationImages,
    totalInputTokens: PROVIDER === 'codex' ? (parsed as ReturnType<typeof parseCodexStream>).totalInputTokens :
      ([parsed.usage.inputTokens, parsed.usage.cacheWriteTokens, parsed.usage.cacheReadTokens].some((n) => n === null)
        ? null : (parsed.usage.inputTokens ?? 0) + (parsed.usage.cacheWriteTokens ?? 0) + (parsed.usage.cacheReadTokens ?? 0)),
    usageComplete: parsed.usageComplete, usage: parsed.usage,
    timings: {
      mcpStartupMs, cliStartupMs: processResult.initAt === null || cliStart === null ? null : processResult.initAt - cliStart,
      cliExecutionMs: processResult.initAt === null || cliExitAt === null ? null : cliExitAt - processResult.initAt,
      cliWallMs, verificationMs, cleanupMs,
    },
    exitCode: processResult.exitCode, signal: processResult.signal, timedOut: processResult.timedOut, fixtureCheck,
    diagnostics: PROVIDER === 'codex' ? (parsed as ParsedCodexStream).diagnostics : [],
  };
}

const fmt = (n: number): string => n.toLocaleString('en-US');
const fmtMaybe = (n: number | null): string => n === null ? 'unknown' : fmt(n);

function report(results: RunResult[], approaches: Approach[], tasks: AgentTask[], metadata: RunMetadata): string {
  const L: string[] = [];
  L.push('# Real-agent eval');
  L.push('');
  L.push(`> ${PROVIDER === 'codex' ? 'Codex CLI (`codex exec`)' : 'Claude Code (`claude -p`)'} (requested model \`${MODEL}\`${PROVIDER === 'codex' ? `, reasoning ${REASONING}` : ''}) does each task with one browser approach at a time. ` +
    `Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the ${PROVIDER === 'codex' ? 'Codex event stream' : 'Claude stream'}; ${PROVIDER === 'codex' ? 'Codex does not report USD cost, so cost remains unknown' : 'reported cost is retained'}; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.`);
  L.push('');
  L.push(`- Date: ${new Date().toISOString().slice(0, 10)}; runs per task and approach: ${RUNS}; ${CONCURRENCY} runs in parallel.`);
  L.push(`- Scope: ${tasks.length} tasks × ${approaches.length} approaches × ${RUNS} runs = ${tasks.length * approaches.length * RUNS} logical runs; ${results.length} recorded so far; ${results.reduce((n, r) => n + r.attempts.length, 0)} total attempts including retries.`);
  L.push(`- ${PROVIDER === 'codex' ? 'Codex' : 'Claude'} CLI version: ${metadata.cliVersion ?? 'unknown'}; resolved model(s): ${[...new Set(results.flatMap((r) => r.attempts.flatMap((a) => a.resolvedModels)))].join(', ') || 'unknown'}.`);
  L.push(`- MCP startup (spawn + warm-up) is separate from ${PROVIDER === 'codex' ? 'Codex' : 'Claude'} CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first ${PROVIDER === 'codex' ? '`thread.started`' : 'init'} event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.`);
  L.push(`- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from ${PROVIDER === 'codex' ? 'Codex-reported' : 'Claude-reported'} input tokens; the benchmark does not subtract it to estimate overhead.`);
  L.push('- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. ' +
    'Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.');
  L.push(`- No skill, no system prompt beyond the task; built-in tools off. ${PROVIDER === 'codex' ? 'Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.' : ''}`);
  L.push('- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.');
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push(`| | ${approaches.map((a) => APPROACHES[a].label).join(' | ')} |`);
  L.push(`|---|${approaches.map(() => '---:').join('|')}|`);
  const by = (a: Approach): RunResult[] => results.filter((r) => r.approach === a);
  const sumNumber = (rs: RunResult[], k: 'toolCalls' | 'toolErrors' | 'observationChars' | 'observationImages' | 'mcpStartupMs' | 'verificationMs' | 'cleanupMs'): number => rs.reduce((s, r) => {
    if (k === 'toolCalls' || k === 'toolErrors' || k === 'observationChars' || k === 'observationImages') return s + r[k];
    return s + r.timings[k];
  }, 0);
  const sumNullable = (rs: RunResult[], k: 'inputTokens' | 'cacheWriteTokens' | 'cacheReadTokens' | 'outputTokens' | 'costUsd' | 'totalInputTokens'): number | null => {
    const vals = rs.map((r) => r[k]);
    return vals.length === 0 || vals.some((x) => x === null) ? null : vals.reduce<number>((s, x) => s + (x ?? 0), 0);
  };
  const sumTiming = (rs: RunResult[], k: 'cliStartupMs' | 'cliExecutionMs' | 'cliWallMs'): number | null => {
    const vals = rs.map((r) => r.timings[k]);
    return vals.length === 0 || vals.some((x) => x === null) ? null : vals.reduce<number>((s, x) => s + (x ?? 0), 0);
  };
  L.push(`| Correct | ${approaches.map((a) => `${by(a).filter((r) => r.ok).length} / ${by(a).filter((r) => r.valid).length}`).join(' | ')} |`);
  L.push(`| Connection-failure attempts | ${approaches.map((a) => by(a).reduce((n, r) => n + r.attempts.filter((attempt) => attempt.status === 'connection_failure').length, 0)).join(' | ')} |`);
  L.push(`| Logical runs ending in connection failure | ${approaches.map((a) => by(a).filter((r) => r.status === 'connection_failure').length).join(' | ')} |`);
  L.push(`| Other attempted failures | ${approaches.map((a) => by(a).filter((r) => r.valid && !r.ok).length).join(' | ')} |`);
  L.push(`| Tool calls (including retries) | ${approaches.map((a) => fmt(sumNumber(by(a), 'toolCalls'))).join(' | ')} |`);
  L.push(`| MCP tool errors (including retries) | ${approaches.map((a) => fmt(sumNumber(by(a), 'toolErrors'))).join(' | ')} |`);
  L.push(`| Browser observation text (observed chars) | ${approaches.map((a) => fmt(sumNumber(by(a), 'observationChars'))).join(' | ')} |`);
  L.push(`| Browser observation images (observed blocks) | ${approaches.map((a) => fmt(sumNumber(by(a), 'observationImages'))).join(' | ')} |`);
  for (const [label, field] of [['Normal input tokens', 'inputTokens'], ['Cache-write input tokens', 'cacheWriteTokens'], ['Cache-read input tokens', 'cacheReadTokens'], ['Output tokens', 'outputTokens']] as const) {
    L.push(`| ${label} (total) | ${approaches.map((a) => fmtMaybe(sumNullable(by(a), field))).join(' | ')} |`);
  }
  L.push(`| Total input tokens incl. cache (legacy) | ${approaches.map((a) => fmtMaybe(sumNullable(by(a), 'totalInputTokens'))).join(' | ')} |`);
  L.push(`| MCP startup (total, s) | ${approaches.map((a) => (sumNumber(by(a), 'mcpStartupMs') / 1000).toFixed(1)).join(' | ')} |`);
  L.push(`| CLI startup (total, s) | ${approaches.map((a) => { const n = sumTiming(by(a), 'cliStartupMs'); return n === null ? 'unknown' : (n / 1000).toFixed(1); }).join(' | ')} |`);
  L.push(`| CLI execution (total, s) | ${approaches.map((a) => { const n = sumTiming(by(a), 'cliExecutionMs'); return n === null ? 'unknown' : (n / 1000).toFixed(1); }).join(' | ')} |`);
  L.push(`| CLI wall (total, s) | ${approaches.map((a) => { const n = sumTiming(by(a), 'cliWallMs'); return n === null ? 'unknown' : (n / 1000).toFixed(1); }).join(' | ')} |`);
  L.push(`| Fixture verification (total, s) | ${approaches.map((a) => (sumNumber(by(a), 'verificationMs') / 1000).toFixed(1)).join(' | ')} |`);
  L.push(`| Cleanup (total, s) | ${approaches.map((a) => (sumNumber(by(a), 'cleanupMs') / 1000).toFixed(1)).join(' | ')} |`);
  L.push(`| Cost estimate (USD; including retries) | ${approaches.map((a) => { const n = sumNullable(by(a), 'costUsd'); return n === null ? 'unknown' : n.toFixed(2); }).join(' | ')} |`);
  L.push('');
  L.push('## Per run');
  L.push('');
  L.push('| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |');
  L.push('|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|');
  for (const t of tasks) {
    for (const r of results.filter((x) => x.task === t.id)) {
      const note = (r.error || r.answer).replace(/\|/g, '\\|').replace(/\s+/g, ' ');
      L.push(`| \`${r.task}\` | ${APPROACHES[r.approach].label} | ${r.run} | ${r.status} | ${r.attempts.length} | ${r.toolCalls} | ${r.toolErrors} | ${fmt(r.observationChars)} | ${r.observationImages} | ${fmtMaybe(r.inputTokens)} | ${fmtMaybe(r.cacheWriteTokens)} | ${fmtMaybe(r.cacheReadTokens)} | ${fmtMaybe(r.outputTokens)} | ${(r.timings.mcpStartupMs / 1000).toFixed(1)} | ${r.timings.cliStartupMs === null ? 'unknown' : (r.timings.cliStartupMs / 1000).toFixed(1)} | ${r.timings.cliExecutionMs === null ? 'unknown' : (r.timings.cliExecutionMs / 1000).toFixed(1)} | ${r.timings.cliWallMs === null ? 'unknown' : (r.timings.cliWallMs / 1000).toFixed(1)} | ${(r.timings.verificationMs / 1000).toFixed(2)} | ${(r.timings.cleanupMs / 1000).toFixed(2)} | ${note} |`);
    }
  }
  return L.join('\n') + '\n';
}

const want = process.env.AGENT_TASKS ?? PILOT.join(',');
// "all", task ids, or categories ("cat:forms"), comma-separated.
const picks = want.split(',');
const categories = [...new Set(TASKS.map((t) => t.category))];
for (const pick of picks) {
  if (pick !== 'all' && !TASKS.some((t) => t.id === pick) && !categories.includes(pick.replace(/^cat:/, '') as AgentTask['category'])) {
    throw new Error(`unknown AGENT_TASKS entry ${JSON.stringify(pick)}; ids: ${TASKS.map((t) => t.id).join(', ')}`);
  }
}
// "all" means the deterministic tasks; judged real-site tasks must be asked for (cat:realsite).
const tasks = want === 'all' ? TASKS.filter((t) => !t.judged) : TASKS.filter((t) => picks.includes(t.id) || picks.includes(`cat:${t.category}`) || picks.includes(t.category));
if (!tasks.length) throw new Error(`no tasks match AGENT_TASKS=${want}; ids: ${TASKS.map((t) => t.id).join(', ')}`);
const approaches = (process.env.AGENT_APPROACHES ?? 'mantis,tree,screenshot').split(',') as Approach[];
const validApproaches: Approach[] = ['mantis', 'tree', 'devtools', 'browseruse', 'screenshot'];
if (!approaches.length || approaches.some((a) => !validApproaches.includes(a)) || new Set(approaches).size !== approaches.length) {
  throw new Error(`AGENT_APPROACHES must be a comma-separated unique list from: ${validApproaches.join(', ')}`);
}
const providerPrefix = PROVIDER === 'codex' ? 'codex' : 'claude';
const rawName = process.env.AGENT_OUT ?? `${providerPrefix}-agent-verified${want === PILOT.join(',') ? '-pilot' : ''}`;
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(rawName) || rawName === '.' || rawName === '..') throw new Error(`invalid AGENT_OUT name: ${JSON.stringify(rawName)}`);
const name = rawName;
const jobs: { t: AgentTask; a: Approach; run: number }[] = [];
for (const t of tasks) for (let run = 1; run <= RUNS; run++) for (const a of approaches) jobs.push({ t, a, run });
const key = (task: string, a: string, run: number): string => `${task}|${a}|${run}`;
const order = (r: RunResult): number => jobs.findIndex((j) => j.t.id === r.task && j.a === r.approach && j.run === r.run);

mkdirSync(OUT, { recursive: true });
const jsonPath = path.join(OUT, `${name}.json`);
const markdownPath = path.join(OUT, `${name}.md`);
const outputExists = existsSync(jsonPath) || existsSync(markdownPath);
const results: RunResult[] = [];
if (outputExists && !RESUME && !OVERWRITE) {
  throw new Error(`${jsonPath} already exists. Set AGENT_RESUME=1 for a matching schema/configuration, or AGENT_OVERWRITE=1 to replace it.`);
}
if (!existsSync(jsonPath) && RESUME) throw new Error(`AGENT_RESUME=1 requested, but ${jsonPath} does not exist.`);
const settings = {
  provider: PROVIDER,
  tasks: tasks.map((t) => t.id), approaches, runs: RUNS, model: MODEL, reasoning: PROVIDER === 'codex' ? REASONING : 'not-applicable', timeoutMs: TIMEOUT_MS, concurrency: CONCURRENCY,
  toolRestrictions: {
    builtins: PROVIDER === 'codex'
      ? ['shell', 'apps', 'plugins', 'multi_agent', 'goals', 'sleep_tool', 'skill_search', 'view_image', 'browser_use', 'computer_use', 'in_app_browser', 'web_search']
      : ['Claude built-ins disabled by --tools ""'],
    approaches: Object.fromEntries(approaches.map((a) => [a, { allow: APPROACHES[a].allow, deny: APPROACHES[a].deny ?? [] }])),
  },
  runtime: { nodeVersion: process.version, platform: process.platform, arch: process.arch },
  environment: {
    MANTIS_MEMORY: process.env.MANTIS_MEMORY ?? null,
    MANTIS_HEADLESS: process.env.MANTIS_HEADLESS ?? null,
    BENCH_CHROMIUM: process.env.BENCH_CHROMIUM ?? null,
    PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
    CODEX_BIN: process.env.CODEX_BIN ?? null,
    CLAUDE_BIN: process.env.CLAUDE_BIN ?? null,
    resolvedCliCommand: PROVIDER === 'codex' ? CODEX_BIN : claudeBin(),
  },
  browserPaths: {
    chromiumForMcp: MCP_CHROMIUM ?? null,
    browserUsePlaywrightBrowsersPath: process.env.PLAYWRIGHT_BROWSERS_PATH ?? null,
  },
};
preflightApproaches(approaches);
const sourceFiles = [
  'bench/agent/run.ts', 'bench/agent/integrity.ts', 'bench/agent/tasks.ts', 'bench/agent/bridge.mjs',
  'bench/agent/codex.ts', 'bench/agent/codex-config.ts', 'bench/agent/realsite.ts',
  ...(existsSync(path.join(REPO, 'bench', 'agent', 'realsite-tasks.json')) ? ['bench/agent/realsite-tasks.json'] : []),
  'bench/agent/screenshot-mcp.ts', 'bench/fixtures.ts', 'bench/fixtures-more.ts', 'bench/adapters.ts',
  ...sourceFilesUnder('src'), ...sourceFilesUnder('dist'), 'package-lock.json',
];
const sourceHashes = hashSources(REPO, sourceFiles);
const selectedCliCommand = PROVIDER === 'codex' ? CODEX_BIN : claudeBin();
const cliProbe = spawnSync(selectedCliCommand, ['--version'], { encoding: 'utf8', timeout: 15_000, windowsHide: true });
if (cliProbe.error || cliProbe.status !== 0) throw new Error(`Benchmark preflight failed; ${PROVIDER} CLI version could not be read: ${cliProbe.error?.message ?? cliProbe.stderr ?? `exit ${cliProbe.status}`}`);
const cliVersion = (cliProbe.stdout || cliProbe.stderr).trim().slice(0, 200) || null;
if (!cliVersion) throw new Error(`Benchmark preflight failed; ${PROVIDER} CLI returned an empty version string.`);
const metadata = makeMetadata(settings, sourceHashes, cliVersion);
if (existsSync(jsonPath) && RESUME) {
  const saved: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'));
  assertCompatibleResume(saved, metadata);
  results.push(...(saved.results as RunResult[]));
}
const done = new Set(results.map((r) => key(r.task, r.approach, r.run)));
const todo = jobs.filter((j) => !done.has(key(j.t.id, j.a, j.run)));

/** Results are written after every run, so a stopped eval loses nothing and can resume. */
function save(): void {
  results.sort((x, y) => order(x) - order(y));
  writeFileSync(jsonPath, JSON.stringify({ metadata, model: MODEL, runs: RUNS, results }, null, 2));
  writeFileSync(markdownPath, report(results, approaches, tasks, metadata));
}

const fx = await startFixtures({ checks: tasks.map((t) => ({ taskId: t.id, check: t.check })) });
try {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < todo.length) {
      const { t, a, run } = todo[next++]!;
      const attempts: AttemptResult[] = [];
      let attempt = 1;
      let finalAttempt: AttemptResult;
      do {
        finalAttempt = await runOnce(t, a, fx.base, run, attempt, fx, path.join(OUT, 'agent-logs', name));
        attempts.push(finalAttempt);
        attempt++;
      } while (finalAttempt.status === 'connection_failure' && attempt <= 2);
      const usage = aggregateUsage(attempts.map((x) => ({ usage: x.usage, complete: x.usageComplete })));
      const nullableSum = (key: keyof StreamUsage): number | null => usage[key];
      const allTurnsKnown = attempts.every((x) => x.turns !== null);
      const r: RunResult = {
        task: t.id, approach: a, run, status: finalAttempt.status, finalScreenshotPath: finalAttempt.finalScreenshotPath,
        valid: finalAttempt.status !== 'connection_failure', ok: finalAttempt.status === 'success',
        error: finalAttempt.error, answer: finalAttempt.answer,
        turns: allTurnsKnown ? attempts.reduce((s, x) => s + (x.turns ?? 0), 0) : null,
        toolCalls: attempts.reduce((s, x) => s + x.toolCalls, 0),
        toolErrors: attempts.reduce((s, x) => s + x.toolErrors, 0),
        observationChars: attempts.reduce((s, x) => s + x.observationChars, 0),
        observationImages: attempts.reduce((s, x) => s + x.observationImages, 0),
        inputTokens: nullableSum('inputTokens'), cacheWriteTokens: nullableSum('cacheWriteTokens'), cacheReadTokens: nullableSum('cacheReadTokens'),
        totalInputTokens: attempts.some((x) => !x.usageComplete || x.totalInputTokens === null)
          ? null : attempts.reduce((sum, x) => sum + (x.totalInputTokens ?? 0), 0),
        outputTokens: nullableSum('outputTokens'), costUsd: nullableSum('costUsd'),
        timings: {
          mcpStartupMs: attempts.reduce((s, x) => s + x.timings.mcpStartupMs, 0),
          cliStartupMs: attempts.every((x) => x.timings.cliStartupMs !== null) ? attempts.reduce((s, x) => s + (x.timings.cliStartupMs ?? 0), 0) : null,
          cliExecutionMs: attempts.every((x) => x.timings.cliExecutionMs !== null) ? attempts.reduce((s, x) => s + (x.timings.cliExecutionMs ?? 0), 0) : null,
          cliWallMs: attempts.every((x) => x.timings.cliWallMs !== null) ? attempts.reduce((s, x) => s + (x.timings.cliWallMs ?? 0), 0) : null,
          verificationMs: attempts.reduce((s, x) => s + x.timings.verificationMs, 0),
          cleanupMs: attempts.reduce((s, x) => s + x.timings.cleanupMs, 0),
        }, attempts,
        resolvedModels: [...new Set(attempts.flatMap((x) => x.resolvedModels))],
      };
      results.push(r);
      save();
      console.log(`[agent] (${results.length}/${jobs.length}) ${t.id} / ${a} / run ${run} ... ${r.status} · ${r.toolCalls} tool calls · ${fmtMaybe(r.totalInputTokens)} input · ${r.timings.cliWallMs === null ? 'CLI time unknown' : `${(r.timings.cliWallMs / 1000).toFixed(1)}s`}${r.error ? ` · ${r.error}` : ''}`);
    }
  };
  console.log(`[agent] ${todo.length} runs to do (${done.size} kept), ${Math.min(CONCURRENCY, todo.length)} at a time, provider ${PROVIDER}, model ${MODEL}, CLI ${cliVersion ?? 'unknown'}`);
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
} finally {
  await fx.close();
}
save();
console.log(`[agent] wrote bench/results/${name}.{json,md}`);
