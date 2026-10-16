import { afterAll, beforeAll, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { fixture, idOf } from './helpers.js';

let browser: MantisBrowser;
beforeAll(() => { browser = new MantisBrowser({ actionTimeoutMs: 300 }); });
afterAll(async () => { await browser.close(); });

it('activates only a verified associated label when it intercepts a pointer', async () => {
  const view = await browser.open(fixture('generic-browser-pointer.html'));
  const selected = await browser.click(idOf(view, 'radio "Valid radio"'));
  expect(selected).toContain('radio selected');
  const foreign = await browser.click(idOf(view, 'button "Covered button"'));
  expect(foreign).toContain('covered by another element');
  expect(await browser.read()).not.toContain('covered clicked');
  const pointerless = await browser.click(idOf(view, 'button "Pointerless button"'));
  expect(pointerless).toMatch(/^error:/);
  expect(await browser.read()).not.toContain('pointerless clicked');
});

it('clicks only snapshot-verified screen reader controls', async () => {
  const view = await browser.open(fixture('generic-browser-sr-only.html'));
  const id = idOf(view, 'radio "Hidden answer"');
  expect((await browser.snapshot()).nodes.find((n) => n.id === id)?.srOnly).toBe(true);
  expect(await browser.click(id)).toContain('answer chosen');
});

it('waits for a late rendered dialog on a blocked page and ignores template content', async () => {
  const start = performance.now();
  const view = await browser.open(fixture('generic-browser-late-dialog.html'));
  expect(performance.now() - start).toBeGreaterThanOrEqual(500);
  expect(view).toContain('Consent choices');
  expect(view).toContain('button "Accept"');
  expect(view).not.toContain('Template button');
  const nodes = (await browser.snapshot()).nodes;
  expect(nodes.filter((n) => n.kind === 'interactive' && n.name === 'Continue')[0]?.covered).toBe(true);
});

it('recaptures when blocked controls become enabled without a dialog', async () => {
  const view = await browser.open(fixture('generic-browser-enable.html'));
  const id = idOf(view, 'button "Continue"');
  expect((await browser.snapshot()).nodes.find((n) => n.id === id)?.states).not.toContain('disabled');
});

it('keeps ordinary open latency short for a single disabled control', async () => {
  const start = performance.now();
  const view = await browser.open(fixture('generic-browser-disabled.html'));
  expect(view).toContain('Submit');
  expect(view).not.toContain('Hidden consent');
  expect(performance.now() - start).toBeLessThan(300);
});
