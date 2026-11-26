import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// M15.3: keyboard path and axe for the Material Builder (crystal mode is DFT Studio, M10.5 molecule mode).
// The project runs at 360 px (mobile-360) and desktop; each test also checks there is no sideways scroll.
const URL = '/builder/';

async function open(page: Page) {
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// Crystal mode is DFT Studio in a same-origin frame (D-100); the frame's own keyboard and checks are tested here.
const studio = (page: Page) => page.frameLocator('iframe.mb-studio-frame');
const atomCount = (page: Page) =>
  page
    .frames()
    .find((f) => f.url().includes('/dft-studio/'))!
    .evaluate(
      () =>
        (window as unknown as { VESTA: { getStructure(): { atoms: unknown[] } } }).VESTA.getStructure().atoms
          .length,
    );

test.describe('material builder: crystal mode (DFT Studio)', () => {
  test('keyboard: supercell, undo and redo shortcuts, structure checks; no overflow; axe clean', async ({
    page,
  }) => {
    await open(page);
    const f = studio(page);
    await f.locator('html[data-studio-ready="true"]').waitFor();
    await expect.poll(() => atomCount(page)).toBe(8);

    // On narrow frames the workbench is a drawer that starts closed; open it from the header with the keyboard.
    if (!(await f.locator('#right-workbench').isVisible())) {
      await f.locator('#btn-toggle-right').focus();
      await page.keyboard.press('Enter');
    }
    await f.locator('#sc-na').fill('2');
    await f.locator('#sc-nb').fill('2');
    await f.locator('#sc-nc').fill('2');
    await f.locator('#btn-apply-supercell').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => atomCount(page)).toBe(64);

    // Focus stays on the Apply button (outside a text field), where Studio's shortcuts apply.
    await page.keyboard.press('Control+z');
    await expect.poll(() => atomCount(page)).toBe(8);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => atomCount(page)).toBe(64);

    // The site's B001 to B012 checks run on every change and show in the header badge and the Checks tab.
    await expect(f.locator('#site-checks-count')).toHaveText('0');
    await f.locator('#btn-site-checks').focus();
    await page.keyboard.press('Enter');
    await expect(f.locator('#checks-summary')).toContainText(/all clear|^0 error/);

    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('the handbook templates are in the structure menu', async ({ page }) => {
    await open(page);
    const f = studio(page);
    await f.locator('html[data-studio-ready="true"]').waitFor();
    await f.locator('#sample-select').selectOption('site:perovskite');
    await expect.poll(() => atomCount(page)).toBe(5);
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
