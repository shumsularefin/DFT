import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const TOPIC = '/handbook/00-start/how-to-use-this-site/';
const BEGINNER_TEXT = 'At the Beginner level you see the simplest correct version';
const PRO_TEXT = 'At the Pro level you also see the equations in full';

/** The mobile project keeps the header menu closed; open it so the controls are reachable. */
async function openMenu(page: Page) {
  const btn = page.getByRole('button', { name: 'Menu' });
  if (await btn.isVisible()) {
    if ((await btn.getAttribute('aria-expanded')) === 'false') await btn.click();
  }
}

test.describe('level, theme and progress', () => {
  test('level persists across reload and changes visible text', async ({ page }) => {
    await page.goto(TOPIC);
    await expect(page.getByText(BEGINNER_TEXT)).toBeVisible();
    await expect(page.getByText(PRO_TEXT)).toBeHidden();
    await openMenu(page);
    await page.getByRole('radio', { name: 'Pro' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-level', 'pro');
    await expect(page.getByText(PRO_TEXT)).toBeVisible();
    await expect(page.getByText(BEGINNER_TEXT)).toBeHidden();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-level', 'pro');
    await expect(page.getByText(PRO_TEXT)).toBeVisible();
    await openMenu(page);
    await expect(page.getByRole('radio', { name: 'Pro' })).toBeChecked();
  });

  test('level switch is a radiogroup operable with arrow keys', async ({ page }) => {
    await page.goto('/');
    await openMenu(page);
    await expect(page.getByRole('radiogroup', { name: 'Reading level' })).toBeVisible();
    await page.getByRole('radio', { name: 'Beginner' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('radio', { name: 'Intermediate' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Intermediate' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('radio', { name: 'Beginner' })).toBeChecked();
  });

  test('theme persists across reload', async ({ page }) => {
    await page.goto('/');
    await openMenu(page);
    const toggle = page.getByRole('button', { name: 'Dark theme' });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await openMenu(page);
    await expect(page.getByRole('button', { name: 'Dark theme' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('progress: visit, mark complete, persist, reset with confirmation', async ({ page }) => {
    await page.goto(TOPIC);
    await openMenu(page);
    await expect(page.locator('[data-progress-count]')).toHaveText('0 of 5');
    await page.getByRole('button', { name: 'Mark complete' }).click();
    await expect(page.locator('[data-progress-count]')).toHaveText('1 of 5');
    // the sidebar is collapsed on phones, so check the tick's state rather than its visibility
    await expect(page.locator('[data-topic-item="00-start/how-to-use-this-site"] .tick')).not.toHaveAttribute(
      'hidden',
    );
    await page.reload();
    await openMenu(page);
    await expect(page.locator('[data-progress-count]')).toHaveText('1 of 5');
    await expect(page.getByRole('button', { name: /Completed/ })).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: /Progress:/ }).click();
    await page.getByRole('button', { name: 'Reset progress' }).click();
    await expect(page.getByText('Erase all progress on this device?')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('[data-progress-count]')).toHaveText('1 of 5');
    await page.getByRole('button', { name: 'Reset progress' }).click();
    await page.getByRole('button', { name: 'Yes, reset' }).click();
    await expect(page.locator('[data-progress-count]')).toHaveText('0 of 5');
  });

  test('keyboard shortcuts: help dialog, theme, level', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'shortcuts are for physical keyboards');
    await page.goto('/');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.keyboard.press('3');
    await expect(page.locator('html')).toHaveAttribute('data-level', 'pro');
    await page.keyboard.press('t');
    await expect(page.locator('html')).toHaveAttribute('data-theme', /light|dark/);
  });
});

test.describe('storage blocked', () => {
  test.beforeEach(async ({ context }) => {
    await context.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
  });

  test('everything still works, defaults apply, nothing throws', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(TOPIC);
    await expect(page.locator('html')).not.toHaveAttribute('data-level', /pro|intermediate/);
    await openMenu(page);
    await page.getByRole('radio', { name: 'Intermediate' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-level', 'intermediate');
    await page.getByRole('button', { name: 'Mark complete' }).click();
    await expect(page.locator('[data-progress-count]')).toHaveText('1 of 5');
    await page.reload();
    await expect(page.locator('html')).not.toHaveAttribute('data-level', 'intermediate');
    await expect(page.locator('h1')).toHaveCount(1);
    expect(errors).toEqual([]);
  });
});

test.describe('search', () => {
  test('finds the sample topic, grouped by module, and opens it', async ({ page }) => {
    await page.goto('/');
    await openMenu(page);
    const box = page.getByRole('searchbox', { name: 'Search the handbook' });
    await box.fill('electron');
    const hit = page.locator('.search-hit', { hasText: 'How to use this site' });
    await expect(hit).toBeVisible();
    await expect(page.locator('.search-group').first()).toContainText('Why DFT exists');
    await hit.click();
    await expect(page).toHaveURL(new RegExp(`${TOPIC}$`));
  });

  test('the design gallery is not indexed', async ({ page }) => {
    await page.goto('/');
    await openMenu(page);
    await page.getByRole('searchbox', { name: 'Search the handbook' }).fill('gallery');
    await expect(page.locator('[data-search-status]')).not.toHaveText('Searching...');
    await expect(page.locator('[data-search-results] a[href*="/design/"]')).toHaveCount(0);
  });

  test('"/" focuses search and Escape closes the results', async ({ page, isMobile }) => {
    test.skip(!!isMobile, 'shortcut test');
    await page.goto('/');
    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('density');
    await expect(page.locator('[data-search-results]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-search-results]')).toBeHidden();
  });
});

test.describe('navigation', () => {
  test('header is keyboard navigable and marks the current page', async ({ page, isMobile }) => {
    await page.goto('/handbook/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'DFT Handbook' }).first()).toBeFocused();
    if (isMobile) {
      await page.keyboard.press('Tab');
      const menu = page.getByRole('button', { name: 'Menu' });
      await expect(menu).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(menu).toHaveAttribute('aria-expanded', 'true');
      // focus moves into the opened menu
      await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link').first()).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(menu).toHaveAttribute('aria-expanded', 'false');
      await expect(menu).toBeFocused();
    } else {
      await page.keyboard.press('Tab');
      await expect(
        page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Handbook' }),
      ).toBeFocused();
    }
    await openMenu(page);
    await expect(
      page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Handbook' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('tap targets in the header are at least 44px', async ({ page }) => {
    await page.goto('/');
    await openMenu(page);
    const small = await page.locator('.site-header :is(a, button, input):visible').evaluateAll((els) =>
      els
        .map((e) => ({
          t: e.textContent?.trim() || e.getAttribute('aria-label'),
          h: e.getBoundingClientRect().height,
        }))
        .filter((x) => x.h < 43.5),
    );
    expect(small).toEqual([]);
  });

  test('topic page has sidebar, breadcrumbs and the module link', async ({ page }) => {
    await page.goto(TOPIC);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Why DFT exists');
    await expect(page.getByRole('navigation', { name: 'Handbook modules' })).toBeAttached();
    await expect(page.getByRole('navigation', { name: 'On this page' })).toBeVisible();
  });

  test('handbook index lists all eleven modules', async ({ page }) => {
    await page.goto('/handbook/');
    await expect(page.locator('.module-map > li')).toHaveCount(11);
    await expect(page.getByRole('link', { name: 'How to use this site' })).toBeVisible();
  });

  test('tools page has no links to unbuilt tools, and nav anchors resolve', async ({ page }) => {
    await page.goto('/tools/');
    await expect(page.getByText('Coming soon')).toHaveCount(7);
    for (const id of ['studio', 'builder', 'practice']) await expect(page.locator(`#${id}`)).toBeAttached();
  });

  test('changelog renders the markdown', async ({ page }) => {
    await page.goto('/changelog/');
    await expect(page.getByRole('heading', { level: 1, name: 'Changelog' })).toBeVisible();
  });
});

test('a visited page reloads offline', async ({ page, context }) => {
  await page.goto(TOPIC);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.reload(); // controlled load stores the page in the runtime cache
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('h1')).toHaveText('How to use this site');
  await context.setOffline(false);
});

const PAGES = ['/', '/handbook/', TOPIC, '/about/', '/privacy/', '/references/', '/tools/', '/changelog/'];
for (const theme of ['light', 'dark'] as const) {
  test.describe(`axe, ${theme} theme`, () => {
    for (const path of PAGES) {
      test(`${path}`, async ({ page }) => {
        await page.addInitScript((t) => {
          localStorage.setItem('dft:theme', JSON.stringify({ v: 1, data: t }));
        }, theme);
        await page.goto(path);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow).toBeLessThanOrEqual(0);
      });
    }
    test('menu open and progress popover open', async ({ page }) => {
      await page.addInitScript((t) => {
        localStorage.setItem('dft:theme', JSON.stringify({ v: 1, data: t }));
      }, theme);
      await page.goto(TOPIC);
      await openMenu(page);
      await page.getByRole('button', { name: /Progress:/ }).click();
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations).toEqual([]);
    });
  });
}
