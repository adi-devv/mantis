# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 3; 6 runs in parallel.
- Scope: 2 tasks × 1 approaches × 3 runs = 6 logical runs; 6 recorded so far; 6 total attempts including retries.
- Codex CLI version: codex-cli 0.162.0-alpha.17.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis |
|---|---:|
| Correct | 6 / 6 |
| Connection-failure attempts | 0 |
| Logical runs ending in connection failure | 0 |
| Other attempted failures | 0 |
| Tool calls (including retries) | 123 |
| MCP tool errors (including retries) | 0 |
| Browser observation text (observed chars) | 45,238 |
| Browser observation images (observed blocks) | 0 |
| Normal input tokens (total) | 148,092 |
| Cache-write input tokens (total) | 0 |
| Cache-read input tokens (total) | 1,691,904 |
| Output tokens (total) | 5,847 |
| Total input tokens incl. cache (legacy) | 1,839,996 |
| MCP startup (total, s) | 12.7 |
| CLI startup (total, s) | 6.7 |
| CLI execution (total, s) | 318.9 |
| CLI wall (total, s) | 325.6 |
| Fixture verification (total, s) | 0.0 |
| Cleanup (total, s) | 1.0 |
| Cost estimate (USD; including retries) | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `long-shop` | Mantis | 1 | success | 1 | 20 | 0 | 7,481 | 0 | 39,584 | 0 | 290,048 | 958 | 2.1 | 1.2 | 46.9 | 48.0 | 0.00 | 0.17 | #S-1814, $101.29 |
| `long-shop` | Mantis | 2 | success | 1 | 19 | 0 | 6,570 | 0 | 12,175 | 0 | 289,152 | 972 | 2.1 | 1.2 | 109.0 | 110.2 | 0.00 | 0.15 | Order #S-1814; $101.29 |
| `long-shop` | Mantis | 3 | success | 1 | 20 | 0 | 8,818 | 0 | 29,416 | 0 | 263,424 | 854 | 2.1 | 1.1 | 37.4 | 38.5 | 0.00 | 0.17 | Order #S-1814, $101.29 |
| `long-onboard` | Mantis | 1 | success | 1 | 20 | 0 | 6,760 | 0 | 19,648 | 0 | 322,432 | 1,069 | 2.1 | 1.1 | 42.9 | 44.0 | 0.00 | 0.15 | W-3248 |
| `long-onboard` | Mantis | 2 | success | 1 | 22 | 0 | 8,204 | 0 | 36,522 | 0 | 337,536 | 1,079 | 2.1 | 1.1 | 49.0 | 50.1 | 0.00 | 0.16 | W-3248 |
| `long-onboard` | Mantis | 3 | success | 1 | 22 | 0 | 7,405 | 0 | 10,747 | 0 | 189,312 | 915 | 2.2 | 1.0 | 33.8 | 34.8 | 0.00 | 0.23 | W-3248 |
