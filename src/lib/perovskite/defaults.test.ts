import { describe, it, expect } from 'vitest';
import {
  applyPolicy,
  defaultOxidation,
  hasStates,
  newOccupant,
  normalizeOccupant,
  statesFor,
  DEFAULT_COMPOSITION,
} from './defaults';
import { evaluateCompound } from './checks';

describe('defaults', () => {
  it('picks the most frequent ICSD state', () => {
    expect(defaultOxidation('B', 'Cu')).toBe(2);
    expect(defaultOxidation('B', 'Fe')).toBe(3);
    expect(defaultOxidation('X', 'O')).toBe(-2);
  });
  it('offers cations for A and B and anions for X', () => {
    expect(statesFor('X', 'Cu')).toEqual([]);
    expect(hasStates('X', 'Cl')).toBe(true);
    expect(hasStates('X', 'Sr')).toBe(false);
    expect(statesFor('B', 'Cu')).toEqual(expect.arrayContaining([1, 2, 3]));
  });
  it('uses the default coordination when tabulated, else the first tabulated', () => {
    expect(newOccupant('A', 'Sr', 1, 12).cn).toBe(12);
    expect(newOccupant('B', 'Ti', 1, 12).cn).toBe(6);
    expect(newOccupant('A', 'Nd', 1, 9).cn).toBe(9);
  });
  it('drops a spin that no longer applies', () => {
    const o = normalizeOccupant('B', { el: 'Ti', ox: 4, cn: 6, spin: 'HS', fraction: 1 }, 12);
    expect(o.spin).toBeUndefined();
  });
  it('the policy sets the lanthanide A-site coordination only', () => {
    const c = applyPolicy({ ...DEFAULT_COMPOSITION, A: [{ el: 'Nd', ox: 3, cn: 12, fraction: 1 }] }, 9);
    expect(c.A[0]!.cn).toBe(9);
    expect(applyPolicy(DEFAULT_COMPOSITION, 9).A[0]!.cn).toBe(12);
  });
  it('default composition is SrTiO3 with t = 1.0016', () => {
    const e = evaluateCompound(DEFAULT_COMPOSITION);
    expect(e.ok && e.t.toFixed(4)).toBe('1.0016');
  });
});
