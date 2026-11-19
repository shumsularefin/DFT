import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const N = 14;

async function open(page: Page, hash = '') {
  await page.goto(`/learn/${hash}`);
  await expect(page.getByRole('heading', { name: 'Guided path', level: 1 })).toBeVisible();
  await expect(page.locator('astro-island[ssr]')).toHaveCount(0);
  await expect(page.getByTestId('lp-visual')).toBeVisible();
}
const count = (page: Page) => page.locator('canvas').count();

test.describe('guided path (M12.4)', () => {
  test('runs end to end by keyboard and marks the path complete', async ({ page }) => {
    await open(page);
    await expect(page.getByText(`Station 1 of ${N}`)).toBeVisible();
    await page.getByRole('button', { name: 'Next station' }).focus();
    for (let i = 2; i <= N; i++) {
      await page.keyboard.press('ArrowRight');
      await expect(page.getByText(`Station ${i} of ${N}`)).toBeVisible();
      // every station has a badge, a go-deeper link and a text description
      await expect(page.locator('.badge').first()).toBeVisible();
      await expect(page.getByRole('link', { name: /Go deeper/ })).toHaveAttribute(
        'href',
        /^\/handbook\/.+\/$/,
      );
    }
    await expect(page.getByText('That is the whole route')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(page.getByText(`Station 1 of ${N}`)).toBeVisible();
    const done = await page.evaluate(() => localStorage.getItem('dft:progress') ?? '');
    expect(done + (await page.evaluate(() => JSON.stringify({ ...localStorage })))).toContain('learn/path');
  });

  test('the try-this controls change the picture', async ({ page }) => {
    await open(page, '#scf-loop');
    await expect(page.getByText(`Station 6 of ${N}`)).toBeVisible();
    const svg = page.locator('.lp-plot-svg');
    await expect(svg.locator('svg')).toBeVisible();
    const before = await svg.innerHTML();
    await page.getByRole('slider', { name: 'Mixing fraction' }).press('End');
    await expect.poll(async () => svg.innerHTML()).not.toBe(before);
    await page.getByRole('button', { name: 'Station 7: The crystal and its unit cell' }).click();
    await page.getByRole('radio', { name: 'Diamond' }).check();
    await expect(page.locator('[data-scene-id="diamond"]')).toBeVisible();
  });

  test('only one WebGL canvas exists, and only after "View in 3D"', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', (r) => r.url().endsWith('.js') && scripts.push(r.url()));
    await open(page, '#unit-cell');
    expect(await count(page)).toBe(0);
    for (const u of scripts)
      expect(await (await page.request.get(u)).text(), u).not.toContain('WebGLRenderer');
    await page.getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByRole('button', { name: 'Next station' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByRole('button', { name: 'Station 5: The Kohn-Sham idea' }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Station 8: Periodic images' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('without WebGL the flat pictures remain', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (/webgl/i.test(type)) return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
      } as typeof orig;
    });
    await open(page, '#unit-cell');
    await page.getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.getByText(/cannot draw 3D/)).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.locator('.scene-flat svg')).toBeVisible();
  });

  test('is axe clean on a plot station and a scene station, at 360 px with no sideways scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page, '#kohn-sham');
    await expect(page.locator('.lp-plot-svg svg')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Station 13: Spin up and down, and magnetic orderings' }).click();
    await expect(page.locator('.scene-flat svg')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
