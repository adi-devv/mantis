# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 1; 6 runs in parallel.
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
| Correct | 4 / 4 |
| Connection-failure attempts | 0 |
| Logical runs ending in connection failure | 0 |
| Other attempted failures | 0 |
| Tool calls (including retries) | 61 |
| MCP tool errors (including retries) | 7 |
| Browser observation text (observed chars) | 134,778 |
| Browser observation images (observed blocks) | 1 |
| Normal input tokens (total) | 229,483 |
| Cache-write input tokens (total) | 0 |
| Cache-read input tokens (total) | 1,200,512 |
| Output tokens (total) | 3,956 |
| Total input tokens incl. cache (legacy) | 1,429,995 |
| MCP startup (total, s) | 8.2 |
| CLI startup (total, s) | 3.0 |
| CLI execution (total, s) | 402.9 |
| CLI wall (total, s) | 405.8 |
| Fixture verification (total, s) | 0.0 |
| Cleanup (total, s) | 0.9 |
| Cost estimate (USD; including retries) | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 27 | 5 | 85,482 | 0 | 82,775 | 0 | 687,744 | 1,528 | 2.0 | 0.8 | 143.2 | 143.9 | 0.00 | 0.18 | Added the black Women’s Muscleback One Piece swimsuit to your cart for **$55.00**, size **40** (the Large option shown in the catalog). The cart confirms quanti |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 11 | 0 | 13,551 | 0 | 37,815 | 0 | 161,920 | 885 | 2.0 | 0.7 | 47.8 | 48.5 | 0.00 | 0.28 | Global Gas Station at 89 St Nicholas Pl in Manhattan is rated 4.3 stars. I opened its Google Maps listing, but the listing panel did not expose a reviews contro |
| `1ab384fb3a791edfb410213cc6b82151_110325` | Mantis | 1 | success | 1 | 18 | 2 | 26,540 | 1 | 82,801 | 0 | 273,536 | 949 | 2.1 | 0.7 | 171.6 | 172.4 | 0.00 | 0.20 | I opened PhET’s **Build a Nucleus** simulation and selected **Decay Screen**. I couldn’t set the nucleus or show a decay result because the simulation controls  |
| `461ab9b0c7b20ac5f912704480979c65` | Mantis | 1 | success | 1 | 5 | 0 | 9,205 | 0 | 26,092 | 0 | 77,312 | 594 | 2.1 | 0.7 | 40.3 | 41.0 | 0.00 | 0.26 | I couldn’t locate the Rule 605 Market Center Files for July 2024. The NYSE site’s search box was disabled, and a Google search hit a CAPTCHA, so I stopped witho |
