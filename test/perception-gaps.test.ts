import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { fixture } from './helpers.js';

let browser: MantisBrowser;
beforeAll(() => { browser = new MantisBrowser({ actionTimeoutMs: 1500 }); });
afterAll(async () => { await browser.close(); });

describe('generic perception', () => {
  it('numbers delegated plain options and row buttons, and each id clicks its own choice', async () => {
    await browser.open(fixture('percept-choices.html'));
    const choices = ['Last week', 'Last month', 'All time', 'Short range', 'Long range', 'Day', 'Week', 'Month'];
    const snap = await browser.snapshot();
    const view = await browser.read();
    for (const choice of choices) {
      const node = snap.nodes.find((n) => n.kind === 'interactive' && n.name === choice);
      expect(node?.id, choice).toBeTypeOf('number');
      expect(view, choice).toContain(`#${node!.id}`);
      expect(view, choice).toContain(choice);
      await browser.click(node!.id!);
      expect((await browser.read())).toContain(`Chosen: ${choice}`);
    }
  });

  it('shows named ratings once and preserves existing control names before hints', async () => {
    await browser.open(fixture('percept-labels.html'));
    const snap = await browser.snapshot();
    const names = snap.nodes.map((n) => n.name);
    for (const rating of ['4.5 out of 5 stars', 'Rated 3 stars', '5 star rating', 'Rated 2 stars', 'Customer rating: 4 out of 5']) {
      expect(names.filter((n) => n.includes(rating)), rating).toHaveLength(1);
    }
    expect(snap.nodes.find((n) => n.kind === 'interactive' && n.name === 'Details')?.inferred).toBeUndefined();
    expect(names.some((n) => n.includes('Details 4 stars'))).toBe(false);
    expect(snap.nodes.find((n) => n.kind === 'interactive' && n.name === 'Save item')?.inferred).toBeUndefined();
    expect(snap.nodes.find((n) => n.kind === 'interactive' && n.name === 'Share')?.inferred).toBe(true);
    expect(snap.nodes.find((n) => n.kind === 'interactive' && n.name === 'settings')?.inferred).toBe(true);
    expect(snap.nodes.some((n) => n.kind === 'interactive' && n.name === 'Atlas lamp button' && n.inferred)).toBe(true);
    expect(snap.nodes.some((n) => n.kind === 'interactive' && n.name === 'Catalog button' && n.inferred)).toBe(true);
    expect(names.filter((n) => n === 'button 1 of 2' || n === 'button 2 of 2')).toHaveLength(2);
    const separated = snap.nodes.filter((n) => n.kind === 'interactive').slice(-2);
    expect(separated.map((n) => n.name)).toEqual([expect.stringMatching(/^button \d+$/), expect.stringMatching(/^button \d+$/)]);
    expect(separated[0]!.name).not.toBe(separated[1]!.name);
  });
});

describe('controls inside opacity:0 wrappers', () => {
  it('numbers an operable native select whose wrapper is opacity:0', async () => {
    const b = new MantisBrowser();
    try {
      const view = await b.open(fixture('percept-opacity-controls.html'));
      const snap = await b.snapshot();
      const sort = snap.nodes.find((n) => n.kind === 'interactive' && n.role === 'combobox');
      expect(sort?.name).toBe('Sort by');
      expect(sort?.value).toBe('Bestseller');
      expect(sort?.options).toEqual(['Bestseller', 'Newest', 'Price']);
      expect(sort?.states).not.toContain('looks disabled');
      expect(view).toMatch(new RegExp(`#${sort!.id} combobox "Sort by"`));
    } finally { await b.close(); }
  });

  it('keeps covered, pointer-events:none, visibility:hidden and aria-hidden fading controls hidden', async () => {
    const b = new MantisBrowser();
    try {
      const view = await b.open(fixture('hidden/percept-opacity-covered.html'));
      const snap = await b.snapshot();
      const names = snap.nodes.map((n) => n.name);
      for (const hidden of ['Covered email', 'Inert wrapper', 'Invisible wrapper', 'Hidden by aria', 'Fading button']) {
        expect(names.some((n) => n.includes(hidden)), hidden).toBe(false);
        expect(view, hidden).not.toContain(hidden);
      }
      expect(view).not.toContain('Secret fading words');
      expect(snap.nodes.filter((n) => n.kind === 'interactive')).toHaveLength(0);
    } finally { await b.close(); }
  });
});

describe('interactive items inside a live region', () => {
  it('numbers menuitemradio items of an aria-live menu with their checked state', async () => {
    const b = new MantisBrowser();
    try {
      const view = await b.open(fixture('percept-live-menu.html'));
      const snap = await b.snapshot();
      const items = snap.nodes.filter((n) => n.kind === 'interactive' && n.role === 'menuitemradio');
      expect(items.map((n) => n.name)).toEqual([
        'All time', expect.stringContaining('Year'), expect.stringContaining('Month'), 'Week',
      ]);
      for (const n of items) expect(view).toContain(`#${n.id}`);
      expect(items[1]!.name).toContain('Oct 16, 2025');
      expect(items[1]!.states).toContain('checked');
      expect(items[0]!.states).not.toContain('checked');
      // The menu is not also summarized as one status line.
      expect(snap.nodes.some((n) => n.live && n.name.includes('All time'))).toBe(false);
    } finally { await b.close(); }
  });

  it('still reports a plain status toast, and a live region with a button gets both', async () => {
    const b = new MantisBrowser();
    try {
      const view = await b.open(fixture('percept-live-menu.html'));
      const snap = await b.snapshot();
      expect(snap.nodes.some((n) => n.live === 'status' && n.name === 'Saved 3 items')).toBe(true);
      expect(snap.nodes.some((n) => n.live === 'status' && n.name.startsWith('Upload finished'))).toBe(true);
      const undo = snap.nodes.find((n) => n.kind === 'interactive' && n.name === 'Undo upload');
      expect(undo?.id).toBeTypeOf('number');
      expect(view).toContain(`#${undo!.id}`);
    } finally { await b.close(); }
  });
});

describe('shared-context hints', () => {
  it('numbers unnamed controls that share one context hint', async () => {
    const b = new MantisBrowser();
    try {
      const view = await b.open(fixture('percept-shared-context.html'));
      for (const n of [1, 2, 3]) expect(view).toContain(`~"Play Area button ${n} of 3"`);
      // Near miss: a hint that is already unique gets no number.
      expect(view).not.toMatch(/Controls button \d/);
    } finally { await b.close(); }
  });
});

describe('transparent click-target controls (swatch filters)', () => {
  const COLORS = ['Black (167 products)', 'Blue (94 products)', 'Red (51 products)', 'White (38 products)'];

  it('numbers each opacity:0 checkbox stretched over its row and names it from the row text', async () => {
    const b = new MantisBrowser();
    try {
      const view = await b.open(fixture('hidden/percept-swatch-filter.html'));
      const snap = await b.snapshot();
      const boxes = snap.nodes.filter((n) => n.kind === 'interactive' && n.role === 'checkbox');
      expect(boxes.map((n) => n.name)).toEqual(COLORS);
      expect(boxes.every((n) => !n.inferred && !n.covered && !n.states.includes('looks disabled'))).toBe(true);
      for (const n of boxes) expect(view).toContain(`#${n.id} checkbox "${n.name}"`);
      // The row text is the control's name, not also a separate plain-text line.
      expect(view.split(String.fromCharCode(10)).filter((l) => l.includes('Black (167 products)'))).toHaveLength(1);
      expect(view).not.toContain('gid://');
    } finally { await b.close(); }
  });

  it('clicking the numbered checkbox selects that colour', async () => {
    const b = new MantisBrowser();
    try {
      await b.open(fixture('hidden/percept-swatch-filter.html'));
      const snap = await b.snapshot();
      const black = snap.nodes.find((n) => n.kind === 'interactive' && n.name === 'Black (167 products)');
      await b.click(black!.id!);
      const view = await b.read();
      expect(view).toContain('Selected: Black');
      expect(view).toContain(`#${black!.id} checkbox "Black (167 products)" (checked`);
      const red = (await b.snapshot()).nodes.find((n) => n.kind === 'interactive' && n.name === 'Red (51 products)');
      await b.click(red!.id!);
      expect(await b.read()).toContain('Selected: Black, Red');
    } finally { await b.close(); }
  });

  it('lists the checkboxes as covered, not missing, under a page-covering cookie dialog', async () => {
    const b = new MantisBrowser();
    try {
      const view = await b.open(fixture('hidden/percept-swatch-filter.html') + '?cookie=1');
      const snap = await b.snapshot();
      const boxes = snap.nodes.filter((n) => n.kind === 'interactive' && n.role === 'checkbox');
      expect(boxes.map((n) => n.name)).toEqual(COLORS);
      expect(boxes.every((n) => n.covered)).toBe(true);
      expect(view).toContain('covers page');
      expect(view).toMatch(/checkbox "Black \(167 products\)" \(covered\)/);
    } finally { await b.close(); }
  });

  it('keeps near-misses as they were: covered by a card, hidden, words around a code, shared rows', async () => {
    const b = new MantisBrowser();
    try {
      const view = await b.open(fixture('hidden/percept-swatch-near-miss.html'));
      const snap = await b.snapshot();
      const names = snap.nodes.filter((n) => n.kind === 'interactive').map((n) => n.name);
      // (a) an ordinary opaque card on top is not an overlay: the ghost input stays hidden.
      // (d) visibility:hidden and pointer-events:none ghosts stay hidden too.
      for (const hidden of ['Covered ghost', 'Invisible ghost', 'Inert ghost']) expect(view, hidden).not.toContain(hidden);
      // (b) a code among words is a real name.
      expect(names).toContain('SKU-1234 blue');
      // (c) two controls share the row: no borrowed row text, the machine name stays.
      expect(names).toContain('gid://shopify/Metaobject/111222333444');
      expect(names).toContain('gid://shopify/Metaobject/555666777888');
      expect(names.filter((n) => n.includes('Shared row words'))).toHaveLength(0);
      expect(names.filter((n) => n.includes('Ignored row words'))).toHaveLength(0);
      expect(names).toHaveLength(3);
    } finally { await b.close(); }
  });
});

describe('unnamed dismiss buttons', () => {
  it('names an icon-only close-btn in a shadow-root popup "close", and clicking it uncovers the page', async () => {
    const b = new MantisBrowser({ actionTimeoutMs: 1500 });
    try {
      await b.open(fixture('hidden/percept-close-class.html'));
      const snap = await b.snapshot();
      const close = snap.nodes.find((n) => n.kind === 'interactive' && n.name === 'close');
      expect(close?.inferred).toBe(true);
      const buy = snap.nodes.find((n) => n.kind === 'interactive' && n.name === 'Buy now');
      expect(buy?.covered).toBe(true);
      await b.click(close!.id!);
      const after = await b.snapshot();
      expect(after.nodes.find((n) => n.kind === 'interactive' && n.name === 'Buy now')?.covered).toBe(false);
    } finally { await b.close(); }
  });

  it('near miss: "disclosure" and "closed" classes are not read as close', async () => {
    const b = new MantisBrowser({ actionTimeoutMs: 1500 });
    try {
      await b.open(fixture('hidden/percept-close-class.html'));
      const names = (await b.snapshot()).nodes.filter((n) => n.kind === 'interactive' && n.role === 'button').map((n) => n.name);
      expect(names.filter((n) => n === 'close')).toHaveLength(1);
    } finally { await b.close(); }
  });
});
