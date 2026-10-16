# Agent guidance

Rules for any coding agent working in this repo (Codex reads this file; Claude Code reads it via CLAUDE.md).

## Talking to the user
- Keep replies short and to the point: lead with the result in 1–3 lines. Use tables only when they replace more text. Skip background and caveats unless they change a decision.

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
- `npm test`: unit and fixture tests (vitest).
- `npx tsc --noEmit`: type check.
- `npm run bench:agent`: real-agent eval. It is configured with environment variables:
  - `AGENT_PROVIDER` (codex|claude) and `AGENT_MODEL`
  - `AGENT_TASKS` (all | ids | `cat:<category>`)
  - `AGENT_APPROACHES` (default `mantis,tree,screenshot`)
  - `AGENT_RUNS`, `AGENT_CONCURRENCY`, `AGENT_TIMEOUT_S`, `AGENT_OUT`
- Results go to `bench/results/<AGENT_OUT>.{json,md}`. The per-run array is `results`.

## Benchmark focus
- Our main competitor is the accessibility-tree tool (Playwright MCP). Routine comparisons are Mantis vs tree vs screenshot. Skip browser-use and DevTools unless asked.
- Fixture grading comes from the page observer, not the agent's claims. Every task needs a grader test in `test/fixture-verification.test.ts` with a passing case and a near-miss failing case.

## Git
- Commit or push only when the user asks. Don't commit `bench/results/agent-debug.*` or `codex-smoke.*`.
