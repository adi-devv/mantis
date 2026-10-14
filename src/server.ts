#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { MantisBrowser } from './browser.js';

const reply = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  ...(text.startsWith('error:') ? { isError: true } : {}),
});

/** Build the MCP server around a browser (launched lazily on first tool call). */
export function createServer(browser: MantisBrowser = new MantisBrowser()): McpServer {
  const server = new McpServer({ name: 'mantis', version: '0.1.0' });
  const id = z.number().int().describe('Element number from read(), e.g. 14 for "#14"');

  server.registerTool(
    'open',
    { description: 'Go to a URL and return the numbered text view of the page. Act on elements by #number.', inputSchema: { url: z.string() } },
    async ({ url }) => reply(await browser.open(url)),
  );
  server.registerTool(
    'read',
    {
      description:
        'Return the current page as numbered text. Use the #numbers with click/type/select/scroll. Re-read after the page changes. ' +
        'Names shown as ~"x" are guesses (icon/tooltip/link). Optional: region (e.g. "nav", "sidebar", "main") reads just that part; full=true turns off trimming.',
      inputSchema: {
        region: z.string().optional().describe('Only this region: a substring of its label, e.g. "nav", "sidebar", "main", "top bar"'),
        full: z.boolean().optional().describe('Disable trimming: every paragraph, link and href'),
      },
    },
    async ({ region, full }) => reply(await browser.read({ region, full })),
  );
  server.registerTool(
    'click',
    { description: 'Click element #id from read().', inputSchema: { id } },
    async ({ id }) => reply(await browser.click(id)),
  );
  server.registerTool(
    'type',
    {
      description: 'Replace the text of input #id from read(). Set submit to press Enter afterwards.',
      inputSchema: { id, text: z.string(), submit: z.boolean().optional() },
    },
    async ({ id, text, submit }) => reply(await browser.type(id, text, submit ?? false)),
  );
  server.registerTool(
    'select',
    { description: 'Choose an option (by label or value) in dropdown #id from read().', inputSchema: { id, option: z.string() } },
    async ({ id, option }) => reply(await browser.select(id, option)),
  );
  server.registerTool(
    'press',
    { description: 'Press a keyboard key, e.g. Enter, Escape, Tab, ArrowDown.', inputSchema: { key: z.string() } },
    async ({ key }) => reply(await browser.press(key)),
  );
  server.registerTool(
    'scroll',
    {
      description: 'Scroll the page up or down (default down), or pass id to bring element #id into view.',
      inputSchema: { direction: z.enum(['up', 'down']).optional(), id: id.optional() },
    },
    async ({ direction, id }) => reply(await browser.scroll(id ?? direction ?? 'down')),
  );
  server.registerTool(
    'back',
    { description: 'Go back one page in history.', inputSchema: {} },
    async () => reply(await browser.back()),
  );

  // ---- fallback ladder: only when read() is not enough. Try in this order. ----
  const visual = {
    id: id.optional().describe('Number from media() or read()'),
    selector: z.string().optional().describe('CSS selector instead of a number'),
  };
  server.registerTool(
    'media',
    {
      description: 'List visible images, canvases and charts with numbers for data/ocr/look. Use when read() mentions a picture or chart you need.',
      inputSchema: {},
    },
    async () => reply(await browser.media()),
  );
  server.registerTool(
    'data',
    {
      description:
        'Step 1 (prefer this; text only). Hidden text behind an image, SVG or chart canvas: alt/caption/filename, SVG text, and chart values read from Chart.js/ECharts/Highcharts memory. Give id or selector.',
      inputSchema: visual,
    },
    async ({ id, selector }) => reply(await browser.data({ id, selector })),
  );
  server.registerTool(
    'ocr',
    {
      description: 'Step 2 (text only). Read text drawn inside an image/canvas with deterministic OCR; returns text and confidence, never the image. Use when data() found nothing. Give id or selector.',
      inputSchema: visual,
    },
    async ({ id, selector }) => reply(await browser.ocr({ id, selector })),
  );
  server.registerTool(
    'look',
    {
      description:
        'Step 3, LAST RESORT: the only tool that returns an image (PNG crop of one element, max 800px). Use only when read/data/ocr failed; never for pages you can read as text. Give id or selector.',
      inputSchema: visual,
    },
    async ({ id, selector }) => {
      const r = await browser.look({ id, selector });
      if ('error' in r) return reply(r.error);
      return {
        content: [
          { type: 'image' as const, data: r.png.toString('base64'), mimeType: 'image/png' },
          { type: 'text' as const, text: r.text },
        ],
      };
    },
  );
  server.registerTool(
    'ask_human',
    {
      description:
        'Step 4: hand over to a person for a CAPTCHA, 2FA code, payment or login you cannot do. Mantis never solves CAPTCHAs. Waits until the page changes or until condition (url_change | selector_gone:<css> | selector_present:<css>), then returns the page view.',
      inputSchema: {
        reason: z.string().describe('What the human needs to do, e.g. "captcha", "enter 2FA code"'),
        until: z.string().optional().describe('url_change | selector_gone:<css> | selector_present:<css>; default: URL or page contents change'),
        timeout_seconds: z.number().positive().optional().describe('Default 300'),
      },
    },
    async ({ reason, until, timeout_seconds }) => reply(await browser.askHuman(reason, until, timeout_seconds)),
  );
  return server;
}

async function main(): Promise<void> {
  const browser = new MantisBrowser();
  const server = createServer(browser);
  const shutdown = (): void => {
    void browser.close().finally(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.stdin.on('close', shutdown);
  await server.connect(new StdioServerTransport());
}

// Run only when executed directly (not when imported by tests).
const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
