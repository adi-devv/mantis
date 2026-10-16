/**
 * Long multi-step fixture pages for the real-agent eval (bench/agent/tasks.ts, category "long"):
 * a paged shop through payment, a paged admin bulk edit, a five-step onboarding wizard and a
 * comparison across seven product pages. Each needs roughly 15–40 actions. Pages carry ordinary
 * site chrome (navigation, footer) so the size of what a tool returns per step matters.
 *
 * Each result carries a code hashed from the final state, so an answer is right only when every
 * requested change, and nothing else, was made.
 */
import { page } from './fixtures-more.js';

/** Shared by the page scripts and by the expected answers below, so both hash the same way. */
const HELPERS = String.raw`function code(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0; return String(1000 + (h % 9000)); }
function norm(s) { return String(s).trim().toLowerCase().replace(/\s+/g, ' '); }
const $ = (id) => document.getElementById(id);
`;
const { code, norm } = new Function(`${HELPERS}return { code, norm };`)() as { code: (s: string) => string; norm: (s: string) => string };

const NAV = ['New in', 'Women', 'Men', 'Kids', 'Home & living', 'Kitchen', 'Outdoor', 'Gifts', 'Sale', 'Brands', 'Journal', 'Stores', 'Help', 'Account'];
const FOOT = ['About us', 'Careers', 'Press', 'Sustainability', 'Affiliates', 'Contact', 'Shipping', 'Returns', 'Order status', 'Size guide', 'Gift cards', 'Student discount',
  'Privacy', 'Terms', 'Cookies', 'Accessibility', 'Sitemap', 'Instagram', 'YouTube', 'Newsletter'];
const header = (site: string): string =>
  `<header><nav aria-label="Main"><a href="#top"><b>${site}</b></a> ${NAV.map((n) => `<a href="#${n.toLowerCase().replace(/\W+/g, '-')}">${n}</a>`).join(' · ')}</nav></header>`;
const footer = (site: string): string =>
  `<footer><hr><nav aria-label="Footer">${FOOT.map((n) => `<a href="#${n.toLowerCase().replace(/\W+/g, '-')}">${n}</a>`).join(' · ')}</nav><p><small>© 2026 ${site}. All prices include VAT.</small></p></footer>`;
const site = (name: string, title: string, main: string, script = ''): string =>
  page(title, `${header(name)}<main>${main}</main>${footer(name)}`, script ? HELPERS + script : '');

// ---- shop: 48 products over 4 pages, cart, coupon, shipping, payment --------

const PRODUCT_NAMES = [
  'Trail Mug', 'Oak Cutting Board', 'Trail Mug Lid', 'Cast Iron Skillet', 'Wool Throw', 'Bamboo Utensil Set', 'Glass Jar Trio', 'Enamel Colander', 'Cotton Napkins', 'Pour-over Kettle', 'Stoneware Bowl', 'Herb Planter',
  'Canvas Tote', 'Leather Card Wallet', 'Canvas Tote Mini', 'Waxed Backpack', 'Travel Pouch', 'Linen Shopper', 'Duffel Weekender', 'Laptop Sleeve', 'Market Basket', 'Trail Mug XL', 'Sling Bag', 'Packable Daypack',
  'Beeswax Wrap', 'Beeswax Wrap Set', 'Linen Tea Towel', 'Soy Candle', 'Clay Diffuser', 'Brass Bottle Opener', 'Olive Wood Spoon', 'Spice Tin Set', 'Ceramic Teapot', 'Copper Measuring Cups', 'Marble Coaster Set', 'Reusable Straw Kit',
  'Camp Lantern', 'Folding Stool', 'Linen Apron (Kids)', 'Picnic Blanket', 'Insulated Bottle', 'Linen Apron', 'Hammock', 'Trail Mug Set', 'Fire Starter Kit', 'Enamel Plate', 'Compact Stove', 'Seed Starter Kit',
];
const PRODUCT_PRICES = [1400, 3800, 450, 5400, 6900, 1650, 2400, 2900, 1800, 4600, 1350, 2100, 2250, 3400, 1600, 8900, 1500, 2700, 9900, 3100, 3600, 1800, 4200, 5500,
  850, 2200, 1200, 2600, 3300, 1100, 950, 2800, 4400, 2350, 1900, 1250, 3900, 2950, 2400, 4800, 2700, 3100, 7200, 4900, 1700, 1300, 6400, 1550];
const PRODUCTS = PRODUCT_NAMES.map((name, i) => [`p${String(i + 1).padStart(2, '0')}`, name, PRODUCT_PRICES[i]!] as const);
const SHOP_ORDER = { 'Trail Mug': 2, 'Canvas Tote': 1, 'Beeswax Wrap': 3, 'Linen Apron': 1 } as Record<string, number>;
const SHOP_SHIP = ['Grace Hopper', '12 Navy Way', 'Arlington', '22201'];

const shop = site('Hearth & Trail', 'Shop — Hearth & Trail', `<h1>Shop</h1>
<p><button id="cartbtn">Cart (0)</button> <span id="toast" role="status"></span></p>
<section id="v-catalog" aria-label="Catalog">
  <p><label for="q">Search products</label> <input id="q" type="search"></p>
  <div id="grid"></div>
  <p><button id="prev">Previous page</button> <span id="pageinfo"></span> <button id="next">Next page</button></p>
</section>
<section id="v-cart" aria-label="Cart" hidden>
  <h2>Your cart</h2>
  <table><thead><tr><th>Product</th><th>Price</th><th>Quantity</th><th></th></tr></thead><tbody id="lines"></tbody></table>
  <p><label for="coupon">Coupon code</label> <input id="coupon"> <button id="apply">Apply</button> <span id="cmsg"></span></p>
  <p id="sub"></p>
  <p><button id="shopmore">Continue shopping</button> <button id="tocheckout">Checkout</button> <span id="kmsg" class="err"></span></p>
</section>
<section id="v-ship" aria-label="Shipping" hidden>
  <h2>Shipping</h2>
  <label for="fn">Full name</label> <input id="fn"><br>
  <label for="st">Street address</label> <input id="st"><br>
  <label for="ci">City</label> <input id="ci"><br>
  <label for="zip">ZIP code</label> <input id="zip"><br>
  <fieldset><legend>Delivery</legend>
    <label><input type="radio" name="dl" value="std" checked> Standard ($4.99)</label>
    <label><input type="radio" name="dl" value="exp"> Express ($12.00)</label>
  </fieldset>
  <p><button id="tocart">Back to cart</button> <button id="topay">Continue to payment</button> <span id="smsg" class="err"></span></p>
</section>
<section id="v-pay" aria-label="Payment" hidden>
  <h2>Payment</h2><p id="due"></p>
  <form id="pf" aria-label="Card details">
    <label for="cn">Card number</label> <input id="cn" inputmode="numeric"><br>
    <label for="ex">Expiry (MM/YY)</label> <input id="ex"><br>
    <label for="cvc">CVC</label> <input id="cvc"><br>
    <button id="pay" type="submit">Pay now</button> <span id="pmsg" class="err"></span>
  </form>
</section>
<section id="v-done" aria-label="Order confirmation" hidden></section>`,
String.raw`const P = ${JSON.stringify(PRODUCTS)};
const byId = Object.fromEntries(P.map((p) => [p[0], p]));
const st = { page: 0, cart: {}, coupon: '' };
const money = (c) => '$' + (c / 100).toFixed(2);
const sub = () => Object.keys(st.cart).reduce((s, id) => s + byId[id][2] * st.cart[id], 0);
const disc = () => st.coupon === 'SPRING10' ? Math.round(sub() / 10) : 0;
const shipping = () => document.querySelector('input[name="dl"]:checked').value === 'exp' ? 1200 : 499;
const show = (v) => { for (const k of ['catalog', 'cart', 'ship', 'pay', 'done']) $('v-' + k).hidden = k !== v; if (v === 'cart') lines(); if (v === 'pay') $('due').textContent = 'Total to pay: ' + money(sub() - disc() + shipping()); };
const count = () => { $('cartbtn').textContent = 'Cart (' + Object.values(st.cart).reduce((a, b) => a + b, 0) + ')'; };
function grid() {
  const q = norm($('q').value), items = P.filter((p) => !q || p[1].toLowerCase().includes(q));
  const pages = Math.max(1, Math.ceil(items.length / 12));
  st.page = Math.min(st.page, pages - 1);
  $('grid').innerHTML = items.slice(st.page * 12, st.page * 12 + 12).map((p) => '<article class="card" aria-label="' + p[1] + '"><h3>' + p[1] + '</h3><p>' + money(p[2]) + '</p><button data-add="' + p[0] + '">Add to cart</button></article>').join('') || '<p>No products match.</p>';
  $('pageinfo').textContent = 'Page ' + (st.page + 1) + ' of ' + pages;
  $('prev').disabled = st.page === 0; $('next').disabled = st.page >= pages - 1;
}
function totals() { $('sub').textContent = 'Subtotal: ' + money(sub()) + (disc() ? ' · Discount: -' + money(disc()) : ''); }
function lines() {
  const ids = Object.keys(st.cart).filter((id) => st.cart[id] > 0);
  $('lines').innerHTML = ids.length ? ids.map((id) => '<tr><td>' + byId[id][1] + '</td><td>' + money(byId[id][2]) + '</td><td><input type="number" min="0" data-qty="' + id + '" value="' + st.cart[id] + '" aria-label="Quantity for ' + byId[id][1] + '"></td><td><button data-rm="' + id + '">Remove ' + byId[id][1] + '</button></td></tr>').join('') : '<tr><td colspan="4">Your cart is empty.</td></tr>';
  totals();
}
$('grid').addEventListener('click', (e) => {
  const id = e.target.closest('[data-add]')?.dataset.add; if (!id) return;
  st.cart[id] = (st.cart[id] || 0) + 1; count();
  $('toast').textContent = 'Added ' + byId[id][1] + ' (' + st.cart[id] + ' in cart)';
});
$('q').addEventListener('input', () => { st.page = 0; grid(); });
$('prev').onclick = () => { st.page--; grid(); };
$('next').onclick = () => { st.page++; grid(); };
$('cartbtn').onclick = () => show('cart');
$('lines').addEventListener('change', (e) => {
  const id = e.target.dataset.qty; if (!id) return;
  const n = Math.max(0, parseInt(e.target.value, 10) || 0);
  if (n) st.cart[id] = n; else delete st.cart[id];
  count(); totals();
});
$('lines').addEventListener('click', (e) => { const id = e.target.dataset.rm; if (id) { delete st.cart[id]; count(); lines(); } });
$('apply').onclick = () => {
  const c = $('coupon').value.trim().toUpperCase();
  if (c === 'SPRING10') { st.coupon = c; $('cmsg').textContent = 'Coupon SPRING10 applied: 10% off.'; } else { st.coupon = ''; $('cmsg').textContent = 'Coupon not valid.'; }
  totals();
};
$('shopmore').onclick = () => show('catalog');
$('tocheckout').onclick = () => { if (!sub()) { $('kmsg').textContent = 'Your cart is empty.'; return; } show('ship'); };
$('tocart').onclick = () => show('cart');
$('topay').onclick = () => {
  if (['fn', 'st', 'ci', 'zip'].some((id) => !$(id).value.trim())) { $('smsg').textContent = 'Fill in every field.'; return; }
  if (!/^\d{5}$/.test($('zip').value.trim())) { $('smsg').textContent = 'ZIP code must be 5 digits.'; return; }
  $('smsg').textContent = ''; show('pay');
};
$('pf').addEventListener('submit', (e) => {
  e.preventDefault();
  if ($('cn').value.replace(/\s/g, '') !== '4242424242424242' || $('ex').value.trim() !== '12/30' || $('cvc').value.trim() !== '123') { $('pmsg').textContent = 'Payment declined: check the card details.'; return; }
  const dl = document.querySelector('input[name="dl"]:checked').value;
  const items = Object.keys(st.cart).filter((id) => st.cart[id] > 0).sort().map((id) => id + ':' + st.cart[id]).join(',');
  const ship = ['fn', 'st', 'ci', 'zip'].map((id) => norm($(id).value));
  const order = 'S-' + code(items + '|' + st.coupon + '|' + ship.join('|') + '|' + dl);
  $('v-done').innerHTML = '<h2>Order #' + order + ' confirmed.</h2><p>Total charged: ' + money(sub() - disc() + shipping()) + '. Shipping to ' + $('fn').value.trim() + ', ' + $('st').value.trim() + ', ' + $('ci').value.trim() + ' ' + $('zip').value.trim() + ' (' + (dl === 'exp' ? 'Express' : 'Standard') + ').</p>';
  show('done');
});
grid();`);

const shopItems = PRODUCTS.filter(([, name]) => SHOP_ORDER[name]).map(([id, name]) => `${id}:${SHOP_ORDER[name]}`).sort().join(',');
const shopCents = PRODUCTS.reduce((s, [, name, price]) => s + price * (SHOP_ORDER[name] ?? 0), 0);

// ---- admin: 60 users over 3 pages; bulk role and status edits ---------------

const FIRST = ['Ana', 'Ben', 'Chloe', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ian', 'Jo', 'Kim', 'Leo', 'Mae', 'Nia', 'Oli', 'Pia', 'Quinn', 'Rosa', 'Sam', 'Tia'];
const LAST = ['Adams', 'Brooks', 'Costa', 'Diaz', 'Evans', 'Fischer', 'Grant', 'Hughes', 'Ito', 'Jensen', 'Khan', 'Lopez', 'Moreau', 'Nakamura', 'Owens', 'Park', 'Quist', 'Reyes', 'Silva', 'Tanaka'];
type User = { id: string; name: string; role: 'Viewer' | 'Editor' | 'Admin'; active: boolean };
const PLACED: Record<number, [string, User['role']]> = {
  3: ['Tomas Becker', 'Viewer'], 7: ['Ivy Chen', 'Viewer'], 15: ['Raj Patel', 'Editor'], 22: ['Ivy Cheng', 'Viewer'], 28: ['Lena Novak', 'Viewer'],
  34: ['Tom Becker', 'Viewer'], 44: ['Omar Haddad', 'Editor'], 49: ['Raj Patil', 'Viewer'], 53: ['Sara Lind', 'Editor'], 57: ['Sara Lindqvist', 'Editor'],
};
const ROLES: User['role'][] = ['Viewer', 'Editor', 'Viewer', 'Admin', 'Viewer', 'Editor'];
const USERS: User[] = Array.from({ length: 60 }, (_, i) => {
  const [name, role] = PLACED[i] ?? [`${FIRST[i % 20]} ${LAST[(i * 7) % 20]}`, ROLES[i % ROLES.length]!];
  return { id: `u${String(i + 1).padStart(2, '0')}`, name, role, active: i % 11 !== 5 };
});
const email = (name: string): string => `${name.toLowerCase().replace(/[^a-z]+/g, '.')}@corp.test`;
const ADMIN_CHANGES: Record<string, Partial<User>> = {
  'Ivy Chen': { role: 'Editor' }, 'Lena Novak': { role: 'Editor' }, 'Raj Patel': { role: 'Admin' },
  'Tom Becker': { active: false }, 'Sara Lind': { active: false }, 'Omar Haddad': { role: 'Viewer' },
};
const adminSet = USERS.filter((u) => ADMIN_CHANGES[u.name]).map((u) => ({ ...u, ...ADMIN_CHANGES[u.name] }))
  .map((u) => `${u.id}:${u.role}:${u.active ? 1 : 0}`).join(',');

const admin = site('Corp Console', 'Users — Corp Console', `<h1>Users</h1>
<p id="saved" role="status"></p>
<p><label for="uq">Filter by name</label> <input id="uq" type="search"> <span id="pending">No unsaved changes</span> <button id="save">Save changes</button></p>
<table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th></th></tr></thead><tbody id="rows"></tbody></table>
<p><button id="uprev">Previous</button> <span id="upage"></span> <button id="unext">Next</button></p>`,
String.raw`const U0 = ${JSON.stringify(USERS.map((u) => ({ ...u, email: email(u.name) })))};
let base = U0.map((u) => ({ ...u }));
const cur = U0.map((u) => ({ ...u }));
const st = { page: 0 };
const changed = () => cur.filter((u, i) => u.role !== base[i].role || u.active !== base[i].active);
const pend = () => { const n = changed().length; $('pending').textContent = n ? n + ' unsaved change' + (n === 1 ? '' : 's') : 'No unsaved changes'; };
function rows() {
  const q = norm($('uq').value), list = cur.filter((u) => !q || u.name.toLowerCase().includes(q));
  const pages = Math.max(1, Math.ceil(list.length / 20));
  st.page = Math.min(st.page, pages - 1);
  $('rows').innerHTML = list.slice(st.page * 20, st.page * 20 + 20).map((u) => '<tr><td>' + u.name + '</td><td>' + u.email + '</td><td><select data-role="' + u.id + '" aria-label="Role for ' + u.name + '">' + ['Viewer', 'Editor', 'Admin'].map((r) => '<option' + (r === u.role ? ' selected' : '') + '>' + r + '</option>').join('') + '</select></td><td><input type="checkbox" data-active="' + u.id + '" aria-label="Active: ' + u.name + '"' + (u.active ? ' checked' : '') + '></td><td><button data-reset="' + u.id + '">Reset password</button></td></tr>').join('');
  $('upage').textContent = 'Page ' + (st.page + 1) + ' of ' + pages;
  $('uprev').disabled = st.page === 0; $('unext').disabled = st.page >= pages - 1;
}
const user = (id) => cur.find((u) => u.id === id);
$('rows').addEventListener('change', (e) => {
  if (e.target.dataset.role) user(e.target.dataset.role).role = e.target.value;
  if (e.target.dataset.active) user(e.target.dataset.active).active = e.target.checked;
  pend();
});
$('rows').addEventListener('click', (e) => { const id = e.target.dataset.reset; if (id) $('saved').textContent = 'Password reset email sent to ' + user(id).email + '.'; });
$('uq').addEventListener('input', () => { st.page = 0; rows(); });
$('uprev').onclick = () => { st.page--; rows(); };
$('unext').onclick = () => { st.page++; rows(); };
$('save').onclick = () => {
  const c = changed();
  if (!c.length) { $('saved').textContent = 'No changes to save.'; return; }
  $('saved').textContent = 'Saved ' + c.length + ' change' + (c.length === 1 ? '' : 's') + '. Change set C-' + code(c.map((u) => u.id + ':' + u.role + ':' + (u.active ? 1 : 0)).join(',')) + '.';
  base = cur.map((u) => ({ ...u })); pend();
};
rows();`);

// ---- onboarding: five-step wizard with conditional fields and invites -------

const WIZARD = {
  company: ['Northwind Labs', '51-200', 'DE', 'DE123456789'],
  admin: ['Ada', 'Byron', 'ada@northwind.test', '+49 30 1234567'],
  plan: 'growth', cycle: 'yearly', billing: 'billing@northwind.test',
  invites: [['lin@northwind.test', 'admin'], ['sam@northwind.test', 'member'], ['kai@northwind.test', 'member']],
};
const workspace = 'W-' + code([...WIZARD.company, ...WIZARD.admin].map(norm).join('|') + `|${WIZARD.plan}|${WIZARD.cycle}|${norm(WIZARD.billing)}|` +
  WIZARD.invites.map(([e, r]) => `${norm(e)}:${r}`).sort().join(','));

const onboard = site('Basecamp Cloud', 'Set up your workspace — Basecamp Cloud', `<h1>Set up your workspace</h1>
<p id="stepinfo">Step 1 of 5: Company</p>
<section id="w1" aria-label="Company">
  <label for="co">Company name</label> <input id="co"><br>
  <label for="size">Company size</label> <select id="size"><option value="">Choose…</option><option value="1-10">1–10 employees</option><option value="11-50">11–50 employees</option><option value="51-200">51–200 employees</option><option value="201+">201+ employees</option></select><br>
  <label for="country">Country</label> <select id="country"><option value="">Choose…</option><option value="US">United States</option><option value="DE">Germany</option><option value="IN">India</option><option value="BR">Brazil</option><option value="JP">Japan</option></select><br>
  <span id="vatrow" hidden><label for="vat">VAT ID</label> <input id="vat"><br></span>
  <button id="next1">Next</button> <span id="e1" class="err"></span>
</section>
<section id="w2" aria-label="Admin contact" hidden>
  <label for="fn">First name</label> <input id="fn"><br>
  <label for="ln">Last name</label> <input id="ln"><br>
  <label for="em">Work email</label> <input id="em" type="email"><br>
  <label for="ph">Phone</label> <input id="ph" type="tel"><br>
  <button id="back2">Back</button> <button id="next2">Next</button> <span id="e2" class="err"></span>
</section>
<section id="w3" aria-label="Plan and billing" hidden>
  <fieldset><legend>Plan</legend>
    <label><input type="radio" name="plan" value="starter"> Starter ($8 per user)</label>
    <label><input type="radio" name="plan" value="growth"> Growth ($15 per user)</label>
    <label><input type="radio" name="plan" value="scale"> Scale ($24 per user)</label>
  </fieldset>
  <fieldset><legend>Billing cycle</legend>
    <label><input type="radio" name="cycle" value="monthly" checked> Monthly</label>
    <label><input type="radio" name="cycle" value="yearly"> Yearly (2 months free)</label>
  </fieldset>
  <label><input type="checkbox" id="sameinv" checked> Send invoices to the admin email</label><br>
  <span id="binrow" hidden><label for="bin">Billing email</label> <input id="bin" type="email"><br></span>
  <button id="back3">Back</button> <button id="next3">Next</button> <span id="e3" class="err"></span>
</section>
<section id="w4" aria-label="Invite your team" hidden>
  <label for="ie">Invite email</label> <input id="ie" type="email">
  <label for="ir">Role</label> <select id="ir"><option value="member">Member</option><option value="admin">Admin</option></select>
  <button id="add">Add invite</button> <span id="e4" class="err"></span>
  <ul id="invites"></ul>
  <button id="back4">Back</button> <button id="next4">Next</button>
</section>
<section id="w5" aria-label="Review" hidden>
  <div id="review"></div>
  <label><input type="checkbox" id="terms"> I agree to the Terms of Service</label><br>
  <button id="back5">Back</button> <button id="create">Create workspace</button> <span id="e5" class="err"></span>
</section>`,
String.raw`const LABEL = ['Company', 'Admin contact', 'Plan and billing', 'Invite your team', 'Review'];
const inv = [];
const val = (id) => $(id).value.trim();
const radio = (n) => document.querySelector('input[name="' + n + '"]:checked')?.value || '';
const go = (n) => { for (let k = 1; k <= 5; k++) $('w' + k).hidden = k !== n; $('stepinfo').textContent = 'Step ' + n + ' of 5: ' + LABEL[n - 1]; if (n === 5) review(); };
const fail = (id, msg) => { $(id).textContent = msg; return false; };
$('country').onchange = () => { $('vatrow').hidden = $('country').value !== 'DE'; };
$('sameinv').onchange = () => { $('binrow').hidden = $('sameinv').checked; };
$('next1').onclick = () => { if (!val('co') || !val('size') || !val('country')) return fail('e1', 'Fill in company name, size and country.'); if (val('country') === 'DE' && !val('vat')) return fail('e1', 'A VAT ID is required for companies in Germany.'); $('e1').textContent = ''; go(2); };
$('next2').onclick = () => { if (!val('fn') || !val('ln') || !val('ph')) return fail('e2', 'Fill in every field.'); if (!val('em').includes('@')) return fail('e2', 'Enter a valid work email.'); $('e2').textContent = ''; go(3); };
$('next3').onclick = () => { if (!radio('plan')) return fail('e3', 'Choose a plan.'); if (!$('sameinv').checked && !val('bin').includes('@')) return fail('e3', 'Enter a billing email.'); $('e3').textContent = ''; go(4); };
$('next4').onclick = () => go(5);
for (let k = 2; k <= 5; k++) $('back' + k).onclick = () => go(k - 1);
function list() { $('invites').innerHTML = inv.map((x, i) => '<li>' + x[0] + ' (' + (x[1] === 'admin' ? 'Admin' : 'Member') + ') <button data-rm="' + i + '">Remove ' + x[0] + '</button></li>').join(''); }
$('add').onclick = () => {
  const e = val('ie');
  if (!e.includes('@')) return fail('e4', 'Enter a valid email.');
  if (inv.some((x) => norm(x[0]) === norm(e))) return fail('e4', e + ' is already invited.');
  inv.push([e, $('ir').value]); $('ie').value = ''; $('ir').value = 'member'; $('e4').textContent = ''; list();
};
$('invites').addEventListener('click', (ev) => { const i = ev.target.dataset.rm; if (i !== undefined) { inv.splice(Number(i), 1); list(); } });
const planName = () => ({ starter: 'Starter', growth: 'Growth', scale: 'Scale' })[radio('plan')];
function review() {
  $('review').innerHTML = '<p>' + val('co') + ' · ' + $('size').selectedOptions[0].text + ' · ' + $('country').selectedOptions[0].text + (val('country') === 'DE' ? ' · VAT ' + val('vat') : '') + '</p><p>Admin: ' + val('fn') + ' ' + val('ln') + ', ' + val('em') + ', ' + val('ph') + '</p><p>' + planName() + ', billed ' + radio('cycle') + '; invoices to ' + ($('sameinv').checked ? val('em') : val('bin')) + '</p><p>' + inv.length + ' invites</p>';
}
$('create').onclick = () => {
  if (!$('terms').checked) return fail('e5', 'Accept the Terms of Service to continue.');
  const fields = ['co', 'size', 'country'].map((id) => norm(val(id))).concat([val('country') === 'DE' ? norm(val('vat')) : '']).concat(['fn', 'ln', 'em', 'ph'].map((id) => norm(val(id))));
  const s = fields.join('|') + '|' + radio('plan') + '|' + radio('cycle') + '|' + ($('sameinv').checked ? 'admin' : norm(val('bin'))) + '|' + inv.map((x) => norm(x[0]) + ':' + x[1]).sort().join(',');
  document.querySelector('main').innerHTML = '<h1>Workspace W-' + code(s) + ' created</h1><p>Workspace W-' + code(s) + ' created for ' + val('co') + ' (' + planName() + ', ' + radio('cycle') + ', ' + inv.length + ' invites).</p>';
};`);

// ---- laptops: catalog plus one detail page per model ------------------------

interface Laptop { slug: string; name: string; price: number; battery: number; weight: string; cpu: string; ram: number; ssd: number; screen: string }
const LAPTOPS: Laptop[] = [
  ['aero-13', 'Aero 13', 899, 11, '1.20 kg (2.65 lb)', 'Ryzen 5 7640U', 16, 512, '13.3" 2560×1600'],
  ['aero-15', 'Aero 15', 1099, 14, '1.65 kg (3.64 lb)', 'Core Ultra 7 155H', 16, 1024, '15.6" 2880×1620 OLED'],
  ['bolt-14', 'Bolt 14', 749, 9, '1.50 kg (3.31 lb)', 'Core i5-1335U', 8, 512, '14" 1920×1200'],
  ['bolt-pro-16', 'Bolt Pro 16', 1499, 21, '2.10 kg (4.63 lb)', 'Core Ultra 9 185H', 32, 1024, '16" 3200×2000'],
  ['cirrus-air', 'Cirrus Air', 999, 13.5, '1.10 kg (2.43 lb)', 'Snapdragon X Plus', 16, 512, '13.4" 2560×1600'],
  ['cirrus-max', 'Cirrus Max', 1299, 18, '1.90 kg (4.19 lb)', 'Snapdragon X Elite', 32, 1024, '16" 2880×1800'],
  ['delta-15', 'Delta 15', 679, 8, '1.95 kg (4.30 lb)', 'Ryzen 5 7530U', 8, 256, '15.6" 1920×1080'],
  ['echo-flip', 'Echo Flip', 829, 12, '1.40 kg (3.09 lb)', 'Core i5-1340P', 16, 512, '14" 1920×1200 touch'],
  ['nimbus-14', 'Nimbus 14', 949, 16, '1.35 kg (2.98 lb)', 'Ryzen 7 8840U', 16, 1024, '14" 2880×1800 OLED'],
  ['nimbus-16', 'Nimbus 16', 1199, 17, '1.85 kg (4.08 lb)', 'Ryzen 9 8945HS', 32, 1024, '16" 2560×1600'],
  ['orbit-go', 'Orbit Go', 599, 10.5, '1.30 kg (2.87 lb)', 'Core i3-1315U', 8, 256, '13.3" 1920×1080'],
  ['pulse-13', 'Pulse 13', 1049, 15, '1.15 kg (2.54 lb)', 'Core Ultra 5 125U', 16, 512, '13.5" 2256×1504'],
].map(([slug, name, price, battery, weight, cpu, ram, ssd, screen]) => ({ slug, name, price, battery, weight, cpu, ram, ssd, screen }) as Laptop);
const usd = (n: number): string => `$${n.toLocaleString('en-US')}`;
const laptopCatalog = site('Circuit Hub', 'Laptops — Circuit Hub', `<h1>Laptops</h1><p>${LAPTOPS.length} models. Prices include VAT; full specs on each product page.</p>
<ul>${LAPTOPS.map((l) => `<li><a href="/laptops/${l.slug}">${l.name}</a> — ${usd(l.price)}</li>`).join('')}</ul>`);
const REVIEWERS = ['Marco', 'Priya', 'Jonas', 'Aiko', 'Femi'];
const laptopPage = (l: Laptop, i: number): string => {
  const specs: [string, string][] = [
    ['Processor', l.cpu], ['Memory', `${l.ram} GB LPDDR5`], ['Storage', `${l.ssd >= 1024 ? '1 TB' : `${l.ssd} GB`} NVMe SSD`], ['Display', l.screen],
    ['Graphics', 'Integrated'], ['Battery', `${Math.round(l.battery * 4.5)} Wh`], ['Battery life (video playback)', `${l.battery} hours`], ['Charging', '0–50% in 30 minutes (65 W USB-C)'],
    ['Weight', l.weight], ['Ports', '2× USB-C, 1× USB-A, HDMI 2.1, 3.5 mm audio'], ['Wireless', 'Wi-Fi 7, Bluetooth 5.4'], ['Camera', '1080p with privacy shutter'],
    ['Keyboard', 'Backlit, 1.5 mm travel'], ['Warranty', '2 years'],
  ];
  const reviews = REVIEWERS.map((r, k) => `<article aria-label="Review by ${r}"><h3>${'★'.repeat(3 + ((i + k) % 3))} ${r}</h3><p>${[
    `Solid build for the price. I get about ${Math.max(5, Math.round(l.battery * 0.7))} hours of real work on a charge.`,
    'The keyboard is great; the speakers are only fine.', 'Runs cool and quiet in everyday use.',
    `Light enough to carry daily. Screen is sharp but a little dim outdoors.`, 'Setup took five minutes. Would buy again.',
  ][k]}</p></article>`).join('');
  const related = LAPTOPS.filter((x) => x.slug !== l.slug).slice(i % 6, (i % 6) + 5);
  return site('Circuit Hub', `${l.name} — Circuit Hub`, `<p><a href="/laptops">Laptops</a> › ${l.name}</p>
<h1>${l.name}</h1><p><b>${usd(l.price)}</b> · In stock · Free delivery</p><p><button>Add to cart</button> <label><input type="checkbox"> Compare</label></p>
<p>The ${l.name} balances performance and portability with a ${l.screen} display and an all-day battery.</p>
<h2>Specifications</h2><table>${specs.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</table>
<h2>Reviews</h2>${reviews}
<h2>You may also like</h2><ul>${related.map((x) => `<li><a href="/laptops/${x.slug}">${x.name}</a> — ${usd(x.price)}</li>`).join('')}</ul>`);
};
const cheap = LAPTOPS.filter((l) => l.price < 1000);
const best = cheap.reduce((a, b) => (b.battery > a.battery ? b : a));

export const LONG_PAGES: Record<string, string> = {
  '/shop': shop, '/admin': admin, '/onboard': onboard, '/laptops': laptopCatalog,
  ...Object.fromEntries(LAPTOPS.map((l, i) => [`/laptops/${l.slug}`, laptopPage(l, i)])),
};

/** Expected results, derived from the same data and hash the pages use. */
export const LONG_EXPECT = {
  shop: { order: 'S-' + code(`${shopItems}|SPRING10|${SHOP_SHIP.map(norm).join('|')}|std`), total: ((shopCents - Math.round(shopCents / 10) + 499) / 100).toFixed(2) },
  admin: { changes: Object.keys(ADMIN_CHANGES).length, set: 'C-' + code(adminSet) },
  onboard: { workspace },
  laptops: { name: best.name, weight: best.weight.split(' ')[0]!, paths: cheap.map((l) => `/laptops/${l.slug}`) },
};
