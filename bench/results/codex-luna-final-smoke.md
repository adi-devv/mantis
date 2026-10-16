# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 3; 6 runs in parallel.
- Scope: 7 tasks × 1 approaches × 3 runs = 21 logical runs; 21 recorded so far; 21 total attempts including retries.
- Codex CLI version: codex-cli 0.162.0-alpha.17.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis |
|---|---:|
| Correct | 21 / 21 |
| Connection-failure attempts | 0 |
| Logical runs ending in connection failure | 0 |
| Other attempted failures | 0 |
| Tool calls (including retries) | 181 |
| MCP tool errors (including retries) | 0 |
| Browser observation text (observed chars) | 126,760 |
| Browser observation images (observed blocks) | 0 |
| Normal input tokens (total) | 351,598 |
| Cache-write input tokens (total) | 0 |
| Cache-read input tokens (total) | 2,392,064 |
| Output tokens (total) | 8,653 |
| Total input tokens incl. cache (legacy) | 2,743,662 |
| MCP startup (total, s) | 43.3 |
| CLI startup (total, s) | 12.5 |
| CLI execution (total, s) | 604.1 |
| CLI wall (total, s) | 616.7 |
| Fixture verification (total, s) | 0.0 |
| Cleanup (total, s) | 5.1 |
| Cost estimate (USD; including retries) | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `checkout-steps` | Mantis | 1 | success | 1 | 9 | 0 | 1,577 | 0 | 12,712 | 0 | 129,536 | 427 | 2.1 | 1.1 | 27.8 | 28.9 | 0.00 | 0.33 | #A1042, $27.50 |
| `checkout-steps` | Mantis | 2 | success | 1 | 8 | 0 | 1,319 | 0 | 18,620 | 0 | 110,848 | 438 | 2.1 | 1.0 | 23.5 | 24.5 | 0.00 | 0.26 | A1042, $27.50 |
| `checkout-steps` | Mantis | 3 | success | 1 | 9 | 0 | 1,577 | 0 | 19,345 | 0 | 98,176 | 404 | 2.1 | 1.0 | 18.8 | 19.8 | 0.00 | 0.19 | Order #A1042; total charged: $27.50. |
| `article-deep-fact` | Mantis | 1 | success | 1 | 1 | 0 | 4,713 | 0 | 7,868 | 0 | 35,328 | 162 | 2.1 | 1.0 | 9.9 | 10.9 | 0.00 | 0.32 | 1874 |
| `article-deep-fact` | Mantis | 2 | success | 1 | 1 | 0 | 4,713 | 0 | 10,316 | 0 | 32,896 | 166 | 2.1 | 1.0 | 10.3 | 11.2 | 0.00 | 0.27 | 1874 |
| `article-deep-fact` | Mantis | 3 | success | 1 | 1 | 0 | 4,713 | 0 | 6,210 | 0 | 36,992 | 161 | 2.1 | 1.0 | 15.6 | 16.5 | 0.00 | 0.18 | 1874 |
| `churned-max` | Mantis | 1 | success | 1 | 1 | 0 | 5,534 | 0 | 23,809 | 0 | 20,480 | 182 | 2.0 | 0.8 | 17.0 | 17.8 | 0.00 | 0.30 | Acme 6 — $9,950 |
| `churned-max` | Mantis | 2 | success | 1 | 1 | 0 | 5,534 | 0 | 16,253 | 0 | 28,032 | 178 | 2.0 | 0.7 | 19.2 | 19.8 | 0.00 | 0.20 | Acme 6 — $9,950 |
| `churned-max` | Mantis | 3 | success | 1 | 1 | 0 | 5,534 | 0 | 8,977 | 0 | 35,328 | 186 | 2.0 | 0.2 | 9.5 | 9.8 | 0.00 | 0.25 | Acme 6 — $9,950 |
| `feed-scroll` | Mantis | 1 | success | 1 | 10 | 0 | 6,287 | 0 | 23,904 | 0 | 139,008 | 464 | 2.0 | 0.3 | 34.3 | 34.6 | 0.00 | 0.27 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Mantis | 2 | success | 1 | 10 | 0 | 4,826 | 0 | 21,853 | 0 | 138,112 | 458 | 2.0 | 0.4 | 43.5 | 43.9 | 0.00 | 0.40 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Mantis | 3 | success | 1 | 9 | 0 | 3,782 | 0 | 20,120 | 0 | 124,800 | 437 | 2.0 | 0.6 | 44.0 | 44.6 | 0.00 | 0.24 | The meeting moved to Thursday at noon. |
| `chart-march` | Mantis | 1 | success | 1 | 3 | 0 | 460 | 0 | 7,332 | 0 | 58,880 | 210 | 2.2 | 0.4 | 11.9 | 12.3 | 0.00 | 0.20 | 42 units |
| `chart-march` | Mantis | 2 | success | 1 | 2 | 0 | 340 | 0 | 5,352 | 0 | 48,768 | 185 | 2.2 | 0.3 | 10.5 | 10.8 | 0.00 | 0.25 | 42 units |
| `chart-march` | Mantis | 3 | success | 1 | 2 | 0 | 340 | 0 | 6,860 | 0 | 47,232 | 179 | 2.0 | 0.3 | 11.5 | 11.7 | 0.00 | 0.22 | 42 units |
| `long-shop` | Mantis | 1 | success | 1 | 24 | 0 | 7,753 | 0 | 26,551 | 0 | 245,120 | 809 | 2.0 | 0.4 | 37.3 | 37.7 | 0.00 | 0.25 | Order #S-1814, $101.29 |
| `long-shop` | Mantis | 2 | success | 1 | 25 | 0 | 8,046 | 0 | 44,472 | 0 | 353,920 | 923 | 2.0 | 0.4 | 55.3 | 55.7 | 0.00 | 0.19 | Order #S-1814, total charged $101.29. |
| `long-shop` | Mantis | 3 | success | 1 | 27 | 0 | 10,117 | 0 | 14,852 | 0 | 293,632 | 929 | 2.0 | 0.4 | 109.0 | 109.4 | 0.00 | 0.14 | Order #S-1814; $101.29 |
| `long-laptops` | Mantis | 1 | success | 1 | 14 | 0 | 16,789 | 0 | 16,734 | 0 | 92,160 | 519 | 2.0 | 0.5 | 21.1 | 21.6 | 0.00 | 0.22 | Nimbus 14, 1.35 kg |
| `long-laptops` | Mantis | 2 | success | 1 | 9 | 0 | 13,729 | 0 | 11,518 | 0 | 90,112 | 470 | 2.0 | 0.4 | 39.9 | 40.3 | 0.00 | 0.20 | Nimbus 14, 1.35 kg |
| `long-laptops` | Mantis | 3 | success | 1 | 14 | 0 | 19,077 | 0 | 27,940 | 0 | 232,704 | 766 | 2.0 | 0.4 | 34.2 | 34.6 | 0.00 | 0.21 | Nimbus 14, 1.35 kg |
