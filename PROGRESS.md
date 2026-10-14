# Progress

Tracks where work stands so it can be resumed after a crash/restart.
See `PLAN.md` for the full plan.

## Status

- [x] Plan written (`PLAN.md`)
- [x] M1 — Read + act + MCP
- [x] M2 — Diffs + stable IDs
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
