import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The e2e build has no PUBLIC_FIREBASE_* variables, so the feature must be absent (M6.5 "Done when").
// The configured path (button, lazy SDK load, error state) was exercised by hand against a build with a
// dummy config and is recorded in docs/reports/M6.5.md; the engine and the rules have their own tests.
test.describe('optional sync is hidden without configuration', () => {
  test('progress page has no sign-in button and loads no Firebase or Google script', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto('/progress/');
    await expect(page.getByRole('heading', { name: 'Your progress', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in to sync' })).toHaveCount(0);
    await expect(page.getByTestId('sync-panel')).toHaveCount(0);
    expect(urls.filter((u) => /googleapis|gstatic|firebase|apis\.google/.test(u))).toEqual([]);
  });

  test('practice page shows no sync status and sends nothing to Google', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await page.goto('/practice/');
    await expect(page.getByRole('heading', { name: 'Practice', level: 1 })).toBeVisible();
    await expect(page.getByTestId('sync-status')).toHaveCount(0);
    expect(urls.filter((u) => /googleapis|gstatic|firebase|apis\.google/.test(u))).toEqual([]);
  });

  test('privacy page explains the optional sync and is axe clean', async ({ page }) => {
    await page.goto('/privacy/');
    await expect(page.getByRole('heading', { name: 'Optional sync' })).toBeVisible();
    await expect(page.getByText('Delete my synced data').first()).toBeVisible();
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
