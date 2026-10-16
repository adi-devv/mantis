# Mantis

**Lets AI agents browse the web as short, numbered text instead of screenshots.**

Today, agents browse by taking screenshots (expensive, and clicks are guesses) or by reading the page's
full structure on every step (long and repetitive). Mantis shows the agent what a person would notice on
the page, in a few lines, and lets it act by number. It plugs into Claude Code, Codex, Cursor or your own agent.

## Quick start

Requires Node 20+.

```bash
npx playwright install chromium
claude mcp add mantis -- npx -y -p mantis-browser mantis-mcp
```

On native Windows: `claude mcp add mantis -- cmd /c npx -y -p mantis-browser mantis-mcp`

Try it without an agent:

```bash
npx -y -p mantis-browser mantis read https://example.com
```

## What the agent sees

A shop page with a cookie popup:

```
Page: Shop
[dialog "Accept cookies?" — covers page]
  #3 button "Accept"
  #4 button "Reject"
[main]
  # Shop
  #1 button "Add to cart" (covered)
  #2 link "More products" (covered)
```

The agent clicks `#3` and gets back only what changed:

```
clicked #3 button "Accept"
~ #1 button "Add to cart": no longer covered
~ #2 link "More products": no longer covered
- [dialog "Accept cookies?"] closed (3 items)
```

It also notices things a person sees but page structure often hides: popups covering buttons, red error
messages, the main button, icon-only buttons, and long lists (shortened, never hidden).

## What the agent can do

Open and read pages, search a page, click, type, pick options, fill a whole form at once, scroll, and go back.
For charts and images it can pull out values and text. When it hits a CAPTCHA, 2FA or payment, it hands
over to you. Mantis never solves CAPTCHAs.

## Results

On 10 real-site tasks (pilot, Codex `gpt-6-luna`, blind judge):

| | Correct | Tokens per task |
|---|---:|---:|
| **Mantis** | **7/10** | **185k** |
| Accessibility tree (Playwright MCP) | 5/10 | 311k |
| Screenshots | 6/10 | 310k |

On long multi-step tasks, the accessibility tree uses 1.6–1.9x Mantis's tokens. On short lookups the two are
about even. All numbers, method and caveats: [bench/RESULTS.md](bench/RESULTS.md).

## Learn more

- [How it works](docs/APPROACH.md)
- [Claude skill](skill/README.md): teaches Claude how to read Mantis output
- [Development, configuration and tool reference](docs/DEVELOPMENT.md)
- [Benchmarks: how to re-run them](bench/README.md)

## License

MIT
