import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('tolerance-factor explorer', () => {
  test('computes SrTiO3 and NdCuO3 (CN 12 and CN 9), axe clean, no overflow', async ({ page }) => {
    await page.goto('/tools/tolerance-factor/');
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);

    // Default SrTiO3 -> t = 1.0016
    await expect(page.locator('[data-factor="t"] .tf-metric')).toHaveText('1.0016');

    // Switch to NdCuO3 (Cu3+ LS)
    await page.getByRole('button', { name: 'NdCuO3 (Cu3+ LS)' }).click();
    await expect(page.getByText(/uncommon oxidation state/i)).toBeVisible();
    const policy = page.getByLabel('A-site coordination policy');
    await expect(policy).toBeVisible();

    // Switch policy to CN 9 -> t = 0.9342
    await policy.selectOption('cn9');
    await expect(page.locator('[data-factor="t"] .tf-metric')).toHaveText('0.9342');

    // Keyboard periodic table selection on A site
    await page.getByRole('button', { name: /Pick element for A site occupant 1/i }).click();
    const search = page.getByLabel(/Filter elements/i);
    await search.fill('Ba');
    await page
      .getByRole('button', { name: /Barium, Ba/i })
      .first()
      .click();
    await expect(page.locator('[data-factor="t"] .tf-metric')).not.toHaveText('0.9342');

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
