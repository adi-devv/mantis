import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { estimateTokens } from '../src/translate.js';
import { fixture, idOf } from './helpers.js';

let b: MantisBrowser;
beforeAll(() => { b = new MantisBrowser({ actionTimeoutMs: 1500 }); });
afterAll(async () => { await b.close(); });

describe('names for unnamed controls', () => {
  it('guesses from icon classes, svg titles, ligature icons, tooltips and links, marked with ~', async () => {
    const view = await b.open(fixture('icons.html'));
    expect(view).toMatch(/#\d+ button ~"trash"$/m); // fa-trash (size/style classes ignored)
    expect(view).toMatch(/#\d+ button ~"Close dialog"$/m); // <svg><title>
    expect(view).toMatch(/#\d+ button ~"settings"$/m); // material-icons ligature text
    expect(view).toMatch(/#\d+ button ~"Share this page"$/m); // data-tooltip
    expect(view).toMatch(/#\d+ button ~"search"$/m); // bi-search
    expect(view).toMatch(/#\d+ link ~"upvote"$/m); // ?how=up
    expect(view).toMatch(/#\d+ link ~"twitter"$/m); // known social host
  });

  it('a real accessible name is not marked as a guess', async () => {
    const view = await b.open(fixture('icons.html'));
    expect(view).toMatch(/#\d+ button "Save"$/m);
  });

  it('leaves a control with no evidence unnamed', async () => {
    const view = await b.open(fixture('icons.html'));
    expect(view).toMatch(/^\s+#\d+ button$/m);
  });

  it('action results use the guessed name too', async () => {
    const view = await b.open(fixture('icons.html'));
    const res = await b.click(idOf(view, 'button ~"trash"'));
    expect(res).toMatch(/^clicked #\d+ button ~"trash"/);
  });
});

describe('visual meaning', () => {
  it('flags error (aria-invalid + message, red border), primary, looks disabled, current', async () => {
    const view = await b.open(fixture('visual.html'));
    expect(view).toMatch(/#\d+ textbox "Email" \(error: "Enter a valid email", value "nope"\)/);
    expect(view).toMatch(/#\d+ textbox "Name" \(error\)/); // red border only, no message
    expect(view).toMatch(/#\d+ textbox "Nickname"$/m); // untouched field stays plain
    expect(view).toMatch(/#\d+ button "Save changes" \(primary\)/);
    expect(view).not.toMatch(/button "Cancel" \(.*primary/);
    expect(view).toMatch(/#\d+ button "Archive" \(looks disabled\)/);
    expect(view).toMatch(/#\d+ button "Delete" \(disabled\)/);
    expect(view).toMatch(/#\d+ link "Team" \(current\)/); // aria-current
    expect(view).toMatch(/#\d+ link "Overview" \(current\)/); // class "active" on the <li>
    expect(view).toMatch(/#\d+ link "Billing"$/m);
  });

  it('does not repeat the error message as a separate line', async () => {
    const view = await b.open(fixture('visual.html'));
    expect(view.match(/Enter a valid email/g)?.length).toBe(1);
  });

  it('a single submit button in a form is primary (and not also "submit")', async () => {
    const view = await b.open(fixture('login.html'));
    expect(view).toMatch(/#\d+ button "Sign in" \(primary\)/);
    expect(view).not.toContain('submit');
  });

  it('does not pick a primary among look-alike buttons', async () => {
    const view = await b.open(fixture('cookie.html'));
    expect(view).not.toContain('primary');
  });
});

describe('regions without landmarks', () => {
  it('derives top bar, sidebar, main and bottom from geometry', async () => {
    const view = await b.open(fixture('noland.html'));
    const lines = view.split('\n');
    const at = (label: string): number => lines.indexOf(label);
    expect(at('[top bar]')).toBeGreaterThan(0);
    expect(at('[sidebar]')).toBeGreaterThan(at('[top bar]'));
    expect(at('[main]')).toBeGreaterThan(at('[sidebar]'));
    expect(at('[bottom]')).toBeGreaterThan(at('[main]'));
    const section = (from: string, to: string): string => lines.slice(at(from), at(to)).join('\n');
    expect(section('[top bar]', '[sidebar]')).toContain('link "Login"');
    expect(section('[sidebar]', '[main]')).toContain('link "Inbox"');
    expect(section('[sidebar]', '[main]')).not.toContain('Search mail');
    expect(section('[main]', '[bottom]')).toContain('textbox "Search mail"');
    expect(lines.slice(at('[bottom]')).join('\n')).toContain('link "Terms"');
  });

  it('adds nothing when the page has landmarks', async () => {
    const view = await b.open(fixture('login.html'));
    expect(view).not.toMatch(/\[(top bar|sidebar|bottom)\]/);
  });

  it('does not invent regions for a plain page', async () => {
    const view = await b.open(fixture('nav.html'));
    expect(view).not.toMatch(/\[(top bar|sidebar|bottom|main)\]/);
  });
});

describe('prose', () => {
  it('shows every paragraph, unclipped, with the inline links, when the page fits the budget', async () => {
    const view = await b.open(fixture('article.html'));
    const paras = view.split('\n').filter((l) => l.startsWith('"Paragraph'));
    expect(paras.length).toBe(13);
    expect(paras.every((p) => !p.endsWith('…"'))).toBe(true);
    expect(view).not.toContain('more paragraph');
    expect(view).toContain('links: #1 link "insects" · #2 "termites"');
  });

  it('read({full}) gives every paragraph untruncated', async () => {
    await b.open(fixture('article.html'));
    const view = await b.read({ full: true });
    const paras = view.split('\n').filter((l) => l.startsWith('"Paragraph'));
    expect(paras.length).toBe(13);
    expect(paras.every((p) => !p.includes('…'))).toBe(true);
    expect(view).not.toContain('more paragraph');
  });
});

describe('dense pages', () => {
  it('collapses repeated rows to one line each, without per-link hrefs', async () => {
    const view = await b.open(fixture('rows.html'));
    const rows = view.split('\n').filter((l) => /^\d+\. #\d+ /.test(l));
    expect(rows.length).toBe(12);
    expect(rows[0]).toBe(
      '1. #1 link ~"upvote" · #2 "Story number 1 about things" · #3 "site1.example" · 11 points · #4 "user1" · #5 "1 hours ago" · #6 "hide" · #7 "3 comments"',
    );
    expect(rows[1]).toMatch(/^2\. #8 ~"upvote" · #9 "Story number 2/); // role spelled out on the first row only
    expect(view).not.toContain('(href /item');
    expect(view).not.toContain('(href /user');
  });

  it('keeps an href where the link text alone says nothing', async () => {
    const view = await b.open(fixture('rows.html'));
    expect(view).toMatch(/#\d+ link "Read more" \(href \S+archive\/2020\)/);
  });

  it('row compaction is much smaller than the same page in full mode', async () => {
    const compact = await b.open(fixture('rows.html'));
    const full = await b.read({ full: true });
    expect(estimateTokens(compact)).toBeLessThan(estimateTokens(full) * 0.6);
    expect(full).toMatch(/#1 link ~"upvote" \(href \S*vote\?id=1&how=up/);
  });

  it('row ids still act: clicking a link inside a compacted row works', async () => {
    const view = await b.open(fixture('rows.html'));
    const res = await b.click(Number(view.match(/#(\d+) "Story number 3 about/)![1]));
    expect(res).toMatch(/^clicked #\d+ link "Story number 3 about things"/);
  });
});

describe('read({ region })', () => {
  it('shows only the matching region', async () => {
    await b.open(fixture('login.html'));
    const view = await b.read({ region: 'form' });
    expect(view).toContain('[form "Login"]');
    expect(view).toContain('textbox "Email"');
    expect(view).not.toContain('link "Home"'); // header
    expect(view).not.toContain('# Sign in'); // heading outside the form
  });

  it('matches derived regions too', async () => {
    await b.open(fixture('noland.html'));
    const view = await b.read({ region: 'sidebar' });
    expect(view).toContain('link "Inbox"');
    expect(view).not.toContain('Login');
    expect(view).not.toContain('Compose');
  });

  it('lists the regions when nothing matches', async () => {
    await b.open(fixture('login.html'));
    const view = await b.read({ region: 'sidebar' });
    expect(view).toMatch(/^error: no region matching "sidebar"; regions on this page: .*\[header\].*\[main\]/);
  });

  it('keeps the same element numbers as the full read', async () => {
    const full = await b.open(fixture('login.html'));
    const part = await b.read({ region: 'header' });
    expect(part).toContain(`#${idOf(full, 'link "Home"')} link "Home"`);
  });
});

describe('live messages', () => {
  it('a standalone role=alert toast shows up in the action diff', async () => {
    const view = await b.open(fixture('toast.html'));
    const res = await b.click(idOf(view, 'button "Save"'));
    expect(res.split('\n')).toContain('+ [main] ⚠ "Saved successfully"');
    expect(await b.read()).toContain('⚠ "Saved successfully"');
  });
});
