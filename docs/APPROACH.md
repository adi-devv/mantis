# Approach

How Mantis turns a web page into something an AI agent can read and act on, and why
it does this differently from the two ways agents browse today.

---

## 1. How agents browse today

```mermaid
flowchart TB
    subgraph S["Screenshots"]
        direction LR
        S1(["Take screenshot<br/><b>~1,400 tokens</b>"]) --> S2["Model reads<br/>the pixels"] --> S3["Guesses<br/>x, y"] --> S4(["Click"])
        S4 -. "screenshot again to check" .-> S1
    end
    subgraph A["Accessibility tree"]
        direction LR
        A1(["Dump the whole tree<br/><b>up to ~150k tokens</b>"]) --> A2["Model reads<br/>every node"] --> A3["Picks a ref<br/>e.g. e42"] --> A4(["Click"])
        A4 -. "re-dump after every action" .-> A1
    end
    S ~~~ A

    classDef cost fill:#fee2e2,stroke:#dc2626,color:#7f1d1d
    classDef step fill:#f8fafc,stroke:#94a3b8,color:#0f172a
    class S1,A1 cost
    class S2,S3,S4,A2,A3,A4 step
    style S fill:transparent,stroke:#dc2626,stroke-width:2px
    style A fill:transparent,stroke:#d97706,stroke-width:2px
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
    Agent(["AI agent · Claude, Codex, Cursor, …"])

    subgraph Mantis["Mantis"]
        direction TB
        subgraph Run[" "]
            direction LR
            Server["MCP server"] --> Browser["Real Chromium<br/>via Playwright"]
        end

        subgraph Capture["1 · Capture in the page"]
            direction LR
            C1["Walk the live DOM<br/>incl. shadow DOM"] --> C2["Role, name, state<br/>of every element"] --> C3["What the eye sees<br/>covered? red error?<br/>primary button? icon?"]
        end

        subgraph Translate["2 · Translate"]
            direction LR
            T1["Drop hidden,<br/>decorative, empty"] --> T2["Stable<br/>numbers #35;N"] --> T3["Regions<br/>header · main · dialog"] --> T4["Compact rows,<br/>summarise lists"] --> T5["Site memory<br/>seen menus → 1 line"] --> T6["Fit the<br/>token budget"]
        end

        Run --> Capture --> Translate
    end

    Out(["Short numbered text, back to the agent"])

    Agent == "open · read · click · type" ==> Run
    Translate ==> Out

    classDef agent fill:#ede9fe,stroke:#7c3aed,color:#2e1065
    classDef infra fill:#f1f5f9,stroke:#64748b,color:#0f172a
    classDef cap fill:#e0f2fe,stroke:#0284c7,color:#082f49
    classDef tr fill:#dcfce7,stroke:#16a34a,color:#052e16
    class Agent,Out agent
    class Server,Browser infra
    style Run fill:transparent,stroke:transparent
    class C1,C2,C3 cap
    class T1,T2,T3,T4,T5,T6 tr
    style Mantis fill:transparent,stroke:#16a34a,stroke-width:2px
    style Capture fill:transparent,stroke:#0284c7,stroke-dasharray:4 3
    style Translate fill:transparent,stroke:#16a34a,stroke-dasharray:4 3
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
    autonumber
    participant A as Agent
    participant M as Mantis
    participant P as Page
    A->>M: click(3)
    rect rgba(2, 132, 199, 0.12)
        M->>P: find element 3 on the page and click it
        M->>P: wait for the page to settle (DOM quiet, timers, fetches)
        M->>M: compare before / after
    end
    rect rgba(22, 163, 74, 0.12)
        alt same page
            M-->>A: + appeared, - gone, ~ changed (a few lines)
        else navigated
            M-->>A: full view of the new page
        end
    end
```

The agent never re-reads the whole page just to learn what one click did, and numbers
don't shift under it between steps.

### When text isn't enough: the fallback ladder

```mermaid
flowchart LR
    R(["<b>read()</b><br/>numbered text"]) -- "chart or image" --> D["<b>data(id)</b><br/>alt text, SVG labels,<br/>chart values"]
    D -- "text baked<br/>into pixels" --> O["<b>ocr(id)</b><br/>text only"]
    O -- "still unclear" --> L["<b>look(id)</b><br/>image of ONE element"]
    L -- "CAPTCHA, 2FA,<br/>payment" --> H(["<b>ask_human()</b><br/>a person takes over"])

    classDef t1 fill:#dcfce7,stroke:#16a34a,color:#052e16
    classDef t2 fill:#fef9c3,stroke:#ca8a04,color:#422006
    classDef t3 fill:#ffedd5,stroke:#ea580c,color:#431407
    classDef t5 fill:#ede9fe,stroke:#7c3aed,color:#2e1065
    class R t1
    class D,O t2
    class L t3
    class H t5
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
| Clickable only by script (`div` + click listener) | not shown | `clickable "Pro plan"` |
| Iframes (payment, login widgets) | per frame | inline under `[iframe "Payment"]`, own numbers |
| Size | whole page | budgeted, compacted |

**Measured:** the numbers are in the [README](../README.md#benchmark). How to read them:

- The replay's total-token gap is driven by a few huge pages, and on some of them Mantis shows a
  trimmed view while the tree sends everything. "Orients on the page cheaply" is fair; "reads the
  whole article cheaply" is not.
- Mantis used to fail 4 replay tasks because trimming hid what the agent needed. Now short text is
  kept, long lists name their items, and `find` reaches the rest. `test/coverage.test.ts` checks
  that every name in Chrome's accessibility tree is reachable through Mantis on 29 pages.
- With real agents, Mantis matches the tree on short tasks and uses fewer tokens on long ones,
  where every step re-reads more of the page.

## 4. Decisions along the way

- **No information loss.** Short standalone text (list items, status messages, footers) is kept;
  collapsed lists name their items; `find("text")` reaches anything trimmed. The coverage test runs
  on every test and benchmark page, and a change that breaks it does not ship, however many tokens it saves.
- **Speed.** The page scan returns one JSON string instead of Playwright's structured serializer
  (3x faster on big pages). When an in-page counter says nothing changed (DOM, scroll, input, focus,
  hover), the last scan is reused as the diff's "before". After an action Mantis waits 150 ms of DOM
  quiet; short timers and requests are tracked separately, so delayed effects are still caught.
- **Beyond the tree.** Elements made clickable only by script (a click listener, or where a pointer
  cursor starts) show as `clickable`, containers excluded. Visible iframes, cross-origin included,
  are read inline under `[iframe "title"]` with their own number range (`#10001…`).
- **Names from Chrome: tried, not shipped.** Chrome can give its computed name per element, but
  reading it made the scan ~25x slower (15 → 378 ms on a 200-link page). Mantis keeps its own name
  logic and the coverage test checks it against Chrome's names.

The test for every change: lose nothing the tree has, use fewer tokens, add meaning, don't get slower.
