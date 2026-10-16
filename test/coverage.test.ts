/**
 * The accessibility tree is the floor: every name Chrome's own accessibility tree exposes on a
 * page must be reachable through Mantis, either in read() or via find() (or media() for images).
 * Trimming may shorten the view, but it must never make something unreachable.
 */
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import { MantisBrowser } from '../src/index.js';
import { chromiumExecutable } from '../src/userAgent.js';
import { startFixtures } from '../bench/fixtures.js';
import { fixture } from './helpers.js';

// Pages whose point is something other than reading (human hand-off, OCR of pixels, CAPTCHAs), and
// hidden.html: elements a person cannot see (opacity 0, zero size, off screen, collapsed). The tree
// keeps them; Mantis drops them on purpose (tested in reading.test.ts).
const SKIP = new Set(['human.html', 'ocr.html', 'captcha.html', 'invisible-captcha.html', 'bigcanvas.html', 'hidden.html']);
const PAGES = readdirSync(resolve(import.meta.dirname, 'fixtures')).filter((f) => f.endsWith('.html') && !SKIP.has(f));

// Roles that carry no information of their own (containers, structure).
const STRUCTURAL = new Set([
  'RootWebArea', 'generic', 'none', 'presentation', 'InlineTextBox', 'LineBreak', 'ListMarker', 'list', 'listitem',
  'paragraph', 'group', 'section', 'Section', 'region', 'main', 'navigation', 'banner', 'contentinfo', 'complementary',
  'form', 'table', 'rowgroup', 'row', 'LayoutTable', 'LayoutTableRow', 'LayoutTableCell', 'Canvas', 'figure', 'article',
  'DescriptionList', 'term', 'definition', 'blockquote', 'Abbr', 'emphasis', 'strong', 'code', 'time', 'superscript', 'subscript',
  'mark', 'cell', 'gridcell', // a cell's name is its contents glued together; the contents are checked one by one
  'Iframe', // a frame's title is a label; its contents are checked (zero-size frames are invisible and dropped)
  'MenuListPopup', 'MenuListOption', 'option', 'dialog', 'alertdialog', 'status', 'alert', 'log', 'document', 'application',
]);

const norm = (s: string): string => s.replace(/\s+/g, ' ').replace(/"/g, "'").trim().toLowerCase();

interface AxNode { ignored?: boolean; role?: { value?: string }; name?: { value?: string } }

// The benchmark's local pages too.
const BENCH_PAGES = ['/login', '/cookie', '/longlist', '/form', '/dashboard', '/site/home', '/site/pricing', '/site/about', '/item/150'];

let chrome: Browser;
let mantis: MantisBrowser;
let bench: Awaited<ReturnType<typeof startFixtures>>;
beforeAll(async () => {
  chrome = await chromium.launch(chromiumExecutable());
  mantis = new MantisBrowser();
  bench = await startFixtures();
});
afterAll(async () => {
  await mantis.close();
  await chrome.close();
  await bench.close();
});

/** Every (role, name) Chrome's accessibility tree exposes on the page, minus structure. */
async function axNames(url: string): Promise<{ role: string; name: string }[]> {
  const page = await chrome.newPage({ viewport: { width: 1280, height: 800 } });
  try {
    await page.goto(url);
    await page.waitForTimeout(300);
    const cdp = await page.context().newCDPSession(page);
    const { nodes } = (await cdp.send('Accessibility.getFullAXTree')) as { nodes: AxNode[] };
    const out = new Map<string, { role: string; name: string }>();
    for (const n of nodes) {
      const role = n.role?.value ?? '';
      const name = (n.name?.value ?? '').replace(/\s+/g, ' ').trim();
      if (n.ignored || !name || STRUCTURAL.has(role) || !/[\p{L}\p{N}]/u.test(name)) continue;
      out.set(`${role}|${name}`, { role, name });
    }
    return [...out.values()];
  } finally {
    await page.close();
  }
}

async function check(url: string, label: string): Promise<void> {
  const ax = await axNames(url);
  const view = norm(await mantis.open(url));
  let media: string | null = null;
  const missing: string[] = [];
  for (const { role, name } of ax) {
    const n = norm(name);
    if (view.includes(n)) continue;
    // Long text is clipped in the view (…); find() searches the untrimmed page.
    const probe = name.length > 60 ? name.slice(0, 60) : name;
    if (!(await mantis.find(probe)).startsWith('no control or text')) continue;
    // Images, SVG and canvas: the fallback ladder, media() then data(id) for each item.
    if (media === null) {
      const list = await mantis.media();
      const ids = [...list.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
      const data = await Promise.all([...new Set(ids)].map((id) => mantis.data({ id })));
      media = norm([list, ...data].join('\n'));
    }
    if (media.includes(n)) continue;
    missing.push(`${role} "${name}"`);
  }
  expect(missing, `reachable in Chrome's accessibility tree but not through Mantis on ${label}`).toEqual([]);
}

describe('nothing the accessibility tree shows is lost', () => {
  for (const file of PAGES) it(file, () => check(fixture(file), file));
  for (const path of BENCH_PAGES) it(`bench ${path}`, () => check(bench.base + path, path));
});
