// Isosurface mesh extraction on 3D scalar grids (Marching Tetrahedra decomposition of each cube,
// guaranteeing consistent watertight manifold triangulation without ambiguous cube faces).
// @source S-030 (Lorensen & Cline 1987, Marching Cubes / tetrahedral isosurface extraction)

export interface IsosurfaceMesh {
  /** Flat array [x0, y0, z0, x1, y1, z1, ...] in grid coordinates [0..nx-1, 0..ny-1, 0..nz-1]. */
  readonly positions: Float32Array;
  /** Flat triangle vertex indices (length = 3 * nTriangles). */
  readonly indices: Uint32Array;
  readonly triangleCount: number;
}

// 6-tetrahedra Kuhn decomposition of the unit cube sharing main diagonal (0,0,0)-(1,1,1)
const CUBE_CORNERS: readonly [number, number, number][] = [
  [0, 0, 0], // 0
  [1, 0, 0], // 1
  [1, 1, 0], // 2
  [0, 1, 0], // 3
  [0, 0, 1], // 4
  [1, 0, 1], // 5
  [1, 1, 1], // 6
  [0, 1, 1], // 7
];

const TETS: readonly [number, number, number, number][] = [
  [0, 5, 1, 6],
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
];

// Tetrahedron edges: pairs of local vertex indices 0..3
const TET_EDGES: readonly [number, number][] = [
  [0, 1], // 0
  [1, 2], // 1
  [2, 0], // 2
  [0, 3], // 3
  [1, 3], // 4
  [2, 3], // 5
];

// Lookup table for 16 inside/outside masks (bit k = 1 iff value[k] < isoLevel).
// Winding is oriented consistently outward for f(r) < isoLevel inside.
const TET_TRIS: readonly (readonly number[])[] = [
  [], // 0000
  [0, 3, 2], // 0001 (v0 inside)
  [0, 1, 4], // 0010 (v1 inside)
  [1, 4, 2, 2, 4, 3], // 0011 (v0,v1)
  [1, 2, 5], // 0100 (v2 inside)
  [0, 3, 5, 0, 5, 1], // 0101 (v0,v2)
  [0, 2, 5, 0, 5, 4], // 0110 (v1,v2)
  [5, 4, 3], // 0111 (v3 outside)
  [3, 4, 5], // 1000 (v3 inside)
  [4, 5, 0, 5, 2, 0], // 1001 (v0,v3)
  [1, 5, 0, 5, 3, 0], // 1010 (v1,v3)
  [5, 2, 1], // 1011 (v2 outside)
  [3, 4, 2, 2, 4, 1], // 1100 (v2,v3)
  [4, 1, 0], // 1101 (v1 outside)
  [2, 3, 0], // 1110 (v0 outside)
  [], // 1111
];

/**
 * Extract an indexed watertight isosurface mesh for `field(ix, iy, iz) = isoLevel`
 * from an x-fastest scalar array `values` on `grid = [nx, ny, nz]`.
 * Interior region is `value < isoLevel` (pass `invert: true` for `value > isoLevel`).
 */
export function extractIsosurface(
  values: ArrayLike<number>,
  grid: readonly [number, number, number],
  isoLevel: number,
  options: { periodic?: boolean; invert?: boolean } = {},
): IsosurfaceMesh {
  const [nx, ny, nz] = grid;
  const periodic = options.periodic ?? false;
  const sign = options.invert ? -1 : 1;
  const iso = sign * isoLevel;

  const maxX = periodic ? nx : nx - 1;
  const maxY = periodic ? ny : ny - 1;
  const maxZ = periodic ? nz : nz - 1;

  const valAt = (x: number, y: number, z: number): number => {
    const ix = ((x % nx) + nx) % nx;
    const iy = ((y % ny) + ny) % ny;
    const iz = ((z % nz) + nz) % nz;
    return sign * values[ix + nx * (iy + ny * iz)]!;
  };

  const vertexMap = new Map<string, number>();
  const posList: number[] = [];
  const idxList: number[] = [];

  const getEdgeVertex = (
    x1: number,
    y1: number,
    z1: number,
    v1: number,
    x2: number,
    y2: number,
    z2: number,
    v2: number,
  ): number => {
    // Canonical ordered key so shared edges across adjacent tetrahedra reuse the exact same vertex index
    const aKey = `${x1},${y1},${z1}`;
    const bKey = `${x2},${y2},${z2}`;
    const key = aKey < bKey ? `${aKey}|${bKey}` : `${bKey}|${aKey}`;
    const hit = vertexMap.get(key);
    if (hit !== undefined) return hit;

    const denom = v2 - v1;
    const t = Math.abs(denom) > 1e-12 ? Math.max(0, Math.min(1, (iso - v1) / denom)) : 0.5;
    const id = posList.length / 3;
    posList.push(x1 + t * (x2 - x1), y1 + t * (y2 - y1), z1 + t * (z2 - z1));
    vertexMap.set(key, id);
    return id;
  };

  const cVal = new Float64Array(8);
  const cPos: [number, number, number][] = new Array(8);

  for (let iz = 0; iz < maxZ; iz++) {
    for (let iy = 0; iy < maxY; iy++) {
      for (let ix = 0; ix < maxX; ix++) {
        let minV = Infinity;
        let maxV = -Infinity;
        for (let c = 0; c < 8; c++) {
          const [dx, dy, dz] = CUBE_CORNERS[c]!;
          const px = ix + dx;
          const py = iy + dy;
          const pz = iz + dz;
          const v = valAt(px, py, pz);
          cVal[c] = v;
          cPos[c] = [px, py, pz];
          if (v < minV) minV = v;
          if (v > maxV) maxV = v;
        }
        if (iso <= minV || iso > maxV) continue;

        for (let ti = 0; ti < 6; ti++) {
          const tet = TETS[ti]!;
          let mask = 0;
          if (cVal[tet[0]]! < iso) mask |= 1;
          if (cVal[tet[1]]! < iso) mask |= 2;
          if (cVal[tet[2]]! < iso) mask |= 4;
          if (cVal[tet[3]]! < iso) mask |= 8;
          const tris = TET_TRIS[mask]!;
          if (tris.length === 0) continue;

          for (let k = 0; k < tris.length; k += 3) {
            for (let m = 0; m < 3; m++) {
              const eIdx = tris[k + m]!;
              const [la, lb] = TET_EDGES[eIdx]!;
              const ca = tet[la]!;
              const cb = tet[lb]!;
              const pa = cPos[ca]!;
              const pb = cPos[cb]!;
              const vid = getEdgeVertex(pa[0], pa[1], pa[2], cVal[ca]!, pb[0], pb[1], pb[2], cVal[cb]!);
              idxList.push(vid);
            }
          }
        }
      }
    }
  }

  return {
    positions: new Float32Array(posList),
    indices: new Uint32Array(idxList),
    triangleCount: idxList.length / 3,
  };
}

/** Signed volume of a closed triangle mesh (absolute value equals enclosed volume in grid-cell^3). */
export function enclosedVolume(mesh: IsosurfaceMesh): number {
  const { positions, indices } = mesh;
  let vol6 = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i]! * 3;
    const i1 = indices[i + 1]! * 3;
    const i2 = indices[i + 2]! * 3;
    const ax = positions[i0]!,
      ay = positions[i0 + 1]!,
      az = positions[i0 + 2]!;
    const bx = positions[i1]!,
      by = positions[i1 + 1]!,
      bz = positions[i1 + 2]!;
    const cx = positions[i2]!,
      cy = positions[i2 + 1]!,
      cz = positions[i2 + 2]!;
    vol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }
  return Math.abs(vol6) / 6;
}

/** True iff every undirected edge in the mesh is shared by exactly 2 triangles (closed manifold). */
export function isClosedManifold(mesh: IsosurfaceMesh): boolean {
  const { indices } = mesh;
  if (indices.length === 0) return false;
  const edgeCounts = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]!;
    const b = indices[i + 1]!;
    const c = indices[i + 2]!;
    if (a === b || b === c || c === a) continue;
    for (const [u, v] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const key = u < v ? `${u}:${v}` : `${v}:${u}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
  }
  for (const cnt of edgeCounts.values()) {
    if (cnt !== 2) return false;
  }
  return edgeCounts.size > 0;
}
