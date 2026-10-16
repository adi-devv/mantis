# Real-agent eval

> Codex CLI (`codex exec`) (requested model `gpt-6-luna`, reasoning medium) does each task with one browser approach at a time. Correctness uses the expected answer and, for instrumented local fixtures, a page-state check. Token values come from the Codex event stream; Codex does not report USD cost, so cost remains unknown; missing values stay unknown. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-16; runs per task and approach: 1; 6 runs in parallel.
- Scope: 10 tasks × 3 approaches × 1 runs = 30 logical runs; 30 recorded so far; 30 total attempts including retries.
- Codex CLI version: codex-cli 0.162.0-alpha.17.2; resolved model(s): unknown.
- MCP startup (spawn + warm-up) is separate from Codex CLI wall time. CLI wall time runs from process launch to exit; CLI startup is launch to first `thread.started` event, and CLI execution is that event to process exit. Fixture verification and cleanup are timed separately. These include contention from parallel runs. No tool-time vs model-time split is reported because the stream does not provide a reliable decomposition.
- Browser observation size counts text characters and image blocks returned by browser MCP tools. It is a separate diagnostic from Codex-reported input tokens; the benchmark does not subtract it to estimate overhead.
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off. Codex shell, web, app, skill-discovery, browser, computer, and image-view tools are disabled; only the selected approach MCP server is configured.
- A retry after an MCP connection failure is retained as a separate attempt and its measured cost is included. Connection failures are excluded from the correctness denominator; timeouts, CLI failures, and wrong answers after connection count as attempted failures.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 10 / 10 | 10 / 10 | 10 / 10 |
| Connection-failure attempts | 0 | 0 | 0 |
| Logical runs ending in connection failure | 0 | 0 | 0 |
| Other attempted failures | 0 | 0 | 0 |
| Tool calls (including retries) | 53 | 81 | 97 |
| MCP tool errors (including retries) | 4 | 2 | 5 |
| Browser observation text (observed chars) | 149,285 | 454,102 | 1,514 |
| Browser observation images (observed blocks) | 0 | 0 | 42 |
| Normal input tokens (total) | 160,407 | 266,119 | 235,132 |
| Cache-write input tokens (total) | 0 | 0 | 0 |
| Cache-read input tokens (total) | 1,019,648 | 1,588,608 | 1,459,456 |
| Output tokens (total) | 5,703 | 6,127 | 9,198 |
| Total input tokens incl. cache (legacy) | 1,180,055 | 1,854,727 | 1,694,588 |
| MCP startup (total, s) | 20.5 | 20.6 | 20.6 |
| CLI startup (total, s) | 6.8 | 9.1 | 7.6 |
| CLI execution (total, s) | 366.7 | 384.4 | 414.0 |
| CLI wall (total, s) | 373.5 | 393.5 | 421.6 |
| Fixture verification (total, s) | 0.0 | 0.0 | 0.0 |
| Cleanup (total, s) | 3.5 | 4.3 | 3.5 |
| Cost estimate (USD; including retries) | unknown | unknown | unknown |

## Per run

| Task | Approach | Run | Status | Attempts | Tool calls | Tool errors | Obs. chars | Obs. images | Normal in | Cache write | Cache read | Output | MCP startup (s) | CLI startup (s) | CLI execution (s) | CLI wall (s) | Verify (s) | Cleanup (s) | Answer / error |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| `ba2a469af584f16da93ce6a7430cf7e5_070826` | Mantis | 1 | success | 1 | 7 | 0 | 36,380 | 0 | 18,560 | 0 | 132,864 | 628 | 2.1 | 1.4 | 40.5 | 42.0 | 0.00 | 0.26 | I found **Python Basics** by the University of Michigan on Coursera. It’s a beginner course with no prior experience required, and covers Python programming fun |
| `ba2a469af584f16da93ce6a7430cf7e5_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 17 | 1 | 80,042 | 0 | 40,418 | 0 | 374,528 | 865 | 2.1 | 1.4 | 112.4 | 113.8 | 0.00 | 0.36 | I found **Python for Everybody Specialization** from the University of Michigan. Coursera lists it as **beginner level** with **no prior experience required**.  |
| `ba2a469af584f16da93ce6a7430cf7e5_070826` | Screenshots (click by x,y) | 1 | success | 1 | 11 | 0 | 153 | 5 | 43,158 | 0 | 166,528 | 1,154 | 2.2 | 1.7 | 65.5 | 67.2 | 0.00 | 0.40 | I found **Python Basics** from the University of Michigan. Coursera lists it as a beginner course, 1–4 weeks long, covering Python programming, programming prin |
| `27fa3ac20745d3d35e89fae157f63069` | Mantis | 1 | success | 1 | 7 | 1 | 9,262 | 0 | 9,543 | 0 | 120,960 | 618 | 2.2 | 1.3 | 31.2 | 32.5 | 0.00 | 0.38 | ExploreCourses redirected to Stanford Login, so I stopped there without logging in or entering information. The public Bulletin Archive opened, but it did not s |
| `27fa3ac20745d3d35e89fae157f63069` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 11 | 0 | 124,616 | 0 | 31,168 | 0 | 248,704 | 590 | 2.2 | 1.3 | 38.1 | 39.4 | 0.00 | 0.29 | ExploreCourses redirected to Stanford Login when I opened the Winter 2023 Chemistry schedule, so I stopped there without logging in or entering any information. |
| `27fa3ac20745d3d35e89fae157f63069` | Screenshots (click by x,y) | 1 | success | 1 | 25 | 0 | 333 | 12 | 37,897 | 0 | 438,656 | 2,134 | 2.2 | 1.6 | 69.5 | 71.1 | 0.00 | 0.39 | I reached Stanford’s ExploreCourses page and selected the 2022–2023 catalog. Clicking Chemistry led to Stanford’s login page, so I stopped without logging in. I |
| `29b7372d5a3884a2ba831af2d117af3c` | Mantis | 1 | success | 1 | 7 | 0 | 17,155 | 0 | 12,088 | 0 | 121,216 | 515 | 2.0 | 0.6 | 56.8 | 57.4 | 0.00 | 0.40 | I opened Microsoft’s Google Finance page and selected the first item under “News stories”: “MSFT Testing Key Resistance: Stock Gains 1.08% (October 15, 2026)” f |
| `29b7372d5a3884a2ba831af2d117af3c` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 13 | 1 | 67,760 | 0 | 47,803 | 0 | 293,504 | 633 | 2.0 | 0.5 | 39.9 | 40.4 | 0.00 | 0.27 | I opened the first news story listed for Microsoft on Google Finance: **“MSFT Testing Key Resistance: Stock Gains 1.08% (October 15, 2026)”** from JournalArta. |
| `29b7372d5a3884a2ba831af2d117af3c` | Screenshots (click by x,y) | 1 | success | 1 | 15 | 2 | 247 | 5 | 17,061 | 0 | 172,416 | 1,054 | 2.0 | 0.4 | 34.0 | 34.4 | 0.00 | 0.35 | I opened Microsoft Corp (MSFT) on Google Finance and selected the first news story: “MSFT Testing Key Resistance: Stock Gains 1.08% (October 15, 2026)” from Jou |
| `180ed2ec377ef3a4af9035a21522091a` | Mantis | 1 | success | 1 | 4 | 1 | 1,701 | 0 | 6,577 | 0 | 73,728 | 560 | 2.0 | 0.5 | 22.6 | 23.1 | 0.00 | 0.34 | I couldn’t reach the giving information: umich.edu displayed a bot verification check, and the browser couldn’t open a visible window for human verification. Th |
| `180ed2ec377ef3a4af9035a21522091a` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 4 | 0 | 2,400 | 0 | 13,554 | 0 | 55,936 | 406 | 2.0 | 0.6 | 15.6 | 16.3 | 0.00 | 0.28 | I couldn’t complete the navigation: the University of Michigan and UM-Dearborn sites returned Cloudflare security verification pages with HTTP 403. I did not lo |
| `180ed2ec377ef3a4af9035a21522091a` | Screenshots (click by x,y) | 1 | success | 1 | 2 | 0 | 153 | 1 | 24,138 | 0 | 29,056 | 465 | 2.0 | 0.4 | 19.9 | 20.3 | 0.00 | 0.28 | The UMich homepage stopped at a Cloudflare “Verify you are human” check, so I couldn’t follow its links to find UM-Dearborn giving. |
| `3dca7cbe7d086619d837ff9f5312cebc_110325` | Mantis | 1 | success | 1 | 1 | 0 | 239 | 0 | 21,670 | 0 | 20,736 | 190 | 2.0 | 0.4 | 18.7 | 19.1 | 0.00 | 0.23 | Zara’s US site returned an “Access Denied” page, so I couldn’t reach the Zara Home → Rug listing or apply the beige filter. |
| `3dca7cbe7d086619d837ff9f5312cebc_110325` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 1 | 0 | 360 | 0 | 23,351 | 0 | 8,960 | 170 | 2.0 | 0.9 | 8.6 | 9.6 | 0.00 | 0.24 | Zara’s US site returned **Access Denied (HTTP 403)** when I opened it, so I couldn’t reach the Zara Home → Rug listing or apply the beige filter. |
| `3dca7cbe7d086619d837ff9f5312cebc_110325` | Screenshots (click by x,y) | 1 | success | 1 | 2 | 0 | 32 | 1 | 7,171 | 0 | 45,952 | 274 | 2.0 | 0.7 | 24.3 | 25.0 | 0.00 | 0.35 | The Zara US site returned “Access Denied” when I opened it, so I couldn’t reach the Zara Home → Rug category or apply the beige filter. |
| `56f8890a837c49f7df766b9c981646f3` | Mantis | 1 | success | 1 | 1 | 0 | 60 | 0 | 12,542 | 0 | 29,696 | 177 | 2.0 | 0.5 | 18.6 | 19.1 | 0.00 | 0.27 | IMDb returned **403 Forbidden** when I opened the site, so I couldn’t reach *Prometheus*’s credits. |
| `56f8890a837c49f7df766b9c981646f3` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 1 | 0 | 364 | 0 | 6,115 | 0 | 26,112 | 141 | 2.0 | 0.4 | 17.0 | 17.4 | 0.00 | 0.26 | IMDb returned **403 Forbidden** when I opened the site, so I couldn’t reach *Prometheus*’s credits page. |
| `56f8890a837c49f7df766b9c981646f3` | Screenshots (click by x,y) | 1 | success | 1 | 2 | 0 | 34 | 1 | 7,469 | 0 | 45,568 | 260 | 2.0 | 0.3 | 11.5 | 11.8 | 0.00 | 0.30 | IMDb returned a **403 Forbidden** page when I opened the site, so I couldn’t reach Prometheus’s credits. |
| `64b76158720a69e4a5c31a55d54928bf` | Mantis | 1 | success | 1 | 7 | 0 | 29,846 | 0 | 17,315 | 0 | 129,792 | 896 | 2.0 | 0.4 | 68.0 | 68.4 | 0.00 | 0.41 | Healthline’s pescatarian guide describes a pescatarian diet as mostly plant based, with fish and other seafood; eggs and dairy may also be included. It says the |
| `64b76158720a69e4a5c31a55d54928bf` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 11 | 0 | 39,014 | 0 | 24,930 | 0 | 165,888 | 1,023 | 2.1 | 0.4 | 42.3 | 42.7 | 0.00 | 0.52 | Healthline describes a pescatarian diet as plant based, with fish and other seafood as the main animal protein; many people also eat eggs and dairy. For eating  |
| `64b76158720a69e4a5c31a55d54928bf` | Screenshots (click by x,y) | 1 | success | 1 | 18 | 0 | 209 | 8 | 49,248 | 0 | 224,128 | 1,610 | 2.0 | 0.4 | 51.5 | 52.0 | 0.00 | 0.34 | I compared two versions of a pescatarian diet described by Healthline: - **Whole-food, plant-forward:** Make vegetables, fruit, whole grains, legumes, nuts, an |
| `9d46ccb915eff39ee1ae1e7328f5f20d` | Mantis | 1 | success | 1 | 2 | 2 | 143 | 0 | 5,447 | 0 | 49,024 | 246 | 2.0 | 0.5 | 27.1 | 27.6 | 0.00 | 0.46 | I couldn’t reach UPS: both the homepage and its US landing page started a download instead of opening in the browser, so I couldn’t enter the shipment details o |
| `9d46ccb915eff39ee1ae1e7328f5f20d` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 3 | 0 | 648 | 0 | 5,217 | 0 | 50,688 | 241 | 2.0 | 0.5 | 26.7 | 27.2 | 0.00 | 1.34 | UPS did not load in the browser: both the homepage and the shipping page ended at `about:blank` and triggered downloads. I couldn’t get a quote. |
| `9d46ccb915eff39ee1ae1e7328f5f20d` | Screenshots (click by x,y) | 1 | success | 1 | 4 | 3 | 114 | 1 | 10,037 | 0 | 68,480 | 524 | 2.0 | 0.5 | 16.0 | 16.5 | 0.00 | 0.40 | I couldn’t reach the UPS site in the browser: each navigation to UPS started a download, leaving a blank page. I didn’t enter any shipment or personal informati |
| `9ed3827266b3b804f485859c3d00401e_070826` | Mantis | 1 | success | 1 | 15 | 0 | 47,309 | 0 | 48,321 | 0 | 291,200 | 1,208 | 2.0 | 0.7 | 55.8 | 56.4 | 0.00 | 0.34 | The Chase IRA calculator comparison shows the following estimated values at age 65: \| Account \| Estimated value \| \|---\|---:\| \| Traditional IRA (deductible) \| $ |
| `9ed3827266b3b804f485859c3d00401e_070826` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 17 | 0 | 56,191 | 0 | 48,536 | 0 | 309,376 | 1,405 | 2.0 | 2.5 | 52.8 | 55.3 | 0.00 | 0.32 | I entered the assumptions in Chase’s IRA calculator: age 30, retirement at 65, $30,000 starting balance, 3% annual return, 13% current tax rate, and 24% estimat |
| `9ed3827266b3b804f485859c3d00401e_070826` | Screenshots (click by x,y) | 1 | success | 1 | 12 | 0 | 116 | 6 | 29,821 | 0 | 173,184 | 1,131 | 2.0 | 1.1 | 78.1 | 79.2 | 0.00 | 0.39 | I reached Chase’s retirement and IRA information page, but I couldn’t find a Traditional versus Roth comparison calculator there, so I wasn’t able to show the c |
| `c1d6ea6f2196d25782cc3646ff3090db` | Mantis | 1 | success | 1 | 2 | 0 | 7,190 | 0 | 8,344 | 0 | 50,432 | 665 | 2.0 | 0.5 | 27.4 | 27.9 | 0.00 | 0.36 | Google Shopping opened, but submitting the search led to a Google “Sorry” page, so I couldn’t retrieve product listings or verify which drip coffee makers meet  |
| `c1d6ea6f2196d25782cc3646ff3090db` | Accessibility tree (Playwright MCP) | 1 | success | 1 | 3 | 0 | 82,707 | 0 | 25,027 | 0 | 54,912 | 653 | 2.0 | 0.5 | 30.9 | 31.5 | 0.00 | 0.43 | Google Shopping returned a rate limit error (HTTP 429) when I searched for “black drip coffee maker,” so I couldn’t verify any sale listings in the $25–$60 rang |
| `c1d6ea6f2196d25782cc3646ff3090db` | Screenshots (click by x,y) | 1 | success | 1 | 6 | 0 | 123 | 2 | 9,132 | 0 | 95,488 | 592 | 2.0 | 0.6 | 43.7 | 44.3 | 0.00 | 0.36 | Google Shopping blocked the search with an “unusual traffic” reCAPTCHA. I stopped there and did not interact with the challenge, log in, purchase anything, or e |
