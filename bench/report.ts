import type { Task, TaskRun } from './types.js';

export const TOOLS = ['mantis', 'playwright-mcp', 'screenshot'] as const;
export type ToolName = (typeof TOOLS)[number];

export interface Meta {
  date: string;
  mantisSha: string;
  mantisSrcDirty: boolean;
  playwrightMcp: string;
  playwright: string;
  chromium: string;
  machine: string;
  node: string;
  command: string;
}

export interface DefSize {
  tools: number;
  chars: number;
  t4: number;
  tik: number;
}

export interface Results {
  meta: Meta;
  toolDefinitions: Record<string, DefSize>;
  tasks: Array<{ task: Pick<Task, 'id' | 'title' | 'site'>; runs: Record<ToolName, TaskRun> }>;
}

const sumKey = (run: TaskRun, k: 't4' | 'tik' | 'chars'): number => run.steps.reduce((a, s) => a + s.action[k] + s.observe[k], 0);
const stepCost = (s: TaskRun['steps'][number], k: 't4' | 'tik'): number => s.action[k] + s.observe[k];
const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const a = [...xs].sort((x, y) => x - y);
  const m = a.length >> 1;
  return a.length % 2 ? a[m]! : Math.round((a[m - 1]! + a[m]!) / 2);
};
const fmt = (n: number): string => n.toLocaleString('en-US');

export interface ToolSummary {
  t4: number;
  tik: number;
  steps: number;
  stepsOk: number;
  stepsFailed: number;
  stepsNa: number;
  medianStepT4: number;
  tasksCompleted: number;
  tasks: number;
}

export function summarize(r: Results, tool: ToolName, only?: (id: string) => boolean): ToolSummary {
  const runs = r.tasks.filter((t) => !only || only(t.task.id)).map((t) => t.runs[tool]);
  const all = runs.flatMap((x) => x.steps);
  return {
    t4: runs.reduce((a, x) => a + sumKey(x, 't4'), 0),
    tik: runs.reduce((a, x) => a + sumKey(x, 'tik'), 0),
    steps: all.length,
    stepsOk: all.filter((s) => s.ok === true).length,
    stepsFailed: all.filter((s) => s.ok === false).length,
    stepsNa: all.filter((s) => s.ok === null).length,
    medianStepT4: median(all.map((s) => stepCost(s, 't4'))),
    tasksCompleted: runs.filter((x) => x.completed).length,
    tasks: runs.length,
  };
}

export function summarizeAll(r: Results): { all: Record<ToolName, ToolSummary>; common: Record<ToolName, ToolSummary>; commonIds: string[] } {
  const commonIds = r.tasks.filter((t) => TOOLS.every((k) => t.runs[k].completed)).map((t) => t.task.id);
  const sel = (id: string): boolean => commonIds.includes(id);
  const all = {} as Record<ToolName, ToolSummary>;
  const common = {} as Record<ToolName, ToolSummary>;
  for (const k of TOOLS) {
    all[k] = summarize(r, k);
    common[k] = summarize(r, k, sel);
  }
  return { all, common, commonIds };
}

const cell = (run: TaskRun): string => {
  const bad = run.steps.filter((s) => s.ok === false).length;
  return `${fmt(sumKey(run, 't4'))}${bad ? ` ⚠ ${bad} failed` : ''}`;
};

export function toMarkdown(r: Results): string {
  const { all, common, commonIds } = summarizeAll(r);
  const m = r.meta;
  const L: string[] = [];
  L.push('# Mantis token-cost benchmark');
  L.push('');
  L.push('> **What this is:** a deterministic replay. Each task is a fixed script of steps, replayed through each tool; we measure the *size of what the agent would receive* (text returned by the tool, or an estimated image cost for the screenshot baseline). **No LLM is involved and no agent success rate is measured.** "ok" below means the harness could find the target in that tool\'s output and the action did not error; it does not mean an agent would have succeeded.');
  L.push('');
  L.push('## Setup');
  L.push('');
  L.push(`- Date: ${m.date}`);
  L.push(`- Mantis: git \`${m.mantisSha}\`${m.mantisSrcDirty ? ' (**src/ had uncommitted changes**)' : ''}; numbers reflect Mantis at this commit and will change as it changes`);
  L.push(`- Playwright MCP: \`@playwright/mcp@${m.playwrightMcp}\` (default config, headless, isolated profile, viewport 1280x800)`);
  L.push(`- Playwright (screenshot baseline + Mantis): \`${m.playwright}\`; Chromium ${m.chromium}; viewport 1280x800 for all three`);
  L.push(`- Machine: ${m.machine}; Node ${m.node}`);
  L.push(`- Reproduce: \`${m.command}\``);
  L.push('');
  L.push('## How the cost per step is counted');
  L.push('');
  L.push('- **Mantis / Playwright MCP:** every call is made over MCP stdio, as an agent would. Per step we sum (a) the text returned by the action call and (b) one *observe* call (Mantis `read`, Playwright MCP `browser_snapshot`) if the agent needs a page view it does not already hold. The harness (not the measured agent) looks targets up in each tool\'s own output: Mantis `#N`, Playwright MCP `[ref=eN]`.');
  L.push('- A page view is "held" if the last reply contained it (Mantis `open`, or an action that lands on a new page), or if the previous reply was a change summary (Mantis diffs: ids stay stable, new ids appear in the diff). After a click / Enter / back the view is considered stale unless the reply carried it. Typing into a field or choosing an option does not make the view stale.');
  L.push('- In `@playwright/mcp` 0.0.83 default mode, action replies contain only a short log plus a *link to a snapshot file*, not the page. We therefore count `browser_snapshot` (inline) whenever the agent needs to see the page. The file would hold the same content.');
  L.push('- **Screenshot baseline:** one 1280x800 viewport PNG per open/action step (`read` steps add none). Actions are performed by the harness with role+name locators (an oracle), so this baseline does not test whether an agent could find targets from pixels, and it ignores scrolling for below-the-fold content: **it under-counts a real screenshot agent**. Tokens = `ceil(w*h/750)` after downscaling to <=1568 px longest side and <=~1.15 MP (Anthropic\'s published image-token formula; an estimate). For 1280x800 that is 1,366 tokens per screenshot.');
  L.push('- **Text tokens:** primary estimator is `chars/4` (rounded up), used for every text tool. Secondary: OpenAI `cl100k_base` via js-tiktoken. Both are approximations; Claude\'s tokenizer differs. The image estimate is the same in both columns.');
  L.push('- Steps run to the end even after a failure (failed steps are shown, never dropped). One run per task; live sites change over time, so live-site numbers are a snapshot.');
  L.push('');
  L.push('## Summary (all tasks)');
  L.push('');
  const row = (label: string, f: (s: ToolSummary) => string): string => `| ${label} | ${TOOLS.map((k) => f(all[k])).join(' | ')} |`;
  L.push('| | Mantis | Playwright MCP | Screenshot (est.) |');
  L.push('|---|---:|---:|---:|');
  L.push(row('Total tokens (chars/4)', (s) => fmt(s.t4)));
  L.push(row('Total tokens (cl100k)', (s) => fmt(s.tik)));
  L.push(row('Median tokens per step (chars/4)', (s) => fmt(s.medianStepT4)));
  L.push(row('Steps ok / total', (s) => `${s.stepsOk} / ${s.steps - s.stepsNa}${s.stepsNa ? ` (+${s.stepsNa} n/a)` : ''}`));
  L.push(row('Tasks fully completed', (s) => `${s.tasksCompleted} / ${s.tasks}`));
  L.push('');
  L.push('Totals include tokens spent on failed steps, and exclude tokens a tool would have cost had a failed step succeeded, so a tool that fails early can look cheaper than it is. For a like-for-like view see the next table.');
  L.push('');
  L.push(`## Summary (only tasks where all three tools completed every step: ${commonIds.length} of ${r.tasks.length})`);
  L.push('');
  if (commonIds.length) {
    L.push('| | Mantis | Playwright MCP | Screenshot (est.) |');
    L.push('|---|---:|---:|---:|');
    L.push(`| Total tokens (chars/4) | ${TOOLS.map((k) => fmt(common[k].t4)).join(' | ')} |`);
    L.push(`| Total tokens (cl100k) | ${TOOLS.map((k) => fmt(common[k].tik)).join(' | ')} |`);
    L.push(`| Median tokens per step (chars/4) | ${TOOLS.map((k) => fmt(common[k].medianStepT4)).join(' | ')} |`);
    L.push('');
    L.push(`Tasks: ${commonIds.join(', ')}`);
  } else {
    L.push('No task was completed by all three tools.');
  }
  L.push('');
  L.push('## Fixed per-session cost: tool definitions');
  L.push('');
  L.push('The tool list an agent carries in context for the whole session (not included in the per-step numbers above).');
  L.push('');
  L.push('| Tool | # tools | chars | tokens (chars/4) | tokens (cl100k) |');
  L.push('|---|---:|---:|---:|---:|');
  for (const [k, d] of Object.entries(r.toolDefinitions)) L.push(`| ${k} | ${d.tools} | ${fmt(d.chars)} | ${fmt(d.t4)} | ${fmt(d.tik)} |`);
  L.push('');
  L.push('## Per task (tokens, chars/4)');
  L.push('');
  L.push('| Task | Steps | Mantis | Playwright MCP | Screenshot (est.) |');
  L.push('|---|---:|---:|---:|---:|');
  for (const t of r.tasks) {
    L.push(`| \`${t.task.id}\` (${t.task.site}) | ${t.runs.mantis.steps.length} | ${TOOLS.map((k) => cell(t.runs[k])).join(' | ')} |`);
  }
  L.push('');
  const failures = r.tasks.flatMap((t) => TOOLS.flatMap((k) => t.runs[k].steps.filter((s) => s.ok === false).map((s) => ({ t: t.task.id, k, s }))));
  L.push('## Failures');
  L.push('');
  if (!failures.length) L.push('None.');
  else {
    L.push('| Task | Tool | Step | Reason |');
    L.push('|---|---|---|---|');
    for (const f of failures) L.push(`| \`${f.t}\` | ${f.k} | ${f.s.n}. ${f.s.label.replace(/\|/g, '\\|')} | ${f.s.note.replace(/\|/g, '\\|')} |`);
  }
  L.push('');
  L.push('## Per-step detail');
  L.push('');
  L.push('Cells are `action + observe` tokens (chars/4); `FAIL` marks a failed step; `n/a` is a step with no applicable check.');
  for (const t of r.tasks) {
    L.push('');
    L.push(`### \`${t.task.id}\` — ${t.task.title}`);
    L.push('');
    L.push('| # | Step | Mantis | Playwright MCP | Screenshot (est.) |');
    L.push('|---:|---|---:|---:|---:|');
    const n = t.runs.mantis.steps.length;
    for (let i = 0; i < n; i++) {
      const cells = TOOLS.map((k) => {
        const s = t.runs[k].steps[i]!;
        const body = `${fmt(s.action.t4)} + ${fmt(s.observe.t4)}`;
        return s.ok === false ? `FAIL (${body})` : s.ok === null ? `n/a (${body})` : body;
      });
      L.push(`| ${i + 1} | ${t.runs.mantis.steps[i]!.label.replace(/\|/g, '\\|')} | ${cells.join(' | ')} |`);
    }
  }
  L.push('');
  L.push('## Caveats');
  L.push('');
  L.push('- Token-size of tool output only. Smaller output is cheaper, not necessarily better: a tool can fail a task by omitting what is needed (see Failures), and this benchmark does not measure whether an LLM would succeed with any of these outputs.');
  L.push('- Mantis numbers are for the commit above. Mantis output and defaults change between commits; re-run `npm run bench` to refresh.');
  L.push('- The screenshot figure is a lower bound on a real screenshot-driven agent and relies on a published estimate formula, not a measured bill.');
  L.push('- Live sites (example.com, Hacker News, Wikipedia, GitHub, MDN) change content and layout over time and may serve different variants by region, language or bot detection; one run each.');
  L.push('- The harness picks the first element whose role and name match; a different (or smarter) agent might pick differently.');
  L.push('');
  return L.join('\n');
}
