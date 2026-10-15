/**
 * Real-agent eval: Claude (headless `claude -p`) does each task with one browser approach at a time
 * and we record whether it got the answer right, turns, tokens, cost and time. Unlike bench/run.ts
 * this has an LLM in the loop, so results vary run to run; repeat runs to see the spread.
 *
 *   npx tsx bench/agent/run.ts                          # pilot: 2 tasks x 3 approaches x 1 run
 *   AGENT_TASKS=all AGENT_RUNS=3 npx tsx bench/agent/run.ts
 *   AGENT_MODEL=sonnet AGENT_APPROACHES=mantis,tree npx tsx bench/agent/run.ts
 *
 * Needs a logged-in Claude Code CLI (`claude auth login`). Uses your plan's usage.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromiumForMcp } from '../adapters.js';
import { startFixtures } from '../fixtures.js';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const OUT = path.join(REPO, 'bench', 'results');
const MODEL = process.env.AGENT_MODEL ?? 'sonnet';
const RUNS = Number(process.env.AGENT_RUNS ?? 1);
const TIMEOUT_MS = Number(process.env.AGENT_TIMEOUT_S ?? 600) * 1000;
/** Runs in flight at once. Each run is its own claude process, MCP server and browser. */
const CONCURRENCY = Math.max(1, Number(process.env.AGENT_CONCURRENCY ?? 3));

interface AgentTask { id: string; prompt: (base: string) => string; expect: RegExp }

const TASKS: AgentTask[] = [
  {
    id: 'form-subscribe',
    prompt: (b) => `Open ${b}/form. Subscribe from Canada and opt in to the weekly newsletter. What confirmation message does the page show?`,
    expect: /Subscribed from Canada \(weekly: yes\)/i,
  },
  {
    id: 'wikipedia-birthdate',
    prompt: () => 'Open https://en.wikipedia.org/wiki/Alan_Turing. On what date was Alan Turing born?',
    expect: /23 June,? 1912|June 23,? 1912/i,
  },
  {
    id: 'login',
    prompt: (b) => `Open ${b}/login and sign in with email agent@example.com and password correct-horse-battery. What is the page heading after signing in?`,
    expect: /Signed in/i,
  },
  {
    id: 'cookie-cart',
    prompt: (b) => `Open ${b}/cookie and add the product to the cart. What message confirms it?`,
    expect: /Added to cart/i,
  },
  {
    id: 'longlist-item',
    prompt: (b) => `Open ${b}/longlist and open "Item 150". What is the heading of the page it leads to?`,
    expect: /Detail for item 150/i,
  },
  {
    id: 'pricing-team',
    prompt: (b) => `Open ${b}/site/home, go to the pricing page and find the price of the Team plan.`,
    expect: /\$29/,
  },
  {
    id: 'dashboard-refresh',
    prompt: (b) => `Open ${b}/dashboard, refresh the data, and tell me what the "Last updated" line says now. Also: what is the amount for Initech 3?`,
    expect: /just now[\s\S]*\$4,218|\$4,218[\s\S]*just now/i,
  },
];
const PILOT = ['form-subscribe', 'wikipedia-birthdate'];

type Approach = 'mantis' | 'tree' | 'screenshot';
const node = process.execPath;
const MCP_CHROMIUM = chromiumForMcp();
const TSX = import.meta.resolve('tsx');
const APPROACHES: Record<Approach, { label: string; server: (mem: string) => object; allow: string[]; deny?: string[] }> = {
  mantis: {
    label: 'Mantis',
    server: (mem) => ({ mantis: { command: node, args: [path.join(REPO, 'dist', 'server.js')], env: { MANTIS_MEMORY_DIR: mem } } }),
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
  writeFileSync(cfg, JSON.stringify({ mcpServers: APPROACHES[approach].server(path.join(dir, 'mem')) }));
  const prompt = `${task.prompt(base)}\n\nUse only the browser tools you have. When you are done, end your reply with one line: ANSWER: <answer>`;
  const a = APPROACHES[approach];
  const args = [
    '-p', prompt, '--output-format', 'stream-json', '--verbose', '--model', MODEL, '--tools', '', '--strict-mcp-config', '--mcp-config', cfg,
    '--setting-sources', '', '--allowedTools', ...a.allow, ...(a.deny ? ['--disallowedTools', ...a.deny] : []),
  ];
  const t0 = Date.now();
  const out = await new Promise<string>((done) => {
    // Wait for MCP servers to connect before the first turn (otherwise the model may start with no tools).
    const env = { ...process.env, MCP_CONNECTION_NONBLOCKING: 'false' };
    const p = spawn(claudeBin(), args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env });
    let s = '';
    p.stdout.on('data', (d) => (s += d));
    const timer = setTimeout(() => p.kill(), TIMEOUT_MS);
    p.on('close', () => { clearTimeout(timer); done(s); });
  });
  const ms = Date.now() - t0;
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
const tasks = want === 'all' ? TASKS : TASKS.filter((t) => want.split(',').includes(t.id));
const approaches = (process.env.AGENT_APPROACHES ?? 'mantis,tree,screenshot').split(',') as Approach[];
const fx = await startFixtures();
const jobs: { t: AgentTask; a: Approach; run: number }[] = [];
for (const t of tasks) for (let run = 1; run <= RUNS; run++) for (const a of approaches) jobs.push({ t, a, run });
const results: RunResult[] = [];
try {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const { t, a, run } = jobs[next++]!;
      const r = await runOnce(t, a, fx.base, run);
      results.push(r);
      console.log(`[agent] ${t.id} / ${a} / run ${run} ... ${!r.valid ? 'INVALID' : r.ok ? 'ok' : 'FAIL'} · ${r.toolCalls} tool calls · ${fmt(r.inputTokens)} in · ${(r.ms / 1000).toFixed(0)}s${r.error ? ` · ${r.error}` : ''}`);
    }
  };
  console.log(`[agent] ${jobs.length} runs, ${Math.min(CONCURRENCY, jobs.length)} at a time, model ${MODEL}`);
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));
} finally {
  await fx.close();
}
// Report in a stable order regardless of which run finished first.
const order = (r: RunResult): number => jobs.findIndex((j) => j.t.id === r.task && j.a === r.approach && j.run === r.run);
results.sort((x, y) => order(x) - order(y));
mkdirSync(OUT, { recursive: true });
const name = process.env.AGENT_OUT ?? (want === PILOT.join(',') ? 'agent-pilot' : 'agent');
writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify({ model: MODEL, runs: RUNS, results }, null, 2));
writeFileSync(path.join(OUT, `${name}.md`), report(results, approaches, tasks));
console.log(`[agent] wrote bench/results/${name}.{json,md}`);
