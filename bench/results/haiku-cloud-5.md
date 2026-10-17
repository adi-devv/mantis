# Real-agent eval

> Claude Code (`claude -p`) (requested model `claude-haiku-5-5`) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Claude stream; reported cost is retained; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 1; 6 runs in parallel.
- Scope: 5 tasks × 3 approaches × 1 runs = 15 logical runs; 15 recorded so far; 15 total attempts including retries.
- Claude CLI version: 2.1.301 (Claude Code); resolved model(s): claude-haiku-5-5.
- MCP startup (spawn + warm-up) is separate from Claude CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first init event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Claude-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. 
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 5 / 5 | 5 / 5 | 5 / 5 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 156 | 169 | 265 |
| MCP tool errors (including retries) | 14 | 12 | 2 |
| Browser observation text (observed chars) | 318,476 | 599,966 | 23,595 |
| Browser observation images (observed blocks) | 0 | 9 | 128 |
| Normal input tokens (total) | 242 | 270 | 270 |
| Cache-write input tokens (total) | 186,195 | 318,608 | 231,995 |
| Cache-read input tokens (total) | 3,173,579 | 6,773,017 | 3,909,558 |
| Output tokens (total) | 26,248 | 34,421 | 31,872 |
| Total input tokens incl. cache (legacy) | 3,360,016 | 7,091,895 | 4,141,823 |
| MCP startup (total, s) | 10.3 | 10.3 | 10.3 |
| CLI startup (total, s) | 13.9 | 12.4 | 14.9 |
| CLI execution (total, s) | 623.6 | 715.3 | 531.3 |
| CLI wall (total, s) | 637.5 | 727.7 | 546.3 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.1 | 0.2 | 0.0 |
| Cost estimate (USD; including retries) | 0.12 | 0.29 | 0.10 |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 48 | 6 | 37,431 | 0 | 64 | 26,888 | 543,953 | 5,100 | 2.1 | 2.1 | 99.6 | 101.7 | 0.00 | 0.00 | I couldn't finish this. I found a qualifying station but couldn't open it, so I didn't sort any reviews. **What I found:** Google Maps search results for "gas  |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 20 | 0 | 21,449 | 0 | 28 | 12,385 | 194,940 | 2,115 | 2.1 | 2.5 | 60.6 | 63.1 | 0.00 | 0.03 | I didn't find a gas station in Manhattan with a rating above 4.0, so I didn't reach the review sorting step. - **"gas station Manhattan NY" search:** Google Ma |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 1 | success | 1 | 27 | 0 | 2,593 | 14 | 30 | 24,888 | 225,237 | 3,111 | 2.1 | 2.2 | 43.8 | 46.0 | 0.00 | 0.00 | I could not finish this task. I did not find a Manhattan gas station rated above 4.0, and I did not reach the review sorting step. - **What I checked:** The se |
| `046138801a05ddf56ad94e8672942496_070826` | Mantis | 1 | success | 1 | 12 | 1 | 20,861 | 0 | 24 | 11,945 | 129,500 | 1,517 | 2.1 | 2.0 | 40.0 | 42.0 | 0.00 | 0.05 | The community thread with the most replies of all time is **"The Banter Thread"** in the FlightAware Discussions General category. Its topic list shows 5,518 re |
| `046138801a05ddf56ad94e8672942496_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 11 | 0 | 91,872 | 0 | 14 | 41,793 | 162,472 | 1,891 | 2.1 | 2.5 | 51.7 | 54.1 | 0.00 | 0.03 | The community's most-replied topic is **"The Banter Thread"** on the FlightAware Discussions forum, with 5,518 replies. I opened it and stopped there. I did not |
| `046138801a05ddf56ad94e8672942496_070826` | Screenshots (click by x,y) | 1 | success | 1 | 47 | 0 | 3,975 | 21 | 44 | 37,747 | 474,772 | 5,039 | 2.1 | 2.2 | 79.2 | 81.3 | 0.00 | 0.00 | I opened The Banter Thread, but I couldn't read the page's URL from the browser tools, so the FINAL_URL below is not verified. **Answer: The Banter Thread** in |
| `11857213ca01510f12813740afd59918_110325` | Mantis | 1 | success | 1 | 19 | 3 | 38,859 | 0 | 36 | 22,775 | 277,742 | 2,952 | 2.1 | 1.9 | 116.4 | 118.3 | 0.00 | 0.01 | I added the Birkenstock Boston Soft Footbed Suede Leather clog in Mocha, men's size 10-10.5, to your cart. I stopped there and did not log in, check out, or ent |
| `11857213ca01510f12813740afd59918_110325` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 28 | 0 | 62,670 | 8 | 44 | 43,591 | 621,327 | 4,403 | 2.0 | 1.5 | 143.8 | 145.3 | 0.00 | 0.12 | I added one pair to your cart and stopped there. I didn't log in, check out, or enter any personal information. The item is the **Boston Soft Footbed in Oiled  |
| `11857213ca01510f12813740afd59918_110325` | Screenshots (click by x,y) | 1 | success | 1 | 87 | 1 | 8,146 | 45 | 92 | 78,120 | 1,890,526 | 8,303 | 2.0 | 2.0 | 206.9 | 208.9 | 0.00 | 0.01 | I added one pair to your cart: Birkenstock **Boston, Oiled Leather, Habana** (brown), US men's 10-10.5, Regular/Wide, $154.95. I stopped there without logging i |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 48 | 2 | 184,924 | 0 | 78 | 101,688 | 1,908,315 | 12,951 | 2.1 | 3.4 | 278.9 | 282.3 | 0.00 | 0.00 | I added the Speedo Women's Solid Leaderback Swimsuit in Black to your cart at the sale price of $37.00 (regular $74.00). I stopped before checkout and didn't lo |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 67 | 9 | 259,013 | 0 | 104 | 139,764 | 4,032,485 | 17,890 | 2.1 | 2.7 | 329.6 | 332.2 | 0.00 | 0.02 | I did not add anything to the cart. Speedo's women's black swimsuits don't offer a size L, so I stopped before adding one. - **Sizing:** Every women's swimsuit |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 62 | 0 | 5,500 | 31 | 64 | 58,656 | 975,834 | 10,155 | 2.0 | 5.4 | 143.9 | 149.3 | 0.00 | 0.01 | I added Women's Shaping Strappy One Piece Black (black, $39.20) to the cart in size 38/14. I stopped there and did not check out, log in, or enter any personal  |
| `eb323dc584156d0eb3a2b90bb8c4b791_110325` | Mantis | 1 | success | 1 | 29 | 2 | 36,401 | 0 | 40 | 22,899 | 314,069 | 3,728 | 2.0 | 4.5 | 88.7 | 93.2 | 0.00 | 0.01 | The cheapest match I found is **720 West End Avenue, Unit 7H, Upper West Side, Manhattan**, listed at **$13,500/month**. It has 2 bedrooms and 3 bathrooms, 1,47 |
| `eb323dc584156d0eb3a2b90bb8c4b791_110325` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 43 | 3 | 164,962 | 1 | 80 | 81,075 | 1,761,793 | 8,122 | 2.1 | 3.3 | 129.6 | 132.9 | 0.00 | 0.01 | The cheapest qualifying rental I found is **2833 Ocean Parkway, Unit 2C, Brighton Beach, Brooklyn, NY 11235**, listed at **$3,395/mo** with 2 beds, 3 baths, 1,4 |
| `eb323dc584156d0eb3a2b90bb8c4b791_110325` | Screenshots (click by x,y) | 1 | success | 1 | 42 | 1 | 3,381 | 17 | 40 | 32,584 | 343,189 | 5,264 | 2.0 | 3.2 | 57.5 | 60.7 | 0.00 | 0.00 | I could not confirm the cheapest 2-bed, 3+-bath rental in New York. The search returned about 13.5K listings, and the price sort did not hold up when I checked  |
