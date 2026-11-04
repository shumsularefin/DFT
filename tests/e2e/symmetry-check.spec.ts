import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = '/design/symmetry-check/';

async function open(page: import('@playwright/test').Page) {
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}

test.describe('symmetry check', () => {
  test('the engine is not downloaded until the button is pressed', async ({ page }) => {
    const wasm: string[] = [];
    page.on('request', (r) => r.url().endsWith('.wasm') && wasm.push(r.url()));
    await open(page);
    await page.waitForTimeout(500);
    expect(wasm).toEqual([]);
    await page.getByRole('button', { name: 'Find symmetry' }).click();
    await expect(page.getByText('Your cell was rewritten as the standard primitive cell')).toBeVisible();
    expect(wasm.length).toBe(1);
  });

  test('fcc Cu: space group 225, 4 atoms to 1, matrix shown', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Find symmetry' }).click();
    const dd = (l: string) => page.locator('dt', { hasText: l }).locator('xpath=following-sibling::dd[1]');
    await expect(dd('Space group')).toContainText('number 225');
    await expect(dd('Atoms per cell')).toHaveText('4 to 1');
    await expect(dd('Symmetry operations')).toHaveText('192');
    await expect(page.getByText('4 atoms became 1')).toBeVisible();
    await expect(page.getByRole('table', { name: /Transformation matrix/ })).toBeVisible();
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
  });

  test('a broken file gives a plain message with a line number', async ({ page }) => {
    await open(page);
    await page.getByLabel(/Structure text/).fill("data_x\n_cell_length_a 'oops\n");
    await page.getByRole('button', { name: 'Find symmetry' }).click();
    await expect(page.getByRole('alert')).toContainText('line 2');
  });

  test('partial occupancy is explained', async ({ page }) => {
    await open(page);
    const txt = (await page.getByLabel(/Structure text/).inputValue())
      .replace('Cu 0 0 0', 'Cu 0 0 0 0.5')
      .replace('_atom_site_fract_z', '_atom_site_fract_z\n_atom_site_occupancy');
    await page.getByLabel(/Structure text/).fill(txt);
    await page.getByRole('button', { name: 'Find symmetry' }).click();
    await expect(page.getByRole('alert')).toContainText('ordered');
  });
});
