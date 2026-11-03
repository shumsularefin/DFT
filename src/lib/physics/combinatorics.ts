// Exact counting for the many-electron wavefunction (module 3, "the exponential wall").
// @source S-048 (Szabo and Ostlund: Slater determinants and full configuration interaction)
// The count C(M, N) is plain combinatorics; no model or fitted number is involved.

/** Binomial coefficient C(n, k) as an exact BigInt. Returns 0n when k < 0 or k > n. */
export function binomial(n: number, k: number): bigint {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0)
    throw new RangeError('binomial needs integers, n >= 0');
  if (k < 0 || k > n) return 0n;
  const kk = Math.min(k, n - k);
  let r = 1n;
  for (let i = 1; i <= kk; i++) r = (r * BigInt(n - kk + i)) / BigInt(i); // exact at every step
  return r;
}

/** Number of Slater determinants for N electrons in M spin orbitals: C(M, N). */
export const slaterDeterminants = (electrons: number, spinOrbitals: number): bigint =>
  binomial(spinOrbitals, electrons);

/** Memory in bytes to store one double-precision (8 byte) coefficient per determinant. */
export const bytesForDoubles = (count: bigint): bigint => count * 8n;

/** log10 of a positive BigInt, accurate to double precision even for huge values. */
export function log10Big(x: bigint): number {
  if (x <= 0n) return -Infinity;
  const s = x.toString();
  if (s.length <= 15) return Math.log10(Number(x));
  return s.length - 1 + Math.log10(Number(s.slice(0, 15)) / 1e14);
}

/** "d.ddd x 10^e" for a BigInt (plain digits when below one million). */
export function formatBig(x: bigint, digits = 3): string {
  if (x < 1_000_000n) return x.toString();
  const s = x.toString();
  const e = s.length - 1;
  const mant = `${s[0]}.${s.slice(1, 1 + digits)}`;
  return `${mant} x 10^${e}`;
}

/** Decimal terabytes (10^12 bytes) as a number, for comparison text. */
export const bytesToTerabytes = (bytes: bigint): number => Number(bytes) / 1e12;
