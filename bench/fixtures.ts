/** Local fixture pages served over http://127.0.0.1 (same bytes for every tool). */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { moreRoute } from './fixtures-more.js';

export interface FixtureObservation {
  path: string;
  kind: 'load' | 'click' | 'input' | 'change' | 'submit' | 'scroll' | 'settled';
  documentId: string;
  actionId?: number;
  target: { tag: string; id: string; name: string; type: string; ariaLabel: string; text: string; href: string; value: string; checked: boolean };
  controls: Record<string, { value: string; checked: boolean }>;
  text: string;
}

export interface FixtureCheckResult { ok: boolean; details?: string }
export type FixtureCheck = (events: FixtureObservation[]) => boolean | FixtureCheckResult;
export interface FixtureCheckEntry { taskId: string; check?: FixtureCheck }

/** Hidden benchmark instrumentation. It records ordinary DOM events and post-action page state. */
const attemptBootstrap = String.raw`<script>(() => {
  const prefix = location.pathname.match(/^\/__attempt\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (prefix) sessionStorage.setItem('__fixture_attempt', prefix[1]);
})();</script>`;

const observer = String.raw`<script>
(() => {
  const prefix = location.pathname.match(/^\/__attempt\/([A-Za-z0-9_-]+)(?:\/|$)/);
  if (prefix) sessionStorage.setItem('__fixture_attempt', prefix[1]);
  const token = sessionStorage.getItem('__fixture_attempt');
  if (!token) return;
  const documentId = Math.random().toString(36).slice(2);
  let actionSerial = 0;
  const summarize = (el) => {
    if (!(el instanceof Element)) el = document.documentElement;
    const target = el.closest('button,a,input,select,textarea,[role="menuitem"],[data-plan],[data-v]') || el;
    return {
      tag: target.tagName.toLowerCase(), id: target.id || '', name: target.getAttribute('name') || '',
      type: target.getAttribute('type') || '', ariaLabel: target.getAttribute('aria-label') || '',
      text: (target.innerText || target.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 160),
      href: target.getAttribute('href') || '', value: 'value' in target ? String(target.value) : '',
      checked: 'checked' in target ? Boolean(target.checked) : false
    };
  };
  const controls = () => {
    const result = {};
    for (const el of document.querySelectorAll('input,select,textarea')) {
      const value = { value: String(el.value), checked: Boolean(el.checked) };
      const key = el.id || (el.type === 'radio' ? el.name + ':' + el.value : el.name || el.type || el.tagName);
      result[key] = value;
      if (el.type === 'radio' && el.checked) result[el.name] = value;
    }
    return result;
  };
  const send = (kind, target, targetSummary, controlState, actionId) => {
    const data = { path: location.pathname.replace(/^\/__attempt\/[A-Za-z0-9_-]+/, '') || '/', kind, documentId, actionId, target: targetSummary || summarize(target), controls: controlState || controls(), text: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 5000) };
    pending++;
    fetch('/__verify/' + encodeURIComponent(token), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data), keepalive: true }).catch(() => {}).finally(() => { pending--; });
  };
  // Observations not yet received by the grader, so tests can wait for them deterministically.
  let pending = 0;
  Object.defineProperty(window, '__fixturePending', { get: () => pending });
  send('load', document.documentElement);
  for (const kind of ['click','input','change','submit','scroll']) {
    document.addEventListener(kind, (event) => {
      const actionId = ++actionSerial;
      const summary = summarize(event.target);
      const state = controls();
      send(kind, event.target, summary, state, actionId);
      setTimeout(() => send('settled', event.target, summary, state, actionId), 0);
    }, true);
  }
})();
</script>`;

function instrument(html: string): string {
  const bootstrapped = html.includes('</head>') ? html.replace('</head>', `${attemptBootstrap}</head>`) : `${attemptBootstrap}${html}`;
  return bootstrapped.includes('</body>') ? bootstrapped.replace('</body>', `${observer}</body>`) : `${bootstrapped}${observer}`;
}

interface AttemptState { taskId: string; events: FixtureObservation[]; pending: number; lastAt: number }

const newAttempt = (taskId: string): AttemptState => ({ taskId, events: [], pending: 0, lastAt: 0 });

/** Observations are posted asynchronously, so wait until none is in flight and none has arrived for a while. */
const QUIET_MS = 250;
const MAX_WAIT_MS = 3000;
async function quiet(state: AttemptState | undefined): Promise<void> {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (state && Date.now() < deadline && (state.pending > 0 || Date.now() - state.lastAt < QUIET_MS)) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const page = (title: string, body: string, script = ''): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;

const login = page(
  'Login — Acme',
  `<header><a href="/site/home">Home</a></header>
<main>
  <h1>Sign in</h1>
  <form aria-label="Login" id="f">
    <label for="email">Email</label>
    <input id="email" type="email" required>
    <label for="pw">Password</label>
    <input id="pw" type="password" required>
    <p id="err" role="alert"></p>
    <button type="submit">Sign in</button>
    <p>Forgot your password? <a href="/reset">Reset it</a></p>
  </form>
</main>`,
  `document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('pw').value;
    if (email !== 'agent@example.com' || password !== 'correct-horse-battery') {
      document.getElementById('err').textContent = 'Email or password is incorrect.';
      return;
    }
    document.title = 'Welcome — Acme';
    document.querySelector('h1').textContent = 'Signed in';
  });`,
);

const cookie = page(
  'Shop',
  `<main>
  <h1>Shop</h1>
  <p id="status">Cart is empty.</p>
  <button id="add">Add to cart</button>
  <a href="/more">More products</a>
</main>
<div id="overlay" style="position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10">
  <div role="dialog" aria-modal="true" aria-labelledby="ct" style="background:#fff;margin:100px auto;width:400px;padding:20px">
    <h2 id="ct">Accept cookies?</h2>
    <button onclick="document.getElementById('overlay').remove()">Accept</button>
    <button onclick="document.getElementById('overlay').remove()">Reject</button>
  </div>
</div>`,
  `document.getElementById('add').addEventListener('click', () => { document.getElementById('status').textContent = 'Added to cart (1 item).'; });`,
);

const N_ITEMS = 200;
const longlist = page(
  'Docs',
  `<header><a href="/site/home">Home</a></header>
<h1>Docs</h1>
<label for="flt">Filter</label>
<input id="flt" type="text" placeholder="Filter items">
<nav aria-label="Docs"><ul id="list">${Array.from({ length: N_ITEMS }, (_, i) => `<li><a href="/item/${i + 1}">Item ${i + 1}</a></li>`).join('')}</ul></nav>
<footer><p>${N_ITEMS} items</p></footer>`,
  `document.getElementById('flt').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    for (const li of document.querySelectorAll('#list li')) li.hidden = !li.textContent.toLowerCase().includes(q);
  });`,
);

const item = (n: string): string => page(`Item ${n}`, `<main><h1>Detail for item ${n}</h1><a href="/longlist">Back to the list</a></main>`);

const form = page(
  'Newsletter',
  `<main>
  <h1>Newsletter</h1>
  <form id="f" aria-label="Subscribe">
    <label for="c">Country</label>
    <select id="c"><option value="">Choose…</option><option value="us">United States</option><option value="ca">Canada</option><option value="de">Germany</option><option value="in">India</option></select>
    <label><input type="checkbox" id="n"> Send me the weekly newsletter</label>
    <button type="submit">Subscribe</button>
  </form>
  <p id="out"></p>
</main>`,
  `document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const c = document.getElementById('c');
    document.getElementById('out').textContent = 'Subscribed from ' + (c.selectedOptions[0].text) + ' (weekly: ' + (document.getElementById('n').checked ? 'yes' : 'no') + ').';
  });`,
);

const nav = (title: string, body: string): string =>
  page(
    title,
    `<header><nav aria-label="Main"><a href="/site/home">Home</a> <a href="/site/pricing">Pricing</a> <a href="/site/about">About</a></nav></header><main>${body}</main><footer><p>© Example Corp</p></footer>`,
  );

const site: Record<string, string> = {
  home: nav('Home — Example Corp', '<h1>Welcome to Example Corp</h1><p>We make widgets for people who like widgets.</p><a href="/site/pricing">See our pricing</a>'),
  pricing: nav(
    'Pricing — Example Corp',
    '<h1>Pricing</h1><ul><li>Starter: $9 per month</li><li>Team: $29 per month</li><li>Enterprise: contact us</li></ul><button>Start free trial</button>',
  ),
  about: nav('About — Example Corp', '<h1>About us</h1><p>Founded in 2019.</p>'),
};

const NAMES = ['Acme', 'Globex', 'Initech', 'Umbrella', 'Hooli', 'Stark', 'Wayne', 'Wonka', 'Tyrell', 'Cyberdyne'];
const rows = Array.from({ length: 60 }, (_, i) => {
  const name = `${NAMES[i % NAMES.length]} ${Math.floor(i / NAMES.length) + 1}`;
  const status = ['Active', 'Pending', 'Churned'][i % 3];
  const amount = (1000 + ((i * 7919) % 9000)).toLocaleString('en-US');
  return `<tr><td>${name}</td><td>${status}</td><td>$${amount}</td><td><button aria-label="Edit ${name}">Edit</button> <button aria-label="Archive ${name}">Archive</button></td></tr>`;
}).join('');
const dashboard = page(
  'Dashboard — Billing',
  `<header><a href="/site/home">Home</a> <a href="/site/pricing">Plans</a> <input type="search" aria-label="Search customers" placeholder="Search customers"></header>
<aside><nav aria-label="Sidebar"><a href="#">Overview</a> <a href="#">Customers</a> <a href="#">Invoices</a> <a href="#">Reports</a> <a href="#">Settings</a></nav></aside>
<main>
  <h1>Billing overview</h1>
  <p id="upd">Last updated: 10:00</p>
  <button id="ref">Refresh</button>
  <p>Total revenue: $123,456</p>
  <table><caption>Customers</caption><thead><tr><th>Name</th><th>Status</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${rows}</tbody></table>
</main>`,
  `document.getElementById('ref').addEventListener('click', () => { document.getElementById('upd').textContent = 'Last updated: just now'; });`,
);

function route(path: string): string | null {
  if (path === '/login') return login;
  if (path === '/cookie') return cookie;
  if (path === '/longlist') return longlist;
  if (path === '/form') return form;
  if (path === '/dashboard') return dashboard;
  const m = path.match(/^\/item\/(\d+)$/);
  if (m) return item(m[1]!);
  const s = path.match(/^\/site\/(\w+)$/);
  if (s && site[s[1]!]) return site[s[1]!]!;
  return null;
}

/** Start the fixture server on a random localhost port. Each attempt token has isolated evidence. */
export async function startFixtures(options: { checks?: FixtureCheckEntry[] } = {}): Promise<{
  base: string;
  baseFor: (taskId: string, attemptId: string) => string;
  verify: (taskId: string, attemptId?: string) => Promise<FixtureCheckResult | null>;
  close: () => Promise<void>;
}> {
  const checks = new Map((options.checks ?? []).map((entry) => [entry.taskId, entry.check]));
  const attempts = new Map<string, AttemptState>();
  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'POST' && url.pathname.startsWith('/__verify/')) {
      const token = decodeURIComponent(url.pathname.slice('/__verify/'.length));
      const pending = attempts.get(token);
      if (pending) { pending.pending++; pending.lastAt = Date.now(); }
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (part: string) => { body += part; });
      req.on('end', () => {
        try {
          const event = JSON.parse(body) as FixtureObservation;
          const state = attempts.get(token);
          if (state && event && typeof event.path === 'string' && Array.isArray(state.events)) state.events.push(event);
        } catch { /* malformed observation is ignored */ }
        if (pending) { pending.pending--; pending.lastAt = Date.now(); }
        res.writeHead(204).end();
      });
      return;
    }
    let path = url.pathname;
    const attemptPrefix = path.match(/^\/__attempt\/([A-Za-z0-9_-]+)(\/.*)?$/);
    if (attemptPrefix) {
      const token = attemptPrefix[1]!;
      path = attemptPrefix[2] || '/';
      if (!attempts.has(token)) attempts.set(token, newAttempt(''));
    }
    const more = moreRoute(path);
    if (more) {
      res.writeHead(200, { 'content-type': more.type }).end(more.type.startsWith('text/html') ? instrument(more.body) : more.body);
      return;
    }
    const html = route(path);
    if (html === null) {
      res.writeHead(404, { 'content-type': 'text/html' }).end(page('Not found', '<h1>Not found</h1>'));
    } else {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(instrument(html));
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    baseFor: (taskId, attemptId) => {
      if (!/^[A-Za-z0-9_-]+$/.test(attemptId)) throw new Error('attemptId must contain only letters, numbers, hyphens, and underscores');
      attempts.set(attemptId, newAttempt(taskId));
      return `${base}/__attempt/${encodeURIComponent(attemptId)}`;
    },
    verify: async (taskId, attemptId) => {
      if (attemptId === undefined) return null;
      const check = checks.get(taskId);
      if (!check) { attempts.delete(attemptId); return null; }
      // Let the final keepalive observations land, including after the agent closes its browser.
      const state = attempts.get(attemptId);
      await quiet(state);
      if (state && state.taskId !== taskId) return { ok: false, details: 'attempt belongs to a different task' };
      const events = state?.events ?? [];
      const result = check(events);
      attempts.delete(attemptId);
      return typeof result === 'boolean' ? { ok: result, details: result ? undefined : `fixture check failed (${events.length} observations)` } : result;
    },
    close: () => new Promise((ok) => server.close(() => ok())),
  };
}
