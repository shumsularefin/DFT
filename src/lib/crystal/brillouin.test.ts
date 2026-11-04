import { describe, expect, it } from 'vitest';
import bz from '../../../tests/reference/bz_geometry.json';
import { brillouinZone } from './brillouin';
import { fromParameters, cellVolume, reciprocalLattice } from './lattice';
import { cross, dot, norm, sub } from './linalg';
import type { Mat3, Vec3 } from './types';

type Entry = {
  reciprocal_lattice_rows_with_2pi: number[][];
  cell_volume: number;
  bz_volume: number;
  n_vertices: number;
  n_edges: number;
  n_faces: number;
  face_plane_points_G_over_2_sorted: number[][];
  vertices_sorted: number[][];
};
const lattices = bz.lattices as unknown as Record<string, Entry>;
const TWO_PI3 = (2 * Math.PI) ** 3;

/** Every golden point must have a partner within tol, and the counts must be equal (a bijection check). */
function sameSet(got: readonly (readonly number[])[], want: readonly (readonly number[])[], tol: number) {
  expect(got.length).toBe(want.length);
  const used = new Set<number>();
  for (const w of want) {
    const i = got.findIndex(
      (g, k) =>
        !used.has(k) &&
        Math.abs(g[0]! - w[0]!) < tol &&
        Math.abs(g[1]! - w[1]!) < tol &&
        Math.abs(g[2]! - w[2]!) < tol,
    );
    expect(i, `no match for ${w.join(',')}`).toBeGreaterThanOrEqual(0);
    used.add(i);
  }
}

describe('golden Brillouin zones (Qhull Voronoi reference)', () => {
  for (const [name, e] of Object.entries(lattices)) {
    it(`${name}: counts, volume, vertices and face planes`, () => {
      const z = brillouinZone(e.reciprocal_lattice_rows_with_2pi as unknown as Mat3);
      expect([z.vertices.length, z.edges.length, z.faces.length]).toEqual([
        e.n_vertices,
        e.n_edges,
        e.n_faces,
      ]);
      expect(z.vertices.length - z.edges.length + z.faces.length).toBe(2);
      expect(Math.abs(z.volume / e.bz_volume - 1)).toBeLessThan(1e-9);
      expect(Math.abs(z.volume / (TWO_PI3 / e.cell_volume) - 1)).toBeLessThan(1e-9);
      sameSet(z.vertices, e.vertices_sorted, 1e-8);
      sameSet(
        z.faces.map((f) => f.planePoint),
        e.face_plane_points_G_over_2_sorted,
        1e-8,
      );
    });
  }

  it('textbook counts: sc 8/12/6, fcc 24/36/14, bcc 14/24/12, hexagonal 12/18/8 (vertices/edges/faces)', () => {
    const want: Record<string, number[]> = {
      sc: [8, 12, 6],
      fcc_primitive: [24, 36, 14],
      bcc_primitive: [14, 24, 12],
      hex_ideal: [12, 18, 8],
    };
    for (const [k, w] of Object.entries(want)) {
      const z = brillouinZone(lattices[k]!.reciprocal_lattice_rows_with_2pi as unknown as Mat3);
      expect([z.vertices.length, z.edges.length, z.faces.length]).toEqual(w);
    }
  });

  it('a skewed fcc basis gives the same polyhedron as the primitive one', () => {
    const a = brillouinZone(lattices.fcc_primitive!.reciprocal_lattice_rows_with_2pi as unknown as Mat3);
    const b = brillouinZone(lattices.fcc_skewed_basis!.reciprocal_lattice_rows_with_2pi as unknown as Mat3);
    sameSet(b.vertices, a.vertices, 1e-8);
    sameSet(
      b.faces.map((f) => f.planePoint),
      a.faces.map((f) => f.planePoint),
      1e-8,
    );
  });
});

describe('structure of the result', () => {
  const z = brillouinZone(lattices.fcc_primitive!.reciprocal_lattice_rows_with_2pi as unknown as Mat3);
  it('face vertices are coplanar with the plane, outward, and counter-clockwise from outside', () => {
    for (const f of z.faces) {
      expect(norm(f.normal)).toBeCloseTo(1, 12);
      const d = dot(f.normal, f.planePoint);
      expect(d).toBeGreaterThan(0);
      const pts = f.vertexIds.map((i) => z.vertices[i]!);
      for (const p of pts) expect(Math.abs(dot(f.normal, p) - d)).toBeLessThan(1e-8);
      let w: Vec3 = [0, 0, 0];
      for (let i = 0; i < pts.length; i++) {
        const c = cross(sub(pts[i]!, pts[0]!), sub(pts[(i + 1) % pts.length]!, pts[0]!));
        w = [w[0] + c[0], w[1] + c[1], w[2] + c[2]];
      }
      expect(dot(w, f.normal)).toBeGreaterThan(0);
    }
  });
  it('every edge belongs to exactly two faces, every vertex satisfies all half-spaces', () => {
    const count = new Map<string, number>();
    for (const f of z.faces)
      f.vertexIds.forEach((a, i) => {
        const b = f.vertexIds[(i + 1) % f.vertexIds.length]!;
        const k = a < b ? `${a},${b}` : `${b},${a}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      });
    expect([...count.values()].every((c) => c === 2)).toBe(true);
    for (const v of z.vertices)
      for (const f of z.faces)
        expect(dot(f.normal, v)).toBeLessThanOrEqual(dot(f.normal, f.planePoint) + 1e-8);
  });
  it('rejects dependent vectors', () => {
    expect(() =>
      brillouinZone([
        [1, 0, 0],
        [2, 0, 0],
        [0, 1, 0],
      ]),
    ).toThrow(RangeError);
  });
});

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('seeded random lattices', () => {
  it('volume equals (2 pi)^3 / V and Euler holds for 300 cells', () => {
    const r = rng(20261104);
    let tested = 0;
    for (let n = 0; n < 300; n++) {
      const u = (lo: number, hi: number) => lo + (hi - lo) * r();
      let A: Mat3;
      try {
        A = fromParameters(u(2, 9), u(2, 9), u(2, 9), u(45, 135), u(45, 135), u(45, 135));
      } catch {
        continue;
      }
      const V = cellVolume(A);
      if (!(V > 1) || !Number.isFinite(V)) continue;
      const z = brillouinZone(reciprocalLattice(A));
      expect(Math.abs(z.volume / (TWO_PI3 / V) - 1), `cell ${n}`).toBeLessThan(1e-9);
      expect(z.vertices.length - z.edges.length + z.faces.length, `cell ${n}`).toBe(2);
      tested++;
    }
    expect(tested).toBeGreaterThan(200);
  });
});

describe('performance', () => {
  it('the golden lattices take under 5 ms each (median of 20 runs)', () => {
    const times: Record<string, number> = {};
    for (const [name, e] of Object.entries(lattices)) {
      const m = e.reciprocal_lattice_rows_with_2pi as unknown as Mat3;
      brillouinZone(m);
      const t: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        brillouinZone(m);
        t.push(performance.now() - t0);
      }
      times[name] = t.sort((a, b) => a - b)[10]!;
      expect(times[name]!, name).toBeLessThan(5);
    }
  });
});
