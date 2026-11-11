import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = '/tools/tolerance-factor/';

// Names read from the golden file tests/reference/perovskite_reference.json (SrTiO3 t, NdCuO3 policies).
const T_SRTIO3 = '1.0016';
const T_NDCUO3_CN12 = '0.9732';
const T_NDCUO3_CN9 = '0.9342';

async function pick(page: Page, site: 'A' | 'B' | 'X', name: string) {
  await page
    .getByRole('button', { name: new RegExp(`^Element, ${site} site`) })
    .first()
    .click();
  const region = page.getByRole('region', { name: `Element picker for the ${site} site` });
  await region.getByRole('button', { name: new RegExp(name) }).click();
  await expect(region).toHaveCount(0);
}

test.describe('tolerance-factor explorer', () => {
  test('SrTiO3 by default: t from the golden file and the source line', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByTestId('value-t')).toHaveText(T_SRTIO3);
    await expect(page.getByTestId('radius-A')).toContainText(
      'Shannon 1976, Sr2+, CN XII, ionic radius 1.44 Angstrom',
    );
    await expect(page.getByTestId('radius-B')).toContainText('Ti4+, CN VI');
    await expect(page.getByText('Tolerance factors are rules of thumb. They do not guarantee')).toBeVisible();
    await page.getByTestId('card-t').getByText('Formula and inputs').click();
    await expect(page.getByTestId('card-t')).toContainText('sqrt(2)');
  });

  test('NdCuO3 with Cu3+: uncommon warning, policy selector, CN 9 gives the golden t', async ({ page }) => {
    await page.goto(URL);
    await pick(page, 'A', 'Neodymium');
    await pick(page, 'B', 'Copper');
    await page.getByLabel(/^Oxidation state, B site/).selectOption('3');
    await page.getByLabel(/^Oxidation state, A site/).selectOption('3');
    await expect(page.getByTestId('radius-B')).toContainText('Cu3+, CN VI, low spin');
    await expect(page.getByTestId('radius-B')).toContainText('0.54 Angstrom');
    await expect(page.getByTestId('value-t')).toHaveText(T_NDCUO3_CN12);
    await expect(page.locator('[data-check="uncommon-oxidation-Cu3"]')).toBeVisible();
    const policy = page.getByLabel('A-site coordination policy for lanthanides');
    await expect(policy).toBeVisible();
    await policy.selectOption('9');
    await expect(page.getByTestId('value-t')).toHaveText(T_NDCUO3_CN9);
  });

  test('a missing radius shows the reason and never a number', async ({ page }) => {
    await page.goto(URL);
    await pick(page, 'A', 'Gadolinium');
    await expect(page.getByTestId('result-missing')).toContainText('coordination 12');
    await expect(page.getByTestId('value-t')).toHaveCount(0);
    await expect(page.locator('[data-check="cn-policy"]')).toBeVisible();
  });

  test('mixed A site uses the linear mixing convention and says so', async ({ page }) => {
    await page.goto(URL);
    await page.getByRole('button', { name: 'Add second occupant to the A site' }).click();
    await page.getByRole('button', { name: /^Element, A site second occupant/ }).click();
    const region = page.getByRole('region', { name: 'Element picker for the A site' });
    await region.getByRole('button', { name: /Barium/ }).click();
    // Hand check: rA = (1.44 + 1.61) / 2 = 1.525; t = (1.525 + 1.4) / (sqrt(2) (0.605 + 1.4)) = 1.03156.
    await expect(page.getByTestId('radius-A')).toContainText('1.5250 Angstrom (linear mixing convention)');
    await expect(page.getByTestId('value-t')).toHaveText('1.0316');
  });

  test('the composition lives in the URL fragment', async ({ page }) => {
    await page.goto(URL);
    await pick(page, 'B', 'Zirconium');
    await expect.poll(() => page.evaluate(() => location.hash)).toContain('B=Zr:4:6');
    await page.reload();
    await expect(page.getByTestId('radius-B')).toContainText('Zr4+, CN VI');
    await page.goto('about:blank');
    await page.goto(URL + '#garbage');
    await expect(page.getByTestId('value-t')).toHaveText(T_SRTIO3);
    await page.evaluate(() => (location.hash = 'A=Ba:2:12:::1&B=Ti:4:6:::1&X=O:-2:6:::1&p=12'));
    await expect(page.getByTestId('radius-A')).toContainText('Ba2+, CN XII');
  });

  test('keyboard only: choose all three ions', async ({ page }, info) => {
    test.skip(
      info.project.name === 'mobile-360',
      'type-ahead belongs to the wide grid; the list has a search box',
    );
    await page.goto(URL);
    const choose = async (site: 'A' | 'B' | 'X', letters: string, expected: RegExp) => {
      const btn = page.getByRole('button', { name: new RegExp(`^Element, ${site} site`) }).first();
      await btn.focus();
      await page.keyboard.press('Enter');
      await page.keyboard.type(letters);
      await page.keyboard.press('Enter');
      await expect(btn).toHaveAccessibleName(expected);
    };
    await choose('A', 'ba', /Barium/);
    await choose('B', 'zr', /Zirconium/);
    await choose('X', 'cl', /Chlorine/);
    await expect(page.getByTestId('radius-X')).toContainText('Cl-, CN VI');
    // Arrow keys move by position. The picker opens on the selected element, Ba (row 6, group 2).
    await page
      .getByRole('button', { name: /^Element, A site/ })
      .first()
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-symbol="Ba"]')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('[data-symbol="Cs"]')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-symbol="Fr"]')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Element picker for the A site' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^Element, A site/ }).first()).toBeFocused();
  });

  test('search list works at phone width', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-360');
    await page.goto(URL);
    await page
      .getByRole('button', { name: /^Element, A site/ })
      .first()
      .click();
    await page.getByLabel(/^Search elements/).fill('lanth');
    await expect(page.getByRole('status').filter({ hasText: 'match' })).toContainText('1 element matches');
  });

  test('no horizontal page scroll', async ({ page }) => {
    await page.goto(URL);
    await page
      .getByRole('button', { name: /^Element, A site/ })
      .first()
      .click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('axe: default page, open picker and a missing-radius state', async ({ page }) => {
    await page.goto(URL);
    let r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
    await page
      .getByRole('button', { name: /^Element, A site/ })
      .first()
      .click();
    r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await pick(page, 'A', 'Gadolinium');
    r = await new AxeBuilder({ page }).analyze();
    expect(r.violations).toEqual([]);
  });
});
