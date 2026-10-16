# Real-agent eval

> Claude Code (`claude -p`) (requested model `claude-haiku-5-5`) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Claude stream; reported cost is retained; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 1; 5 runs in parallel.
- Scope: 22 tasks × 3 approaches × 1 runs = 66 logical runs; 66 recorded so far; 66 total attempts including retries.
- Claude CLI version: 2.1.161 (Claude Code); resolved model(s): claude-haiku-5-5.
- MCP startup (spawn + warm-up) is separate from Claude CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first init event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Claude-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. 
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 22 / 22 | 22 / 22 | 22 / 22 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 103 | 133 | 193 |
| MCP tool errors (including retries) | 0 | 1 | 0 |
| Browser observation text (observed chars) | 51,975 | 117,468 | 3,829 |
| Browser observation images (observed blocks) | 0 | 1 | 75 |
| Normal input tokens (total) | 250 | 258 | 240 |
| Cache-write input tokens (total) | 168,734 | 210,877 | 247,174 |
| Cache-read input tokens (total) | 1,118,917 | 1,562,048 | 1,003,248 |
| Output tokens (total) | 11,330 | 14,908 | 17,312 |
| Total input tokens incl. cache (legacy) | 1,287,901 | 1,773,183 | 1,250,662 |
| MCP startup (total, s) | 44.8 | 44.4 | 44.6 |
| CLI startup (total, s) | 35.7 | 34.2 | 32.4 |
| CLI execution (total, s) | 248.3 | 295.8 | 264.0 |
| CLI wall (total, s) | 284.1 | 330.0 | 296.4 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 4.9 | 4.8 | 4.6 |
| Cost estimate (USD; including retries) | 1.14 | 1.48 | 1.49 |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `form-subscribe` | Mantis | 1 | success | 1 | 4 | 0 | 611 | 0 | 10 | 12,184 | 35,343 | 389 | 2.1 | 3.4 | 9.4 | 12.7 | 0.00 | 0.18 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 7 | 0 | 3,135 | 0 | 12 | 17,164 | 62,899 | 682 | 2.1 | 3.3 | 13.4 | 16.7 | 0.00 | 0.24 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Screenshots (click by x,y) | 1 | success | 1 | 15 | 0 | 241 | 6 | 16 | 19,382 | 81,480 | 1,317 | 2.1 | 3.3 | 19.7 | 23.0 | 0.00 | 0.16 | Subscribed from Canada (weekly: yes). |
| `wikipedia-birthdate` | Mantis | 1 | success | 1 | 1 | 0 | 2,750 | 0 | 6 | 12,913 | 11,469 | 209 | 2.1 | 3.3 | 14.6 | 17.9 | 0.00 | 0.23 | 23 June 1912 |
| `wikipedia-birthdate` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 13,284 | 0 | 6 | 20,605 | 14,776 | 197 | 2.1 | 3.3 | 15.5 | 18.8 | 0.00 | 0.23 | 23 June 1912 |
| `wikipedia-birthdate` | Screenshots (click by x,y) | 1 | success | 1 | 2 | 0 | 54 | 1 | 6 | 7,009 | 13,439 | 235 | 2.0 | 1.4 | 5.9 | 7.3 | 0.00 | 0.28 | 23 June 1912 |
| `login` | Mantis | 1 | success | 1 | 5 | 0 | 964 | 0 | 12 | 6,331 | 53,643 | 542 | 2.1 | 1.4 | 10.9 | 12.3 | 0.00 | 0.17 | Signed in |
| `login` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 2,160 | 0 | 10 | 7,129 | 55,746 | 686 | 2.0 | 1.3 | 10.6 | 11.9 | 0.00 | 0.19 | Signed in |
| `login` | Screenshots (click by x,y) | 1 | success | 1 | 8 | 0 | 202 | 2 | 8 | 8,983 | 24,501 | 629 | 2.0 | 1.5 | 9.8 | 11.3 | 0.00 | 0.20 | Signed in |
| `cookie-cart` | Mantis | 1 | success | 1 | 4 | 0 | 702 | 0 | 10 | 6,149 | 41,329 | 402 | 2.0 | 1.5 | 9.2 | 10.6 | 0.00 | 0.25 | "Added to cart (1 item)." |
| `cookie-cart` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 8 | 1 | 3,882 | 0 | 12 | 8,643 | 73,865 | 1,134 | 2.0 | 1.6 | 19.5 | 21.1 | 0.00 | 0.16 | "Added to cart (1 item)." |
| `cookie-cart` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 134 | 3 | 10 | 10,371 | 37,395 | 725 | 2.0 | 1.1 | 10.2 | 11.2 | 0.00 | 0.18 | "Added to cart (1 item)." |
| `longlist-item` | Mantis | 1 | success | 1 | 4 | 0 | 1,351 | 0 | 10 | 6,521 | 42,025 | 322 | 2.0 | 1.5 | 8.7 | 10.2 | 0.00 | 0.20 | Detail for item 150 |
| `longlist-item` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 1,258 | 0 | 12 | 6,396 | 70,342 | 385 | 2.0 | 1.5 | 10.5 | 11.9 | 0.00 | 0.17 | Detail for item 150 |
| `longlist-item` | Screenshots (click by x,y) | 1 | success | 1 | 7 | 0 | 154 | 3 | 10 | 10,284 | 37,301 | 573 | 2.0 | 1.5 | 10.4 | 11.8 | 0.00 | 0.24 | Detail for item 150 |
| `pricing-team` | Mantis | 1 | success | 1 | 2 | 0 | 794 | 0 | 8 | 6,003 | 29,389 | 283 | 2.0 | 1.4 | 8.5 | 9.9 | 0.00 | 0.16 | $29 per month |
| `pricing-team` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 2,089 | 0 | 12 | 6,862 | 70,627 | 423 | 2.0 | 1.5 | 10.8 | 12.3 | 0.00 | 0.22 | $29 per month |
| `pricing-team` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 116 | 2 | 8 | 8,567 | 24,500 | 310 | 2.0 | 1.5 | 8.9 | 10.4 | 0.00 | 0.14 | $29 per month |
| `dashboard-refresh` | Mantis | 1 | success | 1 | 4 | 0 | 11,134 | 0 | 12 | 12,450 | 62,931 | 617 | 2.0 | 1.3 | 12.1 | 13.5 | 0.00 | 0.20 | Last updated: just now; Initech 3 amount: $4,218 |
| `dashboard-refresh` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 20,062 | 0 | 10 | 15,520 | 72,260 | 639 | 2.0 | 1.2 | 10.5 | 11.7 | 0.00 | 0.19 | Last updated: just now; Initech 3 amount: $4,218 |
| `dashboard-refresh` | Screenshots (click by x,y) | 1 | success | 1 | 8 | 0 | 148 | 4 | 12 | 11,895 | 51,525 | 874 | 2.2 | 1.3 | 12.6 | 13.9 | 0.00 | 0.16 | Last updated: just now; Initech 3 amount: $4,218 |
| `signup-validation` | Mantis | 1 | success | 1 | 9 | 0 | 1,116 | 0 | 16 | 6,944 | 79,856 | 948 | 2.0 | 1.3 | 14.2 | 15.5 | 0.00 | 0.19 | Your account is ready. |
| `signup-validation` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 8 | 0 | 2,759 | 0 | 10 | 7,834 | 56,173 | 933 | 2.0 | 1.4 | 12.2 | 13.6 | 0.00 | 0.19 | Welcome, new@example.com. Your account is ready. |
| `signup-validation` | Screenshots (click by x,y) | 1 | success | 1 | 19 | 0 | 373 | 4 | 12 | 12,974 | 53,222 | 1,457 | 2.0 | 1.2 | 17.4 | 18.5 | 0.00 | 0.18 | Welcome, new@example.com — Your account is ready. |
| `checkout-steps` | Mantis | 1 | success | 1 | 10 | 0 | 1,828 | 0 | 20 | 7,250 | 105,492 | 789 | 2.0 | 1.4 | 20.4 | 21.8 | 0.00 | 0.27 | Order #A1042; total charged $27.50 |
| `checkout-steps` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 10 | 0 | 3,482 | 0 | 12 | 8,450 | 73,495 | 965 | 2.0 | 1.2 | 15.8 | 17.0 | 0.00 | 0.19 | Order #A1042, total charged $27.50 |
| `checkout-steps` | Screenshots (click by x,y) | 1 | success | 1 | 21 | 0 | 354 | 7 | 18 | 17,224 | 106,050 | 1,577 | 2.0 | 1.2 | 18.1 | 19.3 | 0.00 | 0.18 | Order #A1042; total charged $27.50 |
| `booking-date` | Mantis | 1 | success | 1 | 6 | 0 | 974 | 0 | 12 | 6,518 | 54,128 | 587 | 2.0 | 1.2 | 11.1 | 12.3 | 0.00 | 0.17 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 2,489 | 0 | 12 | 7,368 | 71,608 | 609 | 2.0 | 1.2 | 11.3 | 12.5 | 0.00 | 0.18 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Screenshots (click by x,y) | 1 | success | 1 | 22 | 0 | 341 | 7 | 18 | 17,578 | 106,319 | 1,920 | 2.0 | 1.2 | 24.0 | 25.2 | 0.00 | 0.19 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `article-deep-fact` | Mantis | 1 | success | 1 | 4 | 0 | 6,150 | 0 | 10 | 8,148 | 43,556 | 593 | 2.0 | 1.3 | 8.5 | 9.8 | 0.00 | 0.24 | 1874 |
| `article-deep-fact` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 6,099 | 0 | 8 | 7,864 | 39,291 | 375 | 2.0 | 1.3 | 6.7 | 8.0 | 0.00 | 0.17 | 1874 |
| `article-deep-fact` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 126 | 3 | 10 | 10,214 | 37,070 | 617 | 2.0 | 1.2 | 10.7 | 11.8 | 0.00 | 0.16 | 1874 |
| `inventory-lookup` | Mantis | 1 | success | 1 | 2 | 0 | 1,511 | 0 | 8 | 6,747 | 30,176 | 364 | 2.0 | 1.3 | 7.8 | 9.1 | 0.00 | 0.16 | SKU W-1203, 113 in stock |
| `inventory-lookup` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 5,832 | 0 | 8 | 8,597 | 39,343 | 359 | 2.0 | 1.1 | 6.6 | 7.8 | 0.00 | 0.20 | SKU W-1203, 113 in stock |
| `inventory-lookup` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 114 | 2 | 10 | 8,489 | 35,631 | 376 | 2.0 | 1.2 | 9.0 | 10.3 | 0.00 | 0.24 | SKU W-1203, 113 in stock |
| `churned-max` | Mantis | 1 | success | 1 | 2 | 0 | 6,140 | 0 | 8 | 9,560 | 32,451 | 693 | 2.0 | 1.3 | 12.2 | 13.6 | 0.00 | 0.28 | Acme 6 — $9,950 |
| `churned-max` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 7 | 0 | 18,818 | 0 | 12 | 15,566 | 87,567 | 1,293 | 2.0 | 1.2 | 13.3 | 14.5 | 0.00 | 0.33 | Acme 6, $9,950 |
| `churned-max` | Screenshots (click by x,y) | 1 | success | 1 | 8 | 0 | 135 | 4 | 12 | 12,035 | 51,783 | 1,637 | 2.0 | 1.4 | 14.7 | 16.1 | 0.00 | 0.24 | Acme 6, $9,950 |
| `search-pagination` | Mantis | 1 | success | 1 | 7 | 0 | 1,914 | 0 | 14 | 7,120 | 67,363 | 573 | 2.0 | 1.2 | 12.1 | 13.3 | 0.00 | 0.33 | dana.r. |
| `search-pagination` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 11 | 0 | 8,676 | 0 | 24 | 10,816 | 180,259 | 946 | 2.0 | 1.4 | 23.7 | 25.1 | 0.00 | 0.18 | dana.r |
| `search-pagination` | Screenshots (click by x,y) | 1 | success | 1 | 10 | 0 | 183 | 5 | 12 | 13,236 | 52,945 | 715 | 2.0 | 1.5 | 14.5 | 16.0 | 0.00 | 0.19 | dana.r. |
| `feed-scroll` | Mantis | 1 | success | 1 | 13 | 0 | 9,003 | 0 | 20 | 11,023 | 115,997 | 1,184 | 2.0 | 1.6 | 17.3 | 18.9 | 0.00 | 0.19 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 14 | 0 | 6,787 | 0 | 16 | 10,298 | 108,248 | 1,209 | 2.0 | 1.6 | 23.2 | 24.8 | 0.00 | 0.22 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Screenshots (click by x,y) | 1 | success | 1 | 10 | 0 | 169 | 3 | 10 | 10,490 | 37,504 | 683 | 2.0 | 1.7 | 10.5 | 12.2 | 0.00 | 0.16 | The meeting moved to Thursday at noon. |
| `modal-delete` | Mantis | 1 | success | 1 | 3 | 0 | 618 | 0 | 10 | 6,023 | 41,316 | 422 | 2.2 | 1.8 | 12.3 | 14.1 | 0.00 | 0.19 | "Old report was moved to trash." |
| `modal-delete` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 3,007 | 0 | 14 | 7,527 | 88,445 | 646 | 2.0 | 1.8 | 14.6 | 16.4 | 0.00 | 0.23 | "Old report was moved to trash." |
| `modal-delete` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 135 | 3 | 10 | 10,188 | 37,207 | 535 | 2.0 | 1.3 | 10.0 | 11.3 | 0.00 | 0.20 | Old report was moved to trash. |
| `menu-settings` | Mantis | 1 | success | 1 | 5 | 0 | 734 | 0 | 12 | 6,242 | 53,316 | 473 | 2.0 | 1.5 | 10.8 | 12.3 | 0.00 | 0.28 | "Theme saved: Dark" |
| `menu-settings` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 10 | 0 | 3,995 | 0 | 14 | 8,545 | 89,606 | 805 | 2.0 | 1.4 | 19.6 | 20.9 | 0.00 | 0.23 | "Theme saved: Dark" (status message) |
| `menu-settings` | Screenshots (click by x,y) | 1 | success | 1 | 10 | 0 | 178 | 5 | 16 | 13,184 | 77,984 | 726 | 2.0 | 1.6 | 14.1 | 15.7 | 0.00 | 0.21 | Theme saved: Dark |
| `spa-team` | Mantis | 1 | success | 1 | 3 | 0 | 643 | 0 | 10 | 6,042 | 41,245 | 335 | 2.0 | 1.4 | 9.8 | 11.2 | 0.00 | 0.26 | mia@example.com |
| `spa-team` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 2,928 | 0 | 12 | 7,453 | 70,698 | 489 | 2.0 | 1.4 | 12.1 | 13.4 | 0.00 | 0.18 | mia@example.com |
| `spa-team` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 133 | 3 | 10 | 10,104 | 37,043 | 439 | 2.0 | 1.4 | 9.2 | 10.6 | 0.00 | 0.20 | mia@example.com |
| `plans-pick` | Mantis | 1 | success | 1 | 3 | 0 | 542 | 0 | 10 | 5,961 | 41,237 | 360 | 2.0 | 1.7 | 8.9 | 10.7 | 0.00 | 0.31 | PRO-77 |
| `plans-pick` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 1,627 | 0 | 12 | 6,628 | 70,486 | 471 | 2.0 | 1.4 | 12.4 | 13.9 | 0.00 | 0.24 | PRO-77 |
| `plans-pick` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 112 | 2 | 8 | 8,647 | 24,570 | 405 | 2.0 | 1.7 | 8.1 | 9.8 | 0.00 | 0.27 | PRO-77 |
| `faq-refund` | Mantis | 1 | success | 1 | 3 | 0 | 862 | 0 | 10 | 6,067 | 41,220 | 359 | 2.0 | 1.8 | 9.1 | 11.0 | 0.00 | 0.16 | 30 |
| `faq-refund` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 1,772 | 0 | 8 | 6,732 | 39,630 | 413 | 2.0 | 1.7 | 10.3 | 12.0 | 0.00 | 0.33 | 30 |
| `faq-refund` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 111 | 2 | 8 | 8,563 | 24,491 | 319 | 2.0 | 1.4 | 7.5 | 8.9 | 0.00 | 0.29 | 30 |
| `iframe-pay` | Mantis | 1 | success | 1 | 6 | 0 | 1,174 | 0 | 12 | 6,641 | 54,260 | 532 | 2.0 | 1.6 | 10.6 | 12.2 | 0.00 | 0.23 | R-5531 |
| `iframe-pay` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 2,379 | 0 | 12 | 7,284 | 72,078 | 616 | 2.0 | 1.3 | 13.2 | 14.5 | 0.00 | 0.29 | R-5531 |
| `iframe-pay` | Screenshots (click by x,y) | 1 | success | 1 | 11 | 0 | 224 | 3 | 10 | 10,731 | 37,832 | 816 | 2.0 | 1.7 | 10.6 | 12.3 | 0.00 | 0.29 | R-5531 |
| `chart-march` | Mantis | 1 | success | 1 | 3 | 0 | 460 | 0 | 10 | 5,897 | 41,175 | 354 | 2.1 | 1.4 | 9.7 | 11.1 | 0.00 | 0.31 | 42 |
| `chart-march` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 3 | 0 | 948 | 1 | 10 | 7,596 | 54,606 | 633 | 2.0 | 1.2 | 10.1 | 11.3 | 0.00 | 0.20 | 42 |
| `chart-march` | Screenshots (click by x,y) | 1 | success | 1 | 2 | 0 | 92 | 1 | 6 | 7,026 | 13,456 | 427 | 2.0 | 1.2 | 8.0 | 9.3 | 0.00 | 0.22 | 42 |
