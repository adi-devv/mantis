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
| Tool calls (including retries) | 38 | 58 | 100 |
| MCP tool errors (including retries) | 3 | 6 | 1 |
| Browser observation text (observed chars) | 133,756 | 388,981 | 3,146,821 |
| Browser observation images (observed blocks) | 0 | 0 | 34 |
| Normal input tokens (total) | 150,168 | 219,362 | 138,745 |
| Cache-write input tokens (total) | 0 | 0 | 0 |
| Cache-read input tokens (total) | 699,648 | 1,996,416 | 1,411,712 |
| Output tokens (total) | 2,718 | 3,713 | 7,694 |
| Total input tokens incl. cache (legacy) | 849,816 | 2,215,778 | 1,550,457 |
| MCP startup (total, s) | 6.2 | 6.2 | 6.2 |
| CLI startup (total, s) | 3.0 | 2.8 | 2.6 |
| CLI execution (total, s) | 225.9 | 263.3 | 281.7 |
| CLI wall (total, s) | 228.8 | 266.1 | 284.3 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 0.9 | 0.6 | 0.8 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 1 | success | 1 | 7 | 0 | 41,212 | 0 | 46,569 | 0 | 116,736 | 703 | 2.1 | 1.2 | 57.7 | 58.9 | 0.00 | 0.51 | Using SmartAsset’s 2025 federal brackets for a single filer, estimated federal income tax on **$158,500 of taxable income** is **$30,887** (24% marginal rate).  |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 21 | 2 | 133,443 | 0 | 98,107 | 0 | 710,016 | 1,032 | 2.1 | 1.2 | 93.0 | 94.1 | 0.00 | 0.28 | SmartAsset estimates **$23,274 in 2025 federal income tax** for $158,500 of income, filing single with the standard deduction and no additional contributions or |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 1 | success | 1 | 39 | 1 | 487 | 13 | 77,365 | 0 | 308,096 | 2,908 | 2.1 | 1.2 | 113.8 | 114.9 | 0.00 | 0.22 | I opened SmartAsset’s 2025 federal income tax estimator and set filing status to Single, income to $158,500, and the deduction type to Itemized with a $0 deduct |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 17 | 2 | 61,820 | 0 | 45,178 | 0 | 359,296 | 1,046 | 2.1 | 1.1 | 99.3 | 100.4 | 0.00 | 0.22 | Added the **Women’s Muscleback One Piece in Black** to your cart for **$55.00**. The listing matched the Large size filter; Speedo labels that size **40** on th |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 26 | 4 | 122,057 | 0 | 76,249 | 0 | 1,002,496 | 1,796 | 2.1 | 1.1 | 137.2 | 138.3 | 0.00 | 0.17 | Added the **Women’s Solid V-Neck One Piece in Black, size L**, to your cart for **$58.00**. I stopped at the cart without logging in, entering personal informat |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 41 | 0 | 3,146,037 | 14 | 38,212 | 0 | 826,368 | 3,110 | 2.1 | 1.1 | 112.8 | 114.0 | 0.00 | 0.39 | I filtered the results to black, size Large, and swimsuit, but couldn’t complete the add to cart. The browser view didn’t expose the page URL, so I can’t provid |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 14 | 1 | 30,724 | 0 | 58,421 | 0 | 223,616 | 969 | 2.0 | 0.7 | 68.9 | 69.5 | 0.00 | 0.17 | Found Global Gas Station at 89 St Nicholas Pl, Manhattan, rated 4.3 stars with 103 reviews. I opened its reviews, but Google Maps covered the sort control with  |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 11 | 0 | 133,481 | 0 | 45,006 | 0 | 283,904 | 885 | 2.0 | 0.5 | 33.1 | 33.6 | 0.00 | 0.19 | Global Gas Station at **89 St Nicholas Pl, New York, NY 10032** has a **4.3** rating from 103 reviews. I opened its review sort control, but Google Maps prompte |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 1 | success | 1 | 20 | 0 | 297 | 7 | 23,168 | 0 | 277,248 | 1,676 | 2.0 | 0.4 | 55.1 | 55.5 | 0.00 | 0.15 | I found a Manhattan Shell at 1855 1st Ave, but it’s rated 3.7, so it doesn’t meet your above-4.0 requirement. I didn’t sort reviews. |
