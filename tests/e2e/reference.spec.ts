import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// M15.9: the three quick-reference pages render their tables, have no sideways scroll at 360 px, are axe
// clean in both themes, are linked from the handbook index and are found by search.
const PAGES = [
  { path: '/reference/units/', title: 'Units and conversions', table: 'units-table', rows: 9 },
  { path: '/reference/where-to-read/', title: 'Where to read each number', table: 'read-table', rows: 17 },
  { path: '/reference/checklist/', title: 'Pre-submit checklist', table: null, rows: 11 },
];

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('quick reference', () => {
  for (const p of PAGES) {
    test(`${p.path}: renders, no horizontal scroll at 360 px, axe clean in light and dark`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(p.path);
      await expect(page.locator('h1')).toHaveText(p.title);
      if (p.table) await expect(page.getByTestId(p.table).locator('tbody tr')).toHaveCount(p.rows);
      else await expect(page.locator('.ref-check')).toHaveCount(p.rows);
      expect(await noOverflow(page)).toBe(true);
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme });
        const r = await new AxeBuilder({ page }).analyze();
        expect(r.violations, scheme).toEqual([]);
      }
    });
  }

  test('units: values come from the constants, and the KSPACING row is 2π r', async ({ page }) => {
    await page.goto('/reference/units/');
    const units = page.getByTestId('units-table');
    await expect(units.locator('tr', { hasText: '1 Hartree' })).toContainText('27.2114 eV');
    await expect(units.locator('tr', { hasText: '1 eV/Å³' })).toContainText('160.218 GPa');
    await expect(page.getByTestId('kspacing-table').locator('tr', { hasText: /^0\.03/ })).toContainText(
      '0.188496',
    );
  });

  test('checklist: rule ids carry the rule title', async ({ page }) => {
    await page.goto('/reference/checklist/');
    await expect(page.locator('code[data-rule="V028"]').first()).toHaveAttribute(
      'title',
      /Hybrid functional/,
    );
  });

  test('the handbook index links all three pages', async ({ page }) => {
    await page.goto('/handbook/');
    for (const p of PAGES) await expect(page.locator(`a[href="${p.path}"]`)).toHaveCount(1);
  });

  test('search finds the checklist page', async ({ page }) => {
    await page.goto('/');
    const btn = page.getByRole('button', { name: 'Menu' });
    if ((await btn.isVisible()) && (await btn.getAttribute('aria-expanded')) === 'false') await btn.click();
    await page.getByRole('searchbox', { name: 'Search the handbook' }).fill('Pre-submit checklist');
    await expect(
      page.locator('[data-search-results] a[href*="/reference/checklist/"]').first(),
    ).toBeVisible();
  });
});
