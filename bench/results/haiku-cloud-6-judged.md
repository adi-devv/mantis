# Real-site eval, blind-judged: haiku-cloud-6

> Each run's final reply and screenshot were graded by `claude-sonnet-5-5` without knowing which approach produced it. Screenshots come from the agent's final live page when available; older or failed captures use a fresh load of the reported URL. Tool-revealing lines were stripped and the order shuffled.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Blocked | Overall success rate | Success rate excluding universally blocked tasks | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mantis | 9 | 3 | 6 | 0 | 0 | 33.3% | 33.3% | 31.7 | 484,212 | 105.5 |
| tree | 9 | 1 | 7 | 1 | 0 | 11.1% | 11.1% | 51.0 | 1,783,123 | 176.9 |
| screenshot | 9 | 2 | 7 | 0 | 0 | 22.2% | 22.2% | 57.7 | 790,178 | 81.6 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `824eb7bb` hard: Get the women's black swimsuit, size large, with the lowest price, and add it to my | success, success, success | failure, failure, unsure | failure, success, success |
| `bc2ce7f2` medium: Estimate the federal income tax I would owe on $158,500 of taxable income in ZIP c | failure, failure, failure | failure, failure, success | failure, failure, failure |
| `0e42c3a7` medium: Find a gas station in Manhattan, NY with a rating above 4.0, and sort the user rev | failure, failure, failure | failure, failure, failure | failure, failure, failure |
