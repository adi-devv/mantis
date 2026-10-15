# Mantis

**A lean browser interface for AI agents: web pages as short numbered text.**

AI agents browse either by screenshots (~1,400 tokens per look, clicks are pixel guesses)
or by dumping the page's accessibility tree (the whole page, every time). Mantis gives the
agent what a person would notice on the page, as compact text, and lets it act by number.

- **No LLM inside.** Same page in, same text out.
- **Text first.** Images only as an explicit last resort.
- **Any agent.** An MCP server for Claude Code, Cursor, or your own.

## Quick start

Requires Node 20+.

```bash
npx playwright install chromium
claude mcp add mantis -- npx -y -p mantis-browser mantis-mcp
# native Windows: claude mcp add mantis -- cmd /c npx -y -p mantis-browser mantis-mcp
```

Try it without an agent:

```bash
npx -y -p mantis-browser mantis read https://example.com
```

Optional: the [Claude skill](skill/SKILL.md) teaches Claude how to read Mantis output.

## What the agent sees

A shop page with a cookie popup (real output; page URL shortened):

```
Page: Shop  (…/cookie.html)
[dialog "Accept cookies?" — covers page]
  #3 button "Accept"
  #4 button "Reject"
[main]
  # Shop
  #1 button "Add to cart" (covered)
  #2 link "More products" (covered)
```

The agent calls `click(3)` and gets back only what changed:

```
clicked #3 button "Accept"
~ #1 button "Add to cart": no longer covered
~ #2 link "More products": no longer covered
- [dialog "Accept cookies?"] closed (3 items)
```

What it reports that a person would notice:

- `(covered)`: a popup or overlay is on top of it
- `(primary)`, `error: "Invalid email"`, `looks disabled`: visual meaning, as words
- `~"trash"`: a name guessed from an icon, marked as a guess
- `[iframe "Payment"]`, `clickable`: frames and script-only buttons, read inline
- `…and 158 more links (#45–#202); find("text") locates one`: long lists shortened, never hidden

## Tools

| Tool | What it does |
|---|---|
| `open(url)` | Go to a page and return its text view |
| `read(region?, full?, fresh?)` | The current page, or one region of it (`"nav"`, `"main"`) |
| `find(text)` | Search the whole page, trimmed parts included |
| `click(id)` · `type(id, text, submit?)` · `select(id, option)` | Act on element `#id` |
| `press(key)` · `scroll(direction \| id)` · `back()` | Keyboard, scrolling, history |
| `media()` · `data(id)` | List images and charts; get their text and chart values |
| `ocr(id)` | Text inside an image (no image returned) |
| `look(id)` | Last resort: a cropped image of one element |
| `ask_human(reason)` | Hand off to you for a CAPTCHA, 2FA or payment, then continue |
| `forget()` | Clear site memory for the current site |

Mantis never solves CAPTCHAs; `read()` flags them and suggests `ask_human`.

## Benchmark

14 tasks replayed through Mantis, Playwright MCP (accessibility tree) and screenshots
([full results](bench/results/latest.md)):

| | Mantis | Accessibility tree | Screenshots |
|---|---:|---:|---:|
| Tasks completed | 14 / 14 | 14 / 14 | 14 / 14 |
| Median tokens per step | 28 | 131 | ~1,366 |
| Median time per step (local pages) | 247 ms | 315 ms | 1,066 ms |

This is a scripted replay with no LLM in the loop: it measures what an agent receives, not
whether it succeeds. A real-agent eval with Claude is in progress: in a 2-task pilot all
three got both right, with Mantis using the fewest tokens (64k vs 109k vs 304k)
([pilot results](bench/results/agent-pilot.md), [how to run](bench/README.md)).

## How it works

A script inside the page walks the live DOM (shadow DOM and iframes included) and records
each element's role, name, state, visibility and whether something covers it. Mantis drops
noise, numbers every useful element (numbers stay stable while the element lives), groups
it into regions, and writes it within a token budget. Actions resolve `#N` back to the real
element and click through Playwright.

Diagrams and the comparison with accessibility-tree agents: [docs/APPROACH.md](docs/APPROACH.md).

## Configuration

| Variable | Effect |
|---|---|
| `MANTIS_HEADLESS=0` | Show the browser window |
| `MANTIS_MEMORY=0` | Turn off site memory (shortening menus already seen on a site) |
| `MANTIS_MEMORY_DIR` | Where site memory lives (default `~/.cache/mantis/sites`; layout hashes only, never page text) |
| `MANTIS_TESSDATA` | OCR language data folder (default `~/.cache/mantis/tessdata`, downloaded on first use) |

## Limitations

Closed shadow roots can't be read. The image tools (`media`, `data`, `ocr`, `look`) don't
look inside iframes yet. Guessed names (`~`) come from a small icon vocabulary.
More in [PROGRESS.md](PROGRESS.md).

## Development

```bash
npm install
npx playwright install chromium
npm run build
npm test          # includes a check that nothing in Chrome's accessibility tree is lost
npm run bench     # token/time benchmark (see bench/README.md)
npm run bench:agent  # real-agent eval with Claude (uses your plan)
npx tsx src/cli.ts read https://example.com
```

Issues and PRs welcome; run `npm run build && npm test` first.

## License

MIT
