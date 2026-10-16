# Real-site eval, blind-judged: haiku-cloud-5

> Each run's final reply and screenshot were graded by `claude-opus-5-5` without knowing which approach produced it. Screenshots come from the agent's final live page when available; older or failed captures use a fresh load of the reported URL. Tool-revealing lines were stripped and the order shuffled.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Blocked | Overall success rate | Success rate excluding universally blocked tasks | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mantis | 5 | 3 | 2 | 0 | 0 | 60.0% | 60.0% | 31.2 | 672,003 | 127.5 |
| tree | 5 | 2 | 2 | 1 | 0 | 40.0% | 40.0% | 33.8 | 1,418,379 | 145.5 |
| screenshot | 5 | 3 | 2 | 0 | 0 | 60.0% | 60.0% | 53.0 | 828,365 | 109.3 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `0e42c3a7` medium: Find a gas station in Manhattan, NY with a rating above 4.0, and sort the user rev | failure | failure | failure |
| `04613880` medium: Find discussions of the community and open the one with the most replies of all ti | success | success | success |
| `11857213` medium: Add the most top-selling Birkenstock's men clogs in brown, size 10-10.5 to my cart | success | success | success |
| `824eb7bb` hard: Get the women's black swimsuit, size large, with the lowest price, and add it to my | failure | failure | success |
| `eb323dc5` hard: Find the cheapest 2 bed and 3+ bath apartment listing for rent in New York. | success | unsure | failure |
