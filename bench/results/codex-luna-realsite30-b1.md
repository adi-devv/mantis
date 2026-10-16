# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 1; 6 runs in parallel.
- Scope: 8 tasks × 3 approaches × 1 runs = 24 logical runs; 24 recorded so far; 24 total attempts including retries.
- Codex CLI version: codex-cli 0.162.0-alpha.17.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 8 / 8 | 8 / 8 | 8 / 8 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 86 | 131 | 162 |
| MCP tool errors (including retries) | 7 | 9 | 3 |
| Browser observation text (observed chars) | 182,789 | 1,041,570 | 9,439,694 |
| Browser observation images (observed blocks) | 0 | 0 | 49 |
| Normal input tokens (total) | 162,139 | 398,172 | 186,132 |
| Cache-write input tokens (total) | 0 | 0 | 0 |
| Cache-read input tokens (total) | 1,587,072 | 5,211,008 | 2,182,016 |
| Output tokens (total) | 7,863 | 7,717 | 13,945 |
| Total input tokens incl. cache (legacy) | 1,749,211 | 5,609,180 | 2,368,148 |
| MCP startup (total, s) | 16.6 | 16.4 | 16.7 |
| CLI startup (total, s) | 4.8 | 4.5 | 5.1 |
| CLI execution (total, s) | 584.2 | 498.4 | 614.8 |
| CLI wall (total, s) | 588.9 | 502.8 | 619.9 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 3.8 | 3.4 | 2.9 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `ec78d3a635e417bc2a80d03ca93d7165` | Mantis | 1 | success | 1 | 12 | 0 | 50,580 | 0 | 22,492 | 0 | 247,552 | 1,775 | 2.1 | 0.8 | 101.7 | 102.6 | 0.00 | 0.72 | For a single person over State Pension age in England, the main support to check is: - **State Pension:** If they have enough qualifying National Insurance yea |
| `ec78d3a635e417bc2a80d03ca93d7165` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 28 | 0 | 250,303 | 0 | 83,887 | 0 | 1,300,480 | 1,820 | 2.1 | 0.8 | 61.1 | 61.9 | 0.00 | 0.33 | I reviewed GOV.UK’s benefits, Pension Credit, carer, housing, and winter support guidance. For a **single person living in England who has reached State Pension |
| `ec78d3a635e417bc2a80d03ca93d7165` | Screenshots (click by x,y) | 1 | success | 1 | 13 | 0 | 275 | 5 | 13,621 | 0 | 141,312 | 1,681 | 2.1 | 0.8 | 43.0 | 43.8 | 0.00 | 0.34 | For a single person in England who is over State Pension age and unemployed, **not having a job does not by itself qualify them for a benefit**. These are the m |
| `6b5be1764692d1dc8f17dc4375b2daa8` | Mantis | 1 | success | 1 | 3 | 0 | 8,516 | 0 | 16,093 | 0 | 55,296 | 341 | 2.1 | 0.7 | 40.5 | 41.2 | 0.00 | 0.38 | Opened Yahoo Finance’s EUR/USD historical data page. It shows daily historical prices for EUR/USD (EURUSD=X), including date, open, high, low, close, adjusted c |
| `6b5be1764692d1dc8f17dc4375b2daa8` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 122,478 | 0 | 23,701 | 0 | 96,768 | 362 | 2.1 | 0.7 | 33.9 | 34.6 | 0.00 | 0.50 | Opened Yahoo Finance’s EUR/USD historical data page. The page title is “EUR/USD (EURUSD=X) Stock Historical Prices & Data - Yahoo Finance.” No login or personal |
| `6b5be1764692d1dc8f17dc4375b2daa8` | Screenshots (click by x,y) | 1 | success | 1 | 9 | 0 | 115 | 4 | 28,538 | 0 | 119,168 | 775 | 2.1 | 0.7 | 58.8 | 59.5 | 0.00 | 0.42 | Yahoo Finance is showing **EUR/USD (EURUSD=X)** on its Historical Data page, with daily historical prices for the displayed date range. |
| `bd1e3770b7181f6fce9c35e18caa9785` | Mantis | 1 | success | 1 | 8 | 1 | 11,372 | 0 | 19,797 | 0 | 129,792 | 886 | 2.0 | 0.5 | 37.8 | 38.4 | 0.00 | 0.63 | I searched Craigslist Delhi services for “solar panel installer” and enabled **hide duplicates**. The filtered results show two postings: one for a commercial s |
| `bd1e3770b7181f6fce9c35e18caa9785` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 9 | 0 | 81,590 | 0 | 24,397 | 0 | 218,240 | 651 | 2.0 | 0.5 | 41.0 | 41.5 | 0.00 | 0.35 | I searched Delhi Craigslist services for “solar panel” and enabled **hide duplicates**. The listing “Top Commercial 10 kW Solar Installation Melbourne - Easysol |
| `bd1e3770b7181f6fce9c35e18caa9785` | Screenshots (click by x,y) | 1 | success | 1 | 29 | 1 | 477 | 9 | 20,474 | 0 | 242,560 | 2,594 | 2.0 | 0.4 | 58.7 | 59.1 | 0.00 | 0.32 | I searched Delhi Craigslist services for “solar” and enabled “hide duplicates.” The search shows 12 matches, with listings including solar installation services |
| `5c00e9561eae94789443f405525a5869` | Mantis | 1 | success | 1 | 4 | 0 | 16,313 | 0 | 16,703 | 0 | 72,960 | 319 | 2.2 | 0.4 | 39.1 | 39.5 | 0.00 | 0.50 | Healthline lists the usual Vivitrol dosage as **380 mg by intramuscular injection every 4 weeks**. A healthcare professional administers it. Follow your prescri |
| `5c00e9561eae94789443f405525a5869` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 10,539 | 0 | 20,432 | 0 | 78,080 | 401 | 2.0 | 0.5 | 41.9 | 42.3 | 0.00 | 0.34 | Healthline says the recommended Vivitrol dosage is one 380 mg injection about once per month, administered by a healthcare professional. A doctor determines the |
| `5c00e9561eae94789443f405525a5869` | Screenshots (click by x,y) | 1 | success | 1 | 12 | 0 | 171 | 5 | 25,187 | 0 | 148,992 | 868 | 2.0 | 0.8 | 39.3 | 40.0 | 0.00 | 0.41 | Healthline says Vivitrol’s usual recommended dosage is one 380 mg injection about once per month, given by a healthcare professional. It comes in a single-dose  |
| `eb323dc584156d0eb3a2b90bb8c4b791_110325` | Mantis | 1 | success | 1 | 16 | 0 | 29,088 | 0 | 20,626 | 0 | 286,336 | 827 | 2.0 | 0.6 | 67.8 | 68.4 | 0.00 | 0.44 | The cheapest qualifying listing I found is **188-20 50th Avenue, Unit 1FL BASEMENT, Auburndale, Queens**: **$4,800/month**, 3 bedrooms, 3 bathrooms, 1,352 sq ft |
| `eb323dc584156d0eb3a2b90bb8c4b791_110325` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 61 | 8 | 400,408 | 0 | 146,058 | 0 | 3,083,776 | 2,811 | 2.0 | 0.8 | 177.9 | 178.7 | 0.00 | 0.36 | I couldn’t reliably identify the cheapest qualifying listing. Compass showed rentals across New York State, and its result pages did not provide a usable filter |
| `eb323dc584156d0eb3a2b90bb8c4b791_110325` | Screenshots (click by x,y) | 1 | success | 1 | 27 | 0 | 5,242,959 | 5 | 18,443 | 0 | 441,984 | 2,143 | 2.4 | 0.6 | 168.2 | 168.8 | 0.00 | 0.38 | The lowest priced matching listing I found is **$13,500/month**: 720 West End Avenue, Unit 7H, Upper West Side — 2 beds and 3 baths. The results were sorted by  |
| `c03ee2be3d73556ab789c0ad1cbd3451` | Mantis | 1 | success | 1 | 3 | 0 | 6,163 | 0 | 8,995 | 0 | 62,720 | 254 | 2.0 | 0.6 | 19.3 | 19.9 | 0.00 | 0.48 | The AKC homepage’s “Find a Dog Groomer” link led to a **403 Forbidden** page, so I couldn’t search listings or check a groomer’s detailed nail trimming prices. |
| `c03ee2be3d73556ab789c0ad1cbd3451` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 3 | 0 | 39,725 | 0 | 17,806 | 0 | 60,160 | 247 | 2.0 | 0.4 | 16.9 | 17.3 | 0.00 | 0.56 | AKC’s “Find a Dog Groomer” link led to https://marketplace.akc.org/search-groomers, but the page returned **403 Forbidden**. I couldn’t view listings or check t |
| `c03ee2be3d73556ab789c0ad1cbd3451` | Screenshots (click by x,y) | 1 | success | 1 | 21 | 1 | 841 | 7 | 19,759 | 0 | 328,832 | 1,903 | 2.0 | 0.5 | 116.1 | 116.6 | 0.00 | 0.36 | I searched AKC for “groomer nail trimming,” but the results were articles rather than local groomer listings. The AKC Marketplace page returned a 403 Forbidden  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 25 | 5 | 40,761 | 0 | 27,982 | 0 | 497,664 | 2,160 | 2.0 | 0.5 | 214.6 | 215.2 | 0.00 | 0.31 | I found the black Women’s Shaping Strappy One Piece at $39.20, the lowest price I saw. I couldn’t add it because the size options were blocked by an overlay, an |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 8 | 1 | 70,252 | 0 | 51,865 | 0 | 175,488 | 697 | 2.0 | 0.3 | 93.6 | 93.9 | 0.00 | 0.48 | I couldn’t complete the add. The Speedo page’s search and catalog controls were blocked by an overlay, and I couldn’t verify which black swimsuit in size Large  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 28 | 0 | 3,145,902 | 8 | 33,893 | 0 | 443,136 | 1,985 | 2.0 | 0.5 | 69.8 | 70.3 | 0.00 | 0.42 | I couldn’t complete the cart addition. I filtered the search results by price and selected size Large, but couldn’t confirm the lowest-priced black swimsuit in  |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 15 | 1 | 19,996 | 0 | 29,451 | 0 | 234,752 | 1,301 | 2.0 | 0.6 | 63.2 | 63.8 | 0.00 | 0.33 | I opened Google Maps and searched for gas stations in Manhattan, NY. The listings shown did not expose their ratings or review sorting controls in the page text |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 11 | 0 | 66,275 | 0 | 30,026 | 0 | 198,016 | 728 | 2.0 | 0.4 | 32.1 | 32.5 | 0.00 | 0.46 | I couldn’t find a qualifying station in the Manhattan results: the listed stations were rated 4.0 or lower. The only result above 4.0 was Fuel 4 (4.1), at 596 G |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 1 | success | 1 | 23 | 1 | 1,048,954 | 6 | 26,217 | 0 | 316,032 | 1,996 | 2.0 | 0.9 | 61.0 | 61.9 | 0.00 | 0.28 | I searched Google Maps for gas stations in Manhattan, NY. The visible Manhattan results were rated 2.8–3.7, so I couldn’t confirm a station above 4.0 or sort it |
