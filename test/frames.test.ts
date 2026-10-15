import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MantisBrowser } from '../src/index.js';
import { fixture, idOf } from './helpers.js';

let b: MantisBrowser;
beforeAll(() => { b = new MantisBrowser({ actionTimeoutMs: 1500 }); });
afterAll(async () => { await b.close(); });

describe('iframes', () => {
  it('reads a visible iframe (cross-origin: file:// frames are opaque origins) under its own region', async () => {
    const view = await b.open(fixture('iframe.html'));
    expect(view).toContain('[iframe "Payment"]');
    expect(view).toMatch(/#1\d{4} textbox "Card number" \(required\)/); // the frame's own number range
    expect(view).toMatch(/#1\d{4} button "Pay"/);
    expect(view).not.toContain('Hidden tracker'); // zero-size frames are skipped
    expect(view).toMatch(/#\d button "Back to cart"/);
  });

  it('acts inside the frame and reports what changed there', async () => {
    const view = await b.open(fixture('iframe.html'));
    const card = idOf(view, 'textbox "Card number"');
    expect(await b.type(card, '4242')).toContain(`typed "4242" into #${card} textbox "Card number"`);
    const res = await b.click(idOf(view, 'button "Pay"'));
    expect(res).toContain('"Paid with 4242"');
  });

  it('find() searches inside frames too', async () => {
    await b.open(fixture('iframe.html'));
    expect(await b.find('card number')).toMatch(/#1\d{4} textbox "Card number".*in \[main\] › \[iframe "Payment"\]/);
  });
});
