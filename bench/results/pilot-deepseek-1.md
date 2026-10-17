# Real-agent eval

> Sarvam V2 API tool loop (requested model `deepseek-v4.1-flash`) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Sarvam completion responses; cost is an INR estimate from published prices; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-17; runs per task and approach: 1; 2 runs in parallel.
- Scope: 2 tasks × 3 approaches × 1 runs = 6 logical runs; 6 recorded so far; 6 total attempts including retries.
- Sarvam runtime: Sarvam V2 API; resolved model(s): deepseekv4.1-flash.
- MCP startup (spawn + warm-up) is separate from Sarvam execution time. Execution runs from the first API request to the final response. Fixture verification and cleanup are timed separately. These include contention from parallel runs.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Claude-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. 
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 2 / 2 | 1 / 2 | 2 / 2 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 1 | 0 |
| Tool calls (including retries) | 7 | 108 | 20 |
| Sarvam API attempts (including retries) | 8 | 108 | 22 |
| Sarvam HTTP 429 responses | 0 | 0 | 0 |
| MCP tool errors (including retries) | 0 | 108 | 0 |
| Browser observation text (observed chars) | 4,306 | 17,796 | 335 |
| Browser observation images (observed blocks) | 0 | 0 | 8 |
| Normal input tokens (total) | 4,929 | 42,594 | 11,441 |
| Cache-write input tokens (total) | 0 | 0 | 0 |
| Cache-read input tokens (total) | 14,592 | 1,060,224 | 62,720 |
| Output tokens (total) | 396 | 9,828 | 1,191 |
| Total input tokens incl. cache (legacy) | 19,521 | 1,102,818 | 74,161 |
| MCP startup (total, s) | 4.0 | 4.0 | 4.0 |
| CLI startup (total, s) | 0.0 | 0.0 | 0.0 |
| CLI execution (total, s) | 13.8 | 319.8 | 71.8 |
| CLI wall (total, s) | 13.8 | 319.8 | 71.8 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.1 | 0.1 | 0.1 |
| Harness capture (total, s) | 1.1 | 52.9 | 1.4 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |
| Cost estimate (INR; including retries) | 0.17 | 2.63 | 0.44 |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | API attempts | 429s | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `form-subscribe` | Mantis | 1 | success | 1 | 6 | 0 | 6 | 0 | 1,333 | 0 | 3,678 | 0 | 10,880 | 321 | 2.0 | 0.0 | 7.2 | 7.2 | 0.00 | 0.07 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Accessibility tree (Playwright MCP) | 1 | cli_error | 1 | 100 | 100 | 100 | 0 | 16,500 | 0 | 37,418 | 0 | 1,038,848 | 8,966 | 2.0 | 0.0 | 272.8 | 272.8 | 0.00 | 0.06 | Agent step budget exhausted. |
| `form-subscribe` | Screenshots (click by x,y) | 1 | success | 1 | 18 | 0 | 19 | 0 | 281 | 7 | 10,102 | 0 | 60,928 | 1,084 | 2.0 | 0.0 | 65.7 | 65.7 | 0.00 | 0.07 | Subscribed from Canada (weekly: yes). |
| `wikipedia-birthdate` | Mantis | 1 | success | 1 | 1 | 0 | 2 | 0 | 2,973 | 0 | 1,251 | 0 | 3,712 | 75 | 2.0 | 0.0 | 6.6 | 6.6 | 0.00 | 0.07 | 23 June 1912 |
| `wikipedia-birthdate` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 8 | 8 | 8 | 0 | 1,296 | 0 | 5,176 | 0 | 21,376 | 862 | 2.0 | 0.0 | 47.0 | 47.0 | 0.00 | 0.06 | 23 June 1912 |
| `wikipedia-birthdate` | Screenshots (click by x,y) | 1 | success | 1 | 2 | 0 | 3 | 0 | 54 | 1 | 1,339 | 0 | 1,792 | 107 | 2.0 | 0.0 | 6.0 | 6.0 | 0.00 | 0.06 | 23 June 1912 |
