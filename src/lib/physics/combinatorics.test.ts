import { describe, expect, it } from 'vitest';
import {
  binomial,
  bytesForDoubles,
  formatBig,
  log10Big,
  slaterDeterminants,
  bytesToTerabytes,
} from './combinatorics';

// Reference values: exact integers from the work order (M2.4); C(100,50) is a standard exact value.
describe('binomial (S-048, exact)', () => {
  it('matches known values', () => {
    expect(binomial(10, 5)).toBe(252n);
    expect(binomial(20, 10)).toBe(184756n);
    expect(binomial(40, 20)).toBe(137846528820n);
    expect(binomial(100, 50)).toBe(100891344545564193334812497256n);
  });
  it('has C(n,0)=1, symmetry and the Pascal identity', () => {
    for (const n of [0, 1, 7, 30, 64]) expect(binomial(n, 0)).toBe(1n);
    for (const [n, k] of [
      [12, 5],
      [50, 17],
      [33, 0],
    ] as const)
      expect(binomial(n, k)).toBe(binomial(n, n - k));
    for (const [n, k] of [
      [12, 5],
      [50, 17],
      [80, 40],
    ] as const)
      expect(binomial(n, k)).toBe(binomial(n - 1, k - 1) + binomial(n - 1, k));
  });
  it('is zero outside 0..n and rejects bad input', () => {
    expect(binomial(5, 6)).toBe(0n);
    expect(binomial(5, -1)).toBe(0n);
    expect(() => binomial(-1, 0)).toThrow();
    expect(() => binomial(2.5, 1)).toThrow();
  });
});

describe('determinants and memory', () => {
  it('counts determinants as C(M, N) and 8 bytes each', () => {
    expect(slaterDeterminants(20, 40)).toBe(137846528820n);
    expect(bytesForDoubles(137846528820n)).toBe(1102772230560n);
    expect(bytesToTerabytes(1102772230560n)).toBeCloseTo(1.1028, 3);
  });
  it('formats and takes logs of huge integers', () => {
    expect(formatBig(252n)).toBe('252');
    expect(formatBig(100891344545564193334812497256n)).toBe('1.008 x 10^29');
    expect(log10Big(100891344545564193334812497256n)).toBeCloseTo(29.0038, 3);
    expect(log10Big(1000n)).toBeCloseTo(3, 12);
  });
});
