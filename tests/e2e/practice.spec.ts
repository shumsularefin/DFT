import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TOPIC = '/handbook/02-quantum-basics/particle-in-a-box/';
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const learner = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('dft:learner') ?? 'null')?.data ?? null);

/** Answers the visible question: picks the first option or types 0 for numeric questions. */
async function answerVisible(page: Page) {
  const live = page.locator('[data-check-live], [data-practice-stage]').first();
  const option = live.locator('.quiz-option input').first();
  if (await option.count()) await option.check();
  else await live.getByLabel('Your answer').fill('0');
  await live.getByRole('button', { name: 'Check answer' }).click();
}

test.describe('topic check', () => {
  test('one question at a time, hints, explanations, mastery recorded, axe clean', async ({ page }) => {
    await page.goto(TOPIC);
    const check = page.locator('[data-check]');
    await check.scrollIntoViewIfNeeded();
    await expect(check.locator('.check-static')).toBeHidden();
    await expect(check.getByText('Question 1 of 6.')).toBeVisible();
    await check.getByRole('button', { name: /Show a hint \(2 left\)/ }).click();
    await expect(check.getByText(/^Hint 1:/)).toBeVisible();
    // "I am not sure" shows the answer and the explanations for every option
    await check.getByRole('button', { name: 'I am not sure' }).click();
    await expect(check.getByText('No problem, here is the answer.')).toBeVisible();
    await expect(check.locator('.quiz-explanations li')).not.toHaveCount(0);
    expect((await new AxeBuilder({ page }).include('[data-check]').analyze()).violations).toEqual([]);
    const s = await learner(page);
    expect(Object.keys(s.questions)).toHaveLength(1);
    expect(s.concepts['quantization-box'].pL).toBeLessThan(0.3);
    // finish the remaining five and reach the summary
    for (let i = 0; i < 5; i++) {
      await check.locator('.quiz-next').click();
      await answerVisible(page);
    }
    await check.getByRole('button', { name: 'See your summary' }).click();
    await expect(check.getByText(/You answered \d of 6 right\./)).toBeVisible();
    await expect(check.getByText(/quantization box: \d+ %/)).toBeVisible();
  });

  test('keyboard only: choose, check, next', async ({ page }) => {
    await page.goto('/handbook/02-quantum-basics/orbitals/');
    const check = page.locator('[data-check]');
    await check.locator('.quiz-option input').first().focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Check answer');
    await page.keyboard.press('Enter');
    await expect(check.locator('.quiz-feedback')).toBeFocused();
    await expect(check.locator('.quiz-verdict')).toBeVisible();
  });

  test('works without JavaScript as a static list', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(TOPIC);
    await expect(page.locator('.check-static > li')).toHaveCount(6);
    await page.locator('.check-static details summary', { hasText: 'Show the answer' }).first().click();
    await expect(page.locator('.check-static details[open]').first()).toContainText('Right');
    await ctx.close();
  });
});

test.describe('practice and progress', () => {
  test('a session runs, a wrong answer comes back for review after a day, axe clean', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-11-02T10:00:00Z') });
    await page.goto('/practice/');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await noOverflow(page)).toBe(true);
    await page.getByRole('button', { name: 'Start a session' }).click();
    const stage = page.locator('[data-practice-stage]');
    await expect(stage.getByText(/Item 1 of up to 10\./)).toBeVisible();
    // answer up to three items with "I am not sure" (skip reading suggestions)
    for (let i = 0; i < 3; i++) {
      const skip = stage.getByRole('button', { name: 'Skip, ask me a question' });
      if (await skip.isVisible()) await skip.click();
      await expect(stage.getByText(/Why this question:/)).toBeVisible();
      await stage.getByRole('button', { name: 'I am not sure' }).click();
      await stage.locator('.quiz-next').click();
    }
    await stage.getByRole('button', { name: 'Stop the session' }).click();
    await expect(page.locator('[data-practice-stats]')).toContainText('0 reviews due now');
    await page.clock.fastForward(97 * 3600 * 1000); // more than 3 days overdue, so the rail puts the review first
    await page.reload();
    await expect(page.locator('[data-practice-stats]')).toContainText(/[1-9]\d* reviews? due now/);
    await page.getByRole('button', { name: 'Start a session' }).click();
    await expect(stage.getByText(/Why this question: (due|overdue) for review/)).toBeVisible();
  });

  test('progress map shows states, export, import and reset', async ({ page }) => {
    await page.goto(TOPIC);
    await page.locator('[data-check]').getByRole('button', { name: 'I am not sure' }).click();
    await page.goto('/progress/');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await noOverflow(page)).toBe(true);
    const node = page.locator('[data-node="quantization-box"]');
    await expect(node).toHaveAttribute('data-state', 'learning');
    await expect(node).toHaveAccessibleName(/Quantized energy levels\s*In progress, \d+ %/);
    await expect(page.locator('[data-row="quantization-box"] [data-cell-state]')).toHaveText('In progress');
    await expect(page.locator('[data-streak]')).toContainText('1 day of practice');
    await expect(page.locator('[data-milestones]')).toContainText('First question answered: reached');

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export as JSON' }).click(),
    ]);
    const file = await download.path();

    await page.getByRole('button', { name: 'Reset all learning data' }).click();
    await page.getByRole('button', { name: 'Reset', exact: true }).click();
    await expect(page.locator('[data-data-status]')).toContainText('reset');
    await expect(node).toHaveAttribute('data-state', 'new');

    await page.locator('[data-import]').setInputFiles(file!);
    await expect(page.locator('[data-data-status]')).toContainText('Imported');
    await expect(node).toHaveAttribute('data-state', 'learning');

    await page
      .locator('[data-import]')
      .setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"x":1}') });
    await expect(page.locator('[data-data-status]')).toContainText('not a progress export');
  });

  test('module filter and hide streak', async ({ page }) => {
    await page.goto('/progress/');
    await page.getByRole('radio', { name: '2', exact: true }).check();
    await expect(page.locator('[data-node="simulation"]')).toBeHidden();
    await expect(page.locator('[data-node="orbital-shapes"]')).toBeVisible();
    await page.getByLabel('Hide the streak').check();
    await expect(page.locator('[data-streak]')).toBeHidden();
  });

  test('storage blocked: quiz still works for the session with a notice', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await page.goto(TOPIC);
    const check = page.locator('[data-check]');
    await check.getByRole('button', { name: 'I am not sure' }).click();
    for (let i = 0; i < 5; i++) {
      await check.locator('.quiz-next').click();
      await check.getByRole('button', { name: 'I am not sure' }).click();
    }
    await check.getByRole('button', { name: 'See your summary' }).click();
    await expect(check.getByText(/lasts only until you close the page/)).toBeVisible();
    await page.goto('/practice/');
    await expect(page.locator('[data-practice-notice]')).toContainText('blocks storage');
  });
});

test('without PUBLIC_FIREBASE_* the sync panel is absent and no Firebase code is requested', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/progress/');
  await expect(page.locator('[data-sync]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign in to sync' })).toHaveCount(0);
  expect(requests.filter((u) => /firebase|googleapis/.test(u))).toEqual([]);
});
