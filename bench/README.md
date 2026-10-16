# Benchmarks

Two benchmarks compare Mantis with the accessibility tree (Playwright MCP) and with screenshots.
Headline numbers are in the [main README](../README.md#benchmark).

| | Token replay | Real-agent eval |
|---|---|---|
| Question | What does an agent *receive* per step? | Does an agent *succeed*, and at what cost? |
| LLM in the loop | No (deterministic) | Yes (Codex CLI by default; Claude Code optional) |
| Measures | tokens and time per step, tasks completed | correct answers, tool calls, tokens, time, cost when available |
| Code | `bench/run.ts`, `bench/tasks.ts` | `bench/agent/run.ts`, `bench/agent/tasks.ts` |
| Uses an agent account | No | Yes (Codex ChatGPT sign-in by default) |

Local tasks run against fixture pages served by `bench/fixtures.ts` (deterministic, known
answers). Live tasks (Wikipedia, Hacker News, GitHub, MDN) change over time; their numbers
are a snapshot.

## Token replay

```bash
npm run bench                                              # all tasks -> results/latest.{json,md}
BENCH_ONLY=local-login,example-read npx tsx bench/run.ts   # subset -> results/partial.*
```

Each task is a fixed script of steps replayed through every tool over MCP. The harness finds
targets in each tool's own output, so no model is involved. The method is at the top of
`results/latest.md`.

## Real-agent eval

Needs a logged-in Codex CLI (`codex login`) by default. `AGENT_PROVIDER=claude` uses Claude Code instead.

```bash
npm run bench:agent                                                                   # pilot: 2 tasks x 3 approaches
AGENT_OUT=my-all AGENT_TASKS=all AGENT_RUNS=3 npm run bench:agent                     # every task, 3 runs each
AGENT_OUT=my-long AGENT_TASKS=cat:long npm run bench:agent                            # one category (or task ids)
AGENT_OUT=my-subset AGENT_APPROACHES=mantis,tree npm run bench:agent                  # some approaches only
```

| Variable | Default | Meaning |
|---|---|---|
| `AGENT_PROVIDER` | `codex` | `codex` or `claude` |
| `AGENT_TASKS` | pilot | `all`, task ids, or `cat:<category>`, comma-separated |
| `AGENT_APPROACHES` | `mantis,tree,screenshot` | also `devtools`, `browseruse` |
| `AGENT_RUNS` | 1 | runs per task and approach |
| `AGENT_MODEL` | `gpt-6.1-sol` (Codex), `claude-haiku-5-5` (Claude) | model of the selected provider |
| `AGENT_REASONING` | `medium` | Codex reasoning effort (`low`, `medium`, `high`, `xhigh`, `max`) |
| `CODEX_BIN`, `CLAUDE_BIN` | installed CLI | path override for the agent CLI |
| `AGENT_CONCURRENCY` | 3 | runs in parallel; raise as far as RAM allows (each run is an agent CLI, an MCP server and a browser); times then include more contention |
| `AGENT_TIMEOUT_S` | 600 | per-run timeout |
| `AGENT_OUT` | `codex-agent-verified[-pilot]` | result file name; must not already exist unless resuming or overwriting |
| `AGENT_RESUME` | 0 | resume only when schema, settings and source fingerprint match exactly |
| `AGENT_OVERWRITE` | 0 | replace an existing result file |

Categories: `forms`, `reading`, `lists`, `overlays`, `navigation`, `dynamic`, `visual`, and `long`
(multi-step tasks of 15 to 27 actions).

### Approaches

- `mantis`: all Mantis tools (`dist/server.js`).
- `tree`: Playwright MCP 0.0.83, headless, isolated, without its JavaScript-running tools.
- `screenshot`: `agent/screenshot-mcp.ts`, a minimal computer-use-style server
  (screenshot, click(x, y), type, key, scroll, back).
- `devtools` (optional): Chrome DevTools MCP 1.10.1 with page JavaScript and unrelated categories disabled.
- `browseruse` (optional): browser-use MCP, with LLM-backed and raw-HTML tools disabled.

### Isolation

Each attempt has its own agent CLI process, MCP server and browser. Built-in tools are off, user
config and project instructions are excluded, and only that approach's browser tools are allowed.
Codex runs in a read-only sandbox with a required, preapproved, warmed bridge server; shell, web,
apps, plugins, skills, browser, computer and image-view tools are disabled. The prompt is the same
for every approach.

### Grading

- Local fixture pages report browser events and page state to an independent grader, so a run is
  correct only if the agent did the work on the page, not just said so. Before grading, the fixture
  server waits until no observation is in flight and none arrived for 250 ms (at most 3 s), so a slow
  machine cannot turn a correct run into a wrong one. This adds browser work to every approach on
  local tasks and is not measured separately.
- The live Wikipedia task has no page-state grader; it is checked by the answer pattern alone.
- A task is retried once, only after an MCP connection failure. Both attempts and their usage
  stay in the output. Connection failures are shown separately and excluded from the correctness
  denominator. Timeouts, CLI errors, crashes, grader failures and wrong answers after launch count as failures.
  Recovered MCP tool errors are counted separately and do not erase a correct answer.

### Usage and time

- Claude's stream gives normal, cache-write and cache-read input, output tokens, cost and model.
  Codex gives total input (including cached), cached input and output tokens; normal input is derived
  as total minus cached. Codex reports no USD cost, so cost stays `unknown`. Missing usage stays
  `unknown`, never zero.
- The report also counts browser tool output characters and image blocks. This is a diagnostic,
  not subtracted from billed tokens.
- Time is split into MCP startup (spawn and warm-up), CLI startup (launch to the first init event),
  CLI execution (that event to exit), and verification and cleanup. These are wall-clock and include
  contention from parallel runs. The CLI gives no reliable tool-time versus model-time split.

### Result files

Files are in `results/`, each a `.json` plus a readable `.md`; the JSON holds the schema version,
settings, environment, source hashes and fingerprint that resume checks.

| File | Contents |
|---|---|
| `codex-sol`, `codex-luna`, `claude-haiku` | 22 short tasks, 1 run, per model |
| `codex-luna-long`, `claude-haiku-long` | 4 long tasks, 3 runs |
| `agent`, `agent-pilot` | historical: Claude Sonnet, 5 approaches, graded on the final reply only; older schema, cannot be resumed |

## Adding a task

Real-agent tasks live in `agent/tasks.ts`:

```ts
{
  id: 'pricing-team',
  category: 'navigation',
  site: 'local',
  prompt: (base) => `Open ${base}/site/home, go to the pricing page and find the price of the Team plan.`,
  expect: /\$29/,
}
```

- Prefer a local fixture page; add it to `fixtures.ts` (or `fixtures-more.ts`, `fixtures-long.ts`).
- `expect` must only match a correct answer.
- When an agent fails somewhere new, turn that page into a task.

Token-replay tasks live in `tasks.ts` as scripted steps (`open`, `click`, `type`, `read`, ...).
