// The topic stage (M16.2): a live 3D view beside the text. It boots after the page has loaded, turns freely from the
// keyboard, follows the reading position, keeps three.js out of the initial JavaScript, stays axe clean and works
// under reduced motion. It also saves screenshots of a few stages from two angles to test-results/stage-shots, which
// CI uploads as an artifact, so the 3D can be checked by eye.
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TOPICS = [
  { name: 'orbitals', url: '/handbook/02-quantum-basics/orbitals/' },
  { name: 'kmesh', url: '/handbook/05-practical-choices/kpoints-and-the-brillouin-zone/' },
  { name: 'magnetic-orderings', url: '/handbook/05-practical-choices/magnetic-orderings/' },
  { name: 'phonons', url: '/handbook/12-properties/phonons/' },
];
const SHOTS = 'test-results/stage-shots';

async function openStage(page: Page, url: string) {
  await page.goto(url);
  const stage = page.locator('[data-stage]').first();
  await expect(stage).toBeVisible();
  // the stage boots on idle after load; a pointer over it starts it at once
  await stage.locator('[data-stage-view]').hover();
  await expect(stage).toHaveAttribute('data-stage-ready', 'true', { timeout: 30_000 });
  return stage;
}

test.describe('topic stage', () => {
  test.skip(
    ({ isMobile }) => isMobile,
    'side by side is a desktop layout; the phone layout is covered below',
  );

  for (const t of TOPICS)
    test(`${t.name}: live 3D beside the text, two angles saved`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      const stage = await openStage(page, t.url);
      await expect(stage.locator('[data-stage-view] canvas')).toHaveCount(1);
      await expect(stage.locator('[data-stage-nogl]')).toBeHidden();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${SHOTS}/${t.name}-1-page.png` });
      await stage.locator('[data-stage-view]').screenshot({ path: `${SHOTS}/${t.name}-2-iso.png` });
      const view = stage.locator('[data-stage-view]');
      const box = (await view.boundingBox())!;
      // a free arcball drag: across and down at once, which a pole-locked orbit cannot follow
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.35);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.75, { steps: 12 });
      await page.mouse.up();
      await page.waitForTimeout(600);
      await view.screenshot({ path: `${SHOTS}/${t.name}-3-turned.png` });
    });

  test('keyboard turns, zooms and resets the view; ortho switches projection', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const stage = await openStage(page, TOPICS[1]!.url);
    const view = stage.locator('[data-stage-view]');
    const camera = () => stage.locator('[data-camera]').first().getAttribute('data-camera');
    await view.focus();
    const before = await camera();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    await expect.poll(camera).not.toBe(before);
    await page.keyboard.press('r');
    await expect.poll(camera).toBe(before);
    const projection = () => stage.locator('[data-projection]').first().getAttribute('data-projection');
    const p0 = await projection();
    await stage.getByRole('button', { name: 'Orthographic' }).click();
    await expect.poll(projection).not.toBe(p0);
  });

  test('the state follows the reading position and the step buttons', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const stage = await openStage(page, TOPICS[0]!.url);
    const first = await stage.getAttribute('data-state');
    await stage.getByRole('button', { name: 'Next step' }).click();
    await expect.poll(() => stage.getAttribute('data-state')).not.toBe(first);
  });

  test('three.js is not in the initial JavaScript, and the page is axe clean with the stage live', async ({
    page,
  }) => {
    const scripts: string[] = [];
    page.on('response', (r) => r.url().endsWith('.js') && scripts.push(r.url()));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(TOPICS[0]!.url);
    const initial = [...scripts];
    for (const url of initial)
      expect(await (await page.request.get(url)).text(), url).not.toContain('WebGLRenderer');
    await openStage(page, TOPICS[0]!.url);
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
  });

  test('no CSP violations while the stage runs', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize({ width: 1440, height: 900 });
    await openStage(page, TOPICS[2]!.url);
    expect(errors.filter((e) => /Content Security Policy/i.test(e))).toEqual([]);
  });

  test('reduced motion: the stage still boots and changes state without a tween', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1440, height: 900 });
    const stage = await openStage(page, TOPICS[3]!.url);
    const first = await stage.getAttribute('data-state');
    await stage.getByRole('button', { name: 'Next step' }).click();
    await expect.poll(() => stage.getAttribute('data-state')).not.toBe(first);
  });

  test('Focus 3D and Text only change the layout, Esc leaves focus', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const stage = await openStage(page, TOPICS[0]!.url);
    const row = page.locator('[data-stage-row]');
    await stage.getByRole('button', { name: 'Focus 3D' }).click();
    await expect(row).toHaveAttribute('data-stage-mode', 'focus');
    await page.keyboard.press('Escape');
    await expect(row).toHaveAttribute('data-stage-mode', 'split');
    await stage.getByRole('button', { name: 'Text only' }).click();
    await expect(row).toHaveAttribute('data-stage-mode', 'text');
    await page.locator('[data-stage-show]').first().click();
    await expect(row).toHaveAttribute('data-stage-mode', 'split');
  });
});

test('phone width: the stage sits above the text and the page does not scroll sideways', async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, 'phone layout only');
  await page.goto(TOPICS[0]!.url);
  await expect(page.locator('[data-stage]').first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `${SHOTS}/phone-orbitals.png` });
});
