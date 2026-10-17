// Real-site tasks are graded by a blind LLM judge, not by a regex or page-state check, so per AGENTS.md they
// do not need grader cases in test/fixture-verification.test.ts. This file covers the pieces around the judge:
// the seeded stratified sampler, the task loader, the reply sanitiser, FINAL_URL parsing, and the judge's
// log/verdict parsing and report (the `claude -p` call itself needs real results and is not run here).
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateChecks, loadRealsiteRows, loadRealsiteTasks, mulberry32, parseFinalUrl, realsitePrompt, sampleRealsite, sanitizeAnswer } from '../bench/agent/realsite.js';
import type { RealsiteRow } from '../bench/agent/realsite.js';
import { buildJudgePrompt, parseJudgeOutput, readFinalTexts, renderJudgedMarkdown, runKey } from '../bench/agent/judge.js';
import type { JudgedRun } from '../bench/agent/judge.js';

const FIXTURE = path.join(import.meta.dirname, 'fixtures', 'realsite');

const makeRows = (counts: Record<string, number>): RealsiteRow[] =>
  Object.entries(counts).flatMap(([level, n]) =>
    Array.from({ length: n }, (_, i) => ({ task_id: `${level}-${i}`, website: `https://${level}${i}.example.com/`, task: `Do ${level} thing ${i}`, level })));
const ids = (rows: RealsiteRow[]): string[] => rows.map((r) => r.task_id);
const countLevels = (rows: RealsiteRow[]): Record<string, number> =>
  rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.level]: (acc[r.level] ?? 0) + 1 }), {});

describe('mulberry32', () => {
  it('is deterministic and stays in [0, 1)', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    const seq = Array.from({ length: 50 }, () => a());
    expect(seq).toEqual(Array.from({ length: 50 }, () => b()));
    expect(seq.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(mulberry32(8)()).not.toBe(mulberry32(7)());
  });
});

describe('sampleRealsite', () => {
  const rows = makeRows({ easy: 20, medium: 30, hard: 50 });

  it('is deterministic for the same seed and independent of input order', () => {
    expect(ids(sampleRealsite(rows, 10, 1))).toEqual(ids(sampleRealsite(rows, 10, 1)));
    expect(ids(sampleRealsite([...rows].reverse(), 10, 1))).toEqual(ids(sampleRealsite(rows, 10, 1)));
  });

  it('changes with the seed', () => {
    expect(ids(sampleRealsite(rows, 10, 1))).not.toEqual(ids(sampleRealsite(rows, 10, 2)));
  });

  it('respects N with no duplicates and keeps level proportions', () => {
    const picked = sampleRealsite(rows, 10, 1);
    expect(picked).toHaveLength(10);
    expect(new Set(ids(picked)).size).toBe(10);
    expect(countLevels(picked)).toEqual({ easy: 2, medium: 3, hard: 5 });
    expect(countLevels(sampleRealsite(rows, 20, 3))).toEqual({ easy: 4, medium: 6, hard: 10 });
  });

  it('distributes remainders so the total is exactly N', () => {
    const odd = makeRows({ easy: 3, medium: 3, hard: 3 });
    for (let n = 1; n <= 9; n++) expect(sampleRealsite(odd, n, 5)).toHaveLength(n);
    expect(sampleRealsite(makeRows({ easy: 1, medium: 1, hard: 98 }), 7, 1)).toHaveLength(7);
  });

  it('returns every row when N exceeds the pool, and nothing for N = 0', () => {
    expect(sampleRealsite(rows, 1000, 1)).toHaveLength(100);
    expect(sampleRealsite(rows, 0, 1)).toEqual([]);
    expect(sampleRealsite([], 5, 1)).toEqual([]);
  });

  it('prefix of a larger N is not required, but each N is a subset of rows', () => {
    const all = new Set(ids(rows));
    expect(ids(sampleRealsite(rows, 15, 4)).every((id) => all.has(id))).toBe(true);
  });
});

describe('loadRealsiteTasks', () => {
  it('returns no tasks when the JSON file is missing', () => {
    expect(loadRealsiteTasks({}, path.join(tmpdir(), 'definitely-missing-realsite-tasks.json'))).toEqual([]);
  });

  it('turns rows into judged live realsite tasks and honours AGENT_REALSITE_N / _SEED', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'realsite-test-'));
    const file = path.join(dir, 'tasks.json');
    writeFileSync(file, JSON.stringify([...makeRows({ easy: 4, medium: 4, hard: 4 }), { task_id: 'bad' }]));
    const mind2web = path.join(dir, 'm2w.json');
    writeFileSync(mind2web, JSON.stringify([{ task_id: 'm1', website: 'https://w.test/', confirmed_task: 'Find the thing', reference_length: 5, level: 'easy' }]));
    expect(loadRealsiteTasks({}, mind2web)[0]!.prompt('')).toContain('Start at https://w.test/. Find the thing Do not log in');
    const tasks = loadRealsiteTasks({ AGENT_REALSITE_N: '6', AGENT_REALSITE_SEED: '3' }, file);
    expect(tasks).toHaveLength(6);
    const [task] = tasks;
    expect(task).toMatchObject({ category: 'realsite', site: 'live', judged: true });
    expect(task!.expect.test('done\nFINAL_URL: https://x.test/')).toBe(true);
    expect(task!.expect.test('done, no url')).toBe(false);
    const row = makeRows({ easy: 4, medium: 4, hard: 4 }).find((r) => r.task_id === task!.id)!;
    expect(task!.prompt('http://unused')).toBe(realsitePrompt(row));
    expect(task!.prompt('')).toContain(`Start at ${row.website}. ${row.task} Do not log in, buy anything, or enter personal information; stop before that step.`);
    expect(task!.prompt('')).toContain('Finish with the page showing the evidence for your answer, including relevant inputs and site-generated results.');
    expect(task!.prompt('')).toContain('Leave any required sign-in, purchase, or personal-information prompt open.');
    expect(task!.prompt('')).toContain('State what is currently visible and distinguish it from earlier observations or your own calculations.');
    expect(task!.prompt('')).toContain('Do not substitute your own estimate for a requested site result.');
    expect(task!.prompt('').indexOf('Finish with the page')).toBeLessThan(task!.prompt('').indexOf('FINAL_URL'));
    expect(task!.prompt('')).toContain('a last line "FINAL_URL: <url of the page you ended on>".');
    expect(tasks.map((t) => t.id)).toEqual(loadRealsiteTasks({ AGENT_REALSITE_N: '6', AGENT_REALSITE_SEED: '3' }, file).map((t) => t.id));
    expect(loadRealsiteTasks({}, file)).toHaveLength(10);
    expect(() => loadRealsiteTasks({ AGENT_REALSITE_N: '0' }, file)).toThrow(/AGENT_REALSITE_N/);
  });
});

describe('parseFinalUrl', () => {
  it('reads the last FINAL_URL line', () => {
    expect(parseFinalUrl('done\nFINAL_URL: https://a.test/x?y=1')).toBe('https://a.test/x?y=1');
    expect(parseFinalUrl('FINAL_URL: https://old.test\nmore\nFINAL_URL: https://new.test/p')).toBe('https://new.test/p');
  });
  it('tolerates markdown, backticks, angle brackets and trailing punctuation', () => {
    expect(parseFinalUrl('FINAL_URL: <https://a.test/p>.')).toBe('https://a.test/p');
    expect(parseFinalUrl('FINAL_URL: `https://a.test/p`')).toBe('https://a.test/p');
    expect(parseFinalUrl('**FINAL_URL:** [page](https://a.test/p)')).toBe('https://a.test/p');
    expect(parseFinalUrl('final_url: https://a.test/p,')).toBe('https://a.test/p');
  });
  it('returns null when there is no URL', () => {
    expect(parseFinalUrl('no marker https://a.test')).toBeNull();
    expect(parseFinalUrl('FINAL_URL: unknown')).toBeNull();
    expect(parseFinalUrl('')).toBeNull();
  });
});

describe('sanitizeAnswer', () => {
  it('drops lines that reveal the tool and the FINAL_URL line', () => {
    const text = [
      'The cheapest item is $12.99.',
      'I used the Mantis open tool.',
      'Called mcp__playwright__browser_snapshot.',
      'The snapshot showed a list.',
      'Clicked e42 to continue.',
      'Pressed [ref=e7] next.',
      'Clicked #12 then.',
      'Clicked at x=412, y=300 on the button.',
      'Then tapped (640, 120) to submit.',
      'I took a screenshot of the page.',
      'It is the Blue Mug.',
      'FINAL_URL: https://example.com/mugs',
    ].join('\n');
    expect(sanitizeAnswer(text)).toBe('The cheapest item is $12.99.\nIt is the Blue Mug.');
  });
  it('keeps ordinary content such as prices, ranks written as words, and HTML entities', () => {
    const text = 'Rated 4.5 stars by 1,200 users for $19.99 (see e-mail help). Entity &#39; stays.';
    expect(sanitizeAnswer(text)).toBe(text);
  });
  it('keeps numbers that are not coordinates', () => {
    const text = 'Open 9am-5pm, prices 10, 20, 30 dollars; room 12, floor 3.';
    expect(sanitizeAnswer(text)).toBe(text);
  });
  it('collapses the blank space left behind', () => {
    expect(sanitizeAnswer('A\n\nplaywright line\n\n\nB')).toBe('A\n\nB');
  });
});

describe('judge helpers', () => {
  it('readFinalTexts takes the last agent message of the latest attempt per run', () => {
    const texts = readFinalTexts(path.join(FIXTURE, 'logs'), 'codex');
    expect(texts.get(runKey('rs-1', 'mantis', 1))).toContain('Blue Mug');
    expect(texts.get(runKey('rs-1', 'mantis', 1))).not.toContain('first attempt');
    expect(texts.get(runKey('rs-1', 'tree', 1))).toBe('working...');
    expect(readFinalTexts(path.join(FIXTURE, 'no-such-logs'), 'codex').size).toBe(0);
  });

  it('turns a fixture log into a clean, blind judge prompt', () => {
    const text = readFinalTexts(path.join(FIXTURE, 'logs'), 'codex').get(runKey('rs-1', 'mantis', 1))!;
    const prompt = buildJudgePrompt({ task: 'Find the cheapest mug', website: 'https://example.com', finalUrl: parseFinalUrl(text), answer: sanitizeAnswer(text), screenshotPath: null });
    expect(prompt).toContain('Final URL the agent reported: https://example.com/mugs?sort=price');
    expect(prompt).toContain('The cheapest listed item is $12.99.');
    expect(prompt).not.toMatch(/mantis|e42|mcp/i);
    expect(prompt).toContain('No screenshot is available');
    expect(prompt).toContain('If the reply says a required login, purchase, or personal-information prompt stopped it but no such prompt is visible on a live capture, mark "unsure" unless other evidence shows failure.');
    expect(prompt).toContain('If the task asks for a result the site computes and the agent gives its own estimate or calculation instead, mark "failure".');
    expect(buildJudgePrompt({ task: 't', website: 'w', finalUrl: null, answer: 'a', screenshotPath: '/tmp/x/final.png' })).toContain('/tmp/x/final.png');
  });

  it('parses judge output from the CLI envelope, fences and prose', () => {
    const verdict = '{"verdict":"success","reason":"Matches the page."}';
    expect(parseJudgeOutput(JSON.stringify({ type: 'result', is_error: false, result: verdict }))).toEqual({ verdict: 'success', reason: 'Matches the page.' });
    expect(parseJudgeOutput(JSON.stringify({ result: '```json\n{"verdict":"failure","reason":"Wrong item."}\n```' }))).toEqual({ verdict: 'failure', reason: 'Wrong item.' });
    expect(parseJudgeOutput(`Here: ${verdict}`)).toEqual({ verdict: 'success', reason: 'Matches the page.' });
    expect(parseJudgeOutput(verdict).verdict).toBe('success');
  });

  it('maps bad judge output to unsure', () => {
    expect(parseJudgeOutput(JSON.stringify({ result: 'I think it worked.' })).verdict).toBe('unsure');
    expect(parseJudgeOutput(JSON.stringify({ result: '{"verdict":"maybe","reason":"x"}' })).verdict).toBe('unsure');
    expect(parseJudgeOutput(JSON.stringify({ is_error: true, result: 'rate limited' }))).toMatchObject({ verdict: 'unsure' });
    expect(parseJudgeOutput('not json at all').verdict).toBe('unsure');
  });

  it('renders per-approach and per-task tables', () => {
    const run = (task: string, approach: string, verdict: JudgedRun['verdict'], calls: number, tokens: number | null, wallS: number): JudgedRun =>
      ({ task, approach, run: 1, verdict, reason: 'r', finalUrl: null, toolCalls: calls, totalInputTokens: tokens, wallS });
    const rows = new Map(makeRows({ easy: 2 }).map((r) => [r.task_id, r]));
    const md = renderJudgedMarkdown('demo', [
      run('easy-0', 'mantis', 'success', 4, 1000, 10), run('easy-1', 'mantis', 'failure', 6, null, 20),
      run('easy-0', 'tree', 'success', 10, 5000, 30), run('easy-1', 'tree', 'unsure', 12, 7000, 50),
    ], rows, 'claude-sonnet-5-5');
    expect(md).toContain('| mantis | 2 | 1 | 1 | 0 | 0 | 50.0% | 50.0% | 5.0 | 1,000 | 15.0 |');
    expect(md).toContain('| tree | 2 | 1 | 0 | 1 | 0 | 50.0% | 50.0% | 11.0 | 6,000 | 40.0 |');
    expect(md).toContain('| Task | mantis | tree |');
    expect(md).toMatch(/easy-0.*\| success \| success \|/);
    expect(md).toMatch(/easy-1.*\| failure \| unsure \|/);
  });
});

describe('answer-key checks', () => {
  const file = (rows: object[]): string => {
    const dir = mkdtempSync(path.join(tmpdir(), 'realsite-checks-'));
    const f = path.join(dir, 'tasks.json');
    writeFileSync(f, JSON.stringify(rows));
    return f;
  };
  const base = { task_id: 'a', website: 'https://example.com/', confirmed_task: 'Find it', level: 'easy' };

  it('keeps well-formed checks and ignores malformed ones', () => {
    const rows = loadRealsiteRows(file([
      { ...base, checks: { answerIncludes: [' 30,887 '], evidenceIncludes: ['Total'] } },
      { ...base, task_id: 'b', checks: { answerIncludes: [], evidenceIncludes: 'Total' } },
      { ...base, task_id: 'c', checks: { answerIncludes: ['ok', 3], evidenceIncludes: ['fine'] } },
      { ...base, task_id: 'd', checks: ['x'] },
      { ...base, task_id: 'e', checks: 'x' },
      { ...base, task_id: 'f' },
    ]));
    const byId = Object.fromEntries(rows.map((r) => [r.task_id, r]));
    expect(byId.a!.checks).toEqual({ answerIncludes: ['30,887'], evidenceIncludes: ['Total'] });
    expect(byId.b!.checks).toBeUndefined();
    expect(byId.c!.checks).toEqual({ evidenceIncludes: ['fine'] }); // the list with a non-string is dropped
    for (const id of ['d', 'e', 'f']) expect('checks' in byId[id]!).toBe(false);
  });

  it('passes when the reply and some frame contain the key, ignoring case and spacing', () => {
    const checks = { answerIncludes: ['30,887'], evidenceIncludes: ['Monthly  payment: $1,200'] };
    expect(evaluateChecks(checks, 'The total is 30,887 dollars.', ['Home', 'monthly payment:\n$1,200 per month'])).toEqual({ pass: true, failed: [] });
    expect(evaluateChecks({ answerIncludes: ['BLUE mug'] }, 'the  blue\nmug', [])).toEqual({ pass: true, failed: [] });
  });

  it('fails a near miss and says what failed', () => {
    const checks = { answerIncludes: ['30,887'], evidenceIncludes: ['Monthly payment: $1,200'] };
    expect(evaluateChecks(checks, 'The total is 30,888.', ['monthly payment: $1,200'])).toEqual({ pass: false, failed: ['answer lacks "30,887"'] });
    expect(evaluateChecks(checks, '30,887', ['Monthly payment: $1,201'])).toEqual({ pass: false, failed: ['no frame shows "Monthly payment: $1,200"'] });
    expect(evaluateChecks(checks, '30,887', [])).toEqual({ pass: false, failed: ['no frame shows "Monthly payment: $1,200"'] });
  });

  it('returns null without checks', () => {
    expect(evaluateChecks(undefined, 'x', [])).toBeNull();
    expect(evaluateChecks({}, 'x', [])).toBeNull();
    expect(evaluateChecks({ answerIncludes: [] }, 'x', [])).toBeNull();
  });
});

describe('judged report with evidence and checks', () => {
  const rows = new Map(makeRows({ easy: 3 }).map((r) => [r.task_id, r]));
  const old = (task: string, approach: string, verdict: JudgedRun['verdict']): JudgedRun => ({ task, approach, run: 1, verdict, reason: 'r', finalUrl: null, toolCalls: 1, totalInputTokens: 1, wallS: 1 });
  const withEvidence = (task: string, approach: string, verdict: JudgedRun['verdict'], extra: Partial<JudgedRun>): JudgedRun => ({ ...old(task, approach, verdict), frameCount: 3, finalFrame: 'F3', ...extra });

  it('leaves the report unchanged when no run has evidence or check data', () => {
    const md = renderJudgedMarkdown('demo', [old('easy-0', 'mantis', 'success'), old('easy-1', 'tree', 'failure')], rows, 'judge');
    expect(md).not.toContain('Evidence and checks');
    expect(md.trimEnd().split('\n').at(-1)).toMatch(/^\| `easy-1`/);
  });

  it('appends an evidence section with counts and check/judge disagreements', () => {
    const md = renderJudgedMarkdown('demo', [
      withEvidence('easy-0', 'mantis', 'failure', { judgeVerdict: 'success', checks: { pass: false, failed: ['answer lacks "30,887"'] }, evidence: ['F3'] }),
      withEvidence('easy-1', 'mantis', 'success', { judgeVerdict: 'success', checks: { pass: true, failed: [] }, evidence: ['F1', 'F3'] }),
      withEvidence('easy-2', 'tree', 'failure', { judgeVerdict: 'failure', checks: { pass: true, failed: [] } }),
      withEvidence('easy-0', 'tree', 'failure', { judgeVerdict: 'failure', checks: { pass: false, failed: ['no frame shows "x"'] }, frameCount: 0, finalFrame: null }),
    ], rows, 'judge');
    const section = md.slice(md.indexOf('## Evidence and checks'));
    expect(md.indexOf('## Per task')).toBeLessThan(md.indexOf('## Evidence and checks'));
    expect(section).toContain('| mantis | 2 | 1 | 1 | 0 | 0 | 2 | 1 |');
    expect(section).toContain('| tree | 2 | 0 | 2 | 0 | 0 | 1 | 0 |');
    expect(section).toContain('- `easy-0` mantis run 1: judge success; checks failed (answer lacks "30,887")');
    expect(section).toContain('- `easy-2` tree run 1: judge failure; checks passed');
    expect(section).not.toContain('easy-1` mantis'); // check and judge agree
    expect(section).not.toContain('no frame shows "x"'); // judge also said failure
    expect(section).not.toContain('None.');
  });

  it('says None. when checks and judge agree', () => {
    const md = renderJudgedMarkdown('demo', [withEvidence('easy-0', 'mantis', 'success', { judgeVerdict: 'success', checks: { pass: true, failed: [] } })], rows, 'judge');
    expect(md).toContain('### Check vs judge disagreements\n\nNone.');
  });
});
