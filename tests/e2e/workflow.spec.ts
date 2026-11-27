// D-110: the Workflow section. Renders, has the step card and the protocol quote, links back and forth,
// opens the Input Builder on the right preset, and passes axe in both themes.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
}

test.describe('workflow index', () => {
  test('shows the map with every step, the version line and the revisions', async ({ page }) => {
    await page.goto('/workflow/');
    await expect(page.locator('h1')).toHaveText('Workflow');
    const steps = page.locator('.wf-map a');
    expect(await steps.count()).toBe(16);
    await expect(page.locator('.topic-meta')).toContainText(/Version \d+, revised/);
    await expect(page.locator('#revisions li').first()).toContainText('Version');
  });

  test('is in the main navigation', async ({ page }) => {
    await page.goto('/workflow/');
    const link = page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Workflow' });
    await expect(link).toHaveAttribute('aria-current', 'page');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds no violations in the ${theme} theme`, async ({ page }) => {
      await page.goto('/workflow/');
      await setTheme(page, theme);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});

test.describe('workflow step', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workflow/relaxation/');
  });

  test('has the step card, the protocol quote, the INCAR, the checklist and a matching TOC', async ({
    page,
  }) => {
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.wf-stepcard')).toContainText('01_relax/');
    await expect(page.locator('#protocol blockquote')).toContainText('1.3 of Enmax');
    await expect(page.locator('#inputs')).toContainText('IBRION');
    await expect(page.locator('#before-you-submit')).toBeVisible();
    const ids = await page.locator('section.topic-section').evaluateAll((els) => els.map((e) => e.id));
    const links = await page
      .locator('nav[aria-label="On this page"] a')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(links).toEqual(ids.map((i) => `#${i}`));
  });

  test('previous and next follow the workflow order', async ({ page }) => {
    const nav = page.getByRole('navigation', { name: 'Previous and next step' });
    await expect(nav.getByRole('link').first()).toHaveAttribute('href', '/workflow/convergence-tests/');
    await expect(nav.getByRole('link').last()).toHaveAttribute('href', '/workflow/static-scf/');
  });

  test('"Open in the Input Builder" opens that task and variant', async ({ page }) => {
    await page.goto('/workflow/band-structure/');
    const link = page.locator('a[href="/tools/input-builder/?preset=band&variant=route-b"]').first();
    await link.click();
    await expect(page).toHaveURL(/\/tools\/input-builder\/\?preset=band&variant=route-b/);
    await page.locator('.ib-stepcard button', { hasText: 'Task' }).click();
    await expect(page.locator('#ib-preset')).toHaveValue('band');
    await expect(page.locator('#ib-variant')).toHaveValue('route-b');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds no violations in the ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('no horizontal scroll at 360 px', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/workflow/phonons/');
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
  });
});
