# Real-site eval, blind-judged: haiku-evidence-1

> Each run's final reply and screenshot were graded by `claude-sonnet-5-5` without knowing which approach produced it. Screenshots come from the agent's final live page when available; older or failed captures use a fresh load of the reported URL. Tool-revealing lines were stripped and the order shuffled.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Blocked | Overall success rate | Success rate excluding universally blocked tasks | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mantis | 9 | 1 | 8 | 0 | 0 | 11.1% | 11.1% | 36.6 | 750,016 | 131.5 |
| tree | 9 | 2 | 7 | 0 | 0 | 22.2% | 22.2% | 49.0 | 1,835,972 | 190.8 |
| screenshot | 9 | 0 | 9 | 0 | 0 | 0.0% | 0.0% | 52.3 | 485,963 | 84.4 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `824eb7bb` hard: Get the women's black swimsuit, size large, with the lowest price, and add it to my | success, failure, failure | success, success, failure | failure, failure, failure |
| `bc2ce7f2` medium: Estimate the federal income tax I would owe on $158,500 of taxable income in ZIP c | failure, failure, failure | failure, failure, failure | failure, failure, failure |
| `0e42c3a7` medium: Find a gas station in Manhattan, NY with a rating above 4.0, and sort the user rev | failure, failure, failure | failure, failure, failure | failure, failure, failure |

## Evidence and checks

| Approach | Evidence runs | Success | Failure | Unsure | Blocked | With frames | Citing an earlier frame |
|---|---:|---:|---:|---:|---:|---:|---:|
| mantis | 9 | 1 | 8 | 0 | 0 | 9 | 9 |
| tree | 9 | 2 | 7 | 0 | 0 | 9 | 9 |
| screenshot | 9 | 0 | 9 | 0 | 0 | 9 | 9 |

### Check vs judge disagreements

None.

## Summary

- Success / failure / unsure: mantis 1 / 8 / 0, tree 2 / 7 / 0, screenshot 0 / 9 / 0 (27 runs, claude-haiku-5-5 agent, claude-sonnet-5-5 judge).
- Verdicts citing an earlier frame (F1..F(n-1)): 27 of 27 (mantis 9, tree 9, screenshot 9); every run had live frames.
- Check vs judge disagreements: none. All 9 tax-estimate runs failed the answer check (no run reported or showed the expected figure) and the judge also failed them.
- Only the swimsuit task produced successes (mantis 1, tree 2). The gas-station task failed for every run, and the tax task failed for every run because the calculator showed a client-side error or never returned a result.
