import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const M6 = '/handbook/06-vasp-files/';
const M7 = '/handbook/07-running/';
const TOPICS = [
  ...['poscar', 'kpoints', 'incar', 'the-potcar-file', 'output-files'].map((t) => M6 + t + '/'),
  ...[
    'the-workflow',
    'job-scripts',
    'restarts-istart-icharg',
    'reading-oszicar-and-outcar',
    'vaspkit-in-practice',
  ].map((t) => M7 + t + '/'),
];

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

test.describe('modules 6 and 7', () => {
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

  test('no page shows POTCAR dataset content', async ({ page }) => {
    await ready(page, `${M6}the-potcar-file/`);
    const body = await page.locator('article').innerText();
    expect(body).not.toMatch(/End of Dataset|Pseudopotential strength for|gradient corrections used for XC/);
  });

  test('output reader: synthetic banner, checks, keyboard edit changes the verdict, reset restores', async ({
    page,
  }) => {
    await ready(page, `${M7}reading-oszicar-and-outcar/`);
    const lab = page.locator('[data-lab-id="output-reader"]');
    await expect(lab.getByText(/synthetic numbers/i)).toBeVisible();
    await expect(lab.getByRole('list', { name: 'Checks' })).toBeVisible();
    const before = await lab.locator('.lab-readout').allInnerTexts();
    await lab.getByLabel('Example file').selectOption('oszicar-stuck');
    await expect.poll(async () => lab.locator('.lab-readout').allInnerTexts()).not.toEqual(before);
    await lab.getByRole('button', { name: /reset/i }).click();
    await expect.poll(async () => lab.locator('.lab-readout').allInnerTexts()).toEqual(before);
  });

  test('output reader: pasting text is read locally and an OUTCAR sample is recognised', async ({ page }) => {
    await ready(page, `${M7}reading-oszicar-and-outcar/`);
    const lab = page.locator('[data-lab-id="output-reader"]');
    await lab.getByLabel('Example file').selectOption('outcar-v54');
    await expect(lab.locator('.lab-readout').first()).toContainText('OUTCAR');
  });

  test('POSCAR explorer: pressing a line opens its explanation', async ({ page }) => {
    await ready(page, `${M6}poscar/`);
    const poscar = page.getByRole('list', { name: 'POSCAR lines' });
    const line2 = poscar.getByRole('button', { name: /Line 2:/ });
    await line2.scrollIntoViewIfNeeded();
    await line2.focus();
    await page.keyboard.press('Enter');
    await expect(line2).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('region', { name: 'Explanation for POSCAR' })).toContainText(/scaling/i);
  });

  test('OSZICAR explorer in the output topic opens an annotation', async ({ page }) => {
    await ready(page, `${M6}output-files/`);
    const list = page.getByRole('list', { name: 'OSZICAR lines' });
    const line = list.getByRole('button', { name: /Line 4:/ });
    await line.scrollIntoViewIfNeeded();
    await line.click();
    await expect(page.getByRole('region', { name: 'Explanation for OSZICAR' })).toContainText(/ionic step/i);
  });

  test('mobile 360 px: output reader page has no horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await ready(page, `${M7}reading-oszicar-and-outcar/`);
    expect(await noOverflow(page)).toBe(true);
  });
});
