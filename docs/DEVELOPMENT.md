# Development

## Build and test

Requires Node 20+.

```bash
npm install
npx playwright install chromium
npm run build
npm test             # includes a check that nothing in Chrome's accessibility tree is lost
npm run bench        # token replay
npm run bench:agent  # real-agent eval (needs an agent CLI)
npx tsx src/cli.ts read https://example.com
```

Benchmarks, their settings and how results are graded: [bench/README.md](../bench/README.md).

To use a local build instead of npm: `claude mcp add mantis -- node /abs/path/to/mantis/dist/server.js`.

## Configuration

| Variable | Effect |
|---|---|
| `MANTIS_HEADLESS=0` | Show the browser window |
| `MANTIS_MEMORY=0` | Turn off site memory (shortening menus already seen on a site) |
| `MANTIS_MEMORY_DIR` | Where site memory lives (default `~/.cache/mantis/sites`; layout hashes only, never page text) |
| `MANTIS_TESSDATA` | OCR language data folder (default `~/.cache/mantis/tessdata`, downloaded on first use) |

## Tool reference

| Tool | Arguments |
|---|---|
| `open` | `url` |
| `read` | `region?` (`"nav"`, `"main"`, …), `full?`, `fresh?` |
| `find` | `text` |
| `click` · `type` · `select` | `id`; `type` also `text`, `submit?`; `select` also `option` |
| `fill` | `fields: [{id, value}]`, value is text, an option, or true/false |
| `press` · `scroll` · `back` | `key`; `direction` or `id`; none |
| `media` · `data` · `ocr` · `look` | none; `id` |
| `ask_human` | `reason` |
| `forget` | none |

## Limitations

Closed shadow roots can't be read. The image tools (`media`, `data`, `ocr`, `look`) don't look inside iframes
yet. Guessed names (`~`) come from a small icon vocabulary.

## Where things are

Where work stands: [PROGRESS.md](PROGRESS.md). Design: [PLAN.md](PLAN.md). How it works: [APPROACH.md](APPROACH.md).
Issues and PRs welcome; run `npm run build && npm test` first.
