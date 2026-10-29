import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const DEMO = '/design/lab-demo/';

/** Astro renders the island's HTML first; clicking before it hydrates does nothing, so wait for it. */
async function openDemo(page: Page, url = DEMO) {
  await page.goto(url);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}

async function axe(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

/** Count requestAnimationFrame calls so tests can tell a permanent loop from render-on-demand. */
async function countFrames(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __raf: number };
    w.__raf = 0;
    const orig = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) => {
      w.__raf++;
      return orig(cb);
    };
  });
}
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __raf: number }).__raf);

test.describe('lab framework demo', () => {
  test('poster first, axe clean, and three is not in the initial JavaScript', async ({ page }) => {
    const scripts: string[] = [];
    page.on('response', (r) => r.url().endsWith('.js') && scripts.push(r.url()));
    await openDemo(page);
    await expect(page.getByRole('button', { name: 'Start 3D view' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    for (const url of scripts) {
      const body = await (await page.request.get(url)).text();
      expect(body, url).not.toContain('WebGLRenderer');
    }
    await axe(page);
  });

  test('Start creates one canvas, the running state is axe clean, Close removes it', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Start 3D view' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await expect(page.getByText('View', { exact: true })).toBeVisible();
    await axe(page);
    await page.getByRole('button', { name: 'Close 3D view' }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Start 3D view' })).toBeVisible();
  });

  test('navigating away and back leaves a single canvas', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Start 3D view' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.goto('/design/');
    await page.goBack();
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start 3D view' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('opening and closing the view 20 times never leaves more than one canvas', async ({ page }) => {
    await openDemo(page);
    for (let i = 0; i < 20; i++) {
      await page.getByRole('button', { name: 'Start 3D view' }).click();
      await expect(page.locator('canvas')).toHaveCount(1);
      await page.getByRole('button', { name: 'Close 3D view' }).click();
      await expect(page.locator('canvas')).toHaveCount(0);
    }
  });

  test('keyboard: the start button is reachable and works with Enter', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'physical keyboard');
    await openDemo(page);
    await page.getByRole('button', { name: 'Start 3D view' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('render on demand: no animation frames while idle, a loop only while spinning', async ({ page }) => {
    await countFrames(page);
    await openDemo(page);
    await page.getByRole('button', { name: 'Start 3D view' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.waitForTimeout(500);
    const idle = await frames(page);
    await page.waitForTimeout(700);
    expect(await frames(page)).toBe(idle);

    await page.getByRole('switch', { name: /Spin/ }).click();
    await page.waitForTimeout(500);
    expect(await frames(page)).toBeGreaterThan(idle + 5);
    await page.getByRole('switch', { name: /Spin/ }).click();
    await page.waitForTimeout(300);
    const stopped = await frames(page);
    await page.waitForTimeout(500);
    expect(await frames(page)).toBe(stopped);
  });

  test.describe('reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('no continuous loop, a Step button replaces the spin switch', async ({ page }) => {
      await countFrames(page);
      await openDemo(page);
      await page.getByRole('button', { name: 'Start 3D view' }).click();
      await expect(page.locator('canvas')).toHaveCount(1);
      await expect(page.getByRole('switch', { name: /Spin/ })).toHaveCount(0);
      await page.waitForTimeout(500);
      const idle = await frames(page);
      await page.waitForTimeout(800);
      expect(await frames(page)).toBe(idle);
      const step = page.getByRole('button', { name: 'Step the rotation' });
      await step.click();
      await page.waitForTimeout(200);
      expect(await frames(page)).toBeGreaterThan(idle);
      const after = await frames(page);
      await page.waitForTimeout(500);
      expect(await frames(page)).toBe(after);
    });
  });

  test.describe('without WebGL', () => {
    test.beforeEach(async ({ page }) => {
      await page.addInitScript(() => {
        const orig = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (
          this: HTMLCanvasElement,
          type: string,
          ...rest: unknown[]
        ) {
          if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
          return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
        } as typeof orig;
      });
    });

    test('the flat fallback appears and its sliders work', async ({ page }) => {
      await openDemo(page);
      await page.getByRole('button', { name: 'Start 3D view' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'cannot draw 3D' })).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      const svg = page.getByRole('img', { name: /flat view/ });
      await expect(svg).toBeVisible();
      const before = await svg.innerHTML();
      const az = page.getByRole('slider', { name: 'Azimuth' });
      await az.focus();
      await page.keyboard.press('PageUp');
      await expect(az).not.toHaveValue('30');
      expect(await svg.innerHTML()).not.toBe(before);
      await axe(page);
    });
  });

  test.describe('failed import', () => {
    // a service worker would answer the request itself and page.route would never see it
    test.use({ serviceWorkers: 'block' });

    test('a failed 3D import falls back to the flat view', async ({ page }) => {
      await page.route(/DemoScene[^/]*\.js$/, (r) => r.abort());
      await openDemo(page);
      await page.getByRole('button', { name: 'Start 3D view' }).click();
      await expect(page.getByRole('status').filter({ hasText: 'could not load' })).toBeVisible();
      await expect(page.getByRole('slider', { name: 'Elevation' })).toBeVisible();
    });
  });

  test('works at 360 px without horizontal scroll', async ({ page }) => {
    await openDemo(page);
    await page.getByRole('button', { name: 'Start 3D view' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
