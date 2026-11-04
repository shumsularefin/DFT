import { describe, expect, it } from 'vitest';
import kp from '../../../tests/reference/kpaths.json';
import { niggliReduce } from './niggli';
import { cellVolume, fromParameters } from './lattice';
import { det3, dot } from './linalg';
import type { Mat3 } from './types';

const gram = (m: Mat3) => m.map((a) => m.map((b) => dot(a, b)));

describe('niggliReduce', () => {
  it('leaves a reduced cubic cell alone (up to sign and order)', () => {
    const r = niggliReduce([
      [3, 0, 0],
      [0, 3, 0],
      [0, 0, 3],
    ]);
    expect(gram(r)).toEqual([
      [9, 0, 0],
      [0, 9, 0],
      [0, 0, 9],
    ]);
  });
  it('reduces a badly skewed cell to the same lattice with the three shortest independent vectors', () => {
    const base = fromParameters(4, 5, 6, 80, 85, 95);
    const skew: Mat3 = [
      base[0],
      [base[1][0] + 3 * base[0][0], base[1][1] + 3 * base[0][1], base[1][2] + 3 * base[0][2]],
      [
        base[2][0] + 2 * base[1][0] - 4 * base[0][0],
        base[2][1] + 2 * base[1][1] - 4 * base[0][1],
        base[2][2] + 2 * base[1][2] - 4 * base[0][2],
      ],
    ];
    const r = niggliReduce(skew);
    expect(cellVolume(r)).toBeCloseTo(cellVolume(base), 8);
    const g = gram(r);
    // Niggli conditions: A <= B <= C and |2 xi| <= B, |2 eta| <= A, |2 zeta| <= A (within the tolerance)
    expect(g[0]![0]!).toBeLessThanOrEqual(g[1]![1]! + 1e-5);
    expect(g[1]![1]!).toBeLessThanOrEqual(g[2]![2]! + 1e-5);
    expect(Math.abs(2 * g[1]![2]!)).toBeLessThanOrEqual(g[1]![1]! + 1e-5);
    expect(Math.abs(2 * g[0]![2]!)).toBeLessThanOrEqual(g[0]![0]! + 1e-5);
    expect(Math.abs(2 * g[0]![1]!)).toBeLessThanOrEqual(g[0]![0]! + 1e-5);
    expect(g[0]![0]!).toBeCloseTo(16, 6);
  });
  it('is idempotent and keeps the volume for the triclinic golden cells', () => {
    for (const name of ['triclinic_P1bar', 'v_aP2_tria', 'v_aP2_trib', 'v_aP3_trib']) {
      const A = (kp.structures as unknown as Record<string, { input: { lattice_rows: number[][] } }>)[name]!
        .input.lattice_rows as unknown as Mat3;
      const r = niggliReduce(A);
      expect(Math.abs(det3(r))).toBeCloseTo(Math.abs(det3(A)), 8);
      const r2 = niggliReduce(r);
      expect(r2).toEqual(r);
    }
  });
});
