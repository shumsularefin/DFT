// Reference checks: forces are minus the numerical gradient of the energy and add to zero (S-093), the virial stress is
// the strain derivative of the energy over the volume (S-092), the equilibrium lattice has zero pressure, and the
// optimizers lower the energy (S-068).
import { describe, expect, it } from 'vitest';
import { EV_PER_A3_IN_GPA, KBAR_IN_GPA } from './constants';
import {
  TOY_LJ,
  equilibriumFcc,
  evaluate,
  fccSupercell,
  ljPair,
  maxForce,
  pressureKbar,
  relax,
  rng,
  strainCell,
  type Cell,
  type M3,
  type V3,
} from './ljcell';

function rattled(a: number, amp: number, seed: number): Cell {
  const c = fccSupercell(a, 2);
  const r = rng(seed);
  return {
    lattice: c.lattice,
    positions: c.positions.map((p) => p.map((x) => x + amp * (2 * r() - 1)) as V3),
  };
}

const zero = (): M3 => [
  [0, 0, 0],
  [0, 0, 0],
  [0, 0, 0],
];

describe('ljPair', () => {
  it('is zero at the cutoff, minimal at 2^(1/6) sigma, and de is the derivative of e', () => {
    expect(ljPair(TOY_LJ, TOY_LJ.rc).e).toBeCloseTo(0, 14);
    expect(ljPair(TOY_LJ, 2 ** (1 / 6) * TOY_LJ.sigma).de).toBeCloseTo(0, 12);
    const r = 2.7;
    const h = 1e-6;
    expect(ljPair(TOY_LJ, r).de).toBeCloseTo(
      (ljPair(TOY_LJ, r + h).e - ljPair(TOY_LJ, r - h).e) / (2 * h),
      7,
    );
  });
});

describe('evaluate', () => {
  const a = equilibriumFcc();
  const cell = rattled(a, 0.15, 11);
  const res = evaluate(cell);
  it('forces are minus the numerical gradient of the energy', () => {
    const h = 1e-5;
    for (const i of [0, 5, 17])
      for (let c = 0; c < 3; c++) {
        const plus = structuredClone(cell);
        const minus = structuredClone(cell);
        plus.positions[i]![c] += h;
        minus.positions[i]![c] -= h;
        const g = (evaluate(plus).energy - evaluate(minus).energy) / (2 * h);
        expect(res.forces[i]![c]).toBeCloseTo(-g, 6);
      }
  });
  it('forces add to zero (no net force on a periodic cell)', () => {
    for (let c = 0; c < 3; c++) expect(res.forces.reduce((s, f) => s + f[c]!, 0)).toBeCloseTo(0, 12);
  });
  it('the stress is (1/V) dE/d(strain) for every component', () => {
    const h = 1e-6;
    for (let x = 0; x < 3; x++)
      for (let y = 0; y < 3; y++) {
        const ep = zero();
        const em = zero();
        ep[x]![y] = h;
        em[x]![y] = -h;
        const d = (evaluate(strainCell(cell, ep)).energy - evaluate(strainCell(cell, em)).energy) / (2 * h);
        expect(res.stress[x]![y]).toBeCloseTo(d / res.volume, 7);
      }
  });
  it('a perfect crystal has no forces, and zero pressure at the equilibrium constant', () => {
    const perfect = evaluate(fccSupercell(a, 2));
    expect(maxForce(perfect.forces).value).toBeLessThan(1e-12);
    expect(pressureKbar(perfect.stress)).toBeCloseTo(0, 6);
    expect(a).toBeGreaterThan(3.4);
    expect(a).toBeLessThan(3.7);
  });
  it('a squeezed crystal has positive pressure, a stretched one negative', () => {
    expect(pressureKbar(evaluate(fccSupercell(a * 0.98, 2)).stress)).toBeGreaterThan(0);
    expect(pressureKbar(evaluate(fccSupercell(a * 1.02, 2)).stress)).toBeLessThan(0);
  });
  it('pressureKbar converts eV/A^3 to kB', () => {
    const s: M3 = [
      [-1, 0, 0],
      [0, -1, 0],
      [0, 0, -1],
    ];
    expect(pressureKbar(s)).toBeCloseTo(EV_PER_A3_IN_GPA / KBAR_IN_GPA, 9);
    expect(EV_PER_A3_IN_GPA / KBAR_IN_GPA).toBeCloseTo(1602.18, 1);
  });
});

describe('relax', () => {
  const a = equilibriumFcc();
  const start = rattled(a, 0.12, 7);
  it('every optimizer with a small step lowers the energy and the largest force', () => {
    for (const m of ['sd', 'damped', 'bfgs'] as const) {
      const path = relax(start, m, 0.3, 30);
      expect(path).toHaveLength(31);
      expect(path[30]!.energy).toBeLessThan(path[0]!.energy);
      expect(path[30]!.fmax).toBeLessThan(path[0]!.fmax);
    }
  });
  it('BFGS reaches a largest force below 0.01 eV/A within 30 steps', () => {
    const path = relax(start, 'bfgs', 0.5, 30);
    expect(Math.min(...path.map((s) => s.fmax))).toBeLessThan(0.01);
  });
  it('steepest descent with too large a step does not settle', () => {
    const calm = relax(start, 'sd', 0.5, 30);
    const wild = relax(start, 'sd', 2, 30);
    expect(wild[30]!.fmax).toBeGreaterThan(calm[30]!.fmax);
  });
  it('no atom moves more than MAX_STEP in one step', () => {
    const path = relax(start, 'sd', 2, 5);
    for (let s = 1; s < path.length; s++)
      path[s]!.positions.forEach((p, i) => {
        const q = path[s - 1]!.positions[i]!;
        expect(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])).toBeLessThanOrEqual(0.25 + 1e-12);
      });
  });
});
