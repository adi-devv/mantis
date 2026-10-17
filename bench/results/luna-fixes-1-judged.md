# Real-site eval, blind-judged: luna-fixes-1

> Each run's final reply and screenshot were graded by `claude-sonnet-5-5` without knowing which approach produced it. Screenshots come from the agent's final live page when available; older or failed captures use a fresh load of the reported URL. Tool-revealing lines were stripped and the order shuffled.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Blocked | Overall success rate | Success rate excluding universally blocked tasks | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mantis | 3 | 1 | 1 | 1 | 0 | 33.3% | 33.3% | 12.7 | 283,272 | 76.3 |
| tree | 3 | 0 | 2 | 1 | 0 | 0.0% | 0.0% | 19.3 | 738,593 | 88.7 |
| screenshot | 3 | 1 | 2 | 0 | 0 | 33.3% | 33.3% | 33.3 | 516,819 | 94.8 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `bc2ce7f2` medium: Estimate the federal income tax I would owe on $158,500 of taxable income in ZIP c | success | failure | success |
| `824eb7bb` hard: Get the women's black swimsuit, size large, with the lowest price, and add it to my | unsure | unsure | failure |
| `0e42c3a7` medium: Find a gas station in Manhattan, NY with a rating above 4.0, and sort the user rev | failure | failure | failure |
