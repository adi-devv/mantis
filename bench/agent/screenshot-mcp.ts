/**
 * Screenshot-only browser for the real-agent eval: the agent sees pixels and acts by coordinates,
 * the way computer-use agents work. Tools: navigate, screenshot, click(x, y), type, key, scroll, back.
 * Actions return a short text ack; the agent calls screenshot() to see the result.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { z } from 'zod';

const VIEWPORT = { width: 1280, height: 800 };
let browser: Browser | null = null;
let page: Page | null = null;

async function current(): Promise<Page> {
  if (!page) {
    browser = await chromium.launch({ headless: true });
    page = await (await browser.newContext({ viewport: VIEWPORT })).newPage();
  }
  return page;
}

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] });
async function act(fn: (p: Page) => Promise<string>) {
  try {
    const p = await current();
    const msg = await fn(p);
    await p.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
    await p.waitForTimeout(300);
    return text(msg);
  } catch (e) {
    return { ...text(`error: ${String(e instanceof Error ? e.message : e).split('\n')[0]}`), isError: true };
  }
}

const server = new McpServer({ name: 'screenshot', version: '0.1.0' });
server.registerTool('navigate', { description: 'Go to a URL.', inputSchema: { url: z.string() } }, ({ url }) =>
  act(async (p) => { await p.goto(url, { waitUntil: 'domcontentloaded' }); return `navigated to ${p.url()}`; }));
server.registerTool(
  'screenshot',
  { description: `Screenshot of the browser viewport (${VIEWPORT.width}x${VIEWPORT.height}). Coordinates for click are in these pixels.`, inputSchema: {} },
  async () => {
    const p = await current();
    const png = await p.screenshot({ type: 'png' });
    return { content: [{ type: 'image' as const, data: png.toString('base64'), mimeType: 'image/png' }] };
  },
);
server.registerTool('click', { description: 'Click at viewport pixel (x, y).', inputSchema: { x: z.number(), y: z.number() } }, ({ x, y }) =>
  act(async (p) => { await p.mouse.click(x, y); return `clicked at (${x}, ${y})`; }));
server.registerTool('type', { description: 'Type text into the focused element.', inputSchema: { text: z.string() } }, ({ text: t }) =>
  act(async (p) => { await p.keyboard.type(t); return `typed ${JSON.stringify(t)}`; }));
server.registerTool('key', { description: 'Press a key, e.g. Enter, Tab, Escape, ArrowDown.', inputSchema: { key: z.string() } }, ({ key }) =>
  act(async (p) => { await p.keyboard.press(key); return `pressed ${key}`; }));
server.registerTool(
  'scroll',
  { description: 'Scroll the page up or down by about one screen.', inputSchema: { direction: z.enum(['up', 'down']) } },
  ({ direction }) => act(async (p) => { await p.mouse.wheel(0, direction === 'down' ? 700 : -700); return `scrolled ${direction}`; }),
);
server.registerTool('back', { description: 'Go back one page.', inputSchema: {} }, () =>
  act(async (p) => { await p.goBack(); return `back to ${p.url()}`; }));

server.registerTool('bench_capture', { description: 'Harness-only final viewport capture.', inputSchema: {} }, async () => {
  if (!page || page.isClosed()) return { ...text('No live page to capture.'), isError: true };
  const png = await page.screenshot({ type: 'png', fullPage: false, scale: 'css' });
  return { content: [{ type: 'image' as const, data: png.toString('base64'), mimeType: 'image/png' }] };
});

const close = (): void => { void browser?.close().finally(() => process.exit(0)); };
process.stdin.on('close', close);
process.on('SIGTERM', close);
await server.connect(new StdioServerTransport());
