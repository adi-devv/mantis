import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { fixture, idOf } from './helpers.js';

let b: MantisBrowser;
beforeAll(() => { b = new MantisBrowser({ actionTimeoutMs: 1500 }); });
afterAll(async () => { await b.close(); });

describe('login form', () => {
  it('shows names, roles, states, regions and headings', async () => {
    const view = await b.open(fixture('login.html'));
    const lines = view.split('\n');
    expect(lines[0]).toMatch(/^Page: Login — Acme {2}\(file:\/\/\/.*login\.html\)$/);
    expect(view).toContain('[header]');
    expect(view).toContain('[main]');
    expect(view).toContain('[form "Login"]');
    expect(view).toMatch(/^\s*# Sign in$/m);
    expect(view).toMatch(/#\d+ textbox "Email" \(email, required\)/);
    expect(view).toMatch(/#\d+ textbox "Password" \(password, required\)/);
    expect(view).toMatch(/#\d+ button "Sign in" \(submit\)/);
    expect(view).toMatch(/"Forgot your password\?" #\d+ link "Reset it"/);
    expect(view).toMatch(/#\d+ link "Home"/);
  });

  it('indents children of a region by two spaces', async () => {
    const view = await b.open(fixture('login.html'));
    const lines = view.split('\n');
    const main = lines.indexOf('[main]');
    expect(lines[main + 1]).toMatch(/^ {2}# Sign in$/);
    expect(lines.find((l) => l.includes('[form "Login"]'))).toBe('  [form "Login"]');
    expect(lines.find((l) => l.includes('textbox "Email"'))).toMatch(/^ {4}#/);
  });

  it('typing into a field shows its value on the next read; password is masked', async () => {
    let view = await b.open(fixture('login.html'));
    const email = idOf(view, 'textbox "Email"');
    const pw = idOf(view, 'textbox "Password"');
    const r1 = await b.type(email, 'ada@example.com');
    expect(r1).toContain('typed "ada@example.com" into #');
    const r2 = await b.type(pw, 'hunter2-secret');
    expect(r2).not.toContain('hunter2');
    view = await b.read();
    expect(view).toMatch(/#\d+ textbox "Email" \(email, required, value "ada@example.com"\)/);
    expect(view).toMatch(/#\d+ textbox "Password" \(password, required, value "•••"\)/);
    expect(view).not.toContain('hunter2');
  });

  it('type(..., submit=true) runs the page handler and reports the title change', async () => {
    const view = await b.open(fixture('login.html'));
    const email = idOf(view, 'textbox "Email"');
    const pw = idOf(view, 'textbox "Password"');
    await b.type(email, 'ada@example.com');
    const res = await b.type(pw, 'pw', true);
    expect(res).toContain('pressed Enter');
    expect(res).toContain('title: "Login — Acme" → "Welcome — Acme"');
    expect(await b.read()).toMatch(/^\s*# Signed in$/m);
  });
});

describe('hidden content', () => {
  it('drops everything a user cannot see and keeps what they can', async () => {
    const view = await b.open(fixture('hidden.html'));
    for (const hidden of [
      'Display none', 'Visibility hidden', 'Aria hidden', 'Opacity zero', 'Zero size',
      'Offscreen left', 'Offscreen above', 'Inert one', 'Hidden attribute', 'Hidden heading', 'Collapsed panel',
    ]) {
      expect(view, hidden).not.toContain(hidden);
    }
    expect(view).toContain('button "Visible one"');
    expect(view).toContain('link "Visible link"');
    expect(view).toContain('button "Below the fold"');
  });

  it('keeps content below the fold but records it as out of viewport', async () => {
    await b.open(fixture('hidden.html'));
    const snap = await b.snapshot();
    const below = snap.nodes.find((n) => n.name === 'Below the fold');
    const first = snap.nodes.find((n) => n.name === 'Visible one');
    expect(below?.inViewport).toBe(false);
    expect(first?.inViewport).toBe(true);
  });
});

describe('cookie dialog', () => {
  it('lists the dialog first, marked as covering, and flags buttons underneath', async () => {
    const view = await b.open(fixture('cookie.html'));
    const lines = view.split('\n');
    expect(lines[1]).toBe('[dialog "Accept cookies?" — covers page]');
    expect(view).toMatch(/^ {2}#\d+ button "Accept"$/m);
    expect(view).toMatch(/^ {2}#\d+ button "Reject"$/m);
    expect(view).toMatch(/#\d+ button "Add to cart" \(covered\)/);
    expect(view).toMatch(/#\d+ link "More products" \(.*covered\)/);
    expect(lines.find((l) => l.includes('"Accept"'))).not.toContain('covered');
  });

  it('refuses to click a covered element with a clear message', async () => {
    const view = await b.open(fixture('cookie.html'));
    const res = await b.click(idOf(view, 'button "Add to cart"'));
    expect(res).toMatch(/^error: .*covered by another element/);
    expect(res).not.toMatch(/\bat\s+\S+:\d+/); // no stack trace
  });

  it('after accepting, the dialog is gone and nothing is covered', async () => {
    const view = await b.open(fixture('cookie.html'));
    const res = await b.click(idOf(view, 'button "Accept"'));
    expect(res).toMatch(/^clicked #\d+ button "Accept"/);
    const after = await b.read();
    expect(after).not.toContain('dialog');
    expect(after).not.toContain('covered');
    expect(after).toContain('button "Add to cart"');
  });
});

describe('long lists', () => {
  it('collapses 60 links to the first five plus a range', async () => {
    const view = await b.open(fixture('longlist.html'));
    expect(view).toContain('[nav "Docs"]');
    expect((view.match(/link "Item \d+"/g) ?? []).length).toBe(5);
    expect(view).toContain('link "Item 5"');
    expect(view).not.toContain('"Item 6"');
    expect(view).toContain('…and 55 more links (#6–#60)');
  });
});

describe('shadow DOM', () => {
  it('shows and clicks a button inside an open shadow root', async () => {
    const view = await b.open(fixture('shadow.html'));
    expect(view).toMatch(/#\d+ button "Shadow button"/);
    const res = await b.click(idOf(view, 'Shadow button'));
    expect(res).toContain('clicked #');
    expect(res).toContain('title: "Shadow" → "Shadow clicked"');
  });
});
