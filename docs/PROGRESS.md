# Progress

Where work stands, so it can be resumed after a restart. Design: [PLAN.md](PLAN.md).

## Status

- [x] M1 — Read + act + MCP
- [x] M2 — Diffs + stable IDs
- [x] M3 — Human-like text view
- [x] M4 — Fallback ladder
- [x] M5 — Skill + benchmark
- [x] M6 — Site memory
- [x] M7 — Never lose what the accessibility tree has
- [x] M8 — Faster than the accessibility tree
- [x] M9 — Better than the accessibility tree
- [ ] M10 — Real-agent eval (biased first pass done; unbiased eval is step 3 below)
- [ ] M11 — Launch (0.1.1, README top, demo video; plan in [docs/LAUNCH.md](docs/LAUNCH.md))

## Next steps

1. Finalise Mantis: trim tool descriptions (fixed ~18.6k-token floor per task: the agent's own
   prompt plus tool list), fix weak spots (chart needs `media()` + `data()`; multi-page table
   takes 4 calls vs the tree's 2).
2. Freeze as v0.1.1 (git tag). No tuning against the held-out set after this.
3. Unbiased eval on the frozen version: ~50 tasks from WebVoyager or Online-Mind2Web on real
   sites. Mantis vs Playwright MCP vs each agent's native browser tool (Claude in Chrome or
   computer use; Codex's built-in browser). Blind LLM judge, 3 runs, report per task.
4. Publish 0.1.1 and a GitHub release with those numbers (npm 2FA by the user).

Later: fallback tools inside iframes; add Chrome DevTools MCP and browser-use to the token replay.

## Log

- 2026-10-14: Repo initialised with plan.
- 2026-10-14: M1. Playwright browser, in-page walker with stable ids, text translator with a ~6000-char
  budget, MCP server, `mantis read` CLI. Checked live on example.com and Hacker News. Switched vitest 5 to 3
  (v5's native binding fails to install on Windows).
- 2026-10-14: M2. `src/diff.ts`: actions return a diff (`+` added, `-` removed, `~` changed, dialogs,
  covered flips) or the full view after navigation. Settle waits on short timers (≤1 s) and fetch/XHR
  (cap 1.5 s). 57 tests.
- 2026-10-14: M3. Inferred names for unnamed controls (`~"name"`), states (`primary`, `error`, `looks
  disabled`, `current`), derived regions on landmark-less pages, prose summaries, repeated-row
  compaction, `read({region, full})`, live messages (`⚠`/`ℹ`). Fixed quirks-mode viewport. 81 tests.
  Live: Wikipedia "Praying mantis" 1007 → 691 tokens (chars/4).
- 2026-10-14: M4 (`src/fallback/`). Tools `media`, `data` (alt, captions, SVG text, Chart.js/ECharts/Highcharts
  values), `ocr` (tesseract.js), `look` (one-element PNG ≤800px, the only image-returning tool),
  `ask_human` (headed window with carried-over storage state, 5-min default). `read()` flags CAPTCHAs.
  13 tools, 112 tests. Untested: the headed `ask_human` window (needs a display), ECharts/Highcharts
  (only a Chart.js fixture).
- 2026-10-15: M6, site memory (`src/memory.ts`). Regions already shown in full on the same origin
  collapse to one line; disk store keeps hashes, counts and timestamps only (30-day expiry). `read({fresh})`,
  `forget()`, `MANTIS_MEMORY=0`. 142 tests. Honest savings are small (chars/4, 3 pages per site):
  Wikipedia −3%, GitHub −5%, MDN none, a synthetic site ~25%, because M3 already shrinks chrome.
- 2026-10-15: M5. Skill and the replay benchmark (`bench/`). Info-loss fixes: short standalone text kept,
  collapsed runs name their items, new `find(text)`, `test/coverage.test.ts` checks every name in Chrome's
  accessibility tree is reachable on 29 pages. Replay 14/14 (was 10/14). 176 tests.
- 2026-10-15: Faster + better (M8, M9). Scan returns one JSON string (3x on big pages); actions reuse the
  last scan when nothing changed; settle quiet 300 → 150 ms; local median per step 360 → 208 ms. Script-only
  clickables and iframes (inline, `#10001…` numbering). Chrome `computedName` for names tried and reverted
  (~25x slower scan). 183 tests. Replay: 28 vs 131 tokens/step, 247 vs 315 ms/step.
- 2026-10-15: Real-agent eval harness (`bench/agent/`). Headless `claude -p` per task and approach, isolated
  (own MCP server and browser, built-in tools off), runs where MCP never connected marked invalid. Pilot
  (2 tasks): all correct; Mantis 64k tokens, Playwright MCP 109k, screenshots 304k. Grew to 22 tasks in 7
  categories; added Chrome DevTools MCP 1.10.1 and browser-use 0.13.10 with the same fairness rules.
- 2026-10-15: First full eval (Claude Sonnet, 22 tasks x 5 approaches, 1 run each, 110/110 correct;
  `bench/results/agent.md`). Mantis 91 tool calls / 1.07M tokens / 360 s; DevTools MCP 103 / 1.31M / 469 s;
  Playwright MCP 123 / 1.78M / 406 s; browser-use 161 / 2.07M / 569 s; screenshots 230 / 3.02M / 677 s.
  Mantis cheapest on 17 of 22; lost the chart task to screenshots. The harness now pre-starts each server and
  connects through `bench/agent/bridge.mjs`; results saved after every run (`AGENT_RESUME=1`).
- 2026-10-15: Benchmark integrity fixes: independent fixture grading, retry cost accounting, separated cache
  token counts, source/config-checked resume. The Sonnet result above is historical (older schema, cannot be
  resumed). 197 tests.
- 2026-10-15: Codex CLI added as the default agent provider (`gpt-6.1-sol`, medium reasoning); Claude is optional.
  Codex runs use a read-only ephemeral session and one warmed MCP bridge; USD cost is unavailable.
- 2026-10-16: Codex branch merged into main. Grader race fixed: verification used a fixed 75 ms wait, so under
  load a correct run could be graded wrong; it now waits until no page observation is in flight and none arrived
  for 250 ms (cap 3 s). FAQ fixture adds answers only when their question is opened.
- 2026-10-16: Fresh evals. Agent eval now defaults to Mantis, tree (Playwright MCP 0.0.83) and screenshots;
  Chrome DevTools MCP and browser-use are optional, since the accessibility tree is the main competitor.
  Default Claude model `claude-haiku-5-5`. New `long` category, 4 multi-step tasks: `long-shop` (~25 actions:
  search, cart, coupon, shipping, payment), `long-admin` (~15: six user edits across pages), `long-onboard`
  (~27: 5-step wizard), `long-laptops` (~15: compare 7 product pages).
  - Short tasks (22, 1 run each; `codex-sol`, `codex-luna`, `claude-haiku` in `bench/results/`). Sol: Mantis
    22/22, tree 22/22, screenshots 20/22. Luna: 21 / 22 / 17. Haiku: all 22/22. Takeaway: Mantis ≈ tree.
  - Long tasks (4 x 3 runs = 12 per approach; `codex-luna-long`, `claude-haiku-long`). Luna time 654 / 817 /
    1191 s. Haiku time 444 / 522 / 612 s, cost $2.09 / $3.23 / $3.65. Takeaway: tree uses ~1.6–1.9x Mantis's tokens.
  - Caveat: 25 of 26 tasks are local fixtures by the authors; the screenshot baseline is our own tool.
