import { describe, expect, it } from 'vitest';
import type { RawNode, Snapshot } from '../src/capture/index.js';
import { estimateTokens, translate } from '../src/translate.js';

const link = (id: number, name: string, inViewport = true, parent = -1): RawNode => ({
  kind: 'interactive', id, role: 'link', name, states: [], parent, depth: 0, inViewport, covered: false,
});
const text = (name: string, inViewport = true): RawNode => ({
  kind: 'text', role: 'text', name, states: [], parent: -1, depth: 0, inViewport, covered: false,
});
const snap = (nodes: RawNode[]): Snapshot => ({ url: 'https://x.test/', title: 'T', nodes, truncated: false });

describe('translate', () => {
  it('estimates tokens as ceil(chars/4)', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('')).toBe(0);
  });

  it('collapses only runs longer than 8', () => {
    const eight = translate(snap(Array.from({ length: 8 }, (_, i) => link(i + 1, `L${i + 1}`))));
    expect(eight).not.toContain('more');
    const nine = translate(snap(Array.from({ length: 9 }, (_, i) => link(i + 1, `L${i + 1}`))));
    expect(nine).toContain('…and 4 more links (#6–#9)');
  });

  it('pluralises -x roles with es', () => {
    const boxes: RawNode[] = Array.from({ length: 10 }, (_, i) => ({ ...link(i + 1, `B${i}`), role: 'textbox' }));
    expect(translate(snap(boxes))).toContain('more textboxes (#6–#10)');
  });

  it('drops offscreen text first and notes the trim once over budget', () => {
    const nodes: RawNode[] = [link(1, 'Top')];
    for (let i = 0; i < 40; i++) nodes.push(text(`Offscreen note number ${i} with padding text`, false));
    nodes.push(link(2, 'Bottom', false));
    const full = translate(snap(nodes), 1_000_000);
    expect(full).toContain('Offscreen note number 0');
    expect(full).not.toContain('trimmed');
    const trimmed = translate(snap(nodes), 600);
    expect(trimmed).not.toContain('Offscreen note');
    expect(trimmed).toContain('link "Bottom"'); // offscreen controls survive while they fit
    expect(trimmed).toMatch(/\(trimmed: 40 items offscreen — scroll or read again\)$/);
  });

  it('stays within the budget and says so when it has to cut lines', () => {
    // alternate roles so nothing collapses
    const nodes = Array.from({ length: 300 }, (_, i) => ({ ...link(i + 1, `Distinct item ${i}`), role: i % 2 ? 'link' : 'button' }));
    const out = translate(snap(nodes), 1500);
    expect(out.length).toBeLessThanOrEqual(1500);
    expect(out).toMatch(/\(trimmed: \d+ (more lines|items offscreen)/);
  });
});
