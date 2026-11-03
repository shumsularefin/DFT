import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = '/handbook/03-many-electrons/';
const TOPICS = [
  'the-many-electron-problem',
  'the-exponential-wall',
  'electron-density',
  'from-wavefunction-to-density',
  'what-we-still-have-to-approximate',
];

async function ready(page: Page, url: string) {
  await page.goto(url);
  const lab = page.locator('[data-lab-id]');
  if (await lab.count()) await lab.first().scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const rd = (lab: Locator, label: string) => lab.locator('.lab-readout').filter({ hasText: label });
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('module 3', () => {
  for (const t of TOPICS) {
    test(`${t}: nine-part anatomy, no horizontal scroll, axe clean`, async ({ page }) => {
      await ready(page, `${BASE}${t}/`);
      const headings = await page.locator('article h2').allInnerTexts();
      expect(headings[0]).toBe('Why this matters');
      expect(headings).toContain('Check your understanding');
      expect(headings.at(-1)).toBe('Go deeper');
      expect(await noOverflow(page)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }

  test('exponential wall lab: exact counts, keyboard, reset', async ({ page }) => {
    await ready(page, `${BASE}the-exponential-wall/`);
    const lab = page.locator('[data-lab-id="exponential-wall"]');
    await expect(lab.getByText('Computed').first()).toBeVisible();
    await expect(lab.getByText('Text description.')).toBeVisible();
    // default N = 10, 4 per electron: C(40, 10) = 847 660 528
    await expect(rd(lab, 'Slater determinants')).toContainText('8.476 x 10^8');
    const n = lab.getByRole('slider', { name: /Electrons N/ });
    await n.focus();
    await n.press('End');
    await expect(rd(lab, 'Slater determinants')).toContainText('x 10^');
    await n.press('Home');
    await expect(rd(lab, 'Slater determinants')).toContainText('4');
    await lab.getByRole('button', { name: 'Reset' }).click();
    await expect(rd(lab, 'Slater determinants')).toContainText('8.476 x 10^8');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('density lab: badge, caveat, keyboard handles, solver round trip', async ({ page }) => {
    await ready(page, `${BASE}electron-density/`);
    const lab = page.locator('[data-lab-id="density-as-a-map"]');
    await expect(lab.getByText('Toy model').first()).toBeVisible();
    await expect(lab.getByText(/one-dimensional toy/)).toBeVisible();
    await expect(lab.getByText('Text description.')).toBeVisible();
    await expect(rd(lab, 'largest mismatch')).toContainText('below 1e-6');
    const handles = lab.getByRole('slider', { name: /Density height at x/ });
    await expect(handles).toHaveCount(7);
    const h = handles.nth(3);
    const before = await h.getAttribute('aria-valuenow');
    await h.focus();
    await h.press('ArrowDown');
    expect(await h.getAttribute('aria-valuenow')).not.toBe(before);
    // editing switches the starting density to "Your own shape"
    await expect(lab.getByLabel(/Starting density/)).toHaveValue('custom');
    await expect(rd(lab, 'largest mismatch')).toContainText('below 1e-6');
    // part 2
    await lab.getByRole('slider', { name: /Electrons N/ }).focus();
    await page.keyboard.press('End');
    await expect(rd(lab, 'electrons counted')).toContainText('8.0000');
    await lab.getByRole('button', { name: 'Reset' }).click();
    await expect(lab.getByLabel(/Starting density/)).toHaveValue('gaussian');
    expect(await noOverflow(page)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('pointer drag moves a handle', async ({ page }) => {
    await ready(page, `${BASE}electron-density/`);
    const lab = page.locator('[data-lab-id="density-as-a-map"]');
    const h = lab.getByRole('slider', { name: /Density height at x = 0\.0/ });
    await h.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    const box = (await h.boundingBox())!;
    const before = Number(await h.getAttribute('aria-valuenow'));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, { steps: 5 });
    await page.mouse.up();
    expect(Number(await h.getAttribute('aria-valuenow'))).toBeLessThan(before);
  });

  test('the module appears in the handbook map', async ({ page }) => {
    await page.goto('/handbook/');
    for (const t of TOPICS) await expect(page.locator(`a[href="${BASE}${t}/"]`)).toBeVisible();
  });
});
