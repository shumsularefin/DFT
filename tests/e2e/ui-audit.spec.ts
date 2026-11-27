import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Regression checks from the UI audit: classes of defect that were found on real pages and fixed.
// Runs in both projects (360 px and desktop), and each check runs in the light and the dark theme.

async function open(page: Page, url: string, theme: 'light' | 'dark' = 'light') {
  // Some islands hydrate only when idle or visible, so wait for the network rather than for every island.
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((t) => {
    document.documentElement.dataset.theme = t;
  }, theme);
}

const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** Visible buttons still drawn with the browser's default grey (Chromium's ButtonFace) or an outset border. */
const defaultLookButtons = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('main button, main label.btn')]
      .filter((b) => {
        const s = getComputedStyle(b);
        if (s.display === 'none' || s.visibility === 'hidden' || b.getClientRects().length === 0)
          return false;
        return (
          s.backgroundColor === 'rgb(239, 239, 239)' ||
          s.backgroundColor === 'rgb(240, 240, 240)' ||
          s.borderTopStyle === 'outset'
        );
      })
      .map((b) => b.textContent?.trim() ?? ''),
  );

for (const theme of ['light', 'dark'] as const) {
  test.describe(`ui audit (${theme})`, () => {
    test('buttons on tools, labs and progress use the site look, not the browser default', async ({
      page,
    }) => {
      for (const url of [
        '/builder/',
        '/tools/magnetic/',
        '/tools/eos/',
        '/tools/convergence/',
        '/tools/kpath/',
        '/progress/',
        '/design/unit-cell-lab/',
        '/design/brillouin-lab/',
        '/handbook/06-vasp-files/poscar/',
      ]) {
        await open(page, url, theme);
        expect(await defaultLookButtons(page), url).toEqual([]);
      }
    });

    test('the builder workspace is the Material Builder and its primary action uses the site accent', async ({
      page,
    }) => {
      await open(page, '/builder/', theme);
      await page.locator('html[data-studio-ready="true"]').waitFor({ timeout: 30_000 });
      await expect(page.getByRole('heading', { level: 1, name: 'Material Builder' })).toBeAttached();
      await expect(page.getByText('DFT Studio')).toHaveCount(0);
      const primary = page.locator('#btn-export-poscar');
      // Buttons may ease their colour when the theme changes, so poll until it has settled.
      const look = () =>
        primary.evaluate((b) => {
          const probe = document.createElement('span');
          probe.style.color = 'var(--accent)';
          document.body.append(probe);
          const accentRgb = getComputedStyle(probe).color;
          probe.remove();
          return { bg: getComputedStyle(b).backgroundColor, accentRgb };
        });
      await expect
        .poll(async () => {
          const l = await look();
          return l.bg === l.accentRgb;
        })
        .toBe(true);
    });
  });
}

test('builder mode links: the current mode is marked and links to the other mode', async ({ page }) => {
  await open(page, '/builder/');
  const modes = page.getByRole('navigation', { name: 'Builder mode' });
  const crystal = modes.getByRole('link', { name: 'Crystal' });
  const molecule = modes.getByRole('link', { name: 'Molecule' });
  await expect(crystal).toHaveAttribute('aria-current', 'page');
  await expect(molecule).not.toHaveAttribute('aria-current', 'page');
  const bg = (l: typeof crystal) => l.evaluate((b) => getComputedStyle(b).backgroundColor);
  expect(await bg(crystal)).not.toBe(await bg(molecule));
  await molecule.focus();
  await page.keyboard.press('Enter');
  await page.waitForURL('**/builder/molecule/');
  await expect(
    page.getByRole('navigation', { name: 'Builder mode' }).getByRole('link', { name: 'Molecule' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('pages with learner state hydrate without a React mismatch and show no storage warning', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  for (const url of ['/practice/', '/progress/', '/handbook/04-kohn-sham/the-scf-loop/']) {
    await open(page, url);
    await expect(page.getByText(/browser is blocking storage/)).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('no sideways scroll on form-heavy tools, with every disclosure open', async ({ page }) => {
  for (const url of [
    '/tools/kpath/',
    '/tools/eos/',
    '/tools/magnetic/',
    '/progress/',
    '/handbook/04-kohn-sham/the-scf-loop/',
    '/handbook/05-practical-choices/smearing/',
  ]) {
    await open(page, url);
    await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
    expect(await overflow(page), url).toBeLessThanOrEqual(0);
  }
});

test('the magnetic tool input card holds its own content', async ({ page }) => {
  await open(page, '/tools/magnetic/');
  const spill = await page.evaluate(() => {
    const card = document.querySelector('.mg-left')!.getBoundingClientRect();
    return (
      Math.max(...[...document.querySelectorAll('.mg-left *')].map((e) => e.getBoundingClientRect().right)) -
      card.right
    );
  });
  expect(spill).toBeLessThanOrEqual(0);
});

test('disclosure summaries keep a visible open/close marker', async ({ page }) => {
  for (const [url, sel] of [
    ['/handbook/04-kohn-sham/the-scf-loop/', '.themath > summary'],
    ['/errors/', '.ef-browse > summary'],
  ] as const) {
    await open(page, url);
    const marker = await page
      .locator(sel)
      .first()
      .evaluate((s) => {
        const cs = getComputedStyle(s);
        if (cs.display === 'list-item') return 'native';
        const b = getComputedStyle(s, '::before');
        return b.content !== 'none' && parseFloat(b.borderInlineStartWidth) > 0 ? 'drawn' : 'none';
      });
    expect(marker, url).not.toBe('none');
  }
});

test('two file explorers on one page have distinct landmark names (axe clean)', async ({ page }) => {
  await open(page, '/design/structure-demo/');
  const results = await new AxeBuilder({ page }).withRules(['landmark-unique']).analyze();
  expect(results.violations).toEqual([]);
});
