import type { ElementHandle, Page } from 'playwright';
import { makeProbe } from './probe.js';
import type { ChartData, DataItem, MediaList } from './probe.js';

/** How the agent points at a visual element: a number from read()/media(), or a CSS selector. */
export interface Target {
  id?: number;
  selector?: string;
}

/** Cap for the text `data()` returns. */
export const DATA_CHARS = 1500;

// Built with the Function constructor so Playwright passes the element in (string form would not).
const DESCRIBE = new Function('el', `return (${makeProbe.toString()})().describe(el)`) as (el: Element) => DataItem[];
const INSTALL = `(${makeProbe.toString()})()`;

/** Visible images / canvases / chart-like SVGs, each with a number from the shared registry. */
export async function listMedia(page: Page): Promise<string> {
  const res = (await page.evaluate(`${INSTALL}.list()`)) as MediaList;
  if (!res.entries.length) return 'no images, canvases or charts on this page';
  const lines = res.entries.map((e) => `#${e.id} ${e.kind} ${e.text}`);
  if (res.more) lines.push(`…and ${res.more} more`);
  lines.push('use data({id: N}) for hidden text, ocr({id: N}) for text in pixels, look({id: N}) only as a last resort');
  return lines.join('\n');
}

/** Run the in-page `describe` on one element. */
export async function describeElement(el: ElementHandle<Element>): Promise<DataItem[]> {
  return (await el.evaluate(DESCRIBE)) as DataItem[];
}

function table(c: ChartData, budget: number): string[] {
  const head = `${c.lib}${c.type ? ` ${c.type}` : ''} chart${c.title ? ` "${c.title}"` : ''}`;
  const n = Math.max(c.labels.length, ...c.series.map((s) => s.values.length), 0);
  if (!n || !c.series.length) return [head, '(no data points)'];
  const cols = ['', ...c.series.map((s, i) => s.name || `series ${i + 1}`)];
  const rows: string[] = [];
  let used = head.length + cols.join(' | ').length + 2;
  let shown = 0;
  for (let i = 0; i < n; i++) {
    const row = [c.labels[i] ?? String(i + 1), ...c.series.map((s) => String(s.values[i] ?? ''))].join(' | ');
    if (used + row.length + 1 > budget && shown >= 3) break;
    rows.push(row);
    used += row.length + 1;
    shown++;
  }
  if (shown < n) rows.push(`…${n - shown} more rows`);
  if (!c.labels.length) cols[0] = '#';
  return [head, cols.join(' | '), ...rows];
}

const DESCRIPTIVE = /^(alt: (?!\()|title:|caption:|aria-label:|longdesc:|text \(|desc:|tooltips \(|fallback content:)/;

/** Compact text for `data()`; nothing found -> a pointer to the next rung of the ladder. */
export function formatData(label: string, items: DataItem[]): string {
  const found = items.some((it) => it.charts.length > 0 || it.lines.some((l) => DESCRIPTIVE.test(l)));
  if (!found) {
    const facts = items.flatMap((it) => it.lines.filter((l) => /^(file|alt|size): /.test(l)));
    return `${label}: no hidden text or chart data found${facts.length ? ` (${facts.join('; ')})` : ''}. Try ocr({id: N}) for text drawn in pixels, or look({id: N}) as a last resort.`;
  }
  const multi = items.length > 1;
  const budget = Math.max(400, Math.floor(DATA_CHARS / items.length));
  const blocks = items.map((it) => {
    const lines = multi ? [`${it.kind}:`] : [];
    lines.push(...it.lines);
    for (const c of it.charts) lines.push(...table(c, budget));
    return lines.join('\n');
  });
  const text = `${label}\n${blocks.join('\n')}`;
  return text.length > DATA_CHARS ? text.slice(0, DATA_CHARS - 1).trimEnd() + '…' : text;
}
