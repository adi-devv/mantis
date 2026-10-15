# Real-agent eval

> Claude Code (`claude -p`, model `sonnet`) does each task with one browser approach at a time. "ok" = the final reply contains the expected answer. Tokens are everything the model read (input incl. cached) and wrote, as reported by Claude Code; cost is its API-price estimate. An LLM is in the loop, so numbers vary run to run.

- Date: 2026-10-15; runs per task and approach: 1
- Mantis: all its tools. Accessibility tree: Playwright MCP 0.0.83 (headless, isolated) without its JavaScript-running tools. Screenshots: a minimal computer-use-style server (bench/agent/screenshot-mcp.ts): screenshot, click(x,y), type, key, scroll, back.
- No skill, no system prompt beyond the task; built-in tools off.

## Summary

| | Mantis | Accessibility tree (Playwright MCP) | Screenshots (click by x,y) |
|---|---:|---:|---:|
| Correct | 2 / 2 | 2 / 2 | 2 / 2 |
| Invalid runs (tool did not connect) | 0 | 0 | 0 |
| Tool calls (total) | 5 | 7 | 22 |
| Turns (total) | 7 | 9 | 24 |
| Input tokens (total) | 64,277 | 109,060 | 304,274 |
| Output tokens (total) | 481 | 637 | 1,593 |
| Time (total, s) | 25 | 28 | 64 |
| Cost estimate (USD) | 0.06 | 0.09 | 0.20 |

## Per run

| Task | Approach | Run | OK | Tool calls | Input tok | Output tok | Time (s) | Answer / error |
|---|---|---:|:-:|---:|---:|---:|---:|---|
| `form-subscribe` | Mantis | 1 | ✅ | 4 | 45,531 | 325 | 14 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Accessibility tree (Playwright MCP) | 1 | ✅ | 5 | 70,585 | 421 | 15 | Subscribed from Canada (weekly: yes). |
| `form-subscribe` | Screenshots (click by x,y) | 1 | ✅ | 20 | 281,041 | 1,384 | 51 | Subscribed from Canada (weekly: yes). |
| `wikipedia-birthdate` | Mantis | 1 | ✅ | 1 | 18,746 | 156 | 11 | Alan Turing was born on **23 June 1912**. |
| `wikipedia-birthdate` | Accessibility tree (Playwright MCP) | 1 | ✅ | 2 | 38,475 | 216 | 13 | 23 June 1912 |
| `wikipedia-birthdate` | Screenshots (click by x,y) | 1 | ✅ | 2 | 23,233 | 209 | 12 | Alan Turing was born on 23 June 1912. |
