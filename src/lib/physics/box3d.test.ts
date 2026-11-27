// The 3D box and the two-particle box states (S-047), checked against the tested 1D results (boxEnergyEV, boxPsi)
// and against numerical integration.
import { describe, expect, it } from 'vitest';
import {
  box3dEnergyEV,
  box3dLevels,
  box3dPeakDensity,
  box3dPsi,
  boxEnergyEV,
  boxPairPsi,
  boxPsi,
  fillLevels,
} from './box';
import { simpson } from './quadrature';

describe('3D particle in a box (S-047)', () => {
  it('energy is the sum of the three 1D energies from boxEnergyEV', () => {
    for (const [n, L] of [
      [
        [1, 1, 1],
        [5, 5, 5],
      ],
      [
        [2, 1, 3],
        [4, 6, 5],
      ],
      [
        [3, 3, 1],
        [2.5, 5, 7.5],
      ],
    ] as const) {
      const e = boxEnergyEV(n[0], L[0]) + boxEnergyEV(n[1], L[1]) + boxEnergyEV(n[2], L[2]);
      expect(box3dEnergyEV([...n], [...L])).toBeCloseTo(e, 12);
    }
    // ground state of a 5 A cube is three times the 1D value 1.5041 eV (work order check of box.test.ts)
    expect(box3dEnergyEV([1, 1, 1], [5, 5, 5])).toBeCloseTo(3 * 1.5041, 3);
  });
  it('the cube has the textbook degeneracies 1, 3, 3, 3, 1, 6', () => {
    const lv = box3dLevels([5, 5, 5], 6);
    expect(lv.map((l) => l.states.length)).toEqual([1, 3, 3, 3, 1, 6]);
    // in units of E1: 3, 6, 9, 11, 12, 14
    const e1 = boxEnergyEV(1, 5);
    expect(lv.map((l) => Math.round(l.energy / e1))).toEqual([3, 6, 9, 11, 12, 14]);
  });
  it('stretching one side splits the threefold level into two plus one', () => {
    const lv = box3dLevels([5, 5, 6], 4);
    expect(lv[0]!.states.length).toBe(1);
    // (1, 1, 2) drops below (2, 1, 1) and (1, 2, 1), which stay together
    expect(lv[1]!.states).toEqual([[1, 1, 2]]);
    expect(lv[2]!.states.length).toBe(2);
  });
  it('wavefunctions vanish on the walls and are normalised (separable Simpson, 1e-9)', () => {
    const L: [number, number, number] = [4, 5, 6];
    const n: [number, number, number] = [2, 1, 3];
    expect(Math.abs(box3dPsi(n, L, 0, 2, 3))).toBeLessThan(1e-15);
    expect(Math.abs(box3dPsi(n, L, 4, 2, 3))).toBeLessThan(1e-12);
    const ix = simpson((x) => boxPsi(2, 4, x) ** 2, 0, 4, 400);
    const iy = simpson((y) => boxPsi(1, 5, y) ** 2, 0, 5, 400);
    const iz = simpson((z) => boxPsi(3, 6, z) ** 2, 0, 6, 400);
    expect(ix * iy * iz).toBeCloseTo(1, 9);
    // the product equals the 3D function at a sample point
    expect(box3dPsi(n, L, 1.1, 2.2, 3.3)).toBeCloseTo(
      boxPsi(2, 4, 1.1) * boxPsi(1, 5, 2.2) * boxPsi(3, 6, 3.3),
      14,
    );
  });
  it('the peak density is 8 / (Lx Ly Lz)', () => {
    const L: [number, number, number] = [4, 5, 6];
    expect(box3dPsi([1, 1, 1], L, 2, 2.5, 3) ** 2).toBeCloseTo(box3dPeakDensity(L), 12);
  });
});

describe('two particles in one box (S-047)', () => {
  const L = 5;
  it('swapping the particles flips the sign of the antisymmetric state and keeps the symmetric one', () => {
    for (const [x1, x2] of [
      [1, 3],
      [0.4, 4.1],
    ]) {
      expect(boxPairPsi(1, 2, L, x2!, x1!, 'antisymmetric')).toBeCloseTo(
        -boxPairPsi(1, 2, L, x1!, x2!, 'antisymmetric'),
        14,
      );
      expect(boxPairPsi(1, 2, L, x2!, x1!, 'symmetric')).toBeCloseTo(
        boxPairPsi(1, 2, L, x1!, x2!, 'symmetric'),
        14,
      );
    }
  });
  it('the antisymmetric state is zero on the diagonal and zero everywhere for a = b (Pauli)', () => {
    expect(boxPairPsi(1, 3, L, 2.2, 2.2, 'antisymmetric')).toBe(0);
    expect(boxPairPsi(2, 2, L, 1, 3, 'antisymmetric')).toBe(0);
    expect(boxPairPsi(2, 2, L, 1, 3, 'symmetric')).toBeCloseTo(boxPsi(2, L, 1) * boxPsi(2, L, 3), 14);
  });
  it('both states are normalised over the square (nested Simpson, 1e-8)', () => {
    for (const kind of ['symmetric', 'antisymmetric'] as const) {
      const norm = simpson(
        (x1) => simpson((x2) => boxPairPsi(1, 2, L, x1, x2, kind) ** 2, 0, L, 200),
        0,
        L,
        200,
      );
      expect(norm).toBeCloseTo(1, 8);
    }
  });
});

describe('filling levels two at a time (Pauli)', () => {
  it('fills from the bottom with at most two per level', () => {
    expect(fillLevels(5, 4)).toEqual([2, 2, 1, 0]);
    expect(fillLevels(0, 2)).toEqual([0, 0]);
    expect(fillLevels(5, 4, 5)).toEqual([5, 0, 0, 0]);
  });
});
