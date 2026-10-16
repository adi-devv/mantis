import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { fixture } from './helpers.js';

let browser: MantisBrowser;
beforeAll(() => { browser = new MantisBrowser(); });
afterAll(async () => { await browser.close(); });

describe('generic capture fixes', () => {
  it('keeps screen reader only content on a normal page, as the accessibility tree does, and never takes the fallback', async () => {
    await browser.open(fixture('generic-capture-visible.html'));
    const snap = await browser.snapshot();
    const names = snap.nodes.map((n) => n.name);
    expect(names.join(' ')).toContain('Visible hidden heading part heading');
    expect(names).toContain('Round clip visible');
    expect(names).toContain('Visible child button');
    for (const name of ['Clipped text', 'Path text', 'Tiny text', 'Faint button']) expect(names.join(' ')).toContain(name);
    for (const name of ['Display none button', 'Hidden visibility button']) expect(names.join(' ')).not.toContain(name);
    expect(snap.nodes.find((n) => n.name === 'Round clip visible')?.srOnly).toBeUndefined();
  });

  it('uses a second pass only for substantive otherwise hidden content', async () => {
    await browser.open(fixture('generic-capture-empty.html'));
    const snap = await browser.snapshot();
    expect(snap.nodes.map((n) => n.name)).toEqual(expect.arrayContaining(['Screen reader heading', 'Screen reader button']));
    expect(snap.nodes.find((n) => n.name === 'Screen reader button')?.srOnly).toBe(true);
    await browser.open('data:text/html,<title>Blank</title>');
    expect((await browser.snapshot()).nodes).toHaveLength(0);
    await browser.open('data:text/html,<div style="display:none"><button>Never shown</button></div>');
    expect((await browser.snapshot()).nodes).toHaveLength(0);
  });

  it('recognizes verified label hits but flags unrelated overlays', async () => {
    await browser.open(fixture('generic-capture-labels.html'));
    const snap = await browser.snapshot();
    expect(snap.nodes.find((n) => n.name === 'Wrapped')?.covered).toBe(false);
    expect(snap.nodes.find((n) => n.name === 'Linked')?.covered).toBe(false);
    expect(snap.nodes.find((n) => n.name === 'Overlay target')?.covered).toBe(true);
  });

  it('emits semantic image labels as text without losing live messages or repeating control names', async () => {
    await browser.open(fixture('generic-capture-labels.html'));
    const snap = await browser.snapshot();
    const names = snap.nodes.map((n) => n.name);
    expect(names.join(' ')).toContain('five stars');
    expect(names).toContain('Chart overview');
    expect(names).toContain('Ready now');
    expect(snap.nodes.find((n) => n.name === 'Ready now')?.live).toBe('status');
    expect(names.filter((n) => n.includes('disk icon'))).toHaveLength(1);
  });
});
