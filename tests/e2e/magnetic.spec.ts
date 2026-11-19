import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { strFromU8, unzipSync } from 'fflate';

const URL = '/tools/magnetic/';
const kp = JSON.parse(readFileSync('tests/reference/kpaths.json', 'utf8')).structures as Record<
  string,
  { input: { lattice_rows: number[][]; frac_coords: number[][]; atomic_numbers: number[] } }
>;
const mag = JSON.parse(readFileSync('tests/reference/magnetic_reference.json', 'utf8')) as {
  orderings: Record<
    string,
    {
      magnetic_element: string;
      axis: string;
      cases: Record<
        string,
        { minimal_det: number; minimal_cell: { n_atoms: number; n_up: number; n_down: number } }
      >;
    }
  >;
  common_supercell: Record<string, { det: number }>;
  enumeration: Record<string, { n_classes: number; n_magnetic: number }>;
};
const Z: Record<number, string> = {
  8: 'O',
  22: 'Ti',
  38: 'Sr',
  29: 'Cu',
  57: 'La',
  39: 'Y',
  20: 'Ca',
  12: 'Mg',
  25: 'Mn',
  11: 'Na',
};

/** A POSCAR for a golden fixture, written here with no code from src/. */
function poscar(name: string): string {
  const d = kp[name]!.input;
  const sym = d.atomic_numbers.map((z) => Z[z] ?? `X${z}`);
  const order = [...new Set(sym)];
  const idx = order.flatMap((s) => sym.flatMap((x, i) => (x === s ? [i] : [])));
  return [
    name,
    '1.0',
    ...d.lattice_rows.map((r) => r.map((x) => x.toFixed(10)).join(' ')),
    order.join(' '),
    order.map((s) => sym.filter((x) => x === s).length).join(' '),
    'Direct',
    ...idx.map((i) => d.frac_coords[i]!.map((x) => x.toFixed(10)).join(' ')),
    '',
  ].join('\n');
}

async function axe(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(r.violations).toEqual([]);
}

async function load(page: Page, name: string, element: string, moment = '4') {
  await page.goto(URL);
  await page.waitForFunction(() => document.querySelectorAll('astro-island[ssr]').length === 0);
  await page.getByLabel('Paste a POSCAR or CIF, or choose a file').fill(poscar(name));
  await expect(page.getByLabel(`Starting moment for ${element} (μB)`)).toBeVisible();
  await page.getByLabel(`Starting moment for ${element} (μB)`).fill(moment);
}

const STO = 'cubic_perovskite_SrTiO3';
const PNMA = 'pnma_perovskite_like';

test.describe('magnetic tool', () => {
  test('G-type in the smallest cell: golden atom count, one up and one down magnetic site', async ({
    page,
  }) => {
    const g = mag.orderings[STO]!;
    await load(page, STO, g.magnetic_element);
    await page.getByLabel('Smallest cell per ordering').check();
    await page.getByRole('tab', { name: 'G-type' }).click();
    const t = page.getByRole('region', { name: 'What was computed' });
    const c = g.cases.G!.minimal_cell;
    await expect(t).toContainText(`Cell: ${c.n_atoms} atoms`);
    await expect(t).toContainText(`(${c.n_up} up, ${c.n_down} down)`);
    await expect(page.getByTestId('magmom')).toBeVisible();
  });

  test('one common cell by default: every POSCAR has the same lattice and atom order, MAGMOM matches the golden counts', async ({
    page,
  }) => {
    const g = mag.orderings[STO]!;
    await load(page, STO, g.magnetic_element);
    const [dl] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download all' }).click(),
    ]);
    const path = await dl.path();
    const z = unzipSync(new Uint8Array(readFileSync(path!)));
    const det = mag.common_supercell[STO]!.det;
    const natoms = kp[STO]!.input.atomic_numbers.length * det;
    const kinds = ['FM', 'A', 'C', 'G'];
    const lat = kinds.map((k) => strFromU8(z[`${k}/POSCAR`]!).split('\n').slice(2, 8).join('\n'));
    for (const l of lat) expect(l).toBe(lat[0]);
    for (const k of kinds) {
      const inc = strFromU8(z[`${k}/INCAR`]!);
      const line = inc.split('\n').find((l) => l.startsWith('MAGMOM'))!;
      const vals = line
        .split('=')[1]!
        .split(/[!#]/)[0]!
        .trim()
        .split(/\s+/)
        .flatMap((t) => {
          const m = /^(\d+)\*(.+)$/.exec(t);
          return m ? Array(Number(m[1])).fill(Number(m[2])) : [Number(t)];
        });
      expect(vals.length).toBe(natoms);
      const up = vals.filter((v) => v > 0).length;
      const down = vals.filter((v) => v < 0).length;
      if (k === 'FM') expect(down).toBe(0);
      else expect(up).toBe(down);
      const nMag = kp[STO]!.input.atomic_numbers.filter((z) => Z[z] === g.magnetic_element).length;
      expect(up + down).toBe(nMag * det);
    }
    expect(Object.keys(z)).toContain('README.md');
    expect(strFromU8(z['README.md']!)).toContain('same cell and the same atom order');
    expect(strFromU8(z['make_potcar.sh']!)).not.toMatch(/ENMAX|VRHFIN/);
  });

  test('smallest cell per ordering says the k-meshes need separate convergence', async ({ page }) => {
    await load(page, STO, mag.orderings[STO]!.magnetic_element);
    await page.getByLabel('Smallest cell per ordering').check();
    await expect(page.getByText('k-meshes then need separate convergence')).toBeVisible();
  });

  test('Pnma fixture: A-type picks the long axis', async ({ page }) => {
    const g = mag.orderings[PNMA]!;
    await load(page, PNMA, g.magnetic_element);
    await page.getByRole('tab', { name: 'A-type' }).click();
    await expect(page.getByText(`longest lattice vector (${g.axis[0]})`)).toBeVisible();
    await expect(page.getByRole('region', { name: 'What was computed' })).toContainText('atoms');
    await expect(page.locator('svg').first()).toBeVisible();
  });

  test('custom mode works with the keyboard only', async ({ page }) => {
    await load(page, STO, mag.orderings[STO]!.magnetic_element);
    await page.getByRole('tab', { name: 'G-type' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Rock-salt II' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Custom' })).toHaveAttribute('aria-selected', 'true');
    await page.locator('#mg-site-1').focus();
    await page.keyboard.press('u');
    await expect(page.locator('#mg-site-1')).toHaveAttribute('aria-label', /spin up/);
    await expect(page.getByTestId('magmom')).toContainText('4.0');
    // a spin on a site with no moment entered is an error, never a guessed number
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('d');
    await expect(page.locator('#mg-site-2')).toHaveAttribute('aria-label', /spin down/);
    await expect(page.getByText('Enter a positive starting magnitude for O')).toBeVisible();
    await page.keyboard.press('0');
    await expect(page.getByTestId('magmom')).toBeVisible();
  });

  test('enumerate: a 1x1x2 cell lists the golden number of classes', async ({ page }) => {
    const g = mag.enumeration.cubic_perovskite_SrTiO3_112!;
    await load(page, STO, mag.orderings[STO]!.magnetic_element);
    await page.getByRole('tab', { name: 'Enumerate' }).click();
    await page.getByLabel('Repeat along c').selectOption('2');
    await page.getByRole('button', { name: 'Enumerate' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'distinct arrangement' })).toContainText(
      `${g.n_classes} distinct arrangements of ${g.n_magnetic} magnetic sites`,
    );
    await expect(page.getByRole('checkbox', { name: /Configuration 01/ })).toBeVisible();
  });

  test('works at 360 px, axe clean', async ({ page }) => {
    await load(page, STO, mag.orderings[STO]!.magnetic_element);
    await axe(page);
    const w = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(w).toBe(true);
  });
});
