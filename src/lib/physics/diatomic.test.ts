// Reference checks: the closed-form overlap of two 1s Slater orbitals (S-048) against a numerical integral, the
// charge sum rules of the bond and difference densities, and the two-level COHP identities (S-128): H2 is bonding by
// 2 beta, He2 has no net bond, and the band energy splits into on-site terms plus the ICOHP.
import { describe, expect, it } from 'vitest';
import { ZETA_H2, cohpCurve, densities, icohp, orbitals, overlap1s, slater1s, twoLevel } from './diatomic';

/** Integral of f(x, r) over space in cylindrical coordinates about the bond axis (midpoint rule). */
function cylinder(
  f: (x: number, y: number, z: number) => number,
  X = 14,
  Rmax = 12,
  nx = 1400,
  nr = 600,
): number {
  const hx = (2 * X) / nx;
  const hr = Rmax / nr;
  let s = 0;
  for (let i = 0; i < nx; i++) {
    const x = -X + (i + 0.5) * hx;
    for (let j = 0; j < nr; j++) {
      const r = (j + 0.5) * hr;
      s += f(x, r, 0) * 2 * Math.PI * r;
    }
  }
  return s * hx * hr;
}

describe('1s Slater orbitals and their overlap (S-048)', () => {
  it('S(0) = 1 and S falls with distance', () => {
    expect(overlap1s(1.24, 0)).toBe(1);
    expect(overlap1s(1.24, 2)).toBeLessThan(overlap1s(1.24, 1));
  });
  it('S at the H2 bond (R = 1.4 a0, zeta = 1.24) is 0.6592 (the STO-3G fit of the same orbital gives 0.6593)', () => {
    expect(overlap1s(ZETA_H2, 1.4)).toBeCloseTo(0.6592, 4);
  });
  it('the closed form agrees with a numerical integral of phiA phiB', () => {
    const o = orbitals({ R: 2, zeta: 1 });
    expect(cylinder((x, y, z) => o.phiA(x, y, z) * o.phiB(x, y, z))).toBeCloseTo(overlap1s(1, 2), 3);
    expect(cylinder((x, y, z) => slater1s(1.24, Math.hypot(x, y, z)) ** 2)).toBeCloseTo(1, 3);
  });
});

describe('densities', () => {
  const d = densities({ R: 1.4, zeta: ZETA_H2 });
  it('the bond density holds two electrons and the difference integrates to zero', () => {
    expect(cylinder(d.bond)).toBeCloseTo(2, 3);
    expect(cylinder(d.atoms)).toBeCloseTo(2, 3);
    expect(cylinder(d.diff)).toBeCloseTo(0, 3);
  });
  it('charge moves into the bond centre', () => {
    expect(d.diff(0, 0, 0)).toBeGreaterThan(0);
  });
});

describe('two-level model and COHP (S-128)', () => {
  it('levels solve H c = E c with normalized coefficients', () => {
    const h = { eA: -0.7, eB: 1.1, beta: -2.2 };
    for (const l of twoLevel(h, 2)) {
      expect(h.eA * l.cA + h.beta * l.cB).toBeCloseTo(l.E * l.cA, 12);
      expect(h.beta * l.cA + h.eB * l.cB).toBeCloseTo(l.E * l.cB, 12);
      expect(l.cA * l.cA + l.cB * l.cB).toBeCloseTo(1, 12);
    }
  });
  it('H2-like: two electrons give ICOHP = 2 beta; He2-like: four electrons give zero', () => {
    const h = { eA: 0, eB: 0, beta: -2.5 };
    expect(icohp(twoLevel(h, 2))).toBeCloseTo(-5, 12);
    expect(icohp(twoLevel(h, 1))).toBeCloseTo(-2.5, 12);
    expect(icohp(twoLevel(h, 3))).toBeCloseTo(-2.5, 12);
    expect(icohp(twoLevel(h, 4))).toBeCloseTo(0, 12);
  });
  it('band energy = on-site part + ICOHP', () => {
    const h = { eA: -1, eB: 0.6, beta: -1.8 };
    for (const ne of [1, 2, 3, 4]) {
      const lv = twoLevel(h, ne);
      const band = lv.reduce((s, l) => s + l.f * l.E, 0);
      const onsite = lv.reduce((s, l) => s + l.f * (l.cA * l.cA * h.eA + l.cB * l.cB * h.eB), 0);
      expect(band).toBeCloseTo(onsite + icohp(lv), 12);
    }
  });
  it('the broadened COHP integrates to the ICOHP up to a Fermi level between the levels', () => {
    const lv = twoLevel({ eA: 0, eB: 0, beta: -2.5 }, 2);
    const E: number[] = [];
    for (let x = -10; x <= 0; x += 0.001) E.push(x);
    let s = 0;
    for (let i = 1; i < E.length; i++)
      s += 0.5 * (cohpCurve(lv, E[i]!, 0.2) + cohpCurve(lv, E[i - 1]!, 0.2)) * 0.001;
    expect(s).toBeCloseTo(icohp(lv), 6);
  });
});
