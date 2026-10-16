# Agent guidance

Rules for any coding agent working in this repo (Codex reads this file; Claude Code reads it via CLAUDE.md).

## Talking to the user
- Keep replies short and to the point: lead with the result in 1–3 lines. Use tables only when they replace more text. Skip background and caveats unless they change a decision.

## Working
- Do independent light tasks in parallel, not one after another: reads, searches, edits, builds, small test runs. Only steps that need an earlier result wait.
- Run heavy jobs (agent evals, full suites, anything launching many browsers) one at a time, so they don't fight over RAM.

## Models
| Agent | Planning, analysis, review | Implementation (writing and editing code) |
|---|---|---|
| Claude Code | Opus, high effort | Sonnet subagent (`model: "sonnet"`) |
| Codex | `gpt-6.1-sol`, high reasoning effort | `gpt-6-luna` |

Plan on the strong model and hand the coding to the cheaper one with a clear brief (files, what done looks like). Then review the diff on the strong model.

## Testing and evals
- Always run at the highest parallelism this machine allows (12 cores). For vitest, use the default thread pool and don't serialise. For agent evals, set `AGENT_CONCURRENCY` as high as RAM allows (about 6 browsers).
- Don't run the unit suite while a big eval is running; they compete for RAM.
- Run long work (evals, full suites) in the background and report when it finishes.

## Commands
See `README.md` (build/test) and `bench/README.md` (benchmarks, `AGENT_*` env vars, result format).

## Benchmark focus
- Our main competitor is the accessibility-tree tool (Playwright MCP). Routine comparisons are Mantis vs tree vs screenshot. Skip browser-use and DevTools unless asked.
- Every agent task needs a grader test in `test/fixture-verification.test.ts` with a passing case and a near-miss failing case.

## Git
- Commit or push only when the user asks. Don't commit `bench/results/agent-debug.*` or `codex-smoke.*`.
