# Real-agent eval

> Claude Code (`claude -p`) (requested model `claude-haiku-5-5`) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Claude stream; reported cost is retained; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 3; 6 runs in parallel.
- Scope: 4 tasks × 3 approaches × 3 runs = 36 logical runs; 36 recorded so far; 36 total attempts including retries.
- Claude CLI version: 2.1.161 (Claude Code); resolved model(s): claude-haiku-5-5.
- MCP startup (spawn + warm-up) is separate from Claude CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first init event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Claude-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. 
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 12 / 12 | 12 / 12 | 12 / 12 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 285 | 332 | 595 |
| MCP tool errors (including retries) | 0 | 2 | 0 |
| Browser observation text (observed chars) | 186,933 | 457,841 | 9,950 |
| Browser observation images (observed blocks) | 0 | 0 | 190 |
| Normal input tokens (total) | 382 | 376 | 428 |
| Cache-write input tokens (total) | 198,441 | 331,092 | 396,493 |
| Cache-read input tokens (total) | 2,923,668 | 4,583,800 | 4,564,240 |
| Output tokens (total) | 30,917 | 40,508 | 52,610 |
| Total input tokens incl. cache (legacy) | 3,122,491 | 4,915,268 | 4,961,161 |
| MCP startup (total, s) | 24.3 | 24.3 | 24.3 |
| CLI startup (total, s) | 19.8 | 19.1 | 19.7 |
| CLI execution (total, s) | 424.6 | 503.4 | 592.6 |
| CLI wall (total, s) | 444.4 | 522.5 | 612.3 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 2.0 | 2.2 | 2.0 |
| Cost estimate (USD; including retries) | 2.09 | 3.23 | 3.65 |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `long-shop` | Mantis | 1 | success | 1 | 27 | 0 | 7,361 | 0 | 42 | 12,629 | 295,668 | 2,803 | 2.1 | 4.0 | 42.6 | 46.6 | 0.00 | 0.20 | Order #S-1814; total charged $101.29 |
| `long-shop` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 40 | 0 | 45,254 | 0 | 44 | 33,007 | 577,013 | 4,212 | 2.1 | 3.8 | 63.8 | 67.6 | 0.00 | 0.22 | Order number S-1814; total charged $101.29 |
| `long-shop` | Screenshots (click by x,y) | 1 | success | 1 | 69 | 0 | 904 | 23 | 50 | 44,208 | 638,992 | 5,109 | 2.1 | 3.8 | 55.3 | 59.1 | 0.00 | 0.16 | Order #S-1814; total charged $101.29 |
| `long-shop` | Mantis | 2 | success | 1 | 27 | 0 | 8,287 | 0 | 38 | 13,293 | 279,685 | 2,809 | 2.1 | 4.0 | 39.5 | 43.5 | 0.00 | 0.16 | Order #S-1814; total charged $101.29 |
| `long-shop` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 42 | 1 | 45,150 | 0 | 58 | 33,304 | 773,778 | 4,912 | 2.1 | 3.8 | 68.4 | 72.2 | 0.00 | 0.21 | Order S-1814; total charged $101.29 |
| `long-shop` | Screenshots (click by x,y) | 2 | success | 1 | 61 | 0 | 881 | 20 | 44 | 39,503 | 509,697 | 4,799 | 2.1 | 3.7 | 51.2 | 54.9 | 0.00 | 0.16 | Order #S-1814; total charged $101.29 |
| `long-shop` | Mantis | 3 | success | 1 | 36 | 0 | 16,282 | 0 | 40 | 18,350 | 317,032 | 3,324 | 2.0 | 1.2 | 43.8 | 45.0 | 0.00 | 0.16 | Order #S-1814; total charged $101.29 |
| `long-shop` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 38 | 1 | 55,041 | 0 | 44 | 37,383 | 627,633 | 4,242 | 2.0 | 1.2 | 59.1 | 60.4 | 0.00 | 0.19 | Order #S-1814, total charged $101.29 |
| `long-shop` | Screenshots (click by x,y) | 3 | success | 1 | 63 | 0 | 863 | 22 | 48 | 42,387 | 590,560 | 4,829 | 2.0 | 1.1 | 67.9 | 69.0 | 0.00 | 0.15 | Order #S-1814; total charged $101.29 |
| `long-admin` | Mantis | 1 | success | 1 | 20 | 0 | 18,333 | 0 | 30 | 18,171 | 269,427 | 3,356 | 2.0 | 1.1 | 38.3 | 39.5 | 0.00 | 0.15 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 20 | 0 | 48,509 | 0 | 28 | 31,139 | 355,154 | 3,699 | 2.0 | 1.2 | 41.8 | 43.0 | 0.00 | 0.17 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Screenshots (click by x,y) | 1 | success | 1 | 56 | 0 | 714 | 18 | 40 | 36,792 | 441,837 | 5,116 | 2.0 | 1.2 | 71.2 | 72.4 | 0.00 | 0.23 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Mantis | 2 | success | 1 | 17 | 0 | 26,592 | 0 | 24 | 21,496 | 215,920 | 2,809 | 2.0 | 1.1 | 31.4 | 32.5 | 0.00 | 0.16 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 22 | 0 | 39,427 | 0 | 28 | 27,644 | 358,692 | 4,054 | 2.0 | 1.1 | 43.7 | 44.9 | 0.00 | 0.17 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Screenshots (click by x,y) | 2 | success | 1 | 39 | 0 | 506 | 15 | 34 | 33,025 | 339,645 | 6,089 | 2.0 | 1.1 | 48.7 | 49.8 | 0.00 | 0.19 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Mantis | 3 | success | 1 | 17 | 0 | 31,154 | 0 | 22 | 23,605 | 202,843 | 2,717 | 2.0 | 1.2 | 26.9 | 28.1 | 0.00 | 0.16 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 20 | 0 | 77,139 | 0 | 30 | 43,272 | 456,422 | 3,270 | 2.0 | 1.2 | 39.0 | 40.2 | 0.00 | 0.18 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Screenshots (click by x,y) | 3 | success | 1 | 37 | 0 | 506 | 13 | 30 | 30,076 | 273,182 | 6,063 | 2.0 | 1.3 | 45.8 | 47.1 | 0.00 | 0.18 | Saved 6 changes. Change set C-5365. |
| `long-onboard` | Mantis | 1 | success | 1 | 32 | 0 | 8,280 | 0 | 36 | 12,964 | 252,488 | 2,658 | 2.0 | 1.1 | 35.5 | 36.6 | 0.00 | 0.16 | W-3248 |
| `long-onboard` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 32 | 0 | 25,994 | 0 | 26 | 22,170 | 265,386 | 3,201 | 2.0 | 1.1 | 38.9 | 40.0 | 0.00 | 0.16 | W-3248 |
| `long-onboard` | Screenshots (click by x,y) | 1 | success | 1 | 67 | 0 | 1,066 | 18 | 40 | 37,304 | 449,316 | 4,889 | 2.0 | 1.2 | 44.5 | 45.8 | 0.00 | 0.19 | W-3248 |
| `long-onboard` | Mantis | 2 | success | 1 | 31 | 0 | 8,651 | 0 | 38 | 12,820 | 266,374 | 2,377 | 2.0 | 1.2 | 32.9 | 34.1 | 0.00 | 0.15 | W-3248 |
| `long-onboard` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 32 | 0 | 25,886 | 0 | 28 | 22,111 | 293,965 | 3,306 | 2.0 | 1.1 | 43.6 | 44.8 | 0.00 | 0.17 | W-3248 |
| `long-onboard` | Screenshots (click by x,y) | 2 | success | 1 | 67 | 0 | 1,066 | 18 | 40 | 37,242 | 448,593 | 4,811 | 2.0 | 1.1 | 62.0 | 63.1 | 0.00 | 0.19 | W-3248 |
| `long-onboard` | Mantis | 3 | success | 1 | 35 | 0 | 11,147 | 0 | 36 | 14,725 | 265,562 | 2,656 | 2.0 | 1.2 | 36.9 | 38.1 | 0.00 | 0.16 | W-3248 |
| `long-onboard` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 32 | 0 | 25,391 | 0 | 26 | 21,866 | 264,608 | 3,113 | 2.0 | 1.2 | 40.7 | 41.9 | 0.00 | 0.16 | W-3248 |
| `long-onboard` | Screenshots (click by x,y) | 3 | success | 1 | 70 | 0 | 1,098 | 19 | 42 | 39,086 | 490,388 | 5,210 | 2.0 | 1.2 | 80.9 | 82.1 | 0.00 | 0.14 | W-3248 |
| `long-laptops` | Mantis | 1 | success | 1 | 17 | 0 | 18,454 | 0 | 32 | 17,867 | 256,591 | 2,207 | 2.0 | 1.1 | 43.9 | 45.0 | 0.00 | 0.27 | Nimbus 14, 1.35 kg |
| `long-laptops` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 16 | 0 | 28,054 | 0 | 22 | 22,010 | 214,633 | 2,179 | 2.0 | 1.1 | 23.0 | 24.1 | 0.00 | 0.27 | Nimbus 14, 1.35 kg |
| `long-laptops` | Screenshots (click by x,y) | 1 | success | 1 | 22 | 0 | 782 | 8 | 20 | 19,031 | 127,818 | 1,969 | 2.0 | 1.1 | 21.0 | 22.1 | 0.00 | 0.14 | Nimbus 14, 1.35 kg |
| `long-laptops` | Mantis | 2 | success | 1 | 14 | 0 | 17,445 | 0 | 20 | 16,823 | 134,884 | 1,396 | 2.0 | 1.1 | 21.4 | 22.5 | 0.00 | 0.16 | Nimbus 14, 1.35 kg |
| `long-laptops` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 16 | 0 | 20,660 | 0 | 22 | 18,291 | 204,958 | 2,100 | 2.0 | 1.1 | 21.2 | 22.3 | 0.00 | 0.15 | Nimbus 14, 1.35 kg |
| `long-laptops` | Screenshots (click by x,y) | 2 | success | 1 | 22 | 0 | 782 | 8 | 20 | 18,948 | 127,266 | 1,912 | 2.0 | 1.5 | 19.1 | 20.6 | 0.00 | 0.16 | Nimbus 14, 1.35 kg |
| `long-laptops` | Mantis | 3 | success | 1 | 12 | 0 | 14,947 | 0 | 24 | 15,698 | 167,194 | 1,805 | 2.0 | 1.3 | 31.6 | 32.9 | 0.00 | 0.16 | Nimbus 14, 1.35 kg |
| `long-laptops` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 22 | 0 | 21,336 | 0 | 20 | 18,895 | 191,558 | 2,220 | 2.0 | 1.1 | 20.0 | 21.1 | 0.00 | 0.18 | Nimbus 14, 1.35 kg |
| `long-laptops` | Screenshots (click by x,y) | 3 | success | 1 | 22 | 0 | 782 | 8 | 20 | 18,891 | 126,946 | 1,814 | 2.0 | 1.2 | 25.1 | 26.3 | 0.00 | 0.13 | Nimbus 14, 1.35 kg |
