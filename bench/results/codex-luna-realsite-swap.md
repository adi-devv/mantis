# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 1; 6 runs in parallel.
- Scope: 5 tasks × 3 approaches × 1 runs = 15 logical runs; 15 recorded so far; 15 total attempts including retries.
- Codex CLI version: codex-cli 0.162.0-alpha.17.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 5 / 5 | 5 / 5 | 5 / 5 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 41 | 53 | 98 |
| MCP tool errors (including retries) | 1 | 2 | 1 |
| Browser observation text (observed chars) | 184,726 | 608,820 | 1,049,954 |
| Browser observation images (observed blocks) | 0 | 0 | 34 |
| Normal input tokens (total) | 116,635 | 179,063 | 169,410 |
| Cache-write input tokens (total) | 0 | 0 | 0 |
| Cache-read input tokens (total) | 832,768 | 1,344,000 | 1,574,528 |
| Output tokens (total) | 4,048 | 3,817 | 8,725 |
| Total input tokens incl. cache (legacy) | 949,403 | 1,523,063 | 1,743,938 |
| MCP startup (total, s) | 10.3 | 10.3 | 10.3 |
| CLI startup (total, s) | 4.1 | 3.9 | 4.1 |
| CLI execution (total, s) | 285.8 | 202.2 | 454.2 |
| CLI wall (total, s) | 289.8 | 206.2 | 458.2 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 1.8 | 2.0 | 1.8 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `bf3b311cc8dce16d3de844f4b5875dfd` | Mantis | 1 | success | 1 | 8 | 1 | 89,905 | 0 | 31,324 | 0 | 175,616 | 1,075 | 2.1 | 1.1 | 50.3 | 51.5 | 0.00 | 0.40 | Apple’s current India lineup on its site is **Series 12, Ultra 4, and SE 3**. The comparison page shows: - **Series 12:** the balanced everyday option, with 42 |
| `bf3b311cc8dce16d3de844f4b5875dfd` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 10 | 0 | 133,273 | 0 | 37,731 | 0 | 204,288 | 885 | 2.1 | 1.1 | 41.3 | 42.4 | 0.00 | 0.67 | Apple’s current lineup on its site is **Series 12, Ultra 4, and SE 3**. Here’s the quick comparison: \| Model \| Best fit \| Apple’s listed highlights \| \|---\|---\| |
| `bf3b311cc8dce16d3de844f4b5875dfd` | Screenshots (click by x,y) | 1 | success | 1 | 18 | 0 | 199 | 9 | 18,783 | 0 | 306,048 | 1,726 | 2.1 | 1.1 | 119.9 | 121.0 | 0.00 | 0.37 | Apple’s comparison page lists Series 12, Ultra 4, and SE 3. Series 12 has a 42 mm or 46 mm case and a display rated up to 2000 nits; SE 3 has a 40 mm or 44 mm c |
| `4f903626f632586fe4728d6664947bab` | Mantis | 1 | success | 1 | 12 | 0 | 28,285 | 0 | 29,643 | 0 | 220,928 | 1,073 | 2.1 | 1.1 | 77.7 | 78.8 | 0.00 | 0.33 | The Justice.gov Press Releases page lists filters for division and year. I found “Antitrust Division” as a component, but the site returned “Access Denied” when |
| `4f903626f632586fe4728d6664947bab` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 11 | 0 | 110,670 | 0 | 24,905 | 0 | 256,256 | 565 | 2.1 | 1.1 | 60.3 | 61.4 | 0.00 | 0.34 | I opened Justice.gov’s Press Releases archive and selected the Antitrust Division filter. The site returned an Access Denied (403) page before I could apply the |
| `4f903626f632586fe4728d6664947bab` | Screenshots (click by x,y) | 1 | success | 1 | 25 | 0 | 371 | 9 | 28,539 | 0 | 409,216 | 2,329 | 2.1 | 1.0 | 84.1 | 85.2 | 0.00 | 0.33 | I opened the Antitrust Division’s Press Releases archive. I wasn’t able to apply the 2022 date filter because the date fields rejected the entered dates. |
| `a69d2934fe54fef165490a5a2d95bf38_070826` | Mantis | 1 | success | 1 | 5 | 0 | 12,999 | 0 | 13,976 | 0 | 97,152 | 716 | 2.0 | 1.0 | 47.8 | 48.8 | 0.00 | 0.29 | I searched Cookpad Japan for **小麦粉なし パンケーキ** (“pancakes without wheat flour”). The results included rice flour, okara, oat, and fruit based recipes. One recipe |
| `a69d2934fe54fef165490a5a2d95bf38_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 72,696 | 0 | 30,814 | 0 | 108,544 | 630 | 2.0 | 0.7 | 20.3 | 20.9 | 0.00 | 0.35 | I searched Cookpad Japan for **パンケーキ 小麦粉なし** (“pancakes without wheat flour”). The results included: - [小麦粉不使用☆バナナとさつまいものパンケーキ](https://cookpad.com/jp/recipes/ |
| `a69d2934fe54fef165490a5a2d95bf38_070826` | Screenshots (click by x,y) | 1 | success | 1 | 9 | 0 | 245 | 3 | 27,723 | 0 | 118,656 | 993 | 2.0 | 0.7 | 47.4 | 48.1 | 0.00 | 0.43 | Cookpad Japan returned a search for **「パンケーキ 小麦粉なし」** (pancakes without flour), with **8,514 recipes**. The first visible result was **「小麦粉不使用☆バナナとさつまいものパンケーキ」* |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 1 | success | 1 | 11 | 0 | 46,192 | 0 | 21,647 | 0 | 260,352 | 838 | 2.0 | 0.5 | 70.9 | 71.4 | 0.00 | 0.38 | SmartAsset estimates **$41,149 in federal income tax** on $158,500 of taxable income for a single filer (2025 estimate). The calculator showed a 24% marginal ra |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 18 | 2 | 210,213 | 0 | 50,779 | 0 | 597,120 | 1,221 | 2.0 | 0.5 | 43.7 | 44.1 | 0.00 | 0.33 | SmartAsset’s calculator did not return a result, and the ZIP code was not accepted as a location. For 2025, using the calculator’s single filer status and treat |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 1 | success | 1 | 36 | 1 | 486 | 10 | 81,465 | 0 | 585,472 | 2,691 | 2.0 | 0.5 | 147.0 | 147.5 | 0.00 | 0.38 | SmartAsset estimates **$30,887 in 2025 federal income tax** for $158,500 of taxable income, filing single. I entered $174,250 of household income so that, after |
| `60cbbbd58eb9d28b053aef945f464228` | Mantis | 1 | success | 1 | 5 | 0 | 7,345 | 0 | 20,045 | 0 | 78,720 | 346 | 2.0 | 0.4 | 39.0 | 39.4 | 0.00 | 0.37 | BBB Scam Tracker returned **0 results** for `555555555` (“No result found”). That doesn’t establish whether the number is a scam; BBB has no matching report in  |
| `60cbbbd58eb9d28b053aef945f464228` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 9 | 0 | 81,968 | 0 | 34,834 | 0 | 177,792 | 516 | 2.0 | 0.6 | 36.6 | 37.3 | 0.00 | 0.29 | BBB Scam Tracker returned **0 results** for `555555555`. That means I found no matching report in BBB’s lookup; it does not establish whether the number is safe |
| `60cbbbd58eb9d28b053aef945f464228` | Screenshots (click by x,y) | 1 | success | 1 | 10 | 0 | 1,048,653 | 3 | 12,900 | 0 | 155,136 | 986 | 2.0 | 0.7 | 55.8 | 56.5 | 0.00 | 0.30 | BBB Scam Tracker returned **0 results** for `555555555`. The site treated it as a Scam ID search, so this doesn’t establish whether the number is a scam. |
