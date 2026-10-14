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

## Quick start

Requires Node 20+.

```bash
npm install
npx playwright install chromium   # one-time browser download
npm run build

# print the numbered text view of any page (plus a ~token estimate)
npx tsx src/cli.ts read https://example.com
```

Add Mantis to Claude Code as an MCP server (use the absolute path to this checkout):

```bash
claude mcp add mantis -- node /abs/path/to/mantis/dist/server.js
```

Tools: `open(url)`, `read()`, `click(id)`, `type(id, text, submit?)`, `select(id, option)`,
`press(key)`, `scroll(direction | id)`, `back()`. Set `MANTIS_HEADLESS=0` to watch the browser.
Run the tests with `npm test`.

> Status: early development. See [PLAN.md](PLAN.md) and [PROGRESS.md](PROGRESS.md).
