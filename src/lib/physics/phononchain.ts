// Ball-and-spring phonon chains (M16.11): the monatomic and the diatomic linear chain with nearest-neighbour springs.
// Diatomic chain: masses m1 and m2 alternate, every spring has constant K, the cell length is a (atom 1 at n a,
// atom 2 at n a + a / 2). Equations of motion for u(n, j) = U_j exp(i (q n a - w t)):
//   (2K - m1 w^2) U1 = K (1 + exp(-i q a)) U2,   (2K - m2 w^2) U2 = K (1 + exp(i q a)) U1,
// whose determinant gives the closed form (Kittel chapter 4, eq. 18; Ashcroft and Mermin chapter 22)
//   w^2 = K (1/m1 + 1/m2) -/+ K sqrt((1/m1 + 1/m2)^2 - 4 sin^2(q a / 2) / (m1 m2)).
// Monatomic chain (mass m, spacing a): w = 2 sqrt(K / m) |sin(q a / 2)|.
// The 2x2 mass-weighted dynamical matrix is also given so tests can check the closed form against an independent
// eigenvalue solve. Pure, unit free: frequencies come out in units of sqrt(K / m) for whatever K and m are passed.
// @source S-050 (Kittel, phonons chapter), S-036 (Ashcroft and Mermin, harmonic crystal chapter)

export interface Complex {
  re: number;
  im: number;
}

/** Monatomic chain: w(q) = 2 sqrt(K/m) |sin(q a / 2)|. */
export function monatomicOmega(q: number, m = 1, k = 1, a = 1): number {
  return 2 * Math.sqrt(k / m) * Math.abs(Math.sin((q * a) / 2));
}

/** Diatomic chain, closed form: [acoustic, optical] angular frequencies. */
export function diatomicOmega(q: number, m1: number, m2: number, k = 1, a = 1): [number, number] {
  const s = 1 / m1 + 1 / m2;
  const disc = Math.max(0, s * s - (4 * Math.sin((q * a) / 2) ** 2) / (m1 * m2));
  const root = Math.sqrt(disc);
  return [Math.sqrt(Math.max(0, k * (s - root))), Math.sqrt(k * (s + root))];
}

/** Mass-weighted dynamical matrix D(q) = [[d11, d12], [conj d12, d22]] of the diatomic chain. */
export function diatomicDynamicalMatrix(
  q: number,
  m1: number,
  m2: number,
  k = 1,
  a = 1,
): { d11: number; d22: number; d12: Complex } {
  const f = -k / Math.sqrt(m1 * m2);
  return {
    d11: (2 * k) / m1,
    d22: (2 * k) / m2,
    d12: { re: f * (1 + Math.cos(q * a)), im: -f * Math.sin(q * a) },
  };
}

/** Eigenvalues (ascending) of a 2x2 Hermitian matrix [[a, b], [conj b, d]]. */
export function hermitian2Eigenvalues(a: number, d: number, b: Complex): [number, number] {
  const mean = (a + d) / 2;
  const r = Math.sqrt(((a - d) / 2) ** 2 + b.re * b.re + b.im * b.im);
  return [mean - r, mean + r];
}

/** Gap at the zone boundary q = pi / a: [top of the acoustic branch, bottom of the optical branch]. */
export function zoneBoundaryGap(m1: number, m2: number, k = 1): [number, number] {
  const heavy = Math.max(m1, m2);
  const light = Math.min(m1, m2);
  return [Math.sqrt((2 * k) / heavy), Math.sqrt((2 * k) / light)];
}

/**
 * Displacement amplitudes [U1, U2] (complex, not mass weighted) of one branch at q, normalised so that
 * m1 |U1|^2 + m2 |U2|^2 = 1. Branch 0 is acoustic, 1 optical.
 */
export function diatomicAmplitudes(
  q: number,
  m1: number,
  m2: number,
  branch: 0 | 1,
  k = 1,
  a = 1,
): [Complex, Complex] {
  const w2 = diatomicOmega(q, m1, m2, k, a)[branch] ** 2;
  // two equivalent forms of the null vector of (D - w^2); take the one with the larger norm (stable at q = pi / a)
  const v: [Complex, Complex] = [
    { re: k * (1 + Math.cos(q * a)), im: -k * Math.sin(q * a) },
    { re: 2 * k - m1 * w2, im: 0 },
  ];
  const w: [Complex, Complex] = [
    { re: 2 * k - m2 * w2, im: 0 },
    { re: k * (1 + Math.cos(q * a)), im: k * Math.sin(q * a) },
  ];
  const n2 = (u: [Complex, Complex]) =>
    m1 * (u[0].re ** 2 + u[0].im ** 2) + m2 * (u[1].re ** 2 + u[1].im ** 2);
  let u = n2(v) >= n2(w) ? v : w;
  let n = n2(u);
  if (n < 1e-24) {
    // equal masses at the zone boundary: both branches meet; one atom of each kind moves alone
    u =
      branch === 0
        ? [
            { re: 0, im: 0 },
            { re: 1, im: 0 },
          ]
        : [
            { re: 1, im: 0 },
            { re: 0, im: 0 },
          ];
    n = n2(u);
  }
  const s = 1 / Math.sqrt(n);
  return [
    { re: u[0].re * s, im: u[0].im * s },
    { re: u[1].re * s, im: u[1].im * s },
  ];
}

/**
 * Real displacements of a diatomic chain of `cells` cells at time t (phase w t = 2 pi `phase`): u(n, j) =
 * Re[U_j exp(i (q n a - 2 pi phase))], scaled so the largest |U| is `amplitude`. Returns [u(0,1), u(0,2), u(1,1), ...].
 */
export function chainDisplacements(
  cells: number,
  q: number,
  m1: number,
  m2: number,
  branch: 0 | 1,
  phase: number,
  amplitude = 1,
  a = 1,
): number[] {
  const [u1, u2] = diatomicAmplitudes(q, m1, m2, branch, 1, a);
  const big = Math.max(Math.hypot(u1.re, u1.im), Math.hypot(u2.re, u2.im)) || 1;
  const out: number[] = [];
  for (let n = 0; n < cells; n++) {
    const th = q * n * a - 2 * Math.PI * phase;
    const c = Math.cos(th);
    const s = Math.sin(th);
    out.push(((u1.re * c - u1.im * s) / big) * amplitude, ((u2.re * c - u2.im * s) / big) * amplitude);
  }
  return out;
}

/** Group velocity dw/dq of one branch by a central difference (units of sqrt(K/m) a). */
export function diatomicGroupVelocity(
  q: number,
  m1: number,
  m2: number,
  branch: 0 | 1,
  k = 1,
  a = 1,
): number {
  const h = 1e-5 / a;
  const lo = Math.max(0, q - h);
  const hi = Math.min(Math.PI / a, q + h);
  return (diatomicOmega(hi, m1, m2, k, a)[branch] - diatomicOmega(lo, m1, m2, k, a)[branch]) / (hi - lo);
}
