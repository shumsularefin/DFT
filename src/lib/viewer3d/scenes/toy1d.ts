// Shared pieces of the module 3 and 4 scenes: the 1D two-electron model atom on one grid, memoised, and a helper that
// turns values on that grid into a surface mesh. Not a scene module itself (the registry only loads mXX.ts files).
// @source S-143 (soft-Coulomb 1D model atom), S-048 (two electrons, Hartree-Fock), S-144 (LOBPCG)
import { runScf, type ScfResult } from '../../physics/scf1d';
import {
  kohnShamInversion,
  solveTwoElectron,
  type KohnShamInversion,
  type TwoElectronState,
} from '../../physics/twoelectron1d';
import type { Color, LinesLayer, MeshLayer, Vec3 } from '../types';

/** The scene grid: x in (-15, 15) bohr with 59 interior points, spacing 0.5 bohr (the lab grid is 0.1 bohr). */
export const GRID = { L: 15, M: 59 } as const;
export const SPACING = (2 * GRID.L) / (GRID.M + 1);

const exact = new Map<string, TwoElectronState>();
const hf = new Map<number, ScfResult>();
const ks = new Map<string, KohnShamInversion>();

/** Exact two-electron state (singlet by default) of the model for nuclear charge Z and repulsion strength lambda. */
export function model(Z: number, lambda = 1, spin: 'singlet' | 'triplet' = 'singlet'): TwoElectronState {
  const key = `${Z}|${lambda.toFixed(3)}|${spin}`;
  let s = exact.get(key);
  if (!s) {
    // warm start from the nearest strength already solved: a few steps instead of a few hundred
    let near: TwoElectronState | undefined;
    for (const c of exact.values())
      if (
        c.Z === Z &&
        c.spin === spin &&
        (!near || Math.abs(c.lambda - lambda) < Math.abs(near.lambda - lambda))
      )
        near = c;
    s = solveTwoElectron({ Z, lambda, spin, L: GRID.L, M: GRID.M, tol: 1e-7, start: near?.psi });
    exact.set(key, s);
  }
  return s;
}

/** Hartree-Fock (scf1d) on the same grid, mixing 0.3. */
export function hartreeFock(Z: number): ScfResult {
  let r = hf.get(Z);
  if (!r) {
    r = runScf({ Z, L: GRID.L, M: GRID.M });
    hf.set(Z, r);
  }
  return r;
}

/** Exact Kohn-Sham system of the model singlet. */
export function kohnSham(Z: number, lambda = 1): KohnShamInversion {
  const key = `${Z}|${lambda.toFixed(3)}`;
  let k = ks.get(key);
  if (!k) {
    k = kohnShamInversion(model(Z, lambda));
    ks.set(key, k);
  }
  return k;
}

/** Half-width (bohr) of the window drawn: the diffuse Z = 1 atom needs more room than Z = 2. */
export const windowOf = (Z: number): number => (Z === 1 ? 12 : 7);

/** Grid indices inside |x| <= W. */
export function windowIndices(x: ArrayLike<number>, W: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < x.length; i++) if (Math.abs(x[i]!) <= W + 1e-9) out.push(i);
  return out;
}

/**
 * A surface over a window of the square grid: vertex (i, j) at `at(x_i, x_j, value(i, j))`, coloured by `value` (or by
 * `colorBy` when given). Two triangles per grid cell.
 */
export function gridSurface(
  idx: readonly number[],
  x: ArrayLike<number>,
  value: (i: number, j: number) => number,
  at: (x1: number, x2: number, v: number) => Vec3,
  o: {
    group: string;
    name?: string;
    color?: Color;
    colormap?: MeshLayer['colormap'];
    colorBy?: (i: number, j: number) => number;
    range?: [number, number];
    opacity?: number;
    wireframe?: boolean;
  },
): MeshLayer {
  const n = idx.length;
  const positions: number[] = [];
  const values: number[] = [];
  for (const j of idx)
    for (const i of idx) {
      const v = value(i, j);
      const p = at(x[i]!, x[j]!, v);
      positions.push(p[0], p[1], p[2]);
      values.push(o.colorBy ? o.colorBy(i, j) : v);
    }
  const indices: number[] = [];
  for (let b = 0; b < n - 1; b++)
    for (let a = 0; a < n - 1; a++) {
      const k = a + n * b;
      indices.push(k, k + 1, k + n + 1, k, k + n + 1, k + n);
    }
  const layer: MeshLayer = {
    kind: 'mesh',
    group: o.group,
    name: o.name ?? o.group,
    positions,
    indices,
    color: o.color ?? 'accent',
  };
  if (o.colormap) {
    layer.values = values;
    layer.colormap = o.colormap;
    if (o.range) layer.range = o.range;
  }
  if (o.opacity !== undefined) layer.opacity = o.opacity;
  if (o.wireframe) layer.wireframe = true;
  return layer;
}

/** A polyline drawn as dashed segments (a second curve told apart by its dashes, not by colour alone). */
export function dashedPolyline(pts: readonly Vec3[], color: Color, group: string, name?: string): LinesLayer {
  const segments: [Vec3, Vec3][] = [];
  for (let k = 0; k + 1 < pts.length; k++) segments.push([pts[k]!, pts[k + 1]!]);
  return { kind: 'lines', group, name: name ?? group, segments, color, dashed: true };
}

/** Linear interpolation of grid values at x (zero outside the grid, as the walls demand). */
export function sampleAt(x: ArrayLike<number>, f: ArrayLike<number>, xq: number): number {
  const h = x[1]! - x[0]!;
  const t = (xq - x[0]!) / h;
  const i = Math.floor(t);
  if (i < -1 || i >= x.length) return 0;
  const a = i >= 0 ? f[i]! : 0;
  const b = i + 1 < x.length ? f[i + 1]! : 0;
  return a + (b - a) * (t - i);
}
