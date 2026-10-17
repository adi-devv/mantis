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

Needs a logged-in Codex CLI (`codex login`) by default. `AGENT_PROVIDER=claude` uses Claude Code instead; `AGENT_PROVIDER=sarvam` calls Sarvam V2 directly (set `SARVAM_API_KEY` in the environment or ignored `.env`).

```bash
npm run bench:agent                                                                   # pilot: 2 tasks x 3 approaches
AGENT_OUT=my-all AGENT_TASKS=all AGENT_RUNS=3 npm run bench:agent                     # every task, 3 runs each
AGENT_OUT=my-long AGENT_TASKS=cat:long npm run bench:agent                            # one category (or task ids)
AGENT_OUT=my-subset AGENT_APPROACHES=mantis,tree npm run bench:agent                  # some approaches only
```

| Variable | Default | Meaning |
|---|---|---|
| `AGENT_PROVIDER` | `codex` | `codex`, `claude`, or `sarvam` |
| `AGENT_TASKS` | pilot | `all`, task ids, or `cat:<category>`, comma-separated |
| `AGENT_APPROACHES` | `mantis,tree,screenshot` | also `devtools`, `browseruse` |
| `AGENT_RUNS` | 1 | runs per task and approach |
| `AGENT_MODEL` | `gpt-6.1-sol` (Codex), `claude-haiku-5-5` (Claude) | model of the selected provider |
| `AGENT_REASONING` | `medium` | Codex reasoning effort (`low`, `medium`, `high`, `xhigh`, `max`) |
| `AGENT_MAX_STEPS` | `100` | Sarvam tool-loop step budget |
| `CODEX_BIN`, `CLAUDE_BIN` | installed CLI | path override for the agent CLI |
| `AGENT_CONCURRENCY` | 3 (2 for Sarvam) | runs in parallel; raise as far as RAM allows (each run is an agent CLI, an MCP server and a browser); times then include more contention |
| `AGENT_TIMEOUT_S` | 600 | per-run timeout |
| `AGENT_OUT` | `codex-agent-verified[-pilot]` | result file name; must not already exist unless resuming or overwriting |
| `AGENT_RESUME` | 0 | resume only when schema, settings and source fingerprint match exactly |
| `AGENT_OVERWRITE` | 0 | replace an existing result file |

Categories: `forms`, `reading`, `lists`, `overlays`, `navigation`, `dynamic`, `visual`, and `long`
(multi-step tasks of 15 to 27 actions).

Sarvam agent models are `gemma-4-31b`, `deepseek-v4.1-flash`, `glm-5.3`, and `sarvam-105b` (the first two can receive image tool results). The harness converts the selected MCP server's tool schemas to OpenAI-style function tools, writes the usual per-attempt JSONL trace/evidence packets, retries malformed tool arguments once, and uses Sarvam's shared retry/backoff client. Sarvam costs in result JSON/Markdown are INR estimates from published token pricing; USD remains unknown. Sarvam result/trace summaries include API attempts, response tokens, and HTTP 429 counts.

### Real-site tasks (blind judge)

The task file is not in the repo (the dataset is gated). To get it, accept the terms at [osunlp/Online-Mind2Web](https://huggingface.co/datasets/osunlp/Online-Mind2Web), download `Online_Mind2Web.json` and save it as `bench/agent/realsite-tasks.json`.

`AGENT_TASKS=cat:realsite` runs tasks from `agent/realsite-tasks.json` (Online-Mind2Web rows: `task_id`, `website`, `confirmed_task`, `level`; no file means no tasks). `AGENT_REALSITE_N` (default 10) rows are sampled, stratified by `level`, with a seeded shuffle (`AGENT_REALSITE_SEED`, default 1). `AGENT_TASKS=all` skips them.
The agent ends with a `FINAL_URL:` line, so the usual grading only checks that it finished. For Mantis, tree and screenshot runs, the harness saves a 1280x800 PNG of the agent's live page immediately after the CLI exits, beside its unique run log. `JUDGE_IN=<result name> npm run bench:judge` has Codex (`gpt-6.1-sol`, high reasoning, read-only, screenshot attached) judge each run blind (`JUDGE_PROVIDER=claude` uses `claude-sonnet-5-5` instead), from the final reply (tool-revealing lines stripped, run order shuffled) and that PNG. Older runs and failed captures use a fresh screenshot of the reported final URL. It writes `results/<name>-judged.{json,md}` with success / failure / unsure / blocked / site-broken counts, overall success rate, and a rate excluding task IDs blocked or site-broken for every tested approach and run.

- **Evidence frames.** For Mantis, tree and screenshot runs the harness (not the agent) also captures a 1280x800 viewport frame plus page state (URL, visible text, rendered form values) after each agent tool result, in the background through its own channel on the same MCP server (`agent/mcp-proxy.ts`; it adds nothing to the agent's tool calls, turns or CLI timings). Near-duplicates are dropped and at most 12 frames are kept, always including the first and the final one. They are saved beside the run log as `<run>.step-NN.png`, `<run>.final.png` and a sidecar `<run>.evidence.json`; the result row gets `evidencePath`, `evidenceFrames` and `timings.captureMs` (summary row "Harness capture"). For the tree, the page state comes from the evaluate tool, which the agent cannot use; pages whose CSP forbids `eval` give that frame no text.
- **Judge packet.** Runs with `evidenceFrames` are judged on a chronological packet: each frame's URL, image and page text (earlier frames downscaled to about 640x400 and cut to ~1,200 characters of text; the final frame full size, with its form values), with no step numbers or tool names. The judge replies with `evidence` frame IDs it relied on. Older rows without `evidenceFrames` are judged exactly as before. The judged report ends with an "Evidence and checks" section.
- **Answer-key checks.** Every evaluated row should carry `"checks": {"answerIncludes": [...], "evidenceIncludes": [...]}` (case-insensitive, whitespace collapsed; at least one non-empty list is required). Every `answerIncludes` string must be in the agent's full reply and every `evidenceIncludes` string in some frame's page text. If any check fails the verdict becomes failure (`Checks failed: ...`); `judgeVerdict` keeps the judge's own verdict, and the report lists runs where check and judge disagree. Loading a task file flags every row whose checks are missing or malformed.

### Sarvam judge and capability probe

`JUDGE_PROVIDER=sarvam` uses Sarvam credits instead of the Codex or Claude judge.
Set `SARVAM_API_KEY` in the environment or the repo's gitignored `.env`; existing environment
values take precedence. The client never logs keys or raw API response bodies. Run the capability
probe first; beta access is granted per API key, so a listed model need not accept requests.

All Sarvam requests (agent, judge, probe, and calibration) share one limiter: `SARVAM_RPM` (default 30 requests/minute) and 429 cooldowns are shared across processes through a small file in the OS temp directory (times only, no keys), while `SARVAM_CONCURRENCY` (default 2 active requests) applies per process. Every worker waits out a published cooldown, and the request timeout starts only after the limiter grants a slot. Transient requests retry up to six total attempts with jittered exponential backoff (honoring a longer `Retry-After`). `AGENT_CONCURRENCY` and `JUDGE_CONCURRENCY` default to 2 for Sarvam (other providers keep their normal defaults). Raise the Sarvam variables only when the key's actual quota permits it.

```powershell
npm --prefix bench/agent run bench:sarvam-probe
$env:JUDGE_PROVIDER = 'sarvam'
$env:JUDGE_IN = '<result name>'
npm run bench:judge
```

The probe tests all four candidates independently for a text response, repeated JSON output
(prompt-only and JSON mode), image understanding, and a function call with validated arguments.
`SARVAM_PROBE_SAMPLES` controls samples per JSON mode (default 3, range 3–20). It prints a short table
with latency, observed tokens, and estimated INR cost, and saves no files. Failed capabilities
remain visible rather than being inferred from the model list. Missing usage stays unknown;
costs use [published prices](https://docs.sarvam.ai/api/getting-started/pricing) checked on
2026-10-17, not a billing receipt. Token-budget truncations are counted separately.

The verified [V2 API](https://docs.sarvam.ai/api-reference/chat/chat-completions-v2) uses
`https://api.sarvam.ai/v2/chat/completions` with `api-subscription-key` authentication.
`SARVAM_BASE_URL` overrides the versioned base URL (default `https://api.sarvam.ai/v2`).
The [beta access guide](https://docs.sarvam.ai/api-reference/beta-apis) explains whitelisting.
The supplied model names are accepted as aliases for the current API IDs:

| Name / `JUDGE_MODEL` | API ID |
|---|---|
| `sarvam-105b` | `sarvam-105b` |
| `gemma-4-31b` | `gemma4` |
| `deepseek-v4.1-flash` | `deepseekv4.1-flash` |
| `glm-5.3` | `glm5.3` |

With no `JUDGE_MODEL`, each packet containing screenshots selects `gemma-4-31b`; a text-only
packet selects `deepseek-v4.1-flash`. Screenshots are sent inline in chronological order,
with the existing blind prompt, frame IDs, verdict schema and deterministic checks. JSON judge
calls prefer the API JSON-object format and fall back to the strict prompt-only JSON contract if
that beta route does not support it. `sarvam-105b` tool/JSON/judge calls use `max_tokens: 2048`
and `reasoning_effort: null`; DeepSeek/GLM use the same explicit output budget with low reasoning,
so thinking cannot consume the completion allowance.
Transient failures and invalid judge JSON are retried with backoff. The judge must differ
from the saved agent model, including resolved model IDs and aliases.

Sarvam evaluations are replications of the Luna/Haiku comparison, not pooled replacements for
them: report matched approach tables separately for each agent model and keep the same task rows,
runs, and approaches in each table. The blind judge must always be a different model from the
agent under test, including aliases/resolved IDs.

Calibrate against existing `gpt-6.1-sol` judgments before relying on Sarvam verdicts:

```powershell
npm --prefix bench/agent run bench:sarvam-calibrate
npm --prefix bench/agent run bench:sarvam-calibrate -- <result-name> <another-result-name>
```

The helper npm aliases live in `bench/agent/package.json` to keep root package files unchanged.
Direct `npx tsx bench/agent/sarvam-probe.ts` and `npx tsx bench/agent/sarvam-calibrate.ts`
also work. Calibration reads `bench/results/*-judged.json` plus their original run results, task rows,
logs and saved screenshots. It reuses the judge pipeline and prints agreement, a confusion
matrix and per-task disagreements. `CALIBRATE_IN` also accepts comma-separated result names.
Both final and raw verdicts are compared; older runs without `judgeVerdict` are labeled as
using a final-verdict proxy. Request errors are excluded from agreement. Original judgments are preserved. Missing source runs
or saved evidence are reported separately; calibration never reloads live pages whose
state may have changed. The task file and saved evidence must be available locally.

### Measured Sarvam snapshot (2026-10-17)

The capability probe used five samples per JSON contract. `sarvam-105b` returned valid
prompt-only JSON 5/5 and JSON-mode output 5/5, made the validated function call, and had
a 701 ms median response time. It observed 363 input / 1,005 output tokens and an estimated
₹0.065745+? (one response had no usage); it did not pass the image check. The Gemma smoke
(`pricing-team` / Mantis) passed with 4,354 input / 101 output tokens, ₹0.126280, and zero 429s.

Pilot results below use two default tasks, one run, and `AGENT_CONCURRENCY=2`. Agent pass is
the harness's answer/fixture result; blind-judge pass is a different Sarvam model's `success`
verdict. Tokens are total input including cache / output; costs are published-rate INR estimates.

| Agent model | Approach | Agent pass | Blind-judge pass | Tokens (in/out) | INR | 429s |
|---|---|---:|---:|---:|---:|---:|
| gemma-4-31b | Mantis | 2/2 | 0/2 (DeepSeek judge) | 9,209 / 197 | 0.240845 | 0 |
| gemma-4-31b | Tree | 1/2 | 0/2 (DeepSeek judge) | 34,896 / 684 | 0.566920 | 0 |
| gemma-4-31b | Screenshot | 1/2 | 0/2 (DeepSeek judge) | unknown (1,534 / 69 observed) | 0.051100+? | 0 |
| deepseek-v4.1-flash | Mantis | 2/2 | 1/2 (Gemma judge) | 19,521 / 396 | 0.172101 | 0 |
| deepseek-v4.1-flash | Tree | 1/2 | 0/2 (Gemma judge) | 1,102,818 / 9,828 | 2.626902 | 0 |
| deepseek-v4.1-flash | Screenshot | 2/2 | 0/2 (Gemma judge) | 74,161 / 1,191 | 0.442440 | 0 |

Gemma's screenshot form run failed before any completion with HTTP 400, so its aggregate usage
and cost are incomplete. DeepSeek's tree form run exhausted the 100-step budget (100 MCP errors,
not a rate limit); Gemma's tree form run made no fixture observation. Blind judgments of the
local/live pilot are exploratory: the local fallback catalog has no deterministic answer key and
the live reading verdicts were commonly `unsure`.

### Running in the cloud

A cloud session clones the repo fresh, so three things that work locally break there:

- **No real-site task file.** `realsite-tasks.json` is gitignored and the Hugging Face download is gated (401 without a token). Never commit it. Put the complete rows the run needs inline in the cloud brief, including each row's `checks` answer key, and tell the session to write them unchanged to `bench/agent/realsite-tasks.json` before running. Do not reconstruct or omit checks in the cloud; the loader flags missing or malformed checks. Without the file there are no real-site tasks, so the run selects nothing.
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
