import { describe, expect, it } from 'vitest';
import { cellAtoms, cellOrigins } from './cellAtoms';
import type { Structure } from './types';

const a = 4;
const fccConv: Structure = {
  lattice: [
    [a, 0, 0],
    [0, a, 0],
    [0, 0, a],
  ],
  species: ['Cu', 'Cu', 'Cu', 'Cu'],
  frac: [
    [0, 0, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0.5, 0],
  ],
};

describe('cellAtoms', () => {
  it('conventional fcc: 4 atoms inside, 14 with boundary images (8 corners + 6 face centres)', () => {
    expect(cellAtoms(fccConv, [1, 1, 1], false)).toHaveLength(4);
    const all = cellAtoms(fccConv, [1, 1, 1], true);
    expect(all).toHaveLength(14);
    expect(all.filter((x) => x.image)).toHaveLength(10);
  });
  it('a 2x2x2 block without images holds 8 cells of atoms', () => {
    expect(cellAtoms(fccConv, [2, 2, 2], false)).toHaveLength(32);
  });
  it('a 2x1x1 block with images: corners 12 (3x2x2), face centres on x=0 give 2 per y/z face', () => {
    // corner atom: x in {0,1,2}, y in {0,1}, z in {0,1} = 12; (0,.5,.5): x in {0,1,2} = 3; (.5,0,.5): x in {0,1}, y in {0,1} = 4
    // (.5,.5,0): x in {0,1}, z in {0,1} = 4
    expect(cellAtoms(fccConv, [2, 1, 1], true)).toHaveLength(12 + 3 + 4 + 4);
  });
  it('wraps coordinates outside [0,1) and treats 1.0 as 0', () => {
    const s: Structure = { ...fccConv, species: ['X'], frac: [[1, -0.25, 1.5]] };
    const [atom, ...rest] = cellAtoms(s, [1, 1, 1], false);
    expect(rest).toHaveLength(0);
    expect(atom!.cart[0]).toBeCloseTo(0, 12);
    expect(atom!.cart[1]).toBeCloseTo(0.75 * a, 12);
    expect(atom!.cart[2]).toBeCloseTo(0.5 * a, 12);
  });
  it('a triclinic cell uses the lattice rows', () => {
    const s: Structure = {
      lattice: [
        [2, 0, 0],
        [1, 2, 0],
        [0, 0, 3],
      ],
      species: ['X'],
      frac: [[0.5, 0.5, 0.5]],
    };
    expect(cellAtoms(s)[0]!.cart).toEqual([1.5, 1, 1.5]);
  });
  it('rejects bad repeats', () => {
    expect(() => cellAtoms(fccConv, [0, 1, 1])).toThrow(RangeError);
    expect(() => cellAtoms(fccConv, [1.5, 1, 1])).toThrow(RangeError);
  });
});

describe('cellOrigins', () => {
  it('one origin per cell', () => {
    expect(cellOrigins(fccConv.lattice, [2, 3, 1])).toHaveLength(6);
    expect(cellOrigins(fccConv.lattice, [2, 1, 1])[1]).toEqual([4, 0, 0]);
  });
});
