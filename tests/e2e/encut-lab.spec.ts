import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = '/design/encut-lab/';

async function open(page: Page) {
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations).toEqual([]);
}
const setEncut = async (page: Page, v: number) => {
  await page.getByLabel('ENCUT (type a value, eV)').fill(String(v));
};

test.describe('ENCUT lab', () => {
  test('fcc Cu counts match the golden values and the estimate message is visible', async ({ page }) => {
    await open(page);
    await setEncut(page, 400);
    await expect(page.getByText('181 exact vs 213.7 estimate')).toBeVisible();
    await setEncut(page, 520);
    await expect(page.getByText('331 exact vs')).toBeVisible();
    await expect(page.getByText('not a runtime prediction')).toBeVisible();
  });

  test('toy curve appears with the Toy model badge', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('group', { name: 'Toy-model energy against ENCUT' })).toBeVisible();
    await expect(page.getByText('Toy model').first()).toBeVisible();
  });

  test('poscar input is parsed locally and bad input shows an error', async ({ page }) => {
    await open(page);
    await page.getByText('Use your own POSCAR cell').click();
    await page.getByLabel(/Paste a POSCAR/).fill('nonsense');
    await page.getByRole('button', { name: 'Use this cell' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('3D starts with one canvas and closes; three is not in the initial JavaScript', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', (r) => r.url().endsWith('.js') && scripts.push(r.url()));
    await open(page);
    await expect(page.locator('canvas')).toHaveCount(0);
    for (const url of scripts) {
      expect(await (await page.request.get(url)).text(), url).not.toContain('WebGLRenderer');
    }
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
