// Toy model of charge sloshing (M16.9): the density mixer of an SCF loop acting on a long metallic cell, in linear response.
// The cell has length L along z; the error of the input density is a sum of plane waves cos(q z), sin(q z) with
// q = 2 pi m / L. In a metal with Thomas-Fermi screening the output density answers an error e(q) in the input with
//   n_out - n_in = -eps(q) e(q),   eps(q) = 1 + kTF^2 / q^2          (Thomas-Fermi dielectric function, Ashcroft-Mermin)
// so simple mixing n_in <- n_in + K(q) (n_out - n_in) multiplies each error wave by g(q) = 1 - K(q) eps(q) per iteration.
// K(q) = AMIX q^2 / (q^2 + BMIX^2) is Kerker's preconditioner (BMIX = 0: plain linear mixing). The longest wave of a cell
// of length L has eps of about kTF^2 L^2 / (4 pi^2): plain mixing must shrink AMIX like 1 / L^2 or the density sloshes
// from one end of the cell to the other with growing amplitude. Pulay (DIIS) mixing combines the last few residuals.
// A teaching model with one screening wave vector; it is not VASP's mixer (which adds a metric and Broyden updates).
// @source S-036 (Thomas-Fermi screening), S-155 (Kerker preconditioning), S-010 (Pulay mixing in VASP)

export type Mixer = 'linear' | 'pulay';

export interface SloshOptions {
  /** Cell length along z, Angstrom. */
  length: number;
  /** Thomas-Fermi screening wave vector, 1/Angstrom. */
  kTF: number;
  /** Mixing amplitude (AMIX). */
  amix: number;
  /** Kerker wave vector (BMIX), 1/Angstrom; 0 means plain linear mixing. */
  bmix: number;
  mixer: Mixer;
  iterations: number;
  /** Pulay history length (default 7). */
  history?: number;
  /** Number of Fourier modes kept (default 24). */
  modes?: number;
}

export interface SloshResult {
  /** Wave vectors of the modes, 1/Angstrom. */
  q: number[];
  /** Input-density error of each iteration (index 0 is the start): cos and sin amplitudes, mode by mode. */
  errors: { a: Float64Array; b: Float64Array }[];
  /** |n_out - n_in| of each iteration, relative to the first. */
  residuals: number[];
  /** Linear-mixing factor g(q) of each mode. */
  gains: number[];
  diverged: boolean;
}

/** Thomas-Fermi dielectric function of a metal, eps(q) = 1 + kTF^2 / q^2. */
export const dielectric = (q: number, kTF: number): number => 1 + (kTF * kTF) / (q * q);

/** Kerker mixing weight K(q) = AMIX q^2 / (q^2 + BMIX^2); plain AMIX when BMIX = 0. */
export const kerker = (q: number, amix: number, bmix: number): number =>
  bmix > 0 ? (amix * q * q) / (q * q + bmix * bmix) : amix;

/** Factor that multiplies an error wave of wave vector q in one step of simple (Kerker) mixing. */
export const gain = (q: number, kTF: number, amix: number, bmix: number): number =>
  1 - kerker(q, amix, bmix) * dielectric(q, kTF);

export const modeVectors = (length: number, modes = 24): number[] =>
  Array.from({ length: modes }, (_, i) => (2 * Math.PI * (i + 1)) / length);

/** Largest AMIX for which simple mixing converges on every mode of the cell: 2 / max_q(K(q) eps(q) / AMIX). */
export function stableAmix(length: number, kTF: number, bmix: number, modes = 24): number {
  let worst = 0;
  for (const q of modeVectors(length, modes))
    worst = Math.max(worst, kerker(q, 1, bmix) * dielectric(q, kTF));
  return 2 / worst;
}

/**
 * The starting error: too much charge in a lump at a quarter of the cell (a Gaussian of width L / 12 and height `peak`,
 * neutral overall), as Fourier amplitudes of the periodic cell.
 */
export function lumpError(
  length: number,
  q: readonly number[],
  peak = 1,
): { a: Float64Array; b: Float64Array } {
  const w = length / 12;
  const z0 = length / 4;
  const a = new Float64Array(q.length);
  const b = new Float64Array(q.length);
  q.forEach((qm, i) => {
    const c = ((2 * peak * w * Math.sqrt(2 * Math.PI)) / length) * Math.exp(-0.5 * qm * qm * w * w);
    a[i] = c * Math.cos(qm * z0);
    b[i] = c * Math.sin(qm * z0);
  });
  return { a, b };
}

/** The density error at z from its Fourier amplitudes. */
export function errorAt(q: readonly number[], e: { a: Float64Array; b: Float64Array }, z: number): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) s += e.a[i]! * Math.cos(q[i]! * z) + e.b[i]! * Math.sin(q[i]! * z);
  return s;
}

/** Solve the small symmetric system [A 1; 1^T 0][c; l] = [0; 1] for the Pulay weights c (Gaussian elimination). */
function pulayWeights(A: number[][]): number[] {
  const m = A.length;
  const n = m + 1;
  const M = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => {
      if (j === n) return i === m ? 1 : 0;
      if (i < m && j < m) return A[i]![j]!;
      return i === m && j === m ? 0 : 1;
    }),
  );
  const scale = Math.max(...A.map((r, i) => Math.abs(r[i]!)), 1e-300);
  for (let i = 0; i < m; i++) M[i]![i]! += 1e-12 * scale; // keep a nearly dependent history solvable
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r;
    [M[c], M[p]] = [M[p]!, M[c]!];
    const piv = M[c]![c]!;
    if (Math.abs(piv) < 1e-300) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r]![c]! / piv;
      if (f) for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return Array.from({ length: m }, (_, i) => M[i]![n]! / M[i]![i]!);
}

/** Run the mixer and return the input-density error of every iteration. */
export function slosh(o: SloshOptions): SloshResult {
  const q = modeVectors(o.length, o.modes ?? 24);
  const M = q.length;
  const eps = q.map((x) => dielectric(x, o.kTF));
  const K = q.map((x) => kerker(x, o.amix, o.bmix));
  const gains = q.map((_, i) => 1 - K[i]! * eps[i]!);
  // state vector: [a_1..a_M, b_1..b_M]
  const start = lumpError(o.length, q);
  let e = new Float64Array(2 * M);
  e.set(start.a, 0);
  e.set(start.b, M);
  const resid = (x: Float64Array) => x.map((v, i) => -eps[i % M]! * v);
  const norm = (x: Float64Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0));
  const split = (x: Float64Array) => ({ a: x.slice(0, M), b: x.slice(M) });
  const errors = [split(e)];
  let R = resid(e);
  const r0 = norm(R) || 1;
  const residuals = [1];
  const hist: { e: Float64Array; R: Float64Array }[] = [];
  const hmax = o.history ?? 7;
  let diverged = false;
  for (let it = 1; it <= o.iterations; it++) {
    let next: Float64Array;
    if (o.mixer === 'linear') {
      next = e.map((v, i) => v + K[i % M]! * R[i]!);
    } else {
      hist.push({ e, R });
      if (hist.length > hmax) hist.shift();
      const A = hist.map((hi) => hist.map((hj) => hi.R.reduce((s, v, k) => s + v * hj.R[k]!, 0)));
      const c = pulayWeights(A);
      next = new Float64Array(2 * M);
      hist.forEach((h, j) => {
        for (let i = 0; i < 2 * M; i++) next[i]! += c[j]! * (h.e[i]! + K[i % M]! * h.R[i]!);
      });
    }
    e = next;
    R = resid(e);
    const r = norm(R) / r0;
    residuals.push(r);
    errors.push(split(e));
    if (!Number.isFinite(r) || r > 1e8) {
      diverged = true;
      break;
    }
  }
  return { q, errors, residuals, gains, diverged };
}
