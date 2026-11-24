// Volumetric analysis: grid/cell compatibility, charge-density difference, planar & macroscopic averages,
// and work function Phi = V_vacuum - E_F from LOCPOT.
// @source S-019, S-030, S-043, S-065, S-066
import type { Mat3 } from '../crystal/types';
import { gridIndex } from '../vasp/chgcar';

export interface VolumetricGrid {
  readonly lattice: Mat3;
  readonly grid: readonly [number, number, number];
  readonly values: Float64Array;
}

export type CompatibilityResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** Verify two volumetric files share identical grid dimensions and matching lattice vectors. */
export function checkGridCompatibility(
  a: Pick<VolumetricGrid, 'lattice' | 'grid'>,
  b: Pick<VolumetricGrid, 'lattice' | 'grid'>,
  latticeTolA = 1e-4,
): CompatibilityResult {
  if (a.grid[0] !== b.grid[0] || a.grid[1] !== b.grid[1] || a.grid[2] !== b.grid[2]) {
    return {
      ok: false,
      reason: `Grid dimensions differ: ${a.grid.join('x')} vs ${b.grid.join('x')}.`,
    };
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (Math.abs(a.lattice[r]![c]! - b.lattice[r]![c]!) > latticeTolA) {
        return {
          ok: false,
          reason: `Lattice vectors differ by more than ${latticeTolA} A (row ${r + 1}, col ${c + 1}).`,
        };
      }
    }
  }
  return { ok: true };
}

/** Compute rho_AB - rho_A - rho_B (or rho_1 - rho_2 when `b` is omitted) after checking compatibility. */
export function chargeDensityDifference(
  ab: VolumetricGrid,
  a: VolumetricGrid,
  b?: VolumetricGrid,
): { ok: true; values: Float64Array } | { ok: false; reason: string } {
  const c1 = checkGridCompatibility(ab, a);
  if (!c1.ok) return c1;
  if (b) {
    const c2 = checkGridCompatibility(ab, b);
    if (!c2.ok) return c2;
  }
  const out = new Float64Array(ab.values.length);
  for (let i = 0; i < ab.values.length; i++) {
    out[i] = ab.values[i]! - a.values[i]! - (b ? b.values[i]! : 0);
  }
  return { ok: true, values: out };
}

/**
 * Exact planar average of an x-fastest 3D volumetric array along axis 0 (a), 1 (b), or 2 (c).
 * Matches pymatgen VolumetricData.get_average_along_axis.
 */
export function planarAverage(
  values: ArrayLike<number>,
  grid: readonly [number, number, number],
  axis: 0 | 1 | 2,
): number[] {
  const [nx, ny, nz] = grid;
  if (axis === 0) {
    const out = new Array<number>(nx).fill(0);
    const denom = ny * nz;
    for (let ix = 0; ix < nx; ix++) {
      let s = 0;
      for (let iz = 0; iz < nz; iz++)
        for (let iy = 0; iy < ny; iy++) s += values[gridIndex(grid, ix, iy, iz)]!;
      out[ix] = s / denom;
    }
    return out;
  }
  if (axis === 1) {
    const out = new Array<number>(ny).fill(0);
    const denom = nx * nz;
    for (let iy = 0; iy < ny; iy++) {
      let s = 0;
      for (let iz = 0; iz < nz; iz++)
        for (let ix = 0; ix < nx; ix++) s += values[gridIndex(grid, ix, iy, iz)]!;
      out[iy] = s / denom;
    }
    return out;
  }
  const out = new Array<number>(nz).fill(0);
  const denom = nx * ny;
  for (let iz = 0; iz < nz; iz++) {
    let s = 0;
    for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) s += values[gridIndex(grid, ix, iy, iz)]!;
    out[iz] = s / denom;
  }
  return out;
}

/** Periodic sliding-window macroscopic average over `windowPoints` grid slices. */
export function macroscopicAverage(planar: readonly number[], windowPoints: number): number[] {
  const n = planar.length;
  const w = Math.max(1, Math.min(n, Math.round(windowPoints)));
  if (w === 1 || n === 0) return [...planar];
  const half = Math.floor(w / 2);
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -half; k < w - half; k++) {
      s += planar[(((i + k) % n) + n) % n]!;
    }
    out[i] = s / w;
  }
  return out;
}

export interface WorkFunctionResult {
  readonly vacuumLevelEv: number;
  readonly eFermiEv: number;
  readonly workFunctionEv: number;
  readonly plateauIndices: readonly number[];
  readonly hasFlatPlateau: boolean;
  readonly warning?: string;
}

/**
 * Estimate vacuum level and work function Phi = V_vacuum - E_F from a planar-averaged LOCPOT (S-066).
 * Detects the plateau near the maximum potential and warns if no flat vacuum region is present
 * (for example, thin vacuum or a polar slab without LDIPOL/IDIPOL dipole correction).
 */
export function workFunctionFromLocpot(
  planarEv: readonly number[],
  eFermiEv: number,
  plateauTolEv = 0.05,
): WorkFunctionResult {
  if (planarEv.length === 0) {
    throw new Error('Planar average array is empty.');
  }
  const maxV = Math.max(...planarEv);
  const nearMax: number[] = [];
  for (let i = 0; i < planarEv.length; i++) {
    if (maxV - planarEv[i]! <= plateauTolEv) nearMax.push(i);
  }
  const vacuumLevelEv = nearMax.reduce((s, idx) => s + planarEv[idx]!, 0) / Math.max(1, nearMax.length);
  const minRun = Math.max(3, Math.floor(planarEv.length * 0.1));
  const hasFlatPlateau = nearMax.length >= minRun;
  const workFunctionEv = vacuumLevelEv - eFermiEv;
  return {
    vacuumLevelEv,
    eFermiEv,
    workFunctionEv,
    plateauIndices: nearMax,
    hasFlatPlateau,
    ...(!hasFlatPlateau
      ? {
          warning:
            'No flat vacuum plateau detected (fewer than 10 % of slices lie within tolerance of the maximum). Increase vacuum thickness or enable a dipole correction (LDIPOL = .TRUE., IDIPOL = 3, S-066).',
        }
      : {}),
  };
}
