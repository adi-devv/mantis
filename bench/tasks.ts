import type { Task, Target } from './types.js';

/** `{{base}}` in a URL is replaced with the local fixture server's origin. */
const local = (path: string): string => `{{base}}${path}`;

const textbox = (name: string | RegExp): Target => ({ roles: ['textbox', 'searchbox', 'combobox'], name });
const button = (name: string | RegExp): Target => ({ roles: ['button'], name });
const link = (name: string | RegExp, nth?: number): Target => ({ roles: ['link'], name, ...(nth !== undefined ? { nth } : {}) });

/**
 * Fixed scripts: the same steps are replayed through every tool. Targets are
 * described by role + name; the harness looks them up in each tool's own output.
 * `read` steps carry an `expect` check on what the agent would have to learn.
 */
export const TASKS: Task[] = [
  {
    id: 'example-read',
    title: 'Open example.com and read it',
    site: 'live',
    steps: [{ kind: 'open', url: 'https://example.com/' }, { kind: 'read', expect: /Example Domain/ }],
  },
  {
    id: 'hn-front-read',
    title: 'Open the Hacker News front page and read it',
    site: 'live',
    steps: [{ kind: 'open', url: 'https://news.ycombinator.com/' }, { kind: 'read', expect: /\d+\s*comments?/ }],
  },
  {
    id: 'hn-open-comments',
    title: "Hacker News: open the first story's comment thread",
    site: 'live',
    steps: [
      { kind: 'open', url: 'https://news.ycombinator.com/' },
      { kind: 'click', target: link(/^\d+\s*comments?$/) },
      { kind: 'read', expect: /add comment/i },
    ],
  },
  {
    id: 'wikipedia-article-read',
    title: 'Read the Wikipedia article on Alan Turing',
    site: 'live',
    steps: [
      { kind: 'open', url: 'https://en.wikipedia.org/wiki/Alan_Turing' },
      { kind: 'read', expect: /English mathematician|computer scientist/i },
    ],
  },
  {
    id: 'wikipedia-search',
    title: 'Search Wikipedia for "Ada Lovelace" and read the result',
    site: 'live',
    steps: [
      { kind: 'open', url: 'https://en.wikipedia.org/wiki/Main_Page' },
      { kind: 'type', target: textbox(/search/i), text: 'Ada Lovelace', submit: true },
      { kind: 'read', expect: /Ada Lovelace/ },
    ],
  },
  {
    id: 'github-repo-read',
    title: 'Read the microsoft/playwright GitHub repo page',
    site: 'live',
    steps: [{ kind: 'open', url: 'https://github.com/microsoft/playwright' }, { kind: 'read', expect: /Pull requests/i }],
  },
  {
    id: 'mdn-read',
    title: 'Read the MDN Fetch API page',
    site: 'live',
    steps: [
      { kind: 'open', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API' },
      { kind: 'read', expect: /interface for fetching resources/i },
    ],
  },
  {
    id: 'local-login',
    title: 'Fill email + password and submit a login form (local fixture)',
    site: 'local',
    steps: [
      { kind: 'open', url: local('/login') },
      { kind: 'type', target: textbox(/email/i), text: 'agent@example.com' },
      { kind: 'type', target: textbox(/password/i), text: 'correct-horse-battery' },
      { kind: 'click', target: button(/sign in/i) },
      { kind: 'read', expect: /Signed in/ },
    ],
  },
  {
    id: 'local-cookie',
    title: 'Dismiss a cookie dialog, then add to cart (local fixture)',
    site: 'local',
    steps: [
      { kind: 'open', url: local('/cookie') },
      { kind: 'click', target: button(/^accept/i) },
      { kind: 'click', target: button(/add to cart/i) },
      { kind: 'read', expect: /Added to cart/ },
    ],
  },
  {
    id: 'local-longlist-find',
    title: 'Find "Item 150" in a 200-link list and open it (local fixture)',
    site: 'local',
    steps: [
      { kind: 'open', url: local('/longlist') },
      { kind: 'click', target: link(/^Item 150$/) },
      { kind: 'read', expect: /Detail for item 150/ },
    ],
  },
  {
    id: 'local-longlist-filter',
    title: 'Use the filter box to reach "Item 150" and open it (local fixture)',
    site: 'local',
    steps: [
      { kind: 'open', url: local('/longlist') },
      { kind: 'type', target: textbox(/filter/i), text: 'Item 150' },
      { kind: 'click', target: link(/^Item 150$/) },
      { kind: 'read', expect: /Detail for item 150/ },
    ],
  },
  {
    id: 'local-form-select',
    title: 'Pick a country, tick a checkbox, submit (local fixture)',
    site: 'local',
    steps: [
      { kind: 'open', url: local('/form') },
      { kind: 'select', target: { roles: ['combobox', 'listbox', 'select'], name: /country/i }, option: 'Canada' },
      { kind: 'click', target: { roles: ['checkbox'], name: /newsletter/i } },
      { kind: 'click', target: button(/subscribe/i) },
      { kind: 'read', expect: /Subscribed from Canada \(weekly: yes\)/ },
    ],
  },
  {
    id: 'local-nav-back',
    title: 'Navigate Home → Pricing, read, go back (local fixture)',
    site: 'local',
    steps: [
      { kind: 'open', url: local('/site/home') },
      { kind: 'click', target: link(/^pricing$/i) },
      { kind: 'read', expect: /\$29 per month/ },
      { kind: 'back' },
      { kind: 'read', expect: /Welcome to Example Corp/ },
    ],
  },
  {
    id: 'local-dashboard',
    title: 'Large dashboard (60-row table): click Refresh and confirm (local fixture)',
    site: 'local',
    steps: [
      { kind: 'open', url: local('/dashboard') },
      { kind: 'click', target: button(/^refresh$/i) },
      { kind: 'read', expect: /Last updated: just now/ },
    ],
  },
];
