# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 1; 5 runs in parallel.
- Scope: 22 tasks × 5 approaches × 1 runs = 110 logical runs; 110 recorded so far; 110 total attempts including retries.
- Codex CLI version: codex-cli 0.162.0-alpha.17.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Chrome DevTools MCP | browser-use (MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|---:|---:|
| Correct | 21 / 22 | 22 / 22 | 9 / 22 | 14 / 22 | 17 / 22 |
| Connection-failure attempts | 0 | 0 | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 | 0 | 0 |
| Other attempted failures | 1 | 0 | 13 | 8 | 5 |
| Tool calls (including retries) | 87 | 117 | 76 | 151 | 187 |
| MCP tool errors (including retries) | 0 | 1 | 7 | 0 | 3 |
| Browser observation text (observed chars) | 41,225 | 161,163 | 68,404 | 207,321 | 3,728 |
| Browser observation images (observed blocks) | 0 | 1 | 0 | 27 | 74 |
| Normal input tokens (total) | 327,470 | 353,196 | 453,377 | 352,668 | 374,987 |
| Cache-write input tokens (total) | 0 | 0 | 0 | 0 | 0 |
| Cache-read input tokens (total) | 1,414,016 | 1,616,256 | 2,080,640 | 1,884,672 | 2,279,552 |
| Output tokens (total) | 5,825 | 6,505 | 8,953 | 8,641 | 14,057 |
| Total input tokens incl. cache (legacy) | 1,741,486 | 1,969,452 | 2,534,017 | 2,237,340 | 2,654,539 |
| MCP startup (total, s) | 44.4 | 44.4 | 44.5 | 264.4 | 44.5 |
| CLI startup (total, s) | 5.7 | 5.8 | 5.9 | 5.4 | 5.9 |
| CLI execution (total, s) | 373.7 | 381.4 | 429.7 | 456.6 | 498.9 |
| CLI wall (total, s) | 379.3 | 387.2 | 435.6 | 461.9 | 504.8 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 3.6 | 3.2 | 3.3 | 3.4 | 3.7 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown | unknown | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `form-subscribe` | Mantis | 1 | success | 1 | 4 | 0 | 611 | 0 | 27,832 | 0 | 52,864 | 267 | 2.1 | 0.4 | 19.0 | 19.4 | 0.00 | 0.18 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 2,510 | 0 | 18,809 | 0 | 74,752 | 305 | 2.1 | 0.4 | 21.3 | 21.7 | 0.00 | 0.16 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 3 | 1 | 362 | 0 | 18,730 | 0 | 119,936 | 409 | 2.1 | 0.4 | 20.6 | 21.0 | 0.00 | 0.15 | fixture check failed (2 observations) |
| `form-subscribe` | browser-use (MCP) | 1 | wrong_answer | 1 | 7 | 0 | 3,037 | 0 | 25,296 | 0 | 74,624 | 363 | 12.0 | 0.3 | 18.5 | 18.8 | 0.00 | 0.17 | fixture check failed (11 observations) |
| `form-subscribe` | Screenshots (click by x,y) | 1 | success | 1 | 10 | 0 | 176 | 4 | 13,795 | 0 | 144,384 | 754 | 2.1 | 0.4 | 28.2 | 28.5 | 0.00 | 0.19 | Subscribed from Canada (weekly: yes). |
| `wikipedia-birthdate` | Mantis | 1 | success | 1 | 1 | 0 | 2,750 | 0 | 11,873 | 0 | 19,200 | 109 | 2.0 | 0.3 | 17.4 | 17.8 | 0.00 | 0.14 | 23 June 1912 |
| `wikipedia-birthdate` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 13,284 | 0 | 16,016 | 0 | 31,616 | 162 | 2.0 | 0.2 | 17.3 | 17.5 | 0.00 | 0.14 | 23 June 1912 |
| `wikipedia-birthdate` | Chrome DevTools MCP | 1 | success | 1 | 1 | 0 | 105 | 0 | 5,198 | 0 | 37,888 | 143 | 2.0 | 0.2 | 14.2 | 14.4 | 0.00 | 0.22 | 23 June 1912 |
| `wikipedia-birthdate` | browser-use (MCP) | 1 | success | 1 | 2 | 0 | 26,056 | 0 | 17,111 | 0 | 34,432 | 137 | 12.1 | 0.3 | 15.4 | 15.6 | 0.00 | 0.17 | 23 June 1912 |
| `wikipedia-birthdate` | Screenshots (click by x,y) | 1 | success | 1 | 2 | 0 | 54 | 1 | 21,368 | 0 | 31,488 | 227 | 2.0 | 0.3 | 11.5 | 11.8 | 0.00 | 0.14 | 23 June 1912 |
| `login` | Mantis | 1 | success | 1 | 5 | 0 | 964 | 0 | 23,523 | 0 | 70,144 | 295 | 2.0 | 0.3 | 14.6 | 15.0 | 0.00 | 0.15 | Signed in |
| `login` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 2,160 | 0 | 24,602 | 0 | 56,576 | 298 | 2.0 | 0.3 | 18.6 | 18.8 | 0.00 | 0.15 | Signed in |
| `login` | Chrome DevTools MCP | 1 | success | 1 | 6 | 0 | 2,875 | 0 | 16,298 | 0 | 140,544 | 491 | 2.1 | 0.3 | 22.1 | 22.4 | 0.00 | 0.21 | Signed in |
| `login` | browser-use (MCP) | 1 | wrong_answer | 1 | 6 | 0 | 2,124 | 0 | 9,293 | 0 | 66,432 | 290 | 12.0 | 0.2 | 17.5 | 17.8 | 0.00 | 0.17 | answer did not match the expected result |
| `login` | Screenshots (click by x,y) | 1 | success | 1 | 8 | 0 | 202 | 2 | 16,752 | 0 | 112,896 | 623 | 2.0 | 0.2 | 24.1 | 24.3 | 0.00 | 0.14 | Signed in |
| `cookie-cart` | Mantis | 1 | success | 1 | 3 | 0 | 518 | 0 | 6,077 | 0 | 61,952 | 248 | 2.0 | 0.2 | 12.9 | 13.1 | 0.00 | 0.16 | Added to cart (1 item). |
| `cookie-cart` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 1,764 | 0 | 18,142 | 0 | 62,720 | 288 | 2.0 | 0.2 | 16.5 | 16.7 | 0.00 | 0.15 | Added to cart (1 item). |
| `cookie-cart` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 2 | 0 | 246 | 0 | 30,815 | 0 | 53,120 | 317 | 2.0 | 0.3 | 14.4 | 14.7 | 0.00 | 0.15 | fixture check failed (1 observations) |
| `cookie-cart` | browser-use (MCP) | 1 | success | 1 | 7 | 0 | 2,474 | 1 | 26,153 | 0 | 74,624 | 394 | 12.0 | 0.3 | 20.7 | 21.0 | 0.00 | 0.15 | Added to cart (1 item). |
| `cookie-cart` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 134 | 3 | 21,127 | 0 | 86,016 | 484 | 2.0 | 0.3 | 17.1 | 17.4 | 0.00 | 0.16 | Added to cart (1 item). |
| `longlist-item` | Mantis | 1 | success | 1 | 3 | 0 | 1,242 | 0 | 13,182 | 0 | 55,936 | 235 | 2.0 | 0.3 | 15.2 | 15.5 | 0.00 | 0.14 | Detail for item 150 |
| `longlist-item` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 23,418 | 0 | 33,900 | 0 | 59,136 | 228 | 2.0 | 0.3 | 14.2 | 14.5 | 0.00 | 0.13 | Detail for item 150 |
| `longlist-item` | Chrome DevTools MCP | 1 | success | 1 | 4 | 1 | 21,916 | 0 | 19,651 | 0 | 117,760 | 484 | 2.0 | 0.3 | 16.9 | 17.2 | 0.00 | 0.13 | Detail for item 150 |
| `longlist-item` | browser-use (MCP) | 1 | success | 1 | 7 | 0 | 11,789 | 1 | 20,997 | 0 | 99,712 | 524 | 12.0 | 0.2 | 22.2 | 22.4 | 0.00 | 0.17 | Detail for item 150 |
| `longlist-item` | Screenshots (click by x,y) | 1 | success | 1 | 10 | 0 | 156 | 5 | 14,751 | 0 | 146,304 | 818 | 2.0 | 0.2 | 23.7 | 24.0 | 0.00 | 0.13 | Detail for item 150 |
| `pricing-team` | Mantis | 1 | success | 1 | 2 | 0 | 794 | 0 | 5,957 | 0 | 49,664 | 200 | 2.0 | 0.2 | 9.8 | 10.1 | 0.00 | 0.24 | $29 per month |
| `pricing-team` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 2,205 | 0 | 8,933 | 0 | 59,904 | 231 | 2.0 | 0.2 | 12.5 | 12.7 | 0.00 | 0.14 | $29 per month |
| `pricing-team` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 2 | 0 | 284 | 0 | 15,675 | 0 | 67,840 | 299 | 2.0 | 0.3 | 13.8 | 14.1 | 0.00 | 0.14 | fixture check failed (1 observations) |
| `pricing-team` | browser-use (MCP) | 1 | success | 1 | 5 | 0 | 1,998 | 1 | 10,290 | 0 | 66,688 | 285 | 12.0 | 0.2 | 15.8 | 16.0 | 0.00 | 0.14 | $29 per month |
| `pricing-team` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 116 | 2 | 6,455 | 0 | 71,680 | 361 | 2.0 | 0.2 | 13.9 | 14.1 | 0.00 | 0.27 | $29 per month |
| `dashboard-refresh` | Mantis | 1 | success | 1 | 2 | 0 | 5,618 | 0 | 12,564 | 0 | 47,232 | 235 | 2.0 | 0.3 | 12.4 | 12.6 | 0.00 | 0.17 | Last updated: just now; Initech 3: $4,218 |
| `dashboard-refresh` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 37,136 | 0 | 43,093 | 0 | 49,536 | 253 | 2.0 | 0.2 | 16.4 | 16.6 | 0.00 | 0.13 | Last updated: just now; Initech 3: $4,218 |
| `dashboard-refresh` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 2 | 0 | 326 | 0 | 17,239 | 0 | 70,784 | 369 | 2.0 | 0.4 | 12.9 | 13.3 | 0.00 | 0.14 | fixture check failed (2 observations) |
| `dashboard-refresh` | browser-use (MCP) | 1 | wrong_answer | 1 | 4 | 0 | 70,553 | 1 | 34,621 | 0 | 82,432 | 331 | 12.0 | 0.3 | 13.8 | 14.1 | 0.00 | 0.16 | answer did not match the expected result |
| `dashboard-refresh` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 135 | 3 | 19,556 | 0 | 84,736 | 593 | 2.0 | 0.3 | 18.7 | 18.9 | 0.00 | 0.15 | just now; Initech 3: $4,218 |
| `signup-validation` | Mantis | 1 | wrong_answer | 1 | 8 | 0 | 947 | 0 | 15,803 | 0 | 103,936 | 466 | 2.0 | 0.2 | 28.8 | 29.1 | 0.00 | 0.14 | answer did not match the expected result |
| `signup-validation` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 8 | 0 | 2,759 | 0 | 16,403 | 0 | 103,296 | 536 | 2.0 | 0.3 | 19.4 | 19.6 | 0.00 | 0.18 | Welcome, new@example.com — Your account is ready. |
| `signup-validation` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 2 | 0 | 278 | 0 | 11,386 | 0 | 90,240 | 367 | 2.0 | 0.2 | 16.2 | 16.5 | 0.00 | 0.13 | fixture check failed (1 observations) |
| `signup-validation` | browser-use (MCP) | 1 | success | 1 | 12 | 0 | 3,828 | 3 | 14,247 | 0 | 106,496 | 786 | 12.0 | 0.2 | 25.3 | 25.5 | 0.00 | 0.14 | Welcome, new@example.com. Your account is ready. |
| `signup-validation` | Screenshots (click by x,y) | 1 | wrong_answer | 1 | 18 | 2 | 423 | 3 | 16,621 | 0 | 88,832 | 890 | 2.0 | 0.3 | 25.0 | 25.2 | 0.00 | 0.14 | fixture check failed (135 observations) |
| `checkout-steps` | Mantis | 1 | success | 1 | 9 | 0 | 1,577 | 0 | 21,259 | 0 | 125,312 | 447 | 2.0 | 0.2 | 22.2 | 22.5 | 0.00 | 0.17 | A1042, $27.50 |
| `checkout-steps` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 11 | 0 | 3,716 | 0 | 14,060 | 0 | 145,408 | 487 | 2.0 | 0.2 | 26.3 | 26.5 | 0.00 | 0.15 | Order #A1042; $27.50 |
| `checkout-steps` | Chrome DevTools MCP | 1 | success | 1 | 9 | 0 | 3,889 | 0 | 29,167 | 0 | 158,208 | 694 | 2.0 | 0.3 | 25.5 | 25.8 | 0.00 | 0.16 | Order #A1042; $27.50 |
| `checkout-steps` | browser-use (MCP) | 1 | wrong_answer | 1 | 13 | 0 | 3,545 | 2 | 8,627 | 0 | 123,392 | 693 | 12.0 | 0.2 | 21.9 | 22.1 | 0.00 | 0.14 | fixture check failed (39 observations) |
| `checkout-steps` | Screenshots (click by x,y) | 1 | success | 1 | 20 | 0 | 329 | 7 | 12,734 | 0 | 292,992 | 1,437 | 2.0 | 0.2 | 44.1 | 44.3 | 0.00 | 0.15 | Order #A1042; total charged: $27.50. |
| `booking-date` | Mantis | 1 | success | 1 | 5 | 0 | 641 | 0 | 23,916 | 0 | 57,088 | 301 | 2.0 | 0.2 | 15.6 | 15.9 | 0.00 | 0.15 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 2,187 | 0 | 6,460 | 0 | 87,168 | 366 | 2.0 | 0.3 | 15.2 | 15.4 | 0.00 | 0.15 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 3 | 1 | 336 | 0 | 28,768 | 0 | 111,488 | 499 | 2.0 | 0.2 | 22.5 | 22.7 | 0.00 | 0.14 | fixture check failed (1 observations) |
| `booking-date` | browser-use (MCP) | 1 | success | 1 | 10 | 0 | 3,123 | 3 | 16,850 | 0 | 102,912 | 574 | 12.0 | 0.3 | 20.5 | 20.8 | 0.00 | 0.16 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Screenshots (click by x,y) | 1 | success | 1 | 26 | 1 | 418 | 8 | 25,028 | 0 | 183,040 | 1,549 | 2.0 | 0.2 | 50.6 | 50.8 | 0.00 | 0.13 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `article-deep-fact` | Mantis | 1 | success | 1 | 3 | 0 | 5,854 | 0 | 12,320 | 0 | 57,344 | 226 | 2.0 | 0.2 | 12.1 | 12.4 | 0.00 | 0.21 | 1874 |
| `article-deep-fact` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 6,099 | 0 | 7,711 | 0 | 37,632 | 168 | 2.0 | 0.2 | 13.6 | 13.8 | 0.00 | 0.14 | 1874 |
| `article-deep-fact` | Chrome DevTools MCP | 1 | success | 1 | 3 | 0 | 6,008 | 0 | 11,125 | 0 | 72,960 | 289 | 2.0 | 0.3 | 14.4 | 14.7 | 0.00 | 0.14 | 1874 |
| `article-deep-fact` | browser-use (MCP) | 1 | success | 1 | 3 | 0 | 780 | 1 | 12,037 | 0 | 42,752 | 226 | 12.0 | 0.2 | 42.3 | 42.5 | 0.00 | 0.15 | 1874 |
| `article-deep-fact` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 113 | 2 | 9,480 | 0 | 73,600 | 429 | 2.0 | 0.3 | 20.1 | 20.4 | 0.00 | 0.14 | 1874 |
| `inventory-lookup` | Mantis | 1 | success | 1 | 1 | 0 | 1,447 | 0 | 11,995 | 0 | 31,744 | 184 | 2.0 | 0.2 | 9.3 | 9.5 | 0.00 | 0.14 | W-1203, 113 in stock |
| `inventory-lookup` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 5,832 | 0 | 10,289 | 0 | 35,840 | 179 | 2.0 | 0.2 | 9.3 | 9.6 | 0.00 | 0.14 | W-1203, 113 in stock |
| `inventory-lookup` | Chrome DevTools MCP | 1 | success | 1 | 2 | 0 | 4,458 | 0 | 28,277 | 0 | 88,576 | 438 | 2.0 | 0.3 | 21.8 | 22.1 | 0.00 | 0.16 | W-1203, 113 in stock |
| `inventory-lookup` | browser-use (MCP) | 1 | success | 1 | 2 | 0 | 13,316 | 0 | 15,062 | 0 | 30,720 | 234 | 12.0 | 0.2 | 10.0 | 10.3 | 0.00 | 0.16 | SKU W-1203; 113 in stock |
| `inventory-lookup` | Screenshots (click by x,y) | 1 | success | 1 | 5 | 0 | 114 | 3 | 24,594 | 0 | 62,080 | 465 | 2.0 | 0.2 | 19.5 | 19.8 | 0.00 | 0.22 | W-1203, 113 in stock |
| `churned-max` | Mantis | 1 | success | 1 | 1 | 0 | 5,534 | 0 | 21,324 | 0 | 23,808 | 180 | 2.0 | 0.2 | 11.0 | 11.2 | 0.00 | 0.15 | Acme 6 — $9,950 |
| `churned-max` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 18,570 | 0 | 14,820 | 0 | 35,328 | 180 | 2.0 | 0.2 | 9.1 | 9.3 | 0.00 | 0.13 | Acme 6 — $9,950 |
| `churned-max` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 3 | 0 | 455 | 0 | 15,787 | 0 | 86,528 | 364 | 2.0 | 0.2 | 16.7 | 17.0 | 0.00 | 0.14 | answer did not match the expected result |
| `churned-max` | browser-use (MCP) | 1 | wrong_answer | 1 | 2 | 0 | 35,254 | 0 | 20,935 | 0 | 34,304 | 182 | 12.0 | 0.2 | 14.6 | 14.8 | 0.00 | 0.14 | answer did not match the expected result |
| `churned-max` | Screenshots (click by x,y) | 1 | wrong_answer | 1 | 2 | 0 | 96 | 1 | 8,256 | 0 | 40,704 | 269 | 2.0 | 0.3 | 12.4 | 12.7 | 0.00 | 0.22 | answer did not match the expected result |
| `search-pagination` | Mantis | 1 | success | 1 | 5 | 0 | 1,800 | 0 | 21,665 | 0 | 73,728 | 306 | 2.0 | 0.2 | 17.1 | 17.3 | 0.00 | 0.17 | dana.r. |
| `search-pagination` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 10 | 0 | 8,635 | 0 | 20,024 | 0 | 136,192 | 445 | 2.0 | 0.2 | 25.4 | 25.6 | 0.00 | 0.20 | dana.r. |
| `search-pagination` | Chrome DevTools MCP | 1 | success | 1 | 7 | 0 | 10,687 | 0 | 24,270 | 0 | 125,824 | 399 | 2.0 | 0.3 | 37.6 | 37.9 | 0.00 | 0.15 | dana.r |
| `search-pagination` | browser-use (MCP) | 1 | wrong_answer | 1 | 10 | 0 | 8,913 | 0 | 14,211 | 0 | 133,120 | 433 | 12.0 | 0.3 | 22.9 | 23.2 | 0.00 | 0.18 | answer did not match the expected result |
| `search-pagination` | Screenshots (click by x,y) | 1 | success | 1 | 10 | 0 | 183 | 5 | 28,511 | 0 | 131,072 | 749 | 2.1 | 0.3 | 25.6 | 25.9 | 0.00 | 0.13 | dana.r |
| `feed-scroll` | Mantis | 1 | success | 1 | 10 | 0 | 6,350 | 0 | 20,310 | 0 | 147,200 | 459 | 2.0 | 0.2 | 31.9 | 32.2 | 0.00 | 0.15 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 9 | 1 | 14,798 | 0 | 26,970 | 0 | 117,504 | 383 | 2.0 | 0.3 | 27.9 | 28.2 | 0.00 | 0.13 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Chrome DevTools MCP | 1 | success | 1 | 8 | 1 | 12,942 | 0 | 28,831 | 0 | 152,320 | 598 | 2.0 | 0.3 | 32.9 | 33.1 | 0.00 | 0.14 | The meeting moved to Thursday at noon. |
| `feed-scroll` | browser-use (MCP) | 1 | success | 1 | 19 | 0 | 1,821 | 7 | 18,337 | 0 | 292,992 | 918 | 12.0 | 0.2 | 37.0 | 37.2 | 0.00 | 0.15 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Screenshots (click by x,y) | 1 | success | 1 | 12 | 0 | 169 | 5 | 23,458 | 0 | 164,480 | 940 | 2.0 | 0.2 | 29.0 | 29.2 | 0.00 | 0.15 | The meeting moved to Thursday at noon. |
| `modal-delete` | Mantis | 1 | success | 1 | 3 | 0 | 618 | 0 | 7,093 | 0 | 60,928 | 234 | 2.0 | 0.2 | 12.2 | 12.4 | 0.00 | 0.18 | Old report was moved to trash. |
| `modal-delete` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 3,007 | 0 | 11,325 | 0 | 82,944 | 303 | 2.0 | 0.2 | 19.9 | 20.1 | 0.00 | 0.16 | Old report was moved to trash. |
| `modal-delete` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 3 | 1 | 318 | 0 | 19,114 | 0 | 78,848 | 394 | 2.0 | 0.3 | 19.7 | 20.0 | 0.00 | 0.15 | fixture check failed (1 observations) |
| `modal-delete` | browser-use (MCP) | 1 | wrong_answer | 1 | 6 | 0 | 2,847 | 0 | 17,573 | 0 | 70,400 | 323 | 12.0 | 0.3 | 18.1 | 18.4 | 0.00 | 0.16 | answer did not match the expected result |
| `modal-delete` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 135 | 3 | 15,273 | 0 | 93,056 | 483 | 2.0 | 0.3 | 20.9 | 21.2 | 0.00 | 0.14 | Old report was moved to trash. |
| `menu-settings` | Mantis | 1 | success | 1 | 5 | 0 | 734 | 0 | 11,755 | 0 | 81,792 | 283 | 2.0 | 0.2 | 15.6 | 15.8 | 0.00 | 0.24 | “Theme saved: Dark” |
| `menu-settings` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 9 | 0 | 3,449 | 0 | 19,473 | 0 | 113,152 | 393 | 2.0 | 0.2 | 24.1 | 24.4 | 0.00 | 0.13 | Theme saved: Dark |
| `menu-settings` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 2 | 0 | 252 | 0 | 14,591 | 0 | 88,064 | 354 | 2.0 | 0.3 | 16.4 | 16.7 | 0.00 | 0.13 | fixture check failed (1 observations) |
| `menu-settings` | browser-use (MCP) | 1 | wrong_answer | 1 | 9 | 0 | 3,868 | 0 | 7,220 | 0 | 117,120 | 380 | 12.0 | 0.2 | 22.4 | 22.6 | 0.00 | 0.17 | answer did not match the expected result |
| `menu-settings` | Screenshots (click by x,y) | 1 | wrong_answer | 1 | 13 | 0 | 216 | 6 | 43,418 | 0 | 159,872 | 1,007 | 2.0 | 0.2 | 45.1 | 45.4 | 0.00 | 0.14 | fixture check failed (13 observations) |
| `spa-team` | Mantis | 1 | success | 1 | 3 | 0 | 643 | 0 | 14,985 | 0 | 53,120 | 215 | 2.0 | 0.2 | 12.1 | 12.4 | 0.00 | 0.14 | mia@example.com |
| `spa-team` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 2,928 | 0 | 6,785 | 0 | 87,168 | 284 | 2.0 | 0.4 | 15.1 | 15.5 | 0.00 | 0.14 | mia@example.com |
| `spa-team` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 1 | 0 | 122 | 0 | 11,856 | 0 | 72,960 | 280 | 2.0 | 0.2 | 13.3 | 13.5 | 0.00 | 0.14 | fixture check failed (1 observations) |
| `spa-team` | browser-use (MCP) | 1 | success | 1 | 8 | 0 | 2,939 | 2 | 17,290 | 0 | 99,200 | 408 | 12.0 | 0.2 | 21.6 | 21.9 | 0.00 | 0.14 | mia@example.com |
| `spa-team` | Screenshots (click by x,y) | 1 | wrong_answer | 1 | 4 | 0 | 112 | 2 | 17,271 | 0 | 61,056 | 416 | 2.0 | 0.3 | 14.2 | 14.5 | 0.00 | 0.16 | fixture check failed (3 observations) |
| `plans-pick` | Mantis | 1 | success | 1 | 3 | 0 | 542 | 0 | 12,177 | 0 | 55,808 | 220 | 2.0 | 0.3 | 44.3 | 44.6 | 0.00 | 0.13 | PRO-77 |
| `plans-pick` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 1,627 | 0 | 10,336 | 0 | 58,112 | 216 | 2.0 | 0.2 | 13.8 | 14.1 | 0.00 | 0.14 | PRO-77 |
| `plans-pick` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 3 | 1 | 314 | 0 | 19,258 | 0 | 99,328 | 430 | 2.0 | 0.3 | 17.3 | 17.5 | 0.00 | 0.15 | fixture check failed (1 observations) |
| `plans-pick` | browser-use (MCP) | 1 | success | 1 | 4 | 0 | 2,935 | 0 | 9,333 | 0 | 55,552 | 217 | 12.0 | 0.2 | 15.3 | 15.6 | 0.00 | 0.15 | PRO-77 |
| `plans-pick` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 112 | 2 | 18,451 | 0 | 59,776 | 370 | 2.0 | 0.2 | 14.6 | 14.8 | 0.00 | 0.14 | PRO-77 |
| `faq-refund` | Mantis | 1 | success | 1 | 3 | 0 | 841 | 0 | 10,994 | 0 | 57,088 | 225 | 2.0 | 0.2 | 12.3 | 12.5 | 0.00 | 0.16 | 30 days |
| `faq-refund` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 1,772 | 0 | 5,924 | 0 | 62,592 | 226 | 2.0 | 0.3 | 12.9 | 13.2 | 0.00 | 0.13 | 30 days |
| `faq-refund` | Chrome DevTools MCP | 1 | success | 1 | 4 | 0 | 1,311 | 0 | 23,184 | 0 | 96,000 | 452 | 2.0 | 0.3 | 21.7 | 22.0 | 0.00 | 0.15 | 30 days |
| `faq-refund` | browser-use (MCP) | 1 | success | 1 | 5 | 0 | 2,085 | 1 | 11,842 | 0 | 65,152 | 288 | 12.0 | 0.2 | 23.8 | 24.0 | 0.00 | 0.17 | 30 days |
| `faq-refund` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 111 | 2 | 6,291 | 0 | 71,936 | 374 | 2.0 | 0.4 | 13.5 | 13.8 | 0.00 | 0.31 | 30 days after purchase. |
| `iframe-pay` | Mantis | 1 | success | 1 | 5 | 0 | 740 | 0 | 13,307 | 0 | 67,840 | 297 | 2.0 | 0.2 | 15.6 | 15.8 | 0.00 | 0.14 | R-5531 |
| `iframe-pay` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 2,379 | 0 | 8,679 | 0 | 72,960 | 338 | 2.0 | 0.2 | 15.7 | 16.0 | 0.00 | 0.13 | R-5531 |
| `iframe-pay` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 3 | 1 | 425 | 0 | 48,289 | 0 | 69,504 | 475 | 2.0 | 0.2 | 21.7 | 21.9 | 0.00 | 0.15 | fixture check failed (2 observations) |
| `iframe-pay` | browser-use (MCP) | 1 | success | 1 | 8 | 0 | 3,219 | 3 | 17,220 | 0 | 77,312 | 428 | 12.0 | 0.2 | 26.2 | 26.4 | 0.00 | 0.13 | R-5531 |
| `iframe-pay` | Screenshots (click by x,y) | 1 | success | 1 | 11 | 0 | 224 | 3 | 6,660 | 0 | 84,736 | 533 | 2.0 | 0.2 | 17.8 | 18.1 | 0.00 | 0.16 | R-5531 |
| `chart-march` | Mantis | 1 | success | 1 | 3 | 0 | 460 | 0 | 7,559 | 0 | 60,288 | 193 | 2.0 | 0.3 | 12.1 | 12.3 | 0.00 | 0.14 | 42 |
| `chart-march` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 3 | 0 | 928 | 1 | 10,442 | 0 | 46,720 | 236 | 2.0 | 0.2 | 17.0 | 17.3 | 0.00 | 0.17 | 42 |
| `chart-march` | Chrome DevTools MCP | 1 | wrong_answer | 1 | 3 | 0 | 495 | 0 | 15,868 | 0 | 81,920 | 408 | 2.0 | 0.3 | 17.0 | 17.2 | 0.00 | 0.15 | answer did not match the expected result |
| `chart-march` | browser-use (MCP) | 1 | success | 1 | 2 | 0 | 817 | 1 | 8,123 | 0 | 34,304 | 227 | 12.0 | 0.2 | 10.8 | 11.0 | 0.00 | 0.13 | 42 |
| `chart-march` | Screenshots (click by x,y) | 1 | wrong_answer | 1 | 2 | 0 | 0 | 2 | 5,137 | 0 | 34,816 | 286 | 2.0 | 0.3 | 9.5 | 9.8 | 0.00 | 0.13 | fixture check failed (0 observations) |
