// Golden tests of the toy optimisers: closed forms on a quadratic and the Muller-Brown stationary points (S-164).
import { describe, expect, it } from 'vitest';
import { MULLER_BROWN, newtonStationary, quadratic, relax } from './relax2d';

describe('Muller-Brown surface', () => {
  it('the analytic gradient matches finite differences', () => {
    const h = 1e-6;
    for (const [x, y] of [
      [-0.5, 1.4],
      [0.6, 0.1],
      [0.2, 0.3],
      [-1.2, 1.9],
    ] as const) {
      const [gx, gy] = MULLER_BROWN.gradient(x, y);
      const fx = (MULLER_BROWN.energy(x + h, y) - MULLER_BROWN.energy(x - h, y)) / (2 * h);
      const fy = (MULLER_BROWN.energy(x, y + h) - MULLER_BROWN.energy(x, y - h)) / (2 * h);
      expect(gx).toBeCloseTo(fx, 4);
      expect(gy).toBeCloseTo(fy, 4);
    }
  });

  it('has its three minima and two saddles at the published places (S-164)', () => {
    const ref: [number, number, number][] = [
      [-0.558, 1.442, -146.7],
      [0.623, 0.028, -108.17],
      [-0.05, 0.467, -80.77],
      [-0.822, 0.624, -40.66],
      [0.212, 0.293, -72.25],
    ];
    for (const [x0, y0, e0] of ref) {
      const [x, y] = newtonStationary(MULLER_BROWN, [x0, y0]);
      expect(Math.hypot(...MULLER_BROWN.gradient(x, y))).toBeLessThan(1e-8);
      expect(x).toBeCloseTo(x0, 2);
      expect(y).toBeCloseTo(y0, 2);
      expect(Math.abs(MULLER_BROWN.energy(x, y) - e0)).toBeLessThan(0.02);
    }
  });
});

describe('optimisers on a quadratic', () => {
  const q = quadratic(3, 1, 1);

  it('steepest descent follows x_n = (1 - step h)^n x_0 on a diagonal quadratic', () => {
    const d = quadratic(2, 0, 0.5);
    const r = relax(d, [1, -2], 'sd', { step: 0.1, maxSteps: 10 });
    r.steps.forEach((s, n) => {
      expect(s.x).toBeCloseTo(0.8 ** n, 12);
      expect(s.y).toBeCloseTo(-2 * 0.95 ** n, 12);
      expect(s.kind).toBe(n ? 'step' : 'start');
    });
  });

  it('conjugate gradients with the secant line step is exact in two lines in two dimensions', () => {
    const r = relax(q, [1, 1], 'cg', { step: 0.05, maxSteps: 4 });
    expect(r.steps.map((s) => s.kind)).toEqual(['start', 'trial', 'correct', 'trial', 'correct']);
    const end = r.steps.at(-1)!;
    expect(Math.hypot(end.x, end.y)).toBeLessThan(1e-10);
  });

  it('BFGS converges and its first step is step times the force', () => {
    const r = relax(q, [1, 1], 'bfgs', { step: 0.05, maxSteps: 40, forceTol: 1e-9 });
    expect(r.converged).toBe(true);
    const [s0, s1] = r.steps;
    expect(s1!.x - s0!.x).toBeCloseTo(0.05 * s0!.fx, 12);
    expect(s1!.y - s0!.y).toBeCloseTo(0.05 * s0!.fy, 12);
  });

  it('damped dynamics follows its recurrence', () => {
    const mu = 0.4;
    const step = 0.1;
    const d = quadratic(1, 0, 1);
    const r = relax(d, [1, 0], 'damped', { step, maxSteps: 2, damping: mu });
    const v1 = (step * -1) / (1 + mu / 2);
    const x1 = 1 + v1;
    const v2 = ((1 - mu / 2) * v1 + step * -x1) / (1 + mu / 2);
    expect(r.steps[1]!.x).toBeCloseTo(x1, 12);
    expect(r.steps[2]!.x).toBeCloseTo(x1 + v2, 12);
  });

  it('a trust radius caps every move', () => {
    const r = relax(MULLER_BROWN, [-0.2, 1.8], 'sd', { step: 0.01, maxSteps: 10, maxMove: 0.05 });
    for (let i = 1; i < r.steps.length; i++)
      expect(
        Math.hypot(r.steps[i]!.x - r.steps[i - 1]!.x, r.steps[i]!.y - r.steps[i - 1]!.y),
      ).toBeLessThanOrEqual(0.05 + 1e-12);
  });
});
