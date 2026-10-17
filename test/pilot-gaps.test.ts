import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { fixture, idOf } from './helpers.js';

let browser: MantisBrowser;
beforeAll(() => { browser = new MantisBrowser({ actionTimeoutMs: 300 }); });
afterAll(async () => { await browser.close(); });

describe('generic pilot gaps', () => {
  it('names the collapsed controller before trying an option in its inactive panel', async () => {
    const view = await browser.open(fixture('generic-browser-cover-diagnosis.html'));
    const trigger = idOf(view, 'button "Filters"');
    const result = await browser.click(idOf(view, 'button "Apply filters"'));
    expect(result).toContain(`open #${trigger} "Filters" first`);
    expect(result).not.toContain('dismiss that first');
  });

  it('does not call ordinary page controls a dismissible overlay', async () => {
    const view = await browser.open(fixture('generic-browser-cover-diagnosis.html'));
    const result = await browser.click(idOf(view, 'button "Continue"'));
    expect(result).toContain('nothing to dismiss');
    expect(result).not.toContain('dismiss that first');
  });

  it('still calls a semantic dialog dismissible', async () => {
    const view = await browser.open(`${fixture('generic-browser-cover-diagnosis.html')}?dialog=1`);
    const result = await browser.click(idOf(view, 'button "Continue"'));
    expect(result).toContain('dismiss that first');
    expect(result).toMatch(/try #\d+ "Dismiss"/);
  });

  it('marks text-only choices in a collapsed group with the trigger that opens them', async () => {
    const view = await browser.open(fixture('generic-browser-collapsed-options.html'));
    const trigger = idOf(view, 'button "Colour"');
    expect(view).toContain(`"Black (414 products)" (open #${trigger} "Colour" first)`);
    expect(view).toContain(`"Blue (108 products)" (open #${trigger} "Colour" first)`);
  });

  it('keeps ordinary text and options without a closed controller unmarked', async () => {
    const view = await browser.open(fixture('generic-browser-collapsed-options.html'));
    expect(view).toMatch(/#\d+ checkbox "Small"/);
    expect(view).toContain('Black ink is archival.');
    expect(view).not.toContain('Black ink is archival." (open #');
  });

  it('uses a known canvas id in a missing data target error', async () => {
    await browser.open(fixture('generic-data-hint.html'));
    const media = await browser.media();
    const canvas = Number(media.match(/^#(\d+) canvas/m)?.[1]);
    expect(canvas).toBeGreaterThan(0);
    expect(await browser.data({ id: 9999 })).toContain(`data({id: ${canvas}})`);
  });

  it('does not offer a canvas id when the page has no visible canvas', async () => {
    await browser.open(`${fixture('generic-data-hint.html')}?empty=1`);
    const result = await browser.data({ id: 9999 });
    expect(result).toMatch(/^error: no element #9999/);
    expect(result).not.toContain('data({id:');
  });

  it('opens ARIA and native filter groups before selecting their real control ids', async () => {
    let view = await browser.open(fixture('generic-browser-collapsed-options.html'));
    const colour = idOf(view, 'button "Colour"');
    expect(view).toContain(`"Black (414 products)" (open #${colour} "Colour" first)`);
    expect(view).not.toMatch(/Black ink is archival\." \(open #/); // near miss: prose is not an option
    await browser.click(colour);
    view = await browser.read();
    expect(view).not.toContain(`open #${colour} "Colour" first`);
    expect(await browser.click(idOf(view, 'checkbox "Black (414 products)"'))).toContain('Black (414 products) selected');

    view = await browser.open(fixture('generic-browser-collapsed-options.html'));
    const material = idOf(view, 'button "Material"');
    await browser.click(material);
    view = await browser.read();
    expect(await browser.click(idOf(view, 'checkbox "Cotton"'))).toContain('Cotton selected');
  });

  it('advertises canvas data targets in read and keeps series scoped to the selected canvas', async () => {
    const view = await browser.open(fixture('generic-data-hint.html'));
    const trend = Number(view.match(/^\s*#(\d+) canvas "Monthly trend"/m)?.[1]);
    const comparison = Number(view.match(/^\s*#(\d+) canvas "Comparison trend"/m)?.[1]);
    expect(trend).toBeGreaterThan(0);
    expect(view).toContain(`data({id: ${trend}})`);
    expect((await browser.media())).toMatch(new RegExp(`^#${trend} canvas .*Monthly trend`, 'm'));
    expect(await browser.data({ id: trend })).toContain('Monthly series');
    expect(await browser.data({ id: comparison })).toContain('Comparison series');
    expect(await browser.data({ id: comparison })).not.toContain('Monthly series'); // near miss: another chart is not the requested one
  });
});
