# Mantis token-cost benchmark

> **What this is:** a deterministic replay. Each task is a fixed script of steps, replayed through each tool; we measure the *size of what the agent would receive* (text returned by the tool, or an estimated image cost for the screenshot baseline). **No LLM is involved and no agent success rate is measured.** "ok" below means the harness could find the target in that tool's output and the action did not error; it does not mean an agent would have succeeded.

## Setup

- Date: 2026-10-14
- Mantis: git `8b61afc` (**src/ had uncommitted changes**); numbers reflect Mantis at this commit and will change as it changes
- Playwright MCP: `@playwright/mcp@0.0.83` (default config, headless, isolated profile, viewport 1280x800)
- Playwright (screenshot baseline + Mantis): `1.64.1`; Chromium 156.0.8078.4; viewport 1280x800 for all three
- Machine: win32 10.0.26200, 12 logical cores, 7 GB RAM; Node v20.14.0
- Reproduce: `npm run bench`

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
| Total tokens (chars/4) | 11,348 | 459,008 | 40,980 |
| Total tokens (cl100k) | 15,352 | 489,715 | 40,980 |
| Median tokens per step (chars/4) | 51 | 131 | 1,366 |
| Steps ok / total | 40 / 45 | 45 / 45 | 30 / 30 (+15 n/a) |
| Tasks fully completed | 10 / 14 | 14 / 14 | 14 / 14 |

Totals include tokens spent on failed steps, and exclude tokens a tool would have cost had a failed step succeeded, so a tool that fails early can look cheaper than it is. For a like-for-like view see the next table.

## Summary (only tasks where all three tools completed every step: 10 of 14)

| | Mantis | Playwright MCP | Screenshot (est.) |
|---|---:|---:|---:|
| Total tokens (chars/4) | 9,028 | 438,838 | 27,320 |
| Total tokens (cl100k) | 12,427 | 467,769 | 27,320 |
| Median tokens per step (chars/4) | 29 | 112 | 1,366 |

Tasks: example-read, hn-front-read, hn-open-comments, wikipedia-article-read, wikipedia-search, mdn-read, local-login, local-cookie, local-longlist-filter, local-dashboard

## Fixed per-session cost: tool definitions

The tool list an agent carries in context for the whole session (not included in the per-step numbers above).

| Tool | # tools | chars | tokens (chars/4) | tokens (cl100k) |
|---|---:|---:|---:|---:|
| mantis | 14 | 6,539 | 1,635 | 1,586 |
| playwright-mcp | 25 | 20,286 | 5,072 | 4,310 |

## Per task (tokens, chars/4)

| Task | Steps | Mantis | Playwright MCP | Screenshot (est.) |
|---|---:|---:|---:|---:|
| `example-read` (live) | 2 | 190 | 370 | 1,366 |
| `hn-front-read` (live) | 2 | 1,444 | 12,160 | 1,366 |
| `hn-open-comments` (live) | 3 | 1,945 | 114,160 | 2,732 |
| `wikipedia-article-read` (live) | 2 | 639 | 152,754 | 1,366 |
| `wikipedia-search` (live) | 3 | 1,973 | 113,898 | 2,732 |
| `github-repo-read` (live) | 2 | 1,620 ⚠ 1 failed | 12,927 | 1,366 |
| `mdn-read` (live) | 2 | 1,176 | 29,518 | 1,366 |
| `local-login` (local) | 5 | 141 | 487 | 5,464 |
| `local-cookie` (local) | 4 | 119 | 438 | 4,098 |
| `local-longlist-find` (local) | 3 | 201 ⚠ 2 failed | 5,813 | 2,732 |
| `local-longlist-filter` (local) | 4 | 170 | 5,838 | 4,098 |
| `local-form-select` (local) | 5 | 207 ⚠ 1 failed | 677 | 5,464 |
| `local-nav-back` (local) | 5 | 292 ⚠ 1 failed | 753 | 4,098 |
| `local-dashboard` (local) | 3 | 1,231 | 9,215 | 2,732 |

## Failures

| Task | Tool | Step | Reason |
|---|---|---|---|
| `github-repo-read` | mantis | 2. read (expect /Pull requests/i) | expected /Pull requests/i not found in what the agent receives |
| `local-longlist-find` | mantis | 2. click link /^Item 150$/ | target link /^Item 150$/ not in what the agent receives |
| `local-longlist-find` | mantis | 3. read (expect /Detail for item 150/) | expected /Detail for item 150/ not found in what the agent receives |
| `local-form-select` | mantis | 5. read (expect /Subscribed from Canada \(weekly: yes\)/) | expected /Subscribed from Canada \(weekly: yes\)/ not found in what the agent receives |
| `local-nav-back` | mantis | 3. read (expect /\$29 per month/) | expected /\$29 per month/ not found in what the agent receives |

## Per-step detail

Cells are `action + observe` tokens (chars/4); `FAIL` marks a failed step; `n/a` is a step with no applicable check.

### `example-read` — Open example.com and read it

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open https://example.com/ | 190 + 0 | 52 + 0 | 0 + 1,366 |
| 2 | read (expect /Example Domain/) | 0 + 0 | 0 + 318 | n/a (0 + 0) |

### `hn-front-read` — Open the Hacker News front page and read it

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open https://news.ycombinator.com/ | 1,444 + 0 | 56 + 0 | 0 + 1,366 |
| 2 | read (expect /\d+\s*comments?/) | 0 + 0 | 0 + 12,104 | n/a (0 + 0) |

### `hn-open-comments` — Hacker News: open the first story's comment thread

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open https://news.ycombinator.com/ | 1,436 + 0 | 56 + 0 | 0 + 1,366 |
| 2 | click link /^\d+\s*comments?$/ | 509 + 0 | 83 + 12,105 | 0 + 1,366 |
| 3 | read (expect /add comment/i) | 0 + 0 | 0 + 101,916 | n/a (0 + 0) |

### `wikipedia-article-read` — Read the Wikipedia article on Alan Turing

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open https://en.wikipedia.org/wiki/Alan_Turing | 639 + 0 | 65 + 0 | 0 + 1,366 |
| 2 | read (expect /English mathematician\|computer scientist/i) | 0 + 0 | 0 + 152,689 | n/a (0 + 0) |

### `wikipedia-search` — Search Wikipedia for "Ada Lovelace" and read the result

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open https://en.wikipedia.org/wiki/Main_Page | 1,258 + 0 | 66 + 0 | 0 + 1,366 |
| 2 | type "Ada Lovelace" into textbox /search/i + Enter | 715 + 0 | 92 + 16,079 | 0 + 1,366 |
| 3 | read (expect /Ada Lovelace/) | 0 + 0 | 0 + 97,661 | n/a (0 + 0) |

### `github-repo-read` — Read the microsoft/playwright GitHub repo page

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open https://github.com/microsoft/playwright | 841 + 0 | 99 + 0 | 0 + 1,366 |
| 2 | read (expect /Pull requests/i) | FAIL (0 + 779) | 0 + 12,828 | n/a (0 + 0) |

### `mdn-read` — Read the MDN Fetch API page

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API | 1,176 + 0 | 93 + 0 | 0 + 1,366 |
| 2 | read (expect /interface for fetching resources/i) | 0 + 0 | 0 + 29,425 | n/a (0 + 0) |

### `local-login` — Fill email + password and submit a login form (local fixture)

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open <local>/login | 71 + 0 | 56 + 0 | 0 + 1,366 |
| 2 | type "agent@example.com" into textbox /email/i | 26 + 0 | 28 + 151 | 0 + 1,366 |
| 3 | type "correct-horse-battery" into textbox /password/i | 20 + 0 | 30 + 0 | 0 + 1,366 |
| 4 | click button /sign in/i | 24 + 0 | 59 + 0 | 0 + 1,366 |
| 5 | read (expect /Signed in/) | 0 + 0 | 0 + 163 | n/a (0 + 0) |

### `local-cookie` — Dismiss a cookie dialog, then add to cart (local fixture)

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open <local>/cookie | 58 + 0 | 54 + 0 | 0 + 1,366 |
| 2 | click button /^accept/i | 41 + 0 | 57 + 118 | 0 + 1,366 |
| 3 | click button /add to cart/i | 20 + 0 | 58 + 73 | 0 + 1,366 |
| 4 | read (expect /Added to cart/) | 0 + 0 | 0 + 78 | n/a (0 + 0) |

### `local-longlist-find` — Find "Item 150" in a 200-link list and open it (local fixture)

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open <local>/longlist | 60 + 0 | 55 + 0 | 0 + 1,366 |
| 2 | click link /^Item 150$/ | FAIL (0 + 47) | 58 + 5,636 | 0 + 1,366 |
| 3 | read (expect /Detail for item 150/) | FAIL (0 + 94) | 0 + 64 | n/a (0 + 0) |

### `local-longlist-filter` — Use the filter box to reach "Item 150" and open it (local fixture)

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open <local>/longlist | 51 + 0 | 55 + 0 | 0 + 1,366 |
| 2 | type "Item 150" into textbox /filter/i | 32 + 0 | 26 + 5,636 | 0 + 1,366 |
| 3 | click link /^Item 150$/ | 48 + 39 | 57 + 0 | 0 + 1,366 |
| 4 | read (expect /Detail for item 150/) | 0 + 0 | 0 + 64 | n/a (0 + 0) |

### `local-form-select` — Pick a country, tick a checkbox, submit (local fixture)

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open <local>/form | 70 + 0 | 55 + 0 | 0 + 1,366 |
| 2 | select "Canada" in combobox /country/i | 24 + 0 | 57 + 140 | 0 + 1,366 |
| 3 | click checkbox /newsletter/i | 28 + 0 | 64 + 0 | 0 + 1,366 |
| 4 | click button /subscribe/i | 13 + 0 | 59 + 145 | 0 + 1,366 |
| 5 | read (expect /Subscribed from Canada \(weekly: yes\)/) | FAIL (0 + 72) | 0 + 157 | n/a (0 + 0) |

### `local-nav-back` — Navigate Home → Pricing, read, go back (local fixture)

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open <local>/site/home | 65 + 0 | 60 + 0 | 0 + 1,366 |
| 2 | click link /^pricing$/i | 84 + 0 | 66 + 183 | 0 + 1,366 |
| 3 | read (expect /\$29 per month/) | FAIL (0 + 55) | 0 + 203 | n/a (0 + 0) |
| 4 | back | 88 + 0 | 52 + 0 | 0 + 1,366 |
| 5 | read (expect /Welcome to Example Corp/) | 0 + 0 | 0 + 189 | n/a (0 + 0) |

### `local-dashboard` — Large dashboard (60-row table): click Refresh and confirm (local fixture)

| # | Step | Mantis | Playwright MCP | Screenshot (est.) |
|---:|---|---:|---:|---:|
| 1 | open <local>/dashboard | 1,211 + 0 | 60 + 0 | 0 + 1,366 |
| 2 | click button /^refresh$/i | 20 + 0 | 62 + 4,546 | 0 + 1,366 |
| 3 | read (expect /Last updated: just now/) | 0 + 0 | 0 + 4,547 | n/a (0 + 0) |

## Caveats

- Token-size of tool output only. Smaller output is cheaper, not necessarily better: a tool can fail a task by omitting what is needed (see Failures), and this benchmark does not measure whether an LLM would succeed with any of these outputs.
- Mantis numbers are for the commit above. Mantis output and defaults change between commits; re-run `npm run bench` to refresh.
- The screenshot figure is a lower bound on a real screenshot-driven agent and relies on a published estimate formula, not a measured bill.
- Live sites (example.com, Hacker News, Wikipedia, GitHub, MDN) change content and layout over time and may serve different variants by region, language or bot detection; one run each.
- The harness picks the first element whose role and name match; a different (or smarter) agent might pick differently.
