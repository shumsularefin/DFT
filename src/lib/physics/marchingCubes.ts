// Marching cubes isosurface (Lorensen and Cline) with the standard 256-case table, linear interpolation along edges
// and vertices shared between triangles (welded by edge identity). Optional periodic wrap for crystal grids.
// Corner numbering 0 (0,0,0) 1 (1,0,0) 2 (1,1,0) 3 (0,1,0) 4 (0,0,1) 5 (1,0,1) 6 (1,1,1) 7 (0,1,1); a corner is "inside"
// (bit set) when its value is below the isovalue. Positions are returned in Cartesian coordinates: fractional grid
// coordinate i/n along each axis times the lattice (points sit at i/n, as in VASP grids).
// Known limitation: the original 256-case table is ambiguous on some faces, so a surface that squeezes through a single
// cell can in rare cases contain a hole; smooth density isosurfaces do not hit it in the tests.
// @source S-030
import { EDGE_TABLE, TRI_TABLE } from './marchingCubesTables';

export type Lattice = readonly [
  readonly [number, number, number],
  readonly [number, number, number],
  readonly [number, number, number],
];

export interface MarchOptions {
  values: ArrayLike<number>;
  /** [nx, ny, nz]; index ix + nx * (iy + ny * iz). */
  dims: readonly [number, number, number];
  iso: number;
  /** Rows are lattice vectors; default is the identity (positions in fractional units of the whole cell). */
  lattice?: Lattice;
  /** Wrap around the cell edges (crystal grids). Default false. */
  periodic?: boolean;
  onProgress?: (fraction: number) => void;
}

export interface Mesh {
  /** xyz triples. */
  positions: Float32Array;
  /** Triangle vertex indices. */
  indices: Uint32Array;
}

// corner offsets and the two corners of each edge
const CORNER: readonly (readonly [number, number, number])[] = [
  [0, 0, 0],
  [1, 0, 0],
  [1, 1, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 0, 1],
  [1, 1, 1],
  [0, 1, 1],
];
const EDGE_ENDS: readonly (readonly [number, number])[] = [
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

export function marchingCubes(opts: MarchOptions): Mesh {
  const { values, dims, iso, periodic = false } = opts;
  const [nx, ny, nz] = dims;
  if (values.length !== nx * ny * nz) throw new RangeError('values.length must equal nx * ny * nz');
  const L = opts.lattice ?? [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  const cx = periodic ? nx : nx - 1;
  const cy = periodic ? ny : ny - 1;
  const cz = periodic ? nz : nz - 1;
  const at = (x: number, y: number, z: number) => values[(x % nx) + nx * ((y % ny) + ny * (z % nz))]!;

  const pos: number[] = [];
  const idx: number[] = [];
  const welded = new Map<number, number>();
  const val = new Float64Array(8);

  const vertex = (x: number, y: number, z: number, edge: number): number => {
    const [a, b] = EDGE_ENDS[edge]!;
    const ca = CORNER[a]!;
    const cb = CORNER[b]!;
    // edge identity: lower corner of the edge and its axis
    const axis = ca[0] !== cb[0] ? 0 : ca[1] !== cb[1] ? 1 : 2;
    const lx = x + Math.min(ca[0], cb[0]);
    const ly = y + Math.min(ca[1], cb[1]);
    const lz = z + Math.min(ca[2], cb[2]);
    const key = ((lz * (ny + 1) + ly) * (nx + 1) + lx) * 3 + axis;
    const found = welded.get(key);
    if (found !== undefined) return found;
    const va = val[a]!;
    const vb = val[b]!;
    const t = vb === va ? 0.5 : (iso - va) / (vb - va);
    const fx = (x + ca[0] + t * (cb[0] - ca[0])) / nx;
    const fy = (y + ca[1] + t * (cb[1] - ca[1])) / ny;
    const fz = (z + ca[2] + t * (cb[2] - ca[2])) / nz;
    const id = pos.length / 3;
    pos.push(
      fx * L[0][0] + fy * L[1][0] + fz * L[2][0],
      fx * L[0][1] + fy * L[1][1] + fz * L[2][1],
      fx * L[0][2] + fy * L[1][2] + fz * L[2][2],
    );
    welded.set(key, id);
    return id;
  };

  for (let z = 0; z < cz; z++) {
    for (let y = 0; y < cy; y++) {
      for (let x = 0; x < cx; x++) {
        let c = 0;
        for (let k = 0; k < 8; k++) {
          const o = CORNER[k]!;
          const v = at(x + o[0], y + o[1], z + o[2]);
          val[k] = v;
          if (v < iso) c |= 1 << k;
        }
        if (EDGE_TABLE[c] === 0) continue;
        const tri = TRI_TABLE[c]!;
        for (let t = 0; t < tri.length; t += 3)
          idx.push(vertex(x, y, z, tri[t]!), vertex(x, y, z, tri[t + 1]!), vertex(x, y, z, tri[t + 2]!));
      }
    }
    opts.onProgress?.((z + 1) / cz);
  }
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

/** Enclosed volume by the divergence theorem (absolute value). Meaningful for a closed surface. */
export function meshVolume(m: Mesh): number {
  let v = 0;
  const p = m.positions;
  for (let t = 0; t < m.indices.length; t += 3) {
    const a = m.indices[t]! * 3;
    const b = m.indices[t + 1]! * 3;
    const c = m.indices[t + 2]! * 3;
    v +=
      (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) -
        p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) +
        p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) /
      6;
  }
  return Math.abs(v);
}

/** Edges used by exactly one triangle, or by more than two (an empty list means the mesh is closed and manifold). */
export function openEdges(m: Mesh): number {
  const count = new Map<number, number>();
  const N = m.positions.length / 3;
  for (let t = 0; t < m.indices.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = m.indices[t + e]!;
      const b = m.indices[t + ((e + 1) % 3)]!;
      const key = a < b ? a * N + b : b * N + a;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
  }
  let bad = 0;
  for (const c of count.values()) if (c !== 2) bad++;
  return bad;
}
