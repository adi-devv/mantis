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
| Correct | 2 / 2 | 1 / 2 | 1 / 2 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 1 | 1 |
| Tool calls (including retries) | 4 | 12 | 2 |
| Sarvam API attempts (including retries) | 6 | 14 | 3 |
| Sarvam HTTP 429 responses | 0 | 0 | 0 |
| MCP tool errors (including retries) | 0 | 12 | 0 |
| Browser observation text (observed chars) | 3,335 | 1,860 | 54 |
| Browser observation images (observed blocks) | 0 | 0 | 1 |
| Normal input tokens (total) | 5,241 | 6,256 | unknown |
| Cache-write input tokens (total) | 0 | 0 | unknown |
| Cache-read input tokens (total) | 3,968 | 28,640 | unknown |
| Output tokens (total) | 197 | 684 | unknown |
| Total input tokens incl. cache (legacy) | 9,209 | 34,896 | unknown |
| MCP startup (total, s) | 4.0 | 4.0 | 4.0 |
| CLI startup (total, s) | 0.0 | 0.0 | unknown |
| CLI execution (total, s) | 39.4 | 23.0 | unknown |
| CLI wall (total, s) | 39.4 | 23.0 | unknown |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.1 | 0.1 | 0.1 |
| Harness capture (total, s) | 1.1 | 3.7 | 2.8 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |
| Cost estimate (INR; including retries) | 0.24 | 0.57 | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | API attempts | 429s | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `form-subscribe` | Mantis | 1 | success | 1 | 3 | 0 | 4 | 0 | 624 | 0 | 2,946 | 0 | 2,848 | 139 | 2.0 | 0.0 | 3.2 | 3.2 | 0.00 | 0.07 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Accessibility tree (Playwright MCP) | 1 | wrong_answer | 1 | 6 | 6 | 7 | 0 | 918 | 0 | 3,242 | 0 | 14,656 | 437 | 2.0 | 0.0 | 3.3 | 3.3 | 0.00 | 0.08 | fixture check failed (0 observations) |
| `form-subscribe` | Screenshots (click by x,y) | 1 | crash | 1 | 0 | 0 | 0 | 0 | 0 | 0 | unknown | unknown | unknown | unknown | 2.0 | unknown | unknown | unknown | 0.00 | 0.07 | Sarvam HTTP 400 |
| `wikipedia-birthdate` | Mantis | 1 | success | 1 | 1 | 0 | 2 | 0 | 2,711 | 0 | 2,295 | 0 | 1,120 | 58 | 2.0 | 0.0 | 36.3 | 36.3 | 0.00 | 0.06 | 23 June 1912 |
| `wikipedia-birthdate` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 6 | 7 | 0 | 942 | 0 | 3,014 | 0 | 13,984 | 247 | 2.0 | 0.0 | 19.7 | 19.7 | 0.00 | 0.06 | June 23, 1912 |
| `wikipedia-birthdate` | Screenshots (click by x,y) | 1 | success | 1 | 2 | 0 | 3 | 0 | 54 | 1 | 1,182 | 0 | 352 | 69 | 2.0 | 0.0 | 2.5 | 2.5 | 0.00 | 0.06 | 23 June 1912 |
