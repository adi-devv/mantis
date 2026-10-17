# Real-site eval, blind-judged: settle-cloud-3

> Each run's final reply and screenshot were graded by `claude-opus-5-5` without knowing which approach produced it. Screenshots come from the agent's final live page when available; older or failed captures use a fresh load of the reported URL. Tool-revealing lines were stripped and the order shuffled.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Blocked | Overall success rate | Success rate excluding universally blocked tasks | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mantis | 9 | 1 | 6 | 2 | 0 | 11.1% | 11.1% | 41.8 | 911,866 | 150.3 |
| tree | 9 | 1 | 8 | 0 | 0 | 11.1% | 11.1% | 42.0 | 1,816,040 | 208.3 |
| screenshot | 9 | 1 | 8 | 0 | 0 | 11.1% | 11.1% | 73.6 | 1,285,147 | 144.1 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `824eb7bb` hard: Get the women's black swimsuit, size large, with the lowest price, and add it to my | failure, unsure, unsure | failure, success, failure | failure, failure, success |
| `bc2ce7f2` medium: Estimate the federal income tax I would owe on $158,500 of taxable income in ZIP c | failure, failure, success | failure, failure, failure | failure, failure, failure |
| `0e42c3a7` medium: Find a gas station in Manhattan, NY with a rating above 4.0, and sort the user rev | failure, failure, failure | failure, failure, failure | failure, failure, failure |
