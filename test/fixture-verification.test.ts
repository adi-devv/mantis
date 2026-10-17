import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { chromiumExecutable } from '../src/userAgent.js';
import { MantisBrowser } from '../src/index.js';
import { startFixtures } from '../bench/fixtures.js';
import { TASKS } from '../bench/agent/tasks.js';
import { LONG_EXPECT } from '../bench/fixtures-long.js';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { evidenceShowsOnlySiteErrors, FINAL_TEXT_CAP, PAGE_STATE_FUNCTION, STEP_TEXT_CAP, packEvidence, parsePageState, selectFrames, toCapturedFrame } from '../bench/agent/evidence.js';
import type { CapturedFrame } from '../bench/agent/evidence.js';
import { deterministicGradeForRun, finalizeSiteBrokenVerdicts, parseJudgeOutput, renderJudgedMarkdown, universallySiteBrokenTasks } from '../bench/agent/judge.js';
import type { JudgedRun } from '../bench/agent/judge.js';
import { evaluateDeterministicGrader, loadRealsiteRows, validateChecks, validateDeterministicGrader } from '../bench/agent/realsite.js';
import { createMcpProxy } from '../bench/agent/mcp-proxy.js';
import { decodePng, encodePng, fitWithin, grayThumb, resizeImage, thumbDiff } from '../bench/agent/png.js';
import { classifyClickError } from '../src/browser.js';
import { fixture, idOf } from './helpers.js';

const crc32 = (buf: Uint8Array): number => {
  let c = ~0;
  for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
};

it('marks only a universal cross-approach site failure as site_broken', () => {
  const judged = (approach: string, verdict: JudgedRun['verdict'], siteFailure = false): JudgedRun => ({
    task: 'broken-task', approach, run: 1, verdict, siteFailure, reason: 'r', finalUrl: null,
    toolCalls: 1, totalInputTokens: 1, wallS: 1,
  });
  const allBroken = [judged('mantis', 'site_broken'), judged('tree', 'failure', true), judged('screenshot', 'site_broken')];
  expect(parseJudgeOutput('{"verdict":"site_broken","reason":"HTTP 503 page."}').verdict).toBe('site_broken');
  expect(evidenceShowsOnlySiteErrors([
    { url: 'https://example.test/', text: '' },
    { url: 'chrome-error://chromewebdata/', text: 'This site can\u2019t be reached\nERR_CONNECTION_REFUSED' },
  ])).toBe(true);
  expect([...universallySiteBrokenTasks(allBroken)]).toEqual(['broken-task']);
  expect(finalizeSiteBrokenVerdicts(allBroken).every((run) => run.verdict === 'site_broken')).toBe(true);
  const report = renderJudgedMarkdown('broken', allBroken, new Map(), 'judge-model');
  expect(report).toContain('| Site broken |');
  expect(report).toContain('Site-broken tasks: `broken-task`.');
  expect(report).toContain('| `broken-t` | site_broken | site_broken | site_broken |');

  // Near miss: one approach reached usable content, so no run gets the task-level exclusion.
  const usable = [...allBroken.slice(0, 2), judged('screenshot', 'failure')];
  expect(universallySiteBrokenTasks(usable).size).toBe(0);
  expect(finalizeSiteBrokenVerdicts(usable).map((run) => run.verdict)).toEqual(['failure', 'failure', 'failure']);
  expect(evidenceShowsOnlySiteErrors([
    { url: 'chrome-error://chromewebdata/', text: 'This site cannot be reached' },
    { url: 'https://example.test/results', text: 'Product results loaded' },
  ])).toBe(false);
});

it('describes the current judge packet and flags missing answer-key checks', () => {
  expect(validateChecks({ answerIncludes: ['expected answer'] })).toBeNull();
  expect(validateChecks(undefined)).toBe('missing checks'); // near miss: a cloud row omitted the answer key
  expect(validateChecks({ answerIncludes: [] })).toMatch(/non-empty string arrays/);
  const folder = mkdtempSync(join(os.tmpdir(), 'realsite-row-checks-'));
  try {
    const base = { task_id: 'cloud-row', website: 'https://example.test/', confirmed_task: 'Find it', level: 'easy' };
    const missing = join(folder, 'missing.json');
    writeFileSync(missing, JSON.stringify([base]));
    const issues: string[] = [];
    loadRealsiteRows(missing, (message) => issues.push(message));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('cloud-row: missing checks');

    // Near miss: a complete answer key is accepted without invoking the injected reporter.
    const valid = join(folder, 'valid.json');
    writeFileSync(valid, JSON.stringify([{ ...base, checks: { answerIncludes: ['expected answer'] } }]));
    const validIssues: string[] = [];
    expect(loadRealsiteRows(valid, (message) => validIssues.push(message))[0]!.checks).toEqual({ answerIncludes: ['expected answer'] });
    expect(validIssues).toEqual([]);
  } finally { rmSync(folder, { recursive: true, force: true }); }
  const run: JudgedRun = { task: 't', approach: 'mantis', run: 1, verdict: 'success', reason: '', finalUrl: null, toolCalls: 1, totalInputTokens: 1, wallS: 1, frameCount: 2, checks: { pass: true, failed: [] } };
  const report = renderJudgedMarkdown('packet', [run], new Map(), 'judge-model');
  expect(report).toContain('judge evidence packet of per-step harness frames');
  expect(report).toContain('complete deterministic grader decided it first');
  expect(report).not.toContain("Each run's final reply and screenshot were graded");
});

it('grades complete opted-in real-site validators against one final captured state', () => {
  const fact = {
    kind: 'fact' as const, answerIncludes: [{ type: 'entity' as const, value: 'Cedar' }],
    final: { url: { origin: 'https://fixture.test', path: '/reference' }, textIncludes: [{ type: 'entity' as const, value: 'Cedar is available' }] },
  };
  const form = {
    kind: 'form' as const, answerIncludes: [{ type: 'number' as const, value: 18 }],
    final: {
      url: { origin: 'https://fixture.test', path: '/quote' }, textIncludes: [{ type: 'number' as const, value: 18 }],
      formValues: [{ label: 'Origin', value: 'North' }, { label: 'Destination', value: 'South' }],
    },
  };
  const state = {
    kind: 'state' as const, answerIncludes: [{ type: 'entity' as const, value: 'Blue collection' }],
    final: {
      url: { origin: 'https://fixture.test', path: '/catalog', query: { colour: 'blue' } }, textIncludes: [{ type: 'number' as const, value: 12 }],
      formValues: [{ label: 'Blue', value: 'checked' }, { label: 'Collection', value: 'Blue' }],
    },
  };
  for (const grader of [fact, form, state]) expect(validateDeterministicGrader(grader)).toBeNull();

  // Passing fixtures: fact + evidence, submitted inputs + site result, and selected final state.
  expect(evaluateDeterministicGrader(fact, 'The answer is Cedar.', [{ final: true, url: 'https://fixture.test/reference', text: 'Cedar is available.' }])?.pass).toBe(true);
  expect(evaluateDeterministicGrader(form, 'The site shows 18 credits.', [{ final: true, url: 'https://fixture.test/quote', text: 'Site total: 18 credits', forms: [{ label: 'Origin', value: 'North' }, { label: 'Destination', value: 'South' }] }])?.pass).toBe(true);
  expect(evaluateDeterministicGrader(state, 'The Blue collection is selected.', [{ final: true, url: 'https://fixture.test/catalog?colour=blue', text: '12 blue items', forms: [{ label: 'Blue', value: 'checked' }, { label: 'Collection', value: 'Blue' }] }])?.pass).toBe(true);

  // Near misses: wrong entity/value, one wrong submitted input, and labels visible without selection.
  expect(evaluateDeterministicGrader(fact, 'The answer is Pine.', [{ final: true, url: 'https://fixture.test/reference', text: 'Pine is available.' }])?.pass).toBe(false);
  expect(evaluateDeterministicGrader(form, 'The site shows 18 credits.', [{ final: true, url: 'https://fixture.test/quote', text: 'Site total: 18 credits', forms: [{ label: 'Origin', value: 'West' }, { label: 'Destination', value: 'South' }] }])?.pass).toBe(false);
  expect(evaluateDeterministicGrader(state, 'The Blue collection is selected.', [{ final: true, url: 'https://fixture.test/catalog?colour=blue', text: '12 blue items; Blue', forms: [{ label: 'Blue', value: 'unchecked' }, { label: 'Collection', value: 'Blue' }] }])?.pass).toBe(false);

  // A reply alone, an earlier matching state, and incomplete evidence cannot establish deterministic success.
  expect(evaluateDeterministicGrader(fact, 'The answer is Cedar.', [{ final: true, url: 'https://fixture.test/reference', text: 'No matching entry' }])?.pass).toBe(false);
  expect(evaluateDeterministicGrader(state, 'The Blue collection is selected.', [
    { url: 'https://fixture.test/catalog?colour=blue', text: '12 blue items', forms: [{ label: 'Blue', value: 'checked' }, { label: 'Collection', value: 'Blue' }] },
    { final: true, url: 'https://fixture.test/catalog', text: 'Choose a colour', forms: [{ label: 'Blue', value: 'unchecked' }, { label: 'Collection', value: 'All' }] },
  ])?.pass).toBe(false);
  expect(evaluateDeterministicGrader(form, 'The site shows 18 credits.', [{ url: 'https://fixture.test/quote', text: 'Site total: 18 credits', forms: [{ label: 'Origin', value: 'North' }, { label: 'Destination', value: 'South' }] }])?.failed).toContain('no final captured evidence frame');
  expect(evaluateDeterministicGrader(fact, 'The answer is Cedar.', [
    { final: true, url: 'https://fixture.test/reference', text: 'Cedar is available.' },
    { final: true, url: 'https://fixture.test/reference', text: 'Cedar is available.' },
  ])?.failed).toContain('multiple final captured evidence frames');

  // Routing only opts in after a successful run with a captured evidence packet;
  // otherwise the normal judge can retain blocked/site-broken decisions.
  const row = { task_id: 'synthetic', website: 'https://fixture.test/', task: 'Select Blue', level: 'easy', deterministic: state };
  const frames = [{ id: 'F1', image: 'f1.png', final: true, url: 'https://fixture.test/catalog?colour=blue', text: '12 blue items', forms: [{ label: 'Blue', value: 'checked' }, { label: 'Collection', value: 'Blue' }] }];
  expect(deterministicGradeForRun(row, 'success', true, 'The Blue collection is selected.', frames)?.pass).toBe(true);
  expect(deterministicGradeForRun(row, 'timeout', true, 'The Blue collection is selected.', frames)).toBeNull();
  expect(deterministicGradeForRun(row, 'success', false, 'The Blue collection is selected.', frames)).toBeNull();
});

it('Mantis follows a verified label but rejects a covered control', async () => {
  const mantis = new MantisBrowser({ actionTimeoutMs: 300 });
  try {
    const view = await mantis.open(fixture('generic-browser-pointer.html'));
    expect(await mantis.click(idOf(view, 'radio "Valid radio"'))).toContain('radio selected');

    const covered = await mantis.click(idOf(view, 'button "Covered button"'));
    expect(covered).toMatch(/^error:.*covered by another element/);
    expect(await mantis.read()).not.toContain('covered clicked');
  } finally {
    await mantis.close();
  }
});

it('grounds pilot diagnostics in a numbered closed trigger or a real visual target', async () => {
  const mantis = new MantisBrowser({ actionTimeoutMs: 300 });
  try {
    let view = await mantis.open(fixture('generic-browser-cover-diagnosis.html'));
    const trigger = idOf(view, 'button "Filters"');
    expect(await mantis.click(idOf(view, 'button "Apply filters"'))).toContain(`open #${trigger} "Filters" first`);

    // Near miss: a page layer with unrelated controls is not a modal to dismiss.
    view = await mantis.open(fixture('generic-browser-cover-diagnosis.html'));
    const hero = await mantis.click(idOf(view, 'button "Continue"'));
    expect(hero).toContain('nothing to dismiss');
    expect(hero).not.toContain('dismiss that first');

    view = await mantis.open(fixture('generic-browser-collapsed-options.html'));
    expect(view).toMatch(/"Black \(414 products\)" \(open #\d+ "Colour" first\)/);
    expect(view).not.toMatch(/Black ink is archival\." \(open #/);

    await mantis.open(fixture('generic-data-hint.html'));
    const canvas = (await mantis.media()).match(/^#(\d+) canvas/m)?.[1];
    expect(await mantis.data({ id: 9999 })).toContain(`data({id: ${canvas}})`);
    await mantis.open(`${fixture('generic-data-hint.html')}?empty=1`);
    expect(await mantis.data({ id: 9999 })).not.toContain('data({id:');
  } finally {
    await mantis.close();
  }
});

it('opens verified disclosures before actions, without treating content controls as dismissible', async () => {
  const mantis = new MantisBrowser({ actionTimeoutMs: 300 });
  try {
    let view = await mantis.open(fixture('generic-browser-cover-diagnosis.html'));
    const filters = idOf(view, 'button "Filters"');
    expect(await mantis.click(idOf(view, 'button "Apply filters"'))).toContain(`open #${filters} "Filters" first`);
    await mantis.click(filters);
    view = await mantis.read();
    expect(await mantis.click(idOf(view, 'button "Apply filters"'))).toContain('Filters applied');

    // Near miss: painted content with ordinary controls does not establish a dismissible overlay.
    view = await mantis.open(fixture('generic-browser-cover-diagnosis.html'));
    const covered = await mantis.click(idOf(view, 'button "Continue"'));
    expect(covered).toContain('nothing to dismiss');
    expect(covered).not.toContain('dismiss that first');

    view = await mantis.open(`${fixture('generic-browser-cover-diagnosis.html')}?dialog=1`);
    const blocked = await mantis.click(idOf(view, 'button "Continue"'));
    expect(blocked).toMatch(/dismiss that first.*try #\d+ "Dismiss"/);
    await mantis.click(idOf(view, 'button "Dismiss"'));
    view = await mantis.read();
    expect(await mantis.click(idOf(view, 'button "Filters"'))).not.toMatch(/^error:/);
  } finally {
    await mantis.close();
  }
});

it('makes collapsed options actionable only after their numbered trigger is opened', async () => {
  const mantis = new MantisBrowser({ actionTimeoutMs: 300 });
  try {
    let view = await mantis.open(fixture('generic-browser-collapsed-options.html'));
    const colour = idOf(view, 'button "Colour"');
    expect(view).toContain(`"Black (414 products)" (open #${colour} "Colour" first)`);
    expect(view).not.toMatch(/Black ink is archival\." \(open #/); // near miss: matching prose is not an option
    const small = view.split('\n').find((line) => line.includes('checkbox "Small"'));
    expect(small).toBeTruthy();
    expect(small).not.toContain('open #'); // near miss: an expanded sibling is not part of the closed group
    const material = idOf(view, 'button "Material"');
    // The complete ARIA and native disclosure action flows are exercised in pilot-gaps;
    // this verifier guards the capture contract that makes those controls discoverable.
    expect(view).not.toContain('checkbox "Black (414 products)"');
    expect(view).toContain(`#${material} button "Material" (collapsed)`);
  } finally {
    await mantis.close();
  }
});

it('advertises a concrete canvas target in read and keeps chart data bound to that canvas', async () => {
  const mantis = new MantisBrowser({ actionTimeoutMs: 300 });
  try {
    const view = await mantis.open(fixture('generic-data-hint.html'));
    const trend = Number(view.match(/^\s*#(\d+) canvas "Monthly trend"/m)?.[1]);
    expect(trend).toBeGreaterThan(0);
    const media = await mantis.media();
    expect(media).toMatch(new RegExp(`^#${trend} canvas .*Monthly trend`, 'm'));
    expect(media).toContain('data({id: N})');
    expect(media).toContain('ocr({id: N})');
    expect(media).toContain('look({id: N})');
    expect(await mantis.data({ id: trend })).toContain('Monthly series');

    // Near miss: another visible canvas cannot satisfy the expected series.
    const comparison = Number(view.match(/^\s*#(\d+) canvas "Comparison trend"/m)?.[1]);
    expect(await mantis.data({ id: comparison })).toContain('Comparison series');
    expect(await mantis.data({ id: comparison })).not.toContain('Monthly series');
    const missing = await mantis.data({ id: 9999 });
    expect(missing).toContain(`data({id: ${trend}})`);

    await mantis.open(`${fixture('generic-data-hint.html')}?empty=1`);
    expect(await mantis.read()).not.toContain('canvas');
    expect(await mantis.data({ id: 9999 })).not.toContain('data({id:');
  } finally {
    await mantis.close();
  }
});

it('keeps navigation waits distinct from final actionability failures', () => {
  const navigationWait = 'waiting for element to be visible\n  element is visible, enabled and stable\n  waiting for scheduled navigations to finish';
  expect(classifyClickError(navigationWait)).toBeNull();
  // Near miss: a final hidden state is still classified as hidden.
  expect(classifyClickError('waiting for element to be visible\n  element is not visible')).toBe('not-visible');
});

it('reports a failed dispatched navigation from its final document', async () => {
  const mantis = new MantisBrowser({ actionTimeoutMs: 1500 });
  try {
    let view = await mantis.open(fixture('nav.html'));
    const failed = await mantis.click(idOf(view, 'link "Broken link"'));
    expect(failed).toContain('the page failed to load');

    // Near miss: a completed navigation still reports the destination document.
    view = await mantis.open(fixture('nav.html'));
    expect(await mantis.click(idOf(view, 'link "Go to login"'))).toContain('Sign in');
  } finally {
    await mantis.close();
  }
});

const task = TASKS.find((entry) => entry.id === 'form-subscribe')!;
let browser: Browser;
let fixtures: Awaited<ReturnType<typeof startFixtures>>;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch(chromiumExecutable());
  fixtures = await startFixtures({ checks: TASKS.map((entry) => ({ taskId: entry.id, check: entry.check })) });
  page = await browser.newPage();
});

afterAll(async () => {
  if (page) await page.close();
  if (browser) await browser.close();
  if (fixtures) await fixtures.close();
});

async function openAttempt(taskId: string, attemptId: string, path: string): Promise<void> {
  await page.goto(`${fixtures.baseFor(taskId, attemptId)}${path}`);
}

async function verify(taskId: string, attemptId: string, expected: boolean): Promise<void> {
  // Let post-action snapshots be sent, then wait until the grader has received every observation.
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 0)));
  await page.waitForFunction(() => (window as unknown as { __fixturePending: number }).__fixturePending === 0);
  expect((await fixtures.verify(taskId, attemptId))?.ok).toBe(expected);
}

function expectAnswer(taskId: string, correct: string, nearMiss: string): void {
  const entry = TASKS.find((candidate) => candidate.id === taskId)!;
  expect(entry.expect.test(correct)).toBe(true);
  expect(entry.expect.test(nearMiss)).toBe(false);
}

it('panel-veil covers Mantis click-through, controls, and hidden-control near misses', async () => {
  const panelVeil = pathToFileURL(resolve(import.meta.dirname, 'fixtures/hidden/panel-veil.html')).href;
  const mantis = new MantisBrowser({ actionTimeoutMs: 300 });
  try {
    let view = await mantis.open(`${panelVeil}?invisible`);
    expect(await mantis.click(idOf(view, 'button "Continue"'))).toContain('Continued');

    view = await mantis.open(`${panelVeil}?dismiss`);
    const blocked = await mantis.click(idOf(view, 'button "Continue"'));
    expect(blocked).toMatch(/try #\d+ "Dismiss"/);
    expect(await mantis.click(idOf(view, 'button "Dismiss"'))).toContain('clicked');
    expect(await mantis.click(idOf(await mantis.read(), 'button "Continue"'))).toContain('Continued');

    view = await mantis.open(`${panelVeil}?dialog`);
    const dialogBlocked = await mantis.click(idOf(view, 'button "Continue"'));
    expect(dialogBlocked).toMatch(/controls: #\d+ "Keep browsing"/);

    view = await mantis.open(`${panelVeil}?hidden-control`);
    expect(await mantis.click(idOf(view, 'button "Continue"'))).toContain('Continued');

    view = await mantis.open(`${panelVeil}?hidden-persistent`);
    const hiddenNearMiss = await mantis.click(idOf(view, 'button "Continue"'));
    expect(hiddenNearMiss).toContain('nothing to dismiss');
    expect(hiddenNearMiss).not.toContain('Dismiss');
  } finally {
    await mantis.close();
  }
});

it('rejects answer-only runs and wrong form inputs, and accepts the requested subscription', async () => {
  await openAttempt(task.id, 'no-action', '/form');
  await verify(task.id, 'no-action', false);

  await openAttempt(task.id, 'wrong-inputs', '/form');
  await page.selectOption('#c', 'us');
  await page.check('#n');
  await page.click('button[type="submit"]');
  await verify(task.id, 'wrong-inputs', false);

  await openAttempt(task.id, 'correct-inputs', '/form');
  await page.selectOption('#c', 'ca');
  await page.check('#n');
  await page.click('button[type="submit"]');
  await verify(task.id, 'correct-inputs', true);
  await verify(task.id, 'no-action', false);
});

it('checks the signup validation retry and rejects an incomplete retry', async () => {
  const signup = TASKS.find((entry) => entry.id === 'signup-validation')!;
  await openAttempt(signup.id, 'signup-wrong', '/signup');
  await page.fill('#em', 'new@example.com');
  await page.fill('#pw', 'abc123');
  await page.fill('#pw2', 'abc123');
  await page.click('button[type="submit"]');
  await verify(signup.id, 'signup-wrong', false);

  await openAttempt(signup.id, 'signup-correct', '/signup');
  await page.fill('#em', 'new@example.com');
  await page.fill('#pw', 'abc123');
  await page.fill('#pw2', 'abc123');
  await page.click('button[type="submit"]');
  await page.fill('#pw', 'longenough123');
  await page.fill('#pw2', 'longenough123');
  await page.click('button[type="submit"]');
  await verify(signup.id, 'signup-correct', true);
});

it('checks checkout fields, delivery choice, and completed order state', async () => {
  const checkout = TASKS.find((entry) => entry.id === 'checkout-steps')!;
  await openAttempt(checkout.id, 'checkout-correct', '/checkout');
  await page.fill('#nm', 'Ada Lovelace');
  await page.selectOption('#city', { label: 'Berlin' });
  await page.click('#n1');
  await page.check('input[name="d"][value="exp"]');
  await page.click('#n2');
  await page.click('#place');
  await verify(checkout.id, 'checkout-correct', true);

  await openAttempt(checkout.id, 'checkout-wrong-city', '/checkout');
  await page.fill('#nm', 'Ada Lovelace');
  await page.selectOption('#city', { label: 'Paris' });
  await page.click('#n1');
  await page.check('input[name="d"][value="exp"]');
  await page.click('#n2');
  await page.click('#place');
  await verify(checkout.id, 'checkout-wrong-city', false);
});

it('smokes the remaining local interaction checks', async () => {
  const cookie = TASKS.find((entry) => entry.id === 'cookie-cart')!;
  await openAttempt(cookie.id, 'cookie-cart', '/cookie');
  await page.getByRole('button', { name: 'Accept' }).click();
  await page.click('#add');
  await verify(cookie.id, 'cookie-cart', true);

  const login = TASKS.find((entry) => entry.id === 'login')!;
  await openAttempt(login.id, 'login', '/login');
  await page.fill('#email', 'agent@example.com');
  await page.fill('#pw', 'correct-horse-battery');
  await page.click('button[type="submit"]');
  await verify(login.id, 'login', true);

  const refresh = TASKS.find((entry) => entry.id === 'dashboard-refresh')!;
  await openAttempt(refresh.id, 'dashboard-refresh', '/dashboard');
  await page.click('#ref');
  await verify(refresh.id, 'dashboard-refresh', true);

  const booking = TASKS.find((entry) => entry.id === 'booking-date')!;
  await openAttempt(booking.id, 'booking-date', '/booking');
  await page.fill('#dt', '2026-12-24');
  await page.selectOption('#tm', '19:00');
  await page.fill('#ppl', '3');
  await page.click('button[type="submit"]');
  await verify(booking.id, 'booking-date', true);

  const search = TASKS.find((entry) => entry.id === 'search-pagination')!;
  await openAttempt(search.id, 'search-pagination', '/search');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Quokka facts').click();
  await verify(search.id, 'search-pagination', true);

  const deletion = TASKS.find((entry) => entry.id === 'modal-delete')!;
  await openAttempt(deletion.id, 'modal-delete', '/files');
  await page.getByRole('button', { name: 'Delete Old report' }).click();
  await page.click('#yes');
  await verify(deletion.id, 'modal-delete', true);

  const spa = TASKS.find((entry) => entry.id === 'spa-team')!;
  await openAttempt(spa.id, 'spa-team', '/app');
  await page.getByRole('button', { name: 'Team' }).click();
  await page.getByRole('button', { name: 'Mia Wong' }).click();
  await verify(spa.id, 'spa-team', true);

  const faq = TASKS.find((entry) => entry.id === 'faq-refund')!;
  await openAttempt(faq.id, 'faq-refund', '/help');
  expect(await page.locator('body').innerText()).not.toContain('30 days');
  await page.getByRole('button', { name: /refund policy/i }).click();
  await verify(faq.id, 'faq-refund', true);

  const item = TASKS.find((entry) => entry.id === 'longlist-item')!;
  await openAttempt(item.id, 'longlist-item', '/item/150');
  await verify(item.id, 'longlist-item', true);

  for (const [taskId, path] of [
    ['article-deep-fact', '/article'], ['inventory-lookup', '/inventory'], ['churned-max', '/dashboard'],
    ['feed-scroll', '/feed'], ['chart-march', '/chart'],
  ]) {
    await openAttempt(taskId, `read-${taskId}`, path);
    await verify(taskId, `read-${taskId}`, true);
  }
});

it('rejects close answers and near-miss flows for every remaining local task', async () => {
  // Answer checks must reject adjacent values, larger numbers, and plausible-but-wrong entities.
  expectAnswer('login', 'The page heading is Signed in.', 'The page heading is Not signed in.');
  expectAnswer('cookie-cart', 'Added to cart.', 'Added to cart (2 items).');
  expectAnswer('longlist-item', 'Detail for item 150', 'Detail for item 1500');
  expectAnswer('pricing-team', 'The Team plan is $29 per month.', 'The Team plan is $290 per month.');
  expectAnswer('dashboard-refresh', 'Last updated: just now. Initech 3: $4,218.', 'Last updated: just now. Initech 3: $4,2180.');
  expectAnswer('booking-date', 'Booked for 2026-12-24 at 19:00, 3 guests.', 'Booked for 2026-12-24 at 19:000, 3 guests.');
  expectAnswer('article-deep-fact', 'The harbour light was first lit in 1874.', 'The harbour light was first lit in 18740.');
  expectAnswer('inventory-lookup', 'Widget 30 is W-1203 with 113 in stock.', 'Widget 30 is W-12030 with 113 in stock.');
  expectAnswer('churned-max', 'Acme 6 has the highest amount: $9,950.', 'Acme 60 has the highest amount: $9,950.');
  expectAnswer('search-pagination', 'It was written by dana.r.', 'It was written by dana.r2.');
  expectAnswer('feed-scroll', 'Post #35 says Thursday at noon.', 'Post #35 says Thursday at noonish.');
  expectAnswer('modal-delete', 'Old report was moved to trash.', 'Old report was moved to trashish.');
  expectAnswer('spa-team', 'The designer email is mia@example.com.', 'The designer email is mia@example.com.invalid.');
  expectAnswer('faq-refund', 'You can ask within 30 days.', 'You can ask within 31 days.');
  expectAnswer('chart-march', 'March sales were 42 units.', 'March sales were 142 units.');

  const login = TASKS.find((entry) => entry.id === 'login')!;
  await openAttempt(login.id, 'login-wrong-password', '/login');
  await page.fill('#email', 'agent@example.com');
  await page.fill('#pw', 'correct-horse-batteries');
  await page.click('button[type="submit"]');
  await verify(login.id, 'login-wrong-password', false);

  const cookie = TASKS.find((entry) => entry.id === 'cookie-cart')!;
  await openAttempt(cookie.id, 'cookie-cart-no-add', '/cookie');
  await page.getByRole('button', { name: 'Accept' }).click();
  await verify(cookie.id, 'cookie-cart-no-add', false);

  const item = TASKS.find((entry) => entry.id === 'longlist-item')!;
  await openAttempt(item.id, 'longlist-item-149', '/item/149');
  await verify(item.id, 'longlist-item-149', false);

  const pricing = TASKS.find((entry) => entry.id === 'pricing-team')!;
  await openAttempt(pricing.id, 'pricing-no-navigation', '/site/home');
  await verify(pricing.id, 'pricing-no-navigation', false);

  const refresh = TASKS.find((entry) => entry.id === 'dashboard-refresh')!;
  await openAttempt(refresh.id, 'dashboard-no-refresh', '/dashboard');
  await verify(refresh.id, 'dashboard-no-refresh', false);

  const booking = TASKS.find((entry) => entry.id === 'booking-date')!;
  await openAttempt(booking.id, 'booking-four-guests', '/booking');
  await page.fill('#dt', '2026-12-24');
  await page.selectOption('#tm', '19:00');
  await page.fill('#ppl', '4');
  await page.click('button[type="submit"]');
  await verify(booking.id, 'booking-four-guests', false);

  const search = TASKS.find((entry) => entry.id === 'search-pagination')!;
  await openAttempt(search.id, 'search-wrong-result', '/search');
  await page.getByRole('button', { name: 'Next' }).click();
  await page.getByText('Otter notes 2').click();
  await verify(search.id, 'search-wrong-result', false);

  const deletion = TASKS.find((entry) => entry.id === 'modal-delete')!;
  await openAttempt(deletion.id, 'delete-wrong-file', '/files');
  await page.getByRole('button', { name: 'Delete Budget 2026' }).click();
  await page.click('#yes');
  await verify(deletion.id, 'delete-wrong-file', false);

  const spa = TASKS.find((entry) => entry.id === 'spa-team')!;
  await openAttempt(spa.id, 'spa-wrong-person', '/app');
  await page.getByRole('button', { name: 'Team' }).click();
  await page.getByRole('button', { name: 'Sam Lee' }).click();
  await verify(spa.id, 'spa-wrong-person', false);

  const faq = TASKS.find((entry) => entry.id === 'faq-refund')!;
  await openAttempt(faq.id, 'faq-wrong-topic', '/help');
  await page.getByRole('button', { name: 'Can I change my plan?' }).click();
  await verify(faq.id, 'faq-wrong-topic', false);
});

it('requires navigation, iframe payment, menu selection, and plan selection actions', async () => {
  const pricing = TASKS.find((entry) => entry.id === 'pricing-team')!;
  await openAttempt(pricing.id, 'pricing-navigation', '/site/home');
  await page.getByRole('link', { name: 'See our pricing' }).click();
  await verify(pricing.id, 'pricing-navigation', true);

  const pay = TASKS.find((entry) => entry.id === 'iframe-pay')!;
  await openAttempt(pay.id, 'iframe-payment', '/pay');
  const card = page.frameLocator('iframe');
  await card.locator('#cn').fill('4242 4242 4242 4242');
  await card.locator('#ex').fill('12/30');
  await card.locator('#cvc').fill('123');
  await card.getByRole('button', { name: 'Pay $49.00' }).click();
  await verify(pay.id, 'iframe-payment', true);

  await openAttempt(pay.id, 'iframe-payment-wrong-cvc', '/pay');
  const wrongCard = page.frameLocator('iframe');
  await wrongCard.locator('#cn').fill('4242 4242 4242 4242');
  await wrongCard.locator('#ex').fill('12/30');
  await wrongCard.locator('#cvc').fill('999');
  await wrongCard.getByRole('button', { name: 'Pay $49.00' }).click();
  await verify(pay.id, 'iframe-payment-wrong-cvc', false);

  const menu = TASKS.find((entry) => entry.id === 'menu-settings')!;
  await openAttempt(menu.id, 'menu-settings-dark', '/account');
  await page.getByRole('button', { name: /Account/ }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.locator('input[name="t"][value="Dark"]').check();
  await page.click('#save');
  await verify(menu.id, 'menu-settings-dark', true);

  await openAttempt(menu.id, 'menu-settings-light', '/account');
  await page.getByRole('button', { name: /Account/ }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await page.locator('input[name="t"][value="Light"]').check();
  await page.click('#save');
  await verify(menu.id, 'menu-settings-light', false);

  const plans = TASKS.find((entry) => entry.id === 'plans-pick')!;
  await openAttempt(plans.id, 'plan-pro', '/plans');
  await page.locator('[data-plan="pro"]').click();
  await verify(plans.id, 'plan-pro', true);
  await openAttempt(plans.id, 'plan-basic', '/plans');
  await page.locator('[data-plan="basic"]').click();
  await verify(plans.id, 'plan-basic', false);
});

it('long tasks: accepts the full requested flows and rejects a single wrong step', async () => {
  const addToCart = async (name: string, times: number) => {
    await page.fill('#q', name);
    for (let i = 0; i < times; i++) await page.locator(`article[aria-label="${name}"] button`).click();
  };
  const shop = async (attempt: string, coupon: string) => {
    await openAttempt('long-shop', attempt, '/shop');
    await addToCart('Trail Mug', 2);
    await addToCart('Canvas Tote', 1);
    await addToCart('Beeswax Wrap', 3);
    await addToCart('Linen Apron', 1);
    await page.click('#cartbtn');
    await page.fill('#coupon', coupon);
    await page.click('#apply');
    await page.click('#tocheckout');
    await page.fill('#fn', 'Grace Hopper');
    await page.fill('#st', '12 Navy Way');
    await page.fill('#ci', 'Arlington');
    await page.fill('#zip', '22201');
    await page.click('#topay');
    await page.fill('#cn', '4242 4242 4242 4242');
    await page.fill('#ex', '12/30');
    await page.fill('#cvc', '123');
    await page.click('#pay');
  };
  await shop('shop-ok', 'SPRING10');
  expect((await page.locator('#v-done').innerText()).replace(/\s+/g, ' ')).toContain(`Order #${LONG_EXPECT.shop.order} confirmed. Total charged: $${LONG_EXPECT.shop.total}.`);
  await verify('long-shop', 'shop-ok', true);
  await shop('shop-no-coupon', 'NOPE');
  await verify('long-shop', 'shop-no-coupon', false);

  const admin = async (attempt: string, extra: boolean) => {
    await openAttempt('long-admin', attempt, '/admin');
    for (const [name, role] of [['Ivy Chen', 'Editor'], ['Lena Novak', 'Editor'], ['Raj Patel', 'Admin'], ['Omar Haddad', 'Viewer']]) {
      await page.fill('#uq', name);
      await page.getByLabel(`Role for ${name}`, { exact: true }).selectOption(role);
    }
    await page.fill('#uq', '');
    for (const name of ['Tom Becker', 'Sara Lind', ...(extra ? ['Ivy Cheng'] : [])]) {
      while (!(await page.getByLabel(`Active: ${name}`, { exact: true }).count())) await page.click('#unext');
      const box = page.getByLabel(`Active: ${name}`, { exact: true });
      if (await box.isChecked()) await box.uncheck(); else await box.check();
      while (await page.locator('#uprev').isEnabled()) await page.click('#uprev');
    }
    await page.click('#save');
  };
  await admin('admin-ok', false);
  await verify('long-admin', 'admin-ok', true);
  await admin('admin-extra', true);
  await verify('long-admin', 'admin-extra', false);

  const onboard = async (attempt: string, billing: boolean) => {
    await openAttempt('long-onboard', attempt, '/onboard');
    await page.fill('#co', 'Northwind Labs');
    await page.selectOption('#size', '51-200');
    await page.selectOption('#country', { label: 'Germany' });
    await page.fill('#vat', 'DE123456789');
    await page.click('#next1');
    await page.fill('#fn', 'Ada');
    await page.fill('#ln', 'Byron');
    await page.fill('#em', 'ada@northwind.test');
    await page.fill('#ph', '+49 30 1234567');
    await page.click('#next2');
    await page.check('input[name="plan"][value="growth"]');
    await page.check('input[name="cycle"][value="yearly"]');
    if (billing) { await page.uncheck('#sameinv'); await page.fill('#bin', 'billing@northwind.test'); }
    await page.click('#next3');
    for (const [mail, role] of [['lin@northwind.test', 'admin'], ['sam@northwind.test', 'member'], ['kai@northwind.test', 'member']]) {
      await page.fill('#ie', mail);
      await page.selectOption('#ir', role);
      await page.click('#add');
    }
    await page.click('#next4');
    await page.check('#terms');
    await page.click('#create');
  };
  await onboard('onboard-ok', true);
  expect(await page.locator('main').innerText()).toContain(`Workspace ${LONG_EXPECT.onboard.workspace} created for Northwind Labs (Growth, yearly, 3 invites).`);
  await verify('long-onboard', 'onboard-ok', true);
  await onboard('onboard-no-billing', false);
  await verify('long-onboard', 'onboard-no-billing', false);

  await openAttempt('long-laptops', 'laptops-ok', '/laptops');
  for (const path of LONG_EXPECT.laptops.paths) {
    await page.locator(`a[href="${path}"]`).first().click();
    await page.goBack();
  }
  await page.locator(`a[href="${LONG_EXPECT.laptops.paths.at(-1)}"]`).first().click();
  expect(await page.locator('main').innerText()).toContain('Battery life (video playback)');
  await verify('long-laptops', 'laptops-ok', true);
  await openAttempt('long-laptops', 'laptops-partial', '/laptops');
  await page.locator(`a[href="${LONG_EXPECT.laptops.paths[0]}"]`).first().click();
  await verify('long-laptops', 'laptops-partial', false);
});

// ---- Evidence frames: selection, PNG helpers, page state, harness proxy ----

const thumb = (value: number): Uint8Array => new Uint8Array(640).fill(value);
const fr = (name: string, value: number, url = 'https://example.com/a') => ({ name, thumb: thumb(value), url });
const names = (frames: { name: string }[]): string[] => frames.map((f) => f.name);

it('drops near-duplicate frames but keeps slightly different ones, URL changes and the final frame', () => {
  // 101 is within 2 of the kept 100 (dropped); 103 differs by 3 from 100 (kept); 104 is a near-duplicate of 103.
  expect(names(selectFrames([fr('a', 100), fr('b', 101), fr('c', 103), fr('d', 104), fr('final', 180)]))).toEqual(['a', 'c', 'final']);
  // Exactly at the threshold counts as a change (dropped means strictly below it).
  expect(names(selectFrames([fr('a', 100), fr('b', 102), fr('final', 200)]))).toEqual(['a', 'b', 'final']);
  // Same pixels, different URL: kept.
  expect(names(selectFrames([fr('a', 100), fr('b', 100, 'https://example.com/b'), fr('final', 200)]))).toEqual(['a', 'b', 'final']);
  expect(names(selectFrames([fr('a', 100), fr('b', 100), fr('final', 200)]))).toEqual(['a', 'final']);
});

it('always keeps the final frame and drops the earlier near-duplicate of it', () => {
  expect(names(selectFrames([fr('a', 100), fr('b', 150), fr('final', 150)]))).toEqual(['a', 'final']);
  expect(names(selectFrames([fr('a', 100), fr('b', 150), fr('final', 150, 'https://example.com/z')]))).toEqual(['a', 'b', 'final']);
  expect(names(selectFrames([fr('final', 100)]))).toEqual(['final']);
  expect(names(selectFrames([fr('a', 100), fr('final', 100)]))).toEqual(['final']);
  expect(selectFrames([])).toEqual([]);
});

it('caps at 12 keeping the first, the last and the biggest changes in chronological order', () => {
  const jumps = new Set([5, 9, 14]);
  let value = 10;
  const frames = Array.from({ length: 20 }, (_, i) => { value += i === 0 ? 0 : jumps.has(i) ? 40 : 3; return fr(`f${i}`, value); });
  const kept = selectFrames(frames);
  expect(kept).toHaveLength(12);
  // The three big jumps are kept; the rest of the slots go to the earliest of the equally small changes.
  expect(names(kept)).toEqual(['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f14', 'f19']);
  expect(names(selectFrames(frames))).toEqual(names(kept)); // deterministic
  expect(names(selectFrames(frames, 12).slice(0, 1))).toEqual(['f0']);
  expect(selectFrames(frames.slice(0, 12))).toHaveLength(12); // at the cap: nothing dropped
  // A URL change outranks a bigger pixel change.
  const mixed = [fr('a', 10), fr('b', 60), fr('c', 63, 'https://example.com/other'), fr('d', 66, 'https://example.com/other'), fr('e', 69, 'https://example.com/other'), fr('final', 72, 'https://example.com/other')];
  expect(names(selectFrames(mixed, 3))).toEqual(['a', 'c', 'final']);
});

it('round-trips PNGs, rejects unsupported ones, and resizes by area averaging', () => {
  const data = new Uint8Array(7 * 5 * 4);
  data.forEach((_, i) => { data[i] = (i * 37 + 11) & 255; });
  const decoded = decodePng(encodePng({ width: 7, height: 5, data }));
  expect([decoded.width, decoded.height]).toEqual([7, 5]);
  expect(Buffer.from(decoded.data).equals(Buffer.from(data))).toBe(true);
  const bad = encodePng({ width: 2, height: 2, data: new Uint8Array(16) });
  expect(() => decodePng(Buffer.from('not a png at all'))).toThrow(/not a PNG/);
  const sixteenBit = Buffer.from(bad); sixteenBit[24] = 16;
  expect(() => decodePng(sixteenBit)).toThrow(/bit depth/);
  const interlaced = Buffer.from(bad); interlaced[28] = 1;
  expect(() => decodePng(interlaced)).toThrow(/interlaced/);
  // Resizing: 2x2 black and white average to mid gray; dimensions follow the request.
  const checker = { width: 2, height: 2, data: new Uint8Array([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]) };
  expect(Array.from(resizeImage(checker, 1, 1).data)).toEqual([128, 128, 128, 255]);
  const opaque = (v: number): { width: number; height: number; data: Uint8Array } => ({ width: 1280, height: 800, data: new Uint8Array(1280 * 800 * 4).map((_, i) => (i % 4 === 3 ? 255 : v)) });
  const big = opaque(90);
  const half = fitWithin(big, 640, 400);
  expect([half.width, half.height]).toEqual([640, 400]);
  expect(half.data[0]).toBe(90);
  expect(fitWithin(big, 2000, 2000)).toBe(big); // never upscales
  const square = fitWithin({ width: 1000, height: 1000, data: new Uint8Array(4_000_000) }, 640, 400);
  expect([square.width, square.height]).toEqual([400, 400]);
  expect(thumbDiff(grayThumb(big), grayThumb(opaque(95)))).toBeCloseTo(5, 0);
  expect(thumbDiff(grayThumb(big), grayThumb(big))).toBe(0);
});

/** A PNG built by hand with one filter type per row, to exercise every decoder path. */
function filteredPng(colorType: 0 | 2 | 4, width: number, rows: number[][]): Buffer {
  const channels = { 0: 1, 2: 3, 4: 2 }[colorType];
  const stride = width * channels;
  const raw: number[] = [];
  rows.forEach((row, y) => {
    raw.push(y % 5);
    row.forEach((value, x) => {
      const left = x >= channels ? row[x - channels]! : 0;
      const up = y > 0 ? rows[y - 1]![x]! : 0;
      const upLeft = y > 0 && x >= channels ? rows[y - 1]![x - channels]! : 0;
      const p = left + up - upLeft;
      const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - upLeft);
      const paeth = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      const predictor = [0, left, up, (left + up) >> 1, paeth][y % 5]!;
      raw.push((value - predictor) & 255);
    });
  });
  expect(rows.every((r) => r.length === stride)).toBe(true);
  const chunk = (type: string, body: Buffer): Buffer => {
    const out = Buffer.alloc(12 + body.length);
    out.writeUInt32BE(body.length, 0); out.write(type, 4, 'latin1'); body.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + body.length)), 8 + body.length);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(rows.length, 4); header[8] = 8; header[9] = colorType;
  const z = deflateSync(Buffer.from(raw));
  // Two IDAT chunks, to cover a split stream.
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', z.subarray(0, 5)), chunk('IDAT', z.subarray(5)), chunk('IEND', Buffer.alloc(0))]);
}

it('decodes every PNG filter type, several IDAT chunks, and RGB / gray inputs', () => {
  const rgb = Array.from({ length: 5 }, (_, y) => Array.from({ length: 12 }, (_, x) => (x * 23 + y * 71 + 5) & 255));
  const img = decodePng(filteredPng(2, 4, rgb));
  expect([img.width, img.height]).toEqual([4, 5]);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 4; x++) {
    expect(Array.from(img.data.slice((y * 4 + x) * 4, (y * 4 + x) * 4 + 4))).toEqual([rgb[y]![x * 3]!, rgb[y]![x * 3 + 1]!, rgb[y]![x * 3 + 2]!, 255]);
  }
  const grayRows = Array.from({ length: 5 }, (_, y) => Array.from({ length: 6 }, (_, x) => (x * 41 + y * 13) & 255));
  const gray = decodePng(filteredPng(4, 3, grayRows));
  for (let y = 0; y < 5; y++) expect(Array.from(gray.data.slice(y * 12 + 4, y * 12 + 8))).toEqual([grayRows[y]![2]!, grayRows[y]![2]!, grayRows[y]![2]!, grayRows[y]![3]!]); // gray + alpha, second pixel
  const plain = decodePng(filteredPng(0, 3, Array.from({ length: 5 }, (_, y) => Array.from({ length: 3 }, (_, x) => 10 * y + x))));
  expect(Array.from(plain.data.slice(4, 8))).toEqual([1, 1, 1, 255]);
  // Near miss: a corrupted filter byte is rejected rather than decoded as garbage.
  const broken = filteredPng(2, 4, rgb);
  expect(() => decodePng(broken.subarray(0, broken.length - 30))).toThrow();
});

it('parses page state from raw JSON and from the Playwright MCP result wrapper', () => {
  const state = { url: 'https://example.com/x', title: 'T', text: 'Hello', forms: [{ label: 'Qty', value: '2' }, { label: 5, value: 'bad' }] };
  const raw = JSON.stringify(state);
  expect(parsePageState(raw)).toEqual({ url: 'https://example.com/x', title: 'T', text: 'Hello', forms: [{ label: 'Qty', value: '2' }] });
  const wrapped = `### Result\n${JSON.stringify(raw)}\n### Ran Playwright code\n\`\`\`js\nawait page.evaluate(...)\n\`\`\`\n`;
  expect(parsePageState(wrapped)?.text).toBe('Hello');
  expect(parsePageState('### Result\n"just a string"\n### Ran Playwright code')).toBeNull();
  expect(parsePageState('### Result\nundefined\n')).toBeNull();
  expect(parsePageState('plain text')).toBeNull();
  expect(parsePageState(JSON.stringify({ url: 'u' }))).toBeNull();
});

it('reads text and rendered form values in the page, skipping hidden, password and unrendered controls', async () => {
  const p = await browser.newPage();
  try {
    await p.setContent(`<title>Cart</title><h1>Your cart</h1>
      <label for="q">Quantity</label><input id="q" value="2">
      <input type="hidden" name="csrf" value="zzz"><input type="password" name="pw" value="secret"><input type="submit" value="Go">
      <select aria-label="Size"><option>S</option><option selected>Large</option></select>
      <label><input type="checkbox" name="gift" checked> Gift wrap</label><label><input type="radio" name="r"> Express</label>
      <input placeholder="Coupon code" value="SAVE5"><input name="ghost" style="display:none" value="nope">
      <textarea name="note">hello   world</textarea>`);
    const state = parsePageState(await p.evaluate(`(${PAGE_STATE_FUNCTION})()`))!;
    expect(state.title).toBe('Cart');
    expect(state.text).toContain('Your cart');
    expect(state.forms).toEqual([
      { label: 'Quantity', value: '2' }, { label: 'Size', value: 'Large' }, { label: 'Gift wrap', value: 'checked' },
      { label: 'Express', value: 'unchecked' }, { label: 'Coupon code', value: 'SAVE5' }, { label: 'note', value: 'hello world' },
    ]);
    const labels = state.forms.map((f) => f.label).join(',');
    for (const hidden of ['csrf', 'pw', 'ghost']) expect(labels).not.toContain(hidden);
    expect(JSON.stringify(state)).not.toContain('secret');
    // The text is capped.
    await p.setContent(`<body>${'word '.repeat(20_000)}</body>`);
    expect(parsePageState(await p.evaluate(`(${PAGE_STATE_FUNCTION})()`))!.text.length).toBeLessThanOrEqual(FINAL_TEXT_CAP);
  } finally { await p.close(); }
});

it('packs evidence frames: ids, file names, text caps, forms only on the final frame', () => {
  const png = encodePng({ width: 4, height: 4, data: new Uint8Array(64).fill(7) });
  const frame = (step: number, value: number, over: Partial<CapturedFrame> = {}): CapturedFrame =>
    ({ step, url: `https://example.com/${value}`, text: 'x'.repeat(40_000), forms: [{ label: 'a', value: 'b' }], png, thumb: thumb(value), ...over });
  const { sidecar, pngs } = packEvidence([frame(1, 10), frame(1, 50), frame(12, 90), frame(12, 130, { final: true })], 'run', 42);
  expect(sidecar.frames.map((f) => [f.id, f.file, f.step, !!f.final])).toEqual([
    ['F1', 'run.step-01.png', 1, false], ['F2', 'run.step-01-b.png', 1, false], ['F3', 'run.step-12.png', 12, false], ['F4', 'run.final.png', 12, true],
  ]);
  expect(pngs.map((p) => p.file)).toEqual(sidecar.frames.map((f) => f.file));
  expect(sidecar.frames[0]!.text).toHaveLength(STEP_TEXT_CAP);
  expect(sidecar.frames[3]!.text).toHaveLength(FINAL_TEXT_CAP);
  expect(sidecar.frames[0]!.forms).toBeUndefined();
  expect(sidecar.frames[3]!.forms).toEqual([{ label: 'a', value: 'b' }]);
  expect(sidecar).toMatchObject({ captured: 4, kept: 4, captureMs: 42 });
  // Near-duplicates are dropped before naming; without a final capture nothing is marked final.
  const noFinal = packEvidence([frame(1, 10), frame(2, 10), frame(3, 80)], 'run', 0);
  expect(noFinal.sidecar.frames.map((f) => [f.file, !!f.final])).toEqual([['run.step-01.png', false], ['run.step-03.png', false]]);
  expect(noFinal.sidecar).toMatchObject({ captured: 3, kept: 2 });
  // A frame with an undecodable PNG is not built; unparseable page state still yields a frame.
  expect(toCapturedFrame(Buffer.from('junk'), null, 1)).toBeNull();
  expect(toCapturedFrame(png, 'junk', 1)).toMatchObject({ url: '', text: '', forms: [] });
  expect(toCapturedFrame(png, JSON.stringify({ url: 'https://example.com/', title: '', text: 'hi', forms: [] }), 2, true)).toMatchObject({ url: 'https://example.com/', text: 'hi', final: true });
});

// A stand-in MCP server: answers initialize and tools/call, counts initializes, and prints a non-JSON line.
const FAKE_MCP = `
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
let inits = 0;
require('readline').createInterface({ input: process.stdin }).on('line', (line) => {
  let m; try { m = JSON.parse(line); } catch { return; }
  if (m.method === 'initialize') { inits++; out({ jsonrpc: '2.0', id: m.id, result: { protocolVersion: '2025-03-26' } }); process.stdout.write('plain log line\\n'); }
  else if (m.method === 'tools/call') setTimeout(() => out({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: m.params.name === 'inits' ? String(inits) : 'echo:' + m.params.name }] } }), 15);
});`;

async function withProxy<T>(body: (ctx: { proxy: ReturnType<typeof createMcpProxy>; connect: () => Promise<{ send: (line: string) => void; lines: string[]; settle: (n: number) => Promise<void> }> }) => Promise<T>): Promise<T> {
  const child = spawn(process.execPath, ['-e', FAKE_MCP], { stdio: ['pipe', 'pipe', 'inherit'] });
  const proxy = createMcpProxy({ stdin: child.stdin, stdout: child.stdout });
  const server = net.createServer((sock) => proxy.attach(sock));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  const sockets: net.Socket[] = [];
  const connect = async () => {
    const sock = net.connect(port, '127.0.0.1');
    sockets.push(sock);
    await new Promise((resolve) => sock.once('connect', resolve));
    const lines: string[] = [];
    let buffer = '';
    sock.setEncoding('utf8');
    sock.on('data', (chunk: string) => { buffer += chunk; const parts = buffer.split('\n'); buffer = parts.pop()!; lines.push(...parts); });
    const settle = async (n: number): Promise<void> => { for (let i = 0; i < 100 && lines.length < n; i++) await new Promise((resolve) => setTimeout(resolve, 20)); };
    return { send: (line: string) => { sock.write(line); }, lines, settle };
  };
  try { return await body({ proxy, connect }); } finally {
    for (const sock of sockets) sock.destroy();
    server.close();
    child.kill('SIGKILL');
  }
}

it('proxy: the agent only sees its own traffic, the harness reuses the agent session, and results are counted', async () => {
  await withProxy(async ({ proxy, connect }) => {
    const counts: number[] = [];
    proxy.onToolResult((n) => counts.push(n));
    const agent = await connect();
    agent.send('{"jsonrpc":"2.0","id":0,"method":"initialize","params":{}}\n');
    agent.send('{"jsonrpc":"2.0","method":"notifications/initialized"}\n');
    await agent.settle(2); // the server's answer and its log line
    // A request split across writes, with a harness call in the middle, must reach the server as one whole line.
    agent.send('{"jsonrpc":"2.0","id":1,"method":"tools/call",');
    const harness = proxy.call('tools/call', { name: 'inits', arguments: {} });
    agent.send('"params":{"name":"click"}}\n');
    agent.send('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"type"}}\n');
    const result = await harness;
    expect(result.content[0].text).toBe('1'); // the server was initialized once: by the agent
    await agent.settle(4);
    const messages = agent.lines.map((l) => { try { return JSON.parse(l); } catch { return l; } });
    expect(messages.filter((m) => typeof m === 'object').map((m) => m.id).sort()).toEqual([0, 1, 2]);
    expect(messages).toContain('plain log line'); // non-JSON output passes through unchanged
    expect(agent.lines.join('\n')).not.toContain('__bench_');
    expect(counts).toEqual([1, 2]); // only agent tools/call responses, not initialize or harness calls
    expect((await proxy.call('tools/call', { name: 'inits', arguments: {} })).content[0].text).toBe('1');
    expect(counts).toEqual([1, 2]);
  });
});

it('proxy: initializes the server for the harness only when the agent never did, and only once', async () => {
  await withProxy(async ({ proxy }) => {
    expect((await proxy.call('tools/call', { name: 'inits', arguments: {} })).content[0].text).toBe('1');
    expect((await proxy.call('tools/call', { name: 'inits', arguments: {} })).content[0].text).toBe('1');
    await expect(proxy.call('tools/call', { name: 'slow', arguments: {} }, 1)).rejects.toThrow(/timed out/);
  });
});
