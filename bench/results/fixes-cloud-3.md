# Real-agent eval

> Claude Code (`claude -p`) (requested model `claude-haiku-5-5`) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Claude stream; reported cost is retained; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 3; 3 runs in parallel.
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
| Tool calls (including retries) | 307 | 24 | 432 |
| MCP tool errors (including retries) | 38 | 24 | 5 |
| Browser observation text (observed chars) | 570,697 | 68,832 | 39,780 |
| Browser observation images (observed blocks) | 1 | 0 | 209 |
| Normal input tokens (total) | 526 | 58 | 446 |
| Cache-write input tokens (total) | 340,574 | 42,713 | 380,785 |
| Cache-read input tokens (total) | 7,336,087 | 308,752 | 7,700,526 |
| Output tokens (total) | 55,146 | 6,155 | 55,902 |
| Total input tokens incl. cache (legacy) | 7,677,187 | 351,523 | 8,081,757 |
| MCP startup (total, s) | 18.1 | 18.1 | 18.1 |
| CLI startup (total, s) | 17.9 | 10.9 | 9.5 |
| CLI execution (total, s) | 1132.2 | 81.1 | 618.4 |
| CLI wall (total, s) | 1150.1 | 92.0 | 627.9 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.0 | 0.0 | 0.1 |
| Cost estimate (USD; including retries) | 0.18 | 0.01 | 0.29 |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 33 | 3 | 98,916 | 0 | 56 | 56,775 | 944,014 | 7,024 | 2.0 | 1.2 | 159.7 | 160.9 | 0.00 | 0.00 | I added the Women's Solid Leaderback Swimsuit in Team Black, size 40, to your cart at $37.00 (sale price, regular $74.00). I stopped before checkout and did not |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 3 | 3 | 8,604 | 0 | 8 | 5,696 | 43,262 | 798 | 2.0 | 1.2 | 10.2 | 11.3 | 0.00 | 0.00 | I could not reach Speedo, so I did not find the swimsuit or add anything to your cart. Every attempt to open a browser failed before any page loaded. Chromium  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 46 | 0 | 4,070 | 23 | 48 | 41,905 | 554,774 | 5,719 | 2.0 | 1.2 | 69.6 | 70.9 | 0.00 | 0.00 | I added the cheapest black swimsuit in size L to your cart and stopped before checkout. - **Item:** Women's Shaping Strappy One Piece Black - **Size:** 38/14 ( |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 2 | success | 1 | 58 | 7 | 168,928 | 0 | 100 | 94,677 | 2,235,590 | 12,017 | 2.0 | 2.1 | 276.5 | 278.6 | 0.00 | 0.00 | I did not add anything to the cart. The site has no size "L" option on any swimsuit I checked, so I couldn't confirm a Large. - **Filters applied:** Swimsuit,  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 2 | 2 | 5,736 | 0 | 6 | 3,583 | 31,051 | 518 | 2.0 | 1.3 | 8.2 | 9.5 | 0.00 | 0.00 | I couldn't reach Speedo, so I haven't looked at any products and nothing is in your cart. The browser failed to start twice with the same error: Chromium refus |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 2 | success | 1 | 144 | 3 | 13,567 | 67 | 144 | 123,066 | 4,624,489 | 18,978 | 2.0 | 1.1 | 197.2 | 198.3 | 0.00 | 0.01 | I added Women's Solid Leaderback Swimsuit Black to your cart, in Team Black, size 40, quantity 1, at $37.00. I stopped at the cart drawer and did not check out, |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 3 | success | 1 | 56 | 9 | 135,594 | 0 | 98 | 79,129 | 2,124,268 | 12,778 | 2.0 | 1.4 | 252.0 | 253.4 | 0.00 | 0.01 | I stopped before adding anything to the cart. The site's size filter says "L", but none of the product pages I checked show an L size, so I can't confirm which  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 2 | 2 | 5,736 | 0 | 6 | 3,582 | 31,050 | 523 | 2.0 | 1.4 | 8.3 | 9.7 | 0.00 | 0.01 | I couldn't complete this. The browser won't start, so I never reached speedo.com and haven't added anything to a cart. **What happened:** Chromium exits on lau |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 3 | success | 1 | 58 | 0 | 5,140 | 29 | 60 | 52,582 | 861,539 | 7,852 | 2.0 | 1.1 | 79.0 | 80.1 | 0.00 | 0.00 | I added Women's Shaping Strappy One Piece Black in size 38/14 (Black) to your cart. I stopped at the cart drawer and did not check out, log in, or enter any per |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 1 | success | 1 | 23 | 3 | 29,705 | 0 | 42 | 17,144 | 315,317 | 2,894 | 2.0 | 1.0 | 67.0 | 68.0 | 0.00 | 0.01 | I couldn't get SmartAsset's calculator to run, so this estimate is a manual calculation, not their tool's output. **Estimated federal income tax: about $30,638 |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 2 | 5,736 | 0 | 6 | 4,244 | 30,415 | 669 | 2.0 | 1.5 | 8.5 | 9.9 | 0.00 | 0.01 | I couldn't get to SmartAsset, so I have no tax estimate. The browser fails to start before it loads any page. Chromium exits with "Running as root without --no |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 1 | success | 1 | 55 | 1 | 4,223 | 22 | 46 | 41,998 | 530,567 | 7,492 | 2.0 | 1.0 | 67.9 | 68.9 | 0.00 | 0.06 | I couldn't get SmartAsset's calculator to produce a result, so I don't have a site estimate for you. **What happened** - The site is unstable. The Tax Guide an |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 2 | success | 1 | 23 | 2 | 42,814 | 0 | 44 | 23,928 | 350,843 | 4,020 | 2.0 | 1.3 | 82.9 | 84.2 | 0.00 | 0.01 | I couldn't get SmartAsset's calculator to produce a result, so my estimate is a hand calculation from the 2026 single brackets on the same SmartAsset page. **E |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 3 | 3 | 8,604 | 0 | 8 | 4,998 | 43,973 | 821 | 2.0 | 1.1 | 12.0 | 13.1 | 0.00 | 0.00 | I couldn't get an estimate because the browser never started, so I didn't reach SmartAsset. Each of three attempts (two navigations and one new tab) failed at  |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 2 | success | 1 | 19 | 1 | 1,955 | 9 | 22 | 16,492 | 116,261 | 2,422 | 2.0 | 1.1 | 30.7 | 31.8 | 0.00 | 0.00 | I could not get an estimate from SmartAsset's calculator. The Income Tax Calculator crashed with "Application error: a client-side exception has occurred" every |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 3 | success | 1 | 15 | 1 | 19,615 | 0 | 30 | 10,655 | 180,095 | 2,199 | 2.0 | 7.6 | 45.5 | 53.1 | 0.00 | 0.00 | I could not get SmartAsset's income tax calculator to work, so I have no SmartAsset estimate for you. - **Homepage:** loaded, and I used its Calculators tab an |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 3 | 3 | 8,604 | 0 | 6 | 4,923 | 32,408 | 592 | 2.0 | 1.4 | 7.8 | 9.2 | 0.00 | 0.01 | I couldn't get an estimate because the browser never launched, so I have no tax figure to give you. Every browser call failed with the same error. Chromium ref |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 3 | success | 1 | 22 | 0 | 2,046 | 11 | 24 | 19,338 | 149,562 | 2,733 | 2.0 | 1.0 | 34.4 | 35.4 | 0.00 | 0.00 | I could not get SmartAsset's federal tax calculator to produce an estimate, so I don't have a SmartAsset answer. What I tried: - **Tax Guide's "Income Tax Calc |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 21 | 2 | 15,572 | 0 | 36 | 13,368 | 197,358 | 4,455 | 2.0 | 1.4 | 70.9 | 72.3 | 0.00 | 0.00 | I could not finish this task. I found no gas station in Manhattan with a verified rating above 4.0, so I did not reach the review-sorting step. - **First searc |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 3 | 3 | 8,604 | 0 | 6 | 5,639 | 31,755 | 698 | 2.0 | 1.1 | 9.3 | 10.4 | 0.00 | 0.01 | I couldn't do the task. The browser never started, so I didn't reach Google Maps or find any gas stations. Both attempts failed with the same error: Chromium e |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 1 | success | 1 | 34 | 0 | 3,492 | 19 | 40 | 34,328 | 385,511 | 4,531 | 2.0 | 0.9 | 47.0 | 48.0 | 0.00 | 0.00 | I could not finish this task. I did not find a gas station in Manhattan rated above 4.0, so I did not reach the step of sorting reviews by lowest rating. - **R |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 2 | success | 1 | 36 | 5 | 31,484 | 1 | 50 | 23,078 | 402,498 | 4,515 | 2.0 | 0.8 | 81.7 | 82.6 | 0.00 | 0.00 | I couldn't finish this. Google Maps put an overlay over the results panel, and every control I tried (See more, Collapse side panel, the Global Gas Station link |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 3 | 3 | 8,604 | 0 | 6 | 5,043 | 32,419 | 873 | 2.0 | 1.0 | 8.9 | 9.9 | 0.00 | 0.00 | I could not complete the task. The browser never launched, so I did not reach Google Maps or find a gas station. Every browser call failed with the same error. |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 2 | success | 1 | 26 | 0 | 2,522 | 14 | 30 | 24,634 | 222,723 | 2,967 | 2.0 | 1.0 | 32.8 | 33.8 | 0.00 | 0.00 | I did not finish this. I couldn't find a gas station in Manhattan rated above 4.0, and I never reached the review-sorting step. - **Search:** Typing into the G |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 3 | success | 1 | 42 | 6 | 28,069 | 0 | 70 | 21,820 | 586,104 | 5,244 | 2.0 | 1.1 | 95.8 | 97.0 | 0.00 | 0.00 | I couldn't finish this. Google Maps is blocked by an overlay, and I can't get past it with the tools I have. **What I found:** - The search for "gas station in |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 3 | 3 | 8,604 | 0 | 6 | 5,005 | 32,419 | 663 | 2.0 | 1.0 | 7.9 | 8.9 | 0.00 | 0.00 | I couldn't complete the task. The browser never started, so I didn't reach Google Maps, search for a gas station, or sort any reviews. Every attempt failed wit |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 3 | success | 1 | 28 | 0 | 2,765 | 15 | 32 | 26,442 | 255,100 | 3,208 | 2.0 | 1.0 | 59.8 | 60.9 | 0.00 | 0.00 | I couldn't finish the task. I didn't find a Manhattan gas station rated above 4.0, so I never reached the review-sorting step. - **Ratings checked:** The resul |
