import { describe, expect, it } from 'vitest';
import { lorentzEps } from './lorentz';

describe('Lorentz oscillator (S-082)', () => {
  const osc = { e0: 3, f: 20, gamma: 0.4 };

  it('static limit eps1(0) = eps_inf + f / E0^2 and eps2(0) = 0', () => {
    const [e1, e2] = lorentzEps(0, [osc], 2);
    expect(e1).toBeCloseTo(2 + 20 / 9, 12);
    expect(e2).toBe(0);
  });

  it('at resonance eps1 = eps_inf and eps2 = f / (gamma E0)', () => {
    const [e1, e2] = lorentzEps(3, [osc], 1.5);
    expect(e1).toBeCloseTo(1.5, 12);
    expect(e2).toBeCloseTo(20 / (0.4 * 3), 12);
  });

  it('obeys the f-sum rule integral E eps2 dE = (pi / 2) f for several broadenings', () => {
    for (const gamma of [0.1, 0.5, 1.5]) {
      const o = [{ e0: 3, f: 20, gamma }];
      // integrate in u = E / (1 + E) on [0, 1) so the 1/E^2 tail is covered; midpoint rule on a fine grid
      const n = 400_000;
      let s = 0;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const e = u / (1 - u);
        s += e * lorentzEps(e, o)[1] * (1 / (1 - u) ** 2) * (1 / n);
      }
      expect(s / ((Math.PI / 2) * 20)).toBeCloseTo(1, 4);
    }
  });

  it('adds oscillators linearly', () => {
    const a = { e0: 2, f: 5, gamma: 0.2 };
    const b = { e0: 6, f: 30, gamma: 0.8 };
    const [x1, x2] = lorentzEps(4, [a, b], 1);
    const [a1, a2] = lorentzEps(4, [a], 1);
    const [b1, b2] = lorentzEps(4, [b], 0);
    expect(x1).toBeCloseTo(a1 + b1, 12);
    expect(x2).toBeCloseTo(a2 + b2, 12);
  });
});
