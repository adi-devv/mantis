import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { fixture, idOf } from './helpers.js';

let browser: MantisBrowser;
beforeAll(() => { browser = new MantisBrowser(); });
afterAll(async () => { await browser.close(); });

const state = async (): Promise<string> => (await browser.read()).match(/Size: \d+/)?.[0] ?? '';

describe('stacked visually hidden options', () => {
  it('lists every option and clicks the associated rendered label', async () => {
    const view = await browser.open(fixture('hidden/stacked-options.html'));
    for (const value of [18, 20, 22, 24, 26, 28]) expect(view).toContain(`radio "${value}"`);
    expect(view).toContain('radio "18" (checked)');
    expect(view).not.toContain('covered');

    let started = performance.now();
    expect(await browser.click(idOf(view, 'radio "22"'))).not.toMatch(/^error:/);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(await state()).toBe('Size: 22');

    const next = await browser.read();
    started = performance.now();
    expect(await browser.click(idOf(next, 'radio "26"'))).not.toMatch(/^error:/);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(await state()).toBe('Size: 26');
    started = performance.now();
    expect(await browser.fill([{ id: idOf(await browser.read(), 'radio "28"'), value: true }])).toContain('checked');
    expect(performance.now() - started).toBeLessThan(1500);
    expect(await state()).toBe('Size: 28');
  });

  it('keeps covered hidden options visible but refuses to click through the overlay', async () => {
    const view = await browser.open(`${fixture('hidden/stacked-options.html')}?overlay`);
    for (const value of [18, 20, 22, 24, 26, 28]) expect(view).toMatch(new RegExp(`radio "${value}".*covered`));
    expect(await browser.click(idOf(view, 'radio "22"'))).toContain('covered by another element');
    expect(await state()).toBe('Size: 18');
  });

  it('uses normal control hit targets and does not bypass a cover via its label', async () => {
    const view = await browser.open(`${fixture('hidden/stacked-options.html')}?normal`);
    for (const value of [18, 20, 22, 26, 28]) expect(view).not.toMatch(new RegExp(`radio "${value}".*covered`));
    expect(view).toMatch(/radio "24".*covered/);
    expect(await browser.click(idOf(view, 'radio "20"'))).not.toMatch(/^error:/);
    expect(await state()).toBe('Size: 20');

    const current = await browser.read();
    expect(await browser.click(idOf(current, 'radio "24"'))).toContain('covered by another element');
    expect(await state()).toBe('Size: 20');
    expect(await browser.click(idOf(await browser.read(), 'radio "26"'))).not.toMatch(/^error:/);
    expect(await state()).toBe('Size: 26');
  });

  it('clicks a full-size transparent checkbox directly unless its label is on top', async () => {
    const view = await browser.open(fixture('hidden/transparent-label-targets.html'));
    let started = performance.now();
    expect(await browser.click(idOf(view, 'checkbox "Direct target"'))).not.toMatch(/^error:/);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(await browser.read()).toContain('Direct: checked by direct-control');

    const next = await browser.read();
    started = performance.now();
    expect(await browser.click(idOf(next, 'checkbox "Label target"'))).not.toMatch(/^error:/);
    expect(performance.now() - started).toBeLessThan(1500);
    expect(await browser.read()).toContain('Label: checked by top-label');
  });
});
