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
  const server = new McpServer({ name: 'mantis', version: '0.1.1' });
  const id = z.number().int();

  server.registerTool(
    'open',
    { description: 'Go to a URL; returns numbered page text. Act on elements by #number.', inputSchema: { url: z.string() } },
    async ({ url }) => reply(await browser.open(url)),
  );
  server.registerTool(
    'read',
    {
      description:
        'Page as numbered text; act by #number. Re-read after changes. ~"x" names are guesses. ' +
        '"Same as before" regions keep working numbers; region, full or fresh expand them. ' +
        'Before finishing, re-read and visibly verify every task constraint (filters, sort, size, quantity, date range). ' +
        'If #number is stale, read() and retry; if on the wrong page, back() and keep searching.',
      inputSchema: {
        region: z.string().optional().describe('Label substring, e.g. "nav"'),
        full: z.boolean().optional().describe('No trimming'),
        fresh: z.boolean().optional().describe('Expand seen regions too (this call only)'),
      },
    },
    async ({ region, full, fresh }) => reply(await browser.read({ region, full, fresh })),
  );
  server.registerTool(
    'find',
    {
      description:
        'Search the whole page, including parts read trims, for text (case-insensitive). Returns #numbers and region.',
      inputSchema: { text: z.string() },
    },
    async ({ text }) => reply(await browser.find(text)),
  );
  server.registerTool(
    'forget',
    {
      description: 'Clear seen-regions memory; next read shows everything.',
      inputSchema: {},
    },
    async () => reply(await browser.forget()),
  );
  server.registerTool(
    'click',
    { description: 'Click element #id.', inputSchema: { id } },
    async ({ id }) => reply(await browser.click(id)),
  );
  server.registerTool(
    'type',
    {
      description: 'Replace input #id text; submit presses Enter.',
      inputSchema: { id, text: z.string(), submit: z.boolean().optional() },
    },
    async ({ id, text, submit }) => reply(await browser.type(id, text, submit ?? false)),
  );
  server.registerTool(
    'select',
    { description: 'Choose option (label or value) in dropdown #id.', inputSchema: { id, option: z.string() } },
    async ({ id, option }) => reply(await browser.select(id, option)),
  );
  server.registerTool(
    'fill',
    {
      description: 'Fill several fields at once: text, dropdown option, or true/false for checkboxes.',
      inputSchema: { fields: z.array(z.object({ id, value: z.union([z.string(), z.boolean()]) })) },
    },
    async ({ fields }) => reply(await browser.fill(fields)),
  );
  server.registerTool(
    'press',
    { description: 'Press a key, e.g. Enter.', inputSchema: { key: z.string() } },
    async ({ key }) => reply(await browser.press(key)),
  );
  server.registerTool(
    'scroll',
    {
      description: 'Scroll up/down (default down). id alone brings #id into view; id with direction scrolls the list/panel containing #id.',
      inputSchema: { direction: z.enum(['up', 'down']).optional(), id: id.optional() },
    },
    async ({ direction, id }) =>
      reply(await (id !== undefined && direction ? browser.scroll(direction, id) : browser.scroll(id ?? direction ?? 'down'))),
  );
  server.registerTool(
    'back',
    { description: 'Go back one page in history.', inputSchema: {} },
    async () => reply(await browser.back()),
  );

  // ---- fallback ladder: only when read() is not enough. Try in this order. ----
  const visual = {
    id: id.optional(),
    selector: z.string().optional().describe('CSS selector'),
  };
  server.registerTool(
    'media',
    {
      description: 'Fallback ladder, only if read is not enough: media → data (prefer) → ocr → look (last resort) → ask_human. Lists images/canvases/charts with numbers.',
      inputSchema: {},
    },
    async () => reply(await browser.media()),
  );
  server.registerTool(
    'data',
    {
      description:
        'Prefer; text only. Hidden text behind an image/SVG/chart: alt, caption, SVG text, Chart.js/ECharts/Highcharts values. Use data({id: N}) with a number from read()/media(), or data({selector: "..."}).',
      inputSchema: visual,
    },
    async ({ id, selector }) => reply(await browser.data({ id, selector })),
  );
  server.registerTool(
    'ocr',
    {
      description: 'Text only. OCR of text in an image/canvas. Use if data found nothing. id or selector.',
      inputSchema: visual,
    },
    async ({ id, selector }) => reply(await browser.ocr({ id, selector })),
  );
  server.registerTool(
    'look',
    {
      description:
        'LAST RESORT; the only tool returning an image (PNG, max 800px). Only after read/data/ocr failed. id or selector.',
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
        'Hand over to a person for CAPTCHA, 2FA, payment or login. Mantis never solves CAPTCHAs. Waits for a page change, then returns the page.',
      inputSchema: {
        reason: z.string().describe('What the human must do'),
        until: z.string().optional().describe('url_change | selector_gone:<css> | selector_present:<css>; default: URL or content change'),
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
