import { afterAll, beforeAll, expect, it } from 'vitest';
import { chromium } from 'playwright';
import type { Browser, Page } from 'playwright';
import { startFixtures } from '../bench/fixtures.js';
import { TASKS } from '../bench/agent/tasks.js';

const task = TASKS.find((entry) => entry.id === 'form-subscribe')!;
let browser: Browser;
let fixtures: Awaited<ReturnType<typeof startFixtures>>;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
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
