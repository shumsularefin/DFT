import { beforeAll, describe, expect, it } from 'vitest';
import kp from '../../../tests/reference/kpaths.json';
import ref from '../../../tests/reference/structure_tools_reference.json';
import { symbolOf } from './elements';
import { cellVolume } from './lattice';
import { cross, dot, norm } from './linalg';
import { loadMoyoNode } from './moyo-node';
import { buildSlab, slabPlan, type Hkl } from './slab';
import type { MoyoApi } from './symmetry';
import type { Mat3, Structure, Vec3 } from './types';

type KIn = { lattice_rows: Mat3; frac_coords: Vec3[]; atomic_numbers: number[] };
const K = kp.structures as unknown as Record<string, { input: KIn }>;
const fromK = (n: string): Structure => {
  const i = K[n]!.input;
  return { lattice: i.lattice_rows, species: i.atomic_numbers.map((z) => symbolOf(z)!), frac: i.frac_coords };
};

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

const key = (x: { n_atoms: number; polar: boolean; symmetric: boolean }) =>
  `${x.n_atoms}/${x.polar}/${x.symmetric}`;

describe('slabs against pymatgen SlabGenerator (golden, S-064)', () => {
  for (const c of ref.slabs) {
    const name = `${c.structure} (${c.hkl.join('')})`;
    it(`${name}: terminations, area, input spacing`, () => {
      const plan = slabPlan(api, fromK(c.structure), c.hkl as unknown as Hkl);
      expect(plan.terminations.length).toBe(c.n_terminations);
      expect(Math.abs(plan.area - c.thicknesses[0]!.slabs[0]!.surface_area)).toBeLessThan(1e-6);
      expect(plan.inputSpacing).toBeCloseTo(c.d_hkl_input, 9);
      // the in-plane cell and the period make one primitive cell of the crystal
      const s = fromK(c.structure);
      const vPrim = plan.area * plan.period;
      expect(plan.atomsPerPeriod / vPrim).toBeCloseTo(s.species.length / cellVolume(s.lattice), 9);
    });
    for (const t of c.thicknesses) {
      it(`${name} at ${t.min_slab_size} angstrom: atoms, polar and symmetric flags per termination`, () => {
        const s = fromK(c.structure);
        const plan = slabPlan(api, s, c.hkl as unknown as Hkl);
        const got = plan.terminations.map((_, k) => {
          const r = buildSlab(api, s, c.hkl as unknown as Hkl, {
            minThicknessA: t.min_slab_size,
            termination: k,
          });
          expect(
            Math.abs(norm(cross(r.structure.lattice[0], r.structure.lattice[1])) - t.slabs[0]!.surface_area),
          ).toBeLessThan(1e-6);
          return key({
            n_atoms: r.structure.species.length,
            polar: r.polarity.polar!,
            symmetric: r.symmetric,
          });
        });
        expect(got.sort()).toEqual(t.slabs.map(key).sort());
      });
    }
  }
});

describe('slab geometry and options', () => {
  const NaCl = fromK('rocksalt_NaCl');
  it('NaCl (111) is flagged polar (Tasker III) with the dipole-correction advice; NaCl (100) is not', () => {
    const p = buildSlab(api, NaCl, [1, 1, 1]);
    expect(p.polarity.polar).toBe(true);
    expect(p.polarity.tasker).toBe(3);
    expect(p.polarity.heuristic).toBe(true);
    expect(p.polarity.sources).toContain('S-063');
    expect(p.polarity.message).toMatch(/LDIPOL/);
    expect(p.polarity.message).toMatch(/IDIPOL/);
    expect(p.notes.join(' ')).toMatch(/Heuristic/);
    const q = buildSlab(api, NaCl, [1, 0, 0]);
    expect(q.polarity.polar).toBe(false);
    expect(q.polarity.tasker).toBe(1);
  });
  it('vacuum is the gap to the next image; the slab is centred; c is along z', () => {
    const r = buildSlab(api, fromK('fcc_Cu'), [1, 1, 1], { layers: 4, vacuumA: 12 });
    const L = r.structure.lattice;
    expect(L[2][0]).toBe(0);
    expect(L[2][1]).toBe(0);
    expect(L[0][2]).toBe(0);
    expect(L[1][2]).toBe(0);
    expect(L[1][1]).toBeGreaterThan(0);
    const z = r.structure.frac.map((f) => f[2] * L[2][2]);
    const lo = Math.min(...z);
    const hi = Math.max(...z);
    expect(L[2][2] - (hi - lo)).toBeCloseTo(12, 9);
    expect((lo + hi) / 2).toBeCloseTo(L[2][2] / 2, 9);
    // four (111) layers of fcc: 3 spacings of a / sqrt(3)
    expect(hi - lo).toBeCloseTo((3 * 3.61) / Math.sqrt(3), 9);
    expect(r.structure.species.length).toBe(4);
  });
  it('the in-plane pair is reduced: fcc (111) gives two nearest-neighbour vectors at 120 or 60 degrees', () => {
    const plan = slabPlan(api, fromK('fcc_Cu'), [1, 1, 1]);
    const [a, b] = plan.inPlane;
    expect(norm(a)).toBeCloseTo(3.61 / Math.SQRT2, 9);
    expect(norm(b)).toBeCloseTo(3.61 / Math.SQRT2, 9);
    expect(Math.abs(dot(a, b) / (norm(a) * norm(b)))).toBeCloseTo(0.5, 9);
    expect(dot(cross(a, b), plan.normal)).toBeGreaterThan(0);
  });
  it('fixes the bottom n atomic layers with selective dynamics', () => {
    const r = buildSlab(api, fromK('fcc_Cu'), [1, 0, 0], { layers: 5, fixBottomLayers: 2 });
    const L = r.structure.lattice;
    const rows = r.structure.frac.map((f, i) => ({ z: f[2] * L[2][2], free: r.structure.selective![i]![0] }));
    const zs = [...new Set(rows.map((x) => x.z.toFixed(6)))].sort((p, q) => Number(p) - Number(q));
    expect(zs.length).toBe(5);
    const fixed = new Set(zs.slice(0, 2));
    for (const x of rows) expect(x.free).toBe(!fixed.has(x.z.toFixed(6)));
  });
  it('reduces non-primitive Miller indices and rejects (0 0 0)', () => {
    expect(slabPlan(api, NaCl, [2, 2, 2]).hkl).toEqual([1, 1, 1]);
    expect(() => slabPlan(api, NaCl, [0, 0, 0])).toThrow(RangeError);
  });
  it('keeps the composition: whole bulk periods only', () => {
    const r = buildSlab(api, fromK('rutile_TiO2_tetragonal_P'), [1, 1, 0], { layers: 3, termination: 1 });
    const ti = r.structure.species.filter((x) => x === 'Ti').length;
    const o = r.structure.species.filter((x) => x === 'O').length;
    expect(o).toBe(2 * ti);
  });
});
