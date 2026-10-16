# Real-agent eval

> Claude Code (`claude -p`) (requested model `claude-haiku-5-5`) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Claude stream; reported cost is retained; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 3; 6 runs in parallel.
- Scope: 3 tasks × 3 approaches × 3 runs = 27 logical runs; 8 recorded so far; 8 total attempts including retries.
- Claude CLI version: 2.1.301 (Claude Code); resolved model(s): claude-haiku-5-5.
- MCP startup (spawn + warm-up) is separate from Claude CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first init event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Claude-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. 
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 4 / 4 | 1 / 1 | 3 / 3 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 102 | 34 | 335 |
| MCP tool errors (including retries) | 9 | 2 | 0 |
| Browser observation text (observed chars) | 194,556 | 63,626 | 23,360 |
| Browser observation images (observed blocks) | 0 | 0 | 123 |
| Normal input tokens (total) | 168 | 58 | 250 |
| Cache-write input tokens (total) | 130,185 | 34,013 | 239,967 |
| Cache-read input tokens (total) | 1,787,900 | 707,672 | 5,429,804 |
| Output tokens (total) | 20,813 | 4,309 | 38,565 |
| Total input tokens incl. cache (legacy) | 1,918,253 | 741,743 | 5,670,021 |
| MCP startup (total, s) | 8.2 | 2.0 | 6.1 |
| CLI startup (total, s) | 8.9 | 1.4 | 6.3 |
| CLI execution (total, s) | 466.4 | 162.9 | 455.1 |
| CLI wall (total, s) | 475.3 | 164.3 | 461.4 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.1 | 0.0 | 0.1 |
| Cost estimate (USD; including retries) | 0.05 | 0.02 | 0.16 |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 16 | 0 | 31,329 | 0 | 28 | 26,089 | 223,031 | 4,308 | 2.0 | 2.6 | 103.0 | 105.6 | 0.00 | 0.02 | I added the Women's Shaping Strappy One Piece in Black, size 38/14, to your cart at $39.20 (sale price, regular $98.00), quantity 1. I stopped there and did not |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 59 | 0 | 5,297 | 30 | 62 | 59,072 | 905,423 | 8,643 | 2.1 | 2.4 | 109.0 | 111.3 | 0.00 | 0.00 | I added Women's Shaping Strappy One Piece Black to your cart at $39.20 (down from $98.00) and stopped before checkout. Nothing was logged in, purchased, or ente |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 2 | success | 1 | 27 | 4 | 43,224 | 0 | 50 | 34,819 | 547,067 | 7,081 | 2.1 | 2.6 | 131.4 | 133.9 | 0.00 | 0.08 | The Women's Shaping Strappy One Piece in black is in your cart at $39.20 (sale price, regular $98.00), size 40/16, quantity 1. I stopped before checkout and did |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 2 | success | 1 | 114 | 0 | 10,395 | 59 | 120 | 111,160 | 3,300,583 | 16,535 | 2.1 | 2.4 | 201.8 | 204.2 | 0.00 | 0.05 | I added the Women's Solid Leaderback Swimsuit Black to your cart at $37.00 (on sale, was $74.00), size 40. I did not check out, log in, or enter any personal in |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 3 | success | 1 | 38 | 5 | 99,557 | 0 | 58 | 56,819 | 812,924 | 6,667 | 2.0 | 0.9 | 166.2 | 167.0 | 0.00 | 0.00 | I added the Women's Solid Leaderback Swimsuit Black (size 40) to your cart at $37.00 (sale price, regular $74.00). I stopped there and did not check out, log in |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 34 | 2 | 63,626 | 0 | 58 | 34,013 | 707,672 | 4,309 | 2.0 | 1.4 | 162.9 | 164.3 | 0.00 | 0.01 | I added the Women's Solid High Neck One Piece in Black, size L, to your cart at $58.00. I stopped there and did not check out, log in, or enter any personal inf |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 3 | success | 1 | 162 | 0 | 7,668 | 34 | 68 | 69,735 | 1,223,798 | 13,387 | 2.0 | 1.5 | 144.4 | 145.9 | 0.00 | 0.01 | I added Women's Shaping Strappy One Piece Black (Black) to the cart, size 40/16, quantity 1, for $39.20. I stopped at the cart drawer and did not check out or e |
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 1 | success | 1 | 21 | 0 | 20,446 | 0 | 32 | 12,458 | 204,878 | 2,757 | 2.0 | 2.8 | 65.9 | 68.7 | 0.00 | 0.00 | I couldn't get SmartAsset's estimate. The income tax calculator and the Taxes section both fail to load with "Application error: a client-side exception has occ |
