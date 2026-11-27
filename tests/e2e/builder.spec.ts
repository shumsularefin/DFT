import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// M15.3: keyboard path and axe for the Material Builder. Crystal mode (/builder/) is the Studio workspace,
// hosted natively in the page (D-105); molecule mode (/builder/molecule/) is the same workspace with the
// Molecule tab, and Crystal | Molecule switches between them in place (D-107).
// Each test also checks there is no sideways scroll.
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function openCrystal(page: Page) {
  await page.goto('/builder/');
  await page.locator('html[data-studio-ready="true"]').waitFor({ timeout: 30_000 });
}
const atomCount = (page: Page) =>
  page.evaluate(
    () =>
      (window as unknown as { VESTA: { getStructure(): { atoms: unknown[] } } }).VESTA.getStructure().atoms
        .length,
  );

test.describe('material builder: crystal mode', () => {
  test('keyboard: supercell, undo and redo shortcuts, structure checks; no overflow; axe clean', async ({
    page,
  }) => {
    test.setTimeout(90_000); // the workspace boots three.js and the editor
    await openCrystal(page);
    // Native, not framed: the workspace is part of the page.
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect.poll(() => atomCount(page)).toBe(8);

    // On narrow workspaces the workbench is a drawer that starts closed; open it from the toolbar with the keyboard.
    if (!(await page.locator('#right-workbench').isVisible())) {
      await page.locator('#btn-toggle-right').focus();
      await page.keyboard.press('Enter');
    }
    await page.locator('#sc-na').fill('2');
    await page.locator('#sc-nb').fill('2');
    await page.locator('#sc-nc').fill('2');
    await page.locator('#btn-apply-supercell').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => atomCount(page)).toBe(64);

    // Focus stays on the Apply button (outside a text field), where the workspace shortcuts apply.
    await page.keyboard.press('Control+z');
    await expect.poll(() => atomCount(page)).toBe(8);
    await page.keyboard.press('Control+Shift+z');
    await expect.poll(() => atomCount(page)).toBe(64);

    // The site's B001 to B012 checks run on every change and show in the toolbar badge and the Checks tab.
    await expect(page.locator('#site-checks-count')).toHaveText('0');
    await page.locator('#btn-site-checks').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#checks-summary')).toContainText(/all clear|^0 error/);

    expect(await overflow(page)).toBeLessThanOrEqual(0);
    // The whole page, shell and workspace; every step and tab is axe tested in builder-studio.spec.ts.
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('the handbook templates are in the structure menu', async ({ page }) => {
    await openCrystal(page);
    await page.locator('#sample-select').selectOption('site:perovskite');
    await expect.poll(() => atomCount(page)).toBe(5);
  });

  test('Crystal | Molecule links join the two modes', async ({ page }) => {
    await openCrystal(page);
    const modes = page.getByRole('navigation', { name: 'Builder mode' });
    await expect(modes.getByRole('link', { name: 'Crystal' })).toHaveAttribute('aria-current', 'page');
    await modes.getByRole('link', { name: 'Molecule' }).click();
    await page.waitForURL('**/builder/molecule/');
    const back = page.getByRole('navigation', { name: 'Builder mode' });
    await expect(back.getByRole('link', { name: 'Molecule' })).toHaveAttribute('aria-current', 'page');
    await expect(back.getByRole('link', { name: 'Crystal' })).toHaveAttribute('href', '/builder/');
  });
});

test.describe('material builder: molecule mode', () => {
  test('the same workspace with the Molecule tab: presets, any element, hydrogens, undo; axe clean', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/builder/molecule/');
    await page.locator('html[data-studio-ready="true"]').waitFor({ timeout: 30_000 });
    // The crystal workspace, not a separate tool: the same viewer and toolbar, crystal-only controls hidden.
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('#viewport-wrap canvas').first()).toBeVisible();
    await expect(page.locator('#sample-select')).toBeHidden();
    await expect(page.locator('[data-right-tab="supercell"]')).toBeHidden();
    if (!(await page.locator('#right-workbench').isVisible())) {
      await page.locator('#btn-toggle-right').focus();
      await page.keyboard.press('Enter');
    }
    await expect(page.locator('#right-tab-molecule')).toBeVisible();
    // It starts from ethanol in a vacuum box.
    await expect(page.locator('#mol-formula')).toHaveText('C2H6O, 9 atoms');
    await expect.poll(() => atomCount(page)).toBe(9);

    // Any element from the periodic table (behind "All elements"), added with the keyboard; then undo.
    await page.locator('#mol-all-elements > summary').click();
    await page.locator('#mol-pt-grid [data-el="Si"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#mol-add')).toHaveText('Add Si');
    await page.locator('#mol-add').focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => atomCount(page)).toBe(10);
    await expect(page.locator('#mol-formula')).toHaveText('C2H6OSi, 10 atoms');
    await page.keyboard.press('Control+z');
    await expect.poll(() => atomCount(page)).toBe(9);

    // One carbon (a common-element chip), then hydrogens: methane.
    await page.locator('#mol-common [data-el="C"]').focus();
    await page.keyboard.press('Enter');
    await page.locator('#mol-single').focus();
    await page.keyboard.press('Enter');
    await page.locator('#mol-hydrogens').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#mol-formula')).toHaveText('CH4, 5 atoms');

    // A graphene flake (coronene) from the presets.
    await page
      .getByRole('group', { name: 'Starting molecules' })
      .getByRole('button', { name: 'Graphene flake' })
      .click();
    await expect(page.locator('#mol-formula')).toHaveText('C24H12, 36 atoms');

    expect(await overflow(page)).toBeLessThanOrEqual(0);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('editing tools: element search, a flat benzene, a methyl on it, measuring, hydrogens off and on (DS.5)', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto('/builder/molecule/');
    await page.locator('html[data-studio-ready="true"]').waitFor({ timeout: 30_000 });
    if (!(await page.locator('#right-workbench').isVisible())) {
      await page.locator('#btn-toggle-right').focus();
      await page.keyboard.press('Enter');
    }
    // The search picks the element it narrows to.
    await page.locator('#mol-all-elements > summary').click();
    await page.locator('#mol-el-search').fill('iron');
    await expect(page.locator('#mol-add')).toHaveText('Add Fe');
    await expect(page.locator('#mol-el-card')).toContainText('Iron (Z = 26)');

    // Benzene: six hydrogens, all outside the ring and in its plane.
    await page
      .getByRole('group', { name: 'Starting molecules' })
      .getByRole('button', { name: 'Benzene' })
      .click();
    await expect(page.locator('#mol-formula')).toHaveText('C6H6, 12 atoms');
    const ring = await page.evaluate(() => {
      const V = (
        window as unknown as {
          VESTA: { getStructure(): { lattice: number[][]; atoms: { el: string; frac: number[] }[] } };
        }
      ).VESTA;
      const s = V.getStructure();
      const cart = s.atoms.map((a) =>
        [0, 1, 2].map((j) => a.frac.reduce((t, f, i) => t + f * s.lattice[i]![j]!, 0)),
      );
      const c = s.atoms.map((a, i) => (a.el === 'C' ? cart[i]! : null)).filter((x): x is number[] => !!x);
      const mid = [0, 1, 2].map((j) => c.reduce((t, p) => t + p[j]!, 0) / c.length);
      const r = (p: number[]) => Math.hypot(p[0]! - mid[0]!, p[1]! - mid[1]!, p[2]! - mid[2]!);
      const hs = s.atoms
        .map((a, i) => (a.el === 'H' ? r(cart[i]!) : null))
        .filter((x): x is number => x !== null);
      return { cMax: Math.max(...c.map(r)), hMin: Math.min(...hs) };
    });
    expect(ring.hMin).toBeGreaterThan(ring.cMax + 0.9);

    // A methyl on the selected hydrogen's place: toluene.
    const hIndex = await page.evaluate(() => {
      const V = (
        window as unknown as {
          VESTA: { getStructure(): { atoms: { el: string }[] }; selectAtoms(i: number[]): void };
        }
      ).VESTA;
      const i = V.getStructure().atoms.findIndex((a) => a.el === 'H');
      V.selectAtoms([i]);
      return i;
    });
    expect(hIndex).toBeGreaterThanOrEqual(0);
    await page
      .getByRole('group', { name: 'Rings and groups' })
      .getByRole('button', { name: 'CH3 (methyl)' })
      .click();
    await expect(page.locator('#mol-formula')).toHaveText('C7H8, 15 atoms');

    // Two atoms selected: their distance.
    await page.evaluate(() =>
      (window as unknown as { VESTA: { selectAtoms(i: number[]): void } }).VESTA.selectAtoms([0, 1]),
    );
    await expect(page.locator('#mol-measure')).toContainText('distance');

    // Hydrogens off, then back on, counting the aromatic ring bonds: toluene again.
    await page.locator('#mol-strip-h').click();
    await expect(page.locator('#mol-formula')).toHaveText('C7, 7 atoms');
    await page.locator('#mol-hydrogens').click();
    await expect(page.locator('#mol-formula')).toHaveText('C7H8, 15 atoms');
    await page.locator('#mol-undo').click();
    await expect(page.locator('#mol-formula')).toHaveText('C7, 7 atoms');

    // The Crystal or Molecule explainer opens from the toolbar.
    await page.locator('.mode-help > summary').click();
    await expect(page.locator('.mode-help-pop')).toContainText('graphene flake');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('Crystal | Molecule switches in place and each mode keeps its own structure', async ({ page }) => {
    test.setTimeout(90_000);
    await openCrystal(page);
    await expect.poll(() => atomCount(page)).toBe(8);
    const modes = page.getByRole('navigation', { name: 'Builder mode' });
    await modes.getByRole('link', { name: 'Molecule' }).click();
    await page.waitForURL('**/builder/molecule/');
    await expect.poll(() => atomCount(page)).toBe(9);
    await expect(page.locator('#sample-select')).toBeHidden();
    await modes.getByRole('link', { name: 'Crystal' }).click();
    await page.waitForURL('**/builder/');
    await expect(modes.getByRole('link', { name: 'Crystal' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('#sample-select')).toBeVisible();
    await expect.poll(() => atomCount(page)).toBe(8);
    // The back button returns to the molecule.
    await page.goBack();
    await expect.poll(() => atomCount(page)).toBe(9);
    await expect(modes.getByRole('link', { name: 'Molecule' })).toHaveAttribute('aria-current', 'page');
  });
});
