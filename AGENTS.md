# Agent guidance

Rules for any coding agent working in this repo (Codex reads this file; Claude Code reads it via CLAUDE.md).

## Talking to the user
- Keep replies short and to the point: lead with the result in 1–3 lines. Use tables only when they replace more text. Skip background and caveats unless they change a decision.

## Working
- Do independent light tasks in parallel, not one after another: reads, searches, edits, builds, small test runs. Only steps that need an earlier result wait.
- Run heavy jobs (agent evals, full suites, anything launching many browsers) one at a time, so they don't fight over RAM.
- Fix bugs that evals expose in general, never around the case that exposed them. No site names, URLs, site class names or task text in `src/`. Reproduce the pattern in a synthetic fixture, then test it with a passing case and a near miss.

## Models
| Agent | Planning, analysis, review | Implementation (writing and editing code) |
|---|---|---|
| Claude Code | Opus, high effort | Sonnet subagent (`model: "sonnet"`) |
| Codex | `gpt-6.1-sol`, high reasoning effort | `gpt-5.6-terra` |
| Sarvam evals | Under test/judge: `deepseek-v4.1-flash` (long/routine), `gemma-4-31b` (short/visual), or `sarvam-105b` (structured JSON/summaries; reasoning off) | `glm-5.3` coding-review trial only |

Plan on the strong model and hand the coding to the cheaper one with a clear brief (files, what done looks like). Then review the diff on the strong model.

- Cloud sessions (cloud evals and other cloud work) run on Sonnet.
- The agent under test in evals is `claude-haiku-5-5` (`AGENT_PROVIDER=claude`) or `gpt-6-luna` (Codex, `AGENT_MODEL=gpt-6-luna`).
- Sarvam runs replicate Luna/Haiku runs; within a comparison, every approach uses the same agent model, with matched tables per model.
- Put `SARVAM_API_KEY` only in gitignored `.env`.

## Testing and evals
- Always run at the highest parallelism this machine allows (12 cores). For vitest, use the default thread pool and don't serialise. For agent evals, set `AGENT_CONCURRENCY` as high as RAM allows (about 6 browsers).
- Don't run the unit suite while a big eval is running; they compete for RAM.
- Run long work (evals, full suites) in the background and report when it finishes.
- Run Sarvam jobs one at a time: its shared limiter is 30 RPM / 2 concurrency.

## Commands
See `docs/SETUP.md` (build/test) and `bench/README.md` (benchmarks, `AGENT_*` env vars, result format).

## Benchmark focus
- Our main competitor is the accessibility-tree tool (Playwright MCP). Routine comparisons are Mantis vs tree vs screenshot. Skip browser-use and DevTools unless asked.
- Real-site runs are graded by the blind judge (`npm run bench:judge`). The judge must differ from the agent under test. Keep Codex `gpt-6.1-sol`, high reasoning, as the default judge until the calibration gate passes: at least 100 packets, 30 tasks, 95% agreement, and no more than 2% false successes. Use Sonnet (`JUDGE_PROVIDER=claude`) only where Codex isn't, such as cloud sessions.
- Before briefing a cloud eval, read "Running in the cloud" in `bench/README.md`. The brief must include the real-site task rows inline, because the task file is gitignored and gated.
- Every agent task needs a grader test in `test/fixture-verification.test.ts` with a passing case and a near-miss failing case.

## Git
- Commit or push only when the user asks. Don't commit `bench/results/agent-debug.*` or `codex-smoke.*`.
