// Band gap and its direct/indirect character from eigenvalues and occupations.
// A state is "occupied" when its occupation is at least 0.5 (a convention; for a semiconductor the occupations are 0 or 1).
// The result is a statement about the k-points that were computed, not about the whole zone.
// @source S-019 (VASP wiki: EIGENVAL), S-050 (Kittel: direct and indirect gaps)
import type { BandPoint } from './eigenval';
import type { Vec3 } from '../crystal/types';

export interface Edge {
  e: number;
  /** Index into the k-point list. */
  k: number;
  band: number;
  spin: number;
}

export interface GapResult {
  /** True when some band holds both occupied and empty states, or the valence maximum is not below the conduction minimum. */
  metallic: boolean;
  vbm: Edge;
  cbm: Edge;
  /** CBM - VBM in eV; 0 for a metal. */
  gap: number;
  /** Gap at the same k-point as the VBM, minimum over k of (lowest empty - highest occupied) at that k. */
  directGap: number | null;
  /** True when VBM and CBM sit at the same k-point (within 1e-6 in each fractional component). */
  direct: boolean;
}

const OCC = 0.5;
const sameK = (a: Vec3, b: Vec3) => a.every((x, i) => Math.abs(x - b[i]!) < 1e-6);

/** `bands[spin][k][band]` as returned by `parseEigenval`; `kpoints` are the matching coordinates. */
export function bandGap(
  bands: readonly (readonly (readonly BandPoint[])[])[],
  kpoints: readonly Vec3[],
): GapResult {
  let vbm: Edge | null = null;
  let cbm: Edge | null = null;
  let straddle = false;
  bands.forEach((spinBands, spin) => {
    const nb = spinBands[0]?.length ?? 0;
    for (let b = 0; b < nb; b++) {
      let occ = false;
      let emp = false;
      spinBands.forEach((kb, k) => {
        const p = kb[b]!;
        if (p.occ >= OCC) {
          occ = true;
          if (!vbm || p.e > vbm.e) vbm = { e: p.e, k, band: b, spin };
        } else {
          emp = true;
          if (!cbm || p.e < cbm.e) cbm = { e: p.e, k, band: b, spin };
        }
      });
      if (occ && emp) straddle = true;
    }
  });
  if (!vbm || !cbm) throw new RangeError('need at least one occupied and one empty state to define a gap');
  const v: Edge = vbm;
  const c: Edge = cbm;
  const metallic = straddle || c.e <= v.e;
  const direct = sameK(kpoints[v.k]!, kpoints[c.k]!);
  // direct gap: smallest (lowest empty - highest occupied) over k, within a spin channel
  let dg: number | null = null;
  bands.forEach((spinBands) =>
    spinBands.forEach((kb) => {
      const hi = Math.max(...kb.filter((p) => p.occ >= OCC).map((p) => p.e));
      const lo = Math.min(...kb.filter((p) => p.occ < OCC).map((p) => p.e));
      if (Number.isFinite(hi) && Number.isFinite(lo) && (dg === null || lo - hi < dg)) dg = lo - hi;
    }),
  );
  return { metallic, vbm: v, cbm: c, gap: metallic ? 0 : c.e - v.e, directGap: metallic ? null : dg, direct };
}
