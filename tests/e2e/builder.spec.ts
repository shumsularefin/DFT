import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// M15.3: keyboard path and axe for the Material Builder. Crystal mode (/builder/) is the Studio workspace,
// hosted natively in the page (D-105); molecule mode (M10.5) is its own page, /builder/molecule/.
// Each test also checks there is no sideways scroll.
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function openCrystal(page: Page) {
  await page.goto('/builder/');
  await page.locator('html[data-studio-ready="true"]').waitFor({ timeout: 30_000 });
}
const atomCount = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { VESTA: { getStructure(): { atoms: unknown[] } } }).VESTA.getStructure().atoms
        .length,
  );

test.describe('material builder: crystal mode', () => {
  test('keyboard: supercell, undo and redo shortcuts, structure checks; no overflow; axe clean', async ({
    page,
  }) => {
    test.setTimeout(90_000); // the workspace boots three.js and the editor
    await openCrystal(page);
    // Native, not framed: the workspace is part of the page.
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect.poll(() => atomCount(page)).toBe(8);

    // On narrow workspaces the workbench is a drawer that starts closed; open it from the toolbar with the keyboard.
    if (!(await page.locator('#right-workbench').isVisible())) {
      await page.locator('#btn-toggle-right').focus();
      await page.keyboard.press('Enter');
    }
    await page.locator('#sc-na').fill('2');
    await page.locator('#sc-nb').fill('2');
    await page.locator('#sc-nc').fill('2');
    await page.locator('#btn-apply-supercell').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => atomCount(page)).toBe(64);

    // Focus stays on the Apply button (outside a text field), where the workspace shortcuts apply.
    await page.keyboard.press('Control+z');
    await expect.poll(() => atomCount(page)).toBe(8);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => atomCount(page)).toBe(64);

    // The site's B001 to B012 checks run on every change and show in the toolbar badge and the Checks tab.
    await expect(page.locator('#site-checks-count')).toHaveText('0');
    await page.locator('#btn-site-checks').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#checks-summary')).toContainText(/all clear|^0 error/);

    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // The whole page, shell and workspace; every step and tab is axe tested in builder-studio.spec.ts.
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('the handbook templates are in the structure menu', async ({ page }) => {
    await openCrystal(page);
    await page.locator('#sample-select').selectOption('site:perovskite');
    await expect.poll(() => atomCount(page)).toBe(5);
  });

  test('Crystal | Molecule links join the two modes', async ({ page }) => {
    await openCrystal(page);
    const modes = page.getByRole('navigation', { name: 'Builder mode' });
    await expect(modes.getByRole('link', { name: 'Crystal' })).toHaveAttribute('aria-current', 'page');
    await modes.getByRole('link', { name: 'Molecule' }).click();
    await page.waitForURL('**/builder/molecule/');
    const back = page.getByRole('navigation', { name: 'Builder mode' });
    await expect(back.getByRole('link', { name: 'Molecule' })).toHaveAttribute('aria-current', 'page');
    await expect(back.getByRole('link', { name: 'Crystal' })).toHaveAttribute('href', '/builder/');
  });
});

test.describe('material builder: molecule mode', () => {
  test('keyboard: add an atom from the toolbar, undo with the button; no overflow; axe clean', async ({
    page,
  }) => {
    await page.goto('/builder/molecule/');
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
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
