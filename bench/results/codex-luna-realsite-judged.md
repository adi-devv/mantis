# Real-site eval, blind-judged: codex-luna-realsite

> Each run's final reply and a fresh screenshot of its final URL were graded by `claude-sonnet-5-5` (Claude Code, Read tool only) without knowing which approach produced it. Tool-revealing lines were stripped from the reply and the order was shuffled. Sites change over time and the screenshot is a fresh load, so treat this as a snapshot.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|
| mantis | 10 | 4 | 6 | 0 | 5.3 | 118,006 | 37.3 |
| tree | 10 | 3 | 6 | 1 | 8.1 | 185,473 | 39.4 |
| screenshot | 10 | 2 | 7 | 1 | 9.7 | 169,459 | 42.2 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `ba2a469a` medium: Search for a beginner’s course in computer science that includes python programmin | success | success | success |
| `27fa3ac2` hard: Browse the class schedule of graduate-level chemistry courses on Monday afternoons i | failure | unsure | failure |
| `29b7372d` easy: Browse the first top news of Microsoft stock on Google Finance. | success | success | success |
| `180ed2ec` easy: Find the way to give a gift to UM-Dearborn. | failure | failure | failure |
| `3dca7cbe` easy: Can you show me products under the category path 'zara home' -> 'rug', with an addit | failure | failure | failure |
| `56f8890a` medium: Show crazy credits for the movie " Prometheus" on IMDb. | failure | failure | failure |
| `64b76158` medium: Compare two pescatarian diets for eating healthier. | success | failure | unsure |
| `9d46ccb9` medium: Get a quote for the fastest shipping available for 5 lbs with dimensions of 4 inch | failure | failure | failure |
| `9ed38272` hard: If I'm 30, plan to retire at 65, and have $30000 as starting balance, with a 3% annu | success | success | failure |
| `c1d6ea6f` medium: Create a list of drip coffee makers that are on sale and within $25-60 and have a | failure | failure | failure |
