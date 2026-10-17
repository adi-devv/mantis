# Mantis: plan and progress

What Mantis is: [README.md](../README.md). How it works in depth: [docs/APPROACH.md](APPROACH.md).
This file keeps the code layout, design decisions, milestones, next steps and the work log, so work can be
resumed after a restart.

## Code layout

```
Agent (Claude, Cursor, …)
      │  MCP (stdio)
MCP server      src/server.ts      the tools
Translator      src/translate.ts   cleanup, numbering, regions, text format
                src/diff.ts        what changed after an action
                src/memory.ts      site memory
Page capture    src/capture/       injected DOM walker → raw nodes
Fallbacks       src/fallback/      media, data, ocr, look, ask_human
Browser         src/browser.ts     Playwright (the library, not Playwright MCP)
```

Stack: TypeScript (ESM, Node ≥20), Playwright, `@modelcontextprotocol/sdk`, zod, vitest.

## Design decisions

1. **Capture inside the page.** A walker runs in the page and records, per relevant element: role,
   name, state, box, visibility, and whether something covers it. No screenshots.
2. **Stable ids.** A `WeakMap<Element, number>` on `window`: an element keeps its number while it
   lives, new elements get new numbers, numbers are never reused within a page load.
3. **Act through Playwright.** `click(14)` resolves id 14 to an element and calls Playwright's
   `click()`, which brings actionability checks and auto-wait. The agent never sees coordinates.
4. **Diffs after every action.** Same-page actions return what changed; navigation returns the full view.
5. **Token budget.** A typical `read()` ≤ ~1,500 tokens (about one screenshot); an action result ≤ ~300.
   Long lists collapse to "…and N more", never hide.

Text format rules: one element per line as `#N role "name" (states)`; regions in `[brackets]` from
landmarks and dialogs; headings as `#`-prefixed text without an id; other text only when short and useful.

## Milestones

- [x] **M1 Read + act + MCP.** Browser, walker, translator, tools `open/read/click/type/select/press/scroll/back`, CLI.
- [x] **M2 Diffs + stable ids.** `diffSnapshots`, wait-for-settle after actions.
- [x] **M3 Human-like text.** Names for unnamed controls, covered elements, error/disabled/primary as words,
  regions on landmark-less pages, relevance trimming.
- [x] **M4 Fallback ladder.** `data` (hidden text, chart values) → `ocr` → `look` (one-element crop) → `ask_human`.
- [x] **M5 Skill + benchmark.** `skill/SKILL.md`; replay benchmark vs Playwright MCP and screenshots. Publish real numbers only.
- [x] **M6 Site memory.** Per-site cache of layout hashes so repeated menus become one line.
- [x] **M7 Never lose what the accessibility tree has.** Trimming may shorten, never hide; `find(text)`;
  a permanent check against Chrome's own tree.
- [x] **M8 Faster than the tree.** Time every step; cheap scan; one scan per action; short settle.
- [x] **M9 Better than the tree.** Script-only clickables, inline iframes, a pointer to canvas charts.
- [ ] **M10 Real-agent eval.** Agent CLIs do a fixed task set with each approach; measure correctness,
  tool calls, tokens, time, cost. New failures become new tasks; publish losses too. Method: [bench/README.md](../bench/README.md).
  Fixture evals and real-site pilots are done; the tool judge and the full real-site eval are next steps 1 and 4.
- [ ] **M11 Launch.** Publish with the eval's numbers, README top section, demo video. Plan: [docs/LAUNCH.md](LAUNCH.md).

## Next steps

1. **Tool judge.** A second judge beside the outcome judge. It grades whether each tool did its job per call,
   with one rubric for Mantis, tree and screenshots, so agent mistakes don't count against the tool:
   - Action: the tool reported success but the page didn't change, or something blocked a valid click.
   - Perception: information on screen was missing from the tool's output (vs present and ignored by the agent).
   - Errors: the error was vague or wrong (vs clear, and the agent didn't adapt).

   Reports per tool: tool-fault rate, silent failures, missed content, and the share of failed runs caused by
   the tool vs the agent. Mostly deterministic (before/after evidence frames per action); the LLM part uses a
   fixed rubric. It can't be blind, because tool output reveals the tool. Needs the tool-call traces saved
   next to the results; cloud runs don't push them yet.
2. **Click blocked by a dimmed panel.** Done (dimmed panel waits; blocker diagnosis now tells inactive/collapsed
   menus from dismissible overlays; collapsed filter options say "open first"; `data()` hint names the canvas id).
   Pilot (luna, Mantis only, 4 real-site tasks) found no silent Mantis failures; 3 of 4 non-clean runs were agent
   early stopping or a site sign-in prompt.
3. **Outcome judge.** Keep the per-step evidence frames; the headline judge moves to a stronger model later.
   - Add a "site broken" status: a site that errors for every approach should be excluded like "blocked",
     not counted as a failure (the tax task in `haiku-evidence-1`).
   - The judged `.md` header still describes the old packet (final reply + final screenshot).
   - Cloud briefs must carry each task's `checks` (the swimsuit row had none).
4. Unbiased eval on a frozen version: ~50 tasks from WebVoyager or Online-Mind2Web on real sites. Mantis vs
   Playwright MCP vs each agent's native browser tool (Claude in Chrome or computer use; Codex's built-in
   browser). Outcome judge and tool judge, 3 runs, report per task.
5. A GitHub release with the real-site numbers.

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
- 2026-10-16: Finalised for 0.1.1. Tool list 1,706 → 1,313 tokens (shorter descriptions, ladder stated once).
  A page that fits the budget now shows all its prose (`article-deep-fact`: 3 calls → 1). Chart and paged-table
  weak spots were already gone in the fresh runs. Luna smoke (`codex-luna-final-smoke`, 7 tasks x 3): 21/21;
  `long-laptops` took 9–14 calls vs 8 before (the product view is complete, so likely run-to-run variance).
  Replay median unchanged at 28 tokens/step. 205 tests.
- 2026-10-16: `fill` tool: several text fields, dropdowns and checkboxes in one call. Luna (`codex-luna-fill`,
  long-shop and long-onboard x 3): 6/6 correct; calls 25.3 → 19.7 and 30.3 → 21.3; tokens flat (308k vs 303k,
  305k vs 263k; runs with equal calls vary 200–374k, so 3 runs can't show a token change). 208 tests.
  Frozen as v0.1.1.
- 2026-10-16: Published 0.1.1 to npm. Real-site pilot on Online-Mind2Web (`bench/agent/realsite.ts`, blind
  Sonnet judge in `bench/agent/judge.ts`; Codex `gpt-6-luna`, medium reasoning, 1 run). 5 of the first 10 tasks
  were blocked by bot detection for every approach and were replaced by the next unblocked ones in seed order.
  On the 10 unblocked tasks: Mantis 7/10, 8.4 calls, 185k tokens; tree 5/10, 12.2, 311k; screenshots 6/10, 17.9, 310k.
  README trimmed to plain language; numbers in `bench/RESULTS.md`, build and config in `docs/SETUP.md`.
- 2026-10-16: 30-task real-site run (Codex `gpt-6-luna`, judged by `gpt-6.1-sol`, now the default judge):
  Mantis 14/30, 8.7 calls, 190k tokens; tree 11/30, 13.3, 435k; screenshots 9/30, 22.2, 346k. Released 0.1.2
  with MCP registry metadata.
- 2026-10-16: Fixes from real-site failures: label clicks, controls in `opacity:0` wrappers, a note while controls
  are disabled during hydration, unnamed dismiss buttons, swatch filters, clicks through invisible layers,
  scrolling past sticky headers, following re-rendered controls, rendered labels of hidden controls, unrendered
  CAPTCHA widgets ignored. Settle ignores background work and animation; covered clicks fail fast. Luna reruns
  on 3 tasks (`luna-fixes-1..4`); `luna-fixes-4`: Mantis 4/9, tree 0/9, screenshots 3/9. How to run evals in
  the cloud: [bench/README.md](../bench/README.md).
- 2026-10-17: Judge evidence. The harness captures a frame after every tool call, the same way for every
  approach (at most 12, near-duplicates dropped), with page text and final form values. The judge gets a numbered
  packet and must cite frame ids. Optional per-task `checks` force a failure when they don't pass.
  Haiku on 3 real-site tasks, judged by Sonnet in the cloud: old judge (`haiku-cloud-6`) Mantis 3/9, tree 1/9,
  screenshots 2/9; evidence judge (`haiku-evidence-1`) 1/9, 2/9, 0/9, no unsure verdicts. An audit found the
  verdicts right; the drop is Haiku's run-to-run variance plus a tax site that was broken in the cloud. Most
  failures were the model: every approach failed the map task, and swimsuit runs stalled on size mapping.
  One Mantis bug: next step 2.
- 2026-10-17: Pilot on luna (Mantis only): no silent tool failures. Fixed the three generic gaps it exposed (blocker
  diagnosis, collapsed filter options, canvas `data()` hint).
