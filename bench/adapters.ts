import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { chromium } from 'playwright';
import type { Elem, Reply } from './types.js';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** A text-returning browser tool, driven over MCP exactly as an agent would. */
export interface TextAdapter {
  tool: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** The tool list an agent has to carry in its context (JSON text). */
  toolDefinitions(): Promise<string>;
  open(url: string): Promise<Reply>;
  /** Fetch the full current page view (Mantis read / Playwright MCP browser_snapshot). */
  observe(): Promise<Reply>;
  click(e: Elem, label: string): Promise<Reply>;
  type(e: Elem, label: string, text: string, submit: boolean): Promise<Reply>;
  select(e: Elem, label: string, option: string): Promise<Reply>;
  press(key: string): Promise<Reply>;
  back(): Promise<Reply>;
  /**
   * True if action replies describe what changed on the page (Mantis diffs), so ids and
   * text from the previous view stay usable. False if replies carry no page content.
   */
  deltaReplies: boolean;
  /** Does this reply contain the whole page view (so no extra observe call is needed)? */
  isFullView(r: Reply, via: 'open' | 'observe' | 'action'): boolean;
  /** Elements an agent could act on, as listed in a view. */
  parse(view: string): Elem[];
}

class McpTool {
  private client: Client | null = null;
  constructor(
    private readonly args: string[],
    private readonly cwd?: string,
  ) {}

  async start(): Promise<void> {
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(process.env)) if (v !== undefined) env[k] = v;
    const transport = new StdioClientTransport({ command: process.execPath, args: this.args, env, stderr: 'ignore', ...(this.cwd ? { cwd: this.cwd } : {}) });
    this.client = new Client({ name: 'mantis-bench', version: '0.0.0' });
    await this.client.connect(transport);
  }

  async stop(): Promise<void> {
    await this.client?.close().catch(() => undefined);
    this.client = null;
  }

  async definitions(): Promise<string> {
    const { tools } = await this.client!.listTools();
    return JSON.stringify(tools);
  }

  async call(name: string, args: Record<string, unknown>): Promise<Reply> {
    try {
      const res = await this.client!.callTool({ name, arguments: args }, undefined, { timeout: 120_000 });
      const parts = (res.content as Array<{ type: string; text?: string }>) ?? [];
      const text = parts.filter((p) => p.type === 'text').map((p) => p.text ?? '').join('\n');
      return { text, isError: res.isError === true };
    } catch (e) {
      return { text: `error: ${String(e instanceof Error ? e.message : e).split('\n')[0]}`, isError: true };
    }
  }
}

/** Mantis, via its real MCP server (built output in dist/). */
export function mantisAdapter(): TextAdapter {
  const server = path.join(REPO, 'dist', 'server.js');
  const mcp = new McpTool([server]);
  // `#N role "name"`, or just `#N "name"` inside compacted rows (role omitted).
  const line = /#(\d+)(?: (?!~?")(\w+))?(?: ~?"([^"]*)")?/g;
  return {
    tool: 'mantis',
    start: () => mcp.start(),
    stop: () => mcp.stop(),
    toolDefinitions: () => mcp.definitions(),
    open: (url) => mcp.call('open', { url }),
    observe: () => mcp.call('read', {}),
    click: (e) => mcp.call('click', { id: Number(e.handle) }),
    type: (e, _l, text, submit) => mcp.call('type', { id: Number(e.handle), text, submit }),
    select: (e, _l, option) => mcp.call('select', { id: Number(e.handle), option }),
    press: (key) => mcp.call('press', { key }),
    back: () => mcp.call('back', {}),
    deltaReplies: true,
    // Mantis views start with a "Page:" header (also returned after an action that
    // lands on a new page); change summaries do not.
    isFullView: (r) => !r.isError && /^Page: /m.test(r.text),
    parse(view) {
      const out: Elem[] = [];
      for (const l of view.split('\n')) {
        for (const m of l.matchAll(line)) {
          if (m[2] === undefined && m[3] === undefined) continue;
          out.push({ handle: m[1]!, role: (m[2] ?? '').toLowerCase(), name: m[3] ?? '' });
        }
      }
      return out;
    },
  };
}

/**
 * Resolve a Chromium for Playwright MCP. It pins its own browser revision, which may
 * not be the one installed here, so point it at the same binary Mantis uses.
 */
export function chromiumForMcp(): string | undefined {
  if (process.env.BENCH_CHROMIUM) return process.env.BENCH_CHROMIUM;
  const full = chromium.executablePath();
  const root = path.dirname(path.dirname(full));
  const cache = path.dirname(root);
  const shellDir = path.basename(root).replace(/^chromium-/, 'chromium_headless_shell-');
  const exe = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
  const platformDir = path.basename(path.dirname(full)).replace(/^chrome-/, 'chrome-headless-shell-');
  const shell = path.join(cache, shellDir, platformDir, exe);
  if (existsSync(shell)) return shell;
  return existsSync(full) ? full : undefined;
}

/** @playwright/mcp (default configuration, headless, isolated profile, 1280x800). */
export function playwrightMcpAdapter(): TextAdapter {
  const cli = path.join(REPO, 'node_modules', '@playwright', 'mcp', 'cli.js');
  const work = mkdtempSync(path.join(tmpdir(), 'mantis-bench-pwmcp-'));
  const args = [cli, '--headless', '--isolated', '--viewport-size', '1280x800', '--output-dir', work];
  const exe = chromiumForMcp();
  if (exe) args.push('--executable-path', exe);
  const mcp = new McpTool(args, work);
  const row = /^\s*-\s+(\w+)(?:\s+"((?:[^"\\]|\\.)*)")?[^\n]*?\[ref=([A-Za-z0-9]+)\]/;
  const isErr = (r: Reply): Reply => (r.text.startsWith('### Error') ? { ...r, isError: true } : r);
  const call = async (name: string, a: Record<string, unknown>): Promise<Reply> => isErr(await mcp.call(name, a));
  return {
    tool: 'playwright-mcp',
    start: () => mcp.start(),
    stop: () => mcp.stop(),
    toolDefinitions: () => mcp.definitions(),
    open: (url) => call('browser_navigate', { url }),
    observe: () => call('browser_snapshot', {}),
    click: (e, label) => call('browser_click', { element: label, target: e.handle }),
    type: (e, label, text, submit) => call('browser_type', { element: label, target: e.handle, text, submit }),
    select: (e, label, option) => call('browser_select_option', { element: label, target: e.handle, values: [option] }),
    press: (key) => call('browser_press_key', { key }),
    back: () => call('browser_navigate_back', {}),
    deltaReplies: false,
    // In this version's default mode action replies only link to a snapshot file; the
    // inline view comes from browser_snapshot.
    isFullView: (r, via) => !r.isError && via === 'observe',
    parse(view) {
      const out: Elem[] = [];
      for (const l of view.split('\n')) {
        const m = row.exec(l);
        if (m) out.push({ role: m[1]!.toLowerCase(), name: (m[2] ?? '').replace(/\\(.)/g, '$1'), handle: m[3]! });
      }
      return out;
    },
  };
}
