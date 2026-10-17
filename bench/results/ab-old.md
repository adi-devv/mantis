# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 5; 6 runs in parallel.
- Scope: 4 tasks × 1 approaches × 5 runs = 20 logical runs; 3 recorded so far; 3 total attempts including retries.
- Codex CLI version: codex-cli 0.162.0-alpha.17.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis |
|---|---:|
| Correct | 0 / 3 |
| Connection-failure attempts | 0 |
| Logical runs ending in connection failure | 0 |
| Other attempted failures | 3 |
| Tool calls (including retries) | 17 |
| MCP tool errors (including retries) | 1 |
| Browser observation text (observed chars) | 8,538 |
| Browser observation images (observed blocks) | 0 |
| Normal input tokens (total) | unknown |
| Cache-write input tokens (total) | unknown |
| Cache-read input tokens (total) | unknown |
| Output tokens (total) | unknown |
| Total input tokens incl. cache (legacy) | unknown |
| MCP startup (total, s) | 6.2 |
| CLI startup (total, s) | 2.4 |
| CLI execution (total, s) | 59.5 |
| CLI wall (total, s) | 62.0 |
| Fixture verification (total, s) | 0.0 |
| Cleanup (total, s) | 0.8 |
| Cost estimate (USD; including retries) | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `long-shop` | Mantis | 1 | crash | 1 | 8 | 0 | 4,758 | 0 | unknown | unknown | unknown | unknown | 2.1 | 0.8 | 19.9 | 20.7 | 0.00 | 0.26 | codex CLI exited with code 4294967295 |
| `long-shop` | Mantis | 4 | crash | 1 | 1 | 1 | 54 | 0 | unknown | unknown | unknown | unknown | 2.1 | 0.8 | 20.1 | 20.9 | 0.00 | 0.25 | codex CLI exited with code 4294967295 |
| `long-shop` | Mantis | 5 | crash | 1 | 8 | 0 | 3,726 | 0 | unknown | unknown | unknown | unknown | 2.1 | 0.8 | 19.5 | 20.3 | 0.00 | 0.30 | codex CLI exited with code 4294967295 |
