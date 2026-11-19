import { describe, expect, it } from 'vitest';
import { writePoscar } from '../crystal/poscar';
import type { Mat3, Structure } from '../crystal/types';
import { poscarAtomLines } from './poscarLines';

const s: Structure = {
  lattice: [
    [4, 0, 0],
    [0, 4, 0],
    [0, 0, 4],
  ] as Mat3,
  species: ['Na', 'Cl', 'Cl'],
  frac: [
    [0, 0, 0],
    [0.5, 0.5, 0.5],
    [0.5, 0, 0],
  ],
};
describe('poscarAtomLines', () => {
  it('finds one line per atom in a written POSCAR (species line present)', () => {
    const text = writePoscar(s).text;
    const lines = poscarAtomLines(text);
    expect(lines.length).toBe(3);
    const all = text.split('\n');
    expect(all[lines[0]! - 1]!.trim().startsWith('0')).toBe(true);
    expect(lines[2]! - lines[0]!).toBe(2);
  });
  it('handles the older layout without a species line and a Selective dynamics line', () => {
    const text = [
      'c',
      '1.0',
      '1 0 0',
      '0 1 0',
      '0 0 1',
      '1 1',
      'Selective dynamics',
      'Direct',
      '0 0 0 T T T',
      '.5 .5 .5 F F F',
      '',
    ].join('\n');
    expect(poscarAtomLines(text)).toEqual([9, 10]);
  });
  it('returns nothing for text that is not a POSCAR', () => {
    expect(poscarAtomLines('hello\nworld')).toEqual([]);
  });
});
