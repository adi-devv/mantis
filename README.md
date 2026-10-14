# Mantis

**A lean browser interface for AI agents.**

Websites are built for human eyes. To use them, AI agents today take a
screenshot, work out where the buttons are, guess pixel coordinates, click,
and take another screenshot to check. That is slow, expensive (~1,500 tokens
per screenshot) and brittle.

Mantis gives the agent what a human would understand from looking at the
page, as short text — and lets it act by number instead of by pixel.

- **Not another agent.** No LLM inside. Same page in → same text out.
- **Text first.** No screenshots. Images only as an opt-in last resort.
- **Plugs into any agent** as an MCP server (Claude Code, Cursor, your own).

## What the agent sees

A login page (real output from a test fixture, local file paths shortened, ~86 tokens):

```
Page: Login — Acme  (file:///…/login.html)
[header]
  #1 link "Home" (href /home)
[main]
  # Sign in
  [form "Login"]
    #2 textbox "Email" (email, required)
    #3 textbox "Password" (password, required)
    #4 button "Sign in" (submit)
    "Forgot your password?" #5 link "Reset it" (href /reset)
```

A shop page with a cookie popup on top (real output, paths shortened, ~65 tokens). Mantis
reports what is covering what, so the agent deals with the popup first
instead of clicking a button it can't reach:

```
Page: Shop
[dialog "Accept cookies?" — covers page]
  #3 button "Accept"
  #4 button "Reject"
[main]
  # Shop
  #1 button "Add to cart" (covered)
  #2 link "More products" (href /more, covered)
```

The agent then calls `click(3)`. It never sees a coordinate.

## How it works

```
Agent (Claude, Cursor, …)
      │  MCP
Mantis server     tools: open, read, click, type, select, press, scroll, back
Translator        cleanup → numbering → regions → compact text
Page capture      script inside the page reads the live DOM (no pixels)
Playwright        drives a real Chromium
```

1. **Capture.** A small script runs inside the page and walks the live DOM,
   including shadow DOM. For each element it works out the role, accessible
   name, state (disabled, checked, required, value…), whether it's visible,
   and whether something else is covering it.
2. **Clean up.** Hidden, decorative and empty wrapper elements are dropped.
   Long repetitive lists are collapsed (`…and 55 more links (#6–#60)`).
3. **Number.** Every useful element gets a stable `#N`. An element keeps its
   number for as long as it stays on the page, so numbers don't shift under
   the agent when the page re-renders.
4. **Write text.** Regions (`[header]`, `[dialog …]`), headings, controls and
   short labels, within a token budget.
5. **Act.** `click(14)` resolves #14 back to the real element and clicks it
   through Playwright, which waits for it to be ready. Passwords are never
   echoed back (`•••`).

## Status

Early development — built in milestones (details in [PLAN.md](PLAN.md),
progress in [PROGRESS.md](PROGRESS.md)).

| Milestone | What it adds | Status |
|---|---|---|
| M1 | Read pages as numbered text, act by number, MCP server, CLI | ✅ Done |
| M2 | After each action, report only what changed ("a dialog opened") | 🚧 In progress |
| M3 | Names for icon-only buttons, error/primary flags, regions on pages without landmarks, compact dense pages | Planned |
| M4 | Fallback ladder: hidden text & chart data → OCR → one-element image → hand off to a human (CAPTCHA, 2FA) | Planned |
| M6 | Per-site memory so repeat visits are near-free | Planned |
| M5 | Claude skill + public benchmark vs. Playwright MCP and screenshots | Planned |

Known gaps today: iframes are skipped, closed shadow roots can't be read,
unnamed icon buttons show without a name, prose-heavy pages read thin, and
very dense pages (e.g. Hacker News) get trimmed to fit the budget.

### Why not just Playwright MCP?

Playwright MCP also gives agents a text view of the page and is a great tool.
Mantis aims to go further on token cost and on reporting what a human would
notice: changes-only replies after actions, stable numbers, covered/blocked
elements, visual meaning (error, primary) as words, and a text-first fallback
ladder. The M5 benchmark will measure this — until then, treat it as a goal,
not a result.

## Quick start

Requires Node 20+.

```bash
npm install
npx playwright install chromium   # one-time browser download
npm run build

# print the numbered text view of any page (plus a ~token estimate)
npx tsx src/cli.ts read https://example.com
```

Add Mantis to Claude Code as an MCP server (absolute path to this checkout):

```bash
claude mcp add mantis -- node /abs/path/to/mantis/dist/server.js
```

| Tool | What it does |
|---|---|
| `open(url)` | Go to a page and return its text view |
| `read()` | Text view of the current page |
| `click(id)` | Click element `#id` |
| `type(id, text, submit?)` | Type into a field, optionally press Enter |
| `select(id, option)` | Pick an option in a dropdown |
| `press(key)` | Press a key (`Enter`, `Escape`, `Tab`…) |
| `scroll(direction \| id)` | Scroll the page or bring `#id` into view |
| `back()` | Go back |

Set `MANTIS_HEADLESS=0` to watch the browser. Run the tests with `npm test`.

## Contributing

Issues and PRs welcome. Run `npm run build && npm test` before opening a PR.
