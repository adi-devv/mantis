# Real-site eval, blind-judged: luna-fixes-3

> Each run's final reply and screenshot were graded by `gpt-6.1-sol` without knowing which approach produced it. Screenshots come from the agent's final live page when available; older or failed captures use a fresh load of the reported URL. Tool-revealing lines were stripped and the order shuffled.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Blocked | Overall success rate | Success rate excluding universally blocked tasks | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mantis | 3 | 1 | 1 | 1 | 0 | 33.3% | 33.3% | 13.3 | 272,058 | 60.9 |
| tree | 3 | 2 | 1 | 0 | 0 | 66.7% | 66.7% | 19.7 | 755,542 | 67.7 |
| screenshot | 3 | 0 | 2 | 1 | 0 | 0.0% | 0.0% | 31.7 | 554,833 | 95.2 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `bc2ce7f2` medium: Estimate the federal income tax I would owe on $158,500 of taxable income in ZIP c | success | success | failure |
| `824eb7bb` hard: Get the women's black swimsuit, size large, with the lowest price, and add it to my | unsure | failure | unsure |
| `0e42c3a7` medium: Find a gas station in Manhattan, NY with a rating above 4.0, and sort the user rev | failure | success | failure |
