import { describe, expect, it } from 'vitest';
import { brillouinZone } from '../crystal/brillouin';
import { reciprocalLattice } from '../crystal/lattice';
import type { Mat3, Vec3 } from '../crystal/types';
import { parallelepiped, projectSolid, type Solid } from './solid';

const cube: Mat3 = [
  [2, 0, 0],
  [0, 2, 0],
  [0, 0, 2],
];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossv = (u: Vec3, v: Vec3): Vec3 => [
  u[1] * v[2] - u[2] * v[1],
  u[2] * v[0] - u[0] * v[2],
  u[0] * v[1] - u[1] * v[0],
];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('parallelepiped', () => {
  const skew: Mat3 = [
    [3, 0, 0],
    [1, 2.5, 0],
    [0.5, 0.7, 4],
  ];
  const flipped: Mat3 = [skew[1]!, skew[0]!, skew[2]!]; // left-handed
  for (const [name, cell] of [
    ['cube', cube],
    ['skew', skew],
    ['left-handed', flipped],
  ] as const) {
    it(`${name}: 8 vertices, 12 edges, 6 faces, outward counter-clockwise loops`, () => {
      const s = parallelepiped(cell);
      expect([s.vertices.length, s.edges.length, s.faces.length]).toEqual([8, 12, 6]);
      const centre: Vec3 = [0, 1, 2].map(
        (k) => s.vertices.reduce((t, v) => t + v[k]!, 0) / 8,
      ) as unknown as Vec3;
      for (const f of s.faces) {
        const [p0, p1, p2] = f.vertexIds.slice(0, 3).map((i) => s.vertices[i]!) as [Vec3, Vec3, Vec3];
        // loop orientation agrees with the stored normal (right-hand rule)
        expect(dot(crossv(sub(p1, p0), sub(p2, p1)), f.normal)).toBeGreaterThan(0);
        // and the normal points away from the centre
        expect(dot(sub(p0, centre), f.normal)).toBeGreaterThan(0);
        expect(Math.hypot(...f.normal)).toBeCloseTo(1, 12);
      }
    });
  }
  it('applies the origin', () => {
    expect(parallelepiped(cube, [1, 1, 1]).vertices[0]).toEqual([1, 1, 1]);
  });
});

describe('projectSolid hidden edges', () => {
  const s = parallelepiped(cube);
  const count = (az: number, el: number) => {
    const p = projectSolid(s, az, el);
    return {
      visible: p.edges.filter((e) => !e.hidden).length,
      hidden: p.edges.filter((e) => e.hidden).length,
    };
  };
  it('a generic view of a box shows three faces: 9 edges visible, 3 hidden', () => {
    expect(count(30, 20)).toEqual({ visible: 9, hidden: 3 });
    expect(count(-40, -25)).toEqual({ visible: 9, hidden: 3 });
  });
  it('looking straight down an axis shows one face: its 4 edges', () => {
    expect(count(0, 90).visible).toBe(4);
    expect(count(0, -90).visible).toBe(4);
  });
  it('the projection keeps lengths of an axis-aligned edge in the screen plane', () => {
    const p = projectSolid(s, 0, 0);
    const xs = p.points.map((q) => q.x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2, 12);
  });
  it('agrees with the 3D view axes: physics z is screen up when the elevation is zero', () => {
    const p = projectSolid(s, 0, 0);
    const ys = p.points.map((q) => q.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 12);
  });
});

describe('projectSolid on a real Brillouin zone (fcc)', () => {
  const fccLattice: Mat3 = [
    [0, 1.805, 1.805],
    [1.805, 0, 1.805],
    [1.805, 1.805, 0],
  ];
  const bz = brillouinZone(reciprocalLattice(fccLattice));
  const solid: Solid = bz;
  it('truncated octahedron: 36 edges, and some but not most edges are hidden', () => {
    expect(solid.edges).toHaveLength(36);
    const p = projectSolid(solid, 25, 15);
    const hidden = p.edges.filter((e) => e.hidden).length;
    // an edge is hidden only when both its faces look away, so well under all of them
    expect(hidden).toBeGreaterThanOrEqual(8);
    expect(hidden).toBeLessThan(24);
  });
});
