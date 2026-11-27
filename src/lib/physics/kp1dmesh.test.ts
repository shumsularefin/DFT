import { describe, expect, it } from 'vitest';
import { HBAR2_OVER_2M_EV_A2 as C } from './constants';
import { solveToy } from './kp1d';
import { convergenceGrid, gammaMesh1d, meshEnergy } from './kp1dmesh';

const a = 4;
const free = { kind: 'cosine', v0: 0 } as const;
const kp = { kind: 'kronig-penney', v0: 6, width: 1 } as const;

describe('Gamma-centred 1D mesh', () => {
  it('holds Gamma, is spaced 2 pi / (N a) and folds into (-pi/a, pi/a]', () => {
    for (const nk of [1, 4, 5, 8]) {
      const k = gammaMesh1d(nk, a);
      expect(k).toHaveLength(nk);
      expect(k).toContain(0);
      for (const x of k) {
        expect(x).toBeGreaterThan(-Math.PI / a - 1e-12);
        expect(x).toBeLessThanOrEqual(Math.PI / a + 1e-12);
        expect(
          Math.abs(Math.round((x * nk * a) / (2 * Math.PI)) - (x * nk * a) / (2 * Math.PI)),
        ).toBeLessThan(1e-12);
      }
    }
  });
});

describe('free electrons (V0 = 0) against closed forms', () => {
  it('a full lowest band averages C k^2 over the mesh exactly', () => {
    for (const nk of [3, 6, 9]) {
      const want = gammaMesh1d(nk, a).reduce((s, k) => s + C * k * k, 0) / nk;
      const r = meshEnergy({ a, potential: free, encutEv: 200, nk, filling: 1 });
      expect(r.energy!).toBeCloseTo(want, 9);
    }
  });
  it('dense meshes reach the zone averages C pi^2 / (3 a^2) (full band) and C pi^2 / (24 a^2) (half band)', () => {
    const full = meshEnergy({ a, potential: free, encutEv: 100, nk: 400, filling: 1 }).energy!;
    expect(full).toBeCloseTo((C * Math.PI ** 2) / (3 * a * a), 4);
    const half = meshEnergy({ a, potential: free, encutEv: 100, nk: 400, filling: 0.5 }).energy!;
    expect(half).toBeCloseTo((C * Math.PI ** 2) / (24 * a * a), 4);
  });
});

describe('Kronig-Penney toy on a mesh', () => {
  it('has E(-k) = E(k) for the even potentials, which the band cache relies on', () => {
    for (const k of [0.1, 0.37, Math.PI / a]) {
      const p = solveToy({ a, potential: kp, k, encutEv: 250, nBands: 3 }).energies;
      const m = solveToy({ a, potential: kp, k: -k, encutEv: 250, nBands: 3 }).energies;
      p.forEach((e, i) => expect(m[i]!).toBeCloseTo(e, 10));
    }
  });
  it('a one-point mesh is the Gamma result of kp1d', () => {
    const r = meshEnergy({ a, potential: kp, encutEv: 300, nk: 1, filling: 1 });
    const g = solveToy({ a, potential: kp, k: 0, encutEv: 300, nBands: 1 });
    expect(r.energy!).toBeCloseTo(g.energies[0]!, 12);
    expect(r.nPw).toBe(g.nPw);
  });
  it('is variational in ENCUT at a fixed mesh (never rises as the cutoff grows)', () => {
    for (const filling of [1, 0.5]) {
      let prev = Infinity;
      for (let e = 20; e <= 400; e += 20) {
        const r = meshEnergy({ a, potential: kp, encutEv: e, nk: 8, filling });
        if (r.energy === null) continue;
        expect(r.energy).toBeLessThanOrEqual(prev + 1e-12);
        prev = r.energy;
      }
    }
  });
  it('the insulator settles with the mesh much faster than the metal', () => {
    const err = (filling: number, nk: number) => {
      const ref = meshEnergy({ a, potential: kp, encutEv: 300, nk: 240, filling }).energy!;
      return Math.abs(meshEnergy({ a, potential: kp, encutEv: 300, nk, filling }).energy! - ref);
    };
    expect(err(1, 8)).toBeLessThan(1e-4);
    expect(err(0.5, 8)).toBeGreaterThan(1e-3);
  });
  it('the grid holds every pair with enough plane waves', () => {
    const g = convergenceGrid({ a, potential: kp, filling: 1 }, [20, 100], [1, 2, 3]);
    expect(g).toHaveLength(6);
    expect(g.every((p) => Number.isFinite(p.energy))).toBe(true);
  });
});
