import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boxBeatPeriodFs, boxDensity, boxEnergyEV, boxInteriorNodes, boxPsi } from './box';
import { simpson } from './quadrature';

const golden = JSON.parse(readFileSync('tests/reference/quantum_basics_reference.json', 'utf8'));

describe('particle in a box (S-047)', () => {
  it('has the energies stated in the work order', () => {
    expect(boxEnergyEV(1, 1)).toBeCloseTo(37.603, 3);
    expect(boxEnergyEV(1, 5)).toBeCloseTo(1.5041, 4);
    expect(boxEnergyEV(1, 10)).toBeCloseTo(0.37603, 5);
    expect(boxEnergyEV(2, 5) - boxEnergyEV(1, 5)).toBeCloseTo(4.5124, 4);
  });
  it('scales as n^2 / L^2', () => {
    for (const n of [2, 3, 4, 5, 6]) expect(boxEnergyEV(n, 5)).toBeCloseTo(n * n * boxEnergyEV(1, 5), 10);
    expect(boxEnergyEV(1, 2.5)).toBeCloseTo(4 * boxEnergyEV(1, 5), 10);
  });
  it('matches the scipy golden energies and wavefunction values', () => {
    for (const e of golden.box.energies)
      expect(Math.abs(boxEnergyEV(e.n, e.L) - e.E_eV) / e.E_eV).toBeLessThan(1e-7);
    for (const p of golden.box.psi) expect(boxPsi(p.n, p.L, p.x)).toBeCloseTo(p.psi, 10);
  });
  it('wavefunctions are normalised to 1 (1e-9)', () => {
    for (const [n, L] of [
      [1, 5],
      [3, 2],
      [6, 10],
      [2, 0.5],
    ] as const)
      expect(simpson((x) => boxPsi(n, L, x) ** 2, 0, L, 2000)).toBeCloseTo(1, 9);
  });
  it('are orthogonal for different n (1e-9)', () => {
    const L = 4;
    for (let n = 1; n <= 6; n++)
      for (let m = n + 1; m <= 6; m++)
        expect(Math.abs(simpson((x) => boxPsi(n, L, x) * boxPsi(m, L, x), 0, L, 2000))).toBeLessThan(1e-9);
  });
  it('have n - 1 interior nodes', () => {
    const L = 3;
    for (let n = 1; n <= 6; n++) {
      let crossings = 0;
      let prev = boxPsi(n, L, 1e-9);
      for (let i = 1; i < 3000; i++) {
        const v = boxPsi(n, L, (L * (i + 0.5)) / 3000);
        if (prev * v < 0) crossings++;
        prev = v;
      }
      expect(crossings).toBe(boxInteriorNodes(n));
    }
  });
  it('beat period T = h / (E2 - E1) is 0.9166 fs at L = 5 A', () => {
    // h = 4.135667696e-15 eV s exactly; dE = 4.5124 eV (work order), so T = 0.91657 fs
    expect(boxBeatPeriodFs(5, 1, 2)).toBeCloseTo(4.135667696e-15 / 4.5124 / 1e-15, 3);
  });
  it('density of a superposition repeats after one beat period and is normalised at every time', () => {
    const L = 5;
    for (const phase of [0, 0.25, 0.5, 0.9]) {
      expect(simpson((x) => boxDensity(L, 1, 2, 0.4, phase, x), 0, L, 2000)).toBeCloseTo(1, 9);
      expect(boxDensity(L, 1, 2, 0.4, phase + 1, 1.3)).toBeCloseTo(boxDensity(L, 1, 2, 0.4, phase, 1.3), 12);
    }
    expect(boxDensity(L, 2, 3, 0, 0.37, 1.1)).toBeCloseTo(boxPsi(2, L, 1.1) ** 2, 14);
  });
  it('never returns NaN over the lab ranges', () => {
    for (const L of [0.5, 1, 10])
      for (let n = 1; n <= 7; n++) expect(Number.isFinite(boxEnergyEV(n, L))).toBe(true);
    expect(Number.isFinite(boxBeatPeriodFs(0.5, 6, 7))).toBe(true);
  });
});
