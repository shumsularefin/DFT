// Classical spin textures on a chain and their Heisenberg energy (M16.8): canted antiferromagnet, flat helix and
// conical helix, unit spins, the default convention of magnetism/heisenberg.ts (H = -sum_(i<j) J_ij S_i.S_j, pairs once,
// so J > 0 is ferromagnetic). Plus the SAXIS frame VASP uses for non-collinear MAGMOM.
// @source S-059 (Heisenberg model; helical order from competing J1 and J2: cos(qa) = -J1 / (4 J2))
// @source S-065 (VASP wiki SAXIS: MAGMOM is given in the frame rotated by alpha about z and beta about y)
import type { Vec3 } from '../crystal/types';

export type TextureKind = 'canted' | 'helix' | 'cone';

export interface TextureParams {
  kind: TextureKind;
  /** Canting angle away from the collinear axis (canted), or cone half-angle about the chain (cone), radians. */
  angle: number;
  /** Wave vector in units of 2 pi / a (helix and cone), 0 to 0.5. */
  q: number;
}

/**
 * Unit spin of site j (position j a along x) in the SAXIS frame.
 * canted: collinear antiferromagnet along z, every spin tilted by `angle` toward +x (net moment sin(angle) along x).
 * helix: the spin turns in the yz plane, perpendicular to the chain, by 2 pi q per site (q = 0 FM, q = 1/2 AFM).
 * cone: the helix closed up to a cone of half-angle `angle` about the chain axis x (net moment cos(angle) along x).
 */
export function textureSpin(p: TextureParams, j: number): Vec3 {
  const phi = 2 * Math.PI * p.q * j;
  if (p.kind === 'canted') {
    const s = j % 2 === 0 ? 1 : -1;
    return [Math.sin(p.angle), 0, s * Math.cos(p.angle)];
  }
  if (p.kind === 'helix') return [0, Math.sin(phi), Math.cos(phi)];
  return [Math.cos(p.angle), Math.sin(p.angle) * Math.sin(phi), Math.sin(p.angle) * Math.cos(phi)];
}

/** Average of S_0 . S_n over an infinite chain (closed form), n = 1, 2, ... */
export function pairCorrelation(p: TextureParams, n: number): number {
  const phi = 2 * Math.PI * p.q * n;
  if (p.kind === 'canted') {
    const c2 = Math.cos(p.angle) ** 2;
    const s2 = Math.sin(p.angle) ** 2;
    return n % 2 === 0 ? 1 : s2 - c2;
  }
  if (p.kind === 'helix') return Math.cos(phi);
  return Math.cos(p.angle) ** 2 + Math.sin(p.angle) ** 2 * Math.cos(phi);
}

/** Energy per spin of the infinite chain, E/N = -sum_n J_n <S_0.S_n> (pairs once, unit spins), J = [J1, J2, ...]. */
export function chainEnergy(p: TextureParams, j: readonly number[]): number {
  return -j.reduce((acc, jn, i) => acc + jn * pairCorrelation(p, i + 1), 0);
}

/** Energy per spin of a finite periodic ring of explicit spins (an independent check of `chainEnergy`). */
export function ringEnergy(spins: readonly Vec3[], j: readonly number[]): number {
  const n = spins.length;
  let e = 0;
  for (let i = 0; i < n; i++)
    j.forEach((jn, k) => {
      const a = spins[i]!;
      const b = spins[(i + k + 1) % n]!;
      e -= jn * (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
    });
  return e / n;
}

/**
 * Wave vector (units of 2 pi / a, 0 to 1/2) of the lowest-energy flat helix for J1 and J2: cos(2 pi q) = -J1 / (4 J2)
 * when J2 < 0 (antiferromagnetic second neighbours) and |J1| < 4 |J2|; otherwise q = 0 (J1 > 0) or 1/2 (J1 < 0).
 */
export function helixOptimum(j1: number, j2: number): number {
  if (j2 < 0 && Math.abs(j1) < 4 * Math.abs(j2)) return Math.acos(-j1 / (4 * j2)) / (2 * Math.PI);
  return j1 >= 0 ? 0 : 0.5;
}

/** Mean spin per site of the infinite chain (net moment per site in units of the site moment), SAXIS frame. */
export function netPerSite(p: TextureParams): Vec3 {
  if (p.kind === 'canted') return [Math.sin(p.angle), 0, 0];
  const turning = p.q > 1e-12;
  if (p.kind === 'helix') return turning ? [0, 0, 0] : [0, 0, 1];
  return turning ? [Math.cos(p.angle), 0, 0] : textureSpin(p, 0);
}

/** The angles (alpha, beta) of a SAXIS vector: alpha from x in the xy plane, beta from z. */
export function saxisAngles(saxis: Vec3): { alpha: number; beta: number } {
  return {
    alpha: Math.atan2(saxis[1], saxis[0]),
    beta: Math.atan2(Math.hypot(saxis[0], saxis[1]), saxis[2]),
  };
}

/**
 * Cartesian spin of a MAGMOM triple (m_x, m_y, m_z) given in the SAXIS frame (VASP wiki SAXIS):
 * s_x = cos b cos a m_x - sin a m_y + sin b cos a m_z; s_y = cos b sin a m_x + cos a m_y + sin b sin a m_z;
 * s_z = -sin b m_x + cos b m_z. So MAGMOM (0, 0, m) points along SAXIS.
 */
export function saxisToCartesian(m: Vec3, saxis: Vec3): Vec3 {
  const { alpha: a, beta: b } = saxisAngles(saxis);
  const [ca, sa, cb, sb] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b)];
  return [
    cb * ca * m[0] - sa * m[1] + sb * ca * m[2],
    cb * sa * m[0] + ca * m[1] + sb * sa * m[2],
    -sb * m[0] + cb * m[2],
  ];
}
