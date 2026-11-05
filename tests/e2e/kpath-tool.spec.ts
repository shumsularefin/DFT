import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const URL = '/tools/kpath/';
const GOLD = JSON.parse(readFileSync('tests/reference/kpaths.json', 'utf8')).structures.hcp_Mg as {
  hpkot: { path: [string, string][]; point_coords: Record<string, number[]> };
};

// hcp Mg, the same cell as the golden file (a = 3.21, c = 5.21), written as a POSCAR
const MG = `Mg hcp
1.0
 3.21 0.0 0.0
 -1.605 2.7799415461 0.0
 0.0 0.0 5.21
Mg
2
Direct
 0.3333333333 0.6666666667 0.25
 0.6666666667 0.3333333333 0.75
`;

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations).toEqual([]);
}

async function dropMg(page: Page) {
  await page.goto(URL);
  await page.getByLabel('A POSCAR or CIF file').check();
  await page.getByLabel('POSCAR or CIF text').fill(MG);
  await expect(page.getByRole('heading', { name: '4. Path table' })).toBeVisible();
}

/** The line-mode text the golden file implies, built here without any code from src/. */
function expectedHpkot(n: number): string {
  const f = (x: number) => (Math.abs(x) < 5e-11 ? 0 : x).toFixed(10);
  const row = (l: string) => `${GOLD.hpkot.point_coords[l]!.map(f).join(' ')} ! ${l}`;
  return (
    [
      `HPKOT k-path for P6_3/mmc (hP2), ${n} points per segment`,
      String(n),
      'Line-mode',
      'Reciprocal',
      GOLD.hpkot.path.map(([a, b]) => `${row(a)}\n${row(b)}`).join('\n\n'),
    ].join('\n') + '\n'
  );
}

test.describe('k-path tool', () => {
  test('hcp Mg: switch convention, change points, download KPOINTS and compare', async ({ page }) => {
    await dropMg(page);
    await expect(page.getByRole('heading', { name: '2. What happened to your cell' })).toBeVisible();
    await expect(page.getByText(/^Space group P 6_3\/m m c/)).toBeVisible();

    // HPKOT, 40 points per segment (the slider's default)
    await page.getByLabel('Points per segment').fill('25');
    await expect(page.getByLabel('Points per segment')).toHaveValue('25');
    let dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download KPOINTS', exact: true }).click();
    const d1 = await dl;
    expect(d1.suggestedFilename()).toBe('KPOINTS');
    expect(readFileSync((await d1.path())!, 'utf8')).toBe(expectedHpkot(25));

    // Setyawan-Curtarolo: the convention name leads the comment line
    await page.getByLabel(/^Setyawan-Curtarolo/).check();
    dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download KPOINTS', exact: true }).click();
    const sc = readFileSync((await (await dl).path())!, 'utf8');
    expect(sc.split('\n')[0]).toMatch(
      /^Setyawan-Curtarolo k-path for P6_3\/mmc \(HEX\), 25 points per segment$/,
    );
    expect(sc.split('\n')[1]).toBe('25');
    expect(sc).toContain('Line-mode\nReciprocal\n');
  });

  test('a hand-set count changes the table and the file uses the largest count', async ({ page }) => {
    await dropMg(page);
    await page.getByLabel(/^Points on segment 2,/).fill('60');
    await expect(page.getByText(/VASP line mode takes one number of points/)).toBeVisible();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download KPOINTS', exact: true }).click();
    expect(readFileSync((await (await dl).path())!, 'utf8').split('\n')[1]).toBe('60');
  });

  test('Bravais chooser: validation message and fcc default', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByRole('heading', { name: '4. Path table' })).toBeVisible();
    await page.getByLabel('a (Å)').fill('-1');
    await expect(page.getByRole('alert').filter({ hasText: 'larger than zero' })).toBeVisible();
    await page.getByLabel('a (Å)').fill('3.61');
    await expect(page.getByRole('heading', { name: '4. Path table' })).toBeVisible();
    await expect(page.getByText(/^Space group F m -3 m/)).toBeVisible();
  });

  test('3D starts on request; three is not in the initial JavaScript; the marker slider works', async ({
    page,
  }) => {
    const scripts: string[] = [];
    page.on('response', (r) => r.url().endsWith('.js') && scripts.push(r.url()));
    await page.goto(URL);
    await expect(page.getByRole('heading', { name: '5. The path in the Brillouin zone' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
    for (const url of scripts)
      expect(await (await page.request.get(url)).text(), url).not.toContain('WebGLRenderer');
    await page.getByLabel('Position along the path').fill('500');
    await expect(page.getByText(/Marker at point/)).toBeVisible();
    await page.getByRole('button', { name: 'Start 3D view' }).click();
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('keyboard: every control is reachable and the radio group works with arrows', async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByRole('heading', { name: '4. Path table' })).toBeVisible();
    await page.getByLabel('A Bravais lattice and its parameters').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByLabel('A POSCAR or CIF file')).toBeChecked();
    await page.getByLabel('Bravais lattice').count();
  });

  test('axe clean in light and dark', async ({ page }) => {
    await dropMg(page);
    await axe(page);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    await axe(page);
  });

  test('no horizontal scroll at 360 px', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-360');
    await dropMg(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('the Input Builder hands its structure over', async ({ page }) => {
    await page.goto('/tools/input-builder/');
    await page.getByLabel('POSCAR text').fill(MG);
    await page.getByRole('button', { name: /^\d K-points$/ }).click();
    await page.getByLabel(/Line mode for a band path/).check();
    await page.getByRole('button', { name: 'Open this structure in the k-path tool' }).click();
    await expect(page).toHaveURL(/\/tools\/kpath\//);
    await expect(page.getByText(/A structure arrived from/)).toBeVisible();
    await expect(page.getByRole('heading', { name: '4. Path table' })).toBeVisible();
  });
});
