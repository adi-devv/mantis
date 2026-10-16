# Mantis: build plan

What Mantis is: [README.md](../README.md). How it works in depth: [docs/APPROACH.md](APPROACH.md).
Status: [PROGRESS.md](PROGRESS.md). This file keeps the code layout, design decisions and milestone scope.

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

- **M1 Read + act + MCP.** Browser, walker, translator, tools `open/read/click/type/select/press/scroll/back`, CLI.
- **M2 Diffs + stable ids.** `diffSnapshots`, wait-for-settle after actions.
- **M3 Human-like text.** Names for unnamed controls, covered elements, error/disabled/primary as words,
  regions on landmark-less pages, relevance trimming.
- **M4 Fallback ladder.** `data` (hidden text, chart values) → `ocr` → `look` (one-element crop) → `ask_human`.
- **M5 Skill + benchmark.** `skill/SKILL.md`; replay benchmark vs Playwright MCP and screenshots. Publish real numbers only.
- **M6 Site memory.** Per-site cache of layout hashes so repeated menus become one line.
- **M7 Never lose what the accessibility tree has.** Trimming may shorten, never hide; `find(text)`;
  a permanent check against Chrome's own tree.
- **M8 Faster than the tree.** Time every step; cheap scan; one scan per action; short settle.
- **M9 Better than the tree.** Script-only clickables, inline iframes, a pointer to canvas charts.
- **M10 Real-agent eval.** Agent CLIs do a fixed task set with each approach; measure correctness,
  tool calls, tokens, time, cost. New failures become new tasks; publish losses too. Method: [bench/README.md](../bench/README.md).
- **M11 Launch.** Publish 0.1.1 with the eval's numbers, README top section, demo video. Plan: [docs/LAUNCH.md](LAUNCH.md).
