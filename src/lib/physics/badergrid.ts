// Bader partition of a density sampled on a box grid (M16.11), by the on-grid steepest-ascent method of Henkelman,
// Arnaldsson and Jonsson (S-029): from every grid point, step to the neighbour (of 26) with the largest
// (rho_n - rho_i) / |r_n - r_i|; a point with no higher neighbour is a maximum; every point belongs to the basin of
// the maximum its path ends on. A basin's charge is the sum of rho times the voxel volume. The boundaries between
// basins approximate the zero-flux surfaces grad rho . n = 0. Non-periodic box (an isolated model), x fastest.
// Also two model "atom" densities that integrate to N: exponential, rho(r) = N lambda^3 / (8 pi) exp(-lambda r), and
// Gaussian, rho(r) = N (alpha / pi)^(3/2) exp(-alpha r^2) (smooth at the nucleus, so a grid sum converges fast).
// @source S-029, S-084
type V3 = [number, number, number];

/** rho(r) = N lambda^3 / (8 pi) exp(-lambda r): integrates to N electrons over all space. */
export function exponentialAtom(
  n: number,
  lambda: number,
  center: V3,
): (x: number, y: number, z: number) => number {
  const pre = (n * lambda ** 3) / (8 * Math.PI);
  return (x, y, z) => pre * Math.exp(-lambda * Math.hypot(x - center[0], y - center[1], z - center[2]));
}

/** rho(r) = N (alpha / pi)^(3/2) exp(-alpha r^2): integrates to N electrons over all space. */
export function gaussianAtom(
  n: number,
  alpha: number,
  center: V3,
): (x: number, y: number, z: number) => number {
  const pre = n * (alpha / Math.PI) ** 1.5;
  return (x, y, z) =>
    pre * Math.exp(-alpha * ((x - center[0]) ** 2 + (y - center[1]) ** 2 + (z - center[2]) ** 2));
}

/**
 * The part of a grid that a level-`level` isosurface can touch: the bounding box of points with a neighbour on the
 * other side of the level, grown by one point. Returns the cropped values (x fastest) and the offset of its origin.
 */
export function cropToLevel(
  values: ArrayLike<number>,
  grid: V3,
  level: number,
): { values: Float64Array; grid: V3; offset: V3 } | null {
  const [nx, ny, nz] = grid;
  const lo: V3 = [nx, ny, nz];
  const hi: V3 = [-1, -1, -1];
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const p = i + nx * (j + ny * k);
        const above = values[p]! > level;
        const cross =
          (i + 1 < nx && values[p + 1]! > level !== above) ||
          (j + 1 < ny && values[p + nx]! > level !== above) ||
          (k + 1 < nz && values[p + nx * ny]! > level !== above);
        if (!cross) continue;
        const ijk = [i, j, k];
        for (let a = 0; a < 3; a++) {
          lo[a] = Math.min(lo[a]!, ijk[a]!);
          hi[a] = Math.max(hi[a]!, ijk[a]! + 1);
        }
      }
  if (hi[0] < 0) return null;
  for (let a = 0; a < 3; a++) {
    lo[a] = Math.max(0, lo[a]! - 1);
    hi[a] = Math.min(grid[a]! - 1, hi[a]! + 1);
  }
  const g: V3 = [hi[0] - lo[0] + 1, hi[1] - lo[1] + 1, hi[2] - lo[2] + 1];
  const out = new Float64Array(g[0] * g[1] * g[2]);
  for (let k = 0; k < g[2]; k++)
    for (let j = 0; j < g[1]; j++)
      for (let i = 0; i < g[0]; i++)
        out[i + g[0] * (j + g[1] * k)] = values[lo[0] + i + nx * (lo[1] + j + ny * (lo[2] + k))]!;
  return { values: out, grid: g, offset: lo };
}

export interface BaderResult {
  /** Basin id per grid point (index into `maxima`). */
  basin: Int32Array;
  /** Grid index of each density maximum. */
  maxima: number[];
  /** Electrons in each basin. */
  charges: number[];
  /** Sum over the whole grid. */
  total: number;
}

/** On-grid steepest-ascent Bader partition of `values` on an nx x ny x nz grid with spacings h. */
export function baderPartition(values: ArrayLike<number>, grid: V3, h: V3): BaderResult {
  const [nx, ny, nz] = grid;
  const n = nx * ny * nz;
  const next = new Int32Array(n);
  const offs: { di: number; dj: number; dk: number; inv: number }[] = [];
  for (let dk = -1; dk <= 1; dk++)
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++)
        if (di || dj || dk) offs.push({ di, dj, dk, inv: 1 / Math.hypot(di * h[0], dj * h[1], dk * h[2]) });
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const p = i + nx * (j + ny * k);
        const v = values[p]!;
        let best = 0;
        let to = p;
        for (const o of offs) {
          const a = i + o.di;
          const b = j + o.dj;
          const c = k + o.dk;
          if (a < 0 || b < 0 || c < 0 || a >= nx || b >= ny || c >= nz) continue;
          const q = a + nx * (b + ny * c);
          const g = (values[q]! - v) * o.inv;
          if (g > best) {
            best = g;
            to = q;
          }
        }
        next[p] = to;
      }
  const basin = new Int32Array(n).fill(-1);
  const maxima: number[] = [];
  const path: number[] = [];
  for (let p = 0; p < n; p++) {
    if (basin[p]! >= 0) continue;
    path.length = 0;
    let q = p;
    while (basin[q]! < 0 && next[q] !== q) {
      path.push(q);
      basin[q] = -2; // on the current path
      q = next[q]!;
    }
    let id = basin[q]!;
    if (id < 0) {
      id = maxima.length;
      maxima.push(q);
      basin[q] = id;
    }
    for (const r of path) basin[r] = id;
  }
  const dv = h[0] * h[1] * h[2];
  const charges = maxima.map(() => 0);
  let total = 0;
  for (let p = 0; p < n; p++) {
    const c = values[p]! * dv;
    charges[basin[p]!]! += c;
    total += c;
  }
  return { basin, maxima, charges, total };
}
