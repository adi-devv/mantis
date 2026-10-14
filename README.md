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

All examples below are real Mantis output (local file paths shortened).

A login page (~78 tokens; a screenshot is ~1,500):

```
Page: Login — Acme  (file:///…/login.html)
[header]
  #1 link "Home"
[main]
  # Sign in
  [form "Login"]
    #2 textbox "Email" (email, required)
    #3 textbox "Password" (password, required)
    #4 button "Sign in" (primary)
    "Forgot your password?" #5 link "Reset it"
```

A shop page with a cookie popup on top (~61 tokens). Mantis reports what is
covering what, so the agent deals with the popup first instead of clicking a
button it can't reach:

```
Page: Shop
[dialog "Accept cookies?" — covers page]
  #3 button "Accept"
  #4 button "Reject"
[main]
  # Shop
  #1 button "Add to cart" (covered)
  #2 link "More products" (covered)
```

The agent then calls `click(3)`. It never sees a coordinate.

Icon-only buttons get a name inferred from the icon, tooltip or link — marked
with `~` so the agent knows it's a guess. With no evidence, Mantis leaves it
unnamed rather than making something up (`#4`):

```
#1 button ~"trash"
#3 button ~"settings"
#4 button
#6 button ~"search"
#7 link ~"upvote"
```

Dense pages are compacted row by row. The Hacker News front page — all 30
stories — fits in ~1,500 tokens:

```
Page: Hacker News  (https://news.ycombinator.com/)
[top bar]
  #1 link ~"home"
  #2 link "Hacker News"
  …and 8 more links (#3–#10)
[main]
  1. #11 link ~"upvote" · #12 "Better HTTP/1 connection reuse in Go 1.27" · #13 "go.dev" · 70 points · #14 "allddd" · #15 "1 hour ago" · #16 "hide" · #17 "8 comments"
  2. #18 ~"upvote" · #19 "Submarine cable resilience" · #20 "apnic.net" · 76 points · …
  …
```

`read({region: "nav"})` reads just one part of a page; `read({full: true})`
turns off all trimming.

After an action, Mantis replies with only what changed, not the whole page
again (real output from test fixtures):

```
clicked #2 button "Open settings"
+ [dialog "Confirm" — covers page]
+ #4 button "OK"
+ #5 button "Cancel"
~ 3 items now covered (#1–#3)
```

```
typed "nope" into #1 textbox "Email" and pressed Enter
+ [form "Subscribe"] "Invalid email"
~ #1 textbox "Email": value "" → "nope"; now error
```

Pop-up messages (`role=alert`, toasts, live regions) show up too, as
`+ [main] ⚠ "Saved successfully"`.

`+` appeared, `-` disappeared, `~` changed. If nothing changed it says
`(no visible change)`; if the action led to a new page, it returns that
page's full view.

### When text isn't enough: the fallback ladder

Mantis tries the cheapest option first and only goes further when the agent
asks:

1. **`data(id)` — the text behind visuals.** Image alt text and captions, SVG
   labels, and the actual numbers inside Chart.js / ECharts / Highcharts
   charts (real output from a Chart.js canvas):
   ```
   Chart.js bar chart "Q1 numbers"
    | Sales | Cost
   Jan | 10 | 5
   Feb | 20 | 8
   ```
2. **`ocr(id)` — text inside an image**, via Tesseract (plain OCR, no AI).
   Returns text, never the image.
3. **`look(id)` — a picture of one element only.** The single tool that
   returns an image: a crop of that element, at most 800px. Never the full
   page.
4. **`ask_human(reason)` — hand off to you.** For CAPTCHAs, 2FA codes and
   payments. Mantis opens a visible browser window, waits for you to finish,
   then carries on. **Mantis never solves CAPTCHAs.** `read()` flags them:
   ```
   ⚠ CAPTCHA detected — call ask_human("captcha")
   ```

## How it works

```
Agent (Claude, Cursor, …)
      │  MCP
Mantis server     tools: open, read, click, type, … + fallbacks (data, ocr, look, ask_human)
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
| M2 | After each action, report only what changed ("a dialog opened") | ✅ Done |
| M3 | Names for icon-only buttons, error/primary flags, regions on pages without landmarks, compact dense pages, article text | ✅ Done |
| M4 | Fallback ladder: hidden text & chart data → OCR → one-element image → hand off to a human (CAPTCHA, 2FA) | ✅ Done |
| M6 | Per-site memory so repeat visits are near-free | 🚧 In progress |
| M5 | Claude skill + public benchmark vs. Playwright MCP and screenshots | Planned |

Known gaps today: iframes are skipped and closed shadow roots can't be read;
inferred names are heuristics (always `~`-marked) with a small icon
vocabulary; article text is summarised only for simple paragraph blocks;
repeated-row compaction only catches rows with a consistent structure;
ECharts/Highcharts extraction is implemented but only Chart.js is tested;
the visible-window path of `ask_human` hasn't been tested yet.

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
| `read(region?, full?)` | Text view of the current page, or one region of it |
| `click(id)` | Click element `#id` |
| `type(id, text, submit?)` | Type into a field, optionally press Enter |
| `select(id, option)` | Pick an option in a dropdown |
| `press(key)` | Press a key (`Enter`, `Escape`, `Tab`…) |
| `scroll(direction \| id)` | Scroll the page or bring `#id` into view |
| `back()` | Go back |
| `media()` | List images, canvases and charts, with numbers |
| `data(id \| selector)` | Text behind an image, SVG or chart (no image) |
| `ocr(id \| selector)` | Read text inside an image (no image returned) |
| `look(id \| selector)` | Last resort: a cropped image of one element |
| `ask_human(reason, until?)` | Hand off to a human (CAPTCHA, 2FA, payment) and wait |

Set `MANTIS_HEADLESS=0` to watch the browser. OCR language data is downloaded
on first use and cached in `~/.cache/mantis/tessdata` (or set
`MANTIS_TESSDATA`). Run the tests with `npm test`.

## Contributing

Issues and PRs welcome. Run `npm run build && npm test` before opening a PR.
