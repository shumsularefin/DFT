import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { COVALENT_RADII, GENERIC_RADIUS, bondPairs, covalentRadius } from './covalent';

const golden = JSON.parse(fs.readFileSync('tests/reference/element_reference.json', 'utf8')) as {
  elements: Record<string, { covalent_radius_cordero: number }>;
};

describe('covalent radii (S-021 via S-052)', () => {
  it('match the golden file for every element in it, and the table has no extras', () => {
    const names = Object.keys(golden.elements).sort();
    expect(Object.keys(COVALENT_RADII).sort()).toEqual(names);
    for (const el of names) expect(COVALENT_RADII[el], el).toBe(golden.elements[el]!.covalent_radius_cordero);
  });
  it('recalled Cordero values', () => {
    expect(COVALENT_RADII.H).toBe(0.31);
    expect(COVALENT_RADII.C).toBe(0.76);
    expect(COVALENT_RADII.Cu).toBe(1.32);
  });
  it('an element outside the table gets the generic drawing size and says so', () => {
    expect(covalentRadius('Cu')).toEqual({ radius: 1.32, tabulated: true });
    expect(covalentRadius('Xx')).toEqual({ radius: GENERIC_RADIUS, tabulated: false });
  });
});

describe('bondPairs', () => {
  it('joins C-C at 1.54 A and not at 2.5 A, and ignores coincident atoms', () => {
    expect(
      bondPairs(
        [
          [0, 0, 0],
          [1.54, 0, 0],
        ],
        ['C', 'C'],
      ),
    ).toEqual([[0, 1]]);
    expect(
      bondPairs(
        [
          [0, 0, 0],
          [2.5, 0, 0],
        ],
        ['C', 'C'],
      ),
    ).toEqual([]);
    expect(
      bondPairs(
        [
          [0, 0, 0],
          [0, 0, 0],
        ],
        ['C', 'C'],
      ),
    ).toEqual([]);
  });
});
