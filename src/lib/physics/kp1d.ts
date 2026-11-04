// Toy model (D-004 spirit): one electron in a 1D periodic potential, solved in a plane-wave basis. Pure, no dependencies.
// Basis exp(i (k + G) x), G = 2 pi j / a, kept when (hbar^2/2m)(k+G)^2 <= ENCUT. The potentials are even, so the
// Hamiltonian is real symmetric: H_jj' = delta_jj' (hbar^2/2m)(k+G_j)^2 + V(G_j - G_j').
// This is a teaching model of the cutoff; it is not a DFT calculation.
// @source S-050 (Kittel: nearly free electron and Kronig-Penney models), S-049 (Martin), S-031 (constants)
import { HBAR2_OVER_2M_EV_A2 } from './constants';

export type Potential1D =
  | { kind: 'cosine'; v0: number }
  /** Rectangular barrier of height v0 (eV) and width `width` (Angstrom) per period, centred on x = 0 (Kronig-Penney form). */
  | { kind: 'kronig-penney'; v0: number; width: number };

export interface ToyOptions {
  /** Period in Angstrom. */
  a: number;
  potential: Potential1D;
  /** Bloch wave vector in 1/Angstrom. */
  k: number;
  encutEv: number;
  /** Number of lowest bands to return. */
  nBands: number;
}

export interface ToyResult {
  /** Lowest band energies in eV, ascending. Fewer than nBands when the basis is smaller. */
  energies: number[];
  /** Number of plane waves in the basis. */
  nPw: number;
}

/** Fourier component V_m = (1/a) integral V(x) exp(-i 2 pi m x / a) dx of the potential, in eV. */
export function fourier(p: Potential1D, a: number, m: number): number {
  if (p.kind === 'cosine') return Math.abs(m) === 1 ? p.v0 / 2 : 0;
  const duty = p.width / a;
  if (m === 0) return p.v0 * duty;
  return (p.v0 * Math.sin(Math.PI * m * duty)) / (Math.PI * m);
}

/** Plane-wave indices j with (hbar^2/2m)(k + 2 pi j / a)^2 <= ENCUT, ascending. */
export function basisIndices(a: number, k: number, encutEv: number): number[] {
  const kc = Math.sqrt(Math.max(0, encutEv) / HBAR2_OVER_2M_EV_A2);
  const g1 = (2 * Math.PI) / a;
  const jmax = Math.ceil(kc / g1 + Math.abs(k) / g1) + 1;
  const out: number[] = [];
  for (let j = -jmax; j <= jmax; j++) {
    const q = k + j * g1;
    if (HBAR2_OVER_2M_EV_A2 * q * q <= encutEv * (1 + 1e-12)) out.push(j);
  }
  return out;
}

/**
 * Eigenvalues of a real symmetric matrix (row-major, n x n) by the cyclic Jacobi method, ascending.
 * Dependency-free; fine for the few dozen plane waves this toy needs.
 */
export function jacobiEigenvalues(matrix: ArrayLike<number>, n: number): number[] {
  const A = Float64Array.from(matrix as ArrayLike<number>);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p * n + q]! ** 2;
    if (off < 1e-26) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q]!;
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (A[q * n + q]! - A[p * n + p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let r = 0; r < n; r++) {
          const arp = A[r * n + p]!;
          const arq = A[r * n + q]!;
          A[r * n + p] = c * arp - s * arq;
          A[r * n + q] = s * arp + c * arq;
        }
        for (let r = 0; r < n; r++) {
          const apr = A[p * n + r]!;
          const aqr = A[q * n + r]!;
          A[p * n + r] = c * apr - s * aqr;
          A[q * n + r] = s * apr + c * aqr;
        }
      }
    }
  }
  const e: number[] = [];
  for (let i = 0; i < n; i++) e.push(A[i * n + i]!);
  return e.sort((x, y) => x - y);
}

/** Lowest `nBands` energies at wave vector k for the given cutoff. */
export function solveToy(o: ToyOptions): ToyResult {
  if (!(o.a > 0)) throw new RangeError('The period must be positive.');
  const js = basisIndices(o.a, o.k, o.encutEv);
  const n = js.length;
  if (n === 0) return { energies: [], nPw: 0 };
  const g1 = (2 * Math.PI) / o.a;
  const H = new Float64Array(n * n);
  for (let r = 0; r < n; r++) {
    const q = o.k + js[r]! * g1;
    for (let c = 0; c < n; c++) {
      H[r * n + c] = (r === c ? HBAR2_OVER_2M_EV_A2 * q * q : 0) + fourier(o.potential, o.a, js[r]! - js[c]!);
    }
  }
  const all = jacobiEigenvalues(H, n);
  return { energies: all.slice(0, Math.min(o.nBands, n)), nPw: n };
}

/** Sum of the lowest `nOcc` band energies: the toy's "total energy" per cell (one occupied band holds two electrons). */
export const occupiedSum = (r: ToyResult, nOcc: number): number | null =>
  r.energies.length >= nOcc ? r.energies.slice(0, nOcc).reduce((s, x) => s + x, 0) : null;

export interface CurvePoint {
  encut: number;
  energy: number;
  nPw: number;
}

/** Energy of the occupied bands against cutoff. Cutoffs that leave too few plane waves are skipped. */
export function convergenceCurve(
  base: Omit<ToyOptions, 'encutEv' | 'nBands'>,
  cutoffs: readonly number[],
  nOcc: number,
): CurvePoint[] {
  const out: CurvePoint[] = [];
  for (const encut of cutoffs) {
    const r = solveToy({ ...base, encutEv: encut, nBands: nOcc });
    const e = occupiedSum(r, nOcc);
    if (e !== null) out.push({ encut, energy: e, nPw: r.nPw });
  }
  return out;
}
