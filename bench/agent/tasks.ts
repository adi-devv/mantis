/**
 * Task set for the real-agent eval (bench/agent/run.ts). Each task is something agents commonly
 * do in a browser, with an answer we can check. Prefer local fixture pages (deterministic, known
 * answers); keep a few live sites as a realism check. When an agent fails somewhere new, add a task.
 */
import type { FixtureCheck, FixtureObservation } from '../fixtures.js';
import { LONG_EXPECT } from '../fixtures-long.js';
import { loadRealsiteTasks } from './realsite.js';

export type Category = 'forms' | 'reading' | 'lists' | 'overlays' | 'navigation' | 'dynamic' | 'visual' | 'long' | 'realsite';

export interface AgentTask {
  id: string;
  category: Category;
  /** Live site (changes over time) or a local fixture page (bench/fixtures.ts, deterministic). */
  site: 'local' | 'live';
  /** What the agent is asked. `base` is the local fixture server's URL. */
  prompt: (base: string) => string;
  /** The final reply must match this to count as correct. */
  expect: RegExp;
  /** Local action tasks also need server-observed evidence that the browser reached the requested state. */
  check?: FixtureCheck;
  /** Real-site task with no regex answer: `expect` only checks the agent finished; bench/agent/judge.ts grades it afterwards. */
  judged?: boolean;
}

type EventKind = FixtureObservation['kind'];
const eventsOf = (events: FixtureObservation[], kind: EventKind, path?: string): FixtureObservation[] =>
  events.filter((event) => event.kind === kind && (path === undefined || event.path === path));
const has = (events: FixtureObservation[], predicate: (event: FixtureObservation) => boolean): boolean => events.some(predicate);
const check = (predicate: (events: FixtureObservation[]) => boolean): FixtureCheck => (events) => predicate(events);
const leadsTo = (
  events: FixtureObservation[],
  kind: EventKind,
  path: string,
  action: (event: FixtureObservation) => boolean,
  result: (event: FixtureObservation) => boolean,
): boolean => events.some((before) => before.kind === kind && before.path === path && action(before) &&
  events.some((after) => after.kind === 'settled' && after.path === path && after.documentId === before.documentId && after.actionId === before.actionId && result(after)));
const control = (event: FixtureObservation, id: string, value: string, checked?: boolean): boolean => {
  const c = event.controls[id];
  return !!c && c.value === value && (checked === undefined || c.checked === checked);
};
const target = (event: FixtureObservation, id: string): boolean => event.target.id === id;
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LOCAL_AND_LIVE_TASKS: AgentTask[] = [
  {
    id: 'form-subscribe',
    category: 'forms',
    site: 'local',
    prompt: (b) => `Open ${b}/form. Subscribe from Canada and opt in to the weekly newsletter. What confirmation message does the page show?`,
    expect: /Subscribed from Canada \(weekly: yes\)/i,
    check: check((e) => leadsTo(e, 'submit', '/form', (x) => control(x, 'c', 'ca') && control(x, 'n', 'on', true), (x) => x.target.tag === 'form' && /Subscribed from Canada \(weekly: yes\)/.test(x.text))),
  },
  {
    id: 'wikipedia-birthdate',
    category: 'reading',
    site: 'live',
    prompt: () => 'Open https://en.wikipedia.org/wiki/Alan_Turing. On what date was Alan Turing born?',
    expect: /23 June,? 1912|June 23,? 1912/i,
  },
  {
    id: 'login',
    category: 'forms',
    site: 'local',
    prompt: (b) => `Open ${b}/login and sign in with email agent@example.com and password correct-horse-battery. What is the page heading after signing in?`,
    expect: /(?<!not )\bSigned in\b/i,
    check: check((e) => leadsTo(e, 'submit', '/login', (x) => control(x, 'email', 'agent@example.com') && control(x, 'pw', 'correct-horse-battery'), (x) => /Signed in/.test(x.text))),
  },
  {
    id: 'cookie-cart',
    category: 'overlays',
    site: 'local',
    prompt: (b) => `Open ${b}/cookie and add the product to the cart. What message confirms it?`,
    // The fixture check establishes the exact cart state; the reply need only
    // identify the confirmation message rather than repeat its item count.
    expect: /\bAdded to cart(?:\s*\(1 item\))?\.?\s*$/i,
    check: check((e) => leadsTo(e, 'click', '/cookie', (x) => target(x, 'add'), (x) => target(x, 'add') && /Added to cart \(1 item\)/.test(x.text))),
  },
  {
    id: 'longlist-item',
    category: 'lists',
    site: 'local',
    prompt: (b) => `Open ${b}/longlist and open "Item 150". What is the heading of the page it leads to?`,
    expect: /Detail for item 150\b/i,
    check: check((e) => has(e, (x) => x.path === '/item/150' && x.kind === 'load' && /Detail for item 150/.test(x.text))),
  },
  {
    id: 'pricing-team',
    category: 'navigation',
    site: 'local',
    prompt: (b) => `Open ${b}/site/home, go to the pricing page and find the price of the Team plan.`,
    expect: /\$29\b/,
    check: check((e) => has(e, (x) => x.path === '/site/pricing' && x.kind === 'load' && /Team: \$29 per month/.test(x.text))),
  },
  {
    id: 'dashboard-refresh',
    category: 'dynamic',
    site: 'local',
    prompt: (b) => `Open ${b}/dashboard, refresh the data, and tell me what the "Last updated" line says now. Also: what is the amount for Initech 3?`,
    expect: /\bjust now\b[\s\S]*\$4,218\b|\$4,218\b[\s\S]*\bjust now\b/i,
    check: check((e) => leadsTo(e, 'click', '/dashboard', (x) => target(x, 'ref'), (x) => target(x, 'ref') && /Last updated: just now/.test(x.text))),
  },
  // ---- forms ----
  {
    id: 'signup-validation',
    category: 'forms',
    site: 'local',
    prompt: (b) => `Open ${b}/signup. Create an account with email new@example.com and password abc123. If it fails, say what error appeared, then retry with password longenough123. What does the page say at the end?`,
    expect: /at least 8 characters[\s\S]*Welcome, new@example\.com|Welcome, new@example\.com[\s\S]*at least 8 characters/i,
    check: check((e) => {
      const settled = eventsOf(e, 'settled', '/signup');
      const submits = eventsOf(e, 'submit', '/signup');
      return submits.some((x) => control(x, 'em', 'new@example.com') && control(x, 'pw', 'abc123') && settled.some((s) => s.documentId === x.documentId && s.actionId === x.actionId && /Password must be at least 8 characters/.test(s.text))) &&
        submits.some((x) => control(x, 'em', 'new@example.com') && control(x, 'pw', 'longenough123') && control(x, 'pw2', 'longenough123') && settled.some((s) => s.documentId === x.documentId && s.actionId === x.actionId && /Welcome, new@example\.com/.test(s.text)));
    }),
  },
  {
    id: 'checkout-steps',
    category: 'forms',
    site: 'local',
    prompt: (b) => `Open ${b}/checkout and complete the order for Ada Lovelace, shipping to Berlin, with Express delivery. What is the order number and the total charged?`,
    expect: /A1042[\s\S]*27\.50|27\.50[\s\S]*A1042/,
    check: check((e) => {
      const nextShipping = leadsTo(e, 'click', '/checkout', (x) => target(x, 'n1') && control(x, 'nm', 'Ada Lovelace') && control(x, 'city', 'Berlin'), (x) => target(x, 'n1') && /Step 2 of 3: Delivery/.test(x.text));
      const nextDelivery = leadsTo(e, 'click', '/checkout', (x) => target(x, 'n2') && control(x, 'd', 'exp', true), (x) => target(x, 'n2') && /Ship to Ada Lovelace, Berlin\s*·\s*Express/.test(x.text));
      const placed = leadsTo(e, 'click', '/checkout', (x) => target(x, 'place'), (x) => target(x, 'place') && /Order #A1042 confirmed\. Total charged: \$27\.50/.test(x.text));
      return nextShipping && nextDelivery && placed;
    }),
  },
  {
    id: 'booking-date',
    category: 'forms',
    site: 'local',
    prompt: (b) => `Open ${b}/booking and book a table for 3 guests on 2026-12-24 at 19:00. What does the confirmation say?`,
    expect: /Booked for 2026-12-24 at 19:00, 3 guests\b/,
    check: check((e) => leadsTo(e, 'submit', '/booking', (x) => control(x, 'dt', '2026-12-24') && control(x, 'tm', '19:00') && control(x, 'ppl', '3'), (x) => /Booked for 2026-12-24 at 19:00, 3 guests/.test(x.text))),
  },
  // ---- reading ----
  {
    id: 'article-deep-fact',
    category: 'reading',
    site: 'local',
    prompt: (b) => `Open ${b}/article. In what year was the harbour light first lit?`,
    expect: /\b1874\b/,
    check: check((e) => has(e, (x) => x.path === '/article' && x.kind === 'load')),
  },
  {
    id: 'inventory-lookup',
    category: 'reading',
    site: 'local',
    prompt: (b) => `Open ${b}/inventory. What is the SKU of Widget 30, and how many are in stock?`,
    expect: /\bW-1203\b[\s\S]*\b113\b|\b113\b[\s\S]*\bW-1203\b/,
    check: check((e) => has(e, (x) => x.path === '/inventory' && x.kind === 'load')),
  },
  // ---- lists ----
  {
    id: 'churned-max',
    category: 'lists',
    site: 'local',
    prompt: (b) => `Open ${b}/dashboard. Among customers with status Churned, which one has the highest amount, and what is the amount?`,
    expect: /\bAcme 6\b[\s\S]*\b9,?950\b|\b9,?950\b[\s\S]*\bAcme 6\b/,
    check: check((e) => has(e, (x) => x.path === '/dashboard' && x.kind === 'load')),
  },
  {
    id: 'search-pagination',
    category: 'lists',
    site: 'local',
    prompt: (b) => `Open ${b}/search, find the result titled "Quokka facts" (it may be on a later page) and open it. Who wrote it?`,
    expect: /\bdana\.r\b/,
    check: check((e) => has(e, (x) => x.path === '/search' && x.kind === 'click' && /Next/.test(x.target.text)) && leadsTo(e, 'click', '/search', (x) => /Quokka facts/.test(x.target.text), (x) => /Written by dana\.r/.test(x.text))),
  },
  {
    id: 'feed-scroll',
    category: 'lists',
    site: 'local',
    prompt: (b) => `Open ${b}/feed. What does post #35 say?`,
    expect: /\bThursday at noon\b/i,
    check: check((e) => has(e, (x) => x.path === '/feed' && x.kind === 'load')),
  },
  // ---- overlays ----
  {
    id: 'modal-delete',
    category: 'overlays',
    site: 'local',
    prompt: (b) => `Open ${b}/files and delete the file "Old report". What message confirms it?`,
    expect: /\bOld report was moved to trash\b/i,
    check: check((e) => {
      return leadsTo(e, 'click', '/files', (x) => x.target.ariaLabel === 'Delete Old report', (x) => /Delete "Old report"/.test(x.text)) &&
        leadsTo(e, 'click', '/files', (x) => target(x, 'yes'), (x) => /Old report was moved to trash/.test(x.text) && !/Old report 🗑/.test(x.text));
    }),
  },
  {
    id: 'menu-settings',
    category: 'overlays',
    site: 'local',
    prompt: (b) => `Open ${b}/account. Using the Account menu, open Settings, switch the theme to Dark and save. What confirmation is shown?`,
    expect: /Theme saved: Dark/i,
    check: check((e) => {
      return leadsTo(e, 'click', '/account', (x) => target(x, 'acct'), (x) => /Settings/.test(x.text)) &&
        leadsTo(e, 'click', '/account', (x) => target(x, 'mi-settings'), (x) => /Theme/.test(x.text)) &&
        leadsTo(e, 'change', '/account', (x) => control(x, 't', 'Dark', true), (x) => control(x, 't', 'Dark', true)) &&
        leadsTo(e, 'click', '/account', (x) => target(x, 'save') && control(x, 't', 'Dark', true), (x) => /Theme saved: Dark/.test(x.text));
    }),
  },
  // ---- navigation ----
  {
    id: 'spa-team',
    category: 'navigation',
    site: 'local',
    prompt: (b) => `Open ${b}/app. In the Team section, find the email address of the designer.`,
    expect: /\bmia@example\.com\b(?!\.[A-Za-z])/i,
    check: check((e) => {
      return leadsTo(e, 'click', '/app', (x) => x.target.text === 'Team', (x) => /Mia Wong/.test(x.text)) &&
        leadsTo(e, 'click', '/app', (x) => x.target.text === 'Mia Wong', (x) => /Email: mia@example\.com/.test(x.text));
    }),
  },
  // ---- dynamic ----
  {
    id: 'plans-pick',
    category: 'dynamic',
    site: 'local',
    prompt: (b) => `Open ${b}/plans and choose the Pro plan. What confirmation code do you get?`,
    expect: /PRO-77/,
    check: check((e) => leadsTo(e, 'click', '/plans', (x) => x.target.text.includes('Pro'), (x) => x.target.text.includes('Pro') && /Confirmation code PRO-77/.test(x.text))),
  },
  {
    id: 'faq-refund',
    category: 'dynamic',
    site: 'local',
    prompt: (b) => `Open ${b}/help. Within how many days can you ask for a refund?`,
    expect: /\b30\b/,
    check: check((e) => leadsTo(e, 'click', '/help', (x) => /refund policy/i.test(x.target.text), (x) => /within 30 days/.test(x.text))),
  },
  {
    id: 'iframe-pay',
    category: 'dynamic',
    site: 'local',
    prompt: (b) => `Open ${b}/pay and pay with the test card 4242 4242 4242 4242, expiry 12/30, CVC 123. What is the receipt number?`,
    expect: /R-5531/,
    check: check((e) => leadsTo(e, 'submit', '/pay/inner', (x) => x.controls.cn?.value.replace(/\s/g, '') === '4242424242424242' && control(x, 'ex', '12/30') && control(x, 'cvc', '123'), (x) => /Payment approved\. Receipt R-5531/.test(x.text))),
  },
  // ---- visual ----
  {
    id: 'chart-march',
    category: 'visual',
    site: 'local',
    prompt: (b) => `Open ${b}/chart. How many units were sold in March according to the chart?`,
    expect: /\b42\b/,
    check: check((e) => has(e, (x) => x.path === '/chart' && x.kind === 'load')),
  },
  // ---- long: 15-40 actions each ----
  {
    id: 'long-shop',
    category: 'long',
    site: 'local',
    prompt: (b) => `Open ${b}/shop. Add to the cart: 2 Trail Mug, 1 Canvas Tote, 3 Beeswax Wrap and 1 Linen Apron (only those products, nothing else). Apply the coupon SPRING10. Check out shipping to Grace Hopper, 12 Navy Way, Arlington, ZIP 22201, with Standard delivery, and pay with the test card 4242 4242 4242 4242, expiry 12/30, CVC 123. What is the order number and the total charged?`,
    expect: new RegExp(`${esc(LONG_EXPECT.shop.order)}[^]*${esc(LONG_EXPECT.shop.total)}|${esc(LONG_EXPECT.shop.total)}[^]*${esc(LONG_EXPECT.shop.order)}`),
    check: check((e) => has(e, (x) => x.path === '/shop' && x.kind === 'settled' && x.text.includes(`Order #${LONG_EXPECT.shop.order} confirmed. Total charged: $${LONG_EXPECT.shop.total}.`))),
  },
  {
    id: 'long-admin',
    category: 'long',
    site: 'local',
    prompt: (b) => `Open ${b}/admin. Make Ivy Chen and Lena Novak Editors, make Raj Patel an Admin, change Omar Haddad to Viewer, and deactivate Tom Becker and Sara Lind. Change nobody else. Then save. What does the confirmation say?`,
    expect: new RegExp(esc(LONG_EXPECT.admin.set)),
    check: check((e) => has(e, (x) => x.path === '/admin' && x.kind === 'settled' && x.text.includes(`Saved ${LONG_EXPECT.admin.changes} changes. Change set ${LONG_EXPECT.admin.set}.`))),
  },
  {
    id: 'long-onboard',
    category: 'long',
    site: 'local',
    prompt: (b) => `Open ${b}/onboard and set up a workspace. Company: Northwind Labs, 51-200 employees, based in Germany, VAT ID DE123456789. Admin contact: Ada Byron, ada@northwind.test, phone +49 30 1234567. Choose the Growth plan billed yearly, and send invoices to billing@northwind.test instead of the admin email. Invite lin@northwind.test as an Admin, and sam@northwind.test and kai@northwind.test as Members. Accept the terms and create the workspace. What is the workspace ID?`,
    expect: new RegExp(esc(LONG_EXPECT.onboard.workspace)),
    check: check((e) => has(e, (x) => x.path === '/onboard' && x.kind === 'settled' && x.text.includes(`Workspace ${LONG_EXPECT.onboard.workspace} created for Northwind Labs (Growth, yearly, 3 invites).`))),
  },
  {
    id: 'long-laptops',
    category: 'long',
    site: 'local',
    prompt: (b) => `Open ${b}/laptops. Among the laptops that cost under $1,000, which one has the longest battery life (video playback)? Tell me its name and its weight in kg.`,
    expect: new RegExp(`${esc(LONG_EXPECT.laptops.name)}[^]*${esc(LONG_EXPECT.laptops.weight)}|${esc(LONG_EXPECT.laptops.weight)}[^]*${esc(LONG_EXPECT.laptops.name)}`),
    check: check((e) => LONG_EXPECT.laptops.paths.every((path) => has(e, (x) => x.path === path && x.kind === 'load'))),
  },
];
/** Hand-written tasks plus the sampled real-site tasks (AGENT_TASKS=cat:realsite; none if realsite-tasks.json is absent). */
export const TASKS: AgentTask[] = [...LOCAL_AND_LIVE_TASKS, ...loadRealsiteTasks()];
/** The small set used for a quick pilot (default when AGENT_TASKS is not set). */
export const PILOT = ['form-subscribe', 'wikipedia-birthdate'];
