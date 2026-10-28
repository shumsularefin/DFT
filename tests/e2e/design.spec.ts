import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function setTheme(page: Page, theme: 'light' | 'dark') {
  const name = page.locator('#theme-name');
  // The default theme sets no attribute, so always go through the button to make the choice explicit.
  const clicks = (await name.textContent()) === theme ? 2 : 1;
  for (let i = 0; i < clicks; i++) await page.locator('#theme-switch').click();
  await expect(name).toHaveText(theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test.describe('design gallery', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/design/');
    await page.waitForFunction(() => document.querySelector('[data-tabs][data-ready]'));
    await page.waitForSelector('.slider input');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds no violations in the ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('360 px: no horizontal scroll', async ({ page }) => {
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
  });

  test('tabs: arrow keys, Home and End move selection and focus', async ({ page }) => {
    const tabs = page.getByRole('tab');
    await tabs.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'KPOINTS' })).toBeVisible();
    await page.keyboard.press('End');
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.nth(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(tabs.first()).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('tabindex', '-1');
  });

  test('slider: keyboard changes the value and the readout follows', async ({ page }) => {
    const slider = page.getByRole('slider', { name: 'Energy cutoff' });
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(slider).toHaveValue('540');
    await expect(page.locator('.slider-value')).toHaveText('540 eV');
    await page.keyboard.press('Home');
    await expect(slider).toHaveValue('200');
    await page.keyboard.press('End');
    await expect(slider).toHaveValue('800');
  });

  test('toggle and disclosure work from the keyboard', async ({ page }) => {
    const sw = page.getByRole('switch', { name: /Spin polarised/ });
    await sw.focus();
    await page.keyboard.press('Space');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    const summary = page.getByText('Why does this matter?');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details.disclosure')).toHaveAttribute('open', '');
  });

  test('copy button copies the raw code', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permissions are chromium specific');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const block = page.locator('[data-codeblock]').first();
    await block.getByRole('button', { name: 'Copy' }).click();
    await expect(block.getByRole('button')).toHaveText('Copied');
    const text = await page.evaluate(() => navigator.clipboard.readText());
    expect(text).toContain('ENCUT  = 520');
    expect(text).not.toContain('<-');
  });

  test('button has a visible focus ring', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Primary' });
    await btn.focus();
    await page.keyboard.press('Shift+Tab');
    await btn.focus();
    const outline = await btn.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });
});
