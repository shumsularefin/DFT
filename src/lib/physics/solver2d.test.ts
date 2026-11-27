import { describe, expect, it } from 'vitest';
import { fdInfiniteWellEnergy, makeGrid, solveLowest } from './solver1d';
import { applyHamiltonian2d, lowestState2d, potentialFromDensity2d } from './solver2d';

// Reference values: closed forms of the finite-difference operator (S-047) and the separable 1D solver, which shares
// the 3-point discretisation along each axis, so a separable 2D problem must give the sum of two 1D results exactly.
const C = 0.5; // hbar^2 / 2m in atomic units

describe('solver2d: empty boxes (exact finite-difference eigenvalues)', () => {
  it('rectangle: the lowest energy is the sum of the two 1D energies E_1 to 1e-10 relative', () => {
    const [nx, ny, Lx, Ly] = [30, 20, 10, 6];
    const r = lowestState2d({
      nx,
      ny,
      hx: Lx / (nx + 1),
      hy: Ly / (ny + 1),
      c: C,
      V: new Float64Array(nx * ny),
    });
    const exact = fdInfiniteWellEnergy(C, Lx, nx, 1) + fdInfiniteWellEnergy(C, Ly, ny, 1);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.energy - exact) / exact).toBeLessThan(1e-10);
  });
  it('square, antisymmetric under x <-> y: lowest is E_1 + E_2 of the 1D well (the first excited level)', () => {
    const n = 30;
    const h = 8 / (n + 1);
    const r = lowestState2d({
      nx: n,
      ny: n,
      hx: h,
      hy: h,
      c: C,
      V: new Float64Array(n * n),
      symmetry: 'antisymmetric',
    });
    const exact = fdInfiniteWellEnergy(C, 8, n, 1) + fdInfiniteWellEnergy(C, 8, n, 2);
    expect(Math.abs(r.energy - exact) / exact).toBeLessThan(1e-10);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++)
        expect(Math.abs(r.state[i + n * j]! + r.state[j + n * i]!)).toBeLessThan(1e-12);
  });
});

describe('solver2d: harmonic well V = (x^2 + y^2) / 2, omega = 1', () => {
  const n = 79;
  const { x, h } = makeGrid(-8, 8, n);
  const V = new Float64Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) V[i + n * j] = 0.5 * (x[i]! ** 2 + x[j]! ** 2);
  const r = lowestState2d({ nx: n, ny: n, hx: h, hy: h, c: C, V });
  const one = solveLowest(
    C,
    h,
    Float64Array.from(x, (v) => 0.5 * v * v),
    1,
  ).energies[0]!;
  it('equals twice the 1D finite-difference ground state to 1e-9 (separable operator)', () => {
    expect(Math.abs(r.energy - 2 * one)).toBeLessThan(1e-9);
  });
  it('is hbar omega = 1 hartree within the second-order grid error (h = 0.2 bohr: below 3e-3)', () => {
    expect(Math.abs(r.energy - 1)).toBeLessThan(3e-3);
    // halving h cuts the error about four times
    const n2 = 159;
    const g2 = makeGrid(-8, 8, n2);
    const one2 = solveLowest(
      C,
      g2.h,
      Float64Array.from(g2.x, (v) => 0.5 * v * v),
      1,
    ).energies[0]!;
    const ratio = Math.abs(r.energy - 1) / Math.abs(2 * one2 - 1);
    expect(ratio).toBeGreaterThan(3.5);
    expect(ratio).toBeLessThan(4.5);
  });
  it('returns a normalised eigenvector: sum psi^2 h^2 = 1 and |H psi - E psi| / |psi| below 1e-7', () => {
    let s = 0;
    for (const v of r.state) s += v * v;
    expect(Math.abs(s * h * h - 1)).toBeLessThan(1e-12);
    const Hp = applyHamiltonian2d({ nx: n, ny: n, hx: h, hy: h }, C, V, r.state, new Float64Array(n * n));
    let res = 0;
    for (let k = 0; k < n * n; k++) res += (Hp[k]! - r.energy * r.state[k]!) ** 2;
    expect(Math.sqrt(res / s)).toBeLessThan(1e-7);
  });
});

describe('solver2d: the density fixes the potential (one electron, S-011)', () => {
  const n = 41;
  const h = 10 / (n + 1);
  const g = { nx: n, ny: n, hx: h, hy: h };
  const xs = Array.from({ length: n }, (_, i) => -5 + (i + 1) * h);
  const V = new Float64Array(n * n);
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++)
      V[i + n * j] =
        -2 * Math.exp(-((xs[i]! + 1) ** 2 + xs[j]! ** 2)) -
        Math.exp(-((xs[i]! - 1.5) ** 2 + (xs[j]! - 1) ** 2));
  const r = lowestState2d({ ...g, c: C, V, tol: 1e-10 });
  const nden = r.state.map((v) => v * v);
  const back = potentialFromDensity2d(g, C, nden, r.energy);
  it('reads V back from n where n is above 1e-4 of its peak, to 1e-6 hartree', () => {
    const peak = Math.max(...nden);
    let worst = 0;
    for (let k = 0; k < n * n; k++)
      if (nden[k]! > 1e-4 * peak) worst = Math.max(worst, Math.abs(back[k]! - V[k]!));
    expect(worst).toBeLessThan(1e-6);
  });
  it('the potential read back gives the same density again (round trip, 1e-8)', () => {
    const again = lowestState2d({ ...g, c: C, V: back, tol: 1e-10 });
    let worst = 0;
    for (let k = 0; k < n * n; k++) worst = Math.max(worst, Math.abs(again.state[k]! ** 2 - nden[k]!));
    expect(worst).toBeLessThan(1e-8);
    expect(Math.abs(again.energy - r.energy)).toBeLessThan(1e-8);
  });
  it('a constant added to V shifts E by that constant and leaves the density unchanged', () => {
    const shifted = lowestState2d({ ...g, c: C, V: V.map((v) => v + 0.7), tol: 1e-10 });
    expect(Math.abs(shifted.energy - r.energy - 0.7)).toBeLessThan(1e-9);
    let worst = 0;
    for (let k = 0; k < n * n; k++) worst = Math.max(worst, Math.abs(shifted.state[k]! ** 2 - nden[k]!));
    expect(worst).toBeLessThan(1e-9);
  });
});

describe('solver2d: input checks', () => {
  it('rejects a wrong potential length and a symmetry on a rectangle', () => {
    expect(() => lowestState2d({ nx: 3, ny: 3, hx: 1, hy: 1, c: C, V: new Float64Array(4) })).toThrow(
      RangeError,
    );
    expect(() =>
      lowestState2d({ nx: 3, ny: 4, hx: 1, hy: 1, c: C, V: new Float64Array(12), symmetry: 'symmetric' }),
    ).toThrow(RangeError);
  });
});
