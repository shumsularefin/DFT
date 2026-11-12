import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseChgcar, gridIndex } from './chgcar';
import { diverging, planeAxes, sequential, sliceGrid } from './gridSlice';

describe('sliceGrid', () => {
  const dims: [number, number, number] = [3, 4, 5];
  const v = Float64Array.from({ length: 60 }, (_, i) => i); // value equals the flat index
  it('takes the plane at fixed iz with x along the width', () => {
    const s = sliceGrid(v, dims, 2, 2);
    expect([s.width, s.height]).toEqual([3, 4]);
    expect(s.data[1 + 3 * 2]).toBe(gridIndex(dims, 1, 2, 2));
  });
  it('takes the plane at fixed ix with y along the width and z up', () => {
    const s = sliceGrid(v, dims, 0, 1);
    expect([s.width, s.height]).toEqual([4, 5]);
    expect(s.data[3 + 4 * 4]).toBe(gridIndex(dims, 1, 3, 4));
    expect(planeAxes(0)).toEqual([1, 2]);
  });
  it('clamps the index and reports the range', () => {
    const s = sliceGrid(v, dims, 1, 99);
    expect(s.max).toBe(gridIndex(dims, 2, 3, 4));
  });
  it('matches the CHGCAR fixture grid on its non-cubic axis', () => {
    const c = parseChgcar(readFileSync('tests/reference/vasp-outputs/CHGCAR', 'utf8'));
    const s = sliceGrid(c.data, c.grid, 2, 5);
    expect([s.width, s.height]).toEqual([20, 20]);
    expect(s.data[3 + 20 * 7]).toBe(c.data[gridIndex(c.grid, 3, 7, 5)]);
  });
});

describe('colour maps', () => {
  it('sequential runs from dark to bright and clamps', () => {
    expect(sequential(0)).toEqual([68, 1, 84]);
    expect(sequential(2)).toEqual([253, 231, 37]);
  });
  it('diverging is white at zero', () => {
    expect(diverging(0)).toEqual([255, 255, 255]);
    expect(diverging(1)).toEqual([213, 94, 0]);
    expect(diverging(-1)).toEqual([0, 114, 178]);
  });
});
