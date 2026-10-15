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
AGENT_OUT=agent-verified-pilot npm run bench:agent                                      # pilot: 2 tasks x 5 approaches
AGENT_OUT=agent-verified-all AGENT_TASKS=all AGENT_RUNS=3 npm run bench:agent          # every task, 3 runs each
AGENT_OUT=agent-verified-forms AGENT_TASKS=cat:forms,login npm run bench:agent          # by category and/or id
AGENT_OUT=agent-verified-subset AGENT_APPROACHES=mantis,tree npm run bench:agent        # some approaches only
```

| Variable | Default | Meaning |
|---|---|---|
| `AGENT_TASKS` | pilot | `all`, task ids, or `cat:<category>`, comma-separated |
| `AGENT_APPROACHES` | all five approaches | `mantis,tree,devtools,browseruse,screenshot` |
| `AGENT_RUNS` | 1 | runs per task and approach |
| `AGENT_MODEL` | `claude-sonnet-4-6` | model passed to `claude -p` |
| `AGENT_CONCURRENCY` | 3 | runs in parallel |
| `AGENT_TIMEOUT_S` | 600 | per-run timeout |
| `AGENT_OUT` | `agent-pilot` / `agent` | results file name (must not already exist unless resuming or overwriting) |
| `AGENT_RESUME` | 0 | resume only when schema, settings, and source fingerprint match exactly |
| `AGENT_OVERWRITE` | 0 | explicitly replace an existing result file |

Each attempt is isolated: its own `claude -p` process, MCP server, and browser, with built-in
tools off, no user settings, and only that approach's browser tools allowed. The prompt is the
same for every approach. A task and approach run is retried once only after an MCP connection
failure; both attempts and their usage/cost remain in the output. Connection failures are shown
separately and excluded from the correctness denominator. A timeout, CLI error, crash, grader
failure, or wrong answer after launch counts as an attempted failure, including a timeout after
MCP connected.

Claude's stream supplies normal input, cache-write input, cache-read input, output tokens, cost,
and model metadata. Missing usage stays `unknown`, rather than becoming zero. If a stream ends
without its final usage event, observed partial usage stays in that attempt's JSON record while
exact aggregate usage is marked unknown. The report also counts browser tool output characters and
image blocks. This is a separate diagnostic from billed input tokens; the benchmark does not
subtract one from the other.

The report separates MCP startup (server spawn and warm-up) from Claude CLI time. CLI startup is
launch to its first init event; CLI execution is init to process exit. Fixture verification and
cleanup are timed separately. These are wall-clock boundaries and include parallel-run contention.
The CLI does not provide a reliable tool-time versus model-time split, so the benchmark does not
estimate one. Recovered MCP tool errors are counted separately and do not erase a correct final
answer and fixture state. The result JSON includes the schema version, settings, runtime and
browser environment, source hashes, and configuration fingerprint; resume rejects old schemas or
changed settings/source/environment. Existing results require `AGENT_RESUME=1` or
`AGENT_OVERWRITE=1`.

The committed `agent*.json` outputs are historical and predate schema 2, so they cannot be
resumed. Use a new `AGENT_OUT` name for a fresh benchmark; the default pilot and full-run names
already exist in the repository and are protected by the overwrite guard.

Local fixture pages send browser events and page state to an independent grader using injected
event listeners and keepalive requests. This adds browser work that is not separately measured,
and it is applied to every approach on local tasks. The live Wikipedia task has no independent
page-state grader; it is checked by the answer pattern alone and may change over time.

Approaches:

- `mantis`: all Mantis tools (`dist/server.js`).
- `tree`: Playwright MCP 0.0.83, headless, isolated, without its JavaScript-running tools.
- `devtools`: Chrome DevTools MCP 1.10.1 with page JavaScript and unrelated categories disabled.
- `browseruse`: browser-use MCP, with LLM-backed and raw-HTML tools disabled.
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
