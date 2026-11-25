import { describe, expect, it } from 'vitest';
import {
  EV_PER_A2_IN_J_PER_M2,
  energyPerFormulaUnit,
  neutralFormationEnergy,
  surfaceEnergy,
} from './surface';

describe('research planner calculators (M14.2)', () => {
  it('computes surface energy with exact hand-checked integers and J/m^2 conversion', () => {
    // E_slab = -90 eV, E_bulk = -10 eV/unit, N = 10 units, A = 50 A^2 -> ( -90 - (-100) ) / 100 = 0.1 eV/A^2
    const res = surfaceEnergy(-90, -10, 10, 50);
    expect(res.gammaEvPerA2).toBeCloseTo(0.1, 12);
    expect(EV_PER_A2_IN_J_PER_M2).toBeCloseTo(16.02176634, 8);
    expect(res.gammaJPerM2).toBeCloseTo(1.602176634, 8);
  });

  it('computes neutral formation energy per compound and per atom', () => {
    // AB: E_total = -14 eV, 1 A (-4 eV) + 1 B (-6 eV) -> E_f = -4 eV, -2 eV/atom
    const res = neutralFormationEnergy(-14, [
      { symbol: 'A', count: 1, refEnergyPerAtomEv: -4 },
      { symbol: 'B', count: 1, refEnergyPerAtomEv: -6 },
    ]);
    expect(res.totalEv).toBeCloseTo(-4, 12);
    expect(res.perAtomEv).toBeCloseTo(-2, 12);
    expect(res.totalAtoms).toBe(2);
  });

  it('computes energy per formula unit', () => {
    expect(energyPerFormulaUnit(-42.8, 4)).toBeCloseTo(-10.7, 12);
  });
});
