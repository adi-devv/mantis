# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6.1-sol`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

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
| Correct | 22 / 22 | 22 / 22 | 22 / 22 | 22 / 22 | 20 / 22 |
| Connection-failure attempts | 0 | 0 | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 | 0 | 2 |
| Tool calls (including retries) | 89 | 120 | 86 | 161 | 186 |
| MCP tool errors (including retries) | 0 | 0 | 1 | 0 | 3 |
| Browser observation text (observed chars) | 44,255 | 99,037 | 788,121 | 238,232 | 3,798 |
| Browser observation images (observed blocks) | 0 | 1 | 0 | 43 | 64 |
| Normal input tokens (total) | 288,406 | 305,009 | 484,531 | 501,315 | 388,594 |
| Cache-write input tokens (total) | 0 | 0 | 0 | 0 | 0 |
| Cache-read input tokens (total) | 1,287,808 | 1,195,776 | 1,467,392 | 1,300,096 | 1,470,592 |
| Output tokens (total) | 5,564 | 5,306 | 6,390 | 7,100 | 8,853 |
| Total input tokens incl. cache (legacy) | 1,576,214 | 1,500,785 | 1,951,923 | 1,801,411 | 1,859,186 |
| MCP startup (total, s) | 44.5 | 44.4 | 45.0 | 264.3 | 44.4 |
| CLI startup (total, s) | 6.5 | 7.3 | 6.5 | 5.8 | 6.7 |
| CLI execution (total, s) | 415.6 | 403.1 | 467.7 | 477.2 | 521.6 |
| CLI wall (total, s) | 422.1 | 410.4 | 474.2 | 483.0 | 528.3 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 3.9 | 3.7 | 3.6 | 3.7 | 3.9 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown | unknown | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `form-subscribe` | Mantis | 1 | success | 1 | 4 | 0 | 611 | 0 | 22,471 | 0 | 43,392 | 253 | 2.1 | 0.7 | 18.2 | 18.9 | 0.00 | 0.26 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 2,079 | 0 | 25,688 | 0 | 34,304 | 255 | 2.1 | 0.7 | 14.7 | 15.4 | 0.00 | 0.26 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Chrome DevTools MCP | 1 | success | 1 | 4 | 0 | 2,601 | 0 | 15,432 | 0 | 88,704 | 337 | 2.1 | 0.7 | 20.2 | 20.9 | 0.00 | 0.27 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | browser-use (MCP) | 1 | success | 1 | 10 | 0 | 3,337 | 4 | 36,511 | 0 | 109,696 | 440 | 12.0 | 0.4 | 27.4 | 27.8 | 0.00 | 0.20 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Screenshots (click by x,y) | 1 | success | 1 | 9 | 0 | 176 | 3 | 14,506 | 0 | 68,608 | 422 | 2.1 | 0.7 | 24.1 | 24.7 | 0.00 | 0.15 | Subscribed from Canada (weekly: yes). |
| `wikipedia-birthdate` | Mantis | 1 | success | 1 | 1 | 0 | 2,750 | 0 | 22,417 | 0 | 20,736 | 132 | 2.0 | 0.3 | 19.6 | 19.9 | 0.00 | 0.18 | 23 June 1912 |
| `wikipedia-birthdate` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 2,310 | 0 | 13,533 | 0 | 33,536 | 132 | 2.0 | 0.3 | 20.3 | 20.7 | 0.00 | 0.17 | 23 June 1912 |
| `wikipedia-birthdate` | Chrome DevTools MCP | 1 | success | 1 | 2 | 0 | 658,606 | 0 | 47,226 | 0 | 20,608 | 168 | 2.0 | 0.3 | 19.2 | 19.5 | 0.00 | 0.14 | 23 June 1912 |
| `wikipedia-birthdate` | browser-use (MCP) | 1 | success | 1 | 2 | 0 | 26,056 | 0 | 11,740 | 0 | 58,496 | 268 | 12.0 | 0.4 | 23.5 | 23.9 | 0.00 | 0.17 | 23 June 1912 |
| `wikipedia-birthdate` | Screenshots (click by x,y) | 1 | success | 1 | 2 | 0 | 54 | 1 | 12,450 | 0 | 29,440 | 215 | 2.0 | 0.6 | 12.9 | 13.6 | 0.00 | 0.17 | 23 June 1912 |
| `login` | Mantis | 1 | success | 1 | 5 | 0 | 964 | 0 | 6,087 | 0 | 48,512 | 261 | 2.0 | 0.4 | 14.7 | 15.1 | 0.00 | 0.15 | Signed in |
| `login` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 2,160 | 0 | 13,876 | 0 | 46,208 | 243 | 2.0 | 0.2 | 16.4 | 16.7 | 0.00 | 0.15 | Signed in |
| `login` | Chrome DevTools MCP | 1 | success | 1 | 4 | 0 | 1,796 | 0 | 26,667 | 0 | 59,392 | 321 | 2.0 | 0.3 | 20.5 | 20.7 | 0.00 | 0.17 | Signed in |
| `login` | browser-use (MCP) | 1 | success | 1 | 7 | 0 | 2,260 | 2 | 24,889 | 0 | 54,912 | 276 | 12.0 | 0.3 | 19.3 | 19.6 | 0.00 | 0.15 | Signed in |
| `login` | Screenshots (click by x,y) | 1 | success | 1 | 8 | 0 | 202 | 2 | 6,307 | 0 | 76,672 | 366 | 2.0 | 0.3 | 24.1 | 24.4 | 0.00 | 0.19 | Signed in |
| `cookie-cart` | Mantis | 1 | success | 1 | 3 | 0 | 518 | 0 | 24,321 | 0 | 52,864 | 259 | 2.0 | 0.3 | 18.4 | 18.6 | 0.00 | 0.17 | Added to cart (1 item). |
| `cookie-cart` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 1,764 | 0 | 13,919 | 0 | 58,752 | 232 | 2.0 | 0.3 | 19.4 | 19.6 | 0.00 | 0.17 | Added to cart (1 item). |
| `cookie-cart` | Chrome DevTools MCP | 1 | success | 1 | 4 | 0 | 1,523 | 0 | 14,721 | 0 | 70,272 | 273 | 2.0 | 0.3 | 21.2 | 21.5 | 0.00 | 0.14 | Added to cart (1 item). |
| `cookie-cart` | browser-use (MCP) | 1 | success | 1 | 6 | 0 | 2,481 | 1 | 6,095 | 0 | 52,352 | 260 | 12.0 | 0.2 | 18.2 | 18.4 | 0.00 | 0.17 | Added to cart (1 item). |
| `cookie-cart` | Screenshots (click by x,y) | 1 | success | 1 | 5 | 0 | 134 | 2 | 15,441 | 0 | 55,424 | 319 | 2.0 | 0.2 | 21.9 | 22.1 | 0.00 | 0.20 | Added to cart (1 item). |
| `longlist-item` | Mantis | 1 | success | 1 | 3 | 0 | 1,242 | 0 | 13,365 | 0 | 54,656 | 231 | 2.0 | 0.4 | 17.2 | 17.6 | 0.00 | 0.24 | Detail for item 150 |
| `longlist-item` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 1,198 | 0 | 25,670 | 0 | 21,632 | 198 | 2.0 | 0.2 | 12.2 | 12.4 | 0.00 | 0.18 | Detail for item 150 |
| `longlist-item` | Chrome DevTools MCP | 1 | success | 1 | 3 | 0 | 21,738 | 0 | 35,378 | 0 | 55,936 | 244 | 2.0 | 0.3 | 17.3 | 17.6 | 0.00 | 0.16 | Detail for item 150 |
| `longlist-item` | browser-use (MCP) | 1 | success | 1 | 7 | 0 | 11,860 | 2 | 34,754 | 0 | 69,248 | 281 | 12.0 | 0.4 | 21.8 | 22.2 | 0.00 | 0.14 | Detail for item 150 |
| `longlist-item` | Screenshots (click by x,y) | 1 | success | 1 | 7 | 0 | 154 | 3 | 14,592 | 0 | 68,480 | 312 | 2.0 | 0.3 | 21.7 | 22.0 | 0.00 | 0.18 | Detail for item 150 |
| `pricing-team` | Mantis | 1 | success | 1 | 2 | 0 | 794 | 0 | 5,850 | 0 | 48,640 | 179 | 2.0 | 0.3 | 14.8 | 15.0 | 0.00 | 0.16 | $29 per month |
| `pricing-team` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 2,205 | 0 | 7,223 | 0 | 52,864 | 190 | 2.0 | 0.3 | 17.7 | 18.0 | 0.00 | 0.13 | $29 per month |
| `pricing-team` | Chrome DevTools MCP | 1 | success | 1 | 3 | 0 | 2,005 | 0 | 14,697 | 0 | 56,960 | 232 | 2.0 | 0.3 | 16.7 | 17.0 | 0.00 | 0.13 | $29 per month |
| `pricing-team` | browser-use (MCP) | 1 | success | 1 | 5 | 0 | 2,071 | 2 | 26,162 | 0 | 56,320 | 236 | 12.0 | 0.2 | 15.9 | 16.1 | 0.00 | 0.14 | $29 per month |
| `pricing-team` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 116 | 2 | 24,142 | 0 | 45,568 | 294 | 2.0 | 0.2 | 18.0 | 18.3 | 0.00 | 0.15 | $29 per month |
| `dashboard-refresh` | Mantis | 1 | success | 1 | 3 | 0 | 11,096 | 0 | 16,664 | 0 | 43,904 | 207 | 2.1 | 0.3 | 15.3 | 15.6 | 0.00 | 0.16 | Last updated: just now. Initech 3: $4,218. |
| `dashboard-refresh` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 20,037 | 0 | 23,837 | 0 | 48,256 | 208 | 2.0 | 0.2 | 15.9 | 16.1 | 0.00 | 0.16 | Last updated: just now; Initech 3 amount: $4,218. |
| `dashboard-refresh` | Chrome DevTools MCP | 1 | success | 1 | 3 | 0 | 25,506 | 0 | 20,564 | 0 | 81,280 | 282 | 2.0 | 0.2 | 20.5 | 20.7 | 0.00 | 0.14 | Last updated: just now. Initech 3: $4,218. |
| `dashboard-refresh` | browser-use (MCP) | 1 | success | 1 | 4 | 0 | 70,553 | 1 | 19,480 | 0 | 54,272 | 277 | 12.0 | 0.3 | 16.9 | 17.1 | 0.00 | 0.18 | Last updated: just now. Initech 3: $4,218. |
| `dashboard-refresh` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 135 | 3 | 15,076 | 0 | 94,848 | 401 | 2.0 | 0.4 | 25.1 | 25.5 | 0.00 | 0.20 | Last updated: just now. Initech 3: $4,218. |
| `signup-validation` | Mantis | 1 | success | 1 | 9 | 0 | 1,116 | 0 | 12,926 | 0 | 53,760 | 407 | 2.1 | 0.3 | 20.4 | 20.7 | 0.00 | 0.16 | Welcome, new@example.com. Your account is ready. |
| `signup-validation` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 8 | 0 | 2,759 | 0 | 6,281 | 0 | 67,328 | 429 | 2.0 | 0.2 | 25.3 | 25.5 | 0.00 | 0.13 | Welcome, new@example.com. Your account is ready. |
| `signup-validation` | Chrome DevTools MCP | 1 | success | 1 | 6 | 0 | 2,143 | 0 | 16,529 | 0 | 97,920 | 508 | 2.0 | 0.3 | 31.9 | 32.1 | 0.00 | 0.14 | Welcome, new@example.com. Your account is ready. |
| `signup-validation` | browser-use (MCP) | 1 | success | 1 | 13 | 0 | 2,000 | 3 | 26,543 | 0 | 46,592 | 518 | 12.0 | 0.2 | 26.0 | 26.2 | 0.00 | 0.15 | Welcome, new@example.com. Your account is ready. |
| `signup-validation` | Screenshots (click by x,y) | 1 | wrong_answer | 1 | 18 | 2 | 423 | 3 | 19,468 | 0 | 64,128 | 623 | 2.0 | 0.3 | 28.7 | 29.0 | 0.00 | 0.21 | fixture check failed (135 observations) |
| `checkout-steps` | Mantis | 1 | success | 1 | 9 | 0 | 1,577 | 0 | 9,177 | 0 | 94,976 | 372 | 2.0 | 0.3 | 25.1 | 25.5 | 0.00 | 0.20 | Order #A1042; total charged: $27.50. |
| `checkout-steps` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 10 | 0 | 3,482 | 0 | 19,254 | 0 | 68,352 | 367 | 2.0 | 0.2 | 24.0 | 24.2 | 0.00 | 0.17 | Order #A1042 confirmed. Total charged: $27.50. |
| `checkout-steps` | Chrome DevTools MCP | 1 | success | 1 | 7 | 0 | 2,372 | 0 | 15,203 | 0 | 85,632 | 360 | 2.0 | 0.4 | 25.3 | 25.6 | 0.00 | 0.25 | Order #A1042; total charged: $27.50. |
| `checkout-steps` | browser-use (MCP) | 1 | success | 1 | 15 | 0 | 4,614 | 5 | 27,258 | 0 | 115,072 | 567 | 12.0 | 0.2 | 30.4 | 30.6 | 0.00 | 0.18 | Order #A1042 confirmed. Total charged: $27.50. |
| `checkout-steps` | Screenshots (click by x,y) | 1 | success | 1 | 15 | 0 | 266 | 5 | 16,523 | 0 | 96,128 | 491 | 2.0 | 0.3 | 28.5 | 28.8 | 0.00 | 0.15 | Order #A1042; total charged: $27.50. |
| `booking-date` | Mantis | 1 | success | 1 | 7 | 0 | 1,355 | 0 | 25,621 | 0 | 53,504 | 382 | 2.0 | 0.3 | 26.4 | 26.7 | 0.00 | 0.18 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 7 | 0 | 2,220 | 0 | 18,409 | 0 | 54,912 | 288 | 2.0 | 0.3 | 19.0 | 19.3 | 0.00 | 0.17 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Chrome DevTools MCP | 1 | success | 1 | 4 | 0 | 4,260 | 0 | 30,049 | 0 | 91,520 | 399 | 2.0 | 0.3 | 25.7 | 26.0 | 0.00 | 0.26 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | browser-use (MCP) | 1 | success | 1 | 14 | 0 | 2,358 | 5 | 30,372 | 0 | 99,328 | 602 | 12.0 | 0.2 | 37.4 | 37.7 | 0.00 | 0.16 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Screenshots (click by x,y) | 1 | success | 1 | 30 | 0 | 449 | 5 | 18,195 | 0 | 94,336 | 850 | 2.0 | 0.4 | 40.0 | 40.4 | 0.00 | 0.15 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `article-deep-fact` | Mantis | 1 | success | 1 | 3 | 0 | 5,833 | 0 | 7,191 | 0 | 66,560 | 204 | 2.0 | 0.4 | 18.4 | 18.8 | 0.00 | 0.31 | 1874 |
| `article-deep-fact` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 1,447 | 0 | 13,141 | 0 | 33,792 | 150 | 2.0 | 0.2 | 12.1 | 12.3 | 0.00 | 0.17 | 1874 |
| `article-deep-fact` | Chrome DevTools MCP | 1 | success | 1 | 2 | 0 | 5,862 | 0 | 24,574 | 0 | 34,176 | 228 | 2.0 | 0.3 | 15.6 | 15.9 | 0.00 | 0.13 | 1874 |
| `article-deep-fact` | browser-use (MCP) | 1 | success | 1 | 3 | 0 | 780 | 1 | 8,120 | 0 | 38,784 | 206 | 12.0 | 0.3 | 15.6 | 15.9 | 0.00 | 0.15 | 1874 |
| `article-deep-fact` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 1 | 173 | 2 | 6,870 | 0 | 63,616 | 321 | 2.0 | 0.3 | 19.2 | 19.4 | 0.00 | 0.19 | 1874 |
| `inventory-lookup` | Mantis | 1 | success | 1 | 1 | 0 | 1,447 | 0 | 13,086 | 0 | 41,600 | 212 | 2.0 | 0.2 | 14.8 | 15.0 | 0.00 | 0.19 | Widget 30 has SKU W-1203 and 113 in stock. |
| `inventory-lookup` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 5,832 | 0 | 10,855 | 0 | 38,016 | 158 | 2.0 | 0.4 | 12.0 | 12.4 | 0.00 | 0.16 | Widget 30 has SKU W-1203, with 113 in stock. |
| `inventory-lookup` | Chrome DevTools MCP | 1 | success | 1 | 2 | 0 | 4,446 | 0 | 28,054 | 0 | 33,920 | 227 | 2.0 | 0.3 | 13.7 | 14.0 | 0.00 | 0.19 | Widget 30 has SKU W-1203, with 113 in stock. |
| `inventory-lookup` | browser-use (MCP) | 1 | success | 1 | 2 | 0 | 13,317 | 0 | 9,327 | 0 | 28,928 | 148 | 12.0 | 0.3 | 11.7 | 12.0 | 0.00 | 0.23 | Widget 30 has SKU W-1203, with 113 in stock. |
| `inventory-lookup` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 114 | 2 | 26,027 | 0 | 43,776 | 301 | 2.0 | 0.2 | 17.9 | 18.1 | 0.00 | 0.28 | Widget 30 has SKU W-1203 and 113 in stock. |
| `churned-max` | Mantis | 1 | success | 1 | 2 | 0 | 6,140 | 0 | 10,394 | 0 | 63,488 | 235 | 2.0 | 0.2 | 17.4 | 17.6 | 0.00 | 0.15 | Acme 6 — $9,950 |
| `churned-max` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 2 | 0 | 18,570 | 0 | 10,906 | 0 | 41,984 | 150 | 2.0 | 0.2 | 13.6 | 13.8 | 0.00 | 0.13 | Acme 6 — $9,950 |
| `churned-max` | Chrome DevTools MCP | 1 | success | 1 | 2 | 0 | 12,879 | 0 | 10,465 | 0 | 53,504 | 179 | 2.0 | 0.3 | 13.5 | 13.8 | 0.00 | 0.18 | Acme 6 — $9,950 |
| `churned-max` | browser-use (MCP) | 1 | success | 1 | 3 | 0 | 70,411 | 0 | 26,703 | 0 | 46,080 | 249 | 12.0 | 0.2 | 14.1 | 14.4 | 0.00 | 0.16 | Acme 6 — $9,950 |
| `churned-max` | Screenshots (click by x,y) | 1 | success | 1 | 8 | 0 | 133 | 4 | 29,443 | 0 | 82,816 | 521 | 2.0 | 0.3 | 27.2 | 27.5 | 0.00 | 0.15 | Acme 6 — $9,950 |
| `search-pagination` | Mantis | 1 | success | 1 | 5 | 0 | 1,800 | 0 | 11,120 | 0 | 81,664 | 253 | 2.0 | 0.3 | 19.6 | 19.8 | 0.00 | 0.15 | dana.r. |
| `search-pagination` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 10 | 0 | 8,635 | 0 | 21,576 | 0 | 84,992 | 310 | 2.0 | 0.3 | 25.0 | 25.2 | 0.00 | 0.17 | dana.r. |
| `search-pagination` | Chrome DevTools MCP | 1 | success | 1 | 6 | 0 | 10,630 | 0 | 34,373 | 0 | 75,776 | 291 | 2.0 | 0.3 | 23.5 | 23.8 | 0.00 | 0.15 | dana.r. |
| `search-pagination` | browser-use (MCP) | 1 | success | 1 | 11 | 0 | 8,978 | 1 | 23,867 | 0 | 67,072 | 345 | 12.0 | 0.2 | 30.1 | 30.3 | 0.00 | 0.18 | dana.r |
| `search-pagination` | Screenshots (click by x,y) | 1 | success | 1 | 10 | 0 | 183 | 5 | 18,109 | 0 | 94,336 | 504 | 2.0 | 0.3 | 29.8 | 30.1 | 0.00 | 0.17 | dana.r |
| `feed-scroll` | Mantis | 1 | success | 1 | 7 | 0 | 2,215 | 0 | 26,898 | 0 | 92,544 | 309 | 2.0 | 0.2 | 25.6 | 25.9 | 0.00 | 0.18 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 13 | 0 | 8,249 | 0 | 18,100 | 0 | 73,216 | 358 | 2.0 | 0.2 | 24.0 | 24.3 | 0.00 | 0.20 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Chrome DevTools MCP | 1 | success | 1 | 5 | 0 | 10,601 | 0 | 33,365 | 0 | 72,576 | 267 | 2.0 | 0.3 | 22.2 | 22.4 | 0.00 | 0.17 | The meeting moved to Thursday at noon. |
| `feed-scroll` | browser-use (MCP) | 1 | success | 1 | 16 | 0 | 1,111 | 5 | 16,855 | 0 | 85,632 | 564 | 12.0 | 0.3 | 28.8 | 29.1 | 0.00 | 0.20 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Screenshots (click by x,y) | 1 | success | 1 | 13 | 0 | 193 | 4 | 9,354 | 0 | 88,448 | 394 | 2.0 | 0.3 | 25.6 | 25.9 | 0.00 | 0.19 | The meeting moved to Thursday at noon. |
| `modal-delete` | Mantis | 1 | success | 1 | 3 | 0 | 618 | 0 | 12,827 | 0 | 64,384 | 255 | 2.0 | 0.3 | 19.0 | 19.2 | 0.00 | 0.16 | Old report was moved to trash. |
| `modal-delete` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 3,007 | 0 | 6,615 | 0 | 93,056 | 250 | 2.0 | 0.2 | 22.0 | 22.2 | 0.00 | 0.21 | Old report was moved to trash. |
| `modal-delete` | Chrome DevTools MCP | 1 | success | 1 | 4 | 0 | 1,987 | 0 | 17,181 | 0 | 86,272 | 329 | 2.0 | 0.2 | 26.5 | 26.7 | 0.00 | 0.17 | Old report was moved to trash. |
| `modal-delete` | browser-use (MCP) | 1 | success | 1 | 7 | 0 | 2,038 | 2 | 11,026 | 0 | 62,208 | 306 | 12.0 | 0.2 | 25.2 | 25.5 | 0.00 | 0.15 | Old report was moved to trash. |
| `modal-delete` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 135 | 3 | 17,025 | 0 | 69,504 | 371 | 2.0 | 0.2 | 24.3 | 24.6 | 0.00 | 0.17 | Old report was moved to trash. |
| `menu-settings` | Mantis | 1 | success | 1 | 5 | 0 | 734 | 0 | 6,919 | 0 | 84,352 | 252 | 2.0 | 0.2 | 23.3 | 23.6 | 0.00 | 0.15 | Theme saved: Dark |
| `menu-settings` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 9 | 0 | 3,449 | 0 | 19,832 | 0 | 66,944 | 283 | 2.0 | 1.4 | 24.7 | 26.1 | 0.00 | 0.16 | Theme saved: Dark |
| `menu-settings` | Chrome DevTools MCP | 1 | success | 1 | 6 | 0 | 2,653 | 0 | 14,926 | 0 | 72,192 | 290 | 2.5 | 0.6 | 20.8 | 21.4 | 0.00 | 0.13 | Theme saved: Dark |
| `menu-settings` | browser-use (MCP) | 1 | success | 1 | 9 | 0 | 2,881 | 1 | 6,716 | 0 | 64,640 | 305 | 12.0 | 0.2 | 22.9 | 23.1 | 0.00 | 0.16 | Theme saved: Dark |
| `menu-settings` | Screenshots (click by x,y) | 1 | success | 1 | 9 | 0 | 178 | 4 | 28,664 | 0 | 69,120 | 448 | 2.0 | 0.2 | 25.5 | 25.8 | 0.00 | 0.16 | Theme saved: Dark |
| `spa-team` | Mantis | 1 | success | 1 | 4 | 0 | 982 | 0 | 7,656 | 0 | 58,368 | 216 | 2.0 | 0.2 | 16.8 | 17.1 | 0.00 | 0.16 | mia@example.com |
| `spa-team` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 6 | 0 | 2,928 | 0 | 7,693 | 0 | 65,664 | 227 | 2.0 | 0.2 | 18.6 | 18.8 | 0.00 | 0.13 | mia@example.com |
| `spa-team` | Chrome DevTools MCP | 1 | success | 1 | 4 | 0 | 1,980 | 0 | 12,608 | 0 | 74,880 | 266 | 2.0 | 0.2 | 21.1 | 21.4 | 0.00 | 0.13 | mia@example.com |
| `spa-team` | browser-use (MCP) | 1 | success | 1 | 7 | 0 | 3,016 | 3 | 48,995 | 0 | 57,984 | 311 | 12.0 | 0.2 | 22.7 | 23.0 | 0.00 | 0.14 | mia@example.com |
| `spa-team` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 133 | 3 | 21,107 | 0 | 61,952 | 364 | 2.0 | 0.2 | 22.2 | 22.5 | 0.00 | 0.17 | mia@example.com |
| `plans-pick` | Mantis | 1 | success | 1 | 3 | 0 | 542 | 0 | 4,123 | 0 | 49,920 | 193 | 2.0 | 0.3 | 13.1 | 13.4 | 0.00 | 0.14 | PRO-77 |
| `plans-pick` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 1,627 | 0 | 6,933 | 0 | 52,864 | 193 | 2.0 | 0.2 | 14.0 | 14.3 | 0.00 | 0.15 | PRO-77 |
| `plans-pick` | Chrome DevTools MCP | 1 | success | 1 | 3 | 0 | 1,319 | 0 | 14,682 | 0 | 46,080 | 184 | 2.0 | 0.2 | 14.4 | 14.7 | 0.00 | 0.14 | PRO-77 |
| `plans-pick` | browser-use (MCP) | 1 | success | 1 | 4 | 0 | 2,935 | 0 | 4,876 | 0 | 40,704 | 180 | 12.0 | 0.2 | 14.1 | 14.4 | 0.00 | 0.18 | PRO-77 |
| `plans-pick` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 112 | 2 | 14,482 | 0 | 68,480 | 342 | 2.0 | 0.2 | 21.9 | 22.1 | 0.00 | 0.16 | PRO-77 |
| `faq-refund` | Mantis | 1 | success | 1 | 3 | 0 | 841 | 0 | 16,525 | 0 | 72,192 | 258 | 2.0 | 0.2 | 25.4 | 25.7 | 0.00 | 0.15 | Within 30 days of purchase. |
| `faq-refund` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 1,772 | 0 | 5,457 | 0 | 54,400 | 190 | 2.0 | 0.2 | 15.9 | 16.1 | 0.00 | 0.18 | Within 30 days of purchase. |
| `faq-refund` | Chrome DevTools MCP | 1 | success | 1 | 3 | 0 | 1,143 | 0 | 14,327 | 0 | 56,576 | 230 | 2.0 | 0.3 | 17.1 | 17.4 | 0.00 | 0.16 | Within 30 days of purchase. |
| `faq-refund` | browser-use (MCP) | 1 | success | 1 | 4 | 0 | 2,091 | 1 | 20,020 | 0 | 26,112 | 213 | 12.0 | 0.3 | 16.3 | 16.6 | 0.00 | 0.17 | Within 30 days of purchase. |
| `faq-refund` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 0 | 111 | 2 | 28,421 | 0 | 41,216 | 292 | 2.0 | 0.3 | 17.7 | 17.9 | 0.00 | 0.21 | Within 30 days of purchase. |
| `iframe-pay` | Mantis | 1 | success | 1 | 5 | 0 | 740 | 0 | 4,318 | 0 | 50,304 | 276 | 2.0 | 0.2 | 16.0 | 16.3 | 0.00 | 0.17 | R-5531 |
| `iframe-pay` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 5 | 0 | 2,379 | 0 | 9,902 | 0 | 50,432 | 294 | 2.0 | 0.3 | 20.1 | 20.3 | 0.00 | 0.13 | R-5531 |
| `iframe-pay` | Chrome DevTools MCP | 1 | success | 1 | 4 | 0 | 3,057 | 0 | 27,916 | 0 | 78,208 | 393 | 2.0 | 0.3 | 26.0 | 26.3 | 0.00 | 0.14 | R-5531 |
| `iframe-pay` | browser-use (MCP) | 1 | success | 1 | 9 | 0 | 2,202 | 2 | 28,502 | 0 | 44,928 | 358 | 12.0 | 0.2 | 23.3 | 23.6 | 0.00 | 0.15 | R-5531 |
| `iframe-pay` | Screenshots (click by x,y) | 1 | success | 1 | 10 | 0 | 224 | 2 | 27,150 | 0 | 42,752 | 404 | 2.0 | 0.3 | 25.6 | 25.9 | 0.00 | 0.16 | R-5531 |
| `chart-march` | Mantis | 1 | success | 1 | 2 | 0 | 340 | 0 | 8,450 | 0 | 47,488 | 218 | 2.0 | 0.2 | 16.0 | 16.2 | 0.00 | 0.14 | 42 units |
| `chart-march` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 3 | 0 | 928 | 1 | 6,309 | 0 | 54,272 | 201 | 2.0 | 0.2 | 16.4 | 16.7 | 0.00 | 0.17 | 42 units |
| `chart-march` | Chrome DevTools MCP | 1 | success | 1 | 5 | 1 | 9,014 | 0 | 15,594 | 0 | 75,008 | 382 | 2.0 | 0.2 | 34.7 | 35.0 | 0.00 | 0.16 | 42 units |
| `chart-march` | browser-use (MCP) | 1 | success | 1 | 3 | 0 | 882 | 2 | 52,504 | 0 | 20,736 | 190 | 12.0 | 0.2 | 15.4 | 15.7 | 0.00 | 0.16 | 42 units |
| `chart-march` | Screenshots (click by x,y) | 1 | wrong_answer | 1 | 2 | 0 | 0 | 2 | 5,242 | 0 | 50,944 | 298 | 2.0 | 0.2 | 19.6 | 19.8 | 0.00 | 0.13 | fixture check failed (0 observations) |
