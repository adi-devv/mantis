# Real-agent eval

> Sarvam V2 API tool loop (requested model `gemma-4-31b`) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Sarvam completion responses; cost is an INR estimate from published prices; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-17; runs per task and approach: 1; 2 runs in parallel.
- Scope: 2 tasks × 3 approaches × 1 runs = 6 logical runs; 6 recorded so far; 6 total attempts including retries.
- Sarvam runtime: Sarvam V2 API; resolved model(s): gemma4.
- MCP startup (spawn + warm-up) is separate from Sarvam execution time. Execution runs from the first API request to the final response. Fixture verification and cleanup are timed separately. These include contention from parallel runs.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Claude-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. 
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 2 / 2 | 2 / 2 | 1 / 2 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 1 |
| Tool calls (including retries) | 5 | 10 | 4 |
| Sarvam API attempts (including retries) | 7 | 10 | 5 |
| Sarvam HTTP 429 responses | 0 | 0 | 0 |
| MCP tool errors (including retries) | 0 | 0 | 0 |
| Browser observation text (observed chars) | 1,418 | 5,015 | 116 |
| Browser observation images (observed blocks) | 0 | 0 | 2 |
| Normal input tokens (total) | 3,497 | 9,939 | unknown |
| Cache-write input tokens (total) | 0 | 0 | unknown |
| Cache-read input tokens (total) | 6,784 | 17,408 | unknown |
| Output tokens (total) | 240 | 339 | unknown |
| Total input tokens incl. cache (legacy) | 10,281 | 27,347 | unknown |
| MCP startup (total, s) | 4.0 | 4.0 | 4.0 |
| CLI startup (total, s) | 0.0 | 0.0 | unknown |
| CLI execution (total, s) | 5.7 | 42.7 | unknown |
| CLI wall (total, s) | 5.7 | 42.7 | unknown |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.3 | 0.3 | 0.3 |
| Harness capture (total, s) | 0.9 | 6.0 | 3.0 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |
| Cost estimate (INR; including retries) | 0.21 | 0.55 | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | API attempts | 429s | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `form-subscribe` | Mantis | 1 | success | 1 | 3 | 0 | 4 | 0 | 624 | 0 | 1,742 | 0 | 4,128 | 139 | 2.0 | 0.0 | 2.5 | 2.5 | 0.00 | 0.14 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 5 | 0 | 2,710 | 0 | 3,668 | 0 | 10,240 | 199 | 2.0 | 0.0 | 4.2 | 4.2 | 0.00 | 0.13 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Screenshots (click by x,y) | 1 | crash | 1 | 0 | 0 | 0 | 0 | 0 | 0 | unknown | unknown | unknown | unknown | 2.0 | unknown | unknown | unknown | 0.00 | 0.13 | Sarvam HTTP 400 |
| `pricing-team` | Mantis | 1 | success | 1 | 2 | 0 | 3 | 0 | 794 | 0 | 1,755 | 0 | 2,656 | 101 | 2.0 | 0.0 | 3.2 | 3.2 | 0.00 | 0.12 | $29 per month |
| `pricing-team` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 5 | 0 | 2,305 | 0 | 6,271 | 0 | 7,168 | 140 | 2.0 | 0.0 | 38.5 | 38.5 | 0.00 | 0.13 | $29 per month |
| `pricing-team` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 5 | 0 | 116 | 2 | 2,145 | 0 | 1,792 | 120 | 2.0 | 0.0 | 10.3 | 10.3 | 0.00 | 0.13 | $29 per month |
