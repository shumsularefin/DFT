import { describe, expect, it } from 'vitest';
import { simpson } from './quadrature';
import { delta, entropy, erfc, hermite, mpA, occupation, toyMetal, type SmearingMethod } from './smearing';
import { penaltyEnergy, penaltyPotential } from './dftu';

const ALL: SmearingMethod[] = ['fermi-dirac', 'gaussian', 'mp1', 'mp2', 'cold'];
const Q = (f: (x: number) => number, a = -10, b = 10) => simpson(f, a, b, 20000);
// Fermi-Dirac tails decay only as exp(-|x|), so its integrals use a wider window.
const range = (m: SmearingMethod): [number, number] => (m === 'fermi-dirac' ? [-60, 60] : [-10, 10]);

describe('smearing invariants (work order M7.2)', () => {
  for (const m of ALL) {
    it(`${m}: delta integrates to 1 within 1e-10`, () => {
      expect(Math.abs(Q((x) => delta(m, x), ...range(m)) - 1)).toBeLessThan(1e-10);
    });
    it(`${m}: delta = -df/dx (central difference)`, () => {
      for (const x of [-2.3, -0.7, 0, 0.4, 1.9]) {
        const h = 1e-5;
        const d = -(occupation(m, x + h) - occupation(m, x - h)) / (2 * h);
        expect(d).toBeCloseTo(delta(m, x), 8);
      }
    });
    it(`${m}: f -> 1 below and -> 0 above the Fermi level`, () => {
      const far = m === 'fermi-dirac' ? 40 : 12;
      expect(occupation(m, -far)).toBeCloseTo(1, 10);
      expect(occupation(m, far)).toBeCloseTo(0, 10);
    });
    it(`${m}: ds/dx = -x delta(x) and s vanishes far away`, () => {
      for (const x of [-1.5, -0.2, 0.8, 2.2]) {
        const h = 1e-5;
        expect((entropy(m, x + h) - entropy(m, x - h)) / (2 * h)).toBeCloseTo(-x * delta(m, x), 7);
      }
      expect(Math.abs(entropy(m, m === 'fermi-dirac' ? 40 : 15))).toBeLessThan(1e-8);
    });
  }
  it('Fermi-Dirac f(0) = 1/2', () => expect(occupation('fermi-dirac', 0)).toBe(0.5));
  it('Gaussian second moment is 1/2 and f = erfc(x)/2', () => {
    expect(Q((x) => x * x * delta('gaussian', x))).toBeCloseTo(0.5, 10);
    expect(occupation('gaussian', 0.3)).toBeCloseTo(0.5 * erfc(0.3), 14);
  });
  for (const [m, N] of [
    ['mp1', 1],
    ['mp2', 2],
  ] as const) {
    it(`${m}: moments 1..${2 * N + 1} vanish`, () => {
      for (let k = 1; k <= 2 * N + 1; k++)
        expect(Math.abs(Q((x) => x ** k * delta(m, x)))).toBeLessThan(1e-10);
    });
    it(`${m}: occupations go slightly outside [0, 1] (a known feature)`, () => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let x = -5; x <= 5; x += 0.01) {
        lo = Math.min(lo, occupation(m, x));
        hi = Math.max(hi, occupation(m, x));
      }
      expect(lo).toBeLessThan(0);
      expect(hi).toBeGreaterThan(1);
    });
  }
  it('MP1 delta equals (3/2 - x^2) exp(-x^2)/sqrt(pi) (worked by hand in planning)', () => {
    for (const x of [-1.2, 0, 0.5, 2])
      expect(delta('mp1', x)).toBeCloseTo(((1.5 - x * x) * Math.exp(-x * x)) / Math.sqrt(Math.PI), 14);
  });
  it('MP coefficients and Hermite polynomials', () => {
    expect(mpA(0)).toBeCloseTo(1 / Math.sqrt(Math.PI), 15);
    expect(mpA(1)).toBeCloseTo(-1 / (4 * Math.sqrt(Math.PI)), 15);
    expect(mpA(2)).toBeCloseTo(1 / (32 * Math.sqrt(Math.PI)), 15);
    expect(hermite(2, 1.5)).toBeCloseTo(4 * 2.25 - 2, 12);
    expect(hermite(4, 0.5)).toBeCloseTo(16 * 0.0625 - 48 * 0.25 + 12, 12);
  });
  it('cold smearing: zero first moment, occupations never negative but above 1 below the Fermi level', () => {
    expect(Math.abs(Q((x) => x * delta('cold', x)))).toBeLessThan(1e-10);
    let lo = Infinity;
    let hi = -Infinity;
    for (let x = -6; x <= 6; x += 0.01) {
      lo = Math.min(lo, occupation('cold', x));
      hi = Math.max(hi, occupation('cold', x));
    }
    expect(lo).toBeGreaterThanOrEqual(0);
    expect(hi).toBeGreaterThan(1);
  });
  it('erfc: continuous at the switch and matches A&S values (S-053)', () => {
    expect(erfc(3 - 1e-12)).toBeCloseTo(erfc(3), 12);
    // erfc(1) = 1 - 0.8427007929 (Abramowitz and Stegun Table 7.1)
    expect(erfc(1)).toBeCloseTo(0.1572992071, 9);
    expect(erfc(5) / 1.5374597944e-12).toBeCloseTo(1, 8);
  });
});

describe('toy metal (free-electron DOS, one electron, eF = 5 eV)', () => {
  it('sigma = 0 gives (3/5) eF', () => expect(toyMetal('gaussian', 0).E).toBe(3));
  it('small sigma reproduces (3/5) eF and the electron count', () => {
    const r = toyMetal('gaussian', 0.01);
    expect(r.E).toBeCloseTo(3, 4);
  });
  it('Fermi-Dirac entropy term follows the Sommerfeld result T*S = (pi^2/3) g(eF) sigma^2', () => {
    const s = 0.05;
    const gF = 1.5 / 5;
    expect(toyMetal('fermi-dirac', s).TS / ((Math.PI ** 2 / 3) * gF * s * s)).toBeCloseTo(1, 2);
  });
  it('Gaussian entropy term is g(eF) sigma^2 / 2 to leading order', () => {
    const s = 0.05;
    expect(toyMetal('gaussian', s).TS / ((1.5 / 5) * s * s * 0.5)).toBeCloseTo(1, 2);
  });
});

describe('Dudarev DFT+U toy (S-014, work order values)', () => {
  it('E_U(n = 0.5, U_eff = 4 eV) = 0.5 eV', () => expect(penaltyEnergy(4, 0.5)).toBe(0.5));
  it('E_U vanishes for empty and full orbitals', () => {
    expect(penaltyEnergy(4, 0)).toBe(0);
    expect(penaltyEnergy(4, 1)).toBe(0);
  });
  it('V(n = 1) = -U_eff / 2 and V is the derivative of E_U', () => {
    expect(penaltyPotential(4, 1)).toBe(-2);
    const h = 1e-6;
    expect((penaltyEnergy(3, 0.3 + h) - penaltyEnergy(3, 0.3 - h)) / (2 * h)).toBeCloseTo(
      penaltyPotential(3, 0.3),
      8,
    );
  });
});

describe('cold smearing follows Eq. (1) of Marzari et al. 1999 (S-016, Q-041)', () => {
  // Eq. (1), written in the paper's own variable u = (mu - epsilon) / sigma.
  const paper = (u: number) =>
    (Math.exp(-((u - 1 / Math.SQRT2) ** 2)) * (2 - Math.SQRT2 * u)) / Math.sqrt(Math.PI);
  it('delta(x) equals the paper with u = -x', () => {
    for (const x of [-3, -1.2, -0.5, 0, 0.3, 1 / Math.SQRT2, 1.4, 2.5]) {
      expect(delta('cold', x)).toBeCloseTo(paper(-x), 14);
    }
  });
  it('the weight vanishes at u = sqrt2 (x = -sqrt2), below the Fermi level as the paper places it', () => {
    expect(Math.abs(delta('cold', -Math.SQRT2))).toBeLessThan(1e-15);
  });
});
