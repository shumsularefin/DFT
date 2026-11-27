// Screenshots for review (no assertions): a Workflow step, a handbook topic and the previous and next buttons, at the
// width of the owner's screenshot. Saved to test-results/stage-shots with a ui- prefix; CI uploads them and prints
// them in a folded log group so a pull request can show them before and after a layout change.
import { test } from '@playwright/test';

const SHOTS = 'test-results/stage-shots';
const W = { width: 1650, height: 900 };

test.describe('ui shots', () => {
  test.skip(({ isMobile }) => isMobile, 'desktop only (D-105)');
  test.use({ reducedMotion: 'reduce' });

  test('workflow step, handbook topic, previous and next', async ({ page }) => {
    await page.setViewportSize(W);
    await page.goto('/workflow/prepare-inputs/');
    await page.screenshot({ path: `${SHOTS}/ui-workflow-1-top.png` });
    await page.locator('h2', { hasText: 'Five ways to run VASPkit' }).first().scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, -260));
    await page.screenshot({ path: `${SHOTS}/ui-workflow-2-body.png` });
    const wfNav = page.locator('nav.prev-next').first();
    await wfNav.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/ui-workflow-3-prevnext.png` });

    await page.goto('/handbook/06-vasp-files/incar/');
    await page.screenshot({ path: `${SHOTS}/ui-handbook-1-top.png` });
    await page.locator('nav.prev-next').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/ui-handbook-2-prevnext.png` });
  });
});
