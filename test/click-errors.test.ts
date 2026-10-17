import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MantisBrowser } from '../src/index.js';
import { classifyClickError } from '../src/browser.js';
import { idOf } from './helpers.js';

let server: Server;
let base: string;
let destinationClicks = 0;
let b: MantisBrowser;

beforeAll(async () => {
  server = createServer((request, response) => {
    if (request.url === '/covered') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<title>Covered</title><style>#target,#cover{position:absolute;left:20px;top:20px;width:180px;height:40px}#cover{background:#ddd}</style><button id=target>Covered target</button><div id=cover>Overlay</div>');
      return;
    }
    if (request.url === '/unrelated') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<title>Unrelated</title><main>Unrelated navigation</main>');
      return;
    }
    if (request.url === '/late-action') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<title>Late action</title><a id=go href="/late-destination" aria-disabled=true>Late link</a><script>setTimeout(() => { document.querySelector("#go").removeAttribute("aria-disabled"); }, 400)</script>');
      return;
    }
    if (request.url === '/late-destination') {
      destinationClicks++;
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<title>Arrived</title><main>Destination loaded</main>');
      }, 4800);
      return;
    }
    if (request.url === '/slow-destination') {
      destinationClicks++;
      setTimeout(() => {
        response.writeHead(200, { 'content-type': 'text/html' });
        response.end('<title>Arrived</title><main>Destination loaded</main>');
      }, 1800);
      return;
    }
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<title>Start</title><a href="/slow-destination">Delayed destination</a>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  b = new MantisBrowser({ actionTimeoutMs: 1500 });
});

afterAll(async () => {
  await b.close();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('click errors and navigation', () => {
  it('dispatches one click and waits separately for a delayed navigation', async () => {
    destinationClicks = 0;
    const view = await b.open(base);
    const result = await b.click(idOf(view, 'link "Delayed destination"'));

    expect(result).toMatch(/^clicked #\d+ link "Delayed destination"/);
    expect(destinationClicks).toBe(1);
    expect(result).toContain('Destination loaded');
    expect(result).not.toContain('is not visible');
  });

  it('starts the navigation budget after a delayed link becomes actionable', async () => {
    destinationClicks = 0;
    const view = await b.open(`${base}/late-action`);
    const result = await b.click(idOf(view, 'link "Late link"'));

    expect(result).toMatch(/^clicked #\d+ link "Late link"/);
    expect(destinationClicks).toBe(1);
    expect(result).toContain('Destination loaded');
  });

  it('does not turn a covered click into success when an unrelated navigation intervenes', async () => {
    const view = await b.open(`${base}/covered`);
    const page = await (b as unknown as { activePage(): Promise<{ evaluate<T>(fn: () => T): Promise<T> }> }).activePage();
    await page.evaluate(() => { setTimeout(() => { location.href = '/unrelated'; }, 50); });

    const result = await b.click(idOf(view, 'button "Covered target"'));

    expect(result).toMatch(/^error:/);
    expect(result).not.toContain('clicked');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(await b.read()).toContain('Unrelated navigation');
  });

  it('reports a target hidden after its id was captured without dispatching a click', async () => {
    const view = await b.open(`data:text/html,${encodeURIComponent('<title>Hidden</title><a id=target href=#next onclick="window.clicks=(window.clicks||0)+1">Hideable link</a>')}`);
    const id = idOf(view, 'link "Hideable link"');
    const page = await (b as unknown as { activePage(): Promise<{ evaluate<T>(fn: () => T): Promise<T> }> }).activePage();
    await page.evaluate(() => {
      (document.getElementById('target') as HTMLElement).style.display = 'none';
    });

    const result = await b.click(id);

    expect(result).toMatch(/^error: #\d+ .*is not visible/);
    expect(await page.evaluate(() => (window as unknown as { clicks?: number }).clicks ?? 0)).toBe(0);
  });

  it('does not mistake successful actionability and scheduled navigation waits for invisibility', () => {
    const error = `TimeoutError: locator.click: Timeout 1500ms exceeded.\nCall log:\n  - waiting for element to be visible, enabled and stable\n  - element is visible, enabled and stable\n  - waiting for scheduled navigations to finish`;
    expect(classifyClickError(error)).toBeNull();
  });
});
