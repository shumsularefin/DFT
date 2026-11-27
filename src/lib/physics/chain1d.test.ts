// The tight-binding chain against closed forms (S-050, S-036): open chain levels, the two-atom bonding and antibonding
// pair, the band edges of the infinite chain, and the trace and orthonormality of the Jacobi eigen solution.
import { describe, expect, it } from 'vitest';
import {
  chainEnergies,
  chainHamiltonian,
  chainLevels,
  harrisonHopping,
  infiniteChainBands,
  openChainEnergy,
  symmetricEigen,
} from './chain1d';

describe('tight-binding chain', () => {
  it('equal atoms: levels match -2 t cos(k pi / (N + 1))', () => {
    for (const n of [1, 2, 3, 7, 20]) {
      const { energies } = chainLevels(n, 0.8, 0);
      const exact = Array.from({ length: n }, (_, i) => openChainEnergy(n, i + 1, 0.8)).sort((a, b) => a - b);
      energies.forEach((e, i) => expect(e).toBeCloseTo(exact[i]!, 10));
    }
  });
  it('two atoms give bonding and antibonding levels at -+sqrt(Delta^2 + t^2)', () => {
    const { energies, states } = chainLevels(2, 1.3, 0.5);
    const w = Math.hypot(0.5, 1.3);
    expect(energies[0]).toBeCloseTo(-w, 12);
    expect(energies[1]).toBeCloseTo(w, 12);
    // equal atoms: the bonding state is (1, 1)/sqrt(2), in phase
    const eq = chainLevels(2, 1, 0).states[0]!;
    expect(Math.abs(eq[0]!)).toBeCloseTo(Math.SQRT1_2, 12);
    expect(eq[0]! * eq[1]!).toBeGreaterThan(0);
    expect(states.length).toBe(2);
  });
  it('a long alternating chain fills the infinite-chain bands and leaves the gap 2 Delta empty', () => {
    const t = 1;
    const delta = 0.4;
    const { energies } = chainLevels(60, t, delta);
    const [[lo1, hi1], [lo2, hi2]] = infiniteChainBands(t, delta) as [[number, number], [number, number]];
    for (const e of energies) {
      const inBand = (e >= lo1 - 1e-9 && e <= hi1 + 1e-9) || (e >= lo2 - 1e-9 && e <= hi2 + 1e-9);
      expect(inBand).toBe(true);
    }
    // band width approaches the infinite value from inside
    expect(energies[0]!).toBeGreaterThan(lo1);
    expect(energies[0]! - lo1).toBeLessThan(0.01);
    expect(energies[30]! - energies[29]!).toBeGreaterThanOrEqual(2 * delta - 1e-9);
  });
  it('eigenvectors are orthonormal and the eigenvalues sum to the trace', () => {
    const h = chainHamiltonian(9, 0.7, 0.3);
    const { values, vectors } = symmetricEigen(h);
    const trace = h.reduce((s, r, i) => s + r[i]!, 0);
    expect(values.reduce((s, e) => s + e, 0)).toBeCloseTo(trace, 10);
    for (let a = 0; a < 9; a++)
      for (let b = 0; b < 9; b++) {
        const d = vectors[a]!.reduce((s, x, j) => s + x * vectors[b]![j]!, 0);
        expect(d).toBeCloseTo(a === b ? 1 : 0, 10);
      }
    // H v = E v for one level
    const v = vectors[4]!;
    for (let i = 0; i < 9; i++) {
      const hv = h[i]!.reduce((s, x, j) => s + x * v[j]!, 0);
      expect(hv).toBeCloseTo(values[4]! * v[i]!, 10);
    }
  });
  it('Sturm bisection gives the same energies as Jacobi (1e-10)', () => {
    for (const [n, t, delta] of [
      [1, 1, 0.4],
      [2, 0.7, 0],
      [11, 1.2, 0.5],
      [20, 2.7, 1.5],
    ] as const) {
      const a = chainEnergies(n, t, delta);
      const b = chainLevels(n, t, delta).energies;
      a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 10));
    }
  });
  it('Harrison scaling: halving the distance quadruples the hopping (S-140)', () => {
    expect(harrisonHopping(2.5, 2.5)).toBe(1);
    expect(harrisonHopping(1.25, 2.5)).toBeCloseTo(4, 12);
    expect(harrisonHopping(5, 2.5, 2)).toBeCloseTo(0.5, 12);
  });
});
