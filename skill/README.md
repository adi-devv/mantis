# Mantis skill for Claude Code

`SKILL.md` teaches Claude to browse with the Mantis MCP tools (numbered text, act by `#number`)
instead of screenshots, and how to use the fallback tools (`data`, `ocr`, `look`, `ask_human`).
The skill only gives instructions; the MCP server does the browsing, and the skill does nothing
without it.

## Install

1. Add the Mantis MCP server: see the [quick start](../README.md#quick-start).

2. Copy the skill into your skills folder:

   ```bash
   mkdir -p ~/.claude/skills/mantis-browser
   curl -fsSL https://raw.githubusercontent.com/adi-devv/mantis/main/skill/SKILL.md \
     -o ~/.claude/skills/mantis-browser/SKILL.md
   ```

   On Windows PowerShell:

   ```powershell
   New-Item -ItemType Directory -Force "$HOME\.claude\skills\mantis-browser"
   Invoke-WebRequest https://raw.githubusercontent.com/adi-devv/mantis/main/skill/SKILL.md -OutFile "$HOME\.claude\skills\mantis-browser\SKILL.md"
   ```

   From a checkout, copy `skill/SKILL.md` there instead. For a single project, use
   `.claude/skills/mantis-browser/` inside that project.

3. Restart Claude Code. The skill triggers when you ask Claude to browse or operate a website.

If you change the server's tools (`src/server.ts`), update `SKILL.md` to match.
