# Real-agent eval

> Claude Code (`claude -p`) (requested model `claude-haiku-5-5`) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Claude stream; reported cost is retained; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 3; 6 runs in parallel.
- Scope: 3 tasks × 3 approaches × 3 runs = 27 logical runs; 27 recorded so far; 27 total attempts including retries.
- Claude CLI version: 2.1.301 (Claude Code); resolved model(s): claude-haiku-5-5.
- MCP startup (spawn + warm-up) is separate from Claude CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first init event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Claude-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. 
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 9 / 9 | 9 / 9 | 9 / 9 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 376 | 378 | 662 |
| MCP tool errors (including retries) | 61 | 37 | 3 |
| Browser observation text (observed chars) | 498,160 | 1,135,852 | 53,349 |
| Browser observation images (observed blocks) | 6 | 11 | 278 |
| Normal input tokens (total) | 606 | 598 | 566 |
| Cache-write input tokens (total) | 315,775 | 585,211 | 521,658 |
| Cache-read input tokens (total) | 7,890,415 | 15,758,554 | 11,044,096 |
| Output tokens (total) | 56,114 | 69,004 | 85,549 |
| Total input tokens incl. cache (legacy) | 8,206,796 | 16,344,363 | 11,566,320 |
| MCP startup (total, s) | 18.5 | 18.6 | 18.6 |
| CLI startup (total, s) | 36.6 | 37.3 | 45.1 |
| CLI execution (total, s) | 1316.2 | 1837.5 | 1251.6 |
| CLI wall (total, s) | 1352.8 | 1874.8 | 1296.8 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.2 | 0.3 | 0.1 |
| Cost estimate (USD; including retries) | 0.17 | 0.64 | 0.39 |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 50 | 10 | 120,425 | 0 | 86 | 70,302 | 1,543,247 | 9,662 | 2.1 | 6.4 | 311.8 | 318.2 | 0.00 | 0.05 | I did not add anything to the cart. I stopped because I couldn't confirm which product is a size Large. **What I found:** - The site's search has a "Size: L" f |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 34 | 4 | 118,990 | 0 | 56 | 65,322 | 1,129,614 | 6,551 | 2.1 | 6.9 | 312.1 | 319.0 | 0.00 | 0.03 | I added the Women's Solid V-Neck One Piece in Black, size L, to your cart for $58.00. The cart has one line and a $58.00 subtotal. I stopped there and did not s |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 115 | 0 | 9,972 | 54 | 110 | 102,156 | 2,828,177 | 18,473 | 2.1 | 6.6 | 310.0 | 316.6 | 0.00 | 0.00 | I stopped before adding anything to the cart, because the site doesn't have a clear "Large" size for the item I found. **What I found** - I rejected non-essent |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 2 | success | 1 | 61 | 5 | 104,979 | 1 | 106 | 64,245 | 1,970,399 | 10,118 | 2.2 | 6.1 | 296.9 | 303.0 | 0.00 | 0.01 | I added the Women's Solid Leaderback Swimsuit Black to your cart at $37.00 (sale price, regular $74.00). I stopped at the cart and did not check out, log in, or |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 77 | 5 | 271,076 | 0 | 142 | 142,987 | 6,418,109 | 21,036 | 2.2 | 6.9 | 546.3 | 553.2 | 0.00 | 0.20 | I added the Women's Solid V-Neck One Piece Black, size L, $58.00, to your cart (1 item). I stopped before checkout and didn't log in or enter any personal infor |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 2 | success | 1 | 146 | 1 | 13,837 | 69 | 132 | 126,308 | 4,135,691 | 17,889 | 2.2 | 7.0 | 325.0 | 331.9 | 0.00 | 0.01 | I added Speedo's Women's Solid Leaderback Swimsuit Black, size 40, to the cart at $37.00 (sale price, down from $74.00). I stopped before checkout and didn't lo |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 3 | success | 1 | 40 | 3 | 88,368 | 0 | 74 | 51,635 | 1,146,380 | 7,223 | 2.1 | 3.2 | 205.9 | 209.1 | 0.00 | 0.00 | I added the **Women's Solid Leaderback Swimsuit Black** (Team Black, size 40) to your cart. It's the lowest-priced match at **$37.00** (regular $74.00, 50% off) |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 41 | 12 | 216,197 | 0 | 76 | 104,931 | 2,860,480 | 7,950 | 2.0 | 4.5 | 225.5 | 230.0 | 0.00 | 0.04 | I added the Women's Shaping Strappy One Piece in Black, size 38/14, to your cart, and stopped there. Nothing was logged in, purchased, or entered. - **Item:**  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 3 | success | 1 | 72 | 0 | 6,477 | 37 | 76 | 67,787 | 1,352,002 | 10,773 | 2.0 | 6.3 | 163.8 | 170.2 | 0.00 | 0.00 | I added the swimsuit to your cart and stopped before checkout. I did not log in or enter any personal information. - **Product:** Women's Shaping Strappy One P |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 1 | success | 1 | 18 | 8 | 33,328 | 0 | 32 | 19,977 | 268,101 | 3,535 | 2.0 | 5.2 | 55.3 | 60.5 | 0.00 | 0.00 | I could not get the SmartAsset calculator to produce a result, so this estimate comes from the bracket tables on the same page. **Estimate: about $30,900 in fe |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 50 | 6 | 172,169 | 2 | 80 | 81,349 | 1,979,046 | 7,896 | 2.0 | 2.5 | 146.2 | 148.7 | 0.00 | 0.01 | I could not get SmartAsset's calculator to produce a result, so this estimate is calculated by hand, not read from the site. **Estimated federal income tax: ab |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 1 | success | 1 | 67 | 1 | 5,131 | 27 | 56 | 51,837 | 772,906 | 9,287 | 2.0 | 3.8 | 107.3 | 111.1 | 0.00 | 0.07 | I could not get an estimate from SmartAsset's calculator. The results panel stayed at "$--" after I entered the inputs, and the calculate button kept spinning w |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 2 | success | 1 | 17 | 2 | 23,256 | 0 | 30 | 12,236 | 192,508 | 2,082 | 2.0 | 2.7 | 69.3 | 72.0 | 0.00 | 0.07 | I couldn't get the SmartAsset calculator to run, so I can't report its answer. The income tax calculator at https://smartasset.com/taxes/income-taxes shows "App |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 30 | 2 | 68,792 | 0 | 52 | 33,046 | 699,305 | 3,371 | 2.0 | 2.9 | 103.7 | 106.6 | 0.00 | 0.01 | I could not get an estimate from SmartAsset. Every federal and Oregon calculator page I tried shows "Application error: a client-side exception has occurred," i |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 2 | success | 1 | 114 | 1 | 5,359 | 25 | 52 | 52,250 | 713,177 | 11,688 | 2.1 | 3.1 | 126.2 | 129.2 | 0.00 | 0.00 | I could not get an estimate from SmartAsset's calculator. The page crashed when I typed into the income field, and after I re-entered the values it stayed on "$ |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 3 | success | 1 | 12 | 5 | 17,392 | 0 | 24 | 10,705 | 135,965 | 2,892 | 2.0 | 1.9 | 50.8 | 52.7 | 0.00 | 0.01 | I couldn't get the calculator to return a result: after I entered the inputs, the page showed a CAPTCHA, which I'm not allowed to solve. I computed the estimate |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 31 | 0 | 106,098 | 0 | 50 | 49,335 | 785,914 | 5,626 | 2.1 | 6.4 | 98.1 | 104.5 | 0.00 | 0.01 | I couldn't get the calculator on SmartAsset to produce a result, so the answer below is computed by hand from the brackets on SmartAsset's own page. **Estimate |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 3 | success | 1 | 47 | 0 | 3,307 | 17 | 36 | 31,754 | 333,358 | 5,034 | 2.0 | 7.7 | 71.1 | 78.8 | 0.00 | 0.00 | I could not get SmartAsset's calculator to produce an estimate, so I have no SmartAsset number to report. What happened: - The Income Tax Calculator loaded at  |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 52 | 7 | 35,366 | 0 | 74 | 27,289 | 732,018 | 6,168 | 2.1 | 7.6 | 114.1 | 121.7 | 0.00 | 0.00 | I couldn't finish this task. I found a qualifying gas station, but Google Maps blocked the page before I could open its reviews, so the review sort was never do |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 63 | 6 | 86,924 | 4 | 74 | 54,154 | 1,289,547 | 7,872 | 2.2 | 3.7 | 253.8 | 257.5 | 0.00 | 0.02 | I couldn't finish the review-sorting step. I found a qualifying station, but its place page never loaded any reviews, so I didn't sort anything. **What I did:* |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 1 | success | 1 | 32 | 0 | 2,985 | 16 | 34 | 29,389 | 285,283 | 3,744 | 2.0 | 7.9 | 53.3 | 61.2 | 0.00 | 0.00 | I didn't finish this. I found no gas station in Manhattan rated above 4.0 that I could confirm, and I never reached the reviews or the sort step. What happened |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 2 | success | 1 | 60 | 12 | 38,895 | 2 | 88 | 29,981 | 923,897 | 6,848 | 2.0 | 2.0 | 113.2 | 115.2 | 0.00 | 0.00 | I found a qualifying gas station but could not reach its reviews, so the sort step is not done. **Found:** Global Gas Station, 89 St Nicholas Pl (Harlem, Manha |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 25 | 1 | 61,489 | 1 | 34 | 30,716 | 298,667 | 5,685 | 2.0 | 1.6 | 88.8 | 90.4 | 0.00 | 0.01 | I didn't find a qualifying station, so I stopped before the review-sorting step. I ran three Maps searches (“gas station Manhattan NY”, “gas stations in Manhat |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 2 | success | 1 | 32 | 0 | 2,672 | 14 | 30 | 25,804 | 229,181 | 3,902 | 2.0 | 1.3 | 43.3 | 44.6 | 0.00 | 0.01 | I couldn't finish this task. Google Maps stopped responding to input partway through, and I didn't find a Manhattan gas station rated above 4.0, so I never reac |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 3 | success | 1 | 66 | 9 | 36,151 | 3 | 92 | 29,405 | 977,900 | 7,586 | 2.0 | 1.4 | 99.0 | 100.4 | 0.00 | 0.00 | I found a qualifying station but could not sort its reviews, so the task is only partly done. **Found:** Global Gas Station, 89 St Nicholas Pl, New York, NY 10 |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 27 | 1 | 34,117 | 4 | 34 | 23,371 | 297,872 | 3,017 | 2.0 | 1.9 | 63.0 | 64.9 | 0.00 | 0.01 | I did not find a gas station in Manhattan rated above 4.0, so I did not reach the review-sorting step. The task's condition can't be met from the results I coul |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 3 | success | 1 | 37 | 0 | 3,609 | 19 | 40 | 34,373 | 394,321 | 4,759 | 2.0 | 1.5 | 51.7 | 53.2 | 0.00 | 0.00 | I did not finish the task. Google Maps stopped responding to clicks and list scrolling, so I never got to a Manhattan gas station's reviews. **What I found:**  |
