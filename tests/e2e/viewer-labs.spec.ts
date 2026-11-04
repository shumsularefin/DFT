import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const LABS = [
  { name: 'Brillouin zone viewer', url: '/design/brillouin-lab/' },
  { name: 'Unit cell viewer', url: '/design/unit-cell-lab/' },
];

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).analyze();
  expect(r.violations).toEqual([]);
}
const camera = (page: Page) => page.locator('[data-camera]').first().getAttribute('data-camera');

for (const lab of LABS) {
  test.describe(lab.name, () => {
    test('starts 3D on request; three is not in the initial JavaScript', async ({ page }) => {
      const scripts: string[] = [];
      page.on('response', (r) => r.url().endsWith('.js') && scripts.push(r.url()));
      await open(page, lab.url);
      await expect(page.locator('canvas')).toHaveCount(0);
      for (const url of scripts)
        expect(await (await page.request.get(url)).text(), url).not.toContain('WebGLRenderer');
      await page.getByRole('button', { name: 'Start 3D view' }).click();
      await expect(page.locator('canvas')).toHaveCount(1);
      await axe(page);
      await page.getByRole('button', { name: 'Close 3D view' }).click();
      await expect(page.locator('canvas')).toHaveCount(0);
    });

    test('keyboard: arrows rotate, plus and minus zoom, R resets', async ({ page }) => {
      await open(page, lab.url);
      await page.getByRole('button', { name: 'Start 3D view' }).click();
      const view = page.getByRole('group', { name: /3D view\. Arrow keys rotate/ });
      await expect(view).toBeVisible();
      await view.focus();
      await expect.poll(() => camera(page)).not.toBeNull();
      const home = await camera(page);
      await page.keyboard.press('ArrowRight');
      const turned = await camera(page);
      expect(turned).not.toBe(home);
      await page.keyboard.press('+');
      expect(await camera(page)).not.toBe(turned);
      await page.keyboard.press('r');
      expect(await camera(page)).toBe(home);
    });

    test('without WebGL a flat view with sliders and dashed hidden edges appears', async ({ page }) => {
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
      await open(page, lab.url);
      const start = page.getByRole('button', { name: 'Start 3D view' });
      if (await start.count()) await start.click();
      await expect(page.locator('canvas')).toHaveCount(0);
      const svg = page.getByRole('img', { name: /Flat view/ }).first();
      await expect(svg).toBeVisible();
      await expect(svg.locator('line[data-hidden="true"]').first()).toHaveAttribute('stroke-dasharray', /.+/);
      const before = await svg.innerHTML();
      await page.getByLabel('Turn around the vertical axis').first().fill('100');
      expect(await svg.innerHTML()).not.toBe(before);
      await axe(page);
    });

    test('axe clean in light and dark', async ({ page }) => {
      await open(page, lab.url);
      await axe(page);
      await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
      await axe(page);
    });

    test('no horizontal scroll at 360 px', async ({ page }, info) => {
      test.skip(info.project.name !== 'mobile-360');
      await open(page, lab.url);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    });
  });
}

test('Brillouin zone: fcc zone readouts and a computed path', async ({ page }) => {
  await open(page, '/design/brillouin-lab/');
  const ro = (l: string) => page.locator('dt', { hasText: l }).locator('xpath=following-sibling::dd[1]');
  await expect(ro('Zone vertices')).toHaveText('24');
  await expect(ro('Zone faces')).toHaveText('14');
  await page.getByRole('button', { name: 'Compute k-path' }).click();
  await expect(ro('k-path')).toContainText('Γ', { timeout: 30000 });
});

test('Unit cell: conventional fcc shows 14 atoms drawn from 4', async ({ page }) => {
  await open(page, '/design/unit-cell-lab/');
  const ro = (l: string) => page.locator('dt', { hasText: l }).locator('xpath=following-sibling::dd[1]');
  await expect(ro('Atoms in the cell')).toHaveText('4');
  await expect(ro('Atoms drawn')).toHaveText('14');
});
