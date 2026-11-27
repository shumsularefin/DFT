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

/** What is wrong with the station picture: black (unstyled) shapes, default-size text, clipped or colliding labels. */
async function pictureProblems(page: Page): Promise<string[]> {
  const svg = page.locator('.lp-visual svg[role="img"]').first();
  await expect(svg).toBeVisible();
  return svg.evaluate((root) => {
    const bad: string[] = [];
    const box = root.getBoundingClientRect();
    for (const el of root.querySelectorAll('path, rect, circle, ellipse, polygon')) {
      if (el.closest('defs')) continue;
      if (getComputedStyle(el).fill === 'rgb(0, 0, 0)')
        bad.push(`black fill on <${el.tagName} class="${el.getAttribute('class') ?? ''}">`);
    }
    const texts = [...root.querySelectorAll('text')].filter((t) => (t.textContent ?? '').trim());
    for (const t of texts) {
      const fs = parseFloat(getComputedStyle(t).fontSize);
      if (fs > 13) bad.push(`unstyled text "${t.textContent}" at ${fs}px`);
    }
    const rects = texts.map((t) => ({ s: t.textContent ?? '', r: t.getBoundingClientRect() }));
    for (const { s, r } of rects)
      if (
        r.left < box.left - 1 ||
        r.right > box.right + 1 ||
        r.top < box.top - 1 ||
        r.bottom > box.bottom + 1
      )
        bad.push(`text "${s}" is cut off at the picture edge`);
    // glyph boxes include the line gap, so allow a pixel of touch before calling it an overlap
    for (let a = 0; a < rects.length; a++)
      for (let b = a + 1; b < rects.length; b++) {
        const p = rects[a]!.r;
        const q = rects[b]!.r;
        const w = Math.min(p.right, q.right) - Math.max(p.left, q.left);
        const h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
        if (w > 1 && h > 1) bad.push(`text "${rects[a]!.s}" overlaps "${rects[b]!.s}"`);
      }
    return bad;
  });
}

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
    await page.getByRole('button', { name: 'Station 10: Reciprocal space' }).click();
    await expect(page.locator('.scene-flat svg')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: 'View in 3D' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
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

  // Regression guard: the plot SVGs carry class names only, so a page without the plot stylesheet drew every shape in
  // the SVG default black and every label at the default 16 px, where the labels ran into each other and off the edge.
  for (const theme of ['light', 'dark'] as const) {
    test(`every station picture is styled and its labels do not collide (${theme})`, async ({ page }) => {
      // Scene and stage stations open the live 3D view by themselves (D-112), which replaces the flat picture; with
      // reduced motion they keep it, so every flat picture is checked here. The live views are checked by the 3D tests.
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await open(page);
      await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
      for (let i = 1; i <= N; i++) {
        await page.getByRole('button', { name: new RegExp(`^Station ${i}:`) }).click();
        await expect(page.getByText(`Station ${i} of ${N}`)).toBeVisible();
        expect(await pictureProblems(page), `station ${i}`).toEqual([]);
        // a plot station's choices redraw the plot: check every option too
        if ((await page.getByTestId('lp-visual').getAttribute('data-kind')) !== 'plot') continue;
        const radios = page.locator('.lp-choices input[type="radio"]');
        for (let k = 0; k < (await radios.count()); k++) {
          const before = await page.locator('.lp-plot-svg').innerHTML();
          await radios.nth(k).check();
          if (k > 0) await expect.poll(() => page.locator('.lp-plot-svg').innerHTML()).not.toBe(before);
          expect(await pictureProblems(page), `station ${i}, option ${k + 1}`).toEqual([]);
        }
      }
    });
  }

  test('is axe clean on a plot station and a scene station, at 360 px with no sideways scroll', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await open(page, '#kohn-sham');
    await expect(page.locator('.lp-plot-svg svg')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.getByRole('button', { name: 'Station 13: Spin up and down, and magnetic orderings' }).click();
    await expect(page.locator('[data-testid="scene-3d"] canvas')).toHaveCount(1);
    await expect(page.getByText(/Drag to turn it any way/)).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
