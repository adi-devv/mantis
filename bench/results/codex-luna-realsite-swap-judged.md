# Real-site eval, blind-judged: codex-luna-realsite-swap

> Each run's final reply and a fresh screenshot of its final URL were graded by `claude-sonnet-5-5` (Claude Code, Read tool only) without knowing which approach produced it. Tool-revealing lines were stripped from the reply and the order was shuffled. Sites change over time and the screenshot is a fresh load, so treat this as a snapshot.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|
| mantis | 5 | 3 | 2 | 0 | 8.2 | 189,881 | 58.0 |
| tree | 5 | 2 | 3 | 0 | 10.6 | 304,613 | 41.2 |
| screenshot | 5 | 4 | 1 | 0 | 19.6 | 348,788 | 91.6 |

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `bf3b311c` easy: Compare Apple watches and  learn more about the ultra version on apple. | success | success | success |
| `4f903626` easy: Find press releases by the antitrust division in 2022. | failure | failure | failure |
| `a69d2934` medium: Show me recipes for pancakes in Japan without flour. | success | success | success |
| `bc2ce7f2` medium: Estimate the federal income tax I would owe on $158,500 of taxable income in ZIP c | failure | failure | success |
| `60cbbbd5` medium: Look up if the phone number 555555555 is a scam. | success | failure | success |
