import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HBAR2_OVER_2M_EV_A2 as C } from './constants';
import { fdInfiniteWellEnergy, makeGrid, solveLowest } from './solver1d';
import { densityFromStates, integrateDensity, normalizeDensity, potentialFromDensity } from './density1d';

// Reference values: work order M2.4 (exact finite-difference eigenvalues, oscillator spacing, curvature) and the
// scipy golden file tests/reference/solver1d_reference.json.
const gold = JSON.parse(readFileSync('tests/reference/solver1d_reference.json', 'utf8')) as {
  fd_eigenvalues: number[];
  analytic: number[];
};

describe('infinite well: exact finite-difference eigenvalues (S-047)', () => {
  it('match E_k = (4c/h^2) sin^2(k pi h / 2L) to 1e-10 relative', () => {
    const L = 10;
    const n = 400;
    const { h } = makeGrid(0, L, n);
    const sol = solveLowest(C, h, new Float64Array(n), 6);
    for (let k = 1; k <= 6; k++) {
      const exact = fdInfiniteWellEnergy(C, L, n, k);
      expect(Math.abs(sol.energies[k - 1]! - exact) / exact).toBeLessThan(1e-10);
    }
  });
  it('converges to the continuum value at second order', () => {
    const L = 10;
    const err = (n: number) => {
      const { h } = makeGrid(0, L, n);
      const e5 = solveLowest(C, h, new Float64Array(n), 5).energies[4]!;
      const cont = (25 * Math.PI * Math.PI * C) / (L * L);
      return Math.abs(e5 - cont) / cont;
    };
    const e400 = err(400);
    const e800 = err(800);
    expect(e400).toBeLessThan(2e-4);
    expect(e800).toBeLessThan(5e-5);
    expect(e400 / e800).toBeGreaterThan(3.5);
    expect(e400 / e800).toBeLessThan(4.5);
  });
  it('gives normalised, orthogonal states (1e-10)', () => {
    const n = 300;
    const { h } = makeGrid(0, 10, n);
    const { states } = solveLowest(C, h, new Float64Array(n), 6);
    for (let a = 0; a < 6; a++)
      for (let b = 0; b <= a; b++) {
        let dot = 0;
        for (let i = 0; i < n; i++) dot += states[a]![i]! * states[b]![i]!;
        expect(Math.abs(dot * h - (a === b ? 1 : 0))).toBeLessThan(1e-10);
      }
  });
});

describe('harmonic oscillator V = k x^2 / 2, k = 10 eV/A^2', () => {
  const N = 1200;
  const { x, h } = makeGrid(-6, 6, N);
  const V = Float64Array.from(x, (v) => 5 * v * v);
  const sol = solveLowest(C, h, V, 6);
  it('has analytic energies within 1e-4 relative for n <= 4 and spacing 8.7292 eV', () => {
    for (let n = 0; n <= 4; n++) {
      const exact = (n + 0.5) * Math.sqrt(2 * C * 10);
      expect(Math.abs(sol.energies[n]! - exact) / exact).toBeLessThan(1e-4);
    }
    expect(sol.energies[1]! - sol.energies[0]!).toBeCloseTo(8.7292, 3);
  });
  it('matches scipy eigh_tridiagonal on the same matrix (1e-9 relative)', () => {
    for (let n = 0; n < 6; n++)
      expect(Math.abs(sol.energies[n]! / gold.fd_eigenvalues[n]! - 1)).toBeLessThan(1e-9);
  });
});

describe('density and the inverse problem (S-011)', () => {
  const N = 1200;
  const { x, h } = makeGrid(-6, 6, N);
  const sigma = 1;
  const n0 = normalizeDensity(
    Float64Array.from(x, (v) => Math.exp(-(v * v) / (sigma * sigma))),
    h,
  );
  it('integrates to the electron number (1e-10)', () => {
    expect(Math.abs(integrateDensity(n0, h) - 1)).toBeLessThan(1e-10);
    const { states } = solveLowest(
      C,
      h,
      Float64Array.from(x, (v) => 5 * v * v),
      3,
    );
    const d = densityFromStates(states, [2, 2, 1]);
    expect(Math.abs(integrateDensity(d, h) - 5)).toBeLessThan(1e-10);
  });
  it('density equals the sum of squared orbitals', () => {
    const { states } = solveLowest(
      C,
      h,
      Float64Array.from(x, (v) => 5 * v * v),
      2,
    );
    const d = densityFromStates(states, [2, 2]);
    for (const i of [100, 600, 900])
      expect(d[i]).toBeCloseTo(2 * states[0]![i]! ** 2 + 2 * states[1]![i]! ** 2, 12);
  });
  it('recovers a parabola with curvature 2c/sigma^4 for a Gaussian density (1e-3)', () => {
    const V = potentialFromDensity(C, h, n0);
    const target = (2 * C) / sigma ** 4;
    for (let i = 0; i < N; i++) {
      if (Math.abs(x[i]!) > 4 * sigma || i < 2 || i > N - 3) continue;
      const curv = (V[i + 1]! - 2 * V[i]! + V[i - 1]!) / (h * h);
      expect(Math.abs(curv - target) / target).toBeLessThan(1e-3);
    }
  });
  it('round trip: the forward solve reproduces the density (1e-8 relative L2)', () => {
    const V = potentialFromDensity(C, h, n0);
    const { states } = solveLowest(C, h, V, 1);
    const back = densityFromStates(states, [1]);
    let num = 0;
    let den = 0;
    for (let i = 0; i < N; i++) {
      num += (back[i]! - n0[i]!) ** 2;
      den += n0[i]! ** 2;
    }
    expect(Math.sqrt(num / den)).toBeLessThan(1e-8);
  });
  it('adding a constant to V shifts the energy and leaves the density unchanged', () => {
    const V = potentialFromDensity(C, h, n0);
    const V2 = V.map((v) => v + 3.5);
    const a = solveLowest(C, h, V, 1);
    const b = solveLowest(C, h, V2, 1);
    expect(b.energies[0]! - a.energies[0]!).toBeCloseTo(3.5, 8);
    expect(Math.abs(b.states[0]![600]! ** 2 - a.states[0]![600]! ** 2)).toBeLessThan(1e-9);
  });
});

describe('timing (documented in the M2.4 report)', () => {
  it('solves 2000 points, 8 states, in well under a second', () => {
    const { x, h } = makeGrid(-6, 6, 2000);
    const t0 = performance.now();
    solveLowest(
      C,
      h,
      Float64Array.from(x, (v) => 5 * v * v),
      8,
    );
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
