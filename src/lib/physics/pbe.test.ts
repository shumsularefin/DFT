import { describe, expect, it } from 'vitest';
import {
  BETA_PBE,
  GAMMA_PBE,
  KAPPA,
  MU_PBE,
  MU_PBESOL,
  PW92,
  correlationGradient,
  correlationPW92,
  densityFromRs,
  enhancement,
  exchangeEnhancement,
  exchangeUniform,
  fermiWavevector,
  tSquared,
} from './pbe';

// @source S-146 (PW92 fit and its uniform-gas values), S-013 (PBE constraints), S-147 (PBEsol constants)
describe('PW92 correlation of the uniform gas', () => {
  it('matches the uniform-gas correlation energies the fit reproduces (hartree, r_s = 1, 2, 5, 10)', () => {
    const table: [number, number][] = [
      [1, -0.0598],
      [2, -0.0448],
      [5, -0.0282],
      [10, -0.0186],
    ];
    for (const [rs, ec] of table) expect(correlationPW92(rs)).toBeCloseTo(ec, 3);
  });
  it('has the Gell-Mann-Brueckner high-density limit A ln r_s - 0.046644', () => {
    for (const rs of [1e-6, 1e-5])
      expect(correlationPW92(rs)).toBeCloseTo(PW92.A * Math.log(rs) - 0.046644, 3);
  });
  it('is negative and rises towards zero at low density', () => {
    let prev = -Infinity;
    for (let rs = 0.2; rs <= 50; rs += 0.2) {
      const e = correlationPW92(rs);
      expect(e).toBeLessThan(0);
      expect(e).toBeGreaterThan(prev);
      prev = e;
    }
    expect(() => correlationPW92(0)).toThrow(RangeError);
  });
});

describe('uniform-gas exchange and the variables', () => {
  it('eps_x = -(3 / 4 pi) (9 pi / 4)^(1/3) / r_s = -0.458165 / r_s hartree', () => {
    for (const rs of [0.5, 1, 4]) expect(exchangeUniform(rs) * rs).toBeCloseTo(-0.458165, 5);
  });
  it('k_F = (3 pi^2 n)^(1/3) with n = 3 / (4 pi r_s^3)', () => {
    for (const rs of [1, 3])
      expect(fermiWavevector(rs)).toBeCloseTo(Math.cbrt(3 * Math.PI ** 2 * densityFromRs(rs)), 12);
  });
  it('t^2 = s^2 pi k_F / 4 (t = |grad n| / 2 k_s n, k_s^2 = 4 k_F / pi)', () => {
    const rs = 2;
    const n = densityFromRs(rs);
    const kf = fermiWavevector(rs);
    const grad = 0.7 * 2 * kf * n; // s = 0.7
    const ks = Math.sqrt((4 * kf) / Math.PI);
    expect(tSquared(rs, 0.7)).toBeCloseTo((grad / (2 * ks * n)) ** 2, 12);
  });
});

describe('PBE and PBEsol constants and constraints', () => {
  it('constants as published', () => {
    expect(MU_PBE).toBeCloseTo(0.21951, 5);
    expect(BETA_PBE).toBeCloseTo(0.066725, 6);
    expect(GAMMA_PBE).toBeCloseTo(0.031091, 6);
    expect(KAPPA).toBe(0.804);
    expect(MU_PBESOL).toBeCloseTo(0.123457, 6);
  });
  it('F_x: 1 at s = 0, 1 + mu s^2 for small s, tends to 1 + kappa, never above it', () => {
    expect(exchangeEnhancement(0)).toBe(1);
    const s = 1e-3;
    expect((exchangeEnhancement(s) - 1) / (s * s)).toBeCloseTo(MU_PBE, 5);
    expect(exchangeEnhancement(1e4)).toBeCloseTo(1 + KAPPA, 6);
    for (let x = 0; x < 20; x += 0.25) expect(exchangeEnhancement(x)).toBeLessThanOrEqual(1 + KAPPA);
  });
  it('H vanishes for a uniform gas, follows the gradient expansion beta t^2, and cancels eps_c for rapid variation', () => {
    for (const rs of [0.5, 2, 8]) {
      expect(correlationGradient(rs, 0)).toBe(0);
      const s = 1e-3;
      expect(correlationGradient(rs, s) / tSquared(rs, s)).toBeCloseTo(BETA_PBE, 4);
      expect(correlationPW92(rs) + correlationGradient(rs, 300)).toBeCloseTo(0, 5);
    }
  });
  it('the uniform limit of every form is LDA: F_xc(r_s, 0) = 1 + eps_c / eps_x', () => {
    for (const rs of [0.5, 2, 6])
      for (const f of ['lda', 'pbe', 'pbesol'] as const)
        expect(enhancement(f, rs, 0)).toBeCloseTo(1 + correlationPW92(rs) / exchangeUniform(rs), 12);
    expect(enhancement('pbe-x', 3, 0)).toBe(1);
  });
  it('at high density correlation drops out: F_xc tends to F_x', () => {
    expect(enhancement('pbe', 1e-4, 1.5)).toBeCloseTo(exchangeEnhancement(1.5), 2);
  });
  it('LDA ignores the gradient; PBE enhances more than PBEsol at s = 1 (larger mu)', () => {
    expect(enhancement('lda', 2, 2)).toBe(enhancement('lda', 2, 0));
    expect(enhancement('pbe', 2, 1)).toBeGreaterThan(enhancement('pbesol', 2, 1));
  });
});
