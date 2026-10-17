import { afterEach, describe, expect, it } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { applyRunStatus, buildEvidencePacket, buildEvidencePrompt, buildJudgePrompt, isEvidenceRun, parseJudgeOutput, prepareFrameImage, renderJudgedMarkdown, selectJudgeScreenshot, shouldJudgeNonSuccess, universallyBlockedTasks } from '../bench/agent/judge.js';
import type { JudgedRun, PacketFrame } from '../bench/agent/judge.js';
import { decodePng, encodePng } from '../bench/agent/png.js';
import { PAGE_STATE_FUNCTION, parsePageState } from '../bench/agent/evidence.js';
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
    expect(prompt).toContain('If the reply says a required login, purchase, or personal-information prompt stopped it but no such prompt is visible on a live capture, mark "unsure" unless other evidence shows failure.');
    expect(prompt).toContain('If the task asks for a result the site computes and the agent gives its own estimate or calculation instead, mark "failure".');
    expect(prompt).not.toContain('relevant inputs to be visible');
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
    expect(prompt).toContain('do not penalise that alone when the reply is specific and consistent with the page');
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

  it.skipIf(process.env.BENCH_CAPTURE_INTEGRATION !== '1')('reinitializes and captures each approach’s live 1280x800 page and its page state', async () => {
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
          const shot = await call('tools/call', { name: approach.capture, arguments: approach.name === 'tree' ? { type: 'png', fullPage: false, scale: 'css' } : { evaluate: PAGE_STATE_FUNCTION } });
          expect(shot.isError, `${approach.name} capture`).not.toBe(true);
          const data = shot.content.find((item: { type: string; mimeType?: string }) => item.type === 'image' && item.mimeType === 'image/png')?.data;
          expect(typeof data, `${approach.name} PNG`).toBe('string');
          const png = Buffer.from(data, 'base64');
          expect([png.readUInt32BE(16), png.readUInt32BE(20)], `${approach.name} viewport`).toEqual([1280, 800]);
          // The page state (URL, text) comes with the capture: from bench_capture, or from browser_evaluate for the tree.
          const stateResult = approach.name === 'tree' ? await call('tools/call', { name: 'browser_evaluate', arguments: { function: PAGE_STATE_FUNCTION } }) : shot;
          const state = parsePageState(stateResult.content.find((item: { type: string }) => item.type === 'text')?.text ?? '');
          expect(state, `${approach.name} page state`).not.toBeNull();
          expect(state!.url).toBe(url);
          expect(state!.text).toContain('Final live page');
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
    expect(report).toContain('| Blocked | Site broken | Overall success rate | Success rate excluding universally blocked / site-broken tasks |');
    expect(report).toContain('| mantis | 3 | 1 | 0 | 0 | 2 | 0 | 33.3% | 50.0% |');
  });

  it('keeps a task with missing approaches or a nonblocked run in the denominator', () => {
    const rows = [run('only-one', 'mantis', 'blocked'), run('mixed', 'mantis', 'blocked'),
      run('mixed', 'tree', 'failure'), run('complete', 'mantis', 'blocked'), run('complete', 'tree', 'blocked')];
    expect([...universallyBlockedTasks(rows)]).toEqual(['complete']);
    expect(parseJudgeOutput('{"verdict":"failure","reason":"wrong"}').verdict).toBe('failure');
    expect(applyRunStatus('wrong_answer', { verdict: 'blocked', reason: 'CAPTCHA' }).verdict).toBe('blocked');
    expect(applyRunStatus('wrong_answer', { verdict: 'success', reason: 'claim' }).verdict).toBe('failure');
    const prompt = buildJudgePrompt({ task: 'find item', website: 'https://example.com', finalUrl: null, answer: '', screenshotPath: null });
    expect(prompt).toContain('An ordinary 404 is not blocked');
  });

  it('preserves fixed failure for legacy stopped rows and checks new rows for site blocks', () => {
    const old = { task: 't', approach: 'mantis', run: 1, status: 'wrong_answer', toolCalls: 1, totalInputTokens: 10 };
    expect(shouldJudgeNonSuccess(old, 'Stopped at CAPTCHA')).toBe(false);
    expect(shouldJudgeNonSuccess({ ...old, finalScreenshotPath: null }, 'Stopped at CAPTCHA')).toBe(true);
    expect(shouldJudgeNonSuccess({ ...old, finalScreenshotPath: null }, '')).toBe(false);
  });
});

const solid = (width: number, height: number, value = 200): Buffer => encodePng({ width, height, data: new Uint8Array(width * height * 4).fill(value) });
const TOOL_WORDS = /mcp|mantis|playwright|snapshot|accessibility|screenshot|browser_|tool call|coordinate|step \d|steps? (taken|completed)|action trace/i;
const frame = (n: number, over: Partial<PacketFrame> = {}): PacketFrame => ({ id: `F${n}`, url: `https://example.com/p${n}`, text: `Page ${n} text`, final: false, image: `f${n}.png`, ...over });
const packetInput = (frames: PacketFrame[], extra: Partial<Parameters<typeof buildEvidencePrompt>[0]> = {}): Parameters<typeof buildEvidencePrompt>[0] =>
  ({ task: 'find item', website: 'https://example.com', finalUrl: 'https://example.com/p3', answer: 'It costs $5.', frames, attached: true, ...extra });

describe('evidence packet prompt', () => {
  const frames = [frame(1, { text: `${'a'.repeat(1_200)}TAIL-OF-FIRST` }), frame(2), frame(3, { final: true, text: `${'b'.repeat(5_000)}END-OF-FINAL`, forms: [{ label: 'Quantity', value: '2' }, { label: 'Gift', value: 'unchecked' }] })];

  it('lists frames F1..Fn in order with URL, excerpts, the full final text and form values', () => {
    const prompt = buildEvidencePrompt(packetInput(frames));
    expect(prompt).toContain('Evidence: 3 frames captured by the evaluation harness (not by the agent) after the agent\'s browser actions, in chronological order.');
    expect(prompt).toContain('Earlier frames are downscaled to about 640x400; the final frame is full size (1280x800).');
    expect(prompt.indexOf('F1')).toBeLessThan(prompt.indexOf('F2'));
    expect(prompt.indexOf('F2')).toBeLessThan(prompt.lastIndexOf('F3'));
    expect(prompt).toContain('URL: https://example.com/p2');
    expect(prompt).toContain('F3 (final, captured after the agent finished)');
    expect(prompt).toContain('Image: f1.png (attached)');
    expect(prompt).toContain('END-OF-FINAL'); // final text in full
    expect(prompt).not.toContain('TAIL-OF-FIRST'); // earlier frames only get the first ~1,200 characters
    expect(prompt).toContain('Form values:\n- Quantity: 2\n- Gift: unchecked');
    expect(prompt).toContain('Base your verdict on the frames; cite the frame IDs you rely on.');
    expect(prompt).toContain('Missing verification of a required detail');
    expect(prompt).toContain('"evidence":["F1",...]');
    expect(prompt).toContain('If the task asks for a result the site computes and the agent gives its own estimate or calculation instead, mark "failure".');
  });

  it('names the Read tool when images are not attached, and shows "none" without form values', () => {
    const prompt = buildEvidencePrompt(packetInput([frame(1), frame(2, { final: true })], { attached: false }));
    expect(prompt).toContain('Image: f1.png (open it with the Read tool)');
    expect(prompt).not.toContain('(attached)');
    expect(prompt).toContain('Form values:\nnone');
  });

  it('labels the last frame as final only when it was captured after the run', () => {
    const noFinal = buildEvidencePrompt(packetInput([frame(1), frame(2)]));
    expect(noFinal).toContain('F2 (last frame captured during the run)');
    expect(noFinal).not.toContain('captured after the agent finished');
    expect(noFinal).not.toContain('the final frame is full size');
    expect(noFinal).not.toContain('Form values:');
  });

  it('names no tool, step or action trace', () => {
    const prompt = buildEvidencePrompt(packetInput(frames));
    expect(prompt).not.toMatch(TOOL_WORDS);
    // The near miss: page text is passed through as-is, so tool words in a page would remain, but the template adds none.
    expect(buildEvidencePrompt(packetInput([frame(1, { text: 'Take a screenshot of your cart' })]))).toMatch(/screenshot/);
  });

  it('explains a fresh-load fallback or the absence of any evidence when there are no frames', () => {
    const fresh = buildEvidencePrompt(packetInput([], { freshImage: 'fresh.png' }));
    expect(fresh).toContain('No frames were captured during the run.');
    expect(fresh).toContain('The attached image is a fresh load of the final URL in a new browser');
    expect(fresh).toContain('only shows that the page exists, not the state the agent\'s session reached (searches, filters, cart, form entries)');
    expect(fresh).not.toContain('Evidence:');
    expect(fresh).not.toContain('Base your verdict on the frames');
    expect(buildEvidencePrompt(packetInput([], { freshImage: '/x/fresh.png', attached: false }))).toContain('The image at /x/fresh.png (open it with the Read tool)');
    const none = buildEvidencePrompt(packetInput([]));
    expect(none).toContain('No evidence is available');
    expect(none).toContain('answer "unsure" if the reply alone is not enough');
    expect(none).not.toContain('fresh load');
  });

  it('keeps the old prompt for old rows', () => {
    const old = { task: 't', approach: 'mantis', run: 1, status: 'success', finalScreenshotPath: null, toolCalls: 1, totalInputTokens: 1 };
    expect(isEvidenceRun(old)).toBe(false);
    expect(isEvidenceRun({ ...old, evidenceFrames: [] })).toBe(true);
    const prompt = buildJudgePrompt({ task: 'find item', website: 'https://example.com', finalUrl: null, answer: 'a', screenshotPath: null });
    expect(prompt).not.toContain('Evidence:');
    expect(prompt).not.toContain('"evidence"');
    expect(prompt.split('\n').at(-1)).toBe('Reply with only strict JSON, no code fence: {"verdict":"success"|"failure"|"unsure"|"blocked"|"site_broken","reason":"<one sentence>"}');
  });

  it('parses cited frame IDs and ignores junk', () => {
    expect(parseJudgeOutput('{"verdict":"success","reason":"ok","evidence":["F2","F10","F2"]}')).toEqual({ verdict: 'success', reason: 'ok', evidence: ['F2', 'F10'] });
    expect(parseJudgeOutput('{"verdict":"success","reason":"ok","evidence":["F2","frame 3","f4",7,"F"]}').evidence).toEqual(['F2']);
    expect(parseJudgeOutput('{"verdict":"success","reason":"ok","evidence":"F2"}')).toEqual({ verdict: 'success', reason: 'ok' });
    expect(parseJudgeOutput('{"verdict":"success","reason":"ok","evidence":["x"]}')).toEqual({ verdict: 'success', reason: 'ok' });
    expect(parseJudgeOutput('{"verdict":"success","reason":"ok"}')).toEqual({ verdict: 'success', reason: 'ok' });
  });
});

describe('evidence packet files', () => {
  const setup = (frames: { file: string; png: Buffer | string; final?: boolean }[]): { logs: string; sidecar: string; dest: string } => {
    const logs = path.join(dir(), 'logs');
    mkdirSync(logs);
    for (const f of frames) writeFileSync(path.join(logs, f.file), f.png);
    const sidecar = path.join(logs, 'run.evidence.json');
    writeFileSync(sidecar, JSON.stringify({ frames: frames.map((f, i) => ({ id: `F${i + 1}`, step: i, url: `https://example.com/${i}`, file: f.file, text: `text ${i}`, ...(f.final ? { final: true, forms: [{ label: 'Name', value: 'x' }] } : {}) })), captured: frames.length, kept: frames.length, captureMs: 5 }));
    const dest = dir();
    return { logs, sidecar, dest };
  };
  const size = (file: string): [number, number] => { const img = decodePng(readFileSync(file)); return [img.width, img.height]; };

  it('downscales earlier frames to fit 640x400 and keeps the final frame full size', () => {
    const { logs, sidecar, dest } = setup([{ file: 'a.step-01.png', png: solid(1280, 800) }, { file: 'a.step-02.png', png: solid(300, 200) }, { file: 'a.final.png', png: solid(1280, 800), final: true }]);
    const packet = buildEvidencePacket(sidecar, logs, dest);
    expect(packet.frames.map((f) => [f.id, f.image, f.final])).toEqual([['F1', 'f1.png', false], ['F2', 'f2.png', false], ['F3', 'f3.png', true]]);
    expect(packet.frames[2]!.forms).toEqual([{ label: 'Name', value: 'x' }]);
    expect(packet.texts).toEqual(['text 0', 'text 1', 'text 2']);
    expect(packet.siteFailure).toBe(false);
    expect(size(path.join(dest, 'f1.png'))).toEqual([640, 400]);
    expect(size(path.join(dest, 'f2.png'))).toEqual([300, 200]); // never enlarged
    expect(size(path.join(dest, 'f3.png'))).toEqual([1280, 800]);
    expect(JSON.stringify(packet)).not.toContain('a.step');
  });

  it('decides the downscale per frame and copies undecodable images unchanged', () => {
    const big = solid(1280, 800);
    expect(prepareFrameImage(big, false).downscaled).toBe(true);
    expect(prepareFrameImage(big, true)).toEqual({ png: big, downscaled: false });
    expect(prepareFrameImage(solid(640, 400), false).downscaled).toBe(false);
    const junk = Buffer.from('not-a-png');
    expect(prepareFrameImage(junk, false)).toEqual({ png: junk, downscaled: false });
  });

  it('refuses a sidecar outside the run log folder and skips missing images', () => {
    const { logs, sidecar, dest } = setup([{ file: 'a.final.png', png: solid(10, 10), final: true }]);
    expect(buildEvidencePacket(sidecar, path.join(dir(), 'elsewhere'), dest)).toEqual({ frames: [], texts: [], siteFailure: false });
    expect(buildEvidencePacket(path.join(logs, 'missing.json'), logs, dest)).toEqual({ frames: [], texts: [], siteFailure: false });
    const gone = setup([{ file: 'a.step-01.png', png: solid(10, 10) }, { file: 'a.final.png', png: solid(10, 10), final: true }]);
    rmSync(path.join(gone.logs, 'a.step-01.png'));
    const packet = buildEvidencePacket(gone.sidecar, gone.logs, gone.dest);
    expect(packet.frames.map((f) => f.id)).toEqual(['F2']);
    expect(packet.texts).toHaveLength(2);
  });

  it('never reads outside the sidecar folder through a frame file name', () => {
    const { logs, sidecar, dest } = setup([{ file: 'a.final.png', png: solid(10, 10), final: true }]);
    writeFileSync(path.join(path.dirname(logs), 'secret.png'), solid(10, 10));
    const raw = JSON.parse(readFileSync(sidecar, 'utf8'));
    raw.frames[0].file = '../secret.png';
    writeFileSync(sidecar, JSON.stringify(raw));
    expect(buildEvidencePacket(sidecar, logs, dest).frames).toEqual([]);
  });
});
