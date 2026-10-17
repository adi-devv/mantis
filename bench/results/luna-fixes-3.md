# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 1; 6 runs in parallel.
- Scope: 3 tasks × 3 approaches × 1 runs = 9 logical runs; 9 recorded so far; 9 total attempts including retries.
- Codex CLI version: codex-cli 0.163.0-alpha.10.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 3 / 3 | 3 / 3 | 3 / 3 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 40 | 59 | 95 |
| MCP tool errors (including retries) | 1 | 7 | 2 |
| Browser observation text (observed chars) | 98,853 | 561,162 | 4,195,308 |
| Browser observation images (observed blocks) | 0 | 0 | 32 |
| Normal input tokens (total) | 115,502 | 186,753 | 179,315 |
| Cache-write input tokens (total) | 0 | 0 | 0 |
| Cache-read input tokens (total) | 700,672 | 2,079,872 | 1,485,184 |
| Output tokens (total) | 2,660 | 4,041 | 6,664 |
| Total input tokens incl. cache (legacy) | 816,174 | 2,266,625 | 1,664,499 |
| MCP startup (total, s) | 6.2 | 6.2 | 6.2 |
| CLI startup (total, s) | 3.2 | 3.4 | 3.0 |
| CLI execution (total, s) | 179.6 | 199.7 | 282.7 |
| CLI wall (total, s) | 182.8 | 203.0 | 285.7 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 1.3 | 1.2 | 0.7 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 1 | success | 1 | 11 | 0 | 35,321 | 0 | 33,909 | 0 | 199,040 | 759 | 2.1 | 1.3 | 42.6 | 43.9 | 0.00 | 0.52 | SmartAsset estimates **$30,887 in 2025 federal income tax** for a single filer with $158,500 of taxable income. I entered $174,250 of household income so its $1 |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 24 | 3 | 214,746 | 0 | 49,530 | 0 | 809,216 | 1,611 | 2.1 | 1.3 | 59.5 | 60.8 | 0.00 | 0.58 | SmartAsset estimates **$30,887 in federal income tax** for 2025. I treated $158,500 as taxable income; to account for the calculator’s $15,750 standard deductio |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 1 | success | 1 | 29 | 1 | 399 | 9 | 49,385 | 0 | 420,736 | 2,046 | 2.1 | 1.3 | 73.9 | 75.2 | 0.00 | 0.35 | SmartAsset estimates **$27,107 in federal income tax** for 2025, using $158,500 income, single filing status, and the standard deduction. This is federal income |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 18 | 1 | 43,360 | 0 | 30,402 | 0 | 340,864 | 1,014 | 2.1 | 1.2 | 86.8 | 88.1 | 0.00 | 0.48 | Added one **Women’s Muscleback One Piece Black**, size **40 (US 12, matching Large)**, for **$55.00**. The cart shows quantity 1. I stopped before checkout. |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 16 | 3 | 138,859 | 0 | 56,824 | 0 | 555,008 | 1,327 | 2.1 | 1.2 | 70.3 | 71.6 | 0.00 | 0.38 | I couldn’t complete the add. The lowest priced black swimsuit I found was the Women’s Colourblock 2.0 Swimsuit at $32.50, but its product page showed Neon Viole |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 47 | 0 | 4,194,589 | 17 | 99,686 | 0 | 887,424 | 3,291 | 2.1 | 1.2 | 168.8 | 170.0 | 0.00 | 0.16 | Added the women’s Solid Leaderback Swimsuit in Black, size 40 (Large), to your cart for $37.00. I stopped at the cart and did not log in, check out, or enter pe |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 11 | 0 | 20,172 | 0 | 51,191 | 0 | 160,768 | 887 | 2.1 | 0.7 | 50.2 | 50.9 | 0.00 | 0.29 | I found Global Gas Station at 89 St Nicholas Pl, Manhattan, rated 4.3 stars with 103 reviews. I opened its reviews and tried to sort them, but Google Maps displ |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 19 | 1 | 207,557 | 0 | 80,399 | 0 | 715,648 | 1,103 | 2.0 | 0.9 | 69.8 | 70.7 | 0.00 | 0.24 | I found **Global Gas Station**, 89 St Nicholas Pl, New York, NY 10032, rated **4.3/5** with 103 reviews. Google Maps kept showing a sign-in prompt when I tried  |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 1 | success | 1 | 19 | 1 | 320 | 6 | 30,244 | 0 | 177,024 | 1,327 | 2.0 | 0.5 | 40.1 | 40.6 | 0.00 | 0.15 | I searched Google Maps for gas stations in Manhattan, NY. The results I saw were rated 4.0 or lower, so I couldn’t verify a station that met the above-4.0 requi |
