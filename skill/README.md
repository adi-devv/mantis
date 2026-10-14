# Mantis skill for Claude Code

`SKILL.md` teaches Claude to browse with the Mantis MCP tools (numbered text, act by `#number`)
instead of screenshots, and how to use the fallback ladder (`data` -> `ocr` -> `look` -> `ask_human`).

## Install

1. Add the Mantis MCP server (use the absolute path to your checkout, after `npm run build`):

   ```bash
   claude mcp add mantis -- node /abs/path/to/mantis/dist/server.js
   ```

   Set `MANTIS_HEADLESS=0` in the server's environment to watch the browser.

2. Copy the skill into your skills folder:

   ```bash
   mkdir -p ~/.claude/skills/mantis-browser
   cp skill/SKILL.md ~/.claude/skills/mantis-browser/SKILL.md
   ```

   On Windows PowerShell:

   ```powershell
   New-Item -ItemType Directory -Force "$HOME\.claude\skills\mantis-browser"
   Copy-Item skill\SKILL.md "$HOME\.claude\skills\mantis-browser\SKILL.md"
   ```

   For a single project, use `.claude/skills/mantis-browser/` inside that project instead.

3. Restart Claude Code. The skill triggers when you ask Claude to browse or operate a website.

## Notes

- The skill only gives instructions; the browsing itself is done by the MCP server.
- If the MCP server is not connected, the skill does not apply.
- Tool names and arguments must match the server (`open`, `read`, `click`, `type`, `select`,
  `press`, `scroll`, `back`, `media`, `data`, `ocr`, `look`, `ask_human`). If you change the tools, update `SKILL.md`.
