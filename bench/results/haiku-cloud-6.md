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
| Tool calls (including retries) | 285 | 459 | 519 |
| MCP tool errors (including retries) | 33 | 37 | 0 |
| Browser observation text (observed chars) | 354,675 | 1,286,969 | 38,750 |
| Browser observation images (observed blocks) | 3 | 15 | 203 |
| Normal input tokens (total) | 460 | 632 | 424 |
| Cache-write input tokens (total) | 239,193 | 671,499 | 388,580 |
| Cache-read input tokens (total) | 4,118,252 | 15,375,979 | 6,722,601 |
| Output tokens (total) | 44,302 | 78,328 | 61,850 |
| Total input tokens incl. cache (legacy) | 4,357,905 | 16,048,110 | 7,111,605 |
| MCP startup (total, s) | 18.6 | 18.2 | 18.2 |
| CLI startup (total, s) | 17.9 | 16.5 | 17.5 |
| CLI execution (total, s) | 932.0 | 1575.4 | 717.2 |
| CLI wall (total, s) | 949.8 | 1591.9 | 734.6 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.3 | 0.2 | 0.4 |
| Cost estimate (USD; including retries) | 0.11 | 0.63 | 0.22 |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 16 | 0 | 31,329 | 0 | 28 | 26,089 | 223,031 | 4,308 | 2.0 | 2.6 | 103.0 | 105.6 | 0.00 | 0.02 | I added the Women's Shaping Strappy One Piece in Black, size 38/14, to your cart at $39.20 (sale price, regular $98.00), quantity 1. I stopped there and did not |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 69 | 10 | 290,299 | 0 | 104 | 152,067 | 3,995,512 | 17,235 | 2.0 | 2.5 | 311.5 | 314.1 | 0.00 | 0.04 | I did not add anything to the cart. Speedo's women's swimsuits don't use a "Large" size, so I couldn't match your request exactly. - **Lowest-priced black one- |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 59 | 0 | 5,297 | 30 | 62 | 59,072 | 905,423 | 8,643 | 2.1 | 2.4 | 109.0 | 111.3 | 0.00 | 0.00 | I added Women's Shaping Strappy One Piece Black to your cart at $39.20 (down from $98.00) and stopped before checkout. Nothing was logged in, purchased, or ente |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 2 | success | 1 | 27 | 4 | 43,224 | 0 | 50 | 34,819 | 547,067 | 7,081 | 2.1 | 2.6 | 131.4 | 133.9 | 0.00 | 0.08 | The Women's Shaping Strappy One Piece in black is in your cart at $39.20 (sale price, regular $98.00), size 40/16, quantity 1. I stopped before checkout and did |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 66 | 7 | 264,140 | 0 | 96 | 143,566 | 3,497,655 | 17,998 | 2.1 | 2.5 | 350.8 | 353.3 | 0.00 | 0.03 | I didn't add anything to the cart. I couldn't find a black women's swimsuit in size L. - **Size L doesn't show up on swimsuit product pages.** The site's Size  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 2 | success | 1 | 114 | 0 | 10,395 | 59 | 120 | 111,160 | 3,300,583 | 16,535 | 2.1 | 2.4 | 201.8 | 204.2 | 0.00 | 0.05 | I added the Women's Solid Leaderback Swimsuit Black to your cart at $37.00 (on sale, was $74.00), size 40. I did not check out, log in, or enter any personal in |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 3 | success | 1 | 38 | 5 | 99,557 | 0 | 58 | 56,819 | 812,924 | 6,667 | 2.0 | 0.9 | 166.2 | 167.0 | 0.00 | 0.00 | I added the Women's Solid Leaderback Swimsuit Black (size 40) to your cart at $37.00 (sale price, regular $74.00). I stopped there and did not check out, log in |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 34 | 2 | 63,626 | 0 | 58 | 34,013 | 707,672 | 4,309 | 2.0 | 1.4 | 162.9 | 164.3 | 0.00 | 0.01 | I added the Women's Solid High Neck One Piece in Black, size L, to your cart at $58.00. I stopped there and did not check out, log in, or enter any personal inf |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 3 | success | 1 | 162 | 0 | 7,668 | 34 | 68 | 69,735 | 1,223,798 | 13,387 | 2.0 | 1.5 | 144.4 | 145.9 | 0.00 | 0.01 | I added Women's Shaping Strappy One Piece Black (Black) to the cart, size 40/16, quantity 1, for $39.20. I stopped at the cart drawer and did not check out or e |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 1 | success | 1 | 21 | 0 | 20,446 | 0 | 32 | 12,458 | 204,878 | 2,757 | 2.0 | 2.8 | 65.9 | 68.7 | 0.00 | 0.00 | I couldn't get SmartAsset's estimate. The income tax calculator and the Taxes section both fail to load with "Application error: a client-side exception has occ |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 63 | 1 | 161,514 | 0 | 92 | 76,433 | 2,227,760 | 8,881 | 2.0 | 1.4 | 174.3 | 175.8 | 0.00 | 0.01 | The calculator page keeps crashing, so I couldn't get a result from it. I worked out the estimate by hand from the 2025 single-filer brackets that the same page |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 1 | success | 1 | 44 | 0 | 3,139 | 16 | 34 | 30,691 | 296,595 | 5,558 | 2.0 | 2.6 | 58.3 | 60.9 | 0.00 | 0.37 | I could not get SmartAsset's calculator to return a result, so the figure below is a hand calculation, not the site's estimate. **What happened** - I opened th |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 2 | success | 1 | 23 | 3 | 22,078 | 0 | 40 | 13,068 | 251,086 | 2,806 | 2.0 | 1.7 | 98.8 | 100.5 | 0.00 | 0.18 | I couldn't get an answer from SmartAsset's calculator. The federal calculator page (`/taxes/income-taxes`) and the 2026 brackets article both show "Application  |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 53 | 3 | 106,936 | 7 | 76 | 63,834 | 1,589,304 | 8,379 | 2.0 | 3.5 | 109.6 | 113.0 | 0.00 | 0.04 | I couldn't get SmartAsset's calculator to produce a result, so the figure below is a manual calculation from the brackets on the same site. **Estimate: about $ |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 2 | success | 1 | 24 | 0 | 2,016 | 10 | 26 | 18,696 | 145,614 | 3,253 | 2.0 | 3.7 | 51.3 | 55.0 | 0.00 | 0.00 | I couldn't get an estimate. The SmartAsset Federal Income Tax Calculator crashed every time I interacted with it, so I stopped there. What I did: - Opened smar |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 3 | success | 1 | 33 | 3 | 47,814 | 0 | 56 | 26,903 | 512,940 | 5,030 | 2.4 | 2.1 | 100.5 | 102.7 | 0.00 | 0.01 | I couldn't get SmartAsset's calculator to return a result, so this is a manual estimate from the federal brackets, not the calculator's output. **Estimated fed |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 48 | 3 | 181,999 | 0 | 56 | 81,403 | 1,388,916 | 7,044 | 2.0 | 1.3 | 108.3 | 109.6 | 0.00 | 0.01 | **Estimate: about $30,900 in federal income tax** (about $30,887 using the 2025 brackets; about $30,640 using the 2026 brackets). That is an effective rate of r |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 3 | success | 1 | 29 | 0 | 2,389 | 12 | 26 | 22,949 | 176,654 | 4,359 | 2.0 | 1.7 | 46.5 | 48.1 | 0.00 | 0.00 | I could not get an estimate from SmartAsset's own calculator. The income tax calculator and the brackets guide both crashed with "Application error: a client-si |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 38 | 6 | 23,410 | 0 | 58 | 19,498 | 378,125 | 5,269 | 2.0 | 3.5 | 91.4 | 94.9 | 0.00 | 0.00 | I couldn't finish this. I didn't find a verified Manhattan gas station rated above 4.0, and I didn't reach the review sort. **What I found:** - Google Maps' se |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 39 | 4 | 42,704 | 3 | 48 | 28,189 | 494,520 | 4,235 | 2.0 | 2.3 | 109.9 | 112.3 | 0.00 | 0.01 | I could not find a gas station in Manhattan rated above 4.0, so I did not reach the step of sorting reviews by lowest rating. I stopped there. I did not log in, |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 1 | success | 1 | 41 | 0 | 3,375 | 18 | 36 | 33,376 | 326,415 | 4,509 | 2.0 | 1.5 | 45.6 | 47.0 | 0.00 | 0.00 | I did not finish the task. Google Maps got stuck on a "Loading..." overlay, and I could not reach a gas station rated above 4.0 or sort any reviews. - **Result |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 2 | success | 1 | 41 | 6 | 27,922 | 2 | 70 | 21,309 | 584,331 | 4,569 | 2.0 | 0.9 | 87.9 | 88.8 | 0.00 | 0.00 | I found a qualifying station but could not sort its reviews, so the task is not complete. - **Station found:** Global Gas Station, 89 St Nicholas Pl, Manhattan |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 39 | 4 | 84,219 | 3 | 54 | 44,659 | 785,508 | 4,723 | 2.0 | 0.8 | 112.9 | 113.7 | 0.00 | 0.01 | I couldn't finish the review sort. I found a qualifying gas station, but its listing page never rendered, so I couldn't reach the reviews. **What I did:** - Th |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 2 | success | 1 | 23 | 0 | 2,271 | 12 | 26 | 21,587 | 174,875 | 2,833 | 2.0 | 0.8 | 30.8 | 31.6 | 0.00 | 0.00 | I did not finish the task. I could find gas stations in Manhattan, but I could not get past the first five results to find one rated above 4.0, and I never reac |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 3 | success | 1 | 48 | 6 | 38,895 | 1 | 68 | 28,230 | 603,870 | 5,815 | 2.0 | 0.9 | 86.9 | 87.7 | 0.00 | 0.00 | I didn't finish the task. I found a qualifying station but could not open its page to sort the reviews. **What I found:** Global Gas Station, 89 St Nicholas Pl |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 48 | 3 | 91,532 | 2 | 48 | 47,335 | 689,132 | 5,524 | 2.0 | 0.8 | 135.1 | 135.9 | 0.00 | 0.01 | I couldn't finish the task: I found a qualifying gas station but could not open its reviews, so I did not sort them by lowest rating. - **Search:** The Maps se |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 3 | success | 1 | 23 | 0 | 2,200 | 12 | 26 | 21,314 | 172,644 | 2,773 | 2.0 | 0.9 | 29.6 | 30.5 | 0.00 | 0.00 | I haven't been able to finish this, so I'm stopping here rather than continuing to retry. **What happened:** - I opened https://www.google.com/maps/ and search |
