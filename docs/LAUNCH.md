# Launch & distribution plan

How Mantis goes from "a repo on GitHub" to "the default way agents browse".

Developer tools don't spread through ads. They spread through **one surprising, provable claim**
plus **zero-friction install**, shown in the places AI developers already are.

---

## 1. Before launch (about one week)

- [x] **Fix the remaining benchmark failures.** Done in M7: the replay benchmark is 14/14 for
      Mantis, Playwright MCP and screenshots (`bench/results/latest.md`).
- [ ] **30-second side-by-side demo video.** Same task, "agent with screenshots" vs "agent with Mantis",
      with a token counter on screen. This video is the whole pitch. Also export a GIF for the README.
- [ ] **Real-agent eval (the gate for launch).** First run done (Claude Sonnet, 22 tasks x 5 tools,
      all correct; Mantis 1.07M tokens vs 3.02M for screenshots; `bench/results/agent.md`), but it
      was one run per task and graded on the final reply only. Still to do: fresh runs with the
      stricter page-state grading, 3 runs per task, Codex and Claude. Publish the failures too.
- [ ] **One headline number** that comes from that eval, e.g. *"Same task success rate, N× fewer tokens"*.
      Careful with replay numbers: Wikipedia is 639 vs 152,754 tokens, but Mantis's 639 is a *trimmed*
      view (lead + headings + controls) while Playwright MCP sends the whole article. It's fair to say
      "orients on the page for ~640 tokens", but not "reads the whole article for ~640 tokens".
      Honest framing from the first run: about 2.8x fewer tokens than screenshots overall, growing
      with task length (15x on a 41-step screenshot booking task). Lead with long tasks.
- [ ] **One-line install stays one line:**
      `claude mcp add mantis -- npx -y -p mantis-browser mantis-mcp`
- [ ] **README top section**: GIF → the claim → install line → 3-line example. Everything else below.
- [ ] **Landing page** on the Perzian domain: "Mantis, by Perzian". So later projects benefit from the brand.

## 2. Launch day: where to post (by impact)

| Where | Why / how |
|---|---|
| **Show HN (Hacker News)** | Biggest lever for dev tools. Weekday, ~8–10am US Eastern. Plain honest title, e.g. "Show HN: Mantis – browse the web as numbered text instead of screenshots". First comment: what it is, the benchmark, its known gaps. Stay and answer comments for the whole day. |
| **X / Twitter** | Where the AI-agent crowd lives. Post the video + the number. Tag people who build agents / MCP tools. |
| **Reddit**: r/ClaudeAI, r/LocalLLaMA, r/mcp | High-intent users who actually install. Post as "I built", not as an ad. |
| **MCP directories**: official MCP registry, Smithery, mcp.so, Glama, PR to `awesome-mcp-servers` | People searching for MCP tools find you for months. Low effort, long tail. Do these on day 1. |
| **LinkedIn** | Better for your story ("I built X, here's what I learned") and career than for users. |
| **Product Hunt** | A bonus, not the main launch. Developers rarely discover tools there. Do it a week or two later. |

## 3. After launch: becoming the default

"Mass use" happens when Mantis becomes **the default way agents browse**, not when it gets stars.

- **Get into agent tools**: Claude Code plugin listing, integration guides / PRs for Cursor, Cline,
  LangChain and other agent frameworks.
- **One deep blog post**: "Why AI agents shouldn't take screenshots", with the benchmark. Posts like this
  get shared for months and rank in search.
- **Keep the benchmark public and re-runnable.** Honest, reproducible numbers are what make developers
  trust it. Never fudge them; publish failures too.
- **Answer every GitHub issue fast in the first month.** Early users become your promoters.
- **Ship small releases often** (0.1.x → 0.2) and post a short changelog each time: every release is
  another reason to show up in feeds.

## The one thing that matters most

Don't launch until someone can install it in one line and see the difference in one minute.
Everything else multiplies that moment.
