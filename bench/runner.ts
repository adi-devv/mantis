import { chromium } from 'playwright';
import type { Browser } from 'playwright';
import type { TextAdapter } from './adapters.js';
import { chromiumExecutable } from '../src/userAgent.js';
import { addCost, costOf, imageTokens, pngSize, zeroCost } from './tokens.js';
import type { Cost } from './tokens.js';
import type { Elem, Reply, Step, StepResult, Target, Task, TaskRun } from './types.js';

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export const describeTarget = (t: Target): string => `${t.roles[0]} ${String(t.name)}${t.nth ? ` #${t.nth}` : ''}`;

export function describeStep(s: Step): string {
  switch (s.kind) {
    case 'open': return `open ${s.url.replace('{{base}}', '<local>')}`;
    case 'read': return `read${s.expect ? ` (expect ${s.expect})` : ''}`;
    case 'click': return `click ${describeTarget(s.target)}`;
    case 'type': return `type "${s.text}" into ${describeTarget(s.target)}${s.submit ? ' + Enter' : ''}`;
    case 'select': return `select "${s.option}" in ${describeTarget(s.target)}`;
    case 'press': return `press ${s.key}`;
    case 'back': return 'back';
  }
}

function nameMatches(name: string, want: string | RegExp): boolean {
  return typeof want === 'string' ? name.toLowerCase().includes(want.toLowerCase()) : want.test(name.trim());
}

/** Look a described target up in one tool's own output (the harness does this, not the agent). */
function find(elems: Elem[], t: Target): Elem | undefined {
  // Later duplicates of the same id (e.g. a diff repeating a line) are collapsed.
  const seen = new Set<string>();
  const hits = elems.filter((e) => {
    if (!(e.role === '' || t.roles.includes(e.role)) || !nameMatches(e.name, t.name)) return false;
    if (seen.has(e.handle)) return false;
    seen.add(e.handle);
    return true;
  });
  return hits[t.nth ?? 0];
}

const labelOf = (e: Elem): string => `${e.role} "${e.name}"`;

/** The plain text a target's name pattern stands for (`/^Item 150$/` -> "Item 150"); null if it is a real pattern. */
const literal = (re: string | RegExp): string | null => {
  if (typeof re === 'string') return re;
  const s = re.source.replace(/^\^/, '').replace(/\$$/, '');
  return /[\[\](){}.*+?|^$]/.test(s) ? null : s;
};

/**
 * Replay a task through a text tool. Per step the agent receives the action call's
 * reply; if it then needs a page view it does not have, one observe call is counted too.
 */
export async function runTextTask(adapter: TextAdapter, task: Task, base: string): Promise<TaskRun> {
  await adapter.start();
  const steps: StepResult[] = [];
  // The page view the agent currently holds. null / !fresh => needs an observe call.
  let view: string | null = null;
  let fresh = false;
  try {
    for (const [i, step] of task.steps.entries()) {
      const t0 = Date.now();
      let action = zeroCost();
      let observe = zeroCost();
      let ok = true;
      let note = '';
      const fail = (why: string): void => {
        ok = false;
        note = why;
      };
      const count = (r: Reply): void => {
        action = addCost(action, costOf(r.text));
      };
      const ensureView = async (): Promise<string | null> => {
        if (view !== null && fresh) return view;
        const r = await adapter.observe();
        observe = addCost(observe, costOf(r.text));
        if (r.isError) {
          fail(`observe failed: ${r.text.slice(0, 120)}`);
          return null;
        }
        view = r.text;
        fresh = true;
        return view;
      };
      /** Update what the agent holds after an action reply. */
      const afterAction = (r: Reply): void => {
        if (adapter.isFullView(r, 'action')) {
          view = r.text;
          fresh = true;
        } else if (adapter.deltaReplies && !r.isError && view !== null) {
          view = `${view}\n${r.text}`;
        } else {
          fresh = false;
        }
        if (r.isError) fresh = false;
      };

      if (step.kind === 'open') {
        const r = await adapter.open(step.url.replace('{{base}}', base));
        count(r);
        if (r.isError) fail(r.text.replace(/\s+/g, ' ').slice(0, 140));
        view = null;
        fresh = false;
        if (!r.isError && adapter.isFullView(r, 'open')) {
          view = r.text;
          fresh = true;
        }
      } else if (step.kind === 'read') {
        let v = await ensureView();
        if (v !== null && step.expect && !step.expect.test(v) && adapter.deltaReplies) {
          // The accumulated view may be missing something the page now shows; look again.
          fresh = false;
          v = await ensureView();
        }
        if (ok) {
          if (v !== null && step.expect && !step.expect.test(v)) fail(`expected ${step.expect} not found in what the agent receives`);
          else note = observe.chars === 0 ? 'already in hand' : '';
        }
      } else if (step.kind === 'press') {
        const r = await adapter.press(step.key);
        count(r);
        if (r.isError) fail(r.text.replace(/\s+/g, ' ').slice(0, 140));
        afterAction(r);
      } else if (step.kind === 'back') {
        const r = await adapter.back();
        count(r);
        if (r.isError) fail(r.text.replace(/\s+/g, ' ').slice(0, 140));
        afterAction(r);
      } else {
        let v = await ensureView();
        let el = v === null ? undefined : find(adapter.parse(v), step.target);
        if (v !== null && !el && observe.chars === 0) {
          // Not in the view the agent holds (which may be out of date): look once more.
          fresh = false;
          v = await ensureView();
          el = v === null ? undefined : find(adapter.parse(v), step.target);
        }
        const wanted = literal(step.target.name);
        if (v !== null && !el && adapter.search && wanted) {
          // The view says part of the page was trimmed; the agent searches for what it is after.
          const r = await adapter.search(wanted);
          observe = addCost(observe, costOf(r.text));
          if (!r.isError) el = find(adapter.parse(r.text), step.target);
          if (el) note = `found with find("${wanted}")`;
        }
        if (v !== null && !el) {
          fail(`target ${describeTarget(step.target)} not in what the agent receives`);
        } else if (el) {
          const label = labelOf(el);
          const r =
            step.kind === 'click'
              ? await adapter.click(el, label)
              : step.kind === 'type'
                ? await adapter.type(el, label, step.text, step.submit ?? false)
                : await adapter.select(el, label, step.option);
          count(r);
          if (r.isError) fail(r.text.replace(/\s+/g, ' ').slice(0, 140));
          afterAction(r);
          // Filling a field or choosing an option does not change what else is on the page.
          if (!r.isError && ((step.kind === 'type' && !step.submit) || step.kind === 'select')) fresh = v !== null;
        }
      }
      if (!ok) fresh = false;
      steps.push({ n: i + 1, label: describeStep(step), ok, note, action, observe, ms: Date.now() - t0 });
    }
  } finally {
    await adapter.stop();
  }
  return { taskId: task.id, tool: adapter.tool, steps, completed: steps.every((s) => s.ok !== false) };
}

/**
 * Screenshot baseline. The actions are performed by the harness with role+name
 * locators (an oracle: this does not test whether an agent could find the target
 * from pixels). After every open/action step the agent is assumed to receive one
 * 1280x800 viewport screenshot; `read` steps cost nothing extra (the previous
 * screenshot already shows the page).
 */
export async function runScreenshotTask(task: Task, base: string): Promise<TaskRun> {
  const browser: Browser = await chromium.launch({ headless: true, ...chromiumExecutable() });
  const steps: StepResult[] = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const shot = async (): Promise<Cost> => {
      const png = await page.screenshot({ type: 'png' });
      const { width, height } = pngSize(png);
      const t = imageTokens(width, height);
      return { chars: 0, t4: t, tik: t };
    };
    const settle = async (): Promise<void> => {
      await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => undefined);
      await sleep(1000);
    };
    for (const [i, step] of task.steps.entries()) {
      const t0 = Date.now();
      let observe = zeroCost();
      let ok: boolean | null = true;
      let note = '';
      try {
        if (step.kind === 'open') {
          await page.goto(step.url.replace('{{base}}', base), { waitUntil: 'domcontentloaded', timeout: 30_000 });
          await settle();
          observe = await shot();
        } else if (step.kind === 'read') {
          ok = null;
          note = 'content check not applicable to an image; no extra screenshot';
        } else {
          if (step.kind === 'press') {
            await page.keyboard.press(step.key);
          } else if (step.kind === 'back') {
            await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15_000 });
          } else {
            let loc = null;
            for (const role of step.target.roles) {
              const l = page.getByRole(role as Parameters<typeof page.getByRole>[0], { name: step.target.name });
              if ((await l.count()) > 0) {
                loc = l.nth(step.target.nth ?? 0);
                break;
              }
            }
            if (!loc) throw new Error(`target ${describeTarget(step.target)} not found by the oracle`);
            if (step.kind === 'click') await loc.click({ timeout: 5000 });
            else if (step.kind === 'type') {
              await loc.fill(step.text, { timeout: 5000 });
              if (step.submit) await loc.press('Enter', { timeout: 5000, noWaitAfter: true });
            } else await loc.selectOption({ label: step.option }, { timeout: 5000 });
          }
          await settle();
          observe = await shot();
        }
      } catch (e) {
        ok = false;
        note = String(e instanceof Error ? e.message : e).split('\n')[0]!.slice(0, 140);
      }
      steps.push({ n: i + 1, label: describeStep(step), ok, note, action: zeroCost(), observe, ms: Date.now() - t0 });
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
  return { taskId: task.id, tool: 'screenshot', steps, completed: steps.every((s) => s.ok !== false) };
}
