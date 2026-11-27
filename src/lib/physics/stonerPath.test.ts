import { describe, expect, it } from 'vitest';
import { solveStoner, stonerEnergy } from './stoner';
import { stonerDerivatives, stonerDescent } from './stonerPath';

describe('downhill path on the Stoner energy (S-059)', () => {
  it('the derivatives equal finite differences of stonerEnergy', () => {
    const p = { dosPerSpin: 1.2, stonerI: 1.3 };
    const h = 1e-5;
    for (const m of [-1.7, -0.2, 0, 0.6, 2.1]) {
      const d = stonerDerivatives(p, m);
      const fd1 = (stonerEnergy(p, m + h) - stonerEnergy(p, m - h)) / (2 * h);
      const fd2 = (stonerEnergy(p, m + h) - 2 * stonerEnergy(p, m) + stonerEnergy(p, m - h)) / (h * h);
      expect(d.slope).toBeCloseTo(fd1, 8);
      expect(d.curvature).toBeCloseTo(fd2, 4);
    }
  });

  it('ends at the equilibrium moment of solveStoner, with the sign of the start', () => {
    for (const [n, i, m0] of [
      [1, 1.5, 0.5],
      [1, 2.5, 2.2],
      [1.4, 1.2, -0.3],
      [0.8, 2.0, 1.0],
    ] as const) {
      const p = { dosPerSpin: n, stonerI: i };
      const { moments } = stonerDescent(p, m0, 400);
      expect(moments.at(-1)!).toBeCloseTo(Math.sign(m0) * solveStoner(p).equilibriumMoment, 6);
    }
  });

  it('every step lowers the energy, and the path never crosses the minimum', () => {
    const p = { dosPerSpin: 1, stonerI: 2 };
    const { moments, energies } = stonerDescent(p, 2.2, 60);
    const mStar = solveStoner(p).equilibriumMoment;
    for (let k = 1; k < energies.length; k++)
      expect(energies[k]!).toBeLessThanOrEqual(energies[k - 1]! + 1e-15);
    for (const m of moments) expect(m).toBeGreaterThanOrEqual(mStar - 1e-12);
  });

  it('a start at m = 0 stays at m = 0 even when I N > 1 (a stationary point), and I N < 1 decays to 0', () => {
    expect(stonerDescent({ dosPerSpin: 1, stonerI: 2 }, 0, 30).moments.every((m) => m === 0)).toBe(true);
    expect(stonerDescent({ dosPerSpin: 1, stonerI: 0.5 }, 1.5, 400).moments.at(-1)!).toBeCloseTo(0, 6);
  });
});
