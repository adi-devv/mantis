import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import type { Browser, BrowserContext, Page } from 'playwright';
import { MantisBrowser } from '../src/index.js';
import { chromiumExecutable } from '../src/userAgent.js';
import { CAPTCHA_WARNING, detectCaptcha } from '../src/fallback/captcha.js';
import { fixture } from './helpers.js';

let rawBrowser: Browser;
let context: BrowserContext;
let page: Page;

beforeAll(async () => {
  rawBrowser = await chromium.launch(chromiumExecutable());
  context = await rawBrowser.newContext();
  await context.route('https://www.google.com/recaptcha/**', (route) => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><title>Challenge</title><p>Challenge frame</p>',
  }));
  page = await context.newPage();
});

afterAll(async () => {
  await page?.close();
  await context?.close();
  await rawBrowser?.close();
});

async function openCase(name: string): Promise<void> {
  await page.goto(`${fixture('hidden/captcha-rendering.html')}?case=${name}`, { waitUntil: 'load' });
}

describe('rendered CAPTCHA detection', () => {
  it.each(['visible-widget', 'visible-frame', 'shadow-visible'])('detects a rendered %s candidate', async (name) => {
    await openCase(name);
    expect(await detectCaptcha(page)).toBe(CAPTCHA_WARNING);
  });

  it.each(['hidden-widget', 'display-none-frame', 'zero-frame', 'offscreen-frame', 'shadow-hidden'])('ignores the %s near miss', async (name) => {
    await openCase(name);
    expect(await detectCaptcha(page)).toBeNull();
  });

  it('ignores many unrelated visible frames', async () => {
    await page.setContent('<main></main>');
    await page.evaluate(() => {
      for (let index = 0; index < 30; index++) {
        const frame = document.createElement('iframe');
        frame.srcdoc = `<p>Frame ${index}</p>`;
        frame.width = '30';
        frame.height = '30';
        document.body.append(frame);
      }
    });
    expect(await detectCaptcha(page)).toBeNull();
  });

  it('does not append a warning to read() for a hidden widget', async () => {
    const browser = new MantisBrowser();
    try {
      const view = await browser.open(`${fixture('hidden/captcha-rendering.html')}?case=hidden-widget`);
      expect(view).not.toContain('CAPTCHA');
      expect(await browser.read()).not.toContain('CAPTCHA');
    } finally {
      await browser.close();
    }
  });
});
