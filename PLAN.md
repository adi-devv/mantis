# Mantis — build plan

> A lean browser interface for AI agents. Mantis turns web pages into short text
> an agent can read and act on — no screenshots by default.

## What Mantis is (and isn't)

- **A tool, not an agent.** No LLM inside. Same page in → same text out.
- **An MCP server** (plus a small library and CLI) that any agent can plug into.
- **Text first.** Images only as an opt-in, last-resort fallback.

## Architecture

```
Agent (Claude, Cursor, …)
      │  MCP (stdio)
Mantis MCP server      src/server.ts      tools: open, read, click, type, …
Mantis translator      src/translate.ts   cleanup, numbering, regions, text format
                       src/diff.ts        what changed after an action
Page capture           src/capture/       injected DOM walker → raw nodes
Browser                src/browser.ts     Playwright (library, not Playwright MCP)
Chrome / Chromium
```

### Key design decisions

1. **Capture via an injected DOM walker** (runs inside the page), not screenshots.
   It walks the DOM including open shadow roots and same-origin iframes, and
   computes for each relevant element: role, accessible name, state, bounding
   box, visibility, and whether it is covered by something else.
2. **Stable IDs.** The walker keeps a `WeakMap<Element, number>` on `window`.
   An element keeps its number for as long as it lives in the page; new
   elements get new numbers. Numbers are never reused within a page load.
3. **Act through Playwright.** `click(14)` → resolve id 14 to an element handle
   → Playwright's `click()` (gets actionability checks + auto-wait for free).
   The agent never sees coordinates.
4. **Diffs after every action.** Actions return what changed (URL/title,
   elements added/removed/changed), not the whole page. `read()` returns the
   full view on demand.
5. **Token budget.** Target: a typical `read()` ≤ ~1,500 tokens (≈ one
   screenshot); an action result ≤ ~300 tokens. Long lists are collapsed
   ("…and 37 more"), long text is truncated.

### Output format (v0)

```
Page: Login — Acme  (https://acme.com/login)
[dialog "Accept cookies?" — covers page]
  #20 button "Accept"
  #21 button "Reject"
[header]
  #3 link "Home"
  #4 searchbox "Search"
[main]
  # Sign in
  #12 textbox "Email" (required)
  #13 textbox "Password" (required)
  #14 button "Sign in" (primary)
  "Forgot your password?" #15 link "Reset it"
[footer] 6 links (#30–#35)
```

Rules: one element per line; `#N role "name" (states)`; regions in `[brackets]`
from landmarks/dialogs; headings as `#`-prefixed text without an id;
non-interactive text only when short and useful; hidden/offscreen-irrelevant
nodes dropped.

Action result example:

```
clicked #14 "Sign in"
url: /login → /dashboard
+ [main] # Welcome back, Aadit
+ #40 link "Settings"
- #12, #13, #14 removed
```

## Milestones

### M1 — Read + act + MCP (foundation)
- `src/browser.ts`: launch/close Chromium via Playwright, one active page.
- `src/capture/walker.ts` (in-page) + `src/capture/index.ts`: raw node list.
- `src/translate.ts`: raw nodes → text format above.
- Actions: `open(url)`, `read()`, `click(n)`, `type(n, text, submit?)`,
  `select(n, option)`, `press(key)`, `scroll(direction | n)`, `back()`.
- `src/server.ts`: MCP stdio server exposing those tools.
- `src/cli.ts`: `mantis read <url>` prints the text view (dev/debug).
- Tests (vitest) on local HTML fixtures: login form, hidden elements,
  cookie dialog, long list, shadow DOM.

### M2 — Diffs + stable IDs
- `src/diff.ts`: compare before/after snapshots; actions return diffs.
- Wait-for-settle after actions (network idle-ish + DOM quiet window).
- Tests proving IDs survive re-renders and diffs are minimal.

### M3 — "What a human sees", as text
- Names for unnamed buttons (icon class / SVG title / tooltip / nearby text).
- Occlusion: "dialog covers page", elements blocked by overlays flagged.
- Visual meaning → words: error, disabled, selected, primary button.
- Regions for pages without landmarks (bbox-based: top bar, sidebar, grid).
- Relevance trimming for huge pages (viewport-first, `read(region)`).

### M4 — Fallback ladder
1. Hidden text: alt, captions, chart data in memory / fetched JSON.
2. OCR for text inside images (tesseract.js — deterministic, no LLM).
3. `look(n)`: cropped image of one element, only when the agent asks.
4. `ask_human(reason)`: pause for CAPTCHA / 2FA / payment, resume after.
   Mantis never solves CAPTCHAs.

### M5 — Skill + benchmark
- `skill/SKILL.md`: tells Claude to prefer Mantis, act by number, avoid images.
- Benchmark: ~20 real tasks, Mantis vs Playwright MCP vs screenshots.
  Measure tokens/step, steps/task, success rate, % tasks with zero images.
  Publish real numbers only.

### M6 — Site memory
- Per-domain cache of page structure so repeat visits are near-free.

## Stack
TypeScript (ESM, Node ≥20), Playwright, `@modelcontextprotocol/sdk`, zod, vitest.
