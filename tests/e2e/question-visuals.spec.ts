import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TOPIC = '/handbook/02-quantum-basics/particle-in-a-box/';

async function openCheck(page: Page) {
  await page.goto(TOPIC);
  await page.locator('astro-island:not([ssr]) [data-testid="check"]').waitFor();
  await page.getByTestId('check').scrollIntoViewIfNeeded();
}

test.describe('question visuals (M12.3)', () => {
  test('a topic check shows a picture with a caption and a text description', async ({ page }) => {
    await openCheck(page);
    const fig = page.getByTestId('qc-figure').first();
    await expect(fig).toBeVisible();
    await expect(fig.locator('svg[role="img"]')).toBeVisible();
    await expect(fig.locator('figcaption')).not.toBeEmpty();
    await fig.getByText('Text description').click();
    await expect(fig.locator('.scene-alt')).toContainText(/\w{10,}/);
  });

  test('no horizontal scroll and no serious axe violations', async ({ page }) => {
    await openCheck(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
    const res = await new AxeBuilder({ page }).include('[data-testid="check"]').analyze();
    expect(res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
  });

  test('practice shows a figure', async ({ page }) => {
    await page.goto('/practice/');
    await page.getByRole('button', { name: 'Start a short session' }).click();
    const suggestion = page.getByRole('button', { name: 'Try a question on it' });
    if (await suggestion.isVisible()) await suggestion.click();
    const fig = page.getByTestId('qc-figure');
    await expect(page.locator('[data-question]').first()).toBeVisible();
    // the pictures load after the page, and a few meta questions have none
    for (let i = 0; i < 8; i++) {
      try {
        await fig.first().waitFor({ timeout: 4000 });
        break;
      } catch {
        await page.getByRole('button', { name: 'I am not sure' }).click();
        await page.getByRole('button', { name: 'Next question' }).click();
      }
    }
    await expect(fig.first()).toBeVisible({ timeout: 15000 });
  });

  test('a crystal question opens its 3D scene from the keyboard', async ({ page }) => {
    await page.goto('/handbook/01-why-dft/why-simulate-materials/');
    await page.locator('astro-island:not([ssr]) [data-testid="check"]').waitFor();
    const card = page.locator('[data-question="q-why-sim-2"]');
    // the check shows one question at a time: move on until the crystal question is shown
    for (let i = 0; i < 14 && !(await card.count()); i++) {
      await page.getByRole('button', { name: /not sure/i }).click();
      await page
        .getByRole('button', { name: /Next|Skip|Continue/ })
        .first()
        .click();
    }
    const btn = card.getByRole('button', { name: /View in 3D/ });
    await expect(btn).toBeVisible();
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(card.locator('canvas, .scene-controls').first()).toBeAttached({ timeout: 20000 });
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('the static list keeps the picture', async ({ page }) => {
      await page.goto(TOPIC);
      await expect(page.locator('.qc-figure-static svg').first()).toBeAttached();
    });
  });
});
