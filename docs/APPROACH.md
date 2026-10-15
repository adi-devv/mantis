# Approach

How Mantis turns a web page into something an AI agent can read and act on, and why
it does this differently from the two ways agents browse today.

---

## 1. How agents browse today

```mermaid
flowchart LR
    subgraph S["Screenshots"]
        direction TB
        S1[Take screenshot] --> S2[Model looks at pixels] --> S3[Guess x,y] --> S4[Click] --> S1
    end
    subgraph A["Accessibility tree"]
        direction TB
        A1[Dump the page's accessibility tree] --> A2[Model reads every node] --> A3["Act on a ref (e.g. e42)"] --> A1
    end
```

**Screenshots.** The agent sees the page the way a person does, but every look costs
~1,400 tokens (1280×800), clicks are pixel guesses, and it needs another screenshot to
check what happened.

**The accessibility tree.** Browsers keep a second, text-only version of every page for
screen readers: each element as a *role* and a *name* (`button "Sign in"`,
`textbox "Email"`) plus states (`checked`, `disabled`). Tools such as Playwright MCP's
snapshot and browser-extension agents hand this tree, more or less as-is, to the model.
It is text, so it is cheaper than pixels and acts by reference instead of by
coordinate. But it has limits:

| The accessibility tree… | …so the agent |
|---|---|
| describes the DOM, not what is on screen | clicks a button hidden behind a cookie popup |
| depends on developers labelling things (many icon buttons have no name) | sees `button` with no idea what it does |
| only knows about errors/emphasis if the developer set ARIA for it | misses the red "Invalid email" text, can't tell the primary button |
| is the whole page, every time (a Wikipedia article: ~150k tokens) | burns context on pages it only needed to skim |
| has to be re-dumped after every action | re-reads the whole page to learn "a dialog opened" |
| has nothing for canvas / charts | can't read the numbers in a chart |

## 2. The Mantis approach

**Rule: Mantis = the accessibility tree + what a person would notice by looking − the noise.**
The accessibility tree is the floor, not the competition: Mantis must never lose
information the tree has, and must add what it lacks.

```mermaid
flowchart TB
    Agent["AI agent (Claude, Cursor, …)"]
    Agent -- "MCP: open / read / click(#N) / type …" --> Server

    subgraph Mantis
        Server[MCP server] --> Browser["Real Chromium via Playwright"]
        Browser --> Capture

        subgraph Capture["1 · Capture (script inside the page)"]
            C1[Walk the live DOM incl. shadow DOM]
            C2["Role, name, state of every element"]
            C3["What the eye sees: visible? covered by a popup?<br/>red error text? primary button? icon meaning?"]
            C1 --> C2 --> C3
        end

        Capture --> Translate

        subgraph Translate["2 · Translate"]
            T1["Drop hidden / decorative / empty"]
            T2["Stable numbers #N (same element = same number)"]
            T3["Regions: [header] [nav] [main] [dialog — covers page]"]
            T4["Compact: repeated rows on one line, long lists summarised"]
            T5["Site memory: menus already seen → one line"]
            T6["Token budget"]
            T1 --> T2 --> T3 --> T4 --> T5 --> T6
        end
    end

    Translate -- "short numbered text" --> Agent
```

What the agent receives:

```
Page: Shop
[dialog "Accept cookies?" — covers page]
  #3 button "Accept"
  #4 button "Reject"
[main]
  # Shop
  #1 button "Add to cart" (covered)
  #2 button ~"trash"
```

### Acting: changes only

```mermaid
sequenceDiagram
    participant A as Agent
    participant M as Mantis
    participant P as Page
    A->>M: click(3)
    M->>P: resolve #3 to the real element, click it
    M->>P: wait for the page to settle (DOM quiet, timers, fetches)
    M->>M: compare before / after
    alt same page
        M-->>A: "+ appeared, - disappeared, ~ changed" (a few lines)
    else navigated
        M-->>A: full view of the new page
    end
```

The agent never re-reads the whole page just to learn what one click did, and numbers
don't shift under it between steps.

### When text isn't enough: the fallback ladder

```mermaid
flowchart LR
    R["read()<br/>numbered text"] -->|chart / image| D["data(id)<br/>alt text, SVG labels,<br/>chart values"]
    D -->|text baked into pixels| O["ocr(id)<br/>text only"]
    O -->|still unclear| L["look(id)<br/>crop of ONE element"]
    L -->|CAPTCHA / 2FA / payment| H["ask_human()<br/>person takes over"]
```

Cheapest first; the agent climbs only when it has to. Only `look` returns an image,
and never of the full page. Mantis never solves CAPTCHAs.

## 3. Mantis vs the accessibility tree

| | Accessibility tree | Mantis |
|---|---|---|
| Popup covering the page | not shown | `[dialog — covers page]`, items marked `(covered)` |
| Unlabelled icon button | `button` | `button ~"trash"` (`~` = inferred, never presented as fact) |
| Red error under a field | only if `aria-invalid` is set | `error: "Invalid email"` |
| Main call-to-action | looks like any button | `(primary)` |
| After a click | dump the whole tree again | only what changed |
| Element references | tied to a snapshot | stable `#N` while the element lives |
| Menus on page 2, 3, 4… | repeated in full | one line (site memory) |
| Charts / canvas | nothing | `data(id)` returns the numbers |
| Size | whole page | budgeted, compacted |

**Measured so far** (deterministic replay, no LLM in the loop; Playwright MCP 0.0.83
stands in for the accessibility tree; full method in
[`bench/results/latest.md`](../bench/results/latest.md)):

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (est.) |
|---|---:|---:|---:|
| Median tokens per step | 28 | 131 | 1,366 |
| Tokens, all 14 tasks | 11,464 | 578,028 | 40,980 |
| Tasks completed | 14 / 14 | 14 / 14 | 14 / 14 |

Read this honestly:

- The **typical step is ~4.7× smaller**. The ~50× total is driven by a few huge pages, and on
  some of them Mantis shows a trimmed view while the tree sends everything.
- **Same tasks completed.** Mantis used to fail 4 because trimming hid what the agent
  needed; short text is now kept, long lists name their items, and `find` reaches the rest.
  A test (`test/coverage.test.ts`) checks that every name in Chrome's accessibility tree is
  reachable through Mantis on 29 pages.
- Whether an agent actually *succeeds* more often with Mantis is **not measured yet**.

## 4. Where we're going

```mermaid
flowchart LR
    A["✅ Never lose what<br/>the tree has (14/14)"] --> B["Faster<br/>(latency per step)"] --> C["Better<br/>(beat the tree)"] --> D["Real-agent eval:<br/>Claude × Mantis / tree / screenshots"] --> E["Publish the<br/>proven claim"]
```

Token cost is solved. Two things are not proven yet: **is it fast**, and **does an agent
actually succeed more often**. Work, in order:

**Done**

1. ✅ **No information loss.** Short standalone text (list items, status messages, footers)
   is kept; collapsed lists name their items compactly; `find("text")` reaches anything
   that was trimmed.
2. ✅ **A permanent check.** On every test and benchmark page, every name in Chrome's
   accessibility tree must be reachable through Mantis (`test/coverage.test.ts`). A change
   that breaks this does not ship, however many tokens it saves.

**Faster** (the benchmark measures tokens but not time yet)

3. **Time every step in the benchmark**, next to tokens, for all three approaches.
4. **Shorter wait after actions.** Settling waits for a quiet DOM window; return as soon as
   the page has been still briefly instead of waiting out the full window.
5. **One page scan per action, not two.** Reuse the scan from the previous reply as the
   "before" state of the diff instead of scanning again.
6. **Cheaper page scan.** Fewer style lookups per element.

**Better** (things the accessibility tree can't do, or does more correctly)

7. **Names from Chrome.** Take accessible names from Chrome's own tree (spec-correct)
   and only infer (`~`) when it has none.
8. **Clickables made only by JavaScript.** Elements with a click listener but no role,
   link or tabindex are invisible to the tree and to Mantis today; Chrome can list event
   listeners, so Mantis can show them.
9. **Iframes.** Embedded frames (payment forms, logins, widgets) are skipped today.

**Then**

10. **Real-agent eval.** Success rate, steps, total tokens, time and cost for Claude with
    each of the three approaches, several runs per task, failures published. Start with a
    small pilot to measure usage before the full run.

The test for every change: **lose nothing the tree has · use fewer tokens · add meaning ·
don't get slower.**
