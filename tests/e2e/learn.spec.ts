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

  // Regression guard: the plot SVGs carry class names only, so a page without the plot stylesheet drew every shape in
  // the SVG default black and every label at the default 16 px, where the labels ran into each other and off the edge.
  for (const theme of ['light', 'dark'] as const) {
    test(`every station picture is styled and its labels do not collide (${theme})`, async ({ page }) => {
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
    await expect(page.locator('.scene-flat svg')).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
});
