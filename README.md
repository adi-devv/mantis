# Mantis

**A lean browser interface for AI agents: web pages as short numbered text.**

Agents browse with screenshots (about 1,400 tokens per look, clicks are pixel guesses) or by
dumping the page's accessibility tree (the whole page, every time). Mantis gives the agent
what a person would notice on the page, as compact text, and lets it act by number. It is an
MCP server for Claude Code, Cursor or your own agent. There is no LLM inside: the same page
gives the same text.

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

Optional: the [Claude skill](skill/README.md) teaches Claude how to read Mantis output.

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

Beyond the accessibility tree, the text also reports:

- `(covered)`: a popup or overlay is on top of it
- `(primary)`, `error: "Invalid email"`, `looks disabled`: visual meaning, as words
- `~"trash"`: a name guessed from an icon, marked as a guess
- `[iframe "Payment"]`, `clickable`: frames and script-only buttons, read inline
- `…and 158 more links (#45–#202); find("text") locates one`: long lists shortened, never hidden

How this works, with diagrams: [docs/APPROACH.md](docs/APPROACH.md).

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

Everything here is re-runnable ([how](bench/README.md)). Mantis is compared with the
accessibility tree (Playwright MCP 0.0.83) and with screenshots (our own minimal tool).

**Token replay** (14 scripted tasks, no LLM; [results](bench/results/latest.md)). Per step,
Mantis returns a median of 28 tokens, the tree 131, screenshots about 1,366. All three finish
all 14 tasks.

**Real agents** (an agent CLI does each task with each tool; 22 short tasks, 1 run each):

| Agent | Mantis | Accessibility tree | Screenshots |
|---|---:|---:|---:|
| Codex `gpt-6.1-sol` ([results](bench/results/codex-sol.md)) | 22/22 · 1.58M tokens | 22/22 · 1.50M | 20/22 · 1.86M |
| Codex `gpt-6-luna` ([results](bench/results/codex-luna.md)) | 21/22 · 1.74M | 22/22 · 1.97M | 17/22 · 2.65M |
| Claude `claude-haiku-5-5` ([results](bench/results/claude-haiku.md)) | 22/22 · 1.29M | 22/22 · 1.77M | 22/22 · 1.25M |

On short tasks Mantis and the tree are about even. On the 4 long tasks (15–27 actions each:
shop checkout, admin edits, a 5-step wizard, comparing 7 products; 3 runs each):

| Agent | Mantis | Accessibility tree | Screenshots |
|---|---:|---:|---:|
| Codex `gpt-6-luna` ([results](bench/results/codex-luna-long.md)) | 12/12 · 2.59M tokens | 10/12 · 4.84M | 9/12 · 4.64M |
| Claude `claude-haiku-5-5` ([results](bench/results/claude-haiku-long.md)) | 12/12 · 3.15M | 12/12 · 4.96M | 12/12 · 5.01M |

On long tasks the tree uses 1.6–1.9x Mantis's tokens, because every step re-reads more page.
Time and cost are in the results files.

Caveat: 25 of the 26 agent tasks are local pages written by the Mantis authors, and the
screenshot baseline is our own minimal tool. An unbiased eval on real sites is next
([docs/PROGRESS.md](docs/PROGRESS.md)).

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

## Development

```bash
npm install
npx playwright install chromium
npm run build
npm test             # includes a check that nothing in Chrome's accessibility tree is lost
npm run bench        # token replay
npm run bench:agent  # real-agent eval (needs an agent CLI; see bench/README.md)
npx tsx src/cli.ts read https://example.com
```

To use a local build instead of npm: `claude mcp add mantis -- node /abs/path/to/mantis/dist/server.js`.

Where work stands: [docs/PROGRESS.md](docs/PROGRESS.md). Design: [docs/PLAN.md](docs/PLAN.md). Issues and PRs
welcome; run `npm run build && npm test` first.

## License

MIT
