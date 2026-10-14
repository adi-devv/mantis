import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MantisBrowser, createServer } from '../src/index.js';
import { pngSize } from '../src/fallback/look.js';
import { fixture, idOf } from './helpers.js';

let b: MantisBrowser;
beforeAll(() => { b = new MantisBrowser({ actionTimeoutMs: 1500 }); });
afterAll(async () => { await b.close(); });

/** Run script text in the active page (tests only; the agent never gets this). */
async function inPage(js: string): Promise<void> {
  const page = (b as unknown as { page: { evaluate: (f: string) => Promise<unknown> } }).page;
  await page.evaluate(js);
}

/** Number of the first media() line containing `needle`. */
function mediaId(list: string, needle: string): number {
  const line = list.split('\n').find((l) => l.includes(needle));
  const m = line?.match(/^#(\d+) /);
  if (!m) throw new Error(`"${needle}" not in media list:\n${list}`);
  return Number(m[1]);
}

describe('media()', () => {
  it('lists visible images, charts and canvases with numbers; skips icons and decoration', async () => {
    await b.open(fixture('media.html'));
    const list = await b.media();
    expect(list).toMatch(/^#\d+ image "logo\.svg" \(alt "Acme company logo", 120×60\)$/m);
    expect(list).toMatch(/^#\d+ image "logo\.svg" \(empty alt, 120×60\)$/m);
    expect(list).toMatch(/^#\d+ image "logo\.svg" \(no alt, 120×60\)$/m);
    expect(list).toMatch(/^#\d+ svg 300×150 "Revenue by quarter" \(3 text labels\)$/m);
    expect(list).toMatch(/^#\d+ canvas 200×100 "Plain canvas"$/m);
    expect(list).not.toContain('20×20'); // 20px icon image inside a link
    expect(list).not.toContain('16×16'); // tiny svg icon
  });

  it('shares number space with read(): numbers are unique and stable', async () => {
    const view = await b.open(fixture('media.html'));
    const buy = idOf(view, 'button "Buy"');
    const first = await b.media();
    const ids = [...first.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(buy);
    expect(await b.media()).toBe(first); // same elements keep their numbers
    expect(idOf(await b.read(), 'button "Buy"')).toBe(buy);
  });

  it('says so on a page without visuals', async () => {
    await b.open(fixture('login.html'));
    expect(await b.media()).toBe('no images, canvases or charts on this page');
  });
});

describe('data()', () => {
  it('returns alt, title, caption, filename and the largest srcset source for an <img>', async () => {
    await b.open(fixture('media.html'));
    const id = mediaId(await b.media(), 'alt "Acme company logo"');
    const out = await b.data({ id });
    expect(out).toContain('alt: Acme company logo');
    expect(out).toContain('title: Acme Inc.');
    expect(out).toContain('caption: Figure 1: The Acme logo, 2024 edition');
    expect(out).toContain('file: logo.svg');
    expect(out).toMatch(/largest source: .*logo-2x\.svg \(2x\)/);
  });

  it('flags missing and decorative alt text', async () => {
    await b.open(fixture('media.html'));
    expect(await b.data({ selector: '#bare' })).toContain('alt: (missing)');
    expect(await b.data({ selector: '#deco' })).toContain('alt: (empty');
  });

  it('collects <text>, <title> and <desc> from inline SVG', async () => {
    await b.open(fixture('media.html'));
    const id = mediaId(await b.media(), 'svg 300×150');
    const out = await b.data({ id });
    expect(out).toContain('title: Revenue by quarter');
    expect(out).toContain('desc: Bar chart: revenue grows each quarter');
    expect(out).toContain('text (3): Q1 | Q2 | Q3');
    expect(out).toContain('tooltips (1): Q1: 60');
    expect(out).toContain('aria-label: Quarterly revenue');
  });

  it('reads canvas fallback content and aria-label', async () => {
    await b.open(fixture('media.html'));
    const out = await b.data({ selector: '#plain' });
    expect(out).toContain('aria-label: Plain canvas');
    expect(out).toContain('fallback content: Fallback: traffic by hour');
  });

  it('reads Chart.js labels and datasets from memory', async () => {
    await b.open(fixture('chart.html'));
    const list = await b.media();
    expect(list).toMatch(/^#\d+ canvas 500×250 \(Chart\.js detected\)$/m);
    const out = await b.data({ id: mediaId(list, 'canvas 500×250') });
    expect(out).toContain('Chart.js bar chart "Q1 numbers"');
    expect(out).toContain(' | Sales | Cost');
    expect(out).toContain('Jan | 10 | 5');
    expect(out).toContain('Feb | 20 | 8');
    expect(out).toContain('Mar | 30 | 13');
    expect(out.length).toBeLessThanOrEqual(1500);
  });

  it('works through a container around the chart too (selector on <main>)', async () => {
    await b.open(fixture('chart.html'));
    expect(await b.data({ selector: 'main' })).toContain('Jan | 10 | 5');
  });

  it('caps long output at ~1500 chars', async () => {
    await b.open(fixture('chart.html'));
    await inPage(`
      const ch = Chart.getChart(document.getElementById('c'));
      ch.data.labels = Array.from({ length: 400 }, (_, i) => 'Label number ' + i);
      ch.data.datasets[0].data = Array.from({ length: 400 }, (_, i) => i * 3);
      ch.data.datasets[1].data = Array.from({ length: 400 }, (_, i) => i * 7);
      ch.update();
    `);
    const out = await b.data({ selector: '#c' });
    expect(out.length).toBeLessThanOrEqual(1500);
    expect(out).toMatch(/…\d+ more rows|…$/);
    expect(out).toContain('Label number 0 | 0 | 0');
  });

  it('points to ocr/look when nothing is found', async () => {
    await b.open(fixture('bigcanvas.html'));
    const out = await b.data({ selector: '#small' });
    expect(out).toContain('no hidden text or chart data found');
    expect(out).toContain('ocr(id)');
    expect(out).toContain('look(id)');
  });

  it('gives plain errors for bad targets', async () => {
    await b.open(fixture('media.html'));
    expect(await b.data({ id: 9999 })).toMatch(/^error: no element #9999/);
    expect(await b.data({ selector: '#nope' })).toMatch(/^error: nothing matches selector "#nope"/);
    expect(await b.data({ selector: '[[' })).toMatch(/^error: invalid CSS selector/);
    expect(await b.data({})).toMatch(/^error: give an element number/);
  });
});

describe('look()', () => {
  it('returns a PNG of just that element', async () => {
    await b.open(fixture('bigcanvas.html'));
    const r = await b.look({ selector: '#small' });
    if ('error' in r) throw new Error(r.error);
    expect(r.png.subarray(0, 4).toString('hex')).toBe('89504e47');
    expect(pngSize(r.png)).toEqual({ width: 200, height: 100 });
    expect(r.text).toContain('200×100 PNG');
  });

  it('downscales anything bigger than 800px on its longest side', async () => {
    await b.open(fixture('bigcanvas.html'));
    const r = await b.look({ selector: '#big' });
    if ('error' in r) throw new Error(r.error);
    expect(pngSize(r.png)).toEqual({ width: 800, height: 500 });
  });

  it('accepts a media() number', async () => {
    await b.open(fixture('bigcanvas.html'));
    const id = mediaId(await b.media(), 'canvas 200×100');
    const r = await b.look({ id });
    if ('error' in r) throw new Error(r.error);
    expect(pngSize(r.png).width).toBe(200);
  });

  it('reports errors as text', async () => {
    await b.open(fixture('bigcanvas.html'));
    expect(await b.look({ id: 4242 })).toEqual({ error: expect.stringMatching(/^error: no element #4242/) });
  });
});

describe('ocr()', () => {
  it('reads text rendered into a canvas', async (ctx) => {
    await b.open(fixture('ocr.html'));
    const out = await b.ocr({ selector: '#c' });
    if (/could not be downloaded|OCR is unavailable/.test(out)) {
      ctx.skip(`tesseract language data unavailable in this environment: ${out.slice(0, 160)}`);
    }
    expect(out).toMatch(/^ocr "#c" \(confidence \d+%/);
    expect(out.toUpperCase()).toContain('HELLO MANTIS');
    expect(out.toUpperCase()).toContain('INVOICE 2024');
  }, 120_000);

  it('fails with a plain error for a missing element (no OCR needed)', async () => {
    await b.open(fixture('ocr.html'));
    expect(await b.ocr({ selector: '#nope' })).toMatch(/^error: nothing matches/);
  });
});

describe('CAPTCHA detection in read()', () => {
  it('appends a warning for a reCAPTCHA widget', async () => {
    const view = await b.open(fixture('captcha.html'));
    expect(view.split('\n').at(-1)).toBe('⚠ CAPTCHA detected — call ask_human("captcha")');
    expect(await b.read()).toContain('⚠ CAPTCHA detected');
  });

  it.each(['h-captcha', 'cf-turnstile'])('detects .%s', async (cls) => {
    await b.open(fixture('login.html'));
    await inPage(`(() => { const d = document.createElement('div'); d.className = '${cls}'; d.style.height = '60px'; document.body.append(d); })()`);
    expect(await b.read()).toContain('⚠ CAPTCHA detected');
  });

  it('detects a CAPTCHA iframe by its source', async () => {
    await b.open(fixture('login.html'));
    await inPage(`(() => { const f = document.createElement('iframe'); f.src = 'https://www.google.com/recaptcha/api2/anchor?k=x'; f.width = 300; f.height = 80; document.body.append(f); })()`);
    expect(await b.read()).toContain('⚠ CAPTCHA detected');
  });

  it('does not warn on invisible reCAPTCHA or on pages without one', async () => {
    expect(await b.open(fixture('invisible-captcha.html'))).not.toContain('CAPTCHA');
    expect(await b.open(fixture('login.html'))).not.toContain('CAPTCHA');
  });
});

describe('ask_human()', () => {
  beforeAll(() => { process.env.MANTIS_ASK_HUMAN_HEADLESS = '1'; });
  afterAll(() => { delete process.env.MANTIS_ASK_HUMAN_HEADLESS; });

  it('resolves when selector_gone:<css> is satisfied and returns the page view', async () => {
    await b.open(fixture('human.html'));
    const t0 = Date.now();
    const out = await b.askHuman('captcha', 'selector_gone:#gate', 10);
    expect(Date.now() - t0).toBeGreaterThan(300);
    expect(out).toMatch(/^human step done \(captcha\)/);
    expect(out).toContain('button "Continue"');
    expect(out).not.toContain('Checking you are human');
  });

  it('resolves on selector_present:<css>', async () => {
    await b.open(fixture('human.html'));
    const out = await b.askHuman('login', 'selector_present:#later', 10);
    expect(out).toMatch(/^human step done \(login\)/);
    expect(out).toContain('button "Welcome back"');
  });

  it('resolves on url_change', async () => {
    await b.open(fixture('human.html'));
    await inPage('setTimeout(() => { location.hash = "#done"; }, 400)');
    const out = await b.askHuman('2fa', 'url_change', 10);
    expect(out).toMatch(/^human step done \(2fa\)/);
    expect(out).toContain('#done');
  });

  it('by default also resolves when the page contents change significantly', async () => {
    await b.open(fixture('login.html'));
    await inPage(`setTimeout(() => { document.body.innerHTML = '<main><button>Alpha</button><button>Beta</button><button>Gamma</button></main>'; }, 600)`);
    const out = await b.askHuman('payment', undefined, 10);
    expect(out).toMatch(/^human step done \(payment\)/);
    expect(out).toContain('button "Gamma"');
  });

  it('times out with clear text', async () => {
    await b.open(fixture('login.html'));
    const out = await b.askHuman('captcha', 'selector_present:#never', 1);
    expect(out).toMatch(/^error: timed out after 1s waiting for "#never" to appear \(captcha\)/);
  });

  it('rejects unknown conditions and bad selectors', async () => {
    await b.open(fixture('login.html'));
    expect(await b.askHuman('x', 'whenever', 1)).toMatch(/^error: unknown until "whenever"/);
    expect(await b.askHuman('x', 'selector_gone:[[', 1)).toMatch(/^error: invalid CSS selector/);
  });
});

describe('over MCP', () => {
  const client = new Client({ name: 'test', version: '0' });
  const mcp = new MantisBrowser({ actionTimeoutMs: 1500 });
  beforeAll(async () => {
    const [a, z] = InMemoryTransport.createLinkedPair();
    await Promise.all([createServer(mcp).connect(a), client.connect(z)]);
  });
  afterAll(async () => {
    await client.close();
    await mcp.close();
  });

  it('look returns an image content block; data/media return only text', async () => {
    await client.callTool({ name: 'open', arguments: { url: fixture('bigcanvas.html') } });
    const look = await client.callTool({ name: 'look', arguments: { selector: '#big' } });
    const content = look.content as { type: string; data?: string; mimeType?: string }[];
    expect(content[0].type).toBe('image');
    expect(content[0].mimeType).toBe('image/png');
    expect(pngSize(Buffer.from(content[0].data!, 'base64'))).toEqual({ width: 800, height: 500 });
    expect(content[1].type).toBe('text');

    for (const name of ['media', 'data']) {
      const res = await client.callTool({ name, arguments: name === 'data' ? { selector: '#small' } : {} });
      expect((res.content as { type: string }[]).every((c) => c.type === 'text')).toBe(true);
    }
    const bad = await client.callTool({ name: 'look', arguments: { selector: '#nope' } });
    expect(bad.isError).toBe(true);
  });

  it('registers the ladder in order, with look flagged as last resort', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name);
    expect(names.slice(-5)).toEqual(['media', 'data', 'ocr', 'look', 'ask_human']);
    expect(tools.find((t) => t.name === 'look')!.description).toMatch(/LAST RESORT/);
  });
});
