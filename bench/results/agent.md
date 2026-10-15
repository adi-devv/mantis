# Real-agent eval

> Claude Code (`claude -p`, model `sonnet`) does each task with one browser approach at a time. "ok" = the final reply contains the expected answer. Tokens are everything the model read (input incl. cached) and wrote, as reported by Claude Code; cost is its API-price estimate. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-15; runs per task and approach: 1; 4 runs in parallel (times are wall-clock per run and include contention between parallel runs)
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Chrome DevTools MCP | browser-use (MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|---:|---:|
| Correct | 22 / 22 | 22 / 22 | 22 / 22 | 22 / 22 | 22 / 22 |
| Invalid runs (tool did not connect) | 0 | 0 | 0 | 0 | 0 |
| Tool calls (total) | 91 | 123 | 103 | 161 | 230 |
| Turns (total) | 113 | 145 | 125 | 183 | 252 |
| Input tokens (total) | 1,070,577 | 1,779,838 | 1,314,703 | 2,065,178 | 3,024,117 |
| Output tokens (total) | 8,364 | 11,112 | 11,895 | 14,768 | 18,908 |
| Time (total, s) | 360 | 406 | 469 | 569 | 677 |
| Cost estimate (USD) | 0.86 | 1.19 | 1.13 | 1.73 | 1.99 |

## Per run

| Task | Approach | Run | OK | Tool calls | Input tok | Output tok | Time (s) | Answer / error |
|---|---|---:|:-:|---:|---:|---:|---:|---|
| `form-subscribe` | Mantis | 1 | ✅ | 4 | 45,501 | 325 | 20 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Accessibility tree (Playwright MCP) | 1 | ✅ | 5 | 70,616 | 415 | 23 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Chrome DevTools MCP | 1 | ✅ | 4 | 48,888 | 383 | 21 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | browser-use (MCP) | 1 | ✅ | 6 | 66,863 | 477 | 23 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Screenshots (click by x,y) | 1 | ✅ | 19 | 258,420 | 1,285 | 46 | Subscribed from Canada (weekly: yes). |
| `wikipedia-birthdate` | Mantis | 1 | ✅ | 1 | 18,749 | 159 | 18 | Alan Turing was born on **23 June 1912**. |
| `wikipedia-birthdate` | Accessibility tree (Playwright MCP) | 1 | ✅ | 2 | 38,479 | 224 | 18 | Alan Turing was born on 23 June 1912. |
| `wikipedia-birthdate` | Chrome DevTools MCP | 1 | ✅ | 3 | 39,344 | 368 | 19 | Alan Turing was born on 23 June 1912. |
| `wikipedia-birthdate` | browser-use (MCP) | 1 | ✅ | 2 | 33,762 | 223 | 16 | Alan Turing was born on 23 June 1912. |
| `wikipedia-birthdate` | Screenshots (click by x,y) | 1 | ✅ | 2 | 23,239 | 232 | 11 | Alan Turing was born on 23 June 1912. |
| `login` | Mantis | 1 | ✅ | 5 | 55,350 | 408 | 17 | Signed in |
| `login` | Accessibility tree (Playwright MCP) | 1 | ✅ | 5 | 70,960 | 421 | 15 | Signed in |
| `login` | Chrome DevTools MCP | 1 | ✅ | 6 | 69,384 | 506 | 17 | Signed in |
| `login` | browser-use (MCP) | 1 | ✅ | 6 | 60,047 | 465 | 23 | Signed in |
| `login` | Screenshots (click by x,y) | 1 | ✅ | 9 | 88,216 | 630 | 23 | Signed in |
| `cookie-cart` | Mantis | 1 | ✅ | 3 | 36,157 | 250 | 12 | Added to cart (1 item). |
| `cookie-cart` | Accessibility tree (Playwright MCP) | 1 | ✅ | 5 | 70,593 | 411 | 15 | Added to cart (1 item). |
| `cookie-cart` | Chrome DevTools MCP | 1 | ✅ | 4 | 48,695 | 388 | 15 | Added to cart (1 item). |
| `cookie-cart` | browser-use (MCP) | 1 | ✅ | 6 | 71,269 | 499 | 21 | Added to cart (1 item). |
| `cookie-cart` | Screenshots (click by x,y) | 1 | ✅ | 7 | 74,959 | 527 | 20 | Added to cart (1 item). |
| `longlist-item` | Mantis | 1 | ✅ | 3 | 37,370 | 248 | 13 | Detail for item 150 |
| `longlist-item` | Accessibility tree (Playwright MCP) | 1 | ✅ | 5 | 70,330 | 382 | 16 | Detail for item 150 |
| `longlist-item` | Chrome DevTools MCP | 1 | ✅ | 3 | 58,282 | 313 | 13 | Detail for item 150 |
| `longlist-item` | browser-use (MCP) | 1 | ✅ | 10 | 156,634 | 757 | 25 | Detail for item 150 |
| `longlist-item` | Screenshots (click by x,y) | 1 | ✅ | 8 | 82,860 | 562 | 25 | Detail for item 150 |
| `pricing-team` | Mantis | 1 | ✅ | 2 | 27,094 | 193 | 10 | $29 per month |
| `pricing-team` | Accessibility tree (Playwright MCP) | 1 | ✅ | 4 | 58,569 | 331 | 12 | $29 per month |
| `pricing-team` | Chrome DevTools MCP | 1 | ✅ | 4 | 49,394 | 346 | 45 | $29 per month |
| `pricing-team` | browser-use (MCP) | 1 | ✅ | 5 | 51,559 | 338 | 18 | $29 per month |
| `pricing-team` | Screenshots (click by x,y) | 1 | ✅ | 4 | 42,273 | 288 | 23 | $29 per month |
| `dashboard-refresh` | Mantis | 1 | ✅ | 2 | 32,133 | 242 | 12 | Last updated: just now; Initech 3 amount: $4,218 |
| `dashboard-refresh` | Accessibility tree (Playwright MCP) | 1 | ✅ | 4 | 77,971 | 393 | 17 | Last updated: just now; Initech 3 amount: $4,218 |
| `dashboard-refresh` | Chrome DevTools MCP | 1 | ✅ | 3 | 54,911 | 396 | 16 | Last updated: just now; Initech 3 amount: $4,218 |
| `dashboard-refresh` | browser-use (MCP) | 1 | ✅ | 4 | 89,592 | 450 | 20 | Last updated: just now; Initech 3 amount: $4,218 |
| `dashboard-refresh` | Screenshots (click by x,y) | 1 | ✅ | 6 | 64,474 | 493 | 22 | Last updated: "just now"; Initech 3 amount: $4,218 |
| `signup-validation` | Mantis | 1 | ✅ | 8 | 84,480 | 704 | 26 | The first attempt failed with "Password must be at least 8 characters." After retrying with `longenough123`, the page says "Your account is ready." |
| `signup-validation` | Accessibility tree (Playwright MCP) | 1 | ✅ | 8 | 109,102 | 790 | 25 | The page says "Welcome, new@example.com" and "Your account is ready." |
| `signup-validation` | Chrome DevTools MCP | 1 | ✅ | 6 | 70,248 | 659 | 23 | Welcome, new@example.com — Your account is ready. |
| `signup-validation` | browser-use (MCP) | 1 | ✅ | 12 | 134,579 | 982 | 37 | "Welcome, new@example.com" and "Your account is ready." |
| `signup-validation` | Screenshots (click by x,y) | 1 | ✅ | 19 | 200,571 | 1,371 | 48 | "Welcome, new@example.com. Your account is ready." |
| `checkout-steps` | Mantis | 1 | ✅ | 9 | 94,972 | 641 | 24 | Order #A1042, total charged $27.50 |
| `checkout-steps` | Accessibility tree (Playwright MCP) | 1 | ✅ | 10 | 135,837 | 894 | 31 | Order number A1042, total charged $27.50. |
| `checkout-steps` | Chrome DevTools MCP | 1 | ✅ | 7 | 81,491 | 701 | 23 | Order #A1042, total charged $27.50 |
| `checkout-steps` | browser-use (MCP) | 1 | ✅ | 19 | 255,503 | 1,431 | 51 | Order #A1042, total charged $27.50 |
| `checkout-steps` | Screenshots (click by x,y) | 1 | ✅ | 27 | 416,383 | 1,910 | 67 | Order #A1042, total charged $27.50 |
| `booking-date` | Mantis | 1 | ✅ | 5 | 55,673 | 515 | 18 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Accessibility tree (Playwright MCP) | 1 | ✅ | 5 | 70,888 | 465 | 18 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Chrome DevTools MCP | 1 | ✅ | 5 | 60,436 | 511 | 20 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | browser-use (MCP) | 1 | ✅ | 11 | 147,766 | 959 | 33 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `booking-date` | Screenshots (click by x,y) | 1 | ✅ | 41 | 819,045 | 3,624 | 108 | Booked for 2026-12-24 at 19:00, 3 guests. |
| `article-deep-fact` | Mantis | 1 | ✅ | 3 | 36,597 | 239 | 12 | 1874 |
| `article-deep-fact` | Accessibility tree (Playwright MCP) | 1 | ✅ | 2 | 34,483 | 216 | 10 | 1874 |
| `article-deep-fact` | Chrome DevTools MCP | 1 | ✅ | 2 | 29,942 | 212 | 11 | 1874 |
| `article-deep-fact` | browser-use (MCP) | 1 | ✅ | 3 | 33,725 | 290 | 15 | 1874 |
| `article-deep-fact` | Screenshots (click by x,y) | 1 | ✅ | 4 | 42,209 | 322 | 26 | 1874 |
| `inventory-lookup` | Mantis | 1 | ✅ | 1 | 18,589 | 162 | 9 | Widget 30 has SKU W-1203 and 113 units in stock. |
| `inventory-lookup` | Accessibility tree (Playwright MCP) | 1 | ✅ | 2 | 34,349 | 226 | 10 | Widget 30 has SKU W-1203 and 113 units in stock. |
| `inventory-lookup` | Chrome DevTools MCP | 1 | ✅ | 2 | 30,375 | 221 | 11 | Widget 30 has SKU W-1203 and 113 units in stock. |
| `inventory-lookup` | browser-use (MCP) | 1 | ✅ | 2 | 29,364 | 218 | 13 | Widget 30 has SKU W-1203 and 113 units in stock. |
| `inventory-lookup` | Screenshots (click by x,y) | 1 | ✅ | 4 | 42,278 | 320 | 15 | Widget 30 has SKU W-1203 and 113 units in stock. |
| `churned-max` | Mantis | 1 | ✅ | 4 | 61,821 | 991 | 23 | Acme 6, $9,950 |
| `churned-max` | Accessibility tree (Playwright MCP) | 1 | ✅ | 2 | 40,880 | 864 | 15 | Acme 6, $9,950 |
| `churned-max` | Chrome DevTools MCP | 1 | ✅ | 4 | 70,803 | 1,321 | 27 | Acme 6, $9,950 |
| `churned-max` | browser-use (MCP) | 1 | ✅ | 10 | 141,024 | 1,972 | 46 | Acme 6, $9,950 |
| `churned-max` | Screenshots (click by x,y) | 1 | ✅ | 8 | 90,834 | 2,236 | 45 | Acme 6 with $9,950 |
| `search-pagination` | Mantis | 1 | ✅ | 8 | 87,293 | 663 | 23 | dana.r. |
| `search-pagination` | Accessibility tree (Playwright MCP) | 1 | ✅ | 11 | 150,564 | 869 | 27 | dana.r. |
| `search-pagination` | Chrome DevTools MCP | 1 | ✅ | 9 | 109,307 | 920 | 55 | dana.r. |
| `search-pagination` | browser-use (MCP) | 1 | ✅ | 10 | 142,714 | 925 | 34 | dana.r. |
| `search-pagination` | Screenshots (click by x,y) | 1 | ✅ | 11 | 131,499 | 794 | 28 | dana.r. |
| `feed-scroll` | Mantis | 1 | ✅ | 8 | 87,170 | 554 | 21 | "The meeting moved to Thursday at noon." |
| `feed-scroll` | Accessibility tree (Playwright MCP) | 1 | ✅ | 12 | 167,336 | 945 | 34 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Chrome DevTools MCP | 1 | ✅ | 8 | 97,021 | 716 | 27 | The meeting moved to Thursday at noon. |
| `feed-scroll` | browser-use (MCP) | 1 | ✅ | 16 | 186,634 | 1,279 | 42 | The meeting moved to Thursday at noon. |
| `feed-scroll` | Screenshots (click by x,y) | 1 | ✅ | 16 | 160,933 | 963 | 37 | "The meeting moved to Thursday at noon." |
| `modal-delete` | Mantis | 1 | ✅ | 3 | 36,300 | 288 | 13 | Old report was moved to trash. |
| `modal-delete` | Accessibility tree (Playwright MCP) | 1 | ✅ | 6 | 83,893 | 457 | 17 | Old report was moved to trash. |
| `modal-delete` | Chrome DevTools MCP | 1 | ✅ | 4 | 49,127 | 399 | 16 | Old report was moved to trash. |
| `modal-delete` | browser-use (MCP) | 1 | ✅ | 6 | 71,977 | 509 | 23 | Old report was moved to trash. |
| `modal-delete` | Screenshots (click by x,y) | 1 | ✅ | 7 | 74,908 | 528 | 20 | Old report was moved to trash. |
| `menu-settings` | Mantis | 1 | ✅ | 5 | 55,039 | 360 | 18 | Theme saved: Dark |
| `menu-settings` | Accessibility tree (Playwright MCP) | 1 | ✅ | 9 | 121,464 | 610 | 24 | "Theme saved: Dark" |
| `menu-settings` | Chrome DevTools MCP | 1 | ✅ | 7 | 79,871 | 564 | 19 | Theme saved: Dark |
| `menu-settings` | browser-use (MCP) | 1 | ✅ | 9 | 113,694 | 681 | 28 | Theme saved: Dark |
| `menu-settings` | Screenshots (click by x,y) | 1 | ✅ | 10 | 117,599 | 699 | 26 | Theme saved: Dark |
| `spa-team` | Mantis | 1 | ✅ | 3 | 36,268 | 262 | 12 | mia@example.com |
| `spa-team` | Accessibility tree (Playwright MCP) | 1 | ✅ | 6 | 82,787 | 486 | 17 | mia@example.com |
| `spa-team` | Chrome DevTools MCP | 1 | ✅ | 4 | 49,100 | 383 | 13 | mia@example.com |
| `spa-team` | browser-use (MCP) | 1 | ✅ | 6 | 71,856 | 498 | 21 | mia@example.com |
| `spa-team` | Screenshots (click by x,y) | 1 | ✅ | 6 | 64,421 | 455 | 17 | mia@example.com |
| `plans-pick` | Mantis | 1 | ✅ | 3 | 36,136 | 239 | 11 | PRO-77 |
| `plans-pick` | Accessibility tree (Playwright MCP) | 1 | ✅ | 4 | 58,272 | 297 | 13 | PRO-77 |
| `plans-pick` | Chrome DevTools MCP | 1 | ✅ | 4 | 48,724 | 478 | 14 | PRO-77 |
| `plans-pick` | browser-use (MCP) | 1 | ✅ | 4 | 47,598 | 368 | 16 | PRO-77 |
| `plans-pick` | Screenshots (click by x,y) | 1 | ✅ | 4 | 42,325 | 318 | 14 | PRO-77 |
| `faq-refund` | Mantis | 1 | ✅ | 3 | 36,260 | 257 | 12 | 30 days |
| `faq-refund` | Accessibility tree (Playwright MCP) | 1 | ✅ | 4 | 58,154 | 345 | 14 | 30 |
| `faq-refund` | Chrome DevTools MCP | 1 | ✅ | 3 | 38,499 | 285 | 16 | 30 |
| `faq-refund` | browser-use (MCP) | 1 | ✅ | 4 | 46,772 | 364 | 20 | 30 |
| `faq-refund` | Screenshots (click by x,y) | 1 | ✅ | 4 | 42,291 | 322 | 15 | 30 |
| `iframe-pay` | Mantis | 1 | ✅ | 5 | 55,577 | 440 | 27 | R-5531 |
| `iframe-pay` | Accessibility tree (Playwright MCP) | 1 | ✅ | 5 | 71,574 | 509 | 15 | R-5531 |
| `iframe-pay` | Chrome DevTools MCP | 1 | ✅ | 5 | 59,791 | 531 | 16 | R-5531 |
| `iframe-pay` | browser-use (MCP) | 1 | ✅ | 7 | 77,535 | 608 | 25 | R-5531 |
| `iframe-pay` | Screenshots (click by x,y) | 1 | ✅ | 12 | 121,168 | 847 | 30 | R-5531 |
| `chart-march` | Mantis | 1 | ✅ | 3 | 36,048 | 224 | 11 | 42 |
| `chart-march` | Accessibility tree (Playwright MCP) | 1 | ✅ | 7 | 102,737 | 562 | 20 | 42 |
| `chart-march` | Chrome DevTools MCP | 1 | ✅ | 6 | 71,070 | 1,294 | 29 | 42 |
| `chart-march` | browser-use (MCP) | 1 | ✅ | 3 | 34,711 | 475 | 18 | 42 |
| `chart-march` | Screenshots (click by x,y) | 1 | ✅ | 2 | 23,212 | 182 | 11 | 42 |
