// Convex solids for the views of M5.5, and their orthographic projection with hidden-edge detection (the 2D fallback).
// Pure geometry; the polyhedra themselves come from `brillouinZone` (M5.2) and from the lattice vectors.
import type { Mat3, Vec3 } from '../crystal/types';
import { project } from './project';
import { toScene } from './cellEdges';

export interface Solid {
  vertices: Vec3[];
  /** Pairs of vertex indices. */
  edges: [number, number][];
  /** Outward unit normals and counter-clockwise vertex loops, as in `BrillouinZone`. */
  faces: { normal: Vec3; vertexIds: number[] }[];
}

/** The parallelepiped a1, a2, a3 starting at `origin` (a unit cell), with outward normals. */
export function parallelepiped(cell: Mat3, origin: Vec3 = [0, 0, 0]): Solid {
  const vertices: Vec3[] = [];
  // index = 4a + 2b + c
  for (const a of [0, 1])
    for (const b of [0, 1])
      for (const c of [0, 1])
        vertices.push([
          origin[0] + a * cell[0][0] + b * cell[1][0] + c * cell[2][0],
          origin[1] + a * cell[0][1] + b * cell[1][1] + c * cell[2][1],
          origin[2] + a * cell[0][2] + b * cell[1][2] + c * cell[2][2],
        ]);
  const edges: [number, number][] = [];
  for (let i = 0; i < 8; i++) for (const bit of [1, 2, 4]) if (!(i & bit)) edges.push([i, i | bit]);
  const cross = (u: Vec3, v: Vec3): Vec3 => [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const faces: Solid['faces'] = [];
  // each face: fixed axis (0,1,2) and side (0 or 1); the other two axes in cyclic order
  for (let axis = 0; axis < 3; axis++) {
    const u = (axis + 1) % 3;
    const v = (axis + 2) % 3;
    for (const side of [0, 1]) {
      const id = (iu: number, iv: number): number => {
        const bits = [0, 0, 0];
        bits[axis] = side;
        bits[u] = iu;
        bits[v] = iv;
        return 4 * bits[0]! + 2 * bits[1]! + bits[2]!;
      };
      let n = cross(cell[u]!, cell[v]!);
      const len = Math.hypot(...n) || 1;
      n = [n[0] / len, n[1] / len, n[2] / len];
      // cell[u] x cell[v] points along +cell[axis] when the cell is right-handed; outward on the side=1 face
      const handed = n[0] * cell[axis]![0] + n[1] * cell[axis]![1] + n[2] * cell[axis]![2] >= 0 ? 1 : -1;
      const sign = (side === 1 ? 1 : -1) * handed;
      const loop = [id(0, 0), id(1, 0), id(1, 1), id(0, 1)];
      faces.push({
        normal: [n[0] * sign, n[1] * sign, n[2] * sign],
        vertexIds: sign > 0 ? loop : loop.slice().reverse(),
      });
    }
  }
  return { vertices, edges, faces };
}

export interface ProjectedSolid {
  /** Screen coordinates (x right, y up) and depth (positive towards the viewer). */
  points: { x: number; y: number; depth: number }[];
  edges: { a: number; b: number; hidden: boolean }[];
}

/**
 * Orthographic view of a convex solid. Physics axes are first mapped to the scene axes of the 3D view (z up), so the
 * flat view and the 3D view agree. An edge is hidden when none of the faces that share it looks towards the viewer.
 */
export function projectSolid(solid: Solid, azimuthDeg: number, elevationDeg: number): ProjectedSolid {
  const points = solid.vertices.map((v) => project(toScene(v[0], v[1], v[2]), azimuthDeg, elevationDeg));
  const EPS = 1e-9;
  const front = solid.faces.map((f) => {
    const n = toScene(f.normal[0], f.normal[1], f.normal[2]);
    return project(n, azimuthDeg, elevationDeg).depth > EPS;
  });
  const visible = new Set<string>();
  solid.faces.forEach((f, i) => {
    if (!front[i]) return;
    const m = f.vertexIds.length;
    for (let k = 0; k < m; k++) {
      const a = f.vertexIds[k]!;
      const b = f.vertexIds[(k + 1) % m]!;
      visible.add(a < b ? `${a}-${b}` : `${b}-${a}`);
    }
  });
  return {
    points,
    edges: solid.edges.map(([a, b]) => ({
      a,
      b,
      hidden: !visible.has(a < b ? `${a}-${b}` : `${b}-${a}`),
    })),
  };
}
