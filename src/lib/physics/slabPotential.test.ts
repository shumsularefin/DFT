import { describe, expect, it } from 'vitest';
import { INV_EPS0_V_A, planarPotential } from './slabPotential';

describe('planar Poisson solver (S-066, S-109)', () => {
  const c = 30;
  const sigma = 0.01; // e per square angstrom
  const sheets = [
    { z: 12, charge: sigma },
    { z: 18, charge: -sigma },
  ];
  const at = (arr: number[], z: number) => arr[Math.round((z / c) * arr.length)]!;

  it('1 / eps0 is 180.95 V angstrom / e (CODATA 2018, S-031)', () => {
    expect(INV_EPS0_V_A).toBeCloseTo(180.951, 2);
  });

  it('with the dipole correction: the field of a capacitor, sigma / eps0 inside, zero outside', () => {
    const p = planarPotential(sheets, c, { n: 3000, width: 0.3, dipoleCorrection: true });
    expect(at(p.field, 15)).toBeCloseTo(INV_EPS0_V_A * sigma, 3);
    expect(at(p.field, 5)).toBeCloseTo(0, 6);
    expect(at(p.field, 25)).toBeCloseTo(0, 6);
    // potential step across the slab = sigma d / eps0
    expect(at(p.phi, 25) - at(p.phi, 5)).toBeCloseTo(-INV_EPS0_V_A * sigma * 6, 3);
  });

  it('periodic: zero mean field, so the vacuum carries -sigma d / (eps0 c) and phi repeats', () => {
    const p = planarPotential(sheets, c, { n: 3000, width: 0.3 });
    const mean = p.field.reduce((a, b) => a + b, 0) / p.field.length;
    expect(mean).toBeCloseTo(0, 9);
    expect(at(p.field, 5)).toBeCloseTo((-INV_EPS0_V_A * sigma * 6) / c, 3);
    expect(at(p.field, 15)).toBeCloseTo(INV_EPS0_V_A * sigma * (1 - 6 / c), 3);
    const h = c / p.phi.length;
    expect(p.phi[p.phi.length - 1]! - h * p.field[p.field.length - 1]!).toBeCloseTo(p.phi[0]!, 3);
  });

  it('gives no field at all for neutral sheets', () => {
    const p = planarPotential([{ z: 10, charge: 0 }], c, { dipoleCorrection: false });
    expect(Math.max(...p.phi.map(Math.abs))).toBe(0);
  });
});
