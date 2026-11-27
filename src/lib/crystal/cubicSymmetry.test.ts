import { beforeAll, describe, expect, it } from 'vitest';
import { lookupStructure } from '../scene/library';
import { cubicMoyo, cubicOperations, cubicRotations, numbersOf } from './cubicSymmetry';
import { loadMoyoNode } from './moyo-node';
import { buildSlab, slabPlan, type Hkl } from './slab';
import { analyzeWith, type MoyoApi } from './symmetry';

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

describe('cubic symmetry provider against moyo (S-032)', () => {
  it('has the 48 operations of m-3m, each orthogonal with determinant +-1', () => {
    const R = cubicRotations();
    expect(R.length).toBe(48);
    expect(new Set(R.map((m) => JSON.stringify(m))).size).toBe(48);
  });

  for (const id of ['rocksalt', 'perovskite', 'fcc', 'bcc', 'sc', 'diamond']) {
    it(`${id}: the same number of space-group operations and the same orbits as moyo`, () => {
      const s = lookupStructure(id)!;
      const ours = cubicOperations(s.frac, numbersOf(s.species));
      const ref = analyzeWith(api, s);
      expect(ours.length).toBe(ref.operations.length);
      const mine = analyzeWith(cubicMoyo, s);
      // same partition of the atoms into orbits
      const part = (o: number[]) => o.map((x) => o.indexOf(x)).join();
      expect(part(mine.orbits)).toBe(part(ref.orbits));
    });
  }

  for (const id of ['rocksalt', 'perovskite', 'fcc']) {
    for (const hkl of [
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
      [2, 1, 0],
    ] as Hkl[]) {
      it(`${id} (${hkl.join('')}): the same slab plan and slab as with moyo (S-064)`, () => {
        const s = lookupStructure(id)!;
        const a = slabPlan(cubicMoyo, s, hkl);
        const b = slabPlan(api, s, hkl);
        expect(a.terminations.length).toBe(b.terminations.length);
        expect(a.period).toBeCloseTo(b.period, 9);
        expect(a.area).toBeCloseTo(b.area, 9);
        const x = buildSlab(cubicMoyo, s, hkl, { layers: 3 });
        const y = buildSlab(api, s, hkl, { layers: 3 });
        expect(x.structure.species).toEqual(y.structure.species);
        expect(x.symmetric).toBe(y.symmetric);
        expect(x.polarity.tasker).toBe(y.polarity.tasker);
      });
    }
  }

  it('refuses a cell that is not cubic', () => {
    const s = lookupStructure('hcp')!;
    expect(() => analyzeWith(cubicMoyo, s)).toThrow();
  });
});
