import { describe, expect, it } from 'vitest';
import { DIFF_BUDGET_CHARS, NO_CHANGE, diffSnapshots } from '../src/diff.js';
import type { RawNode, Snapshot } from '../src/index.js';

type Extra = Partial<RawNode>;
const base = { states: [], parent: -1, depth: 0, inViewport: true, covered: false };
const btn = (id: number, name: string, o: Extra = {}): RawNode =>
  ({ ...base, kind: 'interactive', role: 'button', id, name, ...o });
const link = (id: number, name: string, o: Extra = {}): RawNode => btn(id, name, { role: 'link', ...o });
const textbox = (id: number, name: string, o: Extra = {}): RawNode => btn(id, name, { role: 'textbox', ...o });
const region = (role: string, name = '', o: Extra = {}): RawNode =>
  ({ ...base, kind: 'region', role, name, ...o });
const heading = (name: string, level = 1, o: Extra = {}): RawNode =>
  ({ ...base, kind: 'heading', role: 'heading', name, level, ...o });
const text = (name: string, o: Extra = {}): RawNode => ({ ...base, kind: 'text', role: 'text', name, ...o });
const snap = (nodes: RawNode[], url = 'https://x.test/a', title = 'A'): Snapshot =>
  ({ url, title, nodes, truncated: false });

describe('diffSnapshots (pure)', () => {
  it('reports no visible change for identical snapshots, ignoring viewport position', () => {
    const a = snap([region('main'), btn(1, 'Go', { parent: 0 })]);
    const b = snap([region('main'), btn(1, 'Go', { parent: 0, inViewport: false })]);
    expect(diffSnapshots(a, a)).toBe(NO_CHANGE);
    expect(diffSnapshots(a, b)).toBe(NO_CHANGE);
  });

  it('lists added elements with their region, and a new heading', () => {
    const before = snap([region('main'), btn(1, 'Go', { parent: 0 })]);
    const after = snap([
      region('main'),
      btn(1, 'Go', { parent: 0 }),
      heading('Welcome back', 1, { parent: 0 }),
      link(2, 'Settings', { parent: 0, href: '/settings' }),
    ]);
    expect(diffSnapshots(before, after)).toBe(
      ['+ [main] # Welcome back', '+ #2 link "Settings" (href /settings)'].join('\n'),
    );
  });

  it('puts the contents of a new dialog under its header and flags that it covers the page', () => {
    const before = snap([region('main'), btn(1, 'Open', { parent: 0 })]);
    const after = snap([
      region('dialog', 'Confirm', { covers: true }),
      heading('Confirm', 2, { parent: 0 }),
      text('Delete this item?', { parent: 0 }),
      btn(3, 'OK', { parent: 0 }),
      region('main'),
      btn(1, 'Open', { parent: 4, covered: true }),
    ]);
    const d = diffSnapshots(before, after).split('\n');
    expect(d[0]).toBe('+ [dialog "Confirm" — covers page]');
    // the heading only repeats the dialog title, so it is not listed again
    expect(d[1]).toBe('+ "Delete this item?" #3 button "OK"');
    expect(d).toContain('~ #1 button "Open": now covered');
    expect(d).toHaveLength(3);
  });

  it('says when a dialog closes, and what stops being covered', () => {
    const open = snap([
      region('dialog', 'Confirm', { covers: true }),
      btn(3, 'OK', { parent: 0 }),
      btn(4, 'Cancel', { parent: 0 }),
      region('main'),
      link(1, 'A', { parent: 3, covered: true }),
      link(2, 'B', { parent: 3, covered: true }),
      link(5, 'C', { parent: 3, covered: true }),
    ]);
    const closed = snap([region('main'), link(1, 'A', { parent: 0 }), link(2, 'B', { parent: 0 }), link(5, 'C', { parent: 0 })]);
    expect(diffSnapshots(open, closed)).toBe(
      ['~ 3 items no longer covered (#1–#2, #5)', '- [dialog "Confirm"] closed (2 items)'].join('\n'),
    );
  });

  it('groups removed ids into ranges by role', () => {
    const before = snap([
      region('main'),
      textbox(12, 'Email', { parent: 0 }),
      textbox(13, 'Password', { parent: 0 }),
      btn(14, 'Sign in', { parent: 0 }),
      link(20, 'Help', { parent: 0 }),
    ]);
    const after = snap([region('main'), link(20, 'Help', { parent: 0 })]);
    expect(diffSnapshots(before, after)).toBe('- removed: #12–#13 textbox, #14 button');
  });

  it('describes value, state and name changes on the same element', () => {
    const before = snap([textbox(12, 'Email', { value: '' }), btn(14, 'Save'), btn(15, 'Rename'), btn(16, 'Menu', { states: ['expanded'] })]);
    const after = snap([
      textbox(12, 'Email', { value: 'a@b.com' }),
      btn(14, 'Save', { states: ['disabled'] }),
      btn(15, 'Renamed'),
      btn(16, 'Menu', { states: ['collapsed'] }),
    ]);
    expect(diffSnapshots(before, after).split('\n')).toEqual([
      '~ #12 textbox "Email": value "" → "a@b.com"',
      '~ #14 button "Save": now disabled',
      '~ #15 button "Renamed": name "Rename" → "Renamed"',
      '~ #16 button "Menu": now collapsed; no longer expanded',
    ]);
  });

  it('shows an inline error that appears next to an input, and its removal', () => {
    const form = (extra: RawNode[]): Snapshot =>
      snap([region('form', 'Login'), textbox(1, 'Email', { parent: 0 }), ...extra, btn(2, 'Send', { parent: 0 })]);
    const with_ = form([text('Invalid email', { parent: 0 })]);
    const without = form([]);
    expect(diffSnapshots(without, with_)).toBe('+ [form "Login"] "Invalid email"');
    expect(diffSnapshots(with_, without)).toBe('- removed: "Invalid email"');
  });

  it('shows text that changed in place as one line', () => {
    const a = snap([region('main'), heading('Sign in', 1, { parent: 0 }), text('Saved 0 times', { parent: 0 }), btn(1, 'Save', { parent: 0 })]);
    const b = snap([region('main'), heading('Signed in', 1, { parent: 0 }), text('Saved 1 times', { parent: 0 }), btn(1, 'Save', { parent: 0 })]);
    expect(diffSnapshots(a, b).split('\n')).toEqual(['~ # "Sign in" → "Signed in"', '~ "Saved 0 times" → "Saved 1 times"']);
  });

  it('ignores text that only repeats the neighbouring control name', () => {
    const a = snap([btn(1, 'Save')]);
    const b = snap([btn(1, 'Save'), text('Save'), btn(2, 'Cancel')]);
    expect(diffSnapshots(a, b)).toBe('+ #2 button "Cancel"');
  });

  it('reports url and title changes first', () => {
    const a = snap([btn(1, 'Go')], 'https://x.test/login', 'Login');
    const b = snap([btn(1, 'Go')], 'https://x.test/dashboard', 'Dashboard');
    expect(diffSnapshots(a, b)).toBe('url: /login → /dashboard\ntitle: "Login" → "Dashboard"');
    expect(diffSnapshots(a, snap([btn(1, 'Go')], 'https://y.test/', 'Login'))).toBe('url: https://x.test/login → https://y.test/');
  });

  it('shortens a long run of new items and points at read()', () => {
    const items = Array.from({ length: 40 }, (_, i) => link(100 + i, `Result number ${i} with a fairly long title`, { parent: 0, href: `/r/${i}` }));
    const a = snap([region('main'), btn(1, 'Search', { parent: 0 })]);
    const b = snap([region('main'), btn(1, 'Search', { parent: 0 }), ...items]);
    const d = diffSnapshots(a, b).split('\n');
    expect(d).toHaveLength(5);
    expect(d[0]).toMatch(/^\+ \[main\] #100 link /);
    expect(d[4]).toBe('+ … and 36 more new items in [main] — call read() to see them');
  });

  it('collapses everything to counts when even the shortened diff is too big', () => {
    const sections = (n: number): RawNode[] => {
      const out: RawNode[] = [];
      for (let s = 0; s < 14; s++) {
        out.push(region('region', `Section ${s}`));
        const at = out.length - 1;
        for (let i = 0; i < n; i++) out.push(link(s * 100 + i + 1, `Item ${i} of section ${s} with padding text`, { parent: at, href: '/x' }));
      }
      return out;
    };
    const d = diffSnapshots(snap(sections(1)), snap(sections(20)));
    expect(d.length).toBeLessThanOrEqual(DIFF_BUDGET_CHARS);
    expect(d).toContain('+ 19 new items in [region "Section 0"] — call read() to see them');
  });

  it('keeps the controls of a new blocking dialog even when the diff is large', () => {
    const items = Array.from({ length: 40 }, (_, i) => link(100 + i, `Result number ${i} with a fairly long title`, { parent: 2, href: `/r/${i}` }));
    const a = snap([region('main'), btn(1, 'Search', { parent: 0 })]);
    const b = snap([
      region('main'), btn(1, 'Search', { parent: 0 }),
      region('dialog', 'Pick one', { covers: true }), btn(99, 'Close', { parent: 2 }), ...items,
    ]);
    const d = diffSnapshots(a, b);
    expect(d.length).toBeLessThanOrEqual(DIFF_BUDGET_CHARS);
    expect(d).toContain('+ [dialog "Pick one" — covers page]');
    expect(d).toContain('#99 button "Close"');
    expect(d).toContain('call read()');
  });

  it('never exceeds the budget, whatever changed', () => {
    const many = (suffix: string): RawNode[] =>
      Array.from({ length: 80 }, (_, i) => textbox(i + 1, `Field ${i} ${'x'.repeat(30)}`, { value: `${suffix}${i}`, parent: -1 }));
    const d = diffSnapshots(snap(many('old')), snap(many('new')));
    expect(d.length).toBeLessThanOrEqual(DIFF_BUDGET_CHARS);
    expect(d).toContain('call read()');
    const gone = diffSnapshots(snap(many('old')), snap([]));
    expect(gone.length).toBeLessThanOrEqual(DIFF_BUDGET_CHARS);
    expect(gone).toMatch(/^- removed: /);
  });

  it('is deterministic', () => {
    const a = snap([region('main'), btn(1, 'Go', { parent: 0 })]);
    const b = snap([region('main'), btn(1, 'Go', { parent: 0, states: ['disabled'] }), link(2, 'New', { parent: 0 })]);
    expect(diffSnapshots(a, b)).toBe(diffSnapshots(a, b));
  });
});
