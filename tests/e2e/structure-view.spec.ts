import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const NACL = `Rock salt NaCl
1.0
5.64 0 0
0 5.64 0
0 0 5.64
Na Cl
4 4
Direct
0 0 0
0.5 0.5 0
0.5 0 0.5
0 0.5 0.5
0.5 0 0
0 0.5 0
0 0 0.5
0.5 0.5 0.5
`;
const A = 5.64;
const FRAC = NACL.split('\n')
  .slice(8, 16)
  .map((l) => l.split(' ').map(Number));

/** Minimum-image distance computed here, without code from src/ (cubic cell). */
const dist = (i: number, j: number): number => {
  const d = [0, 1, 2].map((k) => {
    const x = FRAC[j]![k]! - FRAC[i]![k]!;
    return (x - Math.round(x)) * A;
  });
  return Math.hypot(d[0]!, d[1]!, d[2]!);
};

async function ready(page: Page) {
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}

test.describe('structure view', () => {
  test('Input Builder shows the loaded POSCAR; a distance is measured by keyboard only', async ({ page }) => {
    await page.goto('/tools/input-builder/');
    await ready(page);
    await page.getByLabel('POSCAR text').fill(NACL);
    const view = page.locator('[data-structure-view]').first();
    await expect(view.getByTestId('ib-sv-summary')).toContainText('NaCl');
    await expect(view.getByTestId('ib-sv-summary')).toContainText('8 atoms');
    await view.getByRole('checkbox', { name: 'Measure mode' }).focus();
    await page.keyboard.press('Space');
    await view.locator('#ib-sv-site-0').focus();
    await page.keyboard.press('Enter');
    await view.locator('#ib-sv-site-4').focus();
    await page.keyboard.press('Enter');
    await expect(view.getByTestId('ib-sv-readout')).toContainText(`${dist(0, 4).toFixed(4)} Å`);
    await view.locator('#ib-sv-site-6').focus();
    await page.keyboard.press('Enter');
    await expect(view.getByTestId('ib-sv-readout')).toContainText('Angle Na1-Cl5-Cl7');
  });

  test('a minimum image is used across the cell boundary', async ({ page }) => {
    await page.goto('/tools/input-builder/');
    await ready(page);
    await page.getByLabel('POSCAR text').fill(NACL.replace('0.5 0.5 0.5\n', '0.95 0.5 0.5\n'));
    const view = page.locator('[data-structure-view]').first();
    await view.getByRole('checkbox', { name: 'Measure mode' }).check();
    await view.locator('#ib-sv-site-0').click();
    await view.locator('#ib-sv-site-7').click();
    const d = Math.hypot(0.05 * A, 0.5 * A, 0.5 * A);
    await expect(view.getByTestId('ib-sv-readout')).toContainText(`${d.toFixed(4)} Å`);
  });

  test('file explorer: focusing an atom line highlights the atom, and the reverse', async ({ page }) => {
    await page.goto('/design/structure-demo/');
    await ready(page);
    const fx = page.locator('.fx').first();
    const lines = fx.getByRole('list', { name: 'POSCAR lines' });
    // atom 3 is on file line 11 (8 header lines: comment, scale, 3 lattice, species, counts, Direct)
    await lines.getByRole('button', { name: /Line 11:/ }).focus();
    await expect(fx.locator('tr.is-sel')).toContainText('Na');
    await expect(fx.locator('[id$="-site-2"]')).toHaveAttribute('aria-pressed', 'true');
    await fx.locator('[id$="-site-5"]').click();
    await expect(fx.locator('[data-atom-line="true"]')).toHaveCount(1);
    await expect(fx.locator('[data-atom-line="true"]')).toContainText('0 0.5 0');
  });

  test('a page with two views has one live canvas, and axe is clean', async ({ page }) => {
    await page.goto('/design/structure-demo/');
    await ready(page);
    const views = page.locator('.fx .scene');
    await expect(views).toHaveCount(2);
    await views.nth(0).getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await views.nth(1).getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(r.violations).toEqual([]);
  });

  test('k-path tool shows the real-space cell of the standardized cell', async ({ page }) => {
    await page.goto('/tools/kpath/');
    await ready(page);
    await page.getByLabel('A POSCAR or CIF file').check();
    await page.getByLabel('POSCAR or CIF text').fill(NACL);
    await expect(page.getByRole('heading', { name: 'Your cell in real space' })).toBeVisible();
    await expect(page.getByTestId('kp-sv-summary')).toContainText('NaCl');
  });
});
