import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = '/design/molecule-check/';

async function open(page: import('@playwright/test').Page) {
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}

test.describe('molecule check', () => {
  test('RDKit is not downloaded until the user asks for molecule work', async ({ page }) => {
    const rdkit: string[] = [];
    page.on('request', (r) => /RDKit_minimal|rdkit\.worker/.test(r.url()) && rdkit.push(r.url()));
    await open(page);
    await page.waitForTimeout(500);
    expect(rdkit).toEqual([]);
    await page.getByRole('button', { name: 'Check molecule' }).click();
    const dd = (l: string) => page.locator('dt', { hasText: l }).locator('xpath=following-sibling::dd[1]');
    await expect(dd('Canonical SMILES')).toHaveText('CCO', { timeout: 30_000 });
    await expect(dd('2D layout')).toHaveText('CoordGen');
    await expect(page.getByRole('img', { name: '2D drawing of CCO' })).toBeVisible();
    expect(rdkit.filter((u) => u.endsWith('.wasm'))).toHaveLength(1);
  });

  test('pentavalent carbon is rejected with B012 and an explanation', async ({ page }) => {
    await open(page);
    await page.getByLabel('SMILES or MOL block').fill('C(C)(C)(C)(C)C');
    await page.getByRole('button', { name: 'Check molecule' }).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('B012', { timeout: 30_000 });
    await expect(alert).toContainText('neutral carbon has four');
  });

  test('rough 3D geometry: labelled, XYZ with hydrogens, POSCAR in a box; no axe violations; 360 px', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page);
    await page.getByRole('button', { name: 'Rough 3D geometry' }).click();
    await expect(
      page.getByText('Rough starting geometry for DFT, not a quantum-chemical optimization.'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Heuristic/ })).toBeVisible();
    const xyz = await page.getByLabel('XYZ').inputValue();
    expect(xyz.split('\n')[0]).toBe('9');
    const poscar = await page.getByLabel(/POSCAR/).inputValue();
    expect(poscar).toMatch(/\nDirect\n/);
    await expect(page.getByText(/ISIF = 2/)).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(360);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
  });
});
