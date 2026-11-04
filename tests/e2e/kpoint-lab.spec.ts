import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = '/design/kpoint-lab/';

async function open(page: Page) {
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations).toEqual([]);
}
const readout = (page: Page, label: string) =>
  page.locator('dt', { hasText: label }).locator('xpath=following-sibling::dd[1]');

test.describe('k-point mesh lab', () => {
  test('fcc Cu 6x6x6 Gamma-centred gives 16 irreducible points (spglib golden) and the mesh is symmetric', async ({
    page,
  }) => {
    await open(page);
    await expect(readout(page, 'Total points')).toHaveText('216');
    await expect(readout(page, 'Irreducible points')).toHaveText('16');
    await expect(readout(page, 'Lattice symmetry operations')).toHaveText('48');
    await expect(readout(page, 'Mesh has the lattice symmetry')).toHaveText('yes');
  });

  test('even Monkhorst-Pack on fcc gives 28 points and shows the Q-017 explanation', async ({ page }) => {
    await open(page);
    await page.getByRole('switch', { name: /Monkhorst-Pack instead/ }).click();
    await expect(readout(page, 'Irreducible points')).toHaveText('28');
    await expect(readout(page, 'Mesh has the lattice symmetry')).toHaveText('no');
    await expect(page.getByText(/Q-017/)).toBeVisible();
  });

  test('a smaller mesh changes the counts', async ({ page }) => {
    await open(page);
    await page.getByLabel('Divisions n1').fill('4');
    await expect(readout(page, 'Total points')).toHaveText('64');
    await expect(readout(page, 'Irreducible points')).toHaveText('8');
  });

  test('toy panel shows the metal and insulator errors with the Toy model badge', async ({ page }) => {
    await open(page);
    await expect(
      page.getByRole('img', { name: /Error of the occupied-band energy against mesh size/ }),
    ).toBeVisible();
    await expect(page.getByText('At N = 24 the error is')).toBeVisible();
    await expect(page.getByText('Toy model').first()).toBeVisible();
    await page.getByText('Show the numbers').click();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('3D starts with one canvas and closes; three is not in the initial JavaScript', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', (r) => r.url().endsWith('.js') && scripts.push(r.url()));
    await open(page);
    await expect(page.locator('canvas')).toHaveCount(0);
    for (const url of scripts)
      expect(await (await page.request.get(url)).text(), url).not.toContain('WebGLRenderer');
    await page.getByRole('button', { name: 'Start 3D view' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await axe(page);
    await page.getByRole('button', { name: 'Close 3D view' }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('axe clean in light and dark', async ({ page }) => {
    await open(page);
    await axe(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await axe(page);
  });

  test('no horizontal scroll at 360 px', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-360');
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
