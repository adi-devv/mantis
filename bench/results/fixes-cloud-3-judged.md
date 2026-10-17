# Real-site eval, blind-judged: fixes-cloud-3

> Each run's final reply and screenshot were graded by `claude-opus-5-5` without knowing which approach produced it. Screenshots come from the agent's final live page when available; older or failed captures use a fresh load of the reported URL. Tool-revealing lines were stripped and the order shuffled.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Blocked | Overall success rate | Success rate excluding universally blocked tasks | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mantis | 9 | 2 | 7 | 0 | 0 | 22.2% | 22.2% | 34.1 | 853,021 | 127.8 |
| tree | 9 | 0 | 9 | 0 | 0 | 0.0% | 0.0% | 2.7 | 39,058 | 10.2 |
| screenshot | 9 | 2 | 7 | 0 | 0 | 22.2% | 22.2% | 48.0 | 897,973 | 69.8 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `824eb7bb` hard: Get the women's black swimsuit, size large, with the lowest price, and add it to my | success, failure, failure | failure, failure, failure | success, failure, success |
| `bc2ce7f2` medium: Estimate the federal income tax I would owe on $158,500 of taxable income in ZIP c | failure, success, failure | failure, failure, failure | failure, failure, failure |
| `0e42c3a7` medium: Find a gas station in Manhattan, NY with a rating above 4.0, and sort the user rev | failure, failure, failure | failure, failure, failure | failure, failure, failure |
