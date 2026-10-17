# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-17; runs per task and approach: 1; 4 runs in parallel.
- Scope: 4 tasks × 1 approaches × 1 runs = 4 logical runs; 4 recorded so far; 4 total attempts including retries.
- Codex CLI version: codex-cli 0.163.0-alpha.10.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis |
|---|---:|
| Correct | 3 / 4 |
| Connection-failure attempts | 0 |
| Logical runs ending in connection failure | 0 |
| Other attempted failures | 1 |
| Tool calls (including retries) | 40 |
| MCP tool errors (including retries) | 3 |
| Browser observation text (observed chars) | 100,517 |
| Browser observation images (observed blocks) | 1 |
| Normal input tokens (total) | 103,035 |
| Cache-write input tokens (total) | 0 |
| Cache-read input tokens (total) | 684,416 |
| Output tokens (total) | 3,267 |
| Total input tokens incl. cache (legacy) | 787,451 |
| MCP startup (total, s) | 8.2 |
| CLI startup (total, s) | 2.4 |
| CLI execution (total, s) | 140.4 |
| CLI wall (total, s) | 142.7 |
| Fixture verification (total, s) | 0.0 |
| Cleanup (total, s) | 0.7 |
| Harness capture (total, s) | 7.9 |
| Cost estimate (USD; including retries) | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `long-laptops` | Mantis | 1 | wrong_answer | 1 | 6 | 0 | 8,945 | 0 | 17,350 | 0 | 98,816 | 503 | 2.0 | 0.6 | 17.3 | 17.9 | 0.00 | 0.22 | fixture check failed (9 observations) |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 9 | 1 | 31,899 | 0 | 41,851 | 0 | 130,304 | 641 | 2.0 | 0.6 | 35.7 | 36.3 | 0.00 | 0.14 | I couldn’t complete the cart step. The current page shows search results for **“women’s black swimsuit”**: Speedo reports **1,000 results**, including several b |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 20 | 1 | 31,514 | 1 | 29,917 | 0 | 361,984 | 1,304 | 2.0 | 0.6 | 54.5 | 55.1 | 0.00 | 0.14 | Google Maps shows **Global Gas Station**, 89 St Nicholas Pl, New York, NY 10032, rated **4.3 stars from 103 reviews**. The review breakdown shown on the page is |
| `ade4c09ad3fdb1607209750924cd232f` | Mantis | 1 | success | 1 | 5 | 1 | 28,159 | 0 | 13,917 | 0 | 93,312 | 819 | 2.1 | 0.6 | 32.9 | 33.4 | 0.00 | 0.19 | FlightAware’s AeroAPI page lists three plans: Personal, Standard, and Premium. The comparison below reflects the plan details currently shown on the page. \| Pl |
