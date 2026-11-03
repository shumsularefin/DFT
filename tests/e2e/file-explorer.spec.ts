import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = '/design/explorer-demo/';

test.describe('file explorer', () => {
  test('click opens an explanation; Escape closes and returns focus', async ({ page }) => {
    await page.goto(URL);
    const poscar = page.getByRole('list', { name: 'POSCAR lines' });
    await poscar.getByRole('button', { name: /Line 2: Scaling factor/ }).click();
    await expect(page.getByRole('region', { name: 'Explanation for POSCAR' })).toContainText(
      'Scaling factor',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Explanation for POSCAR' })).toContainText(
      'Choose a highlighted line',
    );
    await expect(poscar.getByRole('button', { name: /Line 2:/ })).toBeFocused();
  });

  test('arrow keys move between annotated lines and Enter opens', async ({ page }) => {
    await page.goto(URL);
    const poscar = page.getByRole('list', { name: 'POSCAR lines' });
    await poscar.getByRole('button', { name: /Line 1:/ }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(poscar.getByRole('button', { name: /Line 2:/ })).toBeFocused();
    await page.keyboard.press('End');
    await expect(poscar.getByRole('button', { name: /Line 9:/ })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(poscar.getByRole('button', { name: /Line 9:/ })).toHaveAttribute('aria-expanded', 'true');
  });

  test('INCAR: known tag has a tag card, unknown tag is flagged', async ({ page }) => {
    await page.goto(URL);
    const incar = page.getByRole('list', { name: 'INCAR lines' });
    await incar.getByRole('button', { name: /Line 2: ENCUT/ }).click();
    await page.getByText('Full tag card for ENCUT').click();
    await expect(page.getByText('Why this value').first()).toBeVisible();
    await incar.getByRole('button', { name: /Line 5: FOOBAR/ }).click();
    await expect(page.getByText(/not in the handbook tag database/)).toBeVisible();
  });

  test('POTCAR panel lists header fields and no numbers', async ({ page }) => {
    await page.goto(URL);
    const panel = page.getByRole('region', { name: /Inside a POTCAR header/ });
    await expect(panel.getByText('ZVAL', { exact: true })).toBeVisible();
    await expect(panel.getByText('LEXCH', { exact: true })).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe clean and no horizontal scroll, ${theme}`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('dft:theme', JSON.stringify({ v: 1, data: t }));
      }, theme);
      await page.goto(URL);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      await page
        .getByRole('list', { name: 'INCAR lines' })
        .getByRole('button', { name: /Line 5/ })
        .click();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
