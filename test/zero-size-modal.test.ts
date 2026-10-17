import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { fixture, idOf } from './helpers.js';

let browser: MantisBrowser;
beforeAll(() => { browser = new MantisBrowser(); });
afterAll(async () => { await browser.close(); });

describe('zero-size clipping containers', () => {
  it('keeps a viewport-fixed dialog that escapes a zero-size clipped ancestor', async () => {
    await browser.open(fixture('hidden/zero-size-modal.html'));
    const view = await browser.read();
    const dismiss = idOf(view, 'button "Dismiss"');
    expect(view).toContain('dialog "Sign in to get more"');
    expect(view).toContain('Save your preferences and continue where you left off.');
    const covered = await browser.click(idOf(view, 'button "Sort reviews"'));
    expect(covered).toContain('covered by another element');
    expect(covered).toContain('<div');
    expect(covered).toContain(`(try #${dismiss} "Dismiss")`);
    await browser.click(dismiss);
    expect(await browser.click(idOf(await browser.read(), 'button "Sort reviews"'))).not.toMatch(/^error:/);
    expect(await browser.read()).toContain('Sorted');
  });

  it('keeps an absolute descendant whose containing block is outside the clipping root', async () => {
    await browser.open(`${fixture('hidden/zero-size-modal.html')}?absolute`);
    expect(await browser.read()).toContain('button "Escaped action"');
    expect(await browser.click(idOf(await browser.read(), 'button "Escaped action"'))).not.toMatch(/^error:/);
  });

  it('still prunes normal-flow content in a collapsed panel', async () => {
    await browser.open(`${fixture('hidden/zero-size-modal.html')}?accordion`);
    const view = await browser.read();
    expect(view).not.toContain('Hidden answer');
    expect(view).not.toContain('Hidden action');
  });

  it('prunes a collapsed panel when it also contains clipped normal-flow content', async () => {
    await browser.open(`${fixture('hidden/zero-size-modal.html')}?panel`);
    const view = await browser.read();
    expect(view).not.toContain('Hidden answer');
    expect(view).not.toContain('Badge action');
  });

  it('does not keep fixed content contained by a transformed clipping root', async () => {
    await browser.open(`${fixture('hidden/zero-size-modal.html')}?transformed`);
    const view = await browser.read();
    expect(view).not.toContain('Dismiss');
    expect(await browser.click(idOf(view, 'button "Sort reviews"'))).not.toMatch(/^error:/);
  });

  it('does not keep fixed content contained by a layout-paint clipping root', async () => {
    await browser.open(`${fixture('hidden/zero-size-modal.html')}?contained`);
    const view = await browser.read();
    expect(view).not.toContain('Dismiss');
    expect(await browser.click(idOf(view, 'button "Sort reviews"'))).not.toMatch(/^error:/);
  });
});
