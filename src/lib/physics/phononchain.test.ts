// Golden tests of the ball-and-spring chains against the analytic dispersions (S-050, S-036) and an independent
// eigenvalue solve of the 2x2 dynamical matrix.
import { describe, expect, it } from 'vitest';
import {
  chainDisplacements,
  diatomicAmplitudes,
  diatomicDynamicalMatrix,
  diatomicGroupVelocity,
  diatomicOmega,
  hermitian2Eigenvalues,
  monatomicOmega,
  zoneBoundaryGap,
} from './phononchain';

const qs = Array.from({ length: 41 }, (_, i) => (Math.PI * i) / 40);

describe('diatomic chain', () => {
  it('closed form equals the eigenvalues of the dynamical matrix within 1e-12', () => {
    for (const [m1, m2, k] of [
      [1, 1, 1],
      [1, 2.5, 1],
      [3, 1, 0.7],
      [12, 16, 4.2],
    ] as const)
      for (const q of qs) {
        const d = diatomicDynamicalMatrix(q, m1, m2, k);
        const [l0, l1] = hermitian2Eigenvalues(d.d11, d.d22, d.d12);
        const [wa, wo] = diatomicOmega(q, m1, m2, k);
        expect(wa * wa).toBeCloseTo(Math.max(0, l0), 12);
        expect(wo * wo).toBeCloseTo(l1, 12);
      }
  });

  it('has w = 0 for the acoustic branch at Gamma and w^2 = 2K (1/m1 + 1/m2) for the optical branch', () => {
    const [wa, wo] = diatomicOmega(0, 1, 3, 2);
    expect(wa).toBeCloseTo(0, 12);
    expect(wo * wo).toBeCloseTo(2 * 2 * (1 + 1 / 3), 12);
  });

  it('opens a gap at the zone boundary between sqrt(2K/m_heavy) and sqrt(2K/m_light)', () => {
    const [wa, wo] = diatomicOmega(Math.PI, 1, 3, 2);
    const [top, bottom] = zoneBoundaryGap(1, 3, 2);
    expect(wa).toBeCloseTo(Math.sqrt(4 / 3), 12);
    expect(wo).toBeCloseTo(2, 12);
    expect(top).toBeCloseTo(wa, 12);
    expect(bottom).toBeCloseTo(wo, 12);
  });

  it('with equal masses folds the monatomic chain of spacing a/2 (no gap)', () => {
    for (const q of qs) {
      const [wa, wo] = diatomicOmega(q, 1, 1, 1);
      expect(wa).toBeCloseTo(monatomicOmega(q, 1, 1, 0.5), 12);
      expect(wo).toBeCloseTo(monatomicOmega(q - 2 * Math.PI, 1, 1, 0.5), 12);
    }
  });

  it('acoustic sound speed at long wavelength is a sqrt(K / (2 (m1 + m2)))', () => {
    // small-q limit of the closed form: w = q a sqrt(K / (2 (m1 + m2)))
    const v = diatomicGroupVelocity(1e-3, 1, 3, 0, 2);
    expect(v).toBeCloseTo(Math.sqrt(2 / (2 * 4)), 5);
  });

  it('amplitudes: in phase acoustic at Gamma, centre of mass fixed for the optical mode, mass normalised', () => {
    const [a1, a2] = diatomicAmplitudes(0, 1, 3, 0);
    expect(a2.re / a1.re).toBeCloseTo(1, 12);
    const [o1, o2] = diatomicAmplitudes(0, 1, 3, 1);
    expect(1 * o1.re + 3 * o2.re).toBeCloseTo(0, 12);
    for (const q of qs)
      for (const b of [0, 1] as const) {
        const [u1, u2] = diatomicAmplitudes(q, 1, 3, b);
        expect(1 * (u1.re ** 2 + u1.im ** 2) + 3 * (u2.re ** 2 + u2.im ** 2)).toBeCloseTo(1, 12);
      }
  });

  it('at the zone boundary only the heavy atoms move in the acoustic mode, only the light in the optical', () => {
    const [a1, a2] = diatomicAmplitudes(Math.PI, 1, 3, 0);
    expect(Math.hypot(a1.re, a1.im)).toBeCloseTo(0, 12);
    expect(Math.hypot(a2.re, a2.im)).toBeGreaterThan(0.1);
    const [o1, o2] = diatomicAmplitudes(Math.PI, 1, 3, 1);
    expect(Math.hypot(o2.re, o2.im)).toBeCloseTo(0, 12);
    expect(Math.hypot(o1.re, o1.im)).toBeGreaterThan(0.1);
  });

  it('amplitudes solve the equations of motion', () => {
    for (const q of qs.slice(1, -1))
      for (const b of [0, 1] as const) {
        const [m1, m2, k] = [1.3, 2.9, 1.7];
        const w2 = diatomicOmega(q, m1, m2, k)[b] ** 2;
        const [u1, u2] = diatomicAmplitudes(q, m1, m2, b, k);
        // (2K - m1 w^2) U1 - K (1 + e^{-iq}) U2 = 0
        const c = { re: k * (1 + Math.cos(q)), im: -k * Math.sin(q) };
        const re = (2 * k - m1 * w2) * u1.re - (c.re * u2.re - c.im * u2.im);
        const im = (2 * k - m1 * w2) * u1.im - (c.re * u2.im + c.im * u2.re);
        expect(Math.hypot(re, im)).toBeLessThan(1e-12);
      }
  });

  it('displacements are periodic in time and wrap the chain as a wave of wavevector q', () => {
    const q = Math.PI / 3;
    const u0 = chainDisplacements(6, q, 1, 2, 0, 0.1);
    const u1 = chainDisplacements(6, q, 1, 2, 0, 1.1);
    u0.forEach((u, i) => expect(u1[i]).toBeCloseTo(u, 12));
    // cell 6 repeats cell 0 for q = pi/3 (period of 6 cells)
    const u = chainDisplacements(7, q, 1, 2, 0, 0.1);
    expect(u[12]).toBeCloseTo(u[0]!, 12);
    expect(Math.max(...u.map(Math.abs))).toBeLessThanOrEqual(1 + 1e-12);
  });
});

describe('monatomic chain', () => {
  it('w = 2 sqrt(K/m) |sin(q a / 2)|, maximum 2 sqrt(K/m) at the zone boundary', () => {
    expect(monatomicOmega(Math.PI, 2, 8)).toBeCloseTo(4, 12);
    expect(monatomicOmega(0, 2, 8)).toBe(0);
    expect(monatomicOmega(Math.PI / 2, 1, 1)).toBeCloseTo(Math.SQRT2, 12);
  });
});
