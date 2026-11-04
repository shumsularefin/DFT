import { beforeAll, describe, expect, it } from 'vitest';
import { loadMoyoNode } from './moyo-node';
import { analyzeWith, type MoyoApi } from './symmetry';
import { describeStandardization } from './standardize';
import type { Structure } from './types';

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

const a = 3.61;
const cuConv: Structure = {
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
const hexMg: Structure = {
  lattice: [
    [3.21, 0, 0],
    [-1.605, (3.21 * Math.sqrt(3)) / 2, 0],
    [0, 0, 5.21],
  ],
  species: ['Mg', 'Mg'],
  frac: [
    [1 / 3, 2 / 3, 0.25],
    [2 / 3, 1 / 3, 0.75],
  ],
};
const cuPrim: Structure = {
  lattice: [
    [0, a / 2, a / 2],
    [a / 2, 0, a / 2],
    [a / 2, a / 2, 0],
  ],
  species: ['Cu'],
  frac: [[0, 0, 0]],
};

const gram = (L: readonly (readonly number[])[]) =>
  L.map((a) => L.map((b) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!));

describe('describeStandardization', () => {
  it('rows of the matrix are the new lattice vectors in terms of the old (metric check, both cells)', () => {
    for (const s of [cuConv, cuPrim, hexMg]) {
      const d = describeStandardization(s, analyzeWith(api, s));
      const mixed = [0, 1, 2].map((i) =>
        [0, 1, 2].map((k) => [0, 1, 2].reduce((t, j) => t + d.matrix[i]![j]! * s.lattice[j]![k]!, 0)),
      );
      const want = gram(analyzeWith(api, s).primStdCell.lattice);
      gram(mixed).forEach((row, i) => row.forEach((v, j) => expect(v).toBeCloseTo(want[i]![j]!, 8)));
    }
  });
  it('reports the conventional fcc cell shrinking from 4 atoms to 1', () => {
    const r = analyzeWith(api, cuConv);
    const d = describeStandardization(cuConv, r);
    expect(d.changed).toBe(true);
    expect([d.atomsBefore, d.atomsAfter]).toEqual([4, 1]);
    expect(d.volumeAfter).toBeCloseTo(d.volumeBefore / 4, 8);
    expect(d.after.alpha).toBeCloseTo(60, 6);
    expect(d.headline).toMatch(/F m -3 m.*225/);
    expect(d.details[0]).toMatch(/4 atoms became 1/);
    expect(d.conventionalToPrimitive).toHaveLength(4);
    expect(d.conventionalToPrimitive.every((i) => i === 0)).toBe(true);
  });
  it('says nothing changed for an already standard primitive cell', () => {
    const r = analyzeWith(api, cuPrim);
    const d = describeStandardization(cuPrim, r);
    expect(d.changed).toBe(false);
    expect(d.headline).toMatch(/Nothing was changed/);
    expect(d.details).toEqual([]);
  });
  it('the matrix has determinant of the volume ratio', () => {
    const d = describeStandardization(cuConv, analyzeWith(api, cuConv));
    const m = d.matrix;
    const det =
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    expect(Math.abs(det)).toBeCloseTo(d.volumeAfter / d.volumeBefore, 8);
  });
});
