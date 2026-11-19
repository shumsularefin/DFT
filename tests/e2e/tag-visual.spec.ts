import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe('See what a tag does (M12.5)', () => {
  test('ISPIN card: nothing loads until "Show me", then the picture follows the value', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));
    await page.goto('/tools/input-builder/?tag=ISPIN');
    const card = page.getByRole('complementary', { name: /Explanation of ISPIN/ });
    await expect(card).toBeVisible();
    expect(requests.some((u) => /three/i.test(u))).toBe(false);
    await expect(card.getByTestId('qc-figure')).toHaveCount(0);
    await card.getByText('Show me').click();
    await expect(card.getByTestId('qc-figure')).toBeVisible();
    expect(requests.some((u) => /three/i.test(u))).toBe(false);
    // the preset value of ISPIN is edited in the table: switch it and read the text alternative again
    const alt = async () => {
      await card.getByText('Text description').click();
      return card.locator('.scene-alt p').innerText();
    };
    const before = await alt();
    const field = page.getByLabel('Value of ISPIN');
    const was = await field.inputValue();
    await field.fill(was === '2' ? '1' : '2');
    await expect(card.locator('.scene-alt p')).not.toHaveText(before);
    await expect(card.locator('figcaption')).toContainText(/ISPIN = (1|2)/);
  });

  test('a value the data does not describe gives a message, not a picture', async ({ page }) => {
    await page.goto('/tools/input-builder/?tag=ISPIN');
    const card = page.getByRole('complementary', { name: /Explanation of ISPIN/ });
    await card.getByText('Show me').click();
    await page.getByLabel('Value of ISPIN').fill('3');
    await expect(card.getByRole('status')).toContainText(/no picture/i);
  });

  test('handbook topic: Show me, no overflow, axe clean', async ({ page }) => {
    await page.goto('/handbook/05-practical-choices/plane-waves-and-encut/');
    await page.getByTestId('tag-visual').first().scrollIntoViewIfNeeded();
    const tv = page.locator('astro-island:not([ssr]) [data-testid="tag-visual"]').first();
    await tv.waitFor();
    await tv.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(tv.getByTestId('qc-figure')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  });
});
