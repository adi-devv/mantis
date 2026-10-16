# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 6; 6 runs in parallel.
- Scope: 1 tasks × 1 approaches × 6 runs = 6 logical runs; 6 recorded so far; 6 total attempts including retries.
- Codex CLI version: codex-cli 0.162.0-alpha.17.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis |
|---|---:|
| Correct | 4 / 6 |
| Connection-failure attempts | 0 |
| Logical runs ending in connection failure | 0 |
| Other attempted failures | 2 |
| Tool calls (including retries) | 59 |
| MCP tool errors (including retries) | 0 |
| Browser observation text (observed chars) | 83,487 |
| Browser observation images (observed blocks) | 0 |
| Normal input tokens (total) | 102,125 |
| Cache-write input tokens (total) | 0 |
| Cache-read input tokens (total) | 641,792 |
| Output tokens (total) | 3,139 |
| Total input tokens incl. cache (legacy) | 743,917 |
| MCP startup (total, s) | 12.5 |
| CLI startup (total, s) | 5.2 |
| CLI execution (total, s) | 210.2 |
| CLI wall (total, s) | 215.5 |
| Fixture verification (total, s) | 0.0 |
| Cleanup (total, s) | 1.3 |
| Cost estimate (USD; including retries) | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `long-laptops` | Mantis | 1 | wrong_answer | 1 | 6 | 0 | 8,945 | 0 | 10,176 | 0 | 105,856 | 473 | 2.1 | 0.9 | 21.2 | 22.1 | 0.00 | 0.35 | fixture check failed (9 observations) |
| `long-laptops` | Mantis | 2 | success | 1 | 15 | 0 | 19,975 | 0 | 11,801 | 0 | 76,544 | 425 | 2.1 | 0.9 | 39.1 | 40.0 | 0.00 | 0.19 | Nimbus 14, 1.35 kg |
| `long-laptops` | Mantis | 3 | success | 1 | 9 | 0 | 13,729 | 0 | 34,336 | 0 | 83,968 | 594 | 2.1 | 0.9 | 25.0 | 25.9 | 0.00 | 0.20 | Nimbus 14, 1.35 kg |
| `long-laptops` | Mantis | 4 | wrong_answer | 1 | 6 | 0 | 8,159 | 0 | 9,676 | 0 | 105,600 | 444 | 2.1 | 0.9 | 46.4 | 47.2 | 0.00 | 0.17 | fixture check failed (11 observations) |
| `long-laptops` | Mantis | 5 | success | 1 | 14 | 0 | 19,077 | 0 | 24,175 | 0 | 163,840 | 667 | 2.1 | 0.8 | 32.0 | 32.8 | 0.00 | 0.18 | Nimbus 14, 1.35 kg |
| `long-laptops` | Mantis | 6 | success | 1 | 9 | 0 | 13,602 | 0 | 11,961 | 0 | 105,984 | 536 | 2.1 | 0.9 | 46.6 | 47.5 | 0.00 | 0.17 | Nimbus 14, 1.35 kg |
