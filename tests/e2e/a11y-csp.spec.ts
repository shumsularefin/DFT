import { expect, test } from '@playwright/test';

const ROUTES = [
  '/',
  '/handbook/',
  '/tools/',
  '/tools/input-builder/',
  '/tools/planner/',
  '/tools/review/',
  '/tools/tolerance-factor/',
  '/studio/',
  '/builder/',
  '/practice/',
];

test.describe('M11.2 accessibility, layout, and CSP smoke checks', () => {
  for (const route of ROUTES) {
    test(`no horizontal overflow at 360px and no CSP violations on ${route}`, async ({ page }) => {
      const violations: string[] = [];
      await page.addInitScript(() => {
        window.addEventListener('securitypolicyviolation', (e) => {
          (window as unknown as { __csp?: string[] }).__csp ??= [];
          (window as unknown as { __csp: string[] }).__csp.push(`${e.violatedDirective}: ${e.blockedURI}`);
        });
      });
      await page.setViewportSize({ width: 360, height: 800 });
      await page.goto(route, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(2);
      const csp = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []);
      violations.push(...csp);
      expect(violations).toEqual([]);
    });
  }
});
