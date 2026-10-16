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

// ---- fill() on visually hidden checkboxes ------------------------------------

const checkedStates = async (b: MantisBrowser): Promise<string> => (await b.read()).match(/state: .*/)?.[0] ?? '';

it('fill checks a hidden native checkbox that click() can reach through its label', async () => {
  const view = await browser.open(fixture('generic-browser-hidden-checkbox.html'));
  const id = idOf(view, 'checkbox "Refine by Farbe: Braun"');
  const out = await browser.fill([{ id, value: true }]);
  expect(out).toContain('checked');
  expect(out).not.toMatch(/error/);
  expect(await checkedStates(browser)).toContain('braun=1');
  // already in the wanted state: no click, no toggle back
  expect(await browser.fill([{ id, value: true }])).not.toMatch(/error/);
  expect(await checkedStates(browser)).toContain('braun=1');
  expect(await browser.fill([{ id, value: false }])).toContain('unchecked');
  expect(await checkedStates(browser)).toContain('braun=0');
});

it('fill never toggles a hidden checkbox the wrong way and reports an already-correct state', async () => {
  const view = await browser.open(fixture('generic-browser-hidden-checkbox.html'));
  const rot = idOf(view, 'checkbox "Refine by Farbe: Rot"');
  const braun = idOf(view, 'checkbox "Refine by Farbe: Braun"');
  expect(await browser.fill([{ id: braun, value: false }])).toContain('unchecked');
  expect(await browser.fill([{ id: rot, value: true }])).toContain('checked');
  expect(await checkedStates(browser)).toMatch(/braun=0.*rot=1/);
});

it('fill still errors for a disabled or unlabelled covered checkbox and leaves it unchanged', async () => {
  const view = await browser.open(fixture('generic-browser-hidden-checkbox.html'));
  const grau = await browser.fill([{ id: idOf(view, 'Refine by Farbe: Grau'), value: true }]);
  expect(grau).toMatch(/^error:/);
  const blau = await browser.fill([{ id: idOf(view, 'Refine by Farbe: Blau'), value: true }]);
  expect(blau).toMatch(/^error:/);
  expect(await checkedStates(browser)).toMatch(/grau=0.*blau=0/);
});

it('fill selects a hidden radio but cannot uncheck one', async () => {
  const view = await browser.open(fixture('generic-browser-hidden-checkbox.html'));
  const small = idOf(view, 'radio "Size small"');
  expect(await browser.fill([{ id: small, value: true }])).toContain('checked');
  expect(await checkedStates(browser)).toMatch(/small=1 large=0/);
  expect(await browser.fill([{ id: small, value: false }])).toMatch(/^error:/);
  expect(await checkedStates(browser)).toMatch(/small=1 large=0/);
});

// ---- scroll(direction, id): scroll the list that contains #id --------------------

it('scroll with id and direction scrolls the containing list and loads more items', async () => {
  const view = await browser.open(fixture('hidden/generic-browser-inner-scroll.html'));
  expect(view).toContain('Result 1');
  const id = idOf(view, 'link "Result 1"');
  const out = await browser.scroll('down', id);
  expect(out).toMatch(/scrolled down inside "Results"; now at \d+% of it/);
  expect(out).toContain('Result 1'); // diff reports newly loaded / removed items
  const again = await browser.scroll('down', id);
  expect(again).toMatch(/scrolled down inside "Results"/);
  const state = await browser.snapshot();
  expect(state.nodes.some((n) => n.name === 'Result 13' || n.name === 'Result 19')).toBe(true);
  const up = await browser.scroll('up', id);
  expect(up).toMatch(/scrolled up inside "Results"/);
});

it('scroll with id and direction reports the end of the list and does not scroll something else', async () => {
  const view = await browser.open(fixture('hidden/generic-browser-inner-scroll.html'));
  const page = (browser as unknown as { page: { evaluate: <T>(fn: () => T) => Promise<T> } }).page;
  const top = idOf(view, 'link "Result 1"');
  let out = '';
  for (let i = 0; i < 12; i++) {
    out = await browser.scroll('down', top);
    if (/already at the bottom of it/.test(out)) break;
  }
  expect(out).toContain('already at the bottom of it');
  // the bigger "notes" panel was not scrolled as a fallback
  expect(await page.evaluate(() => document.querySelector('#notes')!.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.querySelector('#results')!.scrollTop)).toBeGreaterThan(0);
});

it('scroll with id and direction falls back to the page scroll when #id is not in a scrollable list', async () => {
  const view = await browser.open(fixture('hidden/generic-browser-inner-scroll.html'));
  const out = await browser.scroll('down', idOf(view, 'link "Short A"'));
  expect(out).toContain('not inside a scrollable list');
  expect(out).toMatch(/scrolled down; now at \d+% of page/);
});

it('scroll with only an id or only a direction keeps its old behaviour', async () => {
  const view = await browser.open(fixture('hidden/generic-browser-inner-scroll.html'));
  expect(await browser.scroll(idOf(view, 'link "Result 1"'))).toContain('into view');
  expect(await browser.scroll('down')).toMatch(/^scrolled down; now at \d+% of page/);
});
