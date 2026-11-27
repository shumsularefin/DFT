// Reference values: the closed-form s bands of Ashcroft and Mermin chapter 10 (S-036) at the special points of Setyawan
// and Curtarolo (S-005), and the sum rules of the tetrahedron and Gaussian densities of states (S-017, S-019).
import { describe, expect, it } from 'vitest';
import {
  MODELS,
  PATHS,
  SPECIAL_POINTS,
  bandEnergy,
  energyGrid,
  fermiLevel,
  gaussianDos,
  inFirstZone,
  kPath,
  meshEigenvalues,
  modelById,
  primitiveLattice,
  reciprocalRows,
  tetraDos,
  tetrahedronDos,
  trapz,
  twoBand,
  zoneSliceKz0,
  type Band,
  type CubicLattice,
} from './tightbinding3d';

const at = (lattice: CubicLattice, a: number, p: string) =>
  SPECIAL_POINTS[lattice][p]!.map((x) => (x * 2 * Math.PI) / a);

describe('bandEnergy at the special points (closed forms, S-036)', () => {
  const a = 3.61;
  const fcc: Band = { lattice: 'fcc', a, e0: 0.3, t1: 0.5 };
  it('fcc: e0 - 12 t at Gamma, e0 + 4 t at X and W, e0 at L', () => {
    expect(bandEnergy(fcc, at('fcc', a, 'G'))).toBeCloseTo(0.3 - 6, 12);
    expect(bandEnergy(fcc, at('fcc', a, 'X'))).toBeCloseTo(0.3 + 2, 12);
    expect(bandEnergy(fcc, at('fcc', a, 'W'))).toBeCloseTo(0.3 + 2, 12);
    expect(bandEnergy(fcc, at('fcc', a, 'L'))).toBeCloseTo(0.3, 12);
  });
  it('fcc second neighbours: -6 t2 at Gamma and X, +6 t2 at L', () => {
    const b: Band = { lattice: 'fcc', a, e0: 2.4, t1: 0, t2: -0.2 };
    expect(bandEnergy(b, at('fcc', a, 'G'))).toBeCloseTo(3.6, 12);
    expect(bandEnergy(b, at('fcc', a, 'X'))).toBeCloseTo(3.6, 12);
    expect(bandEnergy(b, at('fcc', a, 'L'))).toBeCloseTo(1.2, 12);
  });
  it('bandwidths: sc 12 t, bcc 16 t, fcc 16 t', () => {
    const t = 0.7;
    const sc: Band = { lattice: 'sc', a: 3, e0: 0, t1: t };
    const bcc: Band = { lattice: 'bcc', a: 3, e0: 0, t1: t };
    const f: Band = { lattice: 'fcc', a: 3, e0: 0, t1: t };
    expect(bandEnergy(sc, at('sc', 3, 'R')) - bandEnergy(sc, at('sc', 3, 'G'))).toBeCloseTo(12 * t, 12);
    expect(bandEnergy(bcc, at('bcc', 3, 'H')) - bandEnergy(bcc, at('bcc', 3, 'G'))).toBeCloseTo(16 * t, 12);
    expect(bandEnergy(f, at('fcc', 3, 'X')) - bandEnergy(f, at('fcc', 3, 'G'))).toBeCloseTo(16 * t, 12);
  });
  it('is periodic under every reciprocal lattice vector', () => {
    for (const lattice of ['sc', 'bcc', 'fcc'] as const) {
      const b: Band = { lattice, a: 4.1, e0: 0.1, t1: 0.4, t2: 0.1 };
      const rec = reciprocalRows(primitiveLattice(lattice, 4.1));
      const k = [0.31, -0.57, 0.83];
      for (const g of rec)
        expect(bandEnergy(b, [k[0]! + g[0], k[1]! + g[1], k[2]! + g[2]])).toBeCloseTo(bandEnergy(b, k), 12);
    }
  });
});

describe('reciprocal lattice and zone', () => {
  it('b_i . a_j = 2 pi delta_ij', () => {
    for (const lattice of ['sc', 'bcc', 'fcc'] as const) {
      const A = primitiveLattice(lattice, 3.2);
      const B = reciprocalRows(A);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          const d = B[i]![0] * A[j]![0] + B[i]![1] * A[j]![1] + B[i]![2] * A[j]![2];
          expect(d).toBeCloseTo(i === j ? 2 * Math.PI : 0, 12);
        }
    }
  });
  it('every special point lies in (or on the surface of) the first zone', () => {
    for (const lattice of ['sc', 'bcc', 'fcc'] as const) {
      const rec = reciprocalRows(primitiveLattice(lattice, 3));
      for (const p of Object.keys(SPECIAL_POINTS[lattice]))
        expect(inFirstZone(rec, at(lattice, 3, p), 1e-9)).toBe(true);
    }
  });
  it('the kz = 0 slice of the fcc zone is the octagon of area 3.5 (2 pi / a)^2 through X and W', () => {
    const a = 4;
    const u = (2 * Math.PI) / a;
    const poly = zoneSliceKz0(reciprocalRows(primitiveLattice('fcc', a)));
    let area = 0;
    poly.forEach((p, i) => {
      const q = poly[(i + 1) % poly.length]!;
      area += 0.5 * (p[0] * q[1] - q[0] * p[1]);
    });
    expect(poly.length).toBe(8);
    expect(area).toBeCloseTo(3.5 * u * u, 9);
    expect(Math.max(...poly.map((p) => Math.hypot(p[0], p[1])))).toBeCloseTo(Math.hypot(1, 0.5) * u, 9);
  });
  it('the kz = 0 slice of the sc zone is the square of side 2 pi / a', () => {
    const poly = zoneSliceKz0(reciprocalRows(primitiveLattice('sc', 2)));
    expect(poly.length).toBe(4);
    for (const p of poly) {
      expect(Math.abs(p[0])).toBeCloseTo(Math.PI / 2, 9);
      expect(Math.abs(p[1])).toBeCloseTo(Math.PI / 2, 9);
    }
  });
});

describe('kPath', () => {
  it('starts and ends on the listed special points and has a tick at each', () => {
    const path = kPath('fcc', 5, 200);
    expect(path.ticks.map((t) => t.label)).toEqual(PATHS.fcc);
    for (const t of path.ticks) {
      const want = at('fcc', 5, t.label);
      for (let c = 0; c < 3; c++) expect(path.k[t.index]![c]).toBeCloseTo(want[c]!, 12);
    }
    expect(path.s[path.s.length - 1]).toBeCloseTo(path.length, 12);
  });
});

describe('twoBand', () => {
  it('returns the eigenvalues of [[Ev, V], [V, Ec]] and weights that add to one', () => {
    const r = twoBand(-1, 2, 0.8);
    expect(r.lo + r.hi).toBeCloseTo(1, 12);
    expect(r.lo * r.hi).toBeCloseTo(-2 - 0.64, 12);
    expect(r.w2lo + r.w2hi).toBeCloseTo(1, 12);
    // upper eigenvector (V, hi - Ev): weight on orbital 2 = (hi + 1)^2 / (V^2 + (hi + 1)^2)
    expect(r.w2hi).toBeCloseTo((r.hi + 1) ** 2 / (0.64 + (r.hi + 1) ** 2), 12);
    expect(twoBand(-1, 2, 0).w2hi).toBe(1);
  });
});

describe('tetraDos for one tetrahedron (S-017)', () => {
  const e = [0.3, -0.4, 1.1, 0.7];
  it('n rises from 0 to 1, is continuous at the corners and g = dn/dE', () => {
    expect(tetraDos(e, -1).n).toBe(0);
    expect(tetraDos(e, 2).n).toBe(1);
    for (const c of e) expect(tetraDos(e, c - 1e-9).n).toBeCloseTo(tetraDos(e, c + 1e-9).n, 7);
    for (const E of [-0.2, 0.1, 0.5, 0.9]) {
      const h = 1e-6;
      expect(tetraDos(e, E).g).toBeCloseTo((tetraDos(e, E + h).n - tetraDos(e, E - h).n) / (2 * h), 6);
    }
  });
});

describe('mesh densities of states', () => {
  const m = modelById('fcc-direct');
  const eig = meshEigenvalues(m, 8, 0.3);
  const grid = energyGrid(-6, 9, 3001);
  it('the tetrahedron DOS holds one state per band and cell and spin', () => {
    expect(trapz(tetrahedronDos(eig, 8, grid), grid)).toBeCloseTo(2, 3);
  });
  it('the Gaussian DOS holds the same', () => {
    expect(trapz(gaussianDos(eig, grid, 0.1), grid)).toBeCloseTo(2, 3);
  });
  it('the half-filled fcc metal puts half the states below the Fermi level', () => {
    const metal = MODELS.find((x) => x.id === 'fcc-metal')!;
    const e = meshEigenvalues(metal, 16);
    const ef = fermiLevel(e, 0.5);
    const below = Array.from(e[0]!).filter((x) => x < ef).length / e[0]!.length;
    expect(below).toBeGreaterThan(0.48);
    expect(below).toBeLessThan(0.52);
  });
  it('energyGrid follows VASP spacing (EMAX - EMIN) / (NEDOS - 1)', () => {
    const g = energyGrid(-2, 3, 11);
    expect(g[1]! - g[0]!).toBeCloseTo(0.5, 12);
    expect(g[10]).toBe(3);
    expect(() => energyGrid(0, 1, 1)).toThrow();
  });
});
