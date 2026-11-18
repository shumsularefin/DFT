import { describe, expect, it } from 'vitest';
import type { Structure } from '../crystal/types';
import { deleteAtoms, mergeAtoms, mergeDuplicates, moveApart, scaleCell, wrapAll } from './fixes';
import { contacts, volume } from './geometry';

const base: Structure = {
  lattice: [
    [4, 0, 0],
    [0, 4, 0],
    [0, 0, 4],
  ],
  species: ['Na', 'Na', 'Cl'],
  labels: ['Na1', 'Na2', 'Cl1'],
  frac: [
    [0, 0, 0],
    [0.99995, 0, 0],
    [0.5, 0.5, 0.5],
  ],
  selective: [
    [true, true, true],
    [false, false, false],
    [true, false, true],
  ],
};
const frozen = JSON.stringify(base);

describe('fix functions are pure transforms', () => {
  it('deleteAtoms keeps labels and selective flags aligned', () => {
    const s = deleteAtoms(base, [1]);
    expect(s.species).toEqual(['Na', 'Cl']);
    expect(s.labels).toEqual(['Na1', 'Cl1']);
    expect(s.selective).toEqual([
      [true, true, true],
      [true, false, true],
    ]);
  });
  it('mergeAtoms puts the survivor at the midpoint through the periodic image', () => {
    const s = mergeAtoms(base, 0, 1, [-1, 0, 0]);
    expect(s.species).toEqual(['Na', 'Cl']);
    expect(s.frac[0]![0]).toBeCloseTo(1 - 0.000025, 12);
  });
  it('mergeDuplicates removes same-species copies within 0.1 Angstrom', () => {
    expect(mergeDuplicates(base).labels).toEqual(['Na1', 'Cl1']);
  });
  it('moveApart sets the requested distance', () => {
    // In this 4 Angstrom cube the body-diagonal pair is 3.464 apart, the largest possible closest-image distance
    const s = moveApart(base, 0, 2, [0, 0, 0], 2.5);
    const d = Math.min(
      ...contacts(s, 4)
        .filter((c) => c.i === 0 && c.j === 2)
        .map((c) => c.distance),
    );
    expect(d).toBeCloseTo(2.5, 9);
    expect(moveApart(base, 0, 0, [0, 0, 0], 2)).toBe(base); // no direction: unchanged
  });
  it('scaleCell scales lengths, so volume goes with the cube', () => {
    expect(volume(scaleCell(base, 1.5))).toBeCloseTo(64 * 3.375, 9);
  });
  it('wrapAll wraps into [0, 1)', () => {
    const s = wrapAll({ ...base, frac: [[1.25, -0.25, 2], ...base.frac.slice(1)] });
    expect(s.frac[0]).toEqual([0.25, 0.75, 0]);
  });
  it('never modifies the input', () => {
    deleteAtoms(base, [0]);
    mergeAtoms(base, 0, 1);
    mergeDuplicates(base);
    moveApart(base, 0, 2, [0, 0, 0], 3);
    scaleCell(base, 2);
    wrapAll(base);
    expect(JSON.stringify(base)).toBe(frozen);
  });
});
