import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { unzipSync, strFromU8 } from 'fflate';

interface Case {
  name: string;
  volumes: number[];
  energies: number[];
  pymatgen?: { v0: number; b0_GPa: number; b1: number };
}
const ref = JSON.parse(readFileSync('tests/reference/eos_reference.json', 'utf8')) as {
  cases: Case[];
  bad: Case[];
};
const csv = (c: Case) => c.volumes.map((v, i) => `${v},${c.energies[i]}`).join('\n');
const noisy = ref.cases.find((c) => c.name === 'set_b_birch_murnaghan_noisy')!;
const URL = '/tools/eos/';

async function paste(page: import('@playwright/test').Page, text: string) {
  await page.goto(URL);
  // Wait for hydration: text filled into the server-rendered textarea is reset when React hydrates (Q-052).
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
  await page.getByLabel(/Or paste a table/).fill(text);
  await page.getByRole('button', { name: 'Add pasted table' }).click();
}

test.describe('equation-of-state tool', () => {
  test('pasted golden points give the pymatgen V0, B0 and B0p, all with units', async ({ page }) => {
    await paste(page, csv(noisy));
    const pm = noisy.pymatgen!;
    await expect(page.getByTestId('v0')).toContainText(`${pm.v0.toFixed(4)}`);
    await expect(page.getByTestId('v0')).toContainText('Å³ per cell');
    await expect(page.getByTestId('b0')).toContainText(`${pm.b0_GPa.toFixed(2)}`);
    await expect(page.getByTestId('b0')).toContainText(/GPa .* eV\/Å³/);
    await expect(page.getByTestId('b1')).toContainText(pm.b1.toFixed(3));
    await expect(page.getByTestId('b1')).toContainText('(dimensionless)');
    await expect(page.getByTestId('e0')).toContainText('eV per cell');
    await expect(page.getByTestId('rms')).toContainText('meV per cell');
    await expect(page.getByTestId('plot-point')).toHaveCount(11);
    await expect(page.getByTestId('eos-curve')).toHaveCount(1);
    // every result line carries a unit
    for (const dd of await page.getByTestId('eos-results').locator('dd').allTextContents())
      expect(dd).toMatch(/Å³|GPa|dimensionless|eV|meV|Levenberg/);
  });

  test('warnings fire on the bad-sampling fixtures', async ({ page }) => {
    const want: Record<string, string> = {
      bad_minimum_outside: 'minimum-outside',
      bad_four_points: 'too-few-points',
      bad_asymmetric: 'asymmetric',
      bad_large_residuals: 'large-residuals',
    };
    for (const [name, code] of Object.entries(want)) {
      await paste(page, csv(ref.bad.find((c) => c.name === name)!));
      await expect(page.getByTestId('eos-warnings').locator(`[data-code="${code}"]`), name).toBeVisible();
    }
    await expect(page.getByTestId('eos-warnings').locator('[data-code="asymmetric"]')).toHaveCount(0);
    await expect(page.getByTestId('eos-warnings')).toContainText('Heuristic');
  });

  test('sample banner, lattice constant, exports and keyboard on the plot', async ({ page }) => {
    await page.goto(URL);
    await page.getByRole('button', { name: 'Load sample data' }).click();
    await expect(page.getByTestId('sample-banner')).toContainText('synthetic');
    await page.getByLabel('Cell type, for the lattice constant').selectOption('fcc');
    await expect(page.getByTestId('lattice')).toContainText(/\d\.\d{4} .* Å$/);
    for (const [name, file] of [
      ['Export SVG', 'eos-fit.svg'],
      ['Export PNG', 'eos-fit.png'],
      ['Export CSV', 'eos-fit.csv'],
    ] as const) {
      const dl = page.waitForEvent('download');
      await page.getByRole('button', { name }).click();
      expect((await dl).suggestedFilename()).toBe(file);
    }
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const text = readFileSync((await (await dl).path())!, 'utf8');
    expect(text).toMatch(/B0 = .* GPa/);
    await page.getByTestId('plot-point').first().focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('plot-point').nth(1)).toBeFocused();
    await expect(page.locator('.cv-tip')).toContainText('vol_0.960');
  });

  test('too few points and an invented volume-less row are refused with a reason', async ({ page }) => {
    await paste(page, '10,-1\n11,-1.1\n12,-1.05');
    await expect(page.getByRole('alert').filter({ hasText: /at least 4 points/ })).toBeVisible();
    await page.getByLabel('Row 1 volume').fill('');
    await expect(page.getByText(/Row 1 left out/)).toBeVisible();
  });

  test('axe clean in both themes', async ({ page }) => {
    await paste(page, csv(ref.bad.find((c) => c.name === 'bad_asymmetric')!));
    for (const theme of ['light', 'dark']) {
      await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations, theme).toEqual([]);
    }
  });

  test('fits at 360 px without horizontal scroll', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile-360', 'runs in the 360 px project');
    await paste(page, csv(noisy));
    await page.getByLabel('Cell type, for the lattice constant').selectOption('bcc');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  });
});

test.describe('Input Builder EOS mode', () => {
  test('writes 7 fixed-volume folders with ISIF 2 for fcc Cu and a collect.sh with volumes', async ({
    page,
  }) => {
    await page.goto('/tools/input-builder/');
    await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
    await page.getByRole('button', { name: 'Convergence series' }).click();
    await page
      .getByLabel('POSCAR text')
      .fill(readFileSync('src/lib/crystal/__fixtures__/cu-fcc.vasp', 'utf8'));
    await page.getByLabel('Largest ENMAX in your POTCAR (eV)').fill('400');
    await page.getByLabel('Equation of state (energy-volume scan)').check();
    await expect(page.getByText(/7 runs \(limit 40\)/)).toBeVisible();
    await expect(page.getByLabel(/The cell is cubic/)).toBeChecked();
    const dl = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download zip' }).click();
    expect((await dl).suggestedFilename()).toBe('eos-series.zip');
    const files = unzipSync(new Uint8Array(readFileSync((await (await dl).path())!)));
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining(['01_eos/vol_0.940/POSCAR', '01_eos/vol_1.060/INCAR']),
    );
    expect(strFromU8(files['01_eos/vol_1.000/INCAR']!)).toMatch(/ISIF\s*=\s*2/);
    expect(strFromU8(files['collect.sh']!)).toContain('volume of cell');
    expect(Object.keys(files).some((n) => n.split('/').some((p) => /^potcar$/i.test(p)))).toBe(false);
    await page.getByLabel(/The cell is cubic/).uncheck();
    const dl2 = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download zip' }).click();
    const f2 = unzipSync(new Uint8Array(readFileSync((await (await dl2).path())!)));
    expect(strFromU8(f2['01_eos/vol_1.000/INCAR']!)).toMatch(/ISIF\s*=\s*4/);
  });
});
