/**
 * Task set for the real-agent eval (bench/agent/run.ts). Each task is something agents commonly
 * do in a browser, with an answer we can check. Prefer local fixture pages (deterministic, known
 * answers); keep a few live sites as a realism check. When an agent fails somewhere new, add a task.
 */

export type Category = 'forms' | 'reading' | 'lists' | 'overlays' | 'navigation' | 'dynamic';

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
];
/** The small set used for a quick pilot (default when AGENT_TASKS is not set). */
export const PILOT = ['form-subscribe', 'wikipedia-birthdate'];
