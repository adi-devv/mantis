# Launch and growth plan

How Mantis goes from a repo to the default way agents browse.

Developer tools don't spread through ads. They spread through **one claim people can check**, an **install that takes one line**, and posts in the places where agent builders already are.

---

## 1. The claim

Launch on numbers from the unbiased eval: real sites, the frozen v0.1.1, and each agent's native browser tool as a baseline. The current long-task fixture results only tell us what to expect.

- **What to expect:** on long multi-step tasks, the accessibility tree uses about 1.6–1.9× Mantis's tokens. Screenshots use about the same as the tree and fail more often. On short lookups, Mantis is roughly even with the tree.
- **Headline shape:** *"Same success rate, about N× fewer tokens on long browser tasks. Tested on real sites against Playwright MCP and the agent's own browser."*
- **Lead with long tasks.** Don't headline the replay numbers (Wikipedia 639 vs 152,754 tokens): Mantis's number is a trimmed view, not the whole article.
- **Publish the failures and the method** in the same place as the claim.

## 2. Gate: don't launch until all of these are done

- [ ] Mantis is frozen at v0.1.1 (git tag) and the unbiased eval has run on it (see [PROGRESS.md](PROGRESS.md), next steps).
- [ ] A 30-second side-by-side video: the same task with the agent's own browser vs with Mantis, with a live token counter. Also export a GIF for the README.
- [ ] The README opens with: the GIF, the claim, the install line, then a 3-line example.
- [ ] Install is still one line: `claude mcp add mantis -- npx -y -p mantis-browser mantis-mcp`
- [ ] npm 0.1.1 is published with a matching GitHub release.
- [ ] A landing page on the Perzian domain ("Mantis, by Perzian").

## 3. Launch week

| Day | Where | What |
|---|---|---|
| Before launch | MCP directories: the official MCP registry, Smithery, mcp.so, Glama, and a PR to `awesome-mcp-servers` | Listings get found by search for months, so do them first |
| Launch (Tue–Thu, 8–10am US Eastern) | **Show HN** | The biggest lever. Post the first comment yourself (draft below). Answer every comment all day. |
| Launch | **X** | A thread with the video. Tag people who build agents or MCP tools. |
| Launch +1 | **Reddit**: r/ClaudeAI, r/mcp, r/LocalLLaMA (lead with cheap and open models there), r/ChatGPTCoding | Write it as "I built" with the numbers, not as an ad. |
| Launch +2 | **LinkedIn** | Your story and what you learned. Good for your profile, less so for users. |
| Launch +7 to +14 | **Product Hunt** | A bonus. Developers rarely find tools there, but the badge helps the landing page. |

## 4. Drafts

Fill in the numbers from the unbiased eval before posting.

**Show HN title:** `Show HN: Mantis – AI agents browse the web as numbered text, not screenshots`

**HN first comment:**
> I built Mantis because browser agents waste most of their tokens re-reading pages. Screenshots cost ~1,400 tokens per look, and accessibility-tree dumps send the whole page every step.
> Mantis is an MCP server that turns a page into short numbered text ("#12 button Checkout"). The agent acts by number, and each action returns only what changed. There's no LLM inside, so the same page gives the same text.
> On N real-site tasks, it had the same success rate as Playwright MCP with N× fewer tokens on long tasks. On short lookups it's about even. Method, raw results and failures: <link>.
> Known gaps: <list>. Install: `claude mcp add mantis -- npx -y -p mantis-browser mantis-mcp`

**X thread (5 posts):**
1. The video plus one line: "Same task. N× fewer tokens."
2. The problem: screenshots and tree dumps re-read the whole page every step.
3. What the agent sees: a 6-line example of Mantis output.
4. The numbers table, with a link to the method and the failures.
5. Install line and repo link.

**LinkedIn:**
> I spent the last weeks on one question: why are AI browser agents so expensive?
> Every step, they re-read the whole page as a screenshot or a full page dump. So I built Mantis: it shows the agent what a person would notice, as short numbered text.
> Tested on N real-site tasks against Playwright MCP and the agent's own browser: same success rate, N× fewer tokens on long tasks.
> Three things I learned: <1 line each>. Open source: <link>

## 5. After launch: becoming the default

Mass use means agents browse through Mantis by default, not stars on the repo.

- **Ship where agents are installed.** A Claude Code plugin, Codex setup docs, and integration PRs and guides for Cursor, Cline, LangChain, the OpenAI Agents SDK and browser-agent frameworks. One merged integration is worth more than one viral post.
- **Pitch scale.** For teams running thousands of agent sessions, tokens are money. A short "cost per 1,000 tasks" page turns the benchmark into a reason to buy in.
- **One deep post:** "Why AI agents shouldn't take screenshots", with the benchmark. Evergreen, and it ranks in search.
- **Keep the benchmark public and re-runnable.** Invite people to send tasks where Mantis loses, and fix them in public.
- **Answer every issue within a day for the first month.** Early users become your promoters.
- **Ship small releases often** (0.1.x → 0.2), each with a short changelog post.

## 6. What to measure

- Weekly npm downloads and GitHub stars; stars are the weaker signal.
- Repeat use: downloads that keep coming week after week.
- Integrations merged into other tools.
- Issues opened by people outside the project, a sign of real use.

## The one thing that matters most

Someone can install it in one line and see the difference in one minute. Everything else multiplies that moment.
