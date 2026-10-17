# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 3; 6 runs in parallel.
- Scope: 3 tasks × 3 approaches × 3 runs = 27 logical runs; 27 recorded so far; 27 total attempts including retries.
- Codex CLI version: codex-cli 0.163.0-alpha.10.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 9 / 9 | 9 / 9 | 9 / 9 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 168 | 134 | 277 |
| MCP tool errors (including retries) | 7 | 13 | 5 |
| Browser observation text (observed chars) | 408,778 | 796,878 | 10,488,781 |
| Browser observation images (observed blocks) | 0 | 0 | 93 |
| Normal input tokens (total) | 355,782 | 473,019 | 446,422 |
| Cache-write input tokens (total) | 0 | 0 | 0 |
| Cache-read input tokens (total) | 3,741,312 | 3,694,720 | 4,017,280 |
| Output tokens (total) | 13,384 | 8,332 | 21,129 |
| Total input tokens incl. cache (legacy) | 4,097,094 | 4,167,739 | 4,463,702 |
| MCP startup (total, s) | 18.4 | 18.5 | 18.6 |
| CLI startup (total, s) | 12.4 | 9.5 | 8.9 |
| CLI execution (total, s) | 638.4 | 472.3 | 729.3 |
| CLI wall (total, s) | 650.7 | 481.8 | 738.1 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 5.3 | 3.3 | 3.3 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 1 | success | 1 | 8 | 0 | 18,652 | 0 | 37,781 | 0 | 116,096 | 721 | 2.1 | 2.0 | 47.0 | 49.0 | 0.00 | 0.43 | SmartAsset estimates **$30,887 in federal income tax** for $158,500 of taxable income, filing single. I entered $174,250 as household income so the calculator’s |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 11 | 0 | 141,237 | 0 | 52,110 | 0 | 321,792 | 685 | 2.1 | 2.0 | 52.2 | 54.2 | 0.00 | 0.30 | SmartAsset estimates **$27,107 in federal income tax** for 2025, using single filing status and no credits or other adjustments. That’s the federal income tax a |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 1 | success | 1 | 15 | 1 | 235 | 4 | 28,164 | 0 | 220,288 | 1,390 | 2.1 | 2.0 | 58.1 | 60.1 | 0.00 | 0.43 | SmartAsset estimated **$27,107 in federal tax** for the 2025 estimate, with $158,500 entered, ZIP 97007, and filing status Single. That is the calculator’s disp |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 2 | success | 1 | 10 | 0 | 42,208 | 0 | 21,063 | 0 | 216,320 | 886 | 2.1 | 1.9 | 53.5 | 55.4 | 0.00 | 0.25 | SmartAsset estimates **$30,887 in federal income tax** on $158,500 of taxable income for a single filer. I entered $174,250 as household income so the calculato |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 29 | 6 | 141,302 | 0 | 76,602 | 0 | 1,055,744 | 1,470 | 2.2 | 1.9 | 86.9 | 88.8 | 0.00 | 0.32 | SmartAsset estimates **$27,107 in federal income tax** for 2025. This is the Federal Tax line; it excludes FICA and state taxes. The calculator used single fili |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 2 | success | 1 | 44 | 1 | 579 | 13 | 55,222 | 0 | 340,480 | 3,118 | 2.3 | 1.7 | 90.7 | 92.4 | 0.00 | 0.27 | SmartAsset’s 2025 calculator estimated **$30,887 in federal income tax** for single filing on **$158,500 of taxable income**. I entered $174,250 as household in |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 3 | success | 1 | 13 | 0 | 31,598 | 0 | 33,825 | 0 | 241,920 | 1,246 | 2.0 | 1.1 | 44.9 | 45.9 | 0.00 | 0.33 | SmartAsset estimated **$27,748 in federal income tax** for a single filer with $158,500 household income in Beaverton, OR (ZIP 97007), using a $0 itemized deduc |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 10 | 0 | 42,127 | 0 | 26,079 | 0 | 185,472 | 542 | 2.0 | 0.7 | 30.1 | 30.8 | 0.00 | 0.48 | SmartAsset estimates **$27,107 in federal income tax** for 2025 on $158,500 of income, filing single. The calculator also shows $12,125 in FICA; that is separat |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 3 | success | 1 | 26 | 1 | 386 | 7 | 45,642 | 0 | 288,384 | 2,196 | 2.0 | 0.4 | 54.6 | 55.0 | 0.00 | 0.37 | I used SmartAsset’s 2025 Federal Income Tax Calculator with single filing status and Beaverton, OR for ZIP code 97007. The page didn’t display a calculated resu |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 42 | 3 | 128,296 | 0 | 66,445 | 0 | 1,332,864 | 4,618 | 2.0 | 0.7 | 170.8 | 171.4 | 0.00 | 0.40 | Added the lowest priced result, the Women’s Solid Leaderback Swimsuit in black, for **$37**. It matched the Large size filter, though the product page and cart  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 18 | 1 | 143,240 | 0 | 85,998 | 0 | 557,056 | 1,232 | 2.0 | 0.6 | 67.0 | 67.7 | 0.00 | 0.36 | I couldn’t complete the request. The women’s swimwear collection loaded without product listings or usable filter controls, so I couldn’t reliably identify the  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 55 | 0 | 4,194,681 | 20 | 73,613 | 0 | 1,175,040 | 4,120 | 2.0 | 0.6 | 164.4 | 165.0 | 0.00 | 0.29 | Added one Women’s Solid Leaderback Swimsuit in Black, size 40 (the size shown for Large), to your cart for $37. I stopped on the cart page without checking out  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 2 | success | 1 | 14 | 1 | 49,925 | 0 | 23,813 | 0 | 275,456 | 830 | 2.0 | 0.5 | 55.0 | 55.5 | 0.00 | 0.62 | Added the **Women’s Muscleback One Piece Swimsuit in Black**, size **40**, for **$55.00** to your cart. The women’s swimsuit catalog showed it as the lowest pri |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 4 | 2 | 42,293 | 0 | 41,918 | 0 | 128,768 | 563 | 2.0 | 0.5 | 35.2 | 35.7 | 0.00 | 0.42 | I couldn’t complete the cart update. The store’s privacy overlay blocked browser interactions, and the catalog/cart tools described on the page weren’t availabl |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 2 | success | 1 | 28 | 0 | 1,048,837 | 11 | 63,641 | 0 | 468,480 | 2,125 | 2.0 | 0.7 | 75.2 | 75.9 | 0.00 | 0.36 | Added the Women’s Shaping Strappy One Piece Black in size 38/14 (Large) to your cart for $39.20. I stopped at the cart and did not log in or proceed to checkout |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 3 | success | 1 | 31 | 2 | 65,802 | 0 | 33,442 | 0 | 730,880 | 1,700 | 2.0 | 3.8 | 108.4 | 112.1 | 0.00 | 1.83 | Added the black Women’s Muscleback One Piece swimsuit to your cart in Speedo size 40, which the size guide maps to US 12 (Large). It’s $55, the lowest price amo |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 4 | 1 | 21,029 | 0 | 40,042 | 0 | 62,464 | 442 | 2.0 | 1.5 | 29.0 | 30.5 | 0.00 | 0.36 | I couldn’t add the swimsuit: the site’s overlay blocked the available browser interaction, and the attempted collection URL returned to the homepage. I did not  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 3 | success | 1 | 33 | 0 | 5,242,978 | 9 | 81,645 | 0 | 546,688 | 2,373 | 2.0 | 1.1 | 100.0 | 101.1 | 0.00 | 0.35 | I couldn’t complete the cart action. I searched Speedo and filtered the results by size Large, but the page showed 524 products and I wasn’t able to confirm the |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 13 | 1 | 15,821 | 0 | 45,184 | 0 | 194,688 | 976 | 2.0 | 1.0 | 40.8 | 41.8 | 0.00 | 0.59 | I found **Global Gas Station**, 89 St Nicholas Pl, New York, NY 10032, rated **4.3 stars** with 103 reviews. When I selected “Sort reviews,” Google Maps display |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 17 | 1 | 49,746 | 0 | 32,723 | 0 | 339,712 | 1,087 | 2.0 | 0.7 | 43.5 | 44.1 | 0.00 | 0.26 | I searched Google Maps for gas stations in Manhattan, NY. The results I could inspect showed ratings at or below 4.0, so I couldn’t confirm a station that meets |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 1 | success | 1 | 23 | 1 | 332 | 9 | 27,831 | 0 | 290,688 | 1,712 | 2.0 | 1.2 | 59.1 | 60.2 | 0.00 | 0.39 | I found Global Gas Station at 89 St Nicholas Pl, Manhattan, NY, rated 4.3. Google Maps prompted me to sign in when I tried to open the review sort options, so I |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 2 | success | 1 | 15 | 0 | 21,005 | 0 | 42,201 | 0 | 240,128 | 1,079 | 2.0 | 0.7 | 50.7 | 51.4 | 0.00 | 0.65 | I found Global Gas Station at 89 St Nicholas Pl, Manhattan, rated 4.3 stars with 103 reviews. Google Maps displayed a sign-in prompt when I tried to open the re |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 11 | 0 | 121,526 | 0 | 48,355 | 0 | 257,024 | 869 | 2.0 | 0.8 | 35.1 | 35.9 | 0.00 | 0.49 | Found Global Gas Station at 89 St Nicholas Pl, Manhattan, rated 4.3 (103 reviews). Google Maps prompted for sign-in when I tried to sort the reviews, so I dismi |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 2 | success | 1 | 32 | 1 | 467 | 12 | 33,448 | 0 | 379,904 | 2,312 | 2.0 | 0.6 | 68.0 | 68.6 | 0.00 | 0.46 | Global Gas Station at 89 St Nicholas Pl, Manhattan, is rated 4.3 (103 reviews). Google Maps showed a sign-in prompt when I tried to sort the reviews, so I dismi |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 3 | success | 1 | 22 | 0 | 35,471 | 0 | 52,028 | 0 | 392,960 | 1,328 | 2.0 | 0.8 | 67.3 | 68.2 | 0.00 | 0.25 | I found **Global Gas Station**, 89 St Nicholas Pl, New York, NY 10032, rated **4.3 stars** with 103 reviews. Google Maps showed a sign-in prompt when I selected |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 30 | 2 | 94,378 | 0 | 69,192 | 0 | 786,688 | 1,442 | 2.0 | 0.7 | 93.4 | 94.1 | 0.00 | 0.31 | I found bp at 255 E 125th St, Manhattan, rated 4.0 with 438 reviews. I opened its “Sort reviews” control, but Google Maps then showed a sign-in prompt. I did no |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 3 | success | 1 | 21 | 0 | 286 | 8 | 37,216 | 0 | 307,328 | 1,783 | 2.0 | 0.6 | 59.2 | 59.8 | 0.00 | 0.34 | Global Gas Station, 89 St Nicholas Pl, Manhattan, is rated 4.3 (103 reviews). I opened its Reviews tab; selecting Sort prompted a Google sign-in screen, so I di |
