/**
 * Deterministic replay benchmark: what does an agent receive per step from Mantis,
 * Playwright MCP, and a screenshot? No LLM is involved. See bench/results/latest.md.
 *
 *   npm run bench                      # all tasks, writes bench/results/latest.{json,md}
 *   BENCH_ONLY=local-login,example-read npx tsx bench/run.ts   # subset -> partial.{json,md}
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { REPO, mantisAdapter, playwrightMcpAdapter } from './adapters.js';
import type { TextAdapter } from './adapters.js';
import { chromiumExecutable } from '../src/userAgent.js';
import { startFixtures } from './fixtures.js';
import { TOOLS, toMarkdown } from './report.js';
import type { DefSize, Meta, Results, ToolName } from './report.js';
import { runScreenshotTask, runTextTask } from './runner.js';
import { tokensChars4, tokensCl100k } from './tokens.js';
import { TASKS } from './tasks.js';
import type { TaskRun } from './types.js';

const git = (args: string): string => {
  try {
    return execSync(`git ${args}`, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

const pkgVersion = (name: string): string =>
  (JSON.parse(readFileSync(path.join(REPO, 'node_modules', name, 'package.json'), 'utf8')) as { version: string }).version;

async function definitionSize(make: () => TextAdapter): Promise<DefSize> {
  const a = make();
  await a.start();
  try {
    const json = await a.toolDefinitions();
    return { tools: (JSON.parse(json) as unknown[]).length, chars: json.length, t4: tokensChars4(json), tik: tokensCl100k(json) };
  } finally {
    await a.stop();
  }
}

async function main(): Promise<void> {
  if (!existsSync(path.join(REPO, 'dist', 'server.js'))) throw new Error('dist/server.js missing: run `npm run build` first');
  const only = process.env.BENCH_ONLY?.split(',').map((s) => s.trim()).filter(Boolean);
  const tasks = only ? TASKS.filter((t) => only.includes(t.id)) : TASKS;
  if (!tasks.length) throw new Error(`no tasks match BENCH_ONLY=${process.env.BENCH_ONLY}`);

  const probe = await chromium.launch({ headless: true, ...chromiumExecutable() });
  const chromiumVersion = probe.version();
  await probe.close();

  const meta: Meta = {
    date: new Date().toISOString().slice(0, 10),
    mantisSha: git('rev-parse --short HEAD') || 'unknown',
    mantisSrcDirty: git('status --porcelain -- src').length > 0,
    playwrightMcp: pkgVersion('@playwright/mcp'),
    playwright: pkgVersion('playwright'),
    chromium: chromiumVersion,
    machine: `${os.platform()} ${os.release()}, ${os.cpus().length} logical cores, ${Math.round(os.totalmem() / 2 ** 30)} GB RAM`,
    node: process.version,
    command: only ? `BENCH_ONLY=${only.join(',')} npx tsx bench/run.ts` : 'npm run bench',
  };

  const toolDefinitions: Record<string, DefSize> = {
    mantis: await definitionSize(mantisAdapter),
    'playwright-mcp': await definitionSize(playwrightMcpAdapter),
  };

  const fixtures = await startFixtures();
  const out: Results = { meta, toolDefinitions, tasks: [] };
  try {
    for (const task of tasks) {
      const runs = {} as Record<ToolName, TaskRun>;
      for (const tool of TOOLS) {
        process.stderr.write(`[bench] ${task.id} / ${tool} ... `);
        const t0 = Date.now();
        try {
          runs[tool] =
            tool === 'mantis'
              ? await runTextTask(mantisAdapter(), task, fixtures.base)
              : tool === 'playwright-mcp'
                ? await runTextTask(playwrightMcpAdapter(), task, fixtures.base)
                : await runScreenshotTask(task, fixtures.base);
        } catch (e) {
          // A tool that cannot even run the task is a failure of every step, not a dropped row.
          const why = String(e instanceof Error ? e.message : e).split('\n')[0]!.slice(0, 140);
          runs[tool] = {
            taskId: task.id,
            tool,
            completed: false,
            steps: task.steps.map((_, i) => ({
              n: i + 1,
              label: `step ${i + 1}`,
              ok: false,
              note: `harness error: ${why}`,
              action: { chars: 0, t4: 0, tik: 0 },
              observe: { chars: 0, t4: 0, tik: 0 },
              ms: 0,
            })),
          };
        }
        const bad = runs[tool].steps.filter((s) => s.ok === false).length;
        process.stderr.write(`${((Date.now() - t0) / 1000).toFixed(1)}s${bad ? `, ${bad} failed step(s)` : ''}\n`);
      }
      out.tasks.push({ task: { id: task.id, title: task.title, site: task.site }, runs });
    }
  } finally {
    await fixtures.close();
  }

  const dir = path.join(REPO, 'bench', 'results');
  mkdirSync(dir, { recursive: true });
  const base = only ? 'partial' : 'latest';
  writeFileSync(path.join(dir, `${base}.json`), JSON.stringify(out, null, 2) + '\n');
  writeFileSync(path.join(dir, `${base}.md`), toMarkdown(out));
  process.stderr.write(`[bench] wrote bench/results/${base}.{json,md}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
