import { beforeAll, describe, expect, it } from 'vitest';
import kp from '../../../tests/reference/kpaths.json';
import { BRAVAIS, buildBravais, volumeFactor, type BravaisId } from './bravais';
import { hpkotPath } from './kpath';
import { loadMoyoNode } from './moyo-node';
import { analyzeWith, type MoyoApi } from './symmetry';
import type { Mat3, Vec3 } from './types';

interface Golden {
  input: { lattice_rows: Mat3; frac_coords: Vec3[] };
}
const S = kp.structures as unknown as Record<string, Golden>;

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

const near = (a: Mat3, b: Mat3) =>
  a.forEach((row, i) => row.forEach((x, j) => expect(x).toBeCloseTo(b[i]![j]!, 9)));

describe('cells against the golden structures', () => {
  it('cF with a = 3.61 is the fcc Cu cell', () => {
    const r = buildBravais('cF', { a: 3.61 });
    expect(r.ok).toBe(true);
    near(r.structure!.lattice, S['fcc_Cu']!.input.lattice_rows);
  });
  it('hP with a = 3.21, c = 5.21 is the hcp Mg lattice', () => {
    const r = buildBravais('hP', { a: 3.21, c: 5.21 });
    near(r.structure!.lattice, S['hcp_Mg']!.input.lattice_rows);
  });
});

describe('validation', () => {
  it('rejects non-positive lengths and missing numbers', () => {
    expect(buildBravais('cP', { a: -1 }).errors.a).toMatch(/larger than zero/);
    expect(buildBravais('cP', { a: 0 }).ok).toBe(false);
    expect(buildBravais('cP', {}).errors.a).toMatch(/Enter a number/);
    expect(buildBravais('cP', { a: NaN }).ok).toBe(false);
  });
  it('rejects angles outside 0 to 180', () => {
    expect(buildBravais('hR', { a: 4, alpha: 0 }).errors.alpha).toMatch(/between 0 and 180/);
    expect(buildBravais('hR', { a: 4, alpha: 180 }).ok).toBe(false);
  });
  it('rejects angles that cannot close a cell', () => {
    const r = buildBravais('aP', { a: 3, b: 4, c: 5, alpha: 120, beta: 120, gamma: 120 });
    expect(r.ok).toBe(false);
    expect(r.errors.cell).toMatch(/no volume/);
    expect(buildBravais('hR', { a: 4, alpha: 120 }).ok).toBe(false);
  });
  it('volume factor is 1 for a right-angled cell and 0 for 120/120/120', () => {
    expect(volumeFactor(90, 90, 90)).toBeCloseTo(1, 12);
    expect(volumeFactor(120, 120, 120)).toBeCloseTo(0, 12);
  });
});

describe('every default is found as its own Bravais family (via moyo)', () => {
  const expected: Record<BravaisId, string> = {
    cP: 'cP',
    cI: 'cI',
    cF: 'cF',
    tP: 'tP',
    tI: 'tI',
    oP: 'oP',
    oC: 'oC',
    oI: 'oI',
    oF: 'oF',
    hP: 'hP',
    hR: 'hR',
    mP: 'mP',
    mC: 'mC',
    aP: 'aP',
  };
  for (const b of BRAVAIS) {
    it(b.id, () => {
      const r = buildBravais(b.id, b.defaults);
      expect(r.ok).toBe(true);
      const k = hpkotPath(analyzeWith(api, r.structure!, { symprec: 1e-4, setting: 'Spglib' }));
      expect(k.bravaisLattice).toBe(expected[b.id]);
    });
  }
});
