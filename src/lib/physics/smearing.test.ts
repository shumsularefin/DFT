import { describe, expect, it } from 'vitest';
import { simpson } from './quadrature';
import {
  SMEARINGS,
  delta,
  entropy,
  erfc,
  hermite,
  mpCoeff,
  occupation,
  toyMetal,
  type SmearingId,
} from './smearing';
import { dudarevEnergy, dudarevPotential } from './dftu';

const ids = SMEARINGS.map((s) => s.id) as SmearingId[];
// Gaussian-type schemes vanish like exp(-x^2), so [-10, 10] is exact to 1e-10. Fermi-Dirac decays only like exp(-|x|):
// the mass outside [-10, 10] is 2 exp(-10) = 9e-5, so it is integrated over [-45, 45] instead (tail 1e-19).
const reach = (id: SmearingId) => (id === 'fermi' ? 45 : 10);
const moment = (id: SmearingId, m: number) =>
  simpson((x) => x ** m * delta(id, x), -reach(id), reach(id), 40000);

describe('erfc and Hermite', () => {
  it('erfc matches known values', () => {
    // erfc(0) = 1 exactly; erfc(1) = 0.157299207050285 (tabulated, Abramowitz and Stegun 7.1)
    expect(erfc(0)).toBeCloseTo(1, 14);
    expect(erfc(1)).toBeCloseTo(0.157299207050285, 12);
    expect(erfc(3)).toBeCloseTo(2.209049699858544e-5, 15);
    expect(erfc(-1)).toBeCloseTo(2 - 0.157299207050285, 12);
  });
  it('Hermite polynomials H2 = 4x^2 - 2 and H4 = 16x^4 - 48x^2 + 12', () => {
    expect(hermite(2, 0.7)).toBeCloseTo(4 * 0.49 - 2, 12);
    expect(hermite(4, 0.7)).toBeCloseTo(16 * 0.7 ** 4 - 48 * 0.49 + 12, 12);
  });
});

describe('every scheme', () => {
  it.each(ids)('%s: delta integrates to 1', (id) => {
    expect(moment(id, 0)).toBeCloseTo(1, 10);
  });
  it.each(ids)('%s: occupation goes from 1 to 0 and delta = -df/dx', (id) => {
    expect(occupation(id, -reach(id))).toBeCloseTo(1, 8);
    expect(occupation(id, reach(id))).toBeCloseTo(0, 8);
    for (const x of [-1.3, -0.2, 0.4, 1.1, 2.2]) {
      const h = 1e-5;
      const d = -(occupation(id, x + h) - occupation(id, x - h)) / (2 * h);
      expect(d).toBeCloseTo(delta(id, x), 7);
    }
  });
  it.each(ids)('%s: entropy equals the integral of t delta(t) from x to infinity', (id) => {
    for (const x of [-2, -0.5, 0, 0.8, 1.9]) {
      const q = simpson((t) => t * delta(id, t), x, id === 'fermi' ? 60 : 14, 40000);
      expect(entropy(id, x)).toBeCloseTo(q, 8);
    }
  });
});

describe('specific schemes', () => {
  it('Fermi-Dirac: f(0) = 1/2 and S(0) = ln 2', () => {
    expect(occupation('fermi', 0)).toBeCloseTo(0.5, 14);
    expect(entropy('fermi', 0)).toBeCloseTo(Math.log(2), 12);
  });
  it('Gaussian: f = erfc(x)/2 and second moment 1/2', () => {
    expect(occupation('gaussian', 0.6)).toBeCloseTo(erfc(0.6) / 2, 14);
    expect(moment('gaussian', 2)).toBeCloseTo(0.5, 9);
  });
  it('Methfessel-Paxton coefficients and the order-1 closed form delta_1 = (3/2 - x^2) exp(-x^2)/sqrt(pi)', () => {
    expect(mpCoeff(0)).toBeCloseTo(1 / Math.sqrt(Math.PI), 14);
    expect(mpCoeff(1)).toBeCloseTo(-1 / (4 * Math.sqrt(Math.PI)), 14);
    const x = 0.9;
    expect(delta('mp1', x)).toBeCloseTo(((1.5 - x * x) * Math.exp(-x * x)) / Math.sqrt(Math.PI), 13);
  });
  it('MP of order N has vanishing moments 1 <= m <= 2N + 1', () => {
    for (const m of [1, 2, 3]) expect(moment('mp1', m)).toBeCloseTo(0, 9);
    for (const m of [1, 2, 3, 4, 5]) expect(moment('mp2', m)).toBeCloseTo(0, 8);
  });
  it('MP occupations leave [0, 1] slightly (a known feature)', () => {
    const xs = Array.from({ length: 801 }, (_, i) => -4 + i * 0.01);
    for (const id of ['mp1', 'mp2'] as const) {
      const f = xs.map((x) => occupation(id, x));
      expect(Math.min(...f)).toBeLessThan(-1e-3);
      expect(Math.max(...f)).toBeGreaterThan(1 + 1e-3);
    }
  });
  it('cold smearing: delta integrates to 1 and has zero first moment', () => {
    expect(moment('cold', 0)).toBeCloseTo(1, 10);
    expect(moment('cold', 1)).toBeCloseTo(0, 10);
  });
  it('cold smearing: delta is negative above x = sqrt(2) (the stated sign convention, Q-046)', () => {
    expect(delta('cold', 1.6)).toBeLessThan(0);
    expect(delta('cold', 1.0)).toBeGreaterThan(0);
  });
});

describe('toy metal', () => {
  it('band energy rises, entropy term is negative, free energy is below the band energy', () => {
    for (const id of ids) {
      const r = toyMetal(id, 0.2);
      expect(r.entropyTerm).toBeLessThan(0);
      expect(r.freeShift).toBeLessThan(r.bandShift);
    }
  });
  it('a smaller sigma gives a smaller entropy term and a smaller shift', () => {
    const a = toyMetal('gaussian', 0.05);
    const b = toyMetal('gaussian', 0.3);
    expect(Math.abs(a.entropyTerm)).toBeLessThan(Math.abs(b.entropyTerm));
    expect(Math.abs(a.bandShift)).toBeLessThan(Math.abs(b.bandShift));
  });
  it('rejects a non-positive sigma', () => {
    expect(() => toyMetal('fermi', 0)).toThrow();
  });
});

describe('DFT+U (Dudarev)', () => {
  it('E_U(n = 0.5, U_eff = 4 eV) = 0.5 eV and E_U(0) = E_U(1) = 0', () => {
    expect(dudarevEnergy(4, 0.5)).toBeCloseTo(0.5, 14);
    expect(dudarevEnergy(4, 0)).toBe(0);
    expect(dudarevEnergy(4, 1)).toBe(0);
  });
  it('V(n = 1) = -U_eff / 2 and V(0) = +U_eff / 2', () => {
    expect(dudarevPotential(4, 1)).toBeCloseTo(-2, 14);
    expect(dudarevPotential(4, 0)).toBeCloseTo(2, 14);
  });
  it('V is the derivative of E_U', () => {
    for (const n of [0.1, 0.5, 0.83]) {
      const h = 1e-6;
      const d = (dudarevEnergy(3, n + h) - dudarevEnergy(3, n - h)) / (2 * h);
      expect(dudarevPotential(3, n)).toBeCloseTo(d, 7);
    }
  });
});
