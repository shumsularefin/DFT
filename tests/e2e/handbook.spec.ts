import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TOPIC = '/handbook/00-start/how-to-use-this-site/';
const SECTION_IDS = [
  'why',
  'intuition',
  'lab',
  'math',
  'in-vasp',
  'what-changes',
  'mistakes',
  'check',
  'go-deeper',
];

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
}

test.describe('sample topic', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(TOPIC);
  });

  test('renders all nine sections in order, with a matching "On this page" list', async ({ page }) => {
    const ids = await page.locator('section.topic-section').evaluateAll((els) => els.map((e) => e.id));
    expect(ids).toEqual(SECTION_IDS);
    const links = await page
      .locator('nav[aria-label="On this page"] a')
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(links).toEqual(SECTION_IDS.map((i) => `#${i}`));
    await expect(page.locator('h1')).toHaveCount(1);
  });

  test('math is MathML', async ({ page }) => {
    await page.locator('details.themath summary').click();
    await expect(page.locator('math').first()).toBeVisible();
    expect(await page.locator('math').count()).toBeGreaterThanOrEqual(3);
    // build-time MathML only: no KaTeX HTML layer, no client-side renderer
    expect(await page.locator('.katex-html').count()).toBe(0);
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`axe finds no violations in the ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme);
      await page.locator('details.themath summary').click();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('360 px: no horizontal scroll', async ({ page }) => {
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
  });

  test('levels: attribute shows and hides Level blocks, default is Beginner', async ({ page }) => {
    const begin = page.getByText('At the Beginner level you see');
    const inter = page.getByText('At the Intermediate level and above');
    const pro = page.getByText('At the Pro level you also see');
    await expect(begin).toBeVisible();
    await expect(inter).toBeHidden();
    await expect(pro).toBeHidden();

    await page.evaluate(() => (document.documentElement.dataset.level = 'intermediate'));
    await expect(begin).toBeHidden();
    await expect(inter).toBeVisible();
    await expect(pro).toBeHidden();

    await page.evaluate(() => (document.documentElement.dataset.level = 'pro'));
    await expect(begin).toBeHidden();
    await expect(inter).toBeVisible();
    await expect(pro).toBeVisible();
  });

  test('stored level is applied before first paint', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('dft:level', JSON.stringify({ v: 1, data: 'pro' })));
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-level', 'pro');
    await expect(page.getByText('At the Pro level you also see')).toBeVisible();
  });

  test('Term: opens on focus, closes on Escape, described by the popover', async ({ page }) => {
    const link = page.locator('.term-link', { hasText: 'wavefunction' });
    const pop = page.locator(`#${await link.getAttribute('aria-describedby')}`);
    await expect(pop).toBeHidden();
    await link.focus();
    await expect(pop).toBeVisible();
    await expect(pop).toContainText('Wavefunction.');
    await page.keyboard.press('Escape');
    await expect(pop).toBeHidden();
    await link.click();
    await expect(pop).toBeVisible();
    await page.locator('h1').click();
    await expect(pop).toBeHidden();
  });

  test('Cite numbers by first use and links to the references page', async ({ page }) => {
    const cites = page.locator('sup.cite a');
    await expect(cites).toHaveText(['[1]', '[2]']);
    await expect(page.locator('#go-deeper .cite-list li')).toHaveCount(2);
    await expect(page.locator('#go-deeper a[href="/references/#S-031"]')).toBeVisible();
  });

  test('code block is a VASP file with a copy button', async ({ page }) => {
    await expect(page.locator('[data-codeblock] .tok-tag').first()).toHaveText('SYSTEM');
    await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  });
});

test('Term works without JavaScript as a link to the glossary', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(TOPIC);
  const link = page.locator('.term-link', { hasText: 'wavefunction' });
  await expect(link).toHaveAttribute('href', '/glossary/#wavefunction');
  await expect(link).toHaveAttribute('title', /describes the quantum state/);
  await context.close();
});

test('references page lists every source with its status', async ({ page }) => {
  await page.goto('/references/');
  const rows = await page.locator('.refs li').count();
  const fs = await import('node:fs');
  const register = fs
    .readFileSync('docs/SCIENCE_SOURCES.md', 'utf8')
    .split('\n')
    .filter((l) => l.startsWith('| S-')).length;
  expect(rows).toBe(register);
  await expect(page.locator('#S-031 .ref-status')).toHaveText('cross-checked');
  await expect(page.getByText('written from memory and has not been checked')).toBeVisible();
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

for (const path of ['/glossary/', '/handbook/']) {
  test(`${path} passes axe`, async ({ page }) => {
    await page.goto(path);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
}
