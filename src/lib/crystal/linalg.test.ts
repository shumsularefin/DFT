import { describe, expect, it } from 'vitest';
import { add, cross, det3, dot, inv3, mul, norm, scale, sub, transpose, vecMat } from './linalg';
import type { Mat3 } from './types';

const A: Mat3 = [
  [2, 0, 1],
  [1, 3, 0],
  [0, 1, 4],
];
describe('linalg', () => {
  it('vector ops', () => {
    expect(dot([1, 2, 3], [4, 5, 6])).toBe(32);
    expect(cross([1, 0, 0], [0, 1, 0])).toEqual([0, 0, 1]);
    expect(norm([3, 4, 0])).toBe(5);
    expect(add([1, 2, 3], [1, 1, 1])).toEqual([2, 3, 4]);
    expect(sub([1, 2, 3], [1, 1, 1])).toEqual([0, 1, 2]);
    expect(scale([1, 2, 3], 2)).toEqual([2, 4, 6]);
  });
  it('det 25 and inverse', () => {
    expect(det3(A)).toBeCloseTo(25, 12);
    const p = mul(A, inv3(A));
    for (let i = 0; i < 3; i++)
      for (let k = 0; k < 3; k++) expect(p[i]![k]!).toBeCloseTo(i === k ? 1 : 0, 12);
  });
  it('singular throws, transpose, vecMat', () => {
    expect(() =>
      inv3([
        [1, 0, 0],
        [2, 0, 0],
        [0, 0, 1],
      ]),
    ).toThrow(RangeError);
    expect(transpose(A)[0]).toEqual([2, 1, 0]);
    expect(vecMat([1, 0, 0], A)).toEqual([2, 0, 1]);
  });
});
