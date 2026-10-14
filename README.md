# Mantis

**A lean browser interface for AI agents.**

Websites are built for human eyes. AI agents end up taking screenshots,
guessing where to click, and burning tokens. Mantis translates a web page
into short, numbered text that an agent can read and act on:

```
Page: Login — Acme
[main]
  # Sign in
  #12 textbox "Email"
  #13 textbox "Password"
  #14 button "Sign in"
```

The agent says `click(14)`. Mantis clicks it and reports only what changed.

- **Not another agent** — no LLM inside, deterministic output.
- **Text first** — images only as an opt-in fallback.
- **Plugs into any agent** via MCP.

> Status: early development. See [PLAN.md](PLAN.md) and [PROGRESS.md](PROGRESS.md).
