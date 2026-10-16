import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MantisBrowser, createServer } from '../src/index.js';
import { fixture } from './helpers.js';

const browser = new MantisBrowser({ actionTimeoutMs: 1500 });
const client = new Client({ name: 'test', version: '0' });

beforeAll(async () => {
  const [a, z] = InMemoryTransport.createLinkedPair();
  await Promise.all([createServer(browser).connect(a), client.connect(z)]);
});
afterAll(async () => {
  await client.close();
  await browser.close();
});

const call = async (name: string, args: Record<string, unknown> = {}) => {
  const res = await client.callTool({ name, arguments: args });
  const content = res.content as { type: string; text: string }[];
  return { text: content[0].text, isError: res.isError === true };
};

it('exposes the core tools and the fallback ladder', async () => {
  const { tools } = await client.listTools();
  expect(tools.map((t) => t.name).sort()).toEqual(['ask_human', 'back', 'click', 'data', 'find', 'forget', 'look', 'media', 'ocr', 'open', 'press', 'read', 'scroll', 'select', 'type']);
});

it('open then click by number over MCP', async () => {
  const opened = await call('open', { url: fixture('shadow.html') });
  const n = Number(opened.text.match(/#(\d+) button "Shadow button"/)![1]);
  const clicked = await call('click', { id: n });
  expect(clicked.isError).toBe(false);
  expect(clicked.text).toContain('title: "Shadow" → "Shadow clicked"');
});

it('read accepts optional region and full over MCP', async () => {
  await call('open', { url: fixture('login.html') });
  const plain = await call('read');
  expect(plain.text).toContain('link "Home"');
  const part = await call('read', { region: 'form' });
  expect(part.text).toContain('textbox "Email"');
  expect(part.text).not.toContain('link "Home"');
  const bad = await call('read', { region: 'nope' });
  expect(bad.isError).toBe(true);
  expect((await call('read', { full: true })).isError).toBe(false);
});

it('flags errors with isError', async () => {
  const res = await call('click', { id: 4242 });
  expect(res.isError).toBe(true);
  expect(res.text).toMatch(/^error: no element #4242/);
});
