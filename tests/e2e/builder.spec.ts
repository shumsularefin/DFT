import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// M15.3: keyboard path and axe for the Material Builder (M10.4 crystal mode, M10.5 molecule mode).
// The project runs at 360 px (mobile-360) and desktop; each test also checks there is no sideways scroll.
const URL = '/builder/';

async function open(page: Page) {
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test.describe('material builder: crystal mode', () => {
  test('keyboard: supercell button, undo shortcut, help dialog; no overflow; axe clean', async ({ page }) => {
    await open(page);
    const summary = page.getByText(/^Summary:/);
    await expect(summary).toContainText('8 atoms');

    const button = page.getByRole('button', { name: '2x2x2 supercell' });
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(summary).toContainText('64 atoms');

    await page.keyboard.press('Control+z');
    await expect(summary).toContainText('8 atoms');
    await page.keyboard.press('Control+Shift+z');
    await expect(summary).toContainText('64 atoms');

    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('?');
    // The site-wide help dialog also answers to "?", so name the builder's own panel by its class.
    await expect(page.locator('.mb-panel[role="dialog"]')).toBeVisible();

    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('the template menu loads another structure', async ({ page }) => {
    await open(page);
    await page.getByLabel('Crystal template').selectOption('perovskite');
    await expect(page.getByText(/^Summary:/)).toContainText('5 atoms');
  });
});

test.describe('material builder: molecule mode', () => {
  test('keyboard: add an atom from the toolbar, undo with the button; no overflow; axe clean', async ({
    page,
  }) => {
    await open(page);
    await page.getByRole('tab', { name: /Molecule mode/ }).click();
    const toolbar = page.getByRole('toolbar', { name: 'Molecule editing operations' });
    await expect(toolbar).toBeVisible();
    const summary = page.getByText(/heavy\/explicit atom/);
    await expect(summary).toBeVisible();
    const before = await summary.innerText();

    const add = toolbar.getByRole('button', { name: /^Add .* \(keyboard\)$/ });
    await add.focus();
    await page.keyboard.press('Enter');
    await expect(summary).not.toHaveText(before);

    await toolbar.getByRole('button', { name: 'Undo' }).focus();
    await page.keyboard.press('Enter');
    await expect(summary).toHaveText(before);

    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
