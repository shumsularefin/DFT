import { describe, expect, it } from 'vitest';
import golden from '../../../tests/reference/scf1d_reference.json';
import { solveLowest, makeGrid } from './solver1d';
import {
  densityOf,
  kohnShamInversion,
  nonInteractingDensity,
  pairDensity,
  solveTwoElectron,
  xcHole,
} from './twoelectron1d';

// Reference values: the exact two-electron energies on the lab grid from scripts/reference/gen_scf1d_reference.py
// (scipy eigsh of the same 2D operator, tests/reference/scf1d_reference.json), the closed forms of the repulsion-free
// limit (sums of 1D eigenvalues from solver1d), and exact sum rules of the pair density and the xc hole (S-048, S-049).

describe('twoelectron1d against the golden file (same grid as the generator: 299 points, L = 15 bohr)', () => {
  for (const g of golden.cases)
    it(
      `Z = ${g.Z}: E_exact within 1e-6 hartree, below E_HF by the golden correlation energy`,
      { timeout: 60_000 },
      () => {
        const s = solveTwoElectron({ Z: g.Z });
        expect(Math.abs(s.energy - g.E_exact_two_electron_same_grid)).toBeLessThan(1e-6);
        expect(s.energy).toBeLessThan(g.E_HF);
        expect(s.energy - g.E_HF).toBeCloseTo(g.E_correlation, 6);
        expect(Math.abs(s.nonInteractingEnergy - g.E_noninteracting)).toBeLessThan(1e-9);
      },
    );
});

describe('twoelectron1d on a small grid (L = 10 bohr, 41 points)', () => {
  const opts = { L: 10, M: 41 } as const;
  const { x, h } = makeGrid(-10, 10, 41);
  const one = solveLowest(
    0.5,
    h,
    Float64Array.from(x, (v) => -2 / Math.sqrt(v * v + 1)),
    2,
  ).energies;
  it('without repulsion: singlet = 2 eps0 and triplet = eps0 + eps1 to 1e-9 (closed form of the separable problem)', () => {
    const s = solveTwoElectron({ ...opts, lambda: 0, tol: 1e-10 });
    const t = solveTwoElectron({ ...opts, lambda: 0, spin: 'triplet', tol: 1e-10 });
    expect(Math.abs(s.energy - 2 * one[0]!)).toBeLessThan(1e-9);
    expect(Math.abs(t.energy - one[0]! - one[1]!)).toBeLessThan(1e-9);
  });
  const s = solveTwoElectron({ ...opts, tol: 1e-10 });
  const t = solveTwoElectron({ ...opts, spin: 'triplet', tol: 1e-10 });
  it('singlet is symmetric, triplet antisymmetric, and the singlet lies lower', () => {
    const M = s.M;
    for (let j = 0; j < M; j++)
      for (let i = 0; i < M; i++) {
        expect(Math.abs(s.psi[i + M * j]! - s.psi[j + M * i]!)).toBeLessThan(1e-12);
        expect(Math.abs(t.psi[i + M * j]! + t.psi[j + M * i]!)).toBeLessThan(1e-12);
      }
    expect(s.energy).toBeLessThan(t.energy);
  });
  it('repulsion raises the energy, and the energy pieces add up', () => {
    expect(s.energy).toBeGreaterThan(s.nonInteractingEnergy);
    expect(s.interaction).toBeGreaterThan(0);
    expect(Math.abs(s.kinetic + s.external + s.interaction - s.energy)).toBeLessThan(1e-12);
    expect(s.kinetic).toBeGreaterThan(0);
  });
  it('density integrates to 2 and pair density to N (N - 1) = 2 (1e-10)', () => {
    let n = 0;
    for (const v of s.density) n += v * h;
    expect(Math.abs(n - 2)).toBeLessThan(1e-10);
    let p = 0;
    for (const v of pairDensity(s)) p += v * h * h;
    expect(Math.abs(p - 2)).toBeLessThan(1e-10);
    expect(Array.from(densityOf(s.psi, s.M, h))).toEqual(Array.from(s.density));
  });
  it('the xc hole integrates to -1 around every electron position (sum rule, 1e-9)', () => {
    for (const i of [5, 12, 20, 27, 35]) {
      let sum = 0;
      for (const v of xcHole(s, i)) sum += v * h;
      expect(Math.abs(sum + 1)).toBeLessThan(1e-9);
    }
  });
  it('triplet: two same-spin electrons never meet, so the hole at the electron removes the whole density', () => {
    for (const i of [10, 20, 30]) expect(Math.abs(xcHole(t, i)[i]! + t.density[i]!)).toBeLessThan(1e-12);
  });
});

describe('the exact Kohn-Sham system of the model (S-012, S-145)', () => {
  const s = solveTwoElectron({ Z: 2, L: 12, M: 59, tol: 1e-10 });
  const k = kohnShamInversion(s);
  it('two independent electrons in vs have exactly the interacting density, with eps = -I', () => {
    const r = nonInteractingDensity(k.vs, s.h);
    let worst = 0;
    for (let i = 0; i < s.M; i++) worst = Math.max(worst, Math.abs(r.density[i]! - s.density[i]!));
    expect(worst).toBeLessThan(1e-9);
    expect(Math.abs(r.eps - k.eps)).toBeLessThan(1e-9);
    expect(Math.abs(k.eps - (s.energy - s.oneElectron[0]))).toBeLessThan(1e-14);
    expect(k.ionisation).toBeGreaterThan(0);
  });
  it('Ts is below the true kinetic energy, E_xc is negative, and correlation is the small part of it', () => {
    expect(k.Ts).toBeLessThan(s.kinetic);
    expect(k.Exc).toBeLessThan(0);
    // for two electrons in one orbital, exact exchange is -E_H / 2; the rest is correlation
    const Ec = k.Exc + k.EH / 2;
    expect(Ec).toBeLessThan(0);
    expect(Math.abs(Ec)).toBeLessThan(0.1 * Math.abs(k.Exc));
  });
  it('without repulsion the Kohn-Sham potential is v_ext itself (vxc = 0 to 1e-6 where n is not tiny)', () => {
    const s0 = solveTwoElectron({ Z: 2, L: 12, M: 59, lambda: 0, tol: 1e-10 });
    const k0 = kohnShamInversion(s0);
    const peak = Math.max(...s0.density);
    for (let i = 0; i < s0.M; i++)
      if (s0.density[i]! > 1e-6 * peak) expect(Math.abs(k0.vxc[i]!)).toBeLessThan(1e-6);
  });
  it('refuses the triplet', () => {
    expect(() => kohnShamInversion(solveTwoElectron({ L: 8, M: 21, spin: 'triplet' }))).toThrow(RangeError);
  });
});
