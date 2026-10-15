# Mantis token-cost benchmark

> **What this is:** a deterministic replay. Each task is a fixed script of steps, replayed through each tool; we measure the *size of what the agent would receive* (text returned by the tool, or an estimated image cost for the screenshot baseline). **No LLM is involved and no agent success rate is measured.** "ok" below means the harness could find the target in that tool's output and the action did not error; it does not mean an agent would have succeeded.

## Setup

- Date: 2026-10-15
- Mantis: git `e4961ef` (**src/ had uncommitted changes**); numbers reflect Mantis at this commit and will change as it changes
- Playwright MCP: `@playwright/mcp@0.0.83` (default config, headless, isolated profile, viewport 1280x800)
- Playwright (screenshot baseline + Mantis): `1.64.1`; Chromium 156.0.8078.4; viewport 1280x800 for all three
- Machine: win32 10.0.26200, 12 logical cores, 7 GB RAM; Node v20.14.0
- Reproduce: `BENCH_ONLY=github-repo-read,local-form-select,local-nav-back,local-longlist-find npx tsx bench/run.ts`

## How the cost per step is counted

- **Mantis / Playwright MCP:** every call is made over MCP stdio, as an agent would. Per step we sum (a) the text returned by the action call and (b) one *observe* call (Mantis `read`, Playwright MCP `browser_snapshot`) if the agent needs a page view it does not already hold. The harness (not the measured agent) looks targets up in each tool's own output: Mantis `#N`, Playwright MCP `[ref=eN]`.
- A page view is "held" if the last reply contained it (Mantis `open`, or an action that lands on a new page), or if the previous reply was a change summary (Mantis diffs: ids stay stable, new ids appear in the diff). After a click / Enter / back the view is considered stale unless the reply carried it. Typing into a field or choosing an option does not make the view stale.
- In `@playwright/mcp` 0.0.83 default mode, action replies contain only a short log plus a *link to a snapshot file*, not the page. We therefore count `browser_snapshot` (inline) whenever the agent needs to see the page. The file would hold the same content.
- **Screenshot baseline:** one 1280x800 viewport PNG per open/action step (`read` steps add none). Actions are performed by the harness with role+name locators (an oracle), so this baseline does not test whether an agent could find targets from pixels, and it ignores scrolling for below-the-fold content: **it under-counts a real screenshot agent**. Tokens = `ceil(w*h/750)` after downscaling to <=1568 px longest side and <=~1.15 MP (Anthropic's published image-token formula; an estimate). For 1280x800 that is 1,366 tokens per screenshot.
- **Text tokens:** primary estimator is `chars/4` (rounded up), used for every text tool. Secondary: OpenAI `cl100k_base` via js-tiktoken. Both are approximations; Claude's tokenizer differs. The image estimate is the same in both columns.
- Steps run to the end even after a failure (failed steps are shown, never dropped). One run per task; live sites change over time, so live-site numbers are a snapshot.

## Summary (all tasks)

| | Mantis | Playwright MCP | Screenshot (est.) |
|---|---:|---:|---:|
| Total tokens (chars/4) | 1,936 | 20,170 | 13,660 |
| Total tokens (cl100k) | 2,294 | 21,946 | 13,660 |
| Median tokens per step (chars/4) | 53 | 157 | 1,366 |
| Steps ok / total | 13 / 15 | 15 / 15 | 10 / 10 (+5 n/a) |
| Tasks fully completed | 3 / 4 | 4 / 4 | 4 / 4 |

Totals include tokens spent on failed steps, and exclude tokens a tool would have cost had a failed step succeeded, so a tool that fails early can look cheaper than it is. For a like-for-like view see the next table.

## Summary (only tasks where all three tools completed every step: 3 of 4)

| | Mantis | Playwright MCP | Screenshot (est.) |
|---|---:|---:|---:|
| Total tokens (chars/4) | 1,711 | 14,357 | 10,928 |
| Total tokens (cl100k) | 1,952 | 14,113 | 10,928 |
| Median tokens per step (chars/4) | 26 | 173 | 1,366 |

Tasks: github-repo-read, local-form-select, local-nav-back

## Fixed per-session cost: tool definitions

The tool list an agent carries in context for the whole session (not included in the per-step numbers above).

| Tool | # tools | chars | tokens (chars/4) | tokens (cl100k) |
|---|---:|---:|---:|---:|
| mantis | 14 | 6,539 | 1,635 | 1,586 |
| playwright-mcp | 25 | 20,286 | 5,072 | 4,310 |

## Per task (tokens, chars/4)

| Task | Steps | Mantis | Playwright MCP | Screenshot (est.) |
|---|---:|---:|---:|---:|
| `github-repo-read` (live) | 2 | 1,299 | 12,927 | 1,366 |
| `local-longlist-find` (local) | 3 | 225 ⚠ 2 failed | 5,813 | 2,732 |
| `local-form-select` (local) | 5 | 142 | 677 | 5,464 |
| `local-nav-back` (local) | 5 | 270 | 753 | 4,098 |

## Failures

| Task | Tool | Step | Reason |
|---|---|---|---|
| `local-longlist-find` | mantis | 2. click link /^Item 150$/ | target link /^Item 150$/ not in what the agent receives |
| `local-longlist-find` | mantis | 3. read (expect /Detail for item 150/) | expected /Detail for item 150/ not found in what the agent receives |

## Per-step detail

Cells are `action + observe` tokens (chars/4); `FAIL` marks a failed step; `n/a` is a step with no applicable check.

### `github-repo-read` — Read the microsoft/playwright GitHub repo page

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open https://github.com/microsoft/playwright | 1,299 + 0 | 99 + 0 | 0 + 1,366 |
| 2 | read (expect /Pull requests/i) | 0 + 0 | 0 + 12,828 | n/a (0 + 0) |

### `local-longlist-find` — Find "Item 150" in a 200-link list and open it (local fixture)

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open <local>/longlist | 66 + 0 | 55 + 0 | 0 + 1,366 |
| 2 | click link /^Item 150$/ | FAIL (0 + 53) | 58 + 5,636 | 0 + 1,366 |
| 3 | read (expect /Detail for item 150/) | FAIL (0 + 106) | 0 + 64 | n/a (0 + 0) |

### `local-form-select` — Pick a country, tick a checkbox, submit (local fixture)

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open <local>/form | 70 + 0 | 55 + 0 | 0 + 1,366 |
| 2 | select "Canada" in combobox /country/i | 24 + 0 | 57 + 140 | 0 + 1,366 |
| 3 | click checkbox /newsletter/i | 28 + 0 | 64 + 0 | 0 + 1,366 |
| 4 | click button /subscribe/i | 20 + 0 | 59 + 145 | 0 + 1,366 |
| 5 | read (expect /Subscribed from Canada \(weekly: yes\)/) | 0 + 0 | 0 + 157 | n/a (0 + 0) |

### `local-nav-back` — Navigate Home → Pricing, read, go back (local fixture)

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open <local>/site/home | 72 + 0 | 60 + 0 | 0 + 1,366 |
| 2 | click link /^pricing$/i | 103 + 0 | 66 + 183 | 0 + 1,366 |
| 3 | read (expect /\$29 per month/) | 0 + 0 | 0 + 203 | n/a (0 + 0) |
| 4 | back | 95 + 0 | 52 + 0 | 0 + 1,366 |
| 5 | read (expect /Welcome to Example Corp/) | 0 + 0 | 0 + 189 | n/a (0 + 0) |

## Caveats

- Token-size of tool output only. Smaller output is cheaper, not necessarily better: a tool can fail a task by omitting what is needed (see Failures), and this benchmark does not measure whether an LLM would succeed with any of these outputs.
- Mantis numbers are for the commit above. Mantis output and defaults change between commits; re-run `npm run bench` to refresh.
- The screenshot figure is a lower bound on a real screenshot-driven agent and relies on a published estimate formula, not a measured bill.
- Live sites (example.com, Hacker News, Wikipedia, GitHub, MDN) change content and layout over time and may serve different variants by region, language or bot detection; one run each.
- The harness picks the first element whose role and name match; a different (or smarter) agent might pick differently.
