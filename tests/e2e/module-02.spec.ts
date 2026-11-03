import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = '/handbook/02-quantum-basics/';
const TOPICS = [
  'particles-and-waves',
  'the-wavefunction',
  'particle-in-a-box',
  'orbitals',
  'spin-and-the-pauli-principle',
  'why-energy-levels-matter-for-materials',
];
const BOX = `${BASE}particle-in-a-box/`;
const ORB = `${BASE}orbitals/`;

async function ready(page: Page, url: string) {
  await page.goto(url);
  const lab = page.locator('[data-lab-id]');
  if (await lab.count()) await lab.first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const rd = (lab: Locator, label: string) => lab.locator('.lab-readout').filter({ hasText: label });
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('module 2', () => {
  for (const t of TOPICS) {
    test(`${t}: nine-part anatomy, no horizontal scroll, axe clean`, async ({ page }) => {
      await ready(page, `${BASE}${t}/`);
      const headings = await page.locator('article h2').allInnerTexts();
      expect(headings[0]).toBe('Why this matters');
      expect(headings).toContain('Check your understanding');
      expect(headings.at(-1)).toBe('Go deeper');
      expect(await noOverflow(page)).toBe(true);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('box lab: values, keyboard, description, reset', async ({ page }) => {
    await ready(page, BOX);
    const lab = page.locator('[data-lab-id="particle-in-a-box"]');
    await expect(lab.getByText('Computed').first()).toBeVisible();
    await expect(lab.getByText('Text description.')).toBeVisible();
    // defaults: L = 5 angstrom, n = 1 gives 1.5041 eV and 0 interior nodes
    await expect(rd(lab, 'Energy E1')).toContainText('1.50');
    await expect(rd(lab, 'Interior nodes')).toContainText('0');
    const nSlider = lab.getByRole('slider', { name: /State n/ });
    await nSlider.focus();
    await nSlider.press('ArrowRight');
    await nSlider.press('ArrowRight');
    await expect(rd(lab, 'Energy E3')).toContainText('13.5');
    await expect(rd(lab, 'Interior nodes')).toContainText('2');
    const mix = lab.getByRole('slider', { name: /Mix in state/ });
    await mix.focus();
    await mix.press('End');
    await expect(rd(lab, 'Beat period')).toContainText('fs');
    await lab.getByRole('button', { name: 'Reset' }).click();
    await expect(rd(lab, 'Energy E1')).toContainText('1.50');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('box lab: one electron caveat visible, play toggle honest, hidden under reduced motion', async ({
    page,
  }) => {
    await ready(page, BOX);
    const lab = page.locator('[data-lab-id="particle-in-a-box"]');
    await expect(lab.getByText(/not a real material/)).toBeVisible();
    const mix = lab.getByRole('slider', { name: /Mix in state/ });
    await mix.focus();
    await mix.press('End');
    await lab.getByRole('switch', { name: /Play the beat/ }).click();
    await expect(lab.getByText(/Playback slowed down by/)).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page, BOX);
    await expect(
      page.locator('[data-lab-id] [role="switch"][aria-label*="Play"], [data-lab-id] >> text=Play the beat'),
    ).toHaveCount(0);
  });

  test('orbitals lab: poster, 2D view, radial values, keyboard select', async ({ page }) => {
    await ready(page, ORB);
    const lab = page.locator('[data-lab-id="orbitals"]');
    await expect(lab.getByText('Computed').first()).toBeVisible();
    await expect(lab.getByText(/one-electron orbitals/)).toBeVisible();
    await expect(lab.getByText('Text description.')).toBeVisible();
    const sel = lab.locator('#orbital-select');
    await expect(sel).toHaveValue('2p_z');
    await expect(rd(lab, 'Radial nodes')).toContainText('0');
    await sel.selectOption('3d_xy');
    await expect(rd(lab, 'Energy')).toContainText('-1.5117');
    await sel.selectOption('1s');
    await expect(rd(lab, 'Most probable distance')).toContainText('1.00 a0 (0.53');
    expect(await noOverflow(page)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('orbitals lab: 3D view starts on request, worker keeps frames flowing, fallback works', async ({
    page,
  }) => {
    await ready(page, ORB);
    const lab = page.locator('[data-lab-id="orbitals"]');
    await lab.getByRole('button', { name: 'Start 3D view' }).click();
    await expect(lab.locator('canvas')).toBeVisible({ timeout: 30000 });
    await expect(rd(lab, 'Cloud')).toContainText('ready', { timeout: 30000 });
    // count animation frames while a 50 000 point cloud is sampled
    await page.evaluate(() => {
      const w = window as unknown as { __frames: number; __maxGap: number };
      w.__frames = 0;
      w.__maxGap = 0;
      let last = performance.now();
      const tick = (t: number) => {
        w.__maxGap = Math.max(w.__maxGap, t - last);
        last = t;
        w.__frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await lab.getByRole('switch', { name: /Denser cloud/ }).click();
    await lab
      .getByLabel(/Orbital|orbital/)
      .first()
      .selectOption('4f_xyz')
      .catch(() => undefined);
    await expect(rd(lab, 'Cloud')).toContainText('ready', { timeout: 30000 });
    const m = await page.evaluate(() => {
      const w = window as unknown as { __frames: number; __maxGap: number };
      return { frames: w.__frames, maxGap: w.__maxGap };
    });
    console.log(`worker responsiveness: ${m.frames} frames, longest gap ${m.maxGap.toFixed(0)} ms`);
    expect(m.frames).toBeGreaterThan(3);
    expect(m.maxGap).toBeLessThan(500);
  });

  test('orbitals lab: 2D radial plot shown when WebGL is unavailable', async ({ page }) => {
    await page.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type.startsWith('webgl') || type === 'experimental-webgl') return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
      } as typeof orig;
    });
    await ready(page, ORB);
    const lab = page.locator('[data-lab-id="orbitals"]');
    await lab.getByRole('button', { name: 'Start 3D view' }).click();
    await expect(lab.getByText(/cannot draw 3D/)).toBeVisible();
    await expect(lab.getByRole('img', { name: /radial/i }).first()).toBeVisible();
  });

  test('the module appears in the handbook map', async ({ page }) => {
    await page.goto('/handbook/');
    for (const t of TOPICS) await expect(page.locator(`a[href="${BASE}${t}/"]`)).toBeVisible();
  });
});
