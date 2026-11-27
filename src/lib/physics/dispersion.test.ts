import { describe, expect, it } from 'vitest';
import {
  BOND,
  C6_CARBON_EV_A6,
  D2,
  GRAPHENE_A,
  RR_CC,
  SIGMA,
  SLIDE_PERIOD,
  bilayerEnergy,
  damping,
  layerSites,
  pairEnergy,
  sheetLimitPerAtom,
  stackingName,
} from './dispersion';

// @source S-148 (D2 form and carbon parameters), S-031 (1 eV per particle = 96485.33212 J/mol, N_A e exact)
describe('DFT-D2 pair term', () => {
  it('carbon C6 of 1.75 J nm^6/mol is 18.137 eV Angstrom^6', () => {
    expect(C6_CARBON_EV_A6).toBeCloseTo((1.75 * 1e6) / 96485.33212, 6);
    expect(C6_CARBON_EV_A6).toBeCloseTo(18.137, 3);
    expect(RR_CC).toBeCloseTo(2.904, 12);
  });
  it('damping is 1/2 at R_r, tends to 1 far away and to 0 at short range', () => {
    expect(damping(RR_CC)).toBeCloseTo(0.5, 12);
    expect(damping(3 * RR_CC)).toBeGreaterThan(1 - 1e-12);
    expect(damping(0.5)).toBeLessThan(1e-6);
  });
  it('a pair far away is -s6 C6 / R^6; undamped equals damped there', () => {
    const r = 12;
    expect(pairEnergy(r)).toBeCloseTo((-D2.s6 * C6_CARBON_EV_A6) / r ** 6, 15);
    expect(pairEnergy(r, false)).toBeCloseTo(pairEnergy(r), 15);
  });
});

describe('graphene bilayer sums', () => {
  it('the layer has the graphene density 2 / (sqrt(3)/2 a^2) and bond a / sqrt(3)', () => {
    expect(SIGMA).toBeCloseTo(0.38164, 4);
    expect(BOND).toBeCloseTo(1.42028, 4);
    const n = layerSites(30).length;
    expect(n / (Math.PI * 900)).toBeCloseTo(SIGMA, 2);
  });
  it('far apart, the lattice sum is the continuum sheet -s6 C6 sigma pi / (2 d^4) per top atom', () => {
    const d = 9;
    expect(bilayerEnergy(d, 0) / (sheetLimitPerAtom(d) / 2)).toBeCloseTo(1, 2);
  });
  it('the sum with its continuum tail equals a direct sum over a much wider layer', () => {
    const d = 3.35;
    const wide = layerSites(45);
    let e = 0;
    for (const t of [
      [0, 0],
      [0, BOND],
    ])
      for (const s of wide) e += pairEnergy(Math.hypot(s[0] - t[0]!, s[1] - t[1]! - BOND, d));
    expect(bilayerEnergy(d, BOND) / (e / 4)).toBeCloseTo(1, 3);
  });
  it('sliding repeats after three bond lengths and AB equals BA', () => {
    for (const d of [2.9, 3.4])
      for (const s of [0.3, 1.1])
        expect(bilayerEnergy(d, s + SLIDE_PERIOD)).toBeCloseTo(bilayerEnergy(d, s), 9);
    expect(bilayerEnergy(3.2, BOND)).toBeCloseTo(bilayerEnergy(3.2, 2 * BOND), 9);
    expect(SLIDE_PERIOD).toBeCloseTo(GRAPHENE_A * Math.sqrt(3), 12);
  });
  it('attraction grows as the layers approach and damping weakens it at short range', () => {
    expect(bilayerEnergy(3, 0)).toBeLessThan(bilayerEnergy(3.5, 0));
    expect(bilayerEnergy(2.8, 0, false)).toBeLessThan(bilayerEnergy(2.8, 0, true));
  });
  it('names the stackings', () => {
    expect(stackingName(0)).toBe('AA');
    expect(stackingName(BOND)).toBe('AB');
    expect(stackingName(2 * BOND)).toBe('BA');
    expect(stackingName(3 * BOND)).toBe('AA');
    expect(stackingName(0.5 * BOND)).toBeNull();
  });
});
