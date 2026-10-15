/** Local fixture pages served over http://127.0.0.1 (same bytes for every tool). */
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { moreRoute } from './fixtures-more.js';

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
    <button type="submit">Sign in</button>
    <p>Forgot your password? <a href="/reset">Reset it</a></p>
  </form>
</main>`,
  `document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
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

/** Start the fixture server on a random localhost port. */
export async function startFixtures(): Promise<{ base: string; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    const more = moreRoute(path);
    if (more) {
      res.writeHead(200, { 'content-type': more.type }).end(more.body);
      return;
    }
    const html = route(path);
    if (html === null) {
      res.writeHead(404, { 'content-type': 'text/html' }).end(page('Not found', '<h1>Not found</h1>'));
    } else {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
    }
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, close: () => new Promise((ok) => server.close(() => ok())) };
}
