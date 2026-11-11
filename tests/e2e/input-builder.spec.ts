import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { unzipSync, strFromU8 } from 'fflate';

const CU = readFileSync('src/lib/crystal/__fixtures__/cu-fcc.vasp', 'utf8');
const HEX = `hcp Mg
1.0
3.21 0 0
-1.605 2.7798 0
0 0 5.21
Mg
2
Direct
0.3333333333 0.6666666667 0.25
0.6666666667 0.3333333333 0.75
`;
const URL = '/tools/input-builder/';

async function goStep(page: Page, name: string) {
  await page.getByRole('button', { name: new RegExp(`^\\d ${name}$`) }).click();
}

/** Text typed before the island hydrates is lost, so wait for hydration first. */
async function hydrated(page: Page) {
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}

async function loadStructure(page: Page, text: string) {
  await page.goto(URL);
  await hydrated(page);
  await page.getByLabel('POSCAR text').fill(text);
}

test.describe('input builder', () => {
  test('fcc Cu relax: ENCUT suggestion, no errors, zip has no POTCAR', async ({ page }) => {
    await loadStructure(page, CU);
    await goStep(page, 'Task');
    await page.getByLabel('What do you want to calculate?').selectOption('relax');
    await page.getByLabel(/^ENMAX in eV/).fill('400');
    await expect(page.getByText(/520/).first()).toBeVisible();
    await page.getByRole('button', { name: /Use 520 eV/ }).click();
    await goStep(page, 'Settings');
    await expect(page.getByLabel('Value of ENCUT')).toHaveValue('520');
    // The relax preset carries a 6-atom MAGMOM example; Cu has one atom and no moment.
    await page.getByRole('button', { name: 'Remove MAGMOM' }).click();
    await page.getByLabel('Value of ISPIN').fill('1');
    await goStep(page, 'Check');
    await expect(page.getByTestId('issue-summary')).toContainText('0 errors');
    await goStep(page, 'Job script');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download zip' }).click();
    const file = await (await dl).path();
    const files = unzipSync(new Uint8Array(readFileSync(file)));
    const names = Object.keys(files).sort();
    expect(names).toEqual(expect.arrayContaining(['INCAR', 'POSCAR', 'job.sh', 'README.txt']));
    expect(names.some((n) => /POTCAR$/i.test(n))).toBe(false);
    expect(strFromU8(files['INCAR']!)).toMatch(/ENCUT\s*=\s*520/);
  });

  test('hexagonal cell with an even Monkhorst-Pack mesh shows V029', async ({ page }) => {
    await loadStructure(page, HEX);
    await goStep(page, 'K-points');
    await page.getByLabel(/^Monkhorst-Pack mesh/).check();
    await goStep(page, 'Check');
    await expect(page.getByText(/V029/).first()).toBeVisible();
  });

  test('MAGMOM count that does not match the atoms shows V001 and the helper fixes it', async ({ page }) => {
    await loadStructure(page, CU);
    await goStep(page, 'Settings');
    await page.getByLabel('Value of MAGMOM').fill('1 2 3');
    await goStep(page, 'Check');
    await expect(page.getByText(/V001/).first()).toBeVisible();
    // The fix is the per-species helper in the Settings step.
    await goStep(page, 'Settings');
    await page.getByLabel(/^Moment for Cu/).fill('0.6');
    await page.getByRole('button', { name: 'Write MAGMOM' }).click();
    await expect(page.getByLabel('Value of MAGMOM')).toHaveValue('0.6');
    await goStep(page, 'Check');
    await expect(page.getByText(/V001/)).toHaveCount(0);
  });

  test('keyboard operation reaches every step', async ({ page }) => {
    await loadStructure(page, CU);
    await page.getByRole('button', { name: 'Next' }).focus();
    for (let i = 0; i < 5; i++) await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: /Job script/ })).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: /K-points/ })).toBeVisible();
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe clean on every step, ${theme} theme, no horizontal scroll`, async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('dft:theme', JSON.stringify({ v: 1, data: t }));
      }, theme);
      await loadStructure(page, CU);
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      for (const name of ['Structure', 'Task', 'Settings', 'Check', 'K-points', 'Job script']) {
        await goStep(page, name);
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations, name).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, name).toBeLessThanOrEqual(0);
      }
    });
  }
});
