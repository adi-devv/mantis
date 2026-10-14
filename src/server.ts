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
    { description: 'Return the current page as numbered text. Use the #numbers with click/type/select/scroll. Re-read after the page changes.', inputSchema: {} },
    async () => reply(await browser.read()),
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
