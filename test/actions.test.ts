import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { fixture, idOf } from './helpers.js';

let b: MantisBrowser;
beforeAll(() => { b = new MantisBrowser({ actionTimeoutMs: 1500 }); });
afterAll(async () => { await b.close(); });

const idsOf = (view: string): Map<string, number> => {
  const m = new Map<string, number>();
  for (const line of view.split('\n')) {
    const x = line.match(/#(\d+) \w+ "([^"]+)"/);
    if (x) m.set(x[2], Number(x[1]));
  }
  return m;
};

describe('stable ids', () => {
  it('numbers do not change between reads of an unchanged page', async () => {
    const first = idsOf(await b.open(fixture('rerender.html')));
    const second = idsOf(await b.read());
    expect(second).toEqual(first);
  });

  it('survive a re-render; replaced elements get fresh numbers; stale ids report an error', async () => {
    const before = idsOf(await b.open(fixture('rerender.html')));
    const refresh = before.get('Refresh list')!;
    const alpha = before.get('Alpha')!;
    const maxBefore = Math.max(...before.values());

    const res = await b.click(refresh);
    expect(res.startsWith(`clicked #${refresh} button "Refresh list"\n`)).toBe(true);
    // the replaced items are reported as added and removed, nothing else
    expect(res).toMatch(/^\+ #\d+ link "Gamma 1"/m);
    expect(res).toMatch(/^\+ #\d+ link "Delta 1"/m);
    expect(res).toMatch(/^- removed: #\d+–#\d+ link$/m);
    expect(res).not.toMatch(/^~/m);

    const after = idsOf(await b.read());
    expect(after.get('Refresh list')).toBe(refresh);
    expect(after.has('Alpha')).toBe(false);
    expect(after.get('Gamma 1')).toBeGreaterThan(maxBefore);
    expect(after.get('Delta 1')).toBeGreaterThan(after.get('Gamma 1')!);

    // numbers are never reused: a second re-render yields numbers above the first batch
    await b.click(refresh);
    const third = idsOf(await b.read());
    expect(third.get('Refresh list')).toBe(refresh);
    expect(third.get('Gamma 2')).toBeGreaterThan(after.get('Delta 1')!);

    const stale = await b.click(alpha);
    expect(stale).toMatch(/^error: #\d+ no longer exists/);
  });

  it('clicking an unknown id returns an error message, not an exception', async () => {
    await b.open(fixture('rerender.html'));
    const res = await b.click(9999);
    expect(res).toBe('error: no element #9999 on this page; call read() to see current numbers');
  });
});

describe('navigation actions', () => {
  it('a link to a missing page says the page failed to load', async () => {
    const view = await b.open(fixture('nav.html'));
    const res = await b.click(idOf(view, 'link "Broken link"'));
    expect(res).toContain('the page failed to load');
  });

  it('back on a fresh browser says there is nothing to go back to', async () => {
    const fresh = new MantisBrowser();
    try {
      expect(await fresh.back()).toBe('cannot go back: no earlier page');
    } finally {
      await fresh.close();
    }
  });

  it('opening an unreachable URL returns an error message', async () => {
    const res = await b.open('http://127.0.0.1:1/');
    expect(res).toMatch(/^error: could not open http:\/\/127\.0\.0\.1:1\//);
  });
});

describe('press and scroll', () => {
  it('press reports the key', async () => {
    await b.open(fixture('login.html'));
    expect(await b.press('Tab')).toBe('pressed Tab\n(no visible change)');
  });

  it('scroll(id) brings a below-the-fold element into the viewport', async () => {
    const view = await b.open(fixture('hidden.html'));
    const id = idOf(view, 'Below the fold');
    expect((await b.snapshot()).nodes.find((n) => n.id === id)?.inViewport).toBe(false);
    const res = await b.scroll(id);
    expect(res).toMatch(/^scrolled #\d+ button "Below the fold" into view/);
    expect((await b.snapshot()).nodes.find((n) => n.id === id)?.inViewport).toBe(true);
  });

  it('scroll down/up moves the page and reports position', async () => {
    await b.open(fixture('hidden.html'));
    expect(await b.scroll('down')).toMatch(/^scrolled down; now at \d+% of page/);
    await b.scroll('up');
    expect(await b.scroll('up')).toMatch(/already at the top/);
  });
});

describe('select', () => {
  it('chooses an option by label and lists options when one does not exist', async () => {
    const url =
      'data:text/html,' +
      encodeURIComponent(
        '<title>Sel</title><label for=c>Country</label><select id=c><option value=fr>France</option><option value=es>Spain</option></select>',
      );
    let view = await b.open(url);
    expect(view).toMatch(/#\d+ combobox "Country" \(value "France", options: France \| Spain\)/);
    const id = idOf(view, 'combobox "Country"');
    expect(await b.select(id, 'Spain')).toBe(
      `selected "Spain" in #${id} combobox "Country"\n~ #${id} combobox "Country": value "France" → "Spain"`,
    );
    view = await b.read();
    expect(view).toContain('value "Spain"');
    expect(await b.select(id, 'Mars')).toBe(`error: no option "Mars" in #${id} combobox "Country"; options: France | Spain`);
  });
});

describe('fill', () => {
  const form = () =>
    'data:text/html,' +
    encodeURIComponent(
      '<title>Form</title>' +
        '<label for=n>Name</label><input id=n>' +
        '<label for=p>Secret</label><input id=p type=password>' +
        '<label for=c>Planet</label><select id=c><option value=ea>Earth</option><option value=ma>Mars rock</option></select>' +
        '<label><input id=t type=checkbox> Terms</label>',
    );

  it('sets text, password, dropdown and checkbox in one call with one diff', async () => {
    const view = await b.open(form());
    const ids = {
      name: idOf(view, 'textbox "Name"'),
      pw: idOf(view, 'Secret'),
      planet: idOf(view, 'combobox "Planet"'),
      terms: idOf(view, 'checkbox'),
    };
    const res = await b.fill([
      { id: ids.name, value: 'Ann' },
      { id: ids.pw, value: 'hunter2' },
      { id: ids.planet, value: 'mars' },
      { id: ids.terms, value: true },
    ]);
    const [msg, ...diff] = res.split('\n');
    expect(msg).toBe(
      'filled 4 fields: "Ann" into textbox "Name"; ••• into textbox "Secret"; selected "Mars rock" in combobox "Planet"; checked checkbox "Terms"',
    );
    expect(res).not.toContain('hunter2');
    expect(diff.length).toBeGreaterThan(0);
    expect(diff.join('\n')).toContain('Mars rock');
    const pageValues = await (await (b as any).activePage()).evaluate(() => ({
      n: (document.getElementById('n') as HTMLInputElement).value,
      p: (document.getElementById('p') as HTMLInputElement).value,
      c: (document.getElementById('c') as HTMLSelectElement).value,
      t: (document.getElementById('t') as HTMLInputElement).checked,
    }));
    expect(pageValues).toEqual({ n: 'Ann', p: 'hunter2', c: 'ma', t: true });

    expect(await b.fill([{ id: ids.terms, value: false }])).toMatch(/^filled 1 field: unchecked checkbox "Terms"/);
  });

  it('stops at a bad option and says what was filled; earlier fields stay filled', async () => {
    const view = await b.open(form());
    const name = idOf(view, 'textbox "Name"');
    const planet = idOf(view, 'combobox "Planet"');
    const terms = idOf(view, 'checkbox');
    const res = await b.fill([
      { id: name, value: 'Bob' },
      { id: planet, value: 'Pluto' },
      { id: terms, value: true },
    ]);
    expect(res).toBe(`error: filled #${name}; #${planet}: no option "Pluto" in combobox "Planet"; options: Earth | Mars rock`);
    const after = await b.read();
    expect(after).toContain('value "Bob"');
    expect(after).not.toMatch(/checkbox "Terms" \(checked\)/);
  });

  it('errors on no fields, an unknown id, and a non-boolean for a checkbox', async () => {
    const view = await b.open(form());
    expect(await b.fill([])).toBe('error: no fields given');
    expect(await b.fill([{ id: 9999, value: 'x' }])).toBe('error: nothing filled; #9999: no element #9999 on this page; call read() to see current numbers');
    const terms = idOf(view, 'checkbox');
    expect(await b.fill([{ id: terms, value: 'maybe' }])).toContain('use true or false');
  });
});
