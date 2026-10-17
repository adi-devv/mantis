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
| Tool calls (including retries) | 54 | 49 | 132 |
| MCP tool errors (including retries) | 3 | 6 | 2 |
| Browser observation text (observed chars) | 176,526 | 324,915 | 4,195,788 |
| Browser observation images (observed blocks) | 0 | 0 | 41 |
| Normal input tokens (total) | 144,959 | 215,548 | 191,244 |
| Cache-write input tokens (total) | 0 | 0 | 0 |
| Cache-read input tokens (total) | 1,437,440 | 1,406,592 | 2,676,608 |
| Output tokens (total) | 3,776 | 3,086 | 10,446 |
| Total input tokens incl. cache (legacy) | 1,582,399 | 1,622,140 | 2,867,852 |
| MCP startup (total, s) | 6.2 | 6.2 | 6.2 |
| CLI startup (total, s) | 3.4 | 2.7 | 3.7 |
| CLI execution (total, s) | 224.5 | 181.8 | 351.8 |
| CLI wall (total, s) | 228.0 | 184.4 | 355.5 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 1.1 | 1.1 | 0.6 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `bc2ce7f206045dd2d322e5695a947219` | Mantis | 1 | success | 1 | 10 | 0 | 25,640 | 0 | 33,013 | 0 | 157,056 | 931 | 2.1 | 1.1 | 38.7 | 39.8 | 0.00 | 0.43 | Using SmartAsset’s 2025 federal brackets for a single filer, estimated federal income tax on **$158,500 of taxable income** is **$30,887**, before credits. That |
| `bc2ce7f206045dd2d322e5695a947219` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 22 | 3 | 169,456 | 0 | 59,287 | 0 | 765,056 | 1,055 | 2.1 | 1.1 | 56.4 | 57.5 | 0.00 | 0.35 | SmartAsset estimates **$27,107 in federal income tax** for 2025, using single filing and the standard deduction. The calculator also shows $12,125 in FICA; the  |
| `bc2ce7f206045dd2d322e5695a947219` | Screenshots (click by x,y) | 1 | success | 1 | 41 | 1 | 547 | 12 | 53,659 | 0 | 757,376 | 3,672 | 2.1 | 1.1 | 97.1 | 98.2 | 0.00 | 0.27 | SmartAsset estimated **$30,887 in federal income tax** for 2025. I entered $174,250 as household income so its $15,750 standard deduction left $158,500 taxable  |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Mantis | 1 | success | 1 | 31 | 2 | 135,340 | 0 | 72,128 | 0 | 1,080,576 | 1,942 | 2.1 | 1.0 | 130.7 | 131.7 | 0.00 | 0.27 | Added the **Women’s Solid Leaderback Swimsuit in Black**, size **40 (US 40)**, to your cart for **$37**. The store’s size guide labels this size as USA 40. I st |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 2 | 42,846 | 0 | 42,831 | 0 | 129,536 | 565 | 2.1 | 1.0 | 36.2 | 37.2 | 0.00 | 0.45 | I couldn’t add an item: the storefront’s overlay blocked browser clicks, and navigating to the women’s page returned a 404. I did not log in, enter personal inf |
| `824eb7bb0ef1ce40bfd49c12182d9428_070826` | Screenshots (click by x,y) | 1 | success | 1 | 68 | 1 | 4,194,914 | 21 | 41,431 | 0 | 1,630,848 | 4,969 | 2.1 | 1.0 | 166.9 | 167.9 | 0.00 | 0.14 | I found the black Women’s Ombre Ultraback One Piece on sale for $46, but its available sizes are numbered (6, 8, 10, 12, 14, and 18), with no Large option. I st |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Mantis | 1 | success | 1 | 13 | 1 | 15,546 | 0 | 39,818 | 0 | 199,808 | 903 | 2.0 | 1.3 | 55.1 | 56.4 | 0.00 | 0.41 | I found Global Gas Station at 89 St Nicholas Pl, Manhattan, rated 4.3 stars with 103 reviews. I opened its reviews, but clicking “Sort reviews” brought up a Goo |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 22 | 1 | 112,613 | 0 | 113,430 | 0 | 512,000 | 1,466 | 2.0 | 0.6 | 89.2 | 89.7 | 0.00 | 0.30 | I found Global Gas Station at 89 St Nicholas Pl, New York, NY 10032, rated 4.3 stars (103 reviews). Google Maps displayed a sign-in prompt when I tried to open  |
| `0e42c3a73f2aece1f854e0ba55b7c8b0` | Screenshots (click by x,y) | 1 | success | 1 | 23 | 0 | 327 | 8 | 96,154 | 0 | 288,384 | 1,805 | 2.0 | 1.6 | 87.8 | 89.4 | 0.00 | 0.17 | Found Global Gas Station at 89 St Nicholas Pl, Manhattan, rated 4.3 (103 reviews). Google Maps prompted me to sign in when I tried to sort reviews, so I dismiss |
