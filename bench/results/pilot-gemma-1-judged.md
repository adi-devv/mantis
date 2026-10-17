# Real-site eval, blind-judged: pilot-gemma-1

> Each current-format run was graded blind by `deepseekv4.1-flash` from the agent's final reply and a judge evidence packet of per-step harness frames (page image, URL, text, and final form values); deterministic task checks can override the judge. Legacy runs use the final live-page screenshot, or a fresh load when unavailable. Tool-revealing lines were stripped and the order shuffled.

## Per approach

| Approach | Runs | Success | Failure | Unsure | Blocked | Site broken | Overall success rate | Success rate excluding universally blocked / site-broken tasks | Avg tool calls | Avg input tokens | Avg time (s) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| mantis | 2 | 0 | 1 | 1 | 0 | 0 | 0.0% | 0.0% | 2.0 | 4,605 | 19.7 |
| tree | 2 | 0 | 1 | 1 | 0 | 0 | 0.0% | 0.0% | 6.0 | 17,448 | 11.5 |
| screenshot | 2 | 0 | 1 | 1 | 0 | 0 | 0.0% | 0.0% | 1.0 | 1,534 | 2.5 |

Universally blocked tasks: none. Site-broken tasks: none.

## Per task

| Task | mantis | tree | screenshot |
|---|---|---|---|
| `form-sub` forms: Open http://fixture.invalid/form. Subscribe from Canada and opt in to the weekly ne | failure | failure | failure |
| `wikipedi` reading: Open https://en.wikipedia.org/wiki/Alan_Turing. On what date was Alan Turing born | unsure | unsure | unsure |

## Evidence and checks

| Approach | Evidence runs | Success | Failure | Unsure | Blocked | Site broken | With frames | Citing an earlier frame |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| mantis | 2 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| tree | 2 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |
| screenshot | 2 | 0 | 1 | 1 | 0 | 0 | 0 | 0 |

### Check vs judge disagreements

None.
