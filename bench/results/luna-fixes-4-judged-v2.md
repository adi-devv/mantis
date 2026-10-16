# Real-site eval, blind-judged: luna-fixes-4

> Each run's final reply and screenshot were graded by `gpt-6.1-sol` without knowing which approach produced it. Screenshots come from the agent's final live page when available; older or failed captures use a fresh load of the reported URL. Tool-revealing lines were stripped and the order shuffled.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Blocked | Overall success rate | Success rate excluding universally blocked tasks | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mantis | 9 | 1 | 0 | 8 | 0 | 11.1% | 11.1% | 18.7 | 455,233 | 72.3 |
| tree | 9 | 0 | 5 | 4 | 0 | 0.0% | 0.0% | 14.9 | 463,082 | 53.5 |
| screenshot | 9 | 1 | 3 | 5 | 0 | 11.1% | 11.1% | 30.8 | 495,967 | 82.0 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `bc2ce7f2` medium: Estimate the federal income tax I would owe on $158,500 of taxable income in ZIP c | unsure, unsure, unsure | unsure, unsure, unsure | failure, unsure, failure |
| `824eb7bb` hard: Get the women's black swimsuit, size large, with the lowest price, and add it to my | unsure, unsure, unsure | failure, failure, failure | unsure, unsure, failure |
| `0e42c3a7` medium: Find a gas station in Manhattan, NY with a rating above 4.0, and sort the user rev | unsure, success, unsure | failure, unsure, failure | success, unsure, unsure |
