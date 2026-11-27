import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

type Opt = { text: string; correct: boolean };
type Q = { id: string; type: string; options?: Opt[]; answer?: number; hints: string[]; concepts: string[] };
const BANK: Q[] = JSON.parse(fs.readFileSync('src/data/questions/module-02.json', 'utf8'));
const box = ['q-box-1', 'q-box-2', 'q-box-3', 'q-box-4', 'q-box-5', 'q-box-6'].map(
  (id) => BANK.find((q) => q.id === id) as Q,
);
const TOPIC = '/handbook/02-quantum-basics/particle-in-a-box/';

async function ready(page: Page) {
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
async function openCheck(page: Page) {
  await page.goto(TOPIC);
  // the Check island hydrates when the browser is idle
  await page.locator('astro-island:not([ssr]) [data-testid="check"]').waitFor();
  await page.getByTestId('check').scrollIntoViewIfNeeded();
}
/** Answer the open question correctly, reading the right answer from the bank file. */
async function answerRight(page: Page, q: Q) {
  const card = page.locator(`[data-question="${q.id}"]`);
  if (q.type === 'numeric') {
    await card.getByLabel(/Your answer/).fill(String(q.answer));
  } else {
    const right = (q.options as Opt[]).find((o) => o.correct) as Opt;
    await card.locator('.qc-opt', { hasText: right.text }).locator('input').check();
  }
  await card.getByRole('button', { name: 'Check my answer' }).click();
  await expect(card.getByTestId('qc-result')).toContainText('Correct.');
}

test.describe('check at the end of a topic', () => {
  test('answers, explains every option, offers hints and "I am not sure"', async ({ page }) => {
    await openCheck(page);
    const q1 = box[0] as Q;
    const card = page.locator(`[data-question="${q1.id}"]`);
    await expect(page.getByText('Question 1 of 6')).toBeVisible();
    // a wrong answer first: explanations for every option, in text
    const wrong = (q1.options as Opt[]).find((o) => !o.correct) as Opt;
    await card.locator('.qc-opt', { hasText: wrong.text }).locator('input').check();
    await card.getByRole('button', { name: 'Show a hint (1 of 2)' }).click();
    await expect(card.getByRole('list', { name: 'Hints' })).toContainText(q1.hints[0] as string);
    await card.getByRole('button', { name: 'Check my answer' }).click();
    await expect(card.getByTestId('qc-result')).toContainText('Not quite.');
    await expect(card.locator('.qc-why')).toHaveCount((q1.options as Opt[]).length);
    await expect(card.locator('.qc-why', { hasText: 'Correct option' })).toHaveCount(1);
    await expect(card.locator('.qc-why', { hasText: '(your choice)' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Next question' }).click();
    // "I am not sure" is a first-class path
    const card2 = page.locator(`[data-question="${(box[1] as Q).id}"]`);
    await card2.getByRole('button', { name: 'I am not sure' }).click();
    await expect(card2.getByTestId('qc-result')).toContainText('Not sure is fine');
    await expect(card2.locator('.qc-why')).toHaveCount(((box[1] as Q).options as Opt[]).length);
  });

  test('can be done with the keyboard alone', async ({ page }) => {
    await openCheck(page);
    const q1 = box[0] as Q;
    const card = page.locator(`[data-question="${q1.id}"]`);
    const idx = (q1.options as Opt[]).findIndex((o) => o.correct);
    await card.getByRole('radio').first().focus();
    for (let i = 0; i < idx; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    await card.getByRole('button', { name: 'Check my answer' }).focus();
    await page.keyboard.press('Enter');
    await expect(card.getByTestId('qc-result')).toContainText('Correct.');
    await expect(card.getByTestId('qc-result')).toBeFocused();
  });

  test('mastery rises, the topic completes, and the map shows it by shape and text', async ({ page }) => {
    await openCheck(page);
    for (let i = 0; i < box.length; i++) {
      await answerRight(page, box[i] as Q);
      await page
        .getByRole('button', { name: i + 1 < box.length ? 'Next question' : 'See where you are' })
        .click();
    }
    const summary = page.getByTestId('check-summary');
    await expect(summary).toContainText('You got 6 of 6');
    await expect(summary).toContainText('mastered');
    await expect(summary).toContainText('marked complete');
    await expect(page.getByRole('button', { name: /Completed/ })).toBeVisible();
    await page.goto('/progress/');
    await ready(page);
    const node = page.locator('.map-node[data-concept="quantization-box"]');
    await expect(node).toHaveAttribute('data-state', 'mastered');
    await expect(node).toHaveAttribute('aria-label', /mastered$/);
    await expect(page.locator('li[data-concept="quantization-box"] .map-state')).toHaveText(' (mastered)');
    await expect(page.locator('[data-map-summary]')).toContainText('1 mastered');
    await expect(page.getByTestId('answers')).toContainText('answered 6 questions');
    await expect(page.getByTestId('milestones')).toContainText('Reached: Answered your first question');
  });

  test('works with storage blocked, and says so', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new Error('blocked');
        },
      });
    });
    await openCheck(page);
    await expect(page.getByText('blocking storage')).toBeVisible();
    await answerRight(page, box[0] as Q);
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  test('the questions are a list with the answers hidden in details', async ({ page }) => {
    await page.goto(TOPIC);
    const list = page.locator('.check-static > li');
    await expect(list).toHaveCount(6);
    await expect(list.first().locator('details')).not.toHaveAttribute('open', '');
  });
});

test.describe('practice page', () => {
  test('a short session explains its choice and schedules a review a few days later', async ({ page }) => {
    await page.clock.install({ time: new Date('2026-06-10T10:00:00') });
    await page.goto('/practice/');
    await ready(page);
    await expect(page.getByTestId('due-count')).toContainText('Nothing is due');
    await page.getByRole('button', { name: 'Start a short session' }).click();
    const first = page.getByRole('button', { name: 'Try a question on it' });
    if (await first.isVisible()) await first.click();
    await expect(page.getByTestId('why')).toContainText('Why this item');
    // answer "I am not sure" so the question is due the next day
    await page.getByRole('button', { name: 'I am not sure' }).click();
    await expect(page.getByTestId('qc-result')).toContainText('Not sure is fine');
    await page.getByRole('button', { name: 'Stop for now' }).first().click();
    await expect(page.getByTestId('session-summary')).toContainText('You answered 1');
    await page.clock.setSystemTime(new Date('2026-06-13T10:00:00'));
    await page.reload();
    await ready(page);
    await expect(page.getByTestId('due-count')).toContainText('1 question is due for review');
  });

  test('a session ends after ten answers', async ({ page }) => {
    await page.goto('/practice/');
    await ready(page);
    await page.getByRole('button', { name: 'Start a short session' }).click();
    for (let i = 0; i < 10; i++) {
      // a suggestion card may come first; take its question
      const suggestion = page.getByRole('button', { name: 'Try a question on it' });
      if (await suggestion.isVisible()) await suggestion.click();
      await page.getByRole('button', { name: 'I am not sure' }).click();
      if (i < 9) await page.getByRole('button', { name: 'Next question' }).click();
    }
    await expect(page.getByRole('button', { name: 'Next question' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Finish the session' }).click();
    await expect(page.getByTestId('session-summary')).toContainText('You answered 10');
  });
});

test.describe('progress page data controls', () => {
  test('export, erase with confirmation, and import', async ({ page }) => {
    await openCheck(page);
    await answerRight(page, box[0] as Q);
    await page.goto('/progress/');
    await ready(page);
    await expect(page.getByTestId('answers')).toContainText('answered 1 question');
    await expect(page.getByTestId('streak')).toContainText('Practice run: 1 day');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export as JSON' }).click(),
    ]);
    const file = await download.path();
    const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(exported.format).toBe('dft-learner-export');
    expect(Object.keys(exported.learner.concepts)).toEqual(['quantization-box']);
    // erase needs a confirmation
    await page.getByRole('button', { name: 'Erase my progress' }).click();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('answers')).toContainText('answered 1 question');
    await page.getByRole('button', { name: 'Erase my progress' }).click();
    await page.getByRole('button', { name: 'Yes, erase everything' }).click();
    await expect(page.getByTestId('answers')).toContainText('No answers yet');
    // a bad file changes nothing
    await page.getByTestId('import-file').setInputFiles({
      name: 'bad.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"nope": true}'),
    });
    await expect(page.getByTestId('data-msg')).toContainText('Not imported');
    await expect(page.getByTestId('answers')).toContainText('No answers yet');
    await page.getByTestId('import-file').setInputFiles(file);
    await expect(page.getByTestId('data-msg')).toContainText('Imported');
    await expect(page.getByTestId('answers')).toContainText('answered 1 question');
  });

  test('the practice run can be hidden, and no guilt copy appears', async ({ page }) => {
    await openCheck(page);
    await answerRight(page, box[0] as Q);
    await page.goto('/progress/');
    await ready(page);
    await expect(page.getByTestId('streak')).toBeVisible();
    await page.getByLabel('Hide the practice run').check();
    await expect(page.getByTestId('streak')).toHaveCount(0);
    const text = (await page.locator('main').innerText()).toLowerCase();
    for (const bad of ['you lost', 'streak lost', 'don’t break', "don't break", 'leaderboard', 'hurry']) {
      expect(text).not.toContain(bad);
    }
  });

  test('the mastery map fits its width: no sideways scrollbar and every idea inside its row', async ({
    page,
  }) => {
    await page.goto('/progress/');
    await ready(page);
    const fits = () =>
      page
        .locator('[data-map-scroll]')
        .evaluate(
          (el) =>
            el.scrollWidth <= el.clientWidth &&
            [...el.querySelectorAll('.map-node')].every(
              (n) => n.getBoundingClientRect().right <= el.getBoundingClientRect().right + 1,
            ),
        );
    await expect.poll(fits).toBe(true);
    await page.setViewportSize({ width: 1100, height: 800 });
    await expect.poll(fits).toBe(true);
  });

  test('the map filter narrows both the map and the list', async ({ page }) => {
    await page.goto('/progress/');
    await ready(page);
    const all = await page.locator('.map-node').count();
    await page.getByLabel('Show').selectOption('2');
    const visible = await page.locator('.map-node:visible').count();
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(all);
    await expect(page.locator('[data-module-section]:visible')).toHaveCount(1);
  });
});

test.describe('accessibility and layout', () => {
  for (const path of ['/practice/', '/progress/', TOPIC]) {
    test(`axe clean and no horizontal scroll: ${path}`, async ({ page }) => {
      await page.goto(path);
      if (path === TOPIC) {
        await page.locator('astro-island:not([ssr]) [data-testid="check"]').waitFor();
        await page.getByTestId('check').scrollIntoViewIfNeeded();
      } else await ready(page);
      const r = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(r.violations).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  }
  test('axe clean mid-session (a question with its explanation open)', async ({ page }) => {
    await openCheck(page);
    await answerRight(page, box[0] as Q);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations).toEqual([]);
  });
});
