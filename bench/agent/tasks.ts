/**
 * Task set for the real-agent eval (bench/agent/run.ts). Each task is something agents commonly
 * do in a browser, with an answer we can check. Prefer local fixture pages (deterministic, known
 * answers); keep a few live sites as a realism check. When an agent fails somewhere new, add a task.
 */

export type Category = 'forms' | 'reading' | 'lists' | 'overlays' | 'navigation' | 'dynamic' | 'visual';

export interface AgentTask {
  id: string;
  category: Category;
  /** Live site (changes over time) or a local fixture page (bench/fixtures.ts, deterministic). */
  site: 'local' | 'live';
  /** What the agent is asked. `base` is the local fixture server's URL. */
  prompt: (base: string) => string;
  /** The final reply must match this to count as correct. */
  expect: RegExp;
}

export const TASKS: AgentTask[] = [
  {
    id: 'form-subscribe',
    category: 'forms',
    site: 'local',
    prompt: (b) => `Open ${b}/form. Subscribe from Canada and opt in to the weekly newsletter. What confirmation message does the page show?`,
    expect: /Subscribed from Canada \(weekly: yes\)/i,
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
    expect: /Signed in/i,
  },
  {
    id: 'cookie-cart',
    category: 'overlays',
    site: 'local',
    prompt: (b) => `Open ${b}/cookie and add the product to the cart. What message confirms it?`,
    expect: /Added to cart/i,
  },
  {
    id: 'longlist-item',
    category: 'lists',
    site: 'local',
    prompt: (b) => `Open ${b}/longlist and open "Item 150". What is the heading of the page it leads to?`,
    expect: /Detail for item 150/i,
  },
  {
    id: 'pricing-team',
    category: 'navigation',
    site: 'local',
    prompt: (b) => `Open ${b}/site/home, go to the pricing page and find the price of the Team plan.`,
    expect: /\$29/,
  },
  {
    id: 'dashboard-refresh',
    category: 'dynamic',
    site: 'local',
    prompt: (b) => `Open ${b}/dashboard, refresh the data, and tell me what the "Last updated" line says now. Also: what is the amount for Initech 3?`,
    expect: /just now[\s\S]*\$4,218|\$4,218[\s\S]*just now/i,
  },
  // ---- forms ----
  {
    id: 'signup-validation',
    category: 'forms',
    site: 'local',
    prompt: (b) => `Open ${b}/signup. Create an account with email new@example.com and password abc123. If it fails, say what error appeared, then retry with password longenough123. What does the page say at the end?`,
    expect: /at least 8 characters[\s\S]*Welcome, new@example\.com|Welcome, new@example\.com[\s\S]*at least 8 characters/i,
  },
  {
    id: 'checkout-steps',
    category: 'forms',
    site: 'local',
    prompt: (b) => `Open ${b}/checkout and complete the order for Ada Lovelace, shipping to Berlin, with Express delivery. What is the order number and the total charged?`,
    expect: /A1042[\s\S]*27\.50|27\.50[\s\S]*A1042/,
  },
  {
    id: 'booking-date',
    category: 'forms',
    site: 'local',
    prompt: (b) => `Open ${b}/booking and book a table for 3 guests on 2026-12-24 at 19:00. What does the confirmation say?`,
    expect: /Booked for 2026-12-24 at 19:00, 3 guests/,
  },
  // ---- reading ----
  {
    id: 'article-deep-fact',
    category: 'reading',
    site: 'local',
    prompt: (b) => `Open ${b}/article. In what year was the harbour light first lit?`,
    expect: /1874/,
  },
  {
    id: 'inventory-lookup',
    category: 'reading',
    site: 'local',
    prompt: (b) => `Open ${b}/inventory. What is the SKU of Widget 30, and how many are in stock?`,
    expect: /W-1203[\s\S]*\b113\b|\b113\b[\s\S]*W-1203/,
  },
  // ---- lists ----
  {
    id: 'churned-max',
    category: 'lists',
    site: 'local',
    prompt: (b) => `Open ${b}/dashboard. Among customers with status Churned, which one has the highest amount, and what is the amount?`,
    expect: /Acme 6[\s\S]*9,?950|9,?950[\s\S]*Acme 6/,
  },
  {
    id: 'search-pagination',
    category: 'lists',
    site: 'local',
    prompt: (b) => `Open ${b}/search, find the result titled "Quokka facts" (it may be on a later page) and open it. Who wrote it?`,
    expect: /dana\.r/,
  },
  {
    id: 'feed-scroll',
    category: 'lists',
    site: 'local',
    prompt: (b) => `Open ${b}/feed. What does post #35 say?`,
    expect: /Thursday at noon/i,
  },
  // ---- overlays ----
  {
    id: 'modal-delete',
    category: 'overlays',
    site: 'local',
    prompt: (b) => `Open ${b}/files and delete the file "Old report". What message confirms it?`,
    expect: /Old report was moved to trash/i,
  },
  {
    id: 'menu-settings',
    category: 'overlays',
    site: 'local',
    prompt: (b) => `Open ${b}/account. Using the Account menu, open Settings, switch the theme to Dark and save. What confirmation is shown?`,
    expect: /Theme saved: Dark/i,
  },
  // ---- navigation ----
  {
    id: 'spa-team',
    category: 'navigation',
    site: 'local',
    prompt: (b) => `Open ${b}/app. In the Team section, find the email address of the designer.`,
    expect: /mia@example\.com/i,
  },
  // ---- dynamic ----
  {
    id: 'plans-pick',
    category: 'dynamic',
    site: 'local',
    prompt: (b) => `Open ${b}/plans and choose the Pro plan. What confirmation code do you get?`,
    expect: /PRO-77/,
  },
  {
    id: 'faq-refund',
    category: 'dynamic',
    site: 'local',
    prompt: (b) => `Open ${b}/help. Within how many days can you ask for a refund?`,
    expect: /\b30\b/,
  },
  {
    id: 'iframe-pay',
    category: 'dynamic',
    site: 'local',
    prompt: (b) => `Open ${b}/pay and pay with the test card 4242 4242 4242 4242, expiry 12/30, CVC 123. What is the receipt number?`,
    expect: /R-5531/,
  },
  // ---- visual ----
  {
    id: 'chart-march',
    category: 'visual',
    site: 'local',
    prompt: (b) => `Open ${b}/chart. How many units were sold in March according to the chart?`,
    expect: /\b42\b/,
  },
];
/** The small set used for a quick pilot (default when AGENT_TASKS is not set). */
export const PILOT = ['form-subscribe', 'wikipedia-birthdate'];
