# Real-agent eval

> Claude Code (`claude -p`, model `sonnet`) does each task with one browser approach at a time. "ok" = the final reply contains the expected answer. Tokens are everything the model read (input incl. cached) and wrote, as reported by Claude Code; cost is its API-price estimate. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-15; runs per task and approach: 1; 3 runs in parallel (times are wall-clock per run and include contention between parallel runs)
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off.

## Summary

| | Chrome DevTools MCP | browser-use (MCP) | Mantis |
|---|---:|---:|---:|
| Correct | 3 / 3 | 3 / 3 | 3 / 3 |
| Invalid runs (tool did not connect) | 0 | 0 | 0 |
| Tool calls (total) | 12 | 17 | 12 |
| Turns (total) | 15 | 20 | 15 |
| Input tokens (total) | 147,292 | 191,990 | 137,465 |
| Output tokens (total) | 1,309 | 1,466 | 1,072 |
| Time (total, s) | 61 | 75 | 55 |
| Cost estimate (USD) | 0.12 | 0.17 | 0.11 |

## Per run

| Task | Approach | Run | OK | Tool calls | Input tok | Output tok | Time (s) | Answer / error |
|---|---|---:|:-:|---:|---:|---:|---:|---|
| `form-subscribe` | Chrome DevTools MCP | 1 | ✅ | 4 | 48,936 | 406 | 23 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | browser-use (MCP) | 1 | ✅ | 6 | 66,863 | 492 | 30 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Mantis | 1 | ✅ | 4 | 45,511 | 325 | 15 | Subscribed from Canada (weekly: yes). |
| `plans-pick` | Chrome DevTools MCP | 1 | ✅ | 4 | 48,692 | 447 | 22 | PRO-77 |
| `plans-pick` | browser-use (MCP) | 1 | ✅ | 4 | 47,574 | 368 | 19 | PRO-77 |
| `plans-pick` | Mantis | 1 | ✅ | 3 | 36,162 | 245 | 13 | PRO-77 |
| `iframe-pay` | Chrome DevTools MCP | 1 | ✅ | 4 | 49,664 | 456 | 16 | R-5531 |
| `iframe-pay` | browser-use (MCP) | 1 | ✅ | 7 | 77,553 | 606 | 27 | R-5531 |
| `iframe-pay` | Mantis | 1 | ✅ | 5 | 55,792 | 502 | 27 | R-5531 |
