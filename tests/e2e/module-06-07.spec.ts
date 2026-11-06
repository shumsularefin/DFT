import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  '06-vasp-files/poscar',
  '06-vasp-files/kpoints',
  '06-vasp-files/incar',
  '06-vasp-files/the-potcar-file',
  '06-vasp-files/output-files',
  '07-running/the-workflow',
  '07-running/job-scripts',
  '07-running/restarts-istart-icharg',
  '07-running/reading-oszicar-and-outcar',
  '07-running/vaspkit-in-practice',
];

async function ready(page: Page, url: string) {
  await page.goto(url);
  const islands = page.locator('astro-island');
  for (let i = 0; i < (await islands.count()); i++) await islands.nth(i).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('modules 6 and 7', () => {
  for (const t of PAGES) {
    test(`${t}: anatomy, no horizontal scroll, axe clean`, async ({ page }) => {
      await ready(page, `/handbook/${t}/`);
      const headings = await page.locator('article h2').allInnerTexts();
      expect(headings[0]).toBe('Why this matters');
      expect(headings.at(-1)).toBe('Go deeper');
      expect(await noOverflow(page)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }

  test("the protocol is quoted and marked as the author's", async ({ page }) => {
    await page.goto('/handbook/07-running/the-workflow/');
    await expect(page.getByText("The author's protocol").first()).toBeVisible();
    await expect(page.locator('blockquote')).toHaveCount(5);
    await expect(page.locator('blockquote').first()).toContainText(
      'Run relaxation with encut of 1.3 of Enmax.',
    );
  });

  test('output reader: golden OSZICAR gives two ionic steps with F and mag', async ({ page }) => {
    await ready(page, '/handbook/07-running/reading-oszicar-and-outcar/');
    const lab = page.locator('[data-lab-id="output-reader"]');
    await lab.getByLabel(/Open a file/).setInputFiles('tests/reference/vasp-outputs/OSZICAR_relax_spin');
    await expect(lab.locator('.lab-readout').filter({ hasText: 'File type' })).toContainText('OSZICAR');
    const rows = lab.locator('.or-table tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText('-23.459');
    await expect(rows.nth(1)).toContainText('-23.4601');
    await expect(rows.nth(1)).toContainText('1.9998');
    await expect(lab.locator('.or-banner')).toHaveCount(0);
  });

  test('output reader: OUTCAR example flags the force against EDIFFG and is labelled synthetic', async ({
    page,
  }) => {
    await ready(page, '/handbook/07-running/reading-oszicar-and-outcar/');
    const lab = page.locator('[data-lab-id="output-reader"]');
    await lab.getByRole('button', { name: 'Synthetic OUTCAR example' }).click();
    await expect(lab.locator('.or-banner')).toContainText('not the output of a real calculation');
    const force = lab.locator('.or-checks li').filter({ hasText: 'Largest force' });
    await expect(force).toContainText('Check this');
    await lab.getByLabel('EDIFFG of the run').fill('-0.05');
    await expect(force).toContainText('Looks healthy');
    await expect(lab.locator('.or-checks li').filter({ hasText: 'reached required accuracy' })).toContainText(
      'present',
    );
    expect(await noOverflow(page)).toBe(true);
  });
});
