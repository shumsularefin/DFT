import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { unzipSync, strFromU8 } from 'fflate';

const CU = readFileSync('src/lib/crystal/__fixtures__/cu-fcc.vasp', 'utf8');
const URL = '/tools/input-builder/';

async function open(page: import('@playwright/test').Page) {
  await page.goto(URL);
  await page.getByRole('button', { name: 'Convergence series' }).click();
  await page.getByLabel('POSCAR text').fill(CU);
}

test.describe('convergence series panel', () => {
  test('ENMAX 400 gives 13 runs and a zip with the author layout, no POTCAR', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('button', { name: 'Download zip' })).toHaveCount(0);
    await page.getByLabel('Largest ENMAX in your POTCAR (eV)').fill('400');
    await expect(page.getByText(/13 runs \(limit 40\)/)).toBeVisible();
    await expect(page.getByLabel('Folder tree of the zip')).toContainText('encut_450/');
    await expect(page.getByLabel('Folder tree of the zip')).toContainText('kpt_0.025/');
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download zip' }).click();
    const files = unzipSync(new Uint8Array(readFileSync((await (await dl).path())!)));
    const names = Object.keys(files);
    expect(names).toEqual(
      expect.arrayContaining([
        'run_all.sh',
        'collect.sh',
        'make_potcar.sh',
        'README.txt',
        '00_conv/encut_400/INCAR',
      ]),
    );
    expect(names.some((n) => n.split('/').some((p) => /^potcar/i.test(p)))).toBe(false);
    expect(strFromU8(files['collect.sh']!)).toContain('energy  without entropy');
    expect(strFromU8(files['00_conv/kpt_0.02/INCAR']!)).toMatch(/ENCUT\s*=\s*520/);
  });

  test('explicit meshes and the 40-run limit', async ({ page }) => {
    await open(page);
    await page.getByLabel('Largest ENMAX in your POTCAR (eV)').fill('400');
    await page.getByLabel('k-mesh series from').selectOption('mesh');
    await page.getByLabel('Meshes, one per line').fill('4x4x4\n6x6x6');
    await expect(page.getByText(/9 runs/)).toBeVisible();
    const many = Array.from({ length: 35 }, (_, i) => `${i + 1}x${i + 1}x${i + 1}`).join('\n');
    await page.getByLabel('Meshes, one per line').fill(many);
    await expect(page.getByRole('alert').filter({ hasText: /too long/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download zip' })).toHaveCount(0);
  });

  test('keyboard operable and axe clean in both themes', async ({ page }) => {
    await open(page);
    await page.getByLabel('Largest ENMAX in your POTCAR (eV)').fill('400');
    await page.getByLabel('Largest ENMAX in your POTCAR (eV)').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Fixed ENCUT for the k-mesh runs (eV)')).toBeFocused();
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations, theme).toEqual([]);
    }
  });

  test('fits at 360 px without horizontal scroll', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-360', 'runs in the 360 px project');
    await open(page);
    await page.getByLabel('Largest ENMAX in your POTCAR (eV)').fill('400');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(wide).toBe(false);
  });
});
