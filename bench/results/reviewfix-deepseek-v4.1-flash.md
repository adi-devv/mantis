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
| Correct | 2 / 2 | 2 / 2 | 2 / 2 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 7 | 10 | 22 |
| Sarvam API attempts (including retries) | 9 | 11 | 24 |
| Sarvam HTTP 429 responses | 0 | 0 | 0 |
| MCP tool errors (including retries) | 0 | 0 | 0 |
| Browser observation text (observed chars) | 2,127 | 5,015 | 397 |
| Browser observation images (observed blocks) | 0 | 0 | 9 |
| Normal input tokens (total) | 4,243 | 6,800 | 12,569 |
| Cache-write input tokens (total) | 0 | 0 | 0 |
| Cache-read input tokens (total) | 14,336 | 27,392 | 66,304 |
| Output tokens (total) | 433 | 597 | 1,542 |
| Total input tokens incl. cache (legacy) | 18,579 | 34,192 | 78,873 |
| MCP startup (total, s) | 4.0 | 4.0 | 4.0 |
| CLI startup (total, s) | 0.0 | 0.0 | 0.0 |
| CLI execution (total, s) | 10.8 | 53.7 | 71.8 |
| CLI wall (total, s) | 10.8 | 53.7 | 71.8 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.3 | 0.3 | 0.3 |
| Harness capture (total, s) | 1.4 | 7.1 | 1.3 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |
| Cost estimate (INR; including retries) | 0.16 | 0.25 | 0.51 |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | API attempts | 429s | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `form-subscribe` | Mantis | 1 | success | 1 | 5 | 0 | 6 | 0 | 1,333 | 0 | 3,277 | 0 | 9,472 | 298 | 2.0 | 0.0 | 7.2 | 7.2 | 0.00 | 0.13 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 6 | 0 | 2,710 | 0 | 4,693 | 0 | 14,336 | 368 | 2.0 | 0.0 | 13.2 | 13.2 | 0.00 | 0.13 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Screenshots (click by x,y) | 1 | success | 1 | 18 | 0 | 19 | 0 | 281 | 7 | 10,149 | 0 | 61,952 | 1,319 | 2.0 | 0.0 | 63.8 | 63.8 | 0.00 | 0.14 | Subscribed from Canada (weekly: yes). |
| `pricing-team` | Mantis | 1 | success | 1 | 2 | 0 | 3 | 0 | 794 | 0 | 966 | 0 | 4,864 | 135 | 2.0 | 0.0 | 3.6 | 3.6 | 0.00 | 0.13 | $29 per month |
| `pricing-team` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 5 | 0 | 2,305 | 0 | 2,107 | 0 | 13,056 | 229 | 2.0 | 0.0 | 40.5 | 40.5 | 0.00 | 0.14 | $29 per month |
| `pricing-team` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 5 | 0 | 116 | 2 | 2,420 | 0 | 4,352 | 223 | 2.0 | 0.0 | 8.0 | 8.0 | 0.00 | 0.13 | $29 per month |
