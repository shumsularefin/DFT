import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = '/design/scenes/';

async function open(page: Page) {
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const scene = (page: Page, id: string) => page.locator(`[data-demo-scene="${id}"]`);
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations).toEqual([]);
}

test.describe('scene library', () => {
  test('shows SVG first and requests no three.js until "View in 3D"', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', (r) => r.url().endsWith('.js') && scripts.push(r.url()));
    await open(page);
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(scene(page, 'fcc').locator('svg.scene-svg')).toBeVisible();
    for (const url of scripts)
      expect(await (await page.request.get(url)).text(), url).not.toContain('WebGLRenderer');
    const before = scripts.length;
    await scene(page, 'fcc').getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(scripts.length).toBeGreaterThan(before);
  });

  test('3D: arrow keys rotate, R resets; a second scene takes over the single canvas', async ({ page }) => {
    await open(page);
    const a = scene(page, 'sc');
    await a.getByRole('button', { name: 'View in 3D' }).click();
    const view = a.getByRole('group', { name: /3D view\. Arrow keys rotate/ });
    await expect(view).toBeVisible();
    await view.focus();
    const home = await view.getAttribute('data-camera');
    await page.keyboard.press('ArrowRight');
    expect(await view.getAttribute('data-camera')).not.toBe(home);
    await page.keyboard.press('r');
    expect(await view.getAttribute('data-camera')).toBe(home);
    await scene(page, 'bcc').getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(a.locator('canvas')).toHaveCount(0);
    await expect(a.locator('svg.scene-svg')).toBeVisible();
  });

  test('flat view turns with the keyboard and resets', async ({ page }) => {
    await open(page);
    const flat = scene(page, 'diamond').getByRole('group', { name: /Flat view/ });
    await flat.focus();
    const home = await flat.getAttribute('data-view');
    await page.keyboard.press('ArrowLeft');
    expect(await flat.getAttribute('data-view')).not.toBe(home);
    await page.keyboard.press('r');
    expect(await flat.getAttribute('data-view')).toBe(home);
  });

  test('steps are discrete and change the picture', async ({ page }) => {
    await open(page);
    const s = scene(page, 'perovskite-octahedra');
    await expect(s.getByText('Step 1 of 3')).toBeVisible();
    const polys = () => s.locator('svg.scene-svg polygon.sc-accent').count();
    expect(await polys()).toBe(0);
    await s.getByRole('button', { name: 'Next step' }).click();
    await expect(s.getByText('Step 2 of 3')).toBeVisible();
    expect(await polys()).toBeGreaterThan(0);
    await expect(s.getByRole('button', { name: 'Previous step' })).toBeEnabled();
  });

  test('magnetic scene: up and down differ by head shape and sign', async ({ page }) => {
    await open(page);
    const svg = scene(page, 'afm-g').locator('svg.scene-svg');
    await expect(svg.locator('polygon.sc-open').first()).toBeAttached();
    await expect(svg.locator('text', { hasText: '+' }).first()).toBeAttached();
    await expect(svg.locator('text', { hasText: '−' }).first()).toBeAttached();
  });

  test('without WebGL the SVG and the text description remain', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (/webgl/i.test(type)) return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
      } as never;
    });
    await open(page);
    const s = scene(page, 'rocksalt');
    await s.getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(s.locator('svg.scene-svg')).toBeVisible();
    await expect(s.getByText(/cannot draw 3D/)).toBeVisible();
    await s.getByText('Text description').click();
    await expect(s.getByText(/sodium and chlorine atoms alternate/)).toBeVisible();
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`axe clean in ${scheme}, flat and 3D`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await open(page);
      await axe(page);
      await scene(page, 'afm-a').getByRole('button', { name: 'View in 3D' }).click();
      await expect(page.locator('canvas')).toHaveCount(1);
      await axe(page);
    });
  }

  test('static SVG at the top of the page needs no island', async ({ page }) => {
    await open(page);
    const fig = page.locator('figure[data-static="true"]');
    await expect(fig.locator('svg')).toBeVisible();
    await expect(fig.getByRole('button')).toHaveCount(0);
  });

  test('fits at 360 px with no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await open(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
