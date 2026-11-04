import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = '/tools/convergence/';
const osz = (e: number) =>
  `   1 F= ${e.toExponential(8).replace('e', 'E')} E0= ${e.toExponential(8).replace('e', 'E')}  d E =0.0E+00\n`;
// Hand-worked: -3.5150, -3.5200, -3.5205 eV for one atom at 400, 450, 500 eV.
const files = [
  { name: 'encut_400_OSZICAR', mimeType: 'text/plain', buffer: Buffer.from(osz(-3.515)) },
  { name: 'encut_450_OSZICAR', mimeType: 'text/plain', buffer: Buffer.from(osz(-3.52)) },
  { name: 'encut_500_OSZICAR', mimeType: 'text/plain', buffer: Buffer.from(osz(-3.5205)) },
];

async function drop(page: Page) {
  await page.goto(URL);
  await page.getByLabel(/^Choose OSZICAR or OUTCAR files/).setInputFiles(files);
  await page.getByLabel(/^Atoms in the cell/).fill('1');
}

test.describe('convergence plotter', () => {
  test('three OSZICAR files: marker at 450, moves to 400 with a 6 meV threshold', async ({ page }) => {
    await drop(page);
    await expect(page.getByTestId('plot-point')).toHaveCount(3);
    await expect(page.getByTestId('converged-marker')).toHaveAttribute('data-x', '450');
    await expect(page.getByTestId('explanation')).toContainText('from ENCUT = 450 eV');
    await page.getByLabel(/^Threshold/).fill('6');
    await expect(page.getByTestId('converged-marker')).toHaveAttribute('data-x', '400');
  });

  test('ENMAX gives the 1.3 x ENMAX advice', async ({ page }) => {
    await drop(page);
    await page.getByLabel(/^Largest ENMAX/).fill('400');
    await expect(page.getByTestId('explanation')).toContainText('1.3 x ENMAX = 520 eV');
  });

  test('pasted collect.sh output and the sample banner', async ({ page }) => {
    await page.goto(URL);
    await page
      .getByLabel(/^Or paste a table/)
      .fill(
        'label,E_sigma0,pressure_kB,nions\nencut_400,-14.0,3,4\nencut_450,-14.4,1,4\nencut_500,-14.42,0.5,4\n',
      );
    await page.getByRole('button', { name: 'Add pasted table' }).click();
    await expect(page.getByTestId('plot-point')).toHaveCount(6); // energy + pressure plots
    await page.getByRole('button', { name: 'Load sample data' }).click();
    await expect(page.getByText('Sample data.')).toBeVisible();
  });

  test('SVG export has the figure and the right number of points', async ({ page }) => {
    await drop(page);
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export energy SVG' }).click();
    const svg = readFileSync((await (await dl).path())!, 'utf8');
    expect(svg).toContain('<svg');
    expect(svg.match(/<circle/g)).toHaveLength(3);
    expect(svg).toContain('Energy (eV/atom)'.slice(0, 6));
    const png = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export energy PNG' }).click();
    const pngDl = await png;
    expect(pngDl.suggestedFilename()).toBe('convergence-energy.png');
    const bytes = readFileSync((await pngDl.path())!);
    expect(bytes.subarray(1, 4).toString()).toBe('PNG');
    expect(bytes.readUInt32BE(16)).toBe(1280); // 2x the 640 px figure width
    const csv = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export table CSV' }).click();
    expect(readFileSync((await (await csv).path())!, 'utf8')).toContain('450,-3.520000');
  });

  test('keyboard traversal of points', async ({ page }) => {
    await drop(page);
    const pts = page.getByTestId('plot-point');
    await pts.first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(pts.nth(1)).toBeFocused();
    await expect(page.locator('.cv-tip').first()).toContainText('x = 450');
    await page.keyboard.press('End');
    await expect(pts.nth(2)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(pts.first()).toBeFocused();
  });

  test('axe clean in both themes', async ({ page }) => {
    await drop(page);
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations, theme).toEqual([]);
    }
  });

  test('fits at 360 px', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-360', 'runs in the 360 px project');
    await drop(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
});
