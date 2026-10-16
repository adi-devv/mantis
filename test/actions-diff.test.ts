import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { fixture, idOf } from './helpers.js';

let b: MantisBrowser;
beforeAll(() => { b = new MantisBrowser({ actionTimeoutMs: 1500 }); });
afterAll(async () => { await b.close(); });

/** Lines of an action result after the first ("clicked ...") line. */
const diffOf = (res: string): string[] => res.split('\n').slice(1);

describe('action diffs: same page', () => {
  it('shows an inline validation error that appears after submit, then its removal', async () => {
    const view = await b.open(fixture('validate.html'));
    const email = idOf(view, 'textbox "Email"');

    const bad = await b.type(email, 'nope', true);
    expect(bad).toMatch(/^typed "nope" into #\d+ textbox "Email" and pressed Enter\n/);
    expect(diffOf(bad)).toEqual([
      '+ [form "Subscribe"] "Invalid email"',
      `~ #${email} textbox "Email": value "" → "nope"; now error`,
    ]);

    const good = await b.type(email, 'a@b.com', true);
    expect(diffOf(good)).toEqual([
      `~ #${email} textbox "Email": value "nope" → "a@b.com"; no longer error`,
      '- removed: "Invalid email"',
    ]);
  });

  it('reports a modal opening (covering the page) and closing', async () => {
    const view = await b.open(fixture('modal.html'));
    const openBtn = idOf(view, 'button "Open settings"');

    const opened = await b.click(openBtn);
    const lines = diffOf(opened);
    expect(lines[0]).toBe('+ [dialog "Confirm" — covers page]');
    expect(lines).toContainEqual(expect.stringMatching(/^\+ #\d+ button "OK"$/));
    expect(lines).toContainEqual(expect.stringMatching(/^\+ #\d+ button "Cancel"$/));
    // the dialog title is not repeated as a heading
    expect(opened).not.toContain('Confirm"\n+ ##');
    expect(lines).toContainEqual(expect.stringMatching(/^~ 3 items now covered \(#1–#3\)$/));

    const ok = Number(opened.match(/#(\d+) button "OK"/)![1]);
    const closed = await b.click(ok);
    expect(diffOf(closed)).toEqual([
      '~ 3 items no longer covered (#1–#3)',
      '- [dialog "Confirm"] closed (3 items)',
    ]);
  });

  it('shows a list item that gets added, with the existing items left alone', async () => {
    const view = await b.open(fixture('todo.html'));
    await b.type(idOf(view, 'textbox "New item"'), 'Feed cat');
    const res = await b.click(idOf(view, 'button "Add"'));
    expect(diffOf(res)).toEqual([expect.stringMatching(/^\+ \[main\] #\d+ link "Feed cat" \(href \S+\)$/)]);
    expect(res).not.toContain('Buy milk');
  });

  it('shows an element becoming disabled, and text that changed in place', async () => {
    const view = await b.open(fixture('toggle.html'));
    const save = idOf(view, 'button "Save"');
    const res = await b.click(save);
    expect(diffOf(res)).toEqual([
      '~ "Saved 0 times" → "Saved 1 times"',
      `~ #${save} button "Save": now disabled`,
    ]);
  });

  it('shows a renamed control', async () => {
    const view = await b.open(fixture('toggle.html'));
    const id = idOf(view, 'button "Rename"');
    expect(diffOf(await b.click(id))).toEqual([`~ #${id} button "Renamed": name "Rename" → "Renamed"`]);
  });

  it('shows the value of a field after typing', async () => {
    const view = await b.open(fixture('login.html'));
    const email = idOf(view, 'textbox "Email"');
    const res = await b.type(email, 'a@b.com');
    expect(res).toBe(`typed "a@b.com" into #${email} textbox "Email"\n~ #${email} textbox "Email": value "" → "a@b.com"`);
  });

  it('says so when nothing changed', async () => {
    const view = await b.open(fixture('toggle.html'));
    const id = idOf(view, 'button "Do nothing"');
    expect(await b.click(id)).toBe(`clicked #${id} button "Do nothing"\n(no visible change)`);
  });

  it('catches content that appears 500ms after the click', async () => {
    const view = await b.open(fixture('delayed.html'));
    const res = await b.click(idOf(view, 'button "Load report"'));
    expect(diffOf(res)).toEqual([
      '+ [main] ## Quarterly report',
      expect.stringMatching(/^\+ #\d+ link "Download report"/),
    ]);
  });

  it('keeps ids stable across the diff: the next read uses the same numbers', async () => {
    const view = await b.open(fixture('delayed.html'));
    const load = idOf(view, 'button "Load report"');
    const res = await b.click(load);
    const dl = Number(res.match(/#(\d+) link "Download report"/)![1]);
    const again = await b.read();
    expect(idOf(again, 'button "Load report"')).toBe(load);
    expect(idOf(again, 'link "Download report"')).toBe(dl);
  });

  it('scroll does not add a "(no visible change)" line', async () => {
    await b.open(fixture('hidden.html'));
    expect(await b.scroll('down')).not.toContain('no visible change');
  });
});

describe('action diffs: new document', () => {
  it('returns the url/title lines and the full view instead of a diff', async () => {
    const view = await b.open(fixture('nav.html'));
    const res = await b.click(idOf(view, 'link "Go to login"'));
    const lines = res.split('\n');
    expect(lines[0]).toMatch(/^clicked #\d+ link "Go to login"/);
    expect(lines[1]).toMatch(/^url: \/.*nav\.html → \/.*login\.html$/);
    expect(lines[2]).toBe('title: "Nav" → "Login — Acme"');
    expect(lines[3]).toMatch(/^Page: Login — Acme {2}\(file:/);
    // same text as read() gives
    expect(lines.slice(3).join('\n')).toBe(await b.read());
    expect(res).not.toMatch(/^[+~-] /m);
  });

  it('back also returns the full view of the page we return to', async () => {
    const res = await b.back();
    expect(res).toMatch(/^went back\nurl: \/.*login\.html → \/.*nav\.html\ntitle: "Login — Acme" → "Nav"\nPage: Nav/);
    expect(res).toContain('link "Go to login"');
  });
});

describe('plain text away from controls', () => {
  it('is part of the view (list items, footer), not only text next to a control', async () => {
    const view = await b.open(fixture('plaintext.html'));
    expect(view).toContain('"Starter: $9 per month"');
    expect(view).toContain('"Team: $29 per month"');
    expect(view).toContain('"© Example Corp"');
  });

  it('shows up in the diff when it appears after an action', async () => {
    const view = await b.open(fixture('plaintext.html'));
    await b.select(idOf(view, 'combobox "Country"'), 'Canada');
    const res = await b.click(idOf(view, 'button "Subscribe"'));
    expect(diffOf(res)).toContain('+ [main] "Subscribed from Canada."');
  });
});

describe('action diffs: labels for bare values', () => {
  it('prints each new table value next to its row label', async () => {
    const view = await b.open(fixture('results-table.html'));
    const res = await b.click(idOf(view, 'button "Calculate"'));
    const lines = diffOf(res);
    expect(lines).toContain('+ "Federal Tax": "24.00%" · "$27,107"');
    expect(lines).toContain('+ "FICA Tax": "7.65%" · "$12,125"');
    expect(lines).toContain('+ "Total Income Taxes": "—" · "$46,996"');
    expect(lines.join(' | ')).toContain('## Your 2025 taxes: "$39,232"');
  });

  it('leaves unlabelled price changes and changed prose as they were', async () => {
    const view = await b.open(fixture('results-table.html'));
    const prices = await b.click(idOf(view, 'button "Update prices"'));
    expect(diffOf(prices)).toEqual(['~ "$10.00" → "$11.50"', '~ "$20.00" → "$21.50"', '~ "$30.00" → "$31.50"']);
    const note = await b.click(idOf(view, 'button "Update note"'));
    expect(diffOf(note)).toEqual([
      '~ "Review before filing." → "Reviewed and approved."',
    ]);
  });
});
