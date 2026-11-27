import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const TOPIC = '/handbook/00-start/how-to-use-this-site/';

test.describe('command palette', () => {
  test('Ctrl+K opens it, encut lists the tag card and a topic, Enter navigates', async ({ page }) => {
    await page.goto(TOPIC);
    await page.keyboard.press('Control+k');
    const box = page.getByRole('combobox', { name: 'Command palette' });
    await expect(box).toBeFocused();
    await box.fill('encut');
    const options = page.getByRole('option');
    await expect(options.filter({ hasText: /^ENCUT/ }).first()).toBeVisible();
    await expect(options.filter({ hasText: '[tags]' }).first()).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/tools\/input-builder\/\?tag=ENCUT/);
    await expect(page.getByText('ENCUT').first()).toBeVisible();
  });

  test('arrow keys move the selection and Escape returns focus to the trigger', async ({ page }) => {
    await page.goto('/');
    const trigger = page.locator('[data-palette-open]');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const box = page.getByRole('combobox', { name: 'Command palette' });
    await expect(box).toBeFocused();
    await expect(page.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(box).toHaveAttribute('aria-activedescendant', /palette-opt-1/);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('/theme dark switches the theme and /level pro the level', async ({ page }) => {
    await page.goto('/about/');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').fill('/theme dark');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').fill('/level pro');
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('data-level', 'pro');
  });

  test('"/" opens it outside text fields but types normally inside the search box', async ({
    page,
    isMobile,
  }) => {
    test.skip(!!isMobile, 'shortcut test');
    await page.goto('/about/');
    await page.getByRole('searchbox').focus();
    await page.keyboard.type('a/b');
    await expect(page.getByRole('searchbox')).toHaveValue('a/b');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);
    await page.locator('main').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('/');
    await expect(page.getByRole('combobox', { name: 'Command palette' })).toBeFocused();
  });

  test('unknown slash text falls back to a text-search row', async ({ page }) => {
    await page.goto('/about/');
    await page.keyboard.press('Control+k');
    await page.getByRole('combobox').fill('/zzzqq');
    await expect(page.getByRole('option').last()).toContainText('Search the handbook text');
  });

  test('is lazy: no palette chunk or index request before the first open', async ({ page }) => {
    const seen: string[] = [];
    page.on('request', (r) => seen.push(r.url()));
    await page.goto('/about/');
    await page.waitForLoadState('networkidle');
    expect(seen.filter((u) => /palette|commands\.v1/.test(u))).toEqual([]);
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('combobox')).toBeVisible();
    await expect.poll(() => seen.some((u) => /commands\.v1\.json/.test(u))).toBe(true);
  });

  test('works at the viewport width of the project and passes axe in both themes', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await page.addInitScript(
        (t) => localStorage.setItem('dft:theme', JSON.stringify({ v: 1, data: t })),
        theme,
      );
      await page.goto('/');
      await page.locator('[data-palette-open]').click();
      await page.getByRole('combobox').fill('conv');
      await expect(page.getByRole('option').first()).toBeVisible();
      const box = await page.getByRole('dialog', { name: 'Command palette' }).boundingBox();
      const vw = page.viewportSize()!.width;
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations, JSON.stringify(r.violations.map((v) => v.id))).toEqual([]);
    }
  });
});

test.describe('status line', () => {
  test('shows level, theme, modules and network, and each item opens its control', async ({ page }) => {
    await page.goto(TOPIC);
    const line = page.getByRole('complementary', { name: 'Status' });
    await expect(line).toContainText('level');
    await expect(line).toContainText('modules');
    await expect(line).toContainText('online');
    await line.getByRole('button', { name: /theme/ }).click();
    await expect(page.locator('[data-theme-toggle]')).toBeFocused();
    await line.getByRole('button', { name: /modules/ }).click();
    await expect(page.locator('#progress-pop')).toBeVisible();
  });
});

test('landing page is a session: prompt line and starting points', async ({ page }) => {
  await page.goto('/');
  // four groups (Study, Build, Calculate, Plan and review) of four feature cards each
  await expect(page.getByRole('navigation', { name: 'Starting points' }).getByRole('link')).toHaveCount(16);
  await expect(page.locator('main [data-palette-open]')).toHaveCount(1);
  await page.locator('[data-palette-open]').click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});
