import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseDoscar } from './doscar';
import { gaussianSmooth, groupColumns, projectedSum, valueAt } from './dosTools';

const dos = parseDoscar(readFileSync('tests/reference/vasp-outputs/DOSCAR_ispin2_lorbit11', 'utf8'));

describe('orbital groups', () => {
  it('splits the nine-orbital layout into s, p and d columns', () => {
    const o = dos.ions[0]!.orbitals;
    expect(groupColumns(o, 's')).toEqual([0]);
    expect(groupColumns(o, 'p')).toEqual([1, 2, 3]);
    expect(groupColumns(o, 'd')).toEqual([4, 5, 6, 7, 8]);
    expect(groupColumns(['s', 'p', 'd'], 'd')).toEqual([2]);
  });
});

describe('projectedSum', () => {
  it('equals the sum of the columns by hand, per spin', () => {
    const ion = dos.ions[0]!;
    const sum = projectedSum(dos, [0], ['p']);
    for (const k of [0, 3, dos.energies.length - 1]) {
      expect(sum.up[k]).toBeCloseTo(ion.up[1]![k]! + ion.up[2]![k]! + ion.up[3]![k]!, 12);
      expect(sum.down![k]).toBeCloseTo(ion.down![1]![k]! + ion.down![2]![k]! + ion.down![3]![k]!, 12);
    }
  });
  it('is zero for an empty selection', () => {
    expect(Math.max(...projectedSum(dos, [], ['s']).up)).toBe(0);
  });
});

describe('gaussianSmooth', () => {
  const e = Float64Array.from({ length: 401 }, (_, i) => -10 + i * 0.05);
  const spike = new Float64Array(401);
  spike[200] = 1 / 0.05; // unit area
  it('keeps the area and gives the Gaussian peak height 1/(sigma sqrt(2 pi))', () => {
    const sigma = 0.5;
    const s = gaussianSmooth(e, spike, sigma);
    const area = s.reduce((a, v) => a + v * 0.05, 0);
    expect(area).toBeCloseTo(1, 6);
    expect(s[200]).toBeCloseTo(1 / (sigma * Math.sqrt(2 * Math.PI)), 2);
  });
  it('returns the input for sigma of zero', () => {
    expect(Array.from(gaussianSmooth(e, spike, 0).slice(199, 202))).toEqual(
      Array.from(spike.slice(199, 202)),
    );
  });
});

describe('valueAt', () => {
  it('interpolates linearly and is null outside the grid', () => {
    expect(valueAt([0, 1, 2], [0, 10, 20], 1.5)).toBeCloseTo(15, 12);
    expect(valueAt([0, 1, 2], [0, 10, 20], 3)).toBeNull();
  });
});
