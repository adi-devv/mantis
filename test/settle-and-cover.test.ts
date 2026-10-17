import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Page } from 'playwright';
import { MantisBrowser } from '../src/index.js';
import { fixture, idOf } from './helpers.js';

let browser: MantisBrowser;
beforeAll(() => { browser = new MantisBrowser({ actionTimeoutMs: 5000 }); });
afterAll(async () => { await browser.close(); });

async function idByName(name: string): Promise<number> {
  const node = (await browser.snapshot()).nodes.find((n) => n.kind === 'interactive' && n.name === name);
  if (node?.id === undefined) throw new Error(`no "${name}" control`);
  return node.id;
}

const pageOf = (): Promise<Page> => (browser as unknown as { activePage(): Promise<Page> }).activePage();

async function timed(run: () => Promise<string>): Promise<{ text: string; ms: number }> {
  const start = performance.now();
  const text = await run();
  const ms = performance.now() - start;
  return { text, ms };
}

describe('settle ignores animation', () => {
  it('does not wait out a carousel that mutates style forever', async () => {
    await browser.open(fixture('hidden/settle-animation.html'));
    const id = await idByName('Show details');
    const { text, ms } = await timed(() => browser.click(id));
    expect(text).toContain('Details loaded');
    expect(ms).toBeLessThan(2000);
  });

  it('still waits for content that arrives as new nodes (near miss)', async () => {
    await browser.open(fixture('hidden/settle-animation.html'));
    const id = await idByName('Load report');
    const { text } = await timed(() => browser.click(id));
    expect(text).toContain('Done');
  });
});

describe('settle ignores carousels across many elements and head injections', () => {
  it('returns promptly with the revealed text', async () => {
    await browser.open(fixture('hidden/settle-carousel.html'));
    const id = await idByName('Reveal panel');
    const { text, ms } = await timed(() => browser.click(id));
    expect(text).toContain('Panel text');
    expect(ms).toBeLessThan(2000);
  });

  it('still waits for content after a single burst of class changes (near miss)', async () => {
    await browser.open(fixture('hidden/settle-carousel.html'));
    const id = await idByName('Open menu');
    const { text } = await timed(() => browser.click(id));
    expect(text).toContain('Menu ready');
  });
});

describe('settle ignores background polling', () => {
  it('does not wait for a polling chain that started before the action', async () => {
    await browser.open(fixture('hidden/settle-polling.html'));
    const id = await idByName('Change now');
    const { text, ms } = await timed(() => browser.click(id));
    expect(text).toContain('Changed now');
    expect(ms).toBeLessThan(800);
  });

  it('still waits for a timer the click itself started (near miss)', async () => {
    await browser.open(fixture('hidden/settle-polling.html'));
    const id = await idByName('Save later');
    const { text } = await timed(() => browser.click(id));
    expect(text).toContain('Saved');
  });
});

describe('covered clicks fail fast', () => {
  it('names the overlay and the close button instead of waiting out the timeout', async () => {
    await browser.open(fixture('hidden/covered-click.html'));
    const buy = await idByName('Buy now');
    const close = await idByName('Close');
    const { text, ms } = await timed(() => browser.click(buy));
    expect(text).toMatch(/^error: .*covered/);
    expect(text).toContain('modal-overlay');
    expect(text).toContain(`#${close}`);
    expect(ms).toBeLessThan(1500);
    expect(await browser.read()).not.toContain('Bought');
  });

  it('does not call a click on a child of the target, or a wrapper, covered (near miss)', async () => {
    await browser.open(fixture('hidden/covered-click.html') + '?plain');
    const id = await idByName('Star Favourite');
    // The center of the button is a child <span>; the button sits inside a <label>.
    expect(await browser.click(id)).not.toMatch(/covered|error/);
    expect(await browser.read()).toContain('Inner clicked');
  });

  it('still clicks when the cover goes away within a moment', async () => {
    await browser.open(fixture('hidden/covered-click.html') + '?brief');
    const id = await idByName('Buy now');
    const page = await pageOf();
    await page.evaluate(() => (window as unknown as { coverBriefly(): void }).coverBriefly());
    const res = await browser.click(id);
    expect(res).toMatch(/^clicked/);
    expect(await browser.read()).toContain('Bought');
  });
});

describe('painted non-interactive veils', () => {
  it('waits briefly for a busy panel veil to clear, then clicks normally', async () => {
    await browser.open(fixture('hidden/panel-veil.html'));
    const id = await idByName('Continue');
    const page = await pageOf();
    await page.evaluate(() => (window as unknown as { armClearingVeil(): void }).armClearingVeil());
    const { text, ms } = await timed(() => browser.click(id));
    expect(text).toMatch(/^clicked/);
    expect(ms).toBeGreaterThanOrEqual(900);
    expect(ms).toBeLessThan(1900);
    expect(await browser.read()).toContain('Continued');
  });

  it('explains a persistent veil and gives a link destination without dismissal advice', async () => {
    await browser.open(fixture('hidden/panel-veil.html') + '?persistent');
    const id = await idByName('Details');
    const { text, ms } = await timed(() => browser.click(id));
    expect(text).toMatch(/^error: .*non-dismissible layer/);
    expect(text).toContain('nothing to dismiss');
    expect(text).toContain('href file:///');
    expect(text).toContain('direct-destination');
    expect(text).toContain('open("file:///');
    expect(text).not.toContain('dismiss that first');
    expect(ms).toBeGreaterThanOrEqual(1200);
    expect(ms).toBeLessThan(2000);
  });

  it('still blocks a dialog and names its Dismiss control (near miss)', async () => {
    await browser.open(fixture('hidden/panel-veil.html') + '?dialog');
    const id = await idByName('Continue');
    const dismiss = await idByName('Dismiss');
    const { text, ms } = await timed(() => browser.click(id));
    expect(text).toMatch(/^error: .*covered/);
    expect(text).toContain(`try #${dismiss} "Dismiss"`);
    expect(text).toContain('dismiss that first');
    expect(ms).toBeLessThan(1500);
    expect(await browser.read()).not.toContain('Continued');
  });
});

describe('covered click false positives', () => {
  it('does not call a control under a sticky header covered; it scrolls it clear', async () => {
    await browser.open(fixture('hidden/covered-layers.html'));
    const id = await idByName('Pick me');
    const page = await pageOf();
    // park the button just below the top of the viewport, so its center is under the 200px header
    await page.evaluate(() => scrollTo(0, document.getElementById('target')!.offsetTop - 80));
    const res = await browser.click(id);
    expect(res).toMatch(/^clicked/);
    expect(await browser.read()).toContain('Target clicked');
  });

  it('clicks through an invisible empty layer, also inside a pane with content elsewhere', async () => {
    for (const flag of ['', '?wrapped']) {
      await browser.open(fixture('hidden/covered-layers.html') + flag);
      const id = await idByName('Open result');
      const res = await browser.click(id);
      expect(res).toMatch(/^clicked/);
      expect(await browser.read()).toContain('Opened result');
    }
  });

  it('does not click through a persistent painted layer (near miss)', async () => {
    for (const flag of ['text', 'bg', 'scrim']) {
      await browser.open(`${fixture('hidden/covered-layers.html')}?${flag}`);
      const id = await idByName('Open result');
      const res = await browser.click(id);
      expect(res).toMatch(/^error: .*non-dismissible layer/);
      expect(await browser.read()).not.toContain('Opened result');
    }
  });
});

describe('stale ids', () => {
  it('follows a replaced control that has the same role and name', async () => {
    const id = idOf(await browser.open(fixture('hidden/stale-id.html')), 'button "Save draft"');
    const page = await pageOf();
    await page.evaluate(() => (window as unknown as { replaceButton(n: number): void }).replaceButton(1));
    const res = await browser.click(id);
    expect(res).toContain(`(was #${id}; the page re-rendered)`);
    expect(await browser.read()).toContain('Saved');
  });

  it('still errors when several controls match (near miss)', async () => {
    const id = idOf(await browser.open(fixture('hidden/stale-id.html')), 'button "Save draft"');
    const page = await pageOf();
    await page.evaluate(() => (window as unknown as { replaceButton(n: number): void }).replaceButton(2));
    expect(await browser.click(id)).toMatch(/^error: #\d+ no longer exists/);
    expect(await browser.read()).not.toContain('Saved');
  });
});
