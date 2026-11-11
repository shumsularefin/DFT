import { describe, expect, it } from 'vitest';
import { marchingCubes, meshVolume, openEdges } from './marchingCubes';
import { EDGE_TABLE, TRI_TABLE } from './marchingCubesTables';

// @source S-030 (Lorensen and Cline). The table is checked for self-consistency, then the algorithm on an analytic sphere.
describe('case tables', () => {
  it('has 256 cases; empty for all-inside and all-outside', () => {
    expect(EDGE_TABLE.length).toBe(256);
    expect(TRI_TABLE.length).toBe(256);
    expect(TRI_TABLE[0]).toEqual([]);
    expect(TRI_TABLE[255]).toEqual([]);
  });
  it('each case uses exactly the edges its corner signs cross, in whole triangles', () => {
    const ends = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    for (let c = 0; c < 256; c++) {
      const crossed = ends.reduce(
        (m, [a, b], e) => (((c >> a!) & 1) !== ((c >> b!) & 1) ? m | (1 << e) : m),
        0,
      );
      expect(EDGE_TABLE[c], `case ${c}`).toBe(crossed);
      const tri = TRI_TABLE[c]!;
      expect(tri.length % 3).toBe(0);
      const used = tri.reduce((m, e) => m | (1 << e), 0);
      expect(used, `case ${c}`).toBe(crossed);
    }
  });
});

describe('isosurface of an analytic sphere f = |r| on a 64^3 grid', () => {
  const n = 64;
  const L = 4;
  const values = new Float64Array(n * n * n);
  for (let z = 0; z < n; z++)
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++)
        values[x + n * (y + n * z)] = Math.hypot((x / n - 0.5) * L, (y / n - 0.5) * L, (z / n - 0.5) * L);
  const lattice = [
    [L, 0, 0],
    [0, L, 0],
    [0, 0, L],
  ] as const;
  const R = 1;
  const mesh = marchingCubes({ values, dims: [n, n, n], iso: R, lattice });
  it('encloses 4/3 pi R^3 within 1 %', () => {
    const exact = (4 / 3) * Math.PI * R ** 3;
    expect(Math.abs(meshVolume(mesh) - exact) / exact).toBeLessThan(0.01);
  });
  it('is closed: every edge is shared by exactly two triangles', () => {
    expect(mesh.indices.length / 3).toBeGreaterThan(1000);
    expect(openEdges(mesh)).toBe(0);
  });
  it('every vertex lies on the sphere to within the interpolation error', () => {
    let worst = 0;
    for (let i = 0; i < mesh.positions.length; i += 3)
      worst = Math.max(
        worst,
        Math.abs(
          Math.hypot(
            mesh.positions[i]! - L / 2,
            mesh.positions[i + 1]! - L / 2,
            mesh.positions[i + 2]! - L / 2,
          ) - R,
        ),
      );
    expect(worst).toBeLessThan(0.01);
  });
});

describe('interpolation, periodic wrap and errors', () => {
  it('linear field f = ix: the surface sits at the interpolated fraction', () => {
    const n = 8;
    const v = new Float64Array(n * n * n);
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) v[x + n * (y + n * z)] = x;
    const m = marchingCubes({ values: v, dims: [n, n, n], iso: 3.37 });
    for (let i = 0; i < m.positions.length; i += 3) expect(m.positions[i]! * n).toBeCloseTo(3.37, 5);
  });
  it('a periodic grid with a blob at the corner gives a surface that crosses the cell edge', () => {
    const n = 16;
    const v = new Float64Array(n * n * n);
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const d = (a: number) => Math.min(a, n - a) / n;
          v[x + n * (y + n * z)] = Math.hypot(d(x), d(y), d(z));
        }
    const open = marchingCubes({ values: v, dims: [n, n, n], iso: 0.25 });
    const wrapped = marchingCubes({ values: v, dims: [n, n, n], iso: 0.25, periodic: true });
    expect(wrapped.indices.length).toBeGreaterThan(open.indices.length);
    expect(Math.max(...wrapped.positions)).toBeGreaterThan(0.99);
  });
  it('rejects a wrong value count', () => {
    expect(() => marchingCubes({ values: new Float64Array(7), dims: [2, 2, 2], iso: 0 })).toThrow(RangeError);
  });
});
