# Real-site eval, blind-judged: codex-luna-realsite30-b1

> Each run's final reply and a fresh screenshot of its final URL were graded by `gpt-6.1-sol` (screenshot only, no other tools) without knowing which approach produced it. Tool-revealing lines were stripped from the reply and the order was shuffled. Sites change over time and the screenshot is a fresh load, so treat this as a snapshot.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|
| mantis | 8 | 3 | 4 | 1 | 10.8 | 218,651 | 73.6 |
| tree | 8 | 3 | 4 | 1 | 16.4 | 701,148 | 62.9 |
| screenshot | 8 | 2 | 4 | 2 | 20.3 | 296,019 | 77.5 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `ec78d3a6` hard: What are the benefits and financial support a single person living in England, over | success | success | success |
| `6b5be176` easy: Show me historical data for EUR/USD. | success | success | success |
| `bd1e3770` easy: Browse service listings for a solar panel installer and hide duplicates. | unsure | unsure | unsure |
| `5c00e956` easy: Find the recommended dosage for Vivitrol. | success | success | failure |
| `eb323dc5` hard: Find the cheapest 2 bed and 3+ bath apartment listing for rent in New York. | failure | failure | unsure |
| `c03ee2be` hard: Find a dog groomer for nail trimming within 100 miles of zip code 10005 and check th | failure | failure | failure |
| `824eb7bb` hard: Get the women's black swimsuit, size large, with the lowest price, and add it to my | failure | failure | failure |
| `0e42c3a7` medium: Find a gas station in Manhattan, NY with a rating above 4.0, and sort the user rev | failure | failure | failure |
