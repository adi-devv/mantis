# Benchmarks

Two benchmarks compare Mantis with the accessibility-tree approach (Playwright MCP) and
with screenshots.

| | Token replay | Real-agent eval |
|---|---|---|
| Question | What does an agent *receive* per step? | Does an agent *succeed*, and at what cost? |
| LLM in the loop | No (deterministic) | Yes (Claude Code, `claude -p`) |
| Measures | tokens and time per step, tasks completed | correct answers, tool calls, tokens, time, cost |
| Code | `bench/run.ts`, `bench/tasks.ts` | `bench/agent/run.ts`, `bench/agent/tasks.ts` |
| Results | `results/latest.md` | `results/agent-pilot.md`, `results/agent.md` |
| Uses your Claude plan | No | Yes |

Local tasks run against fixture pages served by `bench/fixtures.ts` (deterministic, known
answers). Live tasks (Wikipedia, Hacker News, GitHub, MDN) change over time; their numbers
are a snapshot.

## Token replay

```bash
npm run bench                                   # all tasks -> results/latest.{json,md}
BENCH_ONLY=local-login,example-read npx tsx bench/run.ts   # subset -> results/partial.*
```

Each task is a fixed script of steps replayed through every tool over MCP. The harness finds
targets in each tool's own output, so no model is involved. The method is described at the
top of `results/latest.md`.

## Real-agent eval

Needs a logged-in Claude Code CLI (`claude auth login`).

```bash
npm run bench:agent                                       # pilot: 2 tasks x 3 approaches
AGENT_TASKS=all AGENT_RUNS=3 npm run bench:agent          # every task, 3 runs each
AGENT_TASKS=cat:forms,login npm run bench:agent           # by category and/or id
AGENT_APPROACHES=mantis,tree npm run bench:agent          # some approaches only
```

| Variable | Default | Meaning |
|---|---|---|
| `AGENT_TASKS` | pilot | `all`, task ids, or `cat:<category>`, comma-separated |
| `AGENT_APPROACHES` | `mantis,tree,screenshot` | which browser approaches to run |
| `AGENT_RUNS` | 1 | runs per task and approach |
| `AGENT_MODEL` | `sonnet` | model passed to `claude -p` |
| `AGENT_CONCURRENCY` | 3 | runs in parallel |
| `AGENT_TIMEOUT_S` | 600 | per-run timeout |
| `AGENT_OUT` | `agent-pilot` / `agent` | results file name |

Each run is isolated: its own `claude -p` process, its own MCP server and browser, built-in
tools off, no user settings, only that approach's browser tools allowed. The prompt is the
same for every approach. A run where the browser tool never connected is marked invalid,
not counted as a failure.

Approaches:

- `mantis`: all Mantis tools (`dist/server.js`).
- `tree`: Playwright MCP 0.0.83, headless, isolated, without its JavaScript-running tools.
- `screenshot`: `agent/screenshot-mcp.ts`, a minimal computer-use-style server
  (screenshot, click(x, y), type, key, scroll, back).

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

- Prefer a local fixture page; add it to `fixtures.ts` if it does not exist.
- `expect` must only match a correct answer.
- When an agent fails somewhere new, turn that page into a task.

Token-replay tasks live in `tasks.ts` as scripted steps (`open`, `click`, `type`, `read`, ...).
