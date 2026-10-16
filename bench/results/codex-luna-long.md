# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 3; 6 runs in parallel.
- Scope: 4 tasks × 3 approaches × 3 runs = 36 logical runs; 36 recorded so far; 36 total attempts including retries.
- Codex CLI version: codex-cli 0.162.0-alpha.17.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 12 / 12 | 10 / 12 | 9 / 12 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 2 | 3 |
| Tool calls (including retries) | 229 | 267 | 516 |
| MCP tool errors (including retries) | 0 | 8 | 6 |
| Browser observation text (observed chars) | 112,843 | 629,176 | 9,514 |
| Browser observation images (observed blocks) | 0 | 0 | 134 |
| Normal input tokens (total) | 340,090 | 462,204 | 393,790 |
| Cache-write input tokens (total) | 0 | 0 | 0 |
| Cache-read input tokens (total) | 2,242,560 | 4,363,392 | 4,213,760 |
| Output tokens (total) | 9,185 | 11,021 | 27,731 |
| Total input tokens incl. cache (legacy) | 2,582,650 | 4,825,596 | 4,607,550 |
| MCP startup (total, s) | 24.3 | 24.3 | 24.5 |
| CLI startup (total, s) | 4.7 | 4.9 | 4.8 |
| CLI execution (total, s) | 649.3 | 811.6 | 1186.7 |
| CLI wall (total, s) | 654.1 | 816.6 | 1191.5 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 2.6 | 2.4 | 2.3 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `long-shop` | Mantis | 1 | success | 1 | 25 | 0 | 8,820 | 0 | 42,872 | 0 | 285,952 | 949 | 2.1 | 1.0 | 47.9 | 48.9 | 0.00 | 0.20 | Order #S-1814; total charged: $101.29. |
| `long-shop` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 30 | 1 | 63,872 | 0 | 70,591 | 0 | 681,344 | 1,266 | 2.1 | 1.0 | 72.4 | 73.4 | 0.00 | 0.22 | Order #S-1814 — $101.29 |
| `long-shop` | Screenshots (click by x,y) | 1 | success | 1 | 63 | 1 | 964 | 18 | 48,248 | 0 | 426,624 | 2,680 | 2.1 | 0.9 | 130.7 | 131.7 | 0.00 | 0.19 | Order #S-1814; total charged: $101.29. |
| `long-shop` | Mantis | 2 | success | 1 | 26 | 0 | 8,876 | 0 | 36,528 | 0 | 248,960 | 1,006 | 2.1 | 0.9 | 79.4 | 80.3 | 0.00 | 0.17 | #S-1814, $101.29 |
| `long-shop` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 30 | 1 | 63,905 | 0 | 74,970 | 0 | 487,552 | 1,223 | 2.1 | 0.9 | 58.1 | 59.0 | 0.00 | 0.18 | Order #S-1814; $101.29 |
| `long-shop` | Screenshots (click by x,y) | 2 | success | 1 | 63 | 3 | 1,021 | 17 | 53,057 | 0 | 484,864 | 2,626 | 2.1 | 0.9 | 79.6 | 80.5 | 0.00 | 0.19 | Order #S-1814, $101.29 |
| `long-shop` | Mantis | 3 | success | 1 | 25 | 0 | 7,299 | 0 | 55,792 | 0 | 237,568 | 948 | 2.0 | 0.4 | 70.9 | 71.2 | 0.00 | 0.18 | Order #S-1814; total charged: $101.29. |
| `long-shop` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 30 | 1 | 63,872 | 0 | 34,523 | 0 | 675,584 | 1,254 | 2.0 | 0.4 | 148.3 | 148.7 | 0.00 | 0.21 | Order #S-1814; total charged $101.29. |
| `long-shop` | Screenshots (click by x,y) | 3 | success | 1 | 62 | 1 | 1,034 | 15 | 41,653 | 0 | 478,848 | 2,911 | 2.0 | 0.3 | 159.0 | 159.3 | 0.00 | 0.16 | Order #S-1814, $101.29 |
| `long-admin` | Mantis | 1 | success | 1 | 13 | 0 | 9,204 | 0 | 34,449 | 0 | 192,384 | 689 | 2.0 | 0.3 | 31.7 | 32.0 | 0.00 | 0.19 | “Saved 6 changes. Change set C-5365.” |
| `long-admin` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 14 | 0 | 59,935 | 0 | 52,598 | 0 | 208,384 | 717 | 2.0 | 0.3 | 54.4 | 54.6 | 0.00 | 0.18 | “Saved 6 changes. Change set C-5365.” |
| `long-admin` | Screenshots (click by x,y) | 1 | wrong_answer | 1 | 28 | 0 | 379 | 9 | 21,200 | 0 | 208,000 | 1,937 | 2.0 | 0.2 | 52.9 | 53.1 | 0.00 | 0.19 | answer did not match the expected result |
| `long-admin` | Mantis | 2 | success | 1 | 13 | 0 | 9,696 | 0 | 33,822 | 0 | 118,272 | 597 | 2.0 | 0.3 | 24.5 | 24.8 | 0.00 | 0.17 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 14 | 0 | 59,935 | 0 | 27,649 | 0 | 166,912 | 613 | 2.0 | 0.2 | 60.4 | 60.6 | 0.00 | 0.23 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Screenshots (click by x,y) | 2 | wrong_answer | 1 | 31 | 0 | 435 | 8 | 28,838 | 0 | 344,576 | 3,039 | 2.0 | 0.2 | 74.7 | 74.9 | 0.00 | 0.21 | fixture check failed (63 observations) |
| `long-admin` | Mantis | 3 | success | 1 | 12 | 0 | 8,782 | 0 | 15,912 | 0 | 191,232 | 685 | 2.0 | 0.2 | 123.9 | 124.2 | 0.00 | 0.37 | “Saved 6 changes. Change set C-5365.” |
| `long-admin` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 21 | 5 | 74,764 | 0 | 32,472 | 0 | 318,464 | 948 | 2.0 | 0.3 | 34.0 | 34.3 | 0.00 | 0.29 | Saved 6 changes. Change set C-5365. |
| `long-admin` | Screenshots (click by x,y) | 3 | success | 1 | 35 | 1 | 564 | 8 | 14,347 | 0 | 282,496 | 1,741 | 2.0 | 0.4 | 50.3 | 50.7 | 0.00 | 0.18 | Saved 6 changes. Change set C-5365. |
| `long-onboard` | Mantis | 1 | success | 1 | 28 | 0 | 6,639 | 0 | 35,325 | 0 | 315,648 | 1,016 | 2.0 | 0.4 | 114.5 | 114.9 | 0.00 | 0.17 | W-3248 |
| `long-onboard` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 31 | 0 | 50,162 | 0 | 62,949 | 0 | 641,536 | 1,319 | 2.0 | 0.3 | 143.5 | 143.8 | 0.00 | 0.19 | W-3248 |
| `long-onboard` | Screenshots (click by x,y) | 1 | success | 1 | 54 | 0 | 946 | 10 | 41,348 | 0 | 246,912 | 1,879 | 2.0 | 0.3 | 95.8 | 96.1 | 0.00 | 0.35 | W-3248 |
| `long-onboard` | Mantis | 2 | success | 1 | 31 | 0 | 10,685 | 0 | 11,656 | 0 | 208,128 | 813 | 2.0 | 0.2 | 38.9 | 39.2 | 0.00 | 0.44 | W-3248 |
| `long-onboard` | Accessibility tree (Playwright MCP) | 2 | success | 1 | 30 | 0 | 45,564 | 0 | 28,719 | 0 | 639,616 | 1,351 | 2.0 | 0.3 | 61.4 | 61.7 | 0.00 | 0.23 | W-3248 |
| `long-onboard` | Screenshots (click by x,y) | 2 | success | 1 | 57 | 0 | 927 | 11 | 45,547 | 0 | 204,032 | 3,152 | 2.0 | 0.2 | 69.0 | 69.2 | 0.00 | 0.17 | W-3248 |
| `long-onboard` | Mantis | 3 | success | 1 | 32 | 0 | 9,158 | 0 | 18,578 | 0 | 198,400 | 862 | 2.0 | 0.3 | 65.8 | 66.0 | 0.00 | 0.16 | W-3248 |
| `long-onboard` | Accessibility tree (Playwright MCP) | 3 | success | 1 | 31 | 0 | 50,162 | 0 | 26,696 | 0 | 361,984 | 1,140 | 2.0 | 0.5 | 117.2 | 117.6 | 0.00 | 0.14 | W-3248 |
| `long-onboard` | Screenshots (click by x,y) | 3 | success | 1 | 56 | 0 | 898 | 13 | 35,342 | 0 | 960,640 | 3,814 | 2.0 | 0.4 | 301.1 | 301.5 | 0.00 | 0.21 | W-3248 |
| `long-laptops` | Mantis | 1 | success | 1 | 8 | 0 | 11,324 | 0 | 20,740 | 0 | 132,352 | 768 | 2.0 | 0.2 | 22.1 | 22.3 | 0.00 | 0.16 | Nimbus 14, 1.35 kg |
| `long-laptops` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 16 | 0 | 64,189 | 0 | 27,584 | 0 | 46,848 | 353 | 2.0 | 0.3 | 16.8 | 17.0 | 0.00 | 0.16 | Nimbus 14, 1.35 kg |
| `long-laptops` | Screenshots (click by x,y) | 1 | success | 1 | 22 | 0 | 782 | 8 | 11,407 | 0 | 170,880 | 1,160 | 2.0 | 0.3 | 86.0 | 86.3 | 0.00 | 0.14 | Nimbus 14, 1.35 kg |
| `long-laptops` | Mantis | 2 | success | 1 | 8 | 0 | 11,036 | 0 | 24,044 | 0 | 50,176 | 471 | 2.0 | 0.2 | 15.5 | 15.7 | 0.00 | 0.21 | Nimbus 14, 1.35 kg |
| `long-laptops` | Accessibility tree (Playwright MCP) | 2 | wrong_answer | 1 | 10 | 0 | 16,408 | 0 | 11,709 | 0 | 67,584 | 386 | 2.0 | 0.3 | 14.7 | 15.0 | 0.00 | 0.18 | answer did not match the expected result |
| `long-laptops` | Screenshots (click by x,y) | 2 | wrong_answer | 1 | 23 | 0 | 782 | 9 | 20,798 | 0 | 181,760 | 1,225 | 2.2 | 0.3 | 45.8 | 46.1 | 0.00 | 0.16 | answer did not match the expected result |
| `long-laptops` | Mantis | 3 | success | 1 | 8 | 0 | 11,324 | 0 | 10,372 | 0 | 63,488 | 381 | 2.0 | 0.3 | 14.3 | 14.5 | 0.00 | 0.18 | Nimbus 14, 1.35 kg |
| `long-laptops` | Accessibility tree (Playwright MCP) | 3 | wrong_answer | 1 | 10 | 0 | 16,408 | 0 | 11,744 | 0 | 67,584 | 451 | 2.0 | 0.3 | 30.5 | 30.8 | 0.00 | 0.18 | answer did not match the expected result |
| `long-laptops` | Screenshots (click by x,y) | 3 | success | 1 | 22 | 0 | 782 | 8 | 32,005 | 0 | 224,128 | 1,567 | 2.0 | 0.2 | 41.9 | 42.1 | 0.00 | 0.17 | Nimbus 14, 1.35 kg |
