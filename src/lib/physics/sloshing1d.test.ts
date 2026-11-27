import { describe, expect, it } from 'vitest';
import { dielectric, errorAt, gain, kerker, lumpError, modeVectors, slosh, stableAmix } from './sloshing1d';

const base = { length: 30, kTF: 1.5, amix: 0.4, bmix: 1, mixer: 'linear' as const, iterations: 30 };

describe('Thomas-Fermi response (independent real-space check)', () => {
  it('a cosine error in the input comes back as -eps(q) times itself, with v_H from Poisson on a grid', () => {
    // n_out = -D (v_H[n_in]), kTF^2 = 4 pi e^2 D; v_H'' = -4 pi e^2 n, integrated twice on a periodic grid.
    // In units where 4 pi e^2 = 1: v'' = -n, D = kTF^2. Then n_out - n_in = -(1 + kTF^2 / q^2) n_in.
    const L = 20;
    const kTF = 1.3;
    const N = 4000;
    const h = L / N;
    for (const m of [1, 3]) {
      const q = (2 * Math.PI * m) / L;
      const n = Array.from({ length: N }, (_, i) => Math.cos(q * i * h));
      // first integral (v' = -int n), made zero-mean; then v = int v', made zero-mean (trapezoid rule)
      const dv = [0];
      for (let i = 1; i < N; i++) dv.push(dv[i - 1]! - 0.5 * h * (n[i - 1]! + n[i]!));
      const mdv = dv.reduce((s, x) => s + x, 0) / N;
      const dv0 = dv.map((x) => x - mdv);
      const v = [0];
      for (let i = 1; i < N; i++) v.push(v[i - 1]! + 0.5 * h * (dv0[i - 1]! + dv0[i]!));
      const mv = v.reduce((s, x) => s + x, 0) / N;
      const R = n.map((ni, i) => -kTF * kTF * (v[i]! - mv) - ni);
      for (const i of [0, 137, 1500]) expect(R[i]!).toBeCloseTo(-dielectric(q, kTF) * n[i]!, 3);
    }
  });
});

describe('simple mixing, mode by mode (closed form)', () => {
  it('each error wave is multiplied by g(q) = 1 - K(q) eps(q) every iteration', () => {
    const r = slosh(base);
    const q = r.q;
    const e0 = r.errors[0]!;
    for (const n of [1, 5, 12])
      for (const i of [0, 3, 10]) {
        const g = gain(q[i]!, base.kTF, base.amix, base.bmix);
        expect(r.errors[n]!.a[i]!).toBeCloseTo(e0.a[i]! * g ** n, 12);
        expect(r.errors[n]!.b[i]!).toBeCloseTo(e0.b[i]! * g ** n, 12);
      }
  });
  it('Kerker with BMIX = kTF makes every wave shrink by exactly 1 - AMIX', () => {
    for (const q of modeVectors(50)) expect(gain(q, 1.5, 0.3, 1.5)).toBeCloseTo(0.7, 12);
  });
  it('plain mixing needs AMIX below 2 / eps(q_min), which falls like 1 / L^2', () => {
    for (const L of [10, 40]) {
      const qmin = (2 * Math.PI) / L;
      expect(stableAmix(L, 1.5, 0)).toBeCloseTo(2 / dielectric(qmin, 1.5), 12);
    }
    expect(stableAmix(10, 1.5, 0) / stableAmix(40, 1.5, 0)).toBeGreaterThan(12);
    const L = 40;
    const crit = stableAmix(L, 1.5, 0);
    const calm = slosh({ ...base, length: L, bmix: 0, amix: 0.9 * crit, iterations: 400 });
    expect(calm.residuals.at(-1)!).toBeLessThan(1e-3);
    const wild = slosh({ ...base, length: L, bmix: 0, amix: 1.2 * crit, iterations: 400 });
    expect(wild.residuals.at(-1)!).toBeGreaterThan(1);
  });
  it('the slowest plain-mixing wave in a long cell flips sign every step (sloshing)', () => {
    const L = 40;
    const g = gain((2 * Math.PI) / L, 1.5, 0.4, 0);
    expect(g).toBeLessThan(-1);
    expect(kerker(1, 0.4, 0)).toBe(0.4);
  });
});

describe('starting error', () => {
  it('rebuilds the neutral Gaussian lump in real space', () => {
    const L = 24;
    const q = modeVectors(L, 24);
    const e = lumpError(L, q, 1);
    const w = L / 12;
    const mean = (w * Math.sqrt(2 * Math.PI)) / L;
    for (const z of [L / 4, L / 4 + w, 0.8 * L]) {
      const want = Math.exp(-((z - L / 4) ** 2) / (2 * w * w)) - mean;
      expect(errorAt(q, e, z)).toBeCloseTo(want, 6);
    }
  });
});

describe('Pulay mixing', () => {
  it('converges a long cell where plain mixing with the same AMIX runs away', () => {
    const o = { ...base, length: 40, bmix: 0, amix: 0.1, iterations: 40 };
    expect(slosh(o).diverged || slosh(o).residuals.at(-1)! > 1).toBe(true);
    const p = slosh({ ...o, mixer: 'pulay' });
    expect(p.diverged).toBe(false);
    expect(p.residuals.at(-1)!).toBeLessThan(1e-6);
  });
});
