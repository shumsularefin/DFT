import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const PAGES = [
  '08-convergence-and-errors/why-converge',
  '08-convergence-and-errors/encut-convergence',
  '08-convergence-and-errors/kpoint-convergence',
  '08-convergence-and-errors/scf-trouble',
  '08-convergence-and-errors/relaxation-trouble',
  '08-convergence-and-errors/common-errors',
];

async function ready(page: Page, url: string) {
  await page.goto(url);
  const islands = page.locator('astro-island');
  for (let i = 0; i < (await islands.count()); i++) await islands.nth(i).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('module 8 topics', () => {
  for (const t of PAGES) {
    test(`${t}: anatomy, no horizontal scroll, axe clean`, async ({ page }) => {
      await ready(page, `/handbook/${t}/`);
      const headings = await page.locator('article h2').allInnerTexts();
      expect(headings[0]).toBe('Why this matters');
      expect(headings.at(-1)).toBe('Go deeper');
      expect(await noOverflow(page)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }
});

test.describe('error finder', () => {
  test('/errors/ page: axe clean and no horizontal scroll', async ({ page }) => {
    await ready(page, '/errors/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('VASP error finder');
    expect(await noOverflow(page)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('a pasted message ranks its entry first, by exact match', async ({ page }) => {
    await ready(page, '/errors/');
    await page
      .getByLabel('Log excerpt or symptom')
      .fill('forrtl\n ZBRENT: fatal error in bracketing\nmore text');
    const first = page.locator('.ef-card').first();
    await expect(first).toHaveAttribute('data-entry', 'zbrent');
    await expect(first.locator('.ef-kind')).toHaveText('Exact message');
    await expect(first).toContainText('Copy CONTCAR to POSCAR');
  });

  test('a log with two errors lists both', async ({ page }) => {
    await ready(page, '/errors/');
    await page
      .getByLabel('Log excerpt or symptom')
      .fill(
        ' ZBRENT: fatal error in bracketing\n BRMIX: very serious problems the old and the new charge density differ',
      );
    const ids = await page
      .locator('.ef-results .ef-card')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-entry')));
    expect(ids.slice(0, 2).sort()).toEqual(['brmix', 'zbrent']);
  });

  test('beginner sees fewer fixes than intermediate', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem('dft:level', JSON.stringify({ v: 1, data: 'beginner' })),
    );
    await ready(page, '/errors/');
    await page.getByLabel('Log excerpt or symptom').fill('electronic loop does not converge');
    const card = page.locator('.ef-results .ef-card').first();
    await expect(card).toHaveAttribute('data-entry', 'scf-no-converge');
    await expect(card.locator('ol').nth(1).locator('> li')).toHaveCount(2);
    await expect(card).toContainText('Switch the level to Intermediate');
    await page.evaluate(() => document.documentElement.setAttribute('data-level', 'intermediate'));
    await expect(card.locator('ol').nth(1).locator('> li')).toHaveCount(6);
  });

  test('nothing matched offers browsing by category, operable by keyboard', async ({ page }) => {
    await ready(page, '/errors/');
    await page.getByLabel('Log excerpt or symptom').fill('the quick brown fox');
    await expect(page.locator('.ef-none')).toBeVisible();
    // the first category opens by itself when nothing matched; open the second one with the keyboard
    const second = page.locator('.ef-browse details').nth(1);
    await second.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(second).toHaveAttribute('open', '');
    const link = second.locator('.ef-link').first();
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.ef-browse .ef-card')).toBeVisible();
  });

  test('the common-errors topic embeds the finder', async ({ page }) => {
    await ready(page, '/handbook/08-convergence-and-errors/common-errors/');
    await page.getByLabel('Log excerpt or symptom').fill('Sub-Space-Matrix is not hermitian in DAV');
    await expect(page.locator('.ef-results .ef-card').first()).toHaveAttribute(
      'data-entry',
      'davidson-zhegv',
    );
  });
});
