# Progress

Tracks where work stands so it can be resumed after a crash/restart.
See `PLAN.md` for the full plan.

## Status

- [x] Plan written (`PLAN.md`)
- [x] M1 — Read + act + MCP
- [ ] M2 — Diffs + stable IDs
- [ ] M3 — Human-like text view
- [ ] M4 — Fallback ladder
- [ ] M5 — Skill + benchmark
- [ ] M6 — Site memory

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
