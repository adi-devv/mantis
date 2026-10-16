import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { MantisBrowser, SiteMemory, createServer, originOf, regionSignature } from '../src/index.js';
import type { RegionInfo } from '../src/index.js';
import { MEMORY_TTL_MS, describeItems, idRange, isCollapsible, knownLayoutLine, sameAsBeforeLine } from '../src/memory.js';
import { estimateTokens } from '../src/translate.js';
import { fixture } from './helpers.js';

const page = (n: 1 | 2 | 3): string => fixture(`site/page${n}.html`);
const idOfLink = (view: string, name: string): number => Number(new RegExp(`#(\\d+) link "${name}"`).exec(view)![1]);

let dir: string;
const opened: MantisBrowser[] = [];
/** A browser with site memory switched on, storing into this test's temp dir. */
const mantis = (extra: { memory?: boolean; memoryDir?: string } = {}): MantisBrowser => {
  const b = new MantisBrowser({ actionTimeoutMs: 1500, memory: true, memoryDir: dir, ...extra });
  opened.push(b);
  return b;
};
const storedFiles = (): string[] => {
  try { return readdirSync(dir).filter((f) => f.endsWith('.json')); } catch { return []; }
};
/** Run `fn` with MANTIS_MEMORY / MANTIS_MEMORY_DIR set, then restore them. */
async function withEnv(env: { MANTIS_MEMORY: string; MANTIS_MEMORY_DIR: string }, fn: () => Promise<void>): Promise<void> {
  const saved = { m: process.env.MANTIS_MEMORY, d: process.env.MANTIS_MEMORY_DIR };
  process.env.MANTIS_MEMORY = env.MANTIS_MEMORY;
  process.env.MANTIS_MEMORY_DIR = env.MANTIS_MEMORY_DIR;
  try {
    await fn();
  } finally {
    if (saved.m === undefined) delete process.env.MANTIS_MEMORY; else process.env.MANTIS_MEMORY = saved.m;
    if (saved.d === undefined) delete process.env.MANTIS_MEMORY_DIR; else process.env.MANTIS_MEMORY_DIR = saved.d;
  }
}

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'mantis-mem-')); });
afterEach(async () => {
  await Promise.all(opened.splice(0).map((b) => b.close()));
  rmSync(dir, { recursive: true, force: true });
});

describe('session memory', () => {
  it('collapses header, nav and footer the second time, with their number ranges; main stays in full', async () => {
    const b = mantis();
    const first = await b.open(page(1));
    expect(first).toContain('#1 link "Acme Home"');
    expect(first).toContain('#5 link "Overview"');
    expect(first).toContain('#18 link "Security"');
    expect(first).not.toContain('same as before');

    const res = await b.click(idOfLink(first, 'Next: products'));
    expect(res).toContain('Page: Products - Acme');
    expect(res).toContain('[header] same as before — 4 links (#1–#4); read({region: "header"}) to expand');
    expect(res).toContain('[nav "Primary"] same as before — 8 links (#5–#12); read({region: "nav Primary"}) to expand');
    expect(res).toContain('[footer] same as before — 4 links (#15–#18); read({region: "footer"}) to expand');
    // the chrome is gone from the text, main is complete
    expect(res).not.toContain('"Overview"');
    expect(res).not.toContain('Terms of service');
    expect(res).toContain('[main]\n  # Products\n  #13 link "Next: pricing"\n  #14 link "Back to welcome"');
    expect(estimateTokens(await b.open(page(2)))).toBeLessThan(estimateTokens(first));
  });

  it('the numbers in a collapsed range still belong to that region and still work', async () => {
    const b = mantis();
    const first = await b.open(page(1));
    const second = await b.click(idOfLink(first, 'Next: products'));
    expect(second).toContain('(#5–#12)');
    const nav = await b.read({ region: 'nav' });
    expect(nav).toContain('#5 link "Overview"');
    expect(nav).toContain('#12 link "Careers"');
    const res = await b.click(8); // "Changelog", inside the collapsed range
    expect(res).toMatch(/^clicked #8 link "Changelog"/);
  });

  it('a changed nav (one extra link) is shown in full, the unchanged parts stay collapsed', async () => {
    const b = mantis();
    const v1 = await b.open(page(1));
    await b.click(idOfLink(v1, 'Next: products'));
    const v3 = await b.open(page(3));
    expect(v3).toContain('[header] same as before');
    expect(v3).toContain('[footer] same as before');
    expect(v3).not.toContain('[nav "Primary"] same as before');
    expect(v3).toContain('#10 "Blog" · #11 "Community" · #12 "Careers" · #13 "Roadmap"'); // 9 links now
    expect(v3).toContain('#5 link "Overview"');
  });

  it('never collapses main, even for an identical page', async () => {
    const b = mantis();
    await b.open(page(1));
    const again = await b.open(page(1));
    expect(again).toContain('[header] same as before');
    expect(again).toContain('[main]\n  # Welcome\n  #13 link "Next: products"\n  #14 button "Subscribe"');
  });

  it('never collapses a dialog', async () => {
    const b = mantis();
    await b.open(page(1));
    const v = await b.open(fixture('site/dialog.html'));
    expect(v).toContain('[header] same as before');
    expect(v).toContain('[dialog "Cookies" — covers page]');
    expect(v).toContain('button "Accept all"');
    expect(v).toContain('button "Reject all"');
    // and it is not turned into a summary on the next visit either
    const again = await b.open(fixture('site/dialog.html'));
    expect(again).toContain('button "Accept all"');
  });

  it('never collapses a region holding the focused field', async () => {
    const b = mantis();
    await b.open(fixture('site/search.html'));
    const again = await b.open(fixture('site/search.html'));
    expect(again).toContain('[nav "Primary"] same as before');
    expect(again).toContain('[header]\n');
    expect(again).toContain('searchbox "Search the site"');
    expect(again).not.toContain('[header] same as before');
  });

  it('never collapses a region holding a live message', async () => {
    const b = mantis();
    await b.open(fixture('site/alert.html'));
    const again = await b.open(fixture('site/alert.html'));
    expect(again).toContain('[header] same as before');
    expect(again).toContain('Your session expires in 5 minutes');
    expect(again).not.toContain('[contentinfo] same as before');
  });

  it('does not touch the diff an action returns', async () => {
    const b = mantis();
    await b.open(page(1));
    const v = await b.read();
    expect(v).toContain('same as before');
    const res = await b.click(14); // Subscribe: does nothing
    expect(res).not.toContain('same as before');
  });
});

describe('bypassing memory', () => {
  it('read({full}), read({region}) and read({fresh}) show everything; the next plain read is collapsed again', async () => {
    const b = mantis();
    await b.open(page(1));
    expect(await b.read()).toContain('[nav "Primary"] same as before');

    const full = await b.read({ full: true });
    expect(full).not.toContain('same as before');
    expect(full).toContain('#5 link "Overview"');
    expect(full).toContain('#15 link "Terms of service"');

    const region = await b.read({ region: 'footer' });
    expect(region).not.toContain('same as before');
    expect(region).toContain('#18 link "Security"');

    const fresh = await b.read({ fresh: true });
    expect(fresh).not.toContain('same as before');
    expect(fresh).toContain('#1 link "Acme Home"');
    expect(fresh).toContain('#12 link "Careers"');

    expect(await b.read()).toContain('[nav "Primary"] same as before');
  });

  it('MANTIS_MEMORY=0 disables everything: no collapsing, nothing written', async () => {
    await withEnv({ MANTIS_MEMORY: '0', MANTIS_MEMORY_DIR: dir }, async () => {
      const b = new MantisBrowser({ actionTimeoutMs: 1500 });
      opened.push(b);
      await b.open(page(1));
      const again = await b.open(page(1));
      expect(again).not.toContain('same as before');
      expect(again).toContain('#5 link "Overview"');
      expect(storedFiles()).toEqual([]);
    });
  });

  it('the memory option wins over the environment; MANTIS_MEMORY_DIR picks the store', async () => {
    await withEnv({ MANTIS_MEMORY: '1', MANTIS_MEMORY_DIR: dir }, async () => {
      const off = new MantisBrowser({ actionTimeoutMs: 1500, memory: false });
      opened.push(off);
      await off.open(page(1));
      expect(await off.read()).not.toContain('same as before');
      expect(storedFiles()).toEqual([]);

      const on = new MantisBrowser({ actionTimeoutMs: 1500 }); // on by environment
      opened.push(on);
      await on.open(page(1));
      expect(await on.read()).toContain('same as before');
      expect(storedFiles()).toHaveLength(1);
    });
  });
});

describe('persistent memory', () => {
  it('a new session shows known chrome as "(known layout)" with names it can act on', async () => {
    const a = mantis();
    await a.open(page(1));
    await a.close();

    const b = mantis();
    const v = await b.open(page(2));
    const header = v.split('\n').find((l) => l.startsWith('[header]'))!;
    expect(header).toBe('[header] (known layout) — 4 links: Acme Home · Products · Pricing · Support (#1–#4)');
    const nav = v.split('\n').find((l) => l.startsWith('[nav'))!;
    expect(nav).toMatch(/^\[nav "Primary"\] \(known layout\) — 8 links: Overview · Guides · API Reference · .*…\(#5–#12\)$/);
    expect(nav.length).toBeLessThanOrEqual(130);
    expect(v).toContain('[main]\n  # Products');
    expect(v).not.toContain('same as before');
    // an agent can act on a name it was shown without expanding
    expect(v).not.toContain('#1 link');
    const res = await b.click(2);
    expect(res).toMatch(/^clicked #2 link "Products"/);
  });

  it('known layout stays until the agent has really seen the region, then "same as before"', async () => {
    const a = mantis();
    await a.open(page(1));
    await a.close();

    const b = mantis();
    await b.open(page(1));
    expect(await b.read()).toContain('[header] (known layout)');
    await b.read({ region: 'header' }); // the agent looks at it
    const v = await b.read();
    expect(v).toContain('[header] same as before — 4 links (#1–#4)');
    expect(v).toContain('[footer] (known layout)');
  });

  it('a changed region in a new session is shown in full', async () => {
    const a = mantis();
    await a.open(page(1));
    await a.close();
    const b = mantis();
    const v = await b.open(page(3));
    expect(v).toContain('[header] (known layout)');
    expect(v).not.toContain('[nav "Primary"] (known layout)');
    expect(v).toContain('#10 "Blog" · #11 "Community" · #12 "Careers" · #13 "Roadmap"');
    expect(await b.read({ region: 'nav', full: true })).toContain('#13 link "Roadmap"');
  });

  it('stores hashes, counts and timestamps only: no page text, names, values or URLs', async () => {
    const a = mantis();
    await a.open(page(1));
    await a.open(page(3));
    await a.close();
    const files = storedFiles();
    expect(files).toHaveLength(1); // one origin (all local files)
    const raw = readFileSync(join(dir, files[0]), 'utf8');
    for (const text of ['Overview', 'Guides', 'Acme', 'Home', 'Terms of service', 'Roadmap', 'Welcome', 'page1', 'file:', 'D:', 'header', 'nav', 'link']) {
      expect(raw).not.toContain(text);
    }
    const data = JSON.parse(raw) as { v: number; regions: Record<string, { n: number; t: number }> };
    expect(data.v).toBe(1);
    const sigs = Object.entries(data.regions);
    expect(sigs.length).toBeGreaterThanOrEqual(4); // header, footer, nav (two variants)
    for (const [sig, e] of sigs) {
      expect(sig).toMatch(/^[0-9a-f]{24}$/);
      expect(Object.keys(e).sort()).toEqual(['n', 't']);
      expect(Number.isInteger(e.n)).toBe(true);
      expect(e.t).toBeGreaterThan(Date.now() - 60_000);
    }
    expect(files[0]).toMatch(/^[0-9a-f]{24}\.json$/); // the file name is a hash of the origin too
  });

  it('entries older than 30 days are ignored', async () => {
    const a = mantis();
    await a.open(page(1));
    await a.close();
    const file = join(dir, storedFiles()[0]);
    const data = JSON.parse(readFileSync(file, 'utf8')) as { v: number; regions: Record<string, { n: number; t: number }> };
    for (const e of Object.values(data.regions)) e.t = Date.now() - MEMORY_TTL_MS - 60_000;
    writeFileSync(file, JSON.stringify(data));
    const b = mantis();
    const v = await b.open(page(2));
    expect(v).not.toContain('known layout');
    expect(v).toContain('#1 link "Acme Home"');
  });

  it('a corrupt file is ignored silently and replaced by a good one', async () => {
    const probe = new SiteMemory({ dir, enabled: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(probe.file('file://'), '{{{ not json \u0000');
    const b = mantis();
    const v = await b.open(page(1));
    expect(v).toContain('#1 link "Acme Home"');
    expect(v).not.toContain('error');
    expect(await b.read()).toContain('same as before'); // session memory works regardless
    expect(() => JSON.parse(readFileSync(probe.file('file://'), 'utf8'))).not.toThrow();
  });

  it('a file with the wrong shape is ignored', async () => {
    const probe = new SiteMemory({ dir, enabled: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(probe.file('file://'), JSON.stringify({ v: 1, regions: { abc: 'x', '0123456789abcdef01234567': { n: 'many', t: 'now' } } }));
    const b = mantis();
    const v = await b.open(page(1));
    expect(v).toContain('#1 link "Acme Home"');
  });

  it('an unwritable memory dir never breaks reading', async () => {
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'a file where the directory should be');
    const b = mantis({ memoryDir: join(blocker, 'sub') });
    const v = await b.open(page(1));
    expect(v).toContain('#1 link "Acme Home"');
    expect(await b.read()).toContain('same as before'); // this session still remembers
  });
});

describe('forget', () => {
  it('clears session and disk memory for the current site', async () => {
    const b = mantis();
    await b.open(page(1));
    expect(await b.read()).toContain('same as before');
    expect(storedFiles()).toHaveLength(1);

    const msg = await b.forget();
    expect(msg).toMatch(/^forgot everything remembered about/);
    expect(storedFiles()).toEqual([]);
    const v = await b.read();
    expect(v).not.toContain('same as before');
    expect(v).toContain('#5 link "Overview"');
    // the read above learned the layout again, so forget once more before checking a new session
    await b.forget();
    await b.close();
    const c = mantis();
    expect(await c.open(page(2))).not.toContain('known layout');
  });

  it('says so when memory is off or no site is open', async () => {
    const off = mantis({ memory: false });
    await off.open(page(1));
    expect(await off.forget()).toMatch(/memory is off/);
    const blank = mantis();
    expect(await blank.forget()).toMatch(/no site is open/);
  });
});

describe('over MCP', () => {
  it('forget is a tool and read takes an optional fresh flag', async () => {
    const browser = mantis();
    const client = new Client({ name: 'test', version: '0' });
    const [x, y] = InMemoryTransport.createLinkedPair();
    await Promise.all([createServer(browser).connect(x), client.connect(y)]);
    try {
      const call = async (name: string, args: Record<string, unknown> = {}) =>
        ((await client.callTool({ name, arguments: args })).content as { text: string }[])[0].text;
      const { tools } = await client.listTools();
      const readTool = tools.find((t) => t.name === 'read')!;
      expect(Object.keys((readTool.inputSchema as { properties: object }).properties)).toContain('fresh');
      expect((readTool.inputSchema as { required?: string[] }).required ?? []).not.toContain('fresh');

      await call('open', { url: page(1) });
      expect(await call('read')).toContain('same as before');
      expect(await call('read', { fresh: true })).not.toContain('same as before');
      expect(await call('forget')).toMatch(/^forgot/);
      expect(await call('read')).not.toContain('same as before');
    } finally {
      await client.close();
    }
  });
});

// ---- pure functions ---------------------------------------------------------------

const region = (over: Partial<RegionInfo> = {}): RegionInfo => ({
  index: 0,
  role: 'nav',
  name: '',
  lines: ['[nav]', '  #3 link "Home"', '  #4 link "Pricing"', '  #5 link "Docs"'],
  items: [
    { id: 3, role: 'link', name: 'Home', inferred: false },
    { id: 4, role: 'link', name: 'Pricing', inferred: false },
    { id: 5, role: 'link', name: 'Docs', inferred: false },
  ],
  blocked: false,
  ...over,
});

describe('memory helpers', () => {
  it('signatures ignore ids but not content', () => {
    const a = region();
    const shifted = region({ lines: ['[nav]', '  #13 link "Home"', '  #14 link "Pricing"', '  #15 link "Docs"'] });
    const renamed = region({ lines: ['[nav]', '  #3 link "Home"', '  #4 link "Plans"', '  #5 link "Docs"'] });
    const extra = region({ lines: [...a.lines, '  #6 link "Blog"'] });
    const other = region({ role: 'footer', lines: ['[footer]', ...a.lines.slice(1)] });
    expect(regionSignature(shifted)).toBe(regionSignature(a));
    expect(regionSignature(renamed)).not.toBe(regionSignature(a));
    expect(regionSignature(extra)).not.toBe(regionSignature(a));
    expect(regionSignature(other)).not.toBe(regionSignature(a));
    expect(regionSignature(a)).toMatch(/^[0-9a-f]{24}$/);
  });

  it('only big, ordinary regions are worth collapsing', () => {
    expect(isCollapsible(region())).toBe(true);
    expect(isCollapsible(region({ blocked: true }))).toBe(false);
    expect(isCollapsible(region({ lines: ['[nav]', '  #3 link "Home"', '  #4 link "Docs"'] }))).toBe(false);
  });

  it('never hides a search box or text input behind a summary', () => {
    for (const role of ['searchbox', 'textbox', 'combobox']) {
      const withInput = region({ items: [...region().items, { id: 6, role, name: 'Search', inferred: false }] });
      expect(isCollapsible(withInput)).toBe(false);
    }
  });

  it('describes items and number ranges', () => {
    expect(idRange(region().items)).toBe('(#3–#5)');
    expect(idRange([{ id: 9, role: 'link', name: 'x', inferred: false }])).toBe('(#9)');
    expect(idRange([])).toBe('');
    const mixed = region({ items: [...region().items, { id: 6, role: 'searchbox', name: 'Search', inferred: false }] });
    expect(describeItems(mixed)).toBe('3 links, 1 searchbox');
    expect(describeItems(region({ items: [], lines: ['[footer]', 'a', 'b', 'c'] }))).toBe('3 lines of text');
  });

  it('writes both summary forms', () => {
    expect(sameAsBeforeLine(region())).toBe('[nav] same as before — 3 links (#3–#5); read({region: "nav"}) to expand');
    expect(knownLayoutLine(region())).toBe('[nav] (known layout) — 3 links: Home · Pricing · Docs (#3–#5)');
    const many = region({ items: Array.from({ length: 30 }, (_, i) => ({ id: i + 3, role: 'link', name: `Section number ${i}`, inferred: i === 1 })) });
    const line = knownLayoutLine(many);
    expect(line).toMatch(/^\[nav\] \(known layout\) — 30 links: Section number 0 · ~Section number 1 · .* · …\(#3–#32\)$/);
    expect(line.length).toBeLessThanOrEqual(120);
  });

  it('keeps sites apart', () => {
    const m = new SiteMemory({ dir, enabled: true });
    const r = region();
    m.hook('https://a.example')!.shown([r], []);
    expect(m.hook('https://a.example')!.collapse([r])[0]?.join(' ')).toContain('same as before');
    expect(m.hook('https://b.example')!.collapse([r])[0]).toBeNull();
    expect(m.hook('https://a.example')!.collapse([region({ blocked: true })])[0]).toBeNull();
  });

  it('expiry follows the injected clock', () => {
    let now = 1_000_000_000_000;
    const first = new SiteMemory({ dir, enabled: true, now: () => now });
    first.hook('https://a.example')!.shown([region()], []);
    now += MEMORY_TTL_MS - 1000;
    const stillKnown = new SiteMemory({ dir, enabled: true, now: () => now });
    expect(stillKnown.hook('https://a.example')!.collapse([region()])[0]?.join(' ')).toContain('known layout');
    now += 2000;
    const expired = new SiteMemory({ dir, enabled: true, now: () => now });
    expect(expired.hook('https://a.example')!.collapse([region()])[0]).toBeNull();
  });

  it('only http(s) and file pages have a site', () => {
    expect(originOf('https://example.com/a/b?q=1')).toBe('https://example.com');
    expect(originOf('http://localhost:3000/x')).toBe('http://localhost:3000');
    expect(originOf('file:///a/b.html')).toBe('file://');
    expect(originOf('about:blank')).toBeNull();
    expect(originOf('chrome-error://chromewebdata/')).toBeNull();
    expect(originOf('not a url')).toBeNull();
  });
});
