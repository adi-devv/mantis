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

it('notes slow hydration and can click as soon as controls become enabled', async () => {
  const slowBrowser = new MantisBrowser({ actionTimeoutMs: 5000 });
  try {
    const view = await slowBrowser.open(fixture('generic-browser-slow-hydrate.html'));
    expect(view).toContain('Some controls are still disabled');
    expect(view).toContain('Actions wait up to 5s');
    const result = await slowBrowser.click(idOf(view, 'button "Continue"'));
    expect(result).toContain('Continue handler ran');
  } finally {
    await slowBrowser.close();
  }
});

it('skips the hydration note for two disabled controls or controls enabled during the existing wait', async () => {
  const two = await browser.open(fixture('generic-browser-enable.html'));
  expect(two).not.toContain('Some controls are still disabled');
  const ready = await browser.open(`${fixture('generic-browser-slow-hydrate.html')}?quick=1`);
  expect(ready).not.toContain('Some controls are still disabled');
  expect((await browser.snapshot()).nodes.filter((n) => n.kind === 'interactive' && n.states.includes('disabled'))).toHaveLength(0);
});

it('notes disabled controls in a full view after navigation', async () => {
  const slowBrowser = new MantisBrowser({ actionTimeoutMs: 5000 });
  try {
    const view = await slowBrowser.open(fixture('generic-browser-slow-hydrate.html'));
    const result = await slowBrowser.click(idOf(view, 'link "Reload hydration"'));
    expect(result).toContain('Slow hydration');
    expect(result).toContain('Some controls are still disabled');
    expect(result).toContain('Actions wait up to 5s');
  } finally {
    await slowBrowser.close();
  }
});
