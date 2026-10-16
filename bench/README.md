# Benchmarks

Two benchmarks compare Mantis with the accessibility tree (Playwright MCP) and with screenshots.
All numbers: [RESULTS.md](RESULTS.md).

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

### Real-site tasks (blind judge)

The task file is not in the repo (the dataset is gated). To get it, accept the terms at [osunlp/Online-Mind2Web](https://huggingface.co/datasets/osunlp/Online-Mind2Web), download `Online_Mind2Web.json` and save it as `bench/agent/realsite-tasks.json`.

`AGENT_TASKS=cat:realsite` runs tasks from `agent/realsite-tasks.json` (Online-Mind2Web rows: `task_id`, `website`, `confirmed_task`, `level`; no file means no tasks). `AGENT_REALSITE_N` (default 10) rows are sampled, stratified by `level`, with a seeded shuffle (`AGENT_REALSITE_SEED`, default 1). `AGENT_TASKS=all` skips them.
The agent ends with a `FINAL_URL:` line, so the usual grading only checks that it finished. For Mantis, tree and screenshot runs, the harness saves a 1280x800 PNG of the agent's live page immediately after the CLI exits, beside its unique run log. `JUDGE_IN=<result name> npm run bench:judge` has Codex (`gpt-6.1-sol`, high reasoning, read-only, screenshot attached) judge each run blind (`JUDGE_PROVIDER=claude` uses `claude-sonnet-5-5` instead), from the final reply (tool-revealing lines stripped, run order shuffled) and that PNG. Older runs and failed captures use a fresh screenshot of the reported final URL. It writes `results/<name>-judged.{json,md}` with success / failure / unsure / blocked counts, overall success rate, and a rate excluding task IDs blocked for every tested approach.

### Running in the cloud

A cloud session clones the repo fresh, so two things that work locally break there:

- **No real-site task file.** `realsite-tasks.json` is gitignored and the Hugging Face download is gated (401 without a token). Never commit it. Put the rows the run needs (copied from your local file) inline in the cloud brief, and tell the session to write them to `bench/agent/realsite-tasks.json` before running. Without the file there are no real-site tasks, so the run selects nothing.
- **Root user.** Cloud containers run as root, and Chrome refuses to start as root without `--no-sandbox`. Mantis and screenshot already pass it. For `tree`, `run.ts` adds it to Playwright MCP's args when `process.getuid() === 0`. Any new approach that launches its own browser needs the same flag, or every run of it fails at launch.
- **Chromium build.** If Playwright's pinned Chromium build isn't installed (cloud images ship an older one under `/opt/pw-browsers`), set `MANTIS_CHROMIUM` to an installed binary, e.g. `/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`. Every approach, the UA probe and the judge then use it.

To run specific rows, pick them by id and set `AGENT_REALSITE_N` at least as high as the row count, so sampling keeps them all. Example:

```bash
AGENT_PROVIDER=claude AGENT_MODEL=claude-haiku-5-5 AGENT_REALSITE_N=300 AGENT_TASKS=<id1>,<id2> \
AGENT_RUNS=3 AGENT_CONCURRENCY=6 AGENT_OUT=<name> npm run bench:agent
JUDGE_PROVIDER=claude JUDGE_IN=<name> npm run bench:judge
```

A cloud session can't message back and sends no notice when it ends. Have it commit `bench/results/<name>*` and the judged files to a `bench/<name>` branch and push, then read the results from that branch.

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
