import { describe, expect, it } from 'vitest';
import masses from '../../data/atomic-masses.json';
import { SYMBOLS, atomicNumber, elementFromLabel, symbolOf } from './elements';

describe('elements', () => {
  it('has 103 symbols in the same order as the atomic-mass table', () => {
    expect(SYMBOLS).toHaveLength(103);
    expect([...SYMBOLS]).toEqual(Object.keys(masses.masses));
  });
  it('maps well-known elements', () => {
    for (const [s, z] of [
      ['H', 1],
      ['C', 6],
      ['O', 8],
      ['Na', 11],
      ['Mg', 12],
      ['Cl', 17],
      ['Cu', 29],
      ['Ba', 56],
      ['Lu', 71],
      ['Pb', 82],
      ['U', 92],
      ['Lr', 103],
    ] as const) {
      expect(atomicNumber(s)).toBe(z);
      expect(symbolOf(z)).toBe(s);
    }
    expect(atomicNumber('Xx')).toBeUndefined();
    expect(symbolOf(0)).toBeUndefined();
  });
  it('reads symbols from labels', () => {
    expect(elementFromLabel('Ti_pv')).toBe('Ti');
    expect(elementFromLabel('Na0')).toBe('Na');
    expect(elementFromLabel('O2-')).toBe('O');
    expect(elementFromLabel('CL1')).toBe('Cl');
    expect(elementFromLabel('123')).toBeUndefined();
  });
});
