/**
 * Real-agent eval: Claude (headless `claude -p`) does each task with one browser approach at a time
 * and we record whether it got the answer right, turns, tokens, cost and time. Unlike bench/run.ts
 * this has an LLM in the loop, so results vary run to run; repeat runs to see the spread.
 *
 *   npx tsx bench/agent/run.ts                          # pilot: 2 tasks x 3 approaches x 1 run
 *   AGENT_TASKS=all AGENT_RUNS=3 npx tsx bench/agent/run.ts
 *   AGENT_TASKS=cat:forms AGENT_APPROACHES=mantis,tree npx tsx bench/agent/run.ts
 *   AGENT_RESUME=1 ...                                   (continue a stopped run)
 *   AGENT_MODEL=sonnet AGENT_CONCURRENCY=3 ...   (defaults)
 *
 * Needs a logged-in Claude Code CLI (`claude auth login`). Uses your plan's usage.
 */
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromiumForMcp } from '../adapters.js';
import { startFixtures } from '../fixtures.js';
import { PILOT, TASKS } from './tasks.js';
import type { AgentTask } from './tasks.js';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(REPO, 'bench', 'results');
const MODEL = process.env.AGENT_MODEL ?? 'sonnet';
const RUNS = Number(process.env.AGENT_RUNS ?? 1);
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_S ?? 600) * 1000;
/** Runs in flight at once. Each run is its own claude process, MCP server and browser. */
const CONCURRENCY = Math.max(1, Number(process.env.AGENT_CONCURRENCY ?? 3));


type Approach = 'mantis' | 'tree' | 'devtools' | 'browseruse' | 'screenshot';
const node = process.execPath;
const MCP_CHROMIUM = chromiumForMcp();
const VENV_PY = path.join(REPO, 'bench', 'agent', '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const TSX = import.meta.resolve('tsx');
interface ServerSpec { command: string; args: string[]; env?: Record<string, string> }

/**
 * Start the approach's MCP server ourselves, let it warm up, and expose it on a local port. Claude
 * Code then launches bench/agent/bridge.mjs, which connects instantly. Without this, a slow-starting
 * server (browser-use: ~6 s of Python imports) is still "pending" when Claude starts, the model gets
 * no tools and imitates tool calls as text. Startup time stays out of every approach's measured time.
 */
async function startServer(spec: ServerSpec, warmMs: number, log: string): Promise<{ port: number; stop: () => void }> {
  const child: ChildProcess = spawn(spec.command, spec.args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...(spec.env ?? {}) } });
  let stderr = '';
  child.stderr?.on('data', (d) => { stderr += d; });
  const srv = net.createServer((sock) => {
    sock.pipe(child.stdin!);
    child.stdout!.pipe(sock);
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', ok));
  await new Promise((ok) => setTimeout(ok, warmMs));
  const port = (srv.address() as net.AddressInfo).port;
  return {
    port,
    stop: () => {
      srv.close();
      writeFileSync(log, stderr);
      // The server may have started a browser: end the whole process tree.
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    },
  };
}

const APPROACHES: Record<Approach, { label: string; server: (dir: string) => Record<string, ServerSpec>; warmMs?: number; allow: string[]; deny?: string[] }> = {
  mantis: {
    label: 'Mantis',
    server: (dir) => ({ mantis: { command: node, args: [path.join(REPO, 'dist', 'server.js')], env: { MANTIS_MEMORY_DIR: path.join(dir, 'mem') } } }),
    allow: ['mcp__mantis'],
  },
  tree: {
    label: 'Accessibility tree (Playwright MCP)',
    server: () => ({
      playwright: {
        command: node,
        // Same browser binary as the token benchmark (Playwright MCP otherwise looks for an installed Chrome).
        args: [
          path.join(REPO, 'node_modules', '@playwright', 'mcp', 'cli.js'), '--headless', '--isolated', '--viewport-size', '1280x800',
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
  },
};

function claudeBin(): string {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  const win = path.join(process.env.APPDATA ?? '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
  return process.platform === 'win32' && existsSync(win) ? win : 'claude';
}

interface ResultEvent {
  is_error: boolean; result: string; num_turns: number; total_cost_usd: number;
  usage: { input_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number; output_tokens: number };
}

interface RunResult {
  task: string; approach: Approach; run: number; ok: boolean; error: string; answer: string;
  /** False if the browser tool never connected: the run says nothing about the approach. */
  valid: boolean;
  turns: number; toolCalls: number; inputTokens: number; outputTokens: number; costUsd: number; ms: number;
}

async function runOnce(task: AgentTask, approach: Approach, base: string, run: number): Promise<RunResult> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mantis-agent-'));
  const cfg = path.join(dir, 'mcp.json');
  const [name, spec] = Object.entries(APPROACHES[approach].server(dir))[0]!;
  const logDir = path.join(OUT, 'agent-logs', process.env.AGENT_OUT ?? 'latest');
  mkdirSync(logDir, { recursive: true });
  const server = await startServer(spec, APPROACHES[approach].warmMs ?? 2_000, path.join(logDir, `${task.id}--${approach}--${run}.server.log`));
  const bridge = { command: node, args: [path.join(REPO, 'bench', 'agent', 'bridge.mjs'), String(server.port)] };
  writeFileSync(cfg, JSON.stringify({ mcpServers: { [name]: bridge } }));
  const prompt = `${task.prompt(base)}\n\nUse only the browser tools you have. When you are done, end your reply with one line: ANSWER: <answer>`;
  const a = APPROACHES[approach];
  const args = [
    '-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--mcp-config', cfg,
    '--setting-sources', '', '--allowedTools', ...a.allow, ...(a.deny ? ['--disallowedTools', ...a.deny] : []),
  ];
  const t0 = Date.now();
  const out = await new Promise<string>((done) => {
    // Wait for MCP servers to connect before the first turn (otherwise the model may start with no tools).
    // Longer connect timeout: several servers starting at once can be slow under parallel load.
    const env = { ...process.env, MCP_CONNECTION_NONBLOCKING: 'false', MCP_TIMEOUT: '60000' };
    const p = spawn(claudeBin(), args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env });
    let s = '';
    p.stdout.on('data', (d) => (s += d));
    const timer = setTimeout(() => p.kill(), TIMEOUT_MS);
    p.on('close', () => { clearTimeout(timer); done(s); });
  });
  server.stop();
  // The run's temp folder holds browser profiles; logs are already copied to agent-logs.
  setTimeout(() => rmSync(dir, { recursive: true, force: true }), 2000);
  const ms = Date.now() - t0;
  // Raw event stream per run, for debugging a failed or odd run (git-ignored).
  writeFileSync(path.join(logDir, `${task.id}--${approach}--${run}.jsonl`), out);
  const base0 = { task: task.id, approach, run, ms };
  let connected = false;
  let toolCalls = 0;
  let final = null as ResultEvent | null;
  for (const line of out.split('\n')) {
    let j: { type?: string; subtype?: string; mcp_servers?: { status: string }[]; message?: { content?: { type: string }[] } } & Record<string, unknown>;
    try { j = JSON.parse(line); } catch { continue; }
    if (j.type === 'system' && j.subtype === 'init') connected = (j.mcp_servers ?? []).length > 0 && (j.mcp_servers ?? []).every((m) => m.status === 'connected');
    else if (j.type === 'assistant') toolCalls += (j.message?.content ?? []).filter((c) => c.type === 'tool_use').length;
    else if (j.type === 'result') final = j as unknown as ResultEvent;
  }
  if (!final) {
    return { ...base0, ok: false, valid: false, error: out ? `no result: ${out.slice(-160)}` : 'no output (timeout or crash)', answer: '', turns: 0, toolCalls, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
  const answer = (/ANSWER:\s*(.+)/i.exec(final.result ?? '')?.[1] ?? (final.result ?? '').slice(-200)).trim();
  const u = final.usage;
  return {
    ...base0, valid: connected, ok: connected && !final.is_error && task.expect.test(final.result ?? ''),
    error: !connected ? 'browser tool did not connect (run invalid)' : final.is_error ? (final.result ?? '').slice(0, 160) : '',
    answer: answer.slice(0, 160), turns: final.num_turns, toolCalls,
    inputTokens: u.input_tokens + u.cache_creation_input_tokens + u.cache_read_input_tokens, outputTokens: u.output_tokens,
    costUsd: final.total_cost_usd,
  };
}

const fmt = (n: number): string => n.toLocaleString('en-US');

function report(results: RunResult[], approaches: Approach[], tasks: AgentTask[]): string {
  const L: string[] = [];
  L.push('# Real-agent eval');
  L.push('');
  L.push(`> Claude Code (\`claude -p\`, model \`${MODEL}\`) does each task with one browser approach at a time. ` +
    '"ok" = the final reply contains the expected answer. Tokens are everything the model read (input incl. cached) and wrote, ' +
    'as reported by Claude Code; cost is its API-price estimate. An LLM is in the loop, so numbers vary run to run.');
  L.push('');
  L.push(`- Date: ${new Date().toISOString().slice(0, 10)}; runs per task and approach: ${RUNS}; ${CONCURRENCY} runs in parallel ` +
    '(times are wall-clock per run and include contention between parallel runs)');
  L.push('- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. ' +
    'Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.');
  L.push('- No skill, no system prompt beyond the task; built-in tools off.');
  L.push('');
  L.push('## Summary');
  L.push('');
  L.push(`| | ${approaches.map((a) => APPROACHES[a].label).join(' | ')} |`);
  L.push(`|---|${approaches.map(() => '---:').join('|')}|`);
  const by = (a: Approach): RunResult[] => results.filter((r) => r.approach === a);
  const sum = (rs: RunResult[], k: 'inputTokens' | 'outputTokens' | 'turns' | 'toolCalls' | 'ms' | 'costUsd'): number => rs.reduce((s, r) => s + r[k], 0);
  L.push(`| Correct | ${approaches.map((a) => `${by(a).filter((r) => r.ok).length} / ${by(a).filter((r) => r.valid).length}`).join(' | ')} |`);
  L.push(`| Invalid runs (tool did not connect) | ${approaches.map((a) => by(a).filter((r) => !r.valid).length).join(' | ')} |`);
  L.push(`| Tool calls (total) | ${approaches.map((a) => fmt(sum(by(a), 'toolCalls'))).join(' | ')} |`);
  L.push(`| Turns (total) | ${approaches.map((a) => fmt(sum(by(a), 'turns'))).join(' | ')} |`);
  L.push(`| Input tokens (total) | ${approaches.map((a) => fmt(sum(by(a), 'inputTokens'))).join(' | ')} |`);
  L.push(`| Output tokens (total) | ${approaches.map((a) => fmt(sum(by(a), 'outputTokens'))).join(' | ')} |`);
  L.push(`| Time (total, s) | ${approaches.map((a) => (sum(by(a), 'ms') / 1000).toFixed(0)).join(' | ')} |`);
  L.push(`| Cost estimate (USD) | ${approaches.map((a) => sum(by(a), 'costUsd').toFixed(2)).join(' | ')} |`);
  L.push('');
  L.push('## Per run');
  L.push('');
  L.push('| Task | Approach | Run | OK | Tool calls | Input tok | Output tok | Time (s) | Answer / error |');
  L.push('|---|---|---:|:-:|---:|---:|---:|---:|---|');
  for (const t of tasks) {
    for (const r of results.filter((x) => x.task === t.id)) {
      const note = (r.error || r.answer).replace(/\|/g, '\\|').replace(/\s+/g, ' ');
      L.push(`| \`${r.task}\` | ${APPROACHES[r.approach].label} | ${r.run} | ${!r.valid ? '⚠' : r.ok ? '✅' : '❌'} | ${r.toolCalls} | ${fmt(r.inputTokens)} | ${fmt(r.outputTokens)} | ${(r.ms / 1000).toFixed(0)} | ${note} |`);
    }
  }
  return L.join('\n') + '\n';
}

const want = process.env.AGENT_TASKS ?? PILOT.join(',');
// "all", task ids, or categories ("cat:forms"), comma-separated.
const picks = want.split(',');
const tasks = want === 'all' ? TASKS : TASKS.filter((t) => picks.includes(t.id) || picks.includes(`cat:${t.category}`));
if (!tasks.length) throw new Error(`no tasks match AGENT_TASKS=${want}; ids: ${TASKS.map((t) => t.id).join(', ')}`);
const approaches = (process.env.AGENT_APPROACHES ?? 'mantis,tree,devtools,browseruse,screenshot').split(',') as Approach[];
const name = process.env.AGENT_OUT ?? (want === PILOT.join(',') ? 'agent-pilot' : 'agent');
const jobs: { t: AgentTask; a: Approach; run: number }[] = [];
for (const t of tasks) for (let run = 1; run <= RUNS; run++) for (const a of approaches) jobs.push({ t, a, run });
const key = (task: string, a: string, run: number): string => `${task}|${a}|${run}`;
const order = (r: RunResult): number => jobs.findIndex((j) => j.t.id === r.task && j.a === r.approach && j.run === r.run);

// AGENT_RESUME=1 keeps the valid runs already in the results file and only does the rest.
mkdirSync(OUT, { recursive: true });
const jsonPath = path.join(OUT, `${name}.json`);
const results: RunResult[] = [];
if (process.env.AGENT_RESUME === '1' && existsSync(jsonPath)) {
  const prev = (JSON.parse(readFileSync(jsonPath, 'utf8')) as { results: RunResult[] }).results;
  results.push(...prev.filter((r) => r.valid && jobs.some((j) => key(j.t.id, j.a, j.run) === key(r.task, r.approach, r.run))));
}
const done = new Set(results.map((r) => key(r.task, r.approach, r.run)));
const todo = jobs.filter((j) => !done.has(key(j.t.id, j.a, j.run)));

/** Results are written after every run, so a stopped eval loses nothing and can resume. */
function save(): void {
  results.sort((x, y) => order(x) - order(y));
  writeFileSync(jsonPath, JSON.stringify({ model: MODEL, runs: RUNS, results }, null, 2));
  writeFileSync(path.join(OUT, `${name}.md`), report(results, approaches, tasks));
}

const fx = await startFixtures();
try {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < todo.length) {
      const { t, a, run } = todo[next++]!;
      let r = await runOnce(t, a, fx.base, run);
      // A tool that never connected says nothing about the approach: try that run once more.
      if (!r.valid) r = await runOnce(t, a, fx.base, run);
      results.push(r);
      save();
      console.log(`[agent] (${results.length}/${jobs.length}) ${t.id} / ${a} / run ${run} ... ${!r.valid ? 'INVALID' : r.ok ? 'ok' : 'FAIL'} · ${r.toolCalls} tool calls · ${fmt(r.inputTokens)} in · ${(r.ms / 1000).toFixed(0)}s${r.error ? ` · ${r.error}` : ''}`);
    }
  };
  console.log(`[agent] ${todo.length} runs to do (${done.size} kept), ${Math.min(CONCURRENCY, todo.length)} at a time, model ${MODEL}`);
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
} finally {
  await fx.close();
}
save();
console.log(`[agent] wrote bench/results/${name}.{json,md}`);
