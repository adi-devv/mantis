import { afterEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyRunStatus, buildJudgePrompt, parseJudgeOutput, renderJudgedMarkdown, selectJudgeScreenshot, shouldJudgeNonSuccess, universallyBlockedTasks } from '../bench/agent/judge.js';
import type { JudgedRun } from '../bench/agent/judge.js';
import { chromiumForMcp } from '../bench/adapters.js';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const dir = (): string => { const value = mkdtempSync(path.join(os.tmpdir(), 'judge-final-')); dirs.push(value); return value; };
const run = (task: string, approach: string, verdict: JudgedRun['verdict'], n = 1): JudgedRun => ({
  task, approach, run: n, verdict, reason: '', finalUrl: null, toolCalls: 1, totalInputTokens: 10, wallS: 1,
});

describe('final-page screenshot evidence', () => {
  it('prefers the saved live capture and keeps the identifying filename out of the judge prompt', async () => {
    const folder = dir();
    const saved = path.join(folder, 'task--mantis--1.final.png');
    const blind = path.join(folder, 'final.png');
    writeFileSync(saved, Buffer.from('live-png'));
    let freshCalls = 0;
    const source = await selectJudgeScreenshot(saved, blind, 'https://example.com', async () => { freshCalls++; return true; });
    expect(source).toBe('live');
    expect(freshCalls).toBe(0);
    expect(readFileSync(blind, 'utf8')).toBe('live-png');
    const prompt = buildJudgePrompt({ task: 'find item', website: 'https://example.com', finalUrl: null, answer: '', screenshotPath: blind, screenshotSource: source });
    expect(prompt).toContain("agent's own final live page");
    expect(prompt).not.toContain('fresh load');
    expect(prompt).not.toContain('task--mantis');
  });

  it('uses the legacy fresh URL load if no live capture exists', async () => {
    const folder = dir();
    const blind = path.join(folder, 'final.png');
    const source = await selectJudgeScreenshot(path.join(folder, 'missing.png'), blind, 'https://example.com', async (url, file) => {
      expect(url).toBe('https://example.com');
      writeFileSync(file, 'fresh-png');
      return true;
    });
    expect(source).toBe('fresh');
    expect(readFileSync(blind, 'utf8')).toBe('fresh-png');
    const prompt = buildJudgePrompt({ task: 'find item', website: 'https://example.com', finalUrl: 'https://example.com', answer: '', screenshotPath: blind, screenshotSource: source });
    expect(prompt).toContain('freshly loaded in a new browser');
    expect(prompt).toContain('do not penalise that alone');
  });

  it('rejects a stored path outside the run log folder and falls back', async () => {
    const folder = dir();
    const logs = path.join(folder, 'logs');
    const outside = path.join(folder, 'task--mantis--1.final.png');
    writeFileSync(outside, 'wrong-image');
    const destination = path.join(folder, 'final.png');
    const source = await selectJudgeScreenshot(outside, destination, 'https://example.com', async (_url, file) => {
      writeFileSync(file, 'fresh-image');
      return true;
    }, logs);
    expect(source).toBe('fresh');
    expect(readFileSync(destination, 'utf8')).toBe('fresh-image');
  });

  it.skipIf(process.env.BENCH_CAPTURE_INTEGRATION !== '1')('reinitializes and captures each approach’s live 1280x800 page', async () => {
    const repo = path.resolve(import.meta.dirname, '..');
    const web = createServer((_req, response) => { response.writeHead(200, { 'Content-Type': 'text/html' }); response.end('<title>Capture test</title><h1>Final live page</h1>'); });
    await new Promise<void>((resolve) => web.listen(0, '127.0.0.1', resolve));
    const address = web.address();
    if (!address || typeof address === 'string') throw new Error('missing HTTP port');
    const url = `http://127.0.0.1:${address.port}/`;
    const chromium = chromiumForMcp();
    const approaches = [
      { name: 'mantis', args: [path.join(repo, 'bench/agent/bridge.mjs'), '--mantis-server'], navigate: 'open', capture: 'bench_capture' },
      { name: 'tree', args: [path.join(repo, 'node_modules/@playwright/mcp/cli.js'), '--headless', '--isolated', '--no-sandbox', '--viewport-size', '1280x800', '--output-dir', dir(), ...(chromium ? ['--executable-path', chromium] : [])], navigate: 'browser_navigate', capture: 'browser_take_screenshot' },
      { name: 'screenshot', args: ['--import', pathToFileURL(path.join(repo, 'node_modules/tsx/dist/loader.mjs')).href, path.join(repo, 'bench/agent/screenshot-mcp.ts')], navigate: 'navigate', capture: 'bench_capture' },
    ];
    try {
      for (const approach of approaches) {
        const child = spawn(process.execPath, approach.args, { stdio: ['pipe', 'pipe', 'pipe'], cwd: repo,
          env: approach.name === 'tree' ? { ...process.env, LOCALAPPDATA: dir() } : process.env });
        let buffer = '';
        let stderr = '';
        child.stderr.setEncoding('utf8');
        child.stderr.on('data', (chunk: string) => { stderr += chunk; });
        child.on('exit', (code) => { for (const request of pending.values()) request.reject(new Error(`${approach.name} server exited ${code}; stderr: ${stderr.slice(-1000)}`)); pending.clear(); });
        let next = 0;
        const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          buffer += chunk;
          for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
            const line = buffer.slice(0, end).trim();
            buffer = buffer.slice(end + 1);
            if (!line) continue;
            const message = JSON.parse(line);
            const request = pending.get(message.id);
            if (!request) continue;
            pending.delete(message.id);
            if (message.error) request.reject(new Error(message.error.message));
            else request.resolve(message.result);
          }
        });
        const call = (method: string, params: object): Promise<any> => new Promise((resolve, reject) => {
          const id = ++next;
          const timeout = setTimeout(() => { pending.delete(id); reject(new Error(`${approach.name} ${method} timed out; stderr: ${stderr.slice(-1000)}`)); }, 30_000);
          pending.set(id, { resolve: (value) => { clearTimeout(timeout); resolve(value); }, reject: (error) => { clearTimeout(timeout); reject(error); } });
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
        });
        const initialize = async (): Promise<void> => {
          await call('initialize', { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'capture-test', version: '1' } });
          child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
        };
        try {
          await Promise.race([initialize(), new Promise((_, reject) => setTimeout(() => reject(new Error(`${approach.name} startup timed out`)), 30_000))]);
          const navigation = await call('tools/call', { name: approach.navigate, arguments: { url } });
          expect(navigation.isError, `${approach.name} navigation: ${JSON.stringify(navigation.content).slice(0, 500)}; stderr: ${stderr.slice(-1000)}`).not.toBe(true);
          await initialize(); // the harness reconnects after the agent's bridge exits
          const shot = await call('tools/call', { name: approach.capture, arguments: approach.name === 'tree' ? { type: 'png', fullPage: false, scale: 'css' } : {} });
          expect(shot.isError, `${approach.name} capture`).not.toBe(true);
          const data = shot.content.find((item: { type: string; mimeType?: string }) => item.type === 'image' && item.mimeType === 'image/png')?.data;
          expect(typeof data, `${approach.name} PNG`).toBe('string');
          const png = Buffer.from(data, 'base64');
          expect([png.readUInt32BE(16), png.readUInt32BE(20)], `${approach.name} viewport`).toEqual([1280, 800]);
        } finally {
          child.stdin.end();
          if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
          else child.kill('SIGKILL');
        }
      }
    } finally { web.close(); }
  }, 120_000);
});

describe('blocked verdict and adjusted rate', () => {
  it('parses blocked and excludes only tasks blocked across every approach and run', () => {
    expect(parseJudgeOutput('{"verdict":"blocked","reason":"CAPTCHA"}')).toEqual({ verdict: 'blocked', reason: 'CAPTCHA' });
    const rows = [run('all-blocked', 'mantis', 'blocked'), run('all-blocked', 'tree', 'blocked'),
      run('mixed', 'mantis', 'blocked'), run('mixed', 'mantis', 'success', 2), run('mixed', 'tree', 'success')];
    expect([...universallyBlockedTasks(rows)]).toEqual(['all-blocked']);
    const report = renderJudgedMarkdown('x', rows, new Map(), 'judge');
    expect(report).toContain('| Blocked | Overall success rate | Success rate excluding universally blocked tasks |');
    expect(report).toContain('| mantis | 3 | 1 | 0 | 0 | 2 | 33.3% | 50.0% |');
  });

  it('keeps a task with missing approaches or a nonblocked run in the denominator', () => {
    const rows = [run('only-one', 'mantis', 'blocked'), run('mixed', 'mantis', 'blocked'),
      run('mixed', 'tree', 'failure'), run('complete', 'mantis', 'blocked'), run('complete', 'tree', 'blocked')];
    expect([...universallyBlockedTasks(rows)]).toEqual(['complete']);
    expect(parseJudgeOutput('{"verdict":"failure","reason":"wrong"}').verdict).toBe('failure');
    expect(applyRunStatus('wrong_answer', { verdict: 'blocked', reason: 'CAPTCHA' }).verdict).toBe('blocked');
    expect(applyRunStatus('wrong_answer', { verdict: 'success', reason: 'claim' }).verdict).toBe('failure');
    const prompt = buildJudgePrompt({ task: 'find item', website: 'https://example.com', finalUrl: null, answer: '', screenshotPath: null });
    expect(prompt).toContain('An ordinary 404, network error, or incomplete agent attempt is not blocked.');
  });

  it('preserves fixed failure for legacy stopped rows and checks new rows for site blocks', () => {
    const old = { task: 't', approach: 'mantis', run: 1, status: 'wrong_answer', toolCalls: 1, totalInputTokens: 10 };
    expect(shouldJudgeNonSuccess(old, 'Stopped at CAPTCHA')).toBe(false);
    expect(shouldJudgeNonSuccess({ ...old, finalScreenshotPath: null }, 'Stopped at CAPTCHA')).toBe(true);
    expect(shouldJudgeNonSuccess({ ...old, finalScreenshotPath: null }, '')).toBe(false);
  });
});
