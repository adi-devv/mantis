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
| Tool calls (including retries) | 329 | 441 | 471 |
| MCP tool errors (including retries) | 39 | 51 | 1 |
| Browser observation text (observed chars) | 494,423 | 1,104,852 | 33,934 |
| Browser observation images (observed blocks) | 10 | 42 | 175 |
| Normal input tokens (total) | 534 | 616 | 370 |
| Cache-write input tokens (total) | 324,362 | 639,064 | 339,539 |
| Cache-read input tokens (total) | 6,425,250 | 15,884,070 | 4,033,759 |
| Output tokens (total) | 57,609 | 76,804 | 55,316 |
| Total input tokens incl. cache (legacy) | 6,750,146 | 16,523,750 | 4,373,668 |
| MCP startup (total, s) | 20.9 | 18.7 | 25.1 |
| CLI startup (total, s) | 13.0 | 22.4 | 15.9 |
| CLI execution (total, s) | 1170.6 | 1694.4 | 743.7 |
| CLI wall (total, s) | 1183.6 | 1716.8 | 759.6 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.1 | 0.3 | 0.0 |
| Harness capture (total, s) | 142.7 | 699.2 | 221.7 |
| Cost estimate (USD; including retries) | 0.16 | 0.64 | 0.14 |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 25 | 1 | 70,308 | 0 | 50 | 48,360 | 697,308 | 7,945 | 2.0 | 1.8 | 156.5 | 158.3 | 0.00 | 0.01 | I added the Women's Shaping Strappy One Piece Black to the cart in size 40/16, at $39.20. I did not check out, sign in, or enter any personal information. **Ho |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 48 | 8 | 208,578 | 0 | 78 | 111,740 | 2,518,404 | 11,057 | 2.0 | 1.5 | 236.2 | 237.7 | 0.00 | 0.04 | I added one item to the cart and stopped before checkout. Nothing was purchased, and I did not sign in or enter personal information. **Item in cart:** Women's |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 50 | 0 | 4,123 | 23 | 48 | 47,230 | 564,082 | 8,217 | 2.0 | 1.6 | 114.2 | 115.8 | 0.00 | 0.00 | I stopped before adding anything to the cart, because I can't confirm which numeric size is "L." **Answer: the lowest-priced qualifying suit is Women's Shaping |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 2 | success | 1 | 22 | 1 | 66,394 | 0 | 44 | 44,391 | 561,533 | 6,942 | 2.0 | 1.7 | 131.1 | 132.8 | 0.00 | 0.00 | I did not add anything to the cart. The site doesn't tell me which size option on this product is "L," so I stopped before adding it. **What the site shows (ob |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 81 | 16 | 173,945 | 10 | 126 | 117,913 | 4,143,350 | 15,095 | 2.1 | 2.0 | 281.0 | 283.0 | 0.00 | 0.06 | I added the lowest-priced black women's swimsuit in size L to your cart and stopped before checkout. The cart drawer is still open. **Item:** Women's Shaping S |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 2 | success | 1 | 50 | 0 | 4,297 | 24 | 50 | 48,707 | 596,768 | 7,568 | 2.1 | 1.8 | 110.0 | 111.7 | 0.00 | 0.00 | I did not add anything to the cart. I stopped because I couldn't confirm which size the site calls "L." **What the site showed:** - **Category:** Women's Black |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 3 | success | 1 | 51 | 6 | 128,523 | 0 | 88 | 74,660 | 1,599,131 | 11,837 | 4.3 | 1.2 | 249.9 | 251.1 | 0.00 | 0.01 | I did not add anything to the cart. I could not confirm a women's black swimsuit in size L with the lowest price. **What the site showed (observed):** - Search |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 73 | 14 | 302,255 | 0 | 118 | 150,204 | 4,964,535 | 19,214 | 2.0 | 0.9 | 375.2 | 376.1 | 0.00 | 0.04 | I did not add anything to the cart. I stopped because I could not find a black swimsuit with a size L option that I could verify. **What the site showed:** - W |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 3 | success | 1 | 52 | 0 | 4,318 | 24 | 50 | 45,402 | 620,213 | 8,321 | 2.0 | 2.1 | 95.4 | 97.6 | 0.00 | 0.00 | I did not add anything to the cart. I stopped because I couldn't confirm which numeric size is "Large." **What's visible now:** the Women's Shaping Strappy One |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 1 | success | 1 | 13 | 1 | 13,866 | 0 | 24 | 9,328 | 127,774 | 1,750 | 2.0 | 1.6 | 48.7 | 50.4 | 0.00 | 0.00 | I could not get a federal income tax estimate from SmartAsset, so I have no answer for the $158,500 single filer in ZIP 97007. What I did: 1. Opened https://sm |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 29 | 2 | 91,902 | 0 | 36 | 42,322 | 530,077 | 3,193 | 2.0 | 1.2 | 85.2 | 86.5 | 0.00 | 0.02 | I could not get a SmartAsset estimate for this. The federal income tax calculator fails to load, so I have no site-generated result to report. **What I did:**  |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 1 | success | 1 | 36 | 0 | 3,252 | 17 | 40 | 31,868 | 339,751 | 4,578 | 4.8 | 1.3 | 63.4 | 64.7 | 0.00 | 0.00 | I could not get a SmartAsset estimate for this scenario. The federal income tax calculator crashes every time I interact with it, so I have no site-generated re |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 2 | success | 1 | 35 | 3 | 51,519 | 1 | 56 | 29,854 | 507,316 | 4,739 | 2.0 | 1.3 | 133.2 | 134.5 | 0.00 | 0.02 | I did not get a site-generated federal tax estimate, so I have no answer to report from SmartAsset. **What happened:** 1. Opened https://smartasset.com/ and us |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 50 | 1 | 87,865 | 6 | 66 | 53,959 | 1,078,646 | 7,211 | 2.0 | 1.0 | 173.7 | 174.7 | 0.00 | 0.03 | I could not get a site-generated tax figure, so I have no answer from SmartAsset's calculator. The calculator page loaded, but its results stayed at "$--" after |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 2 | success | 1 | 130 | 1 | 5,810 | 25 | 52 | 52,530 | 728,648 | 10,731 | 2.0 | 3.3 | 157.1 | 160.4 | 0.00 | 0.00 | I could not get SmartAsset to produce an estimate, so I have no site-generated federal tax figure to report. **What I did** - Opened https://smartasset.com/, w |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 3 | success | 1 | 41 | 4 | 56,676 | 3 | 58 | 34,465 | 719,399 | 5,815 | 2.0 | 1.0 | 129.5 | 130.5 | 0.00 | 0.01 | I could not get SmartAsset to produce a federal tax estimate, so I have no site result to report. **What happened** - Opened smartasset.com, then Taxes, then t |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 22 | 1 | 80,735 | 0 | 40 | 36,179 | 391,916 | 3,302 | 2.5 | 9.2 | 110.1 | 119.3 | 0.00 | 0.01 | I did not get a site-generated federal tax estimate. The calculator the task points to is broken on smartasset.com. **What I did** - Went to https://smartasset |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 3 | success | 1 | 23 | 0 | 1,969 | 10 | 22 | 18,380 | 130,647 | 2,626 | 2.0 | 2.7 | 56.5 | 59.2 | 0.00 | 0.01 | I could not get the SmartAsset income tax calculator to load, so I have no site-generated estimate for $158,500 in ZIP 97007 as single. I did not compute my own |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 25 | 3 | 23,665 | 1 | 38 | 19,579 | 237,100 | 4,771 | 2.5 | 1.4 | 69.3 | 70.7 | 0.00 | 0.00 | I could not finish this task. I found a candidate, but I couldn't verify it's in Manhattan or sort its reviews. **What the site showed:** - Search `gas station |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 51 | 1 | 58,078 | 12 | 52 | 49,126 | 810,375 | 6,826 | 2.0 | 1.2 | 152.8 | 154.0 | 0.00 | 0.03 | I could not complete the task. I did not find a Manhattan gas station rated above 4.0, so I never reached the step of sorting reviews by lowest rating. **What  |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 1 | success | 1 | 73 | 0 | 4,970 | 24 | 50 | 45,877 | 617,909 | 7,248 | 6.1 | 1.5 | 73.9 | 75.4 | 0.00 | 0.00 | I did not complete the task. I couldn't find a Manhattan gas station rated above 4.0, so I never reached the review sorting step. **What I checked (site-genera |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 2 | success | 1 | 61 | 9 | 53,655 | 2 | 90 | 38,384 | 1,176,562 | 6,789 | 2.0 | 2.0 | 133.9 | 135.9 | 0.00 | 0.00 | I did not finish. I found a Manhattan gas station rated above 4.0, but I could not open its reviews, so I did not sort them by lowest rating. **What the site s |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 22 | 2 | 40,271 | 1 | 26 | 22,088 | 196,381 | 3,431 | 2.0 | 0.8 | 75.0 | 75.9 | 0.00 | 0.03 | I could not find a gas station in Manhattan rated above 4.0 in the results Google Maps showed, so I did not reach the review-sorting step. **What I observed:** |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 2 | success | 1 | 29 | 0 | 2,770 | 15 | 30 | 26,259 | 236,767 | 3,081 | 2.0 | 0.8 | 40.1 | 40.9 | 0.00 | 0.00 | I could not finish this task. I found no gas station above 4.0 in Manhattan, and I never reached the review-sorting step. **What I did:** - Searched "gas stati |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 3 | success | 1 | 56 | 11 | 29,817 | 3 | 86 | 25,341 | 799,127 | 7,021 | 2.0 | 0.9 | 118.4 | 119.3 | 0.00 | 0.01 | I could not finish: the review sort step is not done. Google Maps kept a dimmed overlay (`div.bzPs2e`) over the Global Gas Station listing, so I could not open  |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 65 | 6 | 61,223 | 13 | 74 | 55,533 | 1,250,386 | 7,475 | 2.0 | 4.4 | 205.1 | 209.6 | 0.00 | 0.07 | I did not finish the task. I found gas stations rated above 4.0 in Manhattan, but I could not open one of them to sort its reviews by lowest rating. **What the |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 3 | success | 1 | 28 | 0 | 2,425 | 13 | 28 | 23,286 | 198,974 | 2,946 | 2.0 | 0.7 | 33.2 | 34.0 | 0.00 | 0.00 | I could not finish this task. I found no gas station in Manhattan rated above 4.0, so I never reached the review sorting step. **What I did:** - Opened Google  |
