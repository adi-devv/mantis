/**
 * More local fixture pages for the real-agent eval (bench/agent/tasks.ts): forms, long reading,
 * lists, overlays, single-page navigation, dynamic widgets, an iframe and a chart. Each page has
 * one answer an agent must find; see the task that uses it.
 */
import { readFileSync } from 'node:fs';

export const page = (title: string, body: string, script = ''): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>` +
  `<style>body{font:16px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px}` +
  `.hidden{display:none}.err{color:#c00}.toast{position:fixed;bottom:16px;right:16px;background:#222;color:#fff;padding:8px 12px}` +
  `.modal{position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center}` +
  `.modal>div{background:#fff;padding:20px;min-width:300px}.card{cursor:pointer;border:1px solid #ccc;padding:12px;margin:8px 0}` +
  `.menu{position:absolute;background:#fff;border:1px solid #ccc;padding:4px}</style></head>` +
  `<body>${body}${script ? `<script>${script}</script>` : ''}</body></html>`;

// ---- forms -----------------------------------------------------------------

const signup = page(
  'Create account',
  `<main><h1>Create account</h1>
<form id="f" aria-label="Sign up" novalidate>
  <label for="em">Email</label> <input id="em" type="email"><br>
  <label for="pw">Password</label> <input id="pw" type="password"><br>
  <label for="pw2">Confirm password</label> <input id="pw2" type="password"><br>
  <p id="err" class="err" role="alert"></p>
  <button type="submit">Create account</button>
</form></main>`,
  `document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const em = document.getElementById('em').value, pw = document.getElementById('pw').value, pw2 = document.getElementById('pw2').value;
    const err = document.getElementById('err');
    if (pw.length < 8) { err.textContent = 'Password must be at least 8 characters.'; return; }
    if (pw !== pw2) { err.textContent = 'Passwords do not match.'; return; }
    document.querySelector('main').innerHTML = '<h1>Welcome, ' + em + '</h1><p>Your account is ready.</p>';
  });`,
);

const checkout = page(
  'Checkout',
  `<main><h1>Checkout</h1><p id="step">Step 1 of 3: Shipping</p>
<section id="s1" aria-label="Shipping">
  <label for="nm">Full name</label> <input id="nm"><br>
  <label for="city">City</label> <select id="city"><option value="">Choose…</option><option>Paris</option><option>Berlin</option><option>Madrid</option></select><br>
  <button id="n1">Next</button>
</section>
<section id="s2" aria-label="Delivery" class="hidden">
  <fieldset><legend>Delivery speed</legend>
    <label><input type="radio" name="d" value="std" checked> Standard (free)</label><br>
    <label><input type="radio" name="d" value="exp"> Express (+$7.50)</label>
  </fieldset>
  <button id="n2">Next</button>
</section>
<section id="s3" aria-label="Review" class="hidden">
  <p id="sum"></p><button id="place">Place order</button>
</section></main>`,
  `const $ = (id) => document.getElementById(id);
  const show = (n, label) => { for (const k of [1, 2, 3]) $('s' + k).classList.toggle('hidden', k !== n); $('step').textContent = 'Step ' + n + ' of 3: ' + label; };
  $('n1').onclick = () => { if (!$('nm').value || !$('city').value) { $('step').textContent = 'Step 1 of 3: Shipping — fill in name and city'; return; } show(2, 'Delivery'); };
  $('n2').onclick = () => {
    const exp = document.querySelector('input[name=d]:checked').value === 'exp';
    $('sum').textContent = 'Ship to ' + $('nm').value + ', ' + $('city').value + ' · ' + (exp ? 'Express' : 'Standard') + ' · Order total: $' + (exp ? '27.50' : '20.00');
    show(3, 'Review');
  };
  $('place').onclick = () => {
    const exp = $('sum').textContent.includes('Express');
    document.querySelector('main').innerHTML = '<h1>Thank you</h1><p>Order #A1042 confirmed. Total charged: $' + (exp ? '27.50' : '20.00') + '.</p>';
  };`,
);

const booking = page(
  'Book a table',
  `<main><h1>Book a table</h1>
<form id="f" aria-label="Booking">
  <label for="dt">Date</label> <input id="dt" type="date"><br>
  <label for="tm">Time</label> <select id="tm"><option>18:00</option><option>19:00</option><option>20:00</option></select><br>
  <label for="ppl">Guests</label> <input id="ppl" type="number" min="1" max="8" value="2"><br>
  <button type="submit">Book</button>
</form><p id="out" role="status"></p></main>`,
  `document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const d = document.getElementById('dt').value;
    document.getElementById('out').textContent = d ? 'Booked for ' + d + ' at ' + document.getElementById('tm').value + ', ' + document.getElementById('ppl').value + ' guests.' : 'Please choose a date.';
  });`,
);

// ---- reading ---------------------------------------------------------------

const FILLER = [
  'The coast here is shaped by tides that rise and fall twice a day, leaving long flats of sand and rock.',
  'Fishing villages grew along the bay, each with its own harbour wall and a small chapel facing the sea.',
  'Storms in winter could last for days, and ships often waited offshore for calmer water before entering.',
  'Local records describe the weather each morning, the boats that left, and the catch they brought back.',
  'Merchants trading wool and salt used the bay as a stopping point on the route between the northern ports.',
];
const article = page(
  'The Harbour Light — a history',
  `<main><article><h1>The Harbour Light</h1>
${Array.from({ length: 40 }, (_, i) =>
    i === 31
      ? '<p>After years of planning and two failed attempts to secure funding, the harbour light was finally lit for the first time in 1874, guiding ships past the northern reef.</p>'
      : `<p>${FILLER[i % FILLER.length]} (${i + 1})</p>`,
  ).join('\n')}
</article></main>`,
);

const PRODUCTS = Array.from({ length: 40 }, (_, i) => ({ name: `Widget ${i + 1}`, sku: `W-${1000 + i * 7}`, stock: (i * 37) % 120 }));
const table = page(
  'Inventory',
  `<main><h1>Inventory</h1><table><caption>Stock levels</caption><thead><tr><th>Product</th><th>SKU</th><th>In stock</th></tr></thead><tbody>
${PRODUCTS.map((p) => `<tr><td>${p.name}</td><td>${p.sku}</td><td>${p.stock}</td></tr>`).join('')}
</tbody></table></main>`,
);

// ---- lists -----------------------------------------------------------------

const ANIMALS = ['Otter', 'Lynx', 'Heron', 'Badger', 'Marten', 'Puffin', 'Ibex', 'Gecko', 'Tapir', 'Okapi'];
const RESULTS = Array.from({ length: 50 }, (_, i) => ({ title: `${ANIMALS[i % 10]} notes ${Math.floor(i / 10) + 1}`, author: `author${i + 1}` }));
RESULTS[37] = { title: 'Quokka facts', author: 'dana.r' };
const search = page(
  'Search results',
  `<main><h1>Results for "animals"</h1><ol id="res"></ol><nav aria-label="Pages" id="pg"></nav><div id="detail"></div></main>`,
  `const R = ${JSON.stringify(RESULTS)};
  let p = 0;
  function render() {
    document.getElementById('res').innerHTML = R.slice(p * 10, p * 10 + 10).map((r, i) => '<li><a href="#" data-i="' + (p * 10 + i) + '">' + r.title + '</a></li>').join('');
    document.getElementById('pg').innerHTML = (p > 0 ? '<button data-p="' + (p - 1) + '">Previous</button> ' : '') + 'Page ' + (p + 1) + ' of 5' + (p < 4 ? ' <button data-p="' + (p + 1) + '">Next</button>' : '');
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p]'); if (b) { p = Number(b.dataset.p); document.getElementById('detail').textContent = ''; render(); return; }
    const a = e.target.closest('[data-i]'); if (a) { e.preventDefault(); const r = R[a.dataset.i]; document.getElementById('detail').innerHTML = '<h2>' + r.title + '</h2><p>Written by ' + r.author + '.</p>'; }
  });
  render();`,
);

const feed = page(
  'Feed',
  `<main><h1>Feed</h1><div id="feed" aria-label="Posts"></div><p id="more">Loading more…</p></main>`,
  `let n = 0;
  function load() { const f = document.getElementById('feed'); for (let k = 0; k < 10 && n < 60; k++) { n++; f.insertAdjacentHTML('beforeend', '<article style="height:120px"><h3>Post #' + n + '</h3><p>' + (n === 35 ? 'The meeting moved to Thursday at noon.' : 'Nothing special in post ' + n + '.') + '</p></article>'); } }
  load();
  addEventListener('scroll', () => { if (innerHeight + scrollY >= document.body.scrollHeight - 200) load(); });`,
);

// ---- overlays --------------------------------------------------------------

const files = page(
  'Files',
  `<main><h1>Files</h1><ul id="list">
${['Budget 2026', 'Old report', 'Team photo', 'Roadmap'].map((f) => `<li>${f} <button aria-label="Delete ${f}">🗑</button></li>`).join('')}
</ul></main><div id="modal"></div><div id="toast"></div>`,
  `document.getElementById('list').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const name = b.getAttribute('aria-label').replace('Delete ', '');
    document.getElementById('modal').innerHTML = '<div class="modal" role="dialog" aria-label="Confirm delete"><div><p>Delete "' + name + '"? This cannot be undone.</p><button id="yes">Delete</button> <button id="no">Cancel</button></div></div>';
    document.getElementById('yes').onclick = () => { b.parentElement.remove(); document.getElementById('modal').innerHTML = ''; const t = document.getElementById('toast'); t.innerHTML = '<div class="toast" role="status">' + name + ' was moved to trash.</div>'; };
    document.getElementById('no').onclick = () => { document.getElementById('modal').innerHTML = ''; };
  });`,
);

const account = page(
  'Home',
  `<header><span>Acme app</span> <button id="acct" aria-haspopup="menu" aria-expanded="false">Account ▾</button><div id="menu"></div></header>
<main id="m"><h1>Home</h1><p>Welcome back.</p></main><div id="toast"></div>`,
  `const acct = document.getElementById('acct');
  acct.onclick = () => {
    const open = acct.getAttribute('aria-expanded') === 'true';
    acct.setAttribute('aria-expanded', String(!open));
    document.getElementById('menu').innerHTML = open ? '' : '<div class="menu" role="menu"><div role="menuitem" tabindex="0" id="mi-profile">Profile</div><div role="menuitem" tabindex="0" id="mi-settings">Settings</div><div role="menuitem" tabindex="0">Sign out</div></div>';
    const s = document.getElementById('mi-settings');
    if (s) s.onclick = () => {
      acct.click();
      document.getElementById('m').innerHTML = '<h1>Settings</h1><fieldset><legend>Theme</legend><label><input type="radio" name="t" value="Light" checked> Light</label> <label><input type="radio" name="t" value="Dark"> Dark</label></fieldset><button id="save">Save</button>';
      document.getElementById('save').onclick = () => { document.getElementById('toast').innerHTML = '<div class="toast" role="status">Theme saved: ' + document.querySelector('input[name=t]:checked').value + '</div>'; };
    };
  };`,
);

// ---- navigation ------------------------------------------------------------

const PEOPLE = [
  ['Sam Lee', 'Engineer', 'sam@example.com'], ['Mia Wong', 'Designer', 'mia@example.com'],
  ['Raj Patel', 'Product manager', 'raj@example.com'], ['Ana Silva', 'Engineer', 'ana@example.com'],
];
const spa = page(
  'Acme',
  `<header><nav aria-label="App"><button data-v="home">Overview</button> <button data-v="team">Team</button> <button data-v="billing">Billing</button></nav></header><main id="view"></main>`,
  `const P = ${JSON.stringify(PEOPLE)};
  const V = {
    home: '<h1>Overview</h1><p>3 projects active.</p>',
    team: '<h1>Team</h1><ul>' + P.map((p) => '<li><button class="person" data-e="' + p[2] + '">' + p[0] + '</button> — ' + p[1] + '</li>').join('') + '</ul><div id="card"></div>',
    billing: '<h1>Billing</h1><p>Plan: Team, $29 per month.</p>',
  };
  const go = (v) => { document.getElementById('view').innerHTML = V[v]; history.replaceState(null, '', '#' + v); };
  document.addEventListener('click', (e) => {
    const n = e.target.closest('[data-v]'); if (n) go(n.dataset.v);
    const p = e.target.closest('.person'); if (p) document.getElementById('card').innerHTML = '<p>Email: ' + p.dataset.e + '</p>';
  });
  go('home');`,
);

// ---- dynamic ---------------------------------------------------------------

const plans = page(
  'Plans',
  `<main id="app"><h1>Choose a plan</h1>
<div class="card" data-plan="basic"><strong>Basic</strong> <span>$5 / month</span></div>
<div class="card" data-plan="pro"><strong>Pro</strong> <span>$15 / month</span></div>
<div class="card" data-plan="team"><strong>Team</strong> <span>$29 / month</span></div>
<p id="out"></p></main>`,
  `document.getElementById('app').addEventListener('click', (e) => {
    const c = e.target.closest('.card');
    if (c) document.getElementById('out').textContent = 'You chose the ' + c.dataset.plan + ' plan. Confirmation code ' + c.dataset.plan.toUpperCase() + '-77.';
  });`,
);

// Answers are added only when their question is opened, so no tool can read them without the click.
const FAQ = [
  ['How do I reset my password?', 'Use the "Forgot password" link on the sign-in page.'],
  ['Can I change my plan?', 'Yes, from Settings → Billing, at any time.'],
  ['What is your refund policy?', 'You can ask for a full refund within 30 days of purchase.'],
  ['Do you offer discounts?', 'Students get 20% off with a valid student email.'],
];
const faq = page(
  'Help',
  `<main><h1>Help centre</h1>
${FAQ.map(([q], i) => `<h2><button aria-expanded="false" aria-controls="a${i}">${q}</button></h2><div id="a${i}" hidden></div>`).join('\n')}
</main>`,
  `const A = ${JSON.stringify(FAQ.map(([, a]) => a))};
  document.querySelectorAll('h2 button').forEach((b, i) => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') === 'true';
    b.setAttribute('aria-expanded', String(!open));
    const panel = document.getElementById(b.getAttribute('aria-controls'));
    panel.innerHTML = open ? '' : '<p>' + A[i] + '</p>';
    panel.hidden = open;
  }));`,
);

const payOuter = page(
  'Checkout — Acme',
  `<main><h1>Checkout</h1><p>Total: $49.00</p><iframe title="Secure payment" src="/pay/inner" width="420" height="220" style="border:1px solid #ccc"></iframe></main>`,
);
const payInner = page(
  'Card payment',
  `<form id="f" aria-label="Card details">
  <label for="cn">Card number</label> <input id="cn" inputmode="numeric"><br>
  <label for="ex">Expiry (MM/YY)</label> <input id="ex"><br>
  <label for="cvc">CVC</label> <input id="cvc"><br>
  <button type="submit">Pay $49.00</button>
</form><p id="out" role="status"></p>`,
  `document.getElementById('f').addEventListener('submit', (e) => {
    e.preventDefault();
    const n = document.getElementById('cn').value.replace(/\\s/g, '');
    document.getElementById('out').textContent = n === '4242424242424242' && document.getElementById('ex').value === '12/30' && document.getElementById('cvc').value === '123'
      ? 'Payment approved. Receipt R-5531.' : 'Payment declined: check the card details.';
  });`,
);

// ---- visual ----------------------------------------------------------------

const chart = page(
  'Sales report',
  `<main><h1>Sales report</h1><p>Monthly sales, first half of the year.</p><div style="width:600px;height:320px"><canvas id="c"></canvas></div></main>
<script src="/vendor/chart.js"></script>`,
  `new Chart(document.getElementById('c'), { type: 'bar', data: { labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    datasets: [{ label: 'Units sold', data: [18, 25, 42, 31, 37, 29] }] }, options: { animation: false } });`,
);

let chartJs: string | null = null;
function chartLib(): string {
  chartJs ??= readFileSync(new URL('../node_modules/chart.js/dist/chart.umd.js', import.meta.url), 'utf8');
  return chartJs;
}

const PAGES: Record<string, string> = {
  '/signup': signup, '/checkout': checkout, '/booking': booking, '/article': article, '/inventory': table,
  '/search': search, '/feed': feed, '/files': files, '/account': account, '/app': spa, '/plans': plans,
  '/help': faq, '/pay': payOuter, '/pay/inner': payInner, '/chart': chart,
};

/** Serve one of these pages (or a vendor script they need); null if the path is not ours. */
export function moreRoute(path: string): { body: string; type: string } | null {
  if (path === '/vendor/chart.js') return { body: chartLib(), type: 'text/javascript; charset=utf-8' };
  const html = PAGES[path];
  return html === undefined ? null : { body: html, type: 'text/html; charset=utf-8' };
}

