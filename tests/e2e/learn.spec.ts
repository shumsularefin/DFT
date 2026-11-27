import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const N = 15;

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
    await page.getByRole('slider', { name: 'Step of the loop' }).press('End');
    await expect.poll(async () => svg.innerHTML()).not.toBe(before);
    await page.getByRole('button', { name: 'Station 7: The crystal and its unit cell' }).click();
    await page.getByRole('radio', { name: 'Diamond' }).check();
    await expect(page.locator('[data-scene-id="diamond"]')).toBeVisible();
  });

  test('a scene station opens a free 3D view by itself, with one canvas and no three.js on plot stations', async ({
    page,
  }) => {
    const scripts: string[] = [];
    page.on('response', (r) => r.url().endsWith('.js') && scripts.push(r.url()));
    await open(page, '#kohn-sham');
    expect(await count(page)).toBe(0);
    for (const u of scripts)
      expect(await (await page.request.get(u)).text(), u).not.toContain('WebGLRenderer');
    await page.getByRole('button', { name: 'Station 7: The crystal and its unit cell' }).click();
    await expect(page.locator('[data-testid="scene-3d"] canvas')).toHaveCount(1);
    await page.getByRole('button', { name: 'Next station' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    await page.getByRole('button', { name: 'Station 5: The Kohn-Sham idea' }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Station 8: Periodic images' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
    // going back to the flat view is remembered: the next scene station stays flat until "View in 3D"
    await page.getByRole('button', { name: 'Back to flat view' }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'Station 11: Reciprocal space' }).click();
    await expect(page.locator('.scene-flat svg')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  // D-124: an option that changes the size of the picture refits the view (same direction, same relative zoom, centred),
  // so n = 3, nine times wider than n = 1, is not cut off and coming back to n = 1 is not a speck. Reset view is not
  // pressed anywhere here. Screenshots go to the folder CI prints, so the framing can be checked by eye.
  test('changing an option keeps the 3D view framed, with no Reset view (D-124)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const shots = 'test-results/stage-shots';
    const stage = page.getByTestId('scene-3d');
    const dist = async () => {
      const c = ((await stage.getAttribute('data-camera')) ?? '').split(' ').map(Number);
      const t = ((await stage.getAttribute('data-target')) ?? '').split(' ').map(Number);
      return Math.hypot(...c.map((x, i) => x - t[i]!));
    };
    const settle = async () => {
      // the refit tweens; wait until the camera stops moving
      let last = -1;
      await expect
        .poll(async () => {
          const d = await dist();
          const still = Math.abs(d - last) < 1e-3;
          last = d;
          return still;
        })
        .toBe(true);
    };

    await open(page, '#atom-cloud');
    await expect(stage.locator('canvas')).toHaveCount(1);
    await expect(stage).toHaveAttribute('data-camera', /\d/);
    await settle();
    const d1 = await dist();
    await page.locator('.lp-visual').screenshot({ path: `${shots}/learn-atom-n1.png` });
    await page.getByRole('radio', { name: 'n = 3 (3s)' }).check();
    await expect.poll(dist).toBeGreaterThan(d1 * 2);
    await settle();
    await page.locator('.lp-visual').screenshot({ path: `${shots}/learn-atom-n3.png` });
    await page.getByRole('radio', { name: 'n = 1 (1s)' }).check();
    await expect.poll(dist).toBeLessThan(d1 * 1.2);
    await settle();
    expect(Math.abs((await dist()) / d1 - 1)).toBeLessThan(0.1);

    await page.getByRole('button', { name: 'Station 8: Periodic images' }).click();
    await expect(stage.locator('canvas')).toHaveCount(1);
    await settle();
    const c1 = await dist();
    await page.getByRole('radio', { name: '2 by 2 by 2 cells' }).check();
    await expect.poll(dist).toBeGreaterThan(c1 * 1.4);
    await settle();
    await page.locator('.lp-visual').screenshot({ path: `${shots}/learn-periodic-2x2x2.png` });
  });

  test('the 3D view turns under a drag, zooms and moves, by pointer and by keyboard', async ({ page }) => {
    await open(page, '#unit-cell');
    const stage = page.getByTestId('scene-3d');
    const canvas = stage.locator('canvas');
    await expect(canvas).toHaveCount(1);
    await expect(stage).toHaveAttribute('data-camera', /\d/);
    await expect(page.getByText(/Drag to turn it any way/)).toBeVisible();
    const camera = async () => ((await stage.getAttribute('data-camera')) ?? '').split(' ').map(Number);
    const target = async () => ((await stage.getAttribute('data-target')) ?? '').split(' ').map(Number);
    const dist = async () => {
      const c = await camera();
      const t = await target();
      return Math.hypot(...c.map((x, i) => x - t[i]!));
    };

    // pointer drag: the camera moves and the drawn pixels change (a real 3D render, not a picture)
    const home = await stage.getAttribute('data-camera');
    await canvas.scrollIntoViewIfNeeded();
    const before = await canvas.screenshot();
    const box = (await canvas.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + box.width / 3, cy + box.height / 6, { steps: 12 });
    await page.mouse.up();
    await expect.poll(() => stage.getAttribute('data-camera')).not.toBe(home);
    await expect.poll(async () => Buffer.compare(await canvas.screenshot(), before)).not.toBe(0);

    // wheel zooms in
    const far = await dist();
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, -400);
    await expect.poll(dist).toBeLessThan(far);

    // keyboard: arrows turn, W moves the target, R resets everything
    await stage.focus();
    const turned = await stage.getAttribute('data-camera');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => stage.getAttribute('data-camera')).not.toBe(turned);
    await page.keyboard.press('w');
    await expect.poll(async () => Math.hypot(...(await target()))).toBeGreaterThan(0);
    await page.keyboard.press('r');
    await expect.poll(() => stage.getAttribute('data-camera')).toBe(home);
    await expect.poll(target).toEqual([0, 0, 0]);
    // the toolbar does the same for mouse users
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect.poll(dist).toBeLessThan(far);
    await page.getByRole('button', { name: 'Reset view' }).click();
    await expect.poll(() => stage.getAttribute('data-camera')).toBe(home);
  });

  test('with reduced motion the station waits for "View in 3D"', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, '#unit-cell');
    await expect(page.locator('.scene-flat svg')).toBeVisible();
    expect(await count(page)).toBe(0);
    await page.getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('without WebGL the flat pictures remain, and turn under a drag', async ({ page }) => {
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
    await expect(page.getByText(/cannot draw 3D/)).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    const flat = page.locator('.scene-flat');
    await expect(flat.locator('svg')).toBeVisible();
    const view = await flat.getAttribute('data-view');
    // the mouse works in viewport coordinates, so the picture has to be on screen first
    await flat.scrollIntoViewIfNeeded();
    const box = (await flat.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => flat.getAttribute('data-view')).not.toBe(view);
    await page.getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('is axe clean on a plot station and a scene station, at 360 px with no sideways scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page, '#kohn-sham');
    await expect(page.locator('.lp-plot-svg svg')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Station 14: Spin up and down, and magnetic orderings' }).click();
    await expect(page.locator('[data-testid="scene-3d"] canvas')).toHaveCount(1);
    await expect(page.getByText(/Drag to turn it any way/)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
