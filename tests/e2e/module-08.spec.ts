import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const M8 = '/handbook/08-convergence-and-errors/';
const TOPICS = [
  'why-converge',
  'encut-convergence',
  'kpoint-convergence',
  'scf-trouble',
  'relaxation-trouble',
  'common-errors',
].map((t) => M8 + t + '/');

async function ready(page: Page, url: string) {
  await page.goto(url);
  // client:visible islands only hydrate once scrolled into view. An island is display: contents, so scroll its content.
  await page.evaluate(async () => {
    for (const el of Array.from(document.querySelectorAll('astro-island[ssr]')).reverse()) {
      (el.firstElementChild ?? el).scrollIntoView({ block: 'center' });
      await new Promise((r) => setTimeout(r, 60));
    }
  });
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
}
const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

test.describe('module 8 and the error finder', () => {
  for (const url of TOPICS) {
    test(`${url}: anatomy, no horizontal scroll, axe clean`, async ({ page }) => {
      await ready(page, url);
      const headings = await page.locator('article h2').allInnerTexts();
      expect(headings[0]).toBe('Why this matters');
      expect(headings).toContain('Check your understanding');
      expect(headings.at(-1)).toBe('Go deeper');
      expect(await noOverflow(page)).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    });
  }

  test('/errors/: a pasted message gives its entry first, with causes and fixes', async ({ page }) => {
    await ready(page, '/errors/');
    await page.getByLabel(/Paste a log excerpt/).fill('running\nZBRENT: fatal error in bracketing\n');
    const results = page.getByRole('region', { name: 'Matches' });
    await expect(results.locator('.ef-title').first()).toHaveText(/ZBRENT/);
    await expect(results).toContainText('Matched a message printed by VASP');
    await expect(results).toContainText('Copy CONTCAR to POSCAR and restart');
  });

  test('/errors/: a log with two errors lists both', async ({ page }) => {
    await ready(page, '/errors/');
    await page
      .getByLabel(/Paste a log excerpt/)
      .fill(
        'LAPACK: Routine ZPOTRF failed\nBRMIX: very serious problems\nthe old and the new charge density differ',
      );
    await expect(page.getByRole('region', { name: 'Matches' }).locator('article')).toHaveCount(2);
  });

  test('/errors/: nothing matched offers browsing by category, and an entry can be picked from it', async ({
    page,
  }) => {
    await ready(page, '/errors/');
    await page.getByLabel(/Paste a log excerpt/).fill('banana smoothie');
    await expect(page.getByText(/Nothing matched/)).toBeVisible();
    const browse = page.locator('details.ef-browse');
    await expect(browse).toHaveAttribute('open', '');
    await browse.getByRole('button', { name: /ZBRENT/ }).click();
    await expect(page.getByRole('region', { name: 'Matches' }).locator('article').first()).toContainText(
      'bracketing',
    );
  });

  test('/errors/: keyboard only, an example chip fills the box and results follow', async ({ page }) => {
    await ready(page, '/errors/');
    const chip = page.getByRole('button', { name: /^ZBRENT: fatal error/ });
    await chip.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel(/Paste a log excerpt/)).toHaveValue(/ZBRENT/);
    await expect(page.getByRole('region', { name: 'Matches' }).locator('article')).toHaveCount(1);
  });

  test('/errors/ at 360 px: no horizontal scroll with results, axe clean', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await ready(page, '/errors/');
    await page.getByLabel(/Paste a log excerpt/).fill('Sub-Space-Matrix is not hermitian in DAV');
    await expect(page.getByRole('region', { name: 'Matches' }).locator('article')).toHaveCount(1);
    expect(await noOverflow(page)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });

  test('the finder inside the common-errors topic works the same', async ({ page }) => {
    await ready(page, `${M8}common-errors/`);
    const lab = page.locator('[data-lab-id="error-finder"]');
    await lab.getByLabel(/Paste a log excerpt/).fill('my relaxation never finishes');
    await expect(lab.getByRole('region', { name: 'Matches' }).locator('article').first()).toContainText(
      /does not finish/i,
    );
  });
});
