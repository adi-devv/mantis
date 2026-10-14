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
  return { text: (res.content as { text: string }[])[0].text, isError: res.isError === true };
};

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
