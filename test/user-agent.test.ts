import { afterEach, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { stripHeadless } from '../src/userAgent.js';
import { fixture } from './helpers.js';

const uaOf = async (b: MantisBrowser): Promise<string> => {
  await b.open(fixture('generic-browser-pointer.html'));
  return (b as unknown as { page: { evaluate: (f: () => string) => Promise<string> } }).page.evaluate(() => navigator.userAgent);
};
let browser: MantisBrowser | undefined;
afterEach(async () => { delete process.env.MANTIS_USER_AGENT; await browser?.close(); browser = undefined; });

it('headless Mantis presents a normal Chrome user agent', async () => {
  browser = new MantisBrowser({ headless: true });
  const ua = await uaOf(browser);
  expect(ua).not.toMatch(/Headless/);
  expect(ua).toMatch(/Chrome\/\d+/);
});

it('MANTIS_USER_AGENT is used verbatim', async () => {
  process.env.MANTIS_USER_AGENT = 'Custom/1.0 (test)';
  browser = new MantisBrowser({ headless: true });
  expect(await uaOf(browser)).toBe('Custom/1.0 (test)');
});

it('stripHeadless only renames the product token', () => {
  expect(stripHeadless('Mozilla/5.0 (X) AppleWebKit/537.36 HeadlessChrome/141.0.0.0 Safari/537.36'))
    .toBe('Mozilla/5.0 (X) AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36');
});
