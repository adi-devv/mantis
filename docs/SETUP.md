# Setup

## Install

Requires Node 20+.

```bash
npx playwright install chromium
claude mcp add mantis -- npx -y -p mantis-browser mantis-mcp
```

On native Windows: `claude mcp add mantis -- cmd /c npx -y -p mantis-browser mantis-mcp`

Try it without an agent: `npx -y -p mantis-browser mantis read https://example.com`

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

## Sarvam evals

Store `SARVAM_API_KEY` only in gitignored `.env`. Use the scoped scripts:

```bash
npm --prefix bench/agent run bench:sarvam-probe
npm --prefix bench/agent run bench:sarvam-calibrate
npm --prefix bench/agent run bench:tool-diagnostics -- <result-name>
```

Use `AGENT_PROVIDER=sarvam` primarily for fixture agents with deterministic graders; match all approaches on one model. Luna/Haiku remain headline numbers. Trial trace/log analysis and doc summaries with source references and sol sampling; text-only models cannot do visual tasks.

Keep sol as the default judge: measured Sarvam calibration and the first-pass filter failed. `JUDGE_PROVIDER=sarvam` is for calibration/shadow trials, always on another model's runs. Run one Sarvam job at a time: 30 RPM is shared across processes, concurrency 2 is per process. Diagnostics write `bench/results/<result-name>-tool-diagnostics.{json,md}` offline; Sarvam semantic review of flagged steps is planned, with sol sampling. See [bench/README.md](../bench/README.md) for calibration, repairs and the planned ~30-task real-site set with stable answer keys.

To use a local build instead of npm: `claude mcp add mantis -- node /abs/path/to/mantis/dist/server.js`.

## Configuration

| Variable | Effect |
|---|---|
| `MANTIS_HEADLESS=0` | Show the browser window |
| `MANTIS_MEMORY=0` | Turn off site memory (shortening menus already seen on a site) |
| `MANTIS_MEMORY_DIR` | Where site memory lives (default `~/.cache/mantis/sites`; layout hashes only, never page text) |
| `MANTIS_CHROMIUM` | Path to an installed Chromium binary, for when Playwright's pinned build isn't installed (the test suite and benchmarks then use it) |
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

Where work stands and design: [PLAN.md](PLAN.md). How it works: [APPROACH.md](APPROACH.md).
Issues and PRs welcome; run `npm run build && npm test` first.
