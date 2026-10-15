# Progress

Tracks where work stands so it can be resumed after a crash/restart.
See `PLAN.md` for the full plan.

## Status

- [x] Plan written (`PLAN.md`)
- [x] M1 — Read + act + MCP
- [x] M2 — Diffs + stable IDs
- [x] M3 — Human-like text view
- [x] M4 — Fallback ladder
- [x] M5 — Skill + benchmark
- [x] M6 — Site memory
- [x] M7 — Never lose what the accessibility tree has
- [x] M8 — Faster than the accessibility tree
- [x] M9 — Better than the accessibility tree (names from Chrome tried, dropped: too slow)
- [ ] M10 — Real-agent eval (first full run done: 22 tasks x 5 approaches, all correct; repeats + harder tasks next)
- [ ] M11 — Launch (0.1.1, README top, demo video)

## Next steps

Kept current: updated whenever work lands or a decision changes direction.

1. Repeat the full eval with 3 runs per task (variance), now that one run is in.
2. Harder tasks that separate tools on success, not only cost: very long pages, messy real
   sites, icon-only controls, covered buttons, error recovery, multi-tab, several live sites.
3. Look at Mantis's two losses: forms (level with Chrome DevTools MCP) and the chart task
   (screenshots read it in one look; Mantis needs media() + data()).
4. Add Chrome DevTools MCP and browser-use to the token replay benchmark.
5. GitHub release v0.1.0 to match npm (awaiting the user's go-ahead); then publish 0.1.1 with
   these numbers (npm 2FA by the user) and a matching GitHub release.
6. Later: the same eval with Codex as a second agent; fallback tools inside iframes.

## Log

- 2026-10-14: Repo initialised with plan.
- 2026-10-14: M1 built. `src/browser.ts` (Playwright, one page; open/read/click/type/select/press/scroll/back with
  DOM-quiet settle and plain-text errors), `src/capture/{walker,index}.ts` (in-page walker with stable WeakMap ids,
  open shadow roots, visibility/covered checks, names/roles/states), `src/translate.ts` (PLAN text format, run
  collapsing, ~6000-char budget with trimming), `src/server.ts` (MCP stdio, 8 tools), `src/cli.ts` (`mantis read`).
  Vitest suite on seven HTML fixtures plus MCP in-memory test: 30 tests green; `npm run build` clean. Checked live on
  example.com and news.ycombinator.com.
  Deferred / known gaps: iframes are skipped (frame-aware handles needed); closed shadow roots unreadable; no
  diffs from actions yet (M2 - actions return only what was done + url/title change); no name inference for
  unnamed icon buttons (M3); plain page text is only shown next to controls, so prose-only pages read as nearly empty;
  elements made clickable only via JS listeners (no onclick/tabindex/role) are not detected.
  `open` returns the full page view (not just a status line) so the agent does not need a second call.
- 2026-10-14: Switched vitest 5 → 3 (v5's native binding fails to install on Windows).
- 2026-10-14: M2 built. `src/diff.ts` (pure `diffSnapshots`, ≤1200-char budget with 3 summary levels); actions
  return a diff for same-document changes (`+` added, `-` removed, `~` changed, dialogs opening/closing,
  covered flips) and the full view after a navigation. Settle also waits on short timers (≤1s) and fetch/XHR
  (cap 1.5s), so delayed content is caught. 57 tests green.
  Known gaps: text not next to a control (toasts, standalone `role=alert`) is invisible to the diff until M3's
  walker emits it; timers >1s/intervals only covered by the 3s DOM-quiet window; changes the page makes on its
  own between reads are not reported.
- Next: M3 → M4 → M6 → M5 (sequential to keep load low on the dev machine; benchmark last so it measures the
  finished tool).
- 2026-10-14: M3 built. Walker infers names for unnamed controls (SVG title, icon classes, ligatures, tooltips,
  href heuristics, adjacent text) shown as `~"name"`; states `primary`, `error` (+ message), `looks disabled`,
  `current`; derived `[top bar]/[sidebar]/[main]/[bottom]` regions on landmark-less pages; prose summaries
  (≤8 paragraphs, ~120 chars each, with inline links); repeated-row compaction; hrefs only when needed;
  `read({region, full})`; live messages (role=alert/status/aria-live) emitted and shown in diffs as `⚠`/`ℹ`.
  Fixed quirks-mode viewport (no-doctype pages counted everything as in-viewport). 81 tests green.
  Live (chars/4 estimate): HN front page 1466 tok with 16/30 stories → 1484 tok with all 30; Wikipedia
  "Praying mantis" 1007 → 691 tok (now includes prose).
  Format changes: primary submit shows `(primary)` instead of `(submit)`; `invalid` state renamed `error`.
  Known gaps: icon alias map is small; prose only for inline-only text blocks; row detection needs consistent
  sibling signatures; diffs ignore prose changes; derived regions not used as diff region keys.
- 2026-10-14: M4 built (`src/fallback/`). New tools: `media` (numbered images/canvases/charts, shared id
  registry), `data` (alt/caption/SVG text, Chart.js/ECharts/Highcharts values from page memory; ≤1500 chars),
  `ocr` (tesseract.js, lazy-loaded, text + confidence only), `look` (one-element PNG crop ≤800px — the only
  image-returning tool), `ask_human` (headed window with carried-over storage state; waits for url change /
  selector gone/present / big change; 5-min default timeout). `read()` flags visible CAPTCHAs. 13 tools total,
  112 tests green (OCR test runs for real; skips with a reason if language data can't download).
  New deps: tesseract.js (runtime), chart.js (dev, fixture only). Env: `MANTIS_TESSDATA`,
  `MANTIS_ASK_HUMAN_HEADLESS=1` (tests only).
  Known gaps: headed-window path of ask_human untested (needs a display); ECharts/Highcharts untested (only a
  Chart.js fixture); media() skips closed shadow roots and cross-origin iframes; no OCR preprocessing.
- 2026-10-15: M6 built (`src/memory.ts`, `RegionHook` in translate). Top-level regions already shown in full on
  the same origin collapse to `[nav] same as before — 8 links (#5–#12); read({region}) to expand`; regions known
  only from disk show `(known layout)` with names. Never collapsed: main, dialogs, regions with a focused/error
  field or live message, <3 lines. Disk store keeps only hashes + counts + timestamps (30-day expiry, 300/origin,
  atomic writes; corrupt files ignored). `read({fresh})`, `forget()` tool, `MANTIS_MEMORY=0`,
  `MANTIS_MEMORY_DIR`. Tests run with memory off by default (test/setup.ts). 142 tests green.
  Honest numbers (chars/4, 3 pages per site, one session): MDN 1837 → 1843 (no saving), Wikipedia 1973 → 1909
  (−3%), GitHub 3057 → 2913 (−5%); second session −5% / −7%; synthetic fixture site ~25%.
  Why small: M3 already shrinks chrome; nested navs inside `[main]` are never collapsed; per-page state
  ("current", counts, breadcrumbs) changes signatures. Next: collapse nested regions, ignore "current"/counts in
  signatures. Note: a second read() of the same page also collapses chrome.
- 2026-10-15: M5 done. Skill (`skill/SKILL.md`) + deterministic replay benchmark (`bench/`, no LLM).
  Info-loss fixes so Mantis never loses what the accessibility tree has: short standalone text kept
  (prices, status lines, footers, table cells; was dropped unless next to a control); collapsed runs
  name hidden items compactly (`#8 "Item 6" · …`, cap per trim level, always when ≤6 left) then
  `…and N more (#a–#b); find("text") locates one`; new `find(text)` tool searches the untrimmed page;
  memory never collapses regions holding a text input. New `test/coverage.test.ts`: every name in
  Chrome's accessibility tree (CDP getFullAXTree) is reachable via read/find/media+data on 29 pages.
  176 tests green. Benchmark: 14/14 tasks (was 10/14); median 28 tokens/step vs 131 Playwright MCP
  vs 1,366 screenshot; totals 11,464 / 578,028 / 40,980. Next: real-agent eval (Claude in the loop),
  names from Chrome's AX tree instead of re-deriving them, publish 0.1.1.
- Next (2026-10-15), in order — see docs/APPROACH.md §4: faster (time per step in the benchmark;
  shorter settle wait; reuse the previous scan as the diff's "before"; cheaper scan), then better
  (names from Chrome's AX tree; JS-only clickables via CDP event listeners; iframes), then a
  real-agent eval (pilot first to size usage), then publish 0.1.1.
- 2026-10-15: Faster + better, before the real-agent eval. Faster: scan returns one JSON string
  (3x on big pages); actions reuse the last scan when an in-page change counter says nothing
  changed; settle quiet 300 -> 150 ms; benchmark now reports time. Local median per step 360 ->
  208 ms (Playwright MCP 286). Better: script-only clickables (click listeners recorded by the init
  script, or where a pointer cursor starts; containers excluded); iframes read inline with per-frame
  number ranges (#10001...), reused when frames go away. Tried Chrome computedName for names: ~25x
  slower scan, reverted. human.html timers moved past 1s (test was timing the settle window).
  183 tests. Full benchmark: 14/14; median 28 vs 131 tokens/step; 247 vs 315 ms/step local.
  Next: real-agent eval (pilot first), fallback tools inside iframes, publish 0.1.1.
- 2026-10-15: Real-agent eval. bench/agent/run.ts runs headless `claude -p` (Sonnet) per task and
  approach, isolated (own MCP server and browser, built-in tools off, no user settings), waits for
  MCP to connect (runs where the tool never connected are marked invalid), counts tool calls,
  runs 3 in parallel. Pilot (2 tasks): all correct; Mantis 64k tokens, Playwright MCP 109k,
  screenshots 304k; 5 / 7 / 22 tool calls. Task set grown to 22 tasks in 7 categories
  (bench/agent/tasks.ts, pages in bench/fixtures-more.ts). Added Chrome DevTools MCP 1.10.1 (main
  script run directly: its wrapper wants Node 20.19+) and browser-use 0.13.10 (MCP server in a
  git-ignored venv; it finds Playwright's Chromium itself). Same fairness rules for all: no page
  JavaScript, no LLM-backed tools inside the browser tool. Mantis: canvas gets a line pointing to
  media()/data(). README trimmed to essentials; bench/README.md documents both benchmarks.
- 2026-10-15: First full real-agent eval (bench/results/agent.md): Claude Sonnet, 22 tasks x 5
  approaches, 1 run each, 110/110 valid and correct. Mantis 91 tool calls / 1.07M tokens / 360 s /
  $0.86; Chrome DevTools MCP 103 / 1.31M / 469 s; Playwright MCP 123 / 1.78M / 406 s; browser-use
  161 / 2.07M / 569 s; screenshots 230 / 3.02M / 677 s. Mantis cheapest on 17/22 tasks; lost the
  chart task to screenshots and was level with Chrome DevTools MCP on forms. Harness fixes on the
  way: slow-starting servers (browser-use) left Claude with no tools, so the harness now pre-starts
  and warms each server and connects Claude through bench/agent/bridge.mjs; results saved after
  every run (AGENT_RESUME=1); per-run temp folders deleted after each run.
