import { describe, expect, it } from 'vitest';
import { HBAR2_OVER_2M_EV_A2 as C } from './constants';
import { basisIndices, convergenceCurve, fourier, jacobiEigenvalues, occupiedSum, solveToy } from './kp1d';

const a = 4;
const G1 = (2 * Math.PI) / a;
const free = (q: number) => C * q * q;

describe('Jacobi eigenvalues', () => {
  it('2x2 analytic', () => {
    const [lo, hi] = jacobiEigenvalues([2, 1, 1, 2], 2);
    expect(lo).toBeCloseTo(1, 12);
    expect(hi).toBeCloseTo(3, 12);
  });
  it('keeps the trace and sorts', () => {
    const m = [4, 1, 0.5, 1, 3, 0.2, 0.5, 0.2, 1];
    const e = jacobiEigenvalues(m, 3);
    expect(e[0]! + e[1]! + e[2]!).toBeCloseTo(8, 12);
    expect(e[0]!).toBeLessThan(e[1]!);
  });
});

describe('free electron limit (V0 = 0)', () => {
  it('at k = 0 gives 0, E_G, E_G, 4E_G, 4E_G ...', () => {
    const r = solveToy({ a, potential: { kind: 'cosine', v0: 0 }, k: 0, encutEv: 200, nBands: 5 });
    const eg = free(G1);
    const want = [0, eg, eg, 4 * eg, 4 * eg];
    r.energies.forEach((e, i) => expect(e).toBeCloseTo(want[i]!, 9));
    expect(basisIndices(a, 0, 200).every((j) => free(j * G1) <= 200)).toBe(true);
  });
  it('at general k matches sorted (k + G)^2 values', () => {
    const k = 0.3;
    const r = solveToy({ a, potential: { kind: 'cosine', v0: 0 }, k, encutEv: 150, nBands: 4 });
    const js = basisIndices(a, k, 150);
    const want = js.map((j) => free(k + j * G1)).sort((x, y) => x - y);
    r.energies.forEach((e, i) => expect(e).toBeCloseTo(want[i]!, 9));
  });
});

describe('variational principle', () => {
  it('the lowest energy never rises as the cutoff grows (10 cutoffs, both potentials)', () => {
    for (const potential of [
      { kind: 'cosine', v0: 2 } as const,
      { kind: 'kronig-penney', v0: 6, width: 1 } as const,
    ]) {
      let prev = Infinity;
      for (let i = 1; i <= 10; i++) {
        const r = solveToy({ a, potential, k: 0, encutEv: 20 * i, nBands: 1 });
        expect(r.energies[0]!).toBeLessThanOrEqual(prev + 1e-12);
        prev = r.energies[0]!;
      }
    }
  });
  it('the Kronig-Penney curve is still moving at moderate cutoffs and settles at high ones', () => {
    const base = { a, potential: { kind: 'kronig-penney', v0: 6, width: 1 } as const, k: 0 };
    const c = convergenceCurve(base, [20, 60, 120, 240, 480, 800], 2);
    const d = (i: number) => Math.abs(c[i]!.energy - c.at(-1)!.energy);
    expect(d(0)).toBeGreaterThan(d(2));
    expect(d(2)).toBeGreaterThan(d(4));
    expect(d(4)).toBeLessThan(0.05);
  });
});

describe('weak cosine potential against second-order perturbation theory (nearly free electrons)', () => {
  it('shift of the state at k = 0.2 G1 agrees to better than 1e-3 relative', () => {
    const v0 = 0.05;
    const k = 0.2 * G1;
    const r = solveToy({ a, potential: { kind: 'cosine', v0 }, k, encutEv: 400, nBands: 1 });
    const shift = r.energies[0]! - free(k);
    const pt = ((v0 * v0) / 4) * (1 / (free(k) - free(k - G1)) + 1 / (free(k) - free(k + G1)));
    expect(Math.abs((shift - pt) / pt)).toBeLessThan(1e-3);
  });
});

describe('Fourier components', () => {
  it('cosine couples only +/- G1 with V0/2', () => {
    const p = { kind: 'cosine', v0: 0.3 } as const;
    expect(fourier(p, a, 1)).toBeCloseTo(0.15, 12);
    expect(fourier(p, a, -1)).toBeCloseTo(0.15, 12);
    expect(fourier(p, a, 0)).toBe(0);
    expect(fourier(p, a, 2)).toBe(0);
  });
  it('rectangular barrier: mean is V0 b/a and components decay as 1/m', () => {
    const p = { kind: 'kronig-penney', v0: 4, width: 1 } as const;
    expect(fourier(p, a, 0)).toBeCloseTo(1, 12);
    expect(fourier(p, a, 1)).toBeCloseTo((4 * Math.sin(Math.PI / 4)) / Math.PI, 12);
    expect(fourier(p, a, 4)).toBeCloseTo(0, 12);
  });
  it('occupiedSum and edge cases', () => {
    expect(occupiedSum({ energies: [1, 2], nPw: 2 }, 2)).toBe(3);
    expect(occupiedSum({ energies: [1], nPw: 1 }, 2)).toBeNull();
    expect(solveToy({ a, potential: { kind: 'cosine', v0: 1 }, k: 5, encutEv: 0.001, nBands: 2 }).nPw).toBe(
      0,
    );
    expect(() =>
      solveToy({ a: 0, potential: { kind: 'cosine', v0: 1 }, k: 0, encutEv: 10, nBands: 1 }),
    ).toThrow(RangeError);
  });
});
