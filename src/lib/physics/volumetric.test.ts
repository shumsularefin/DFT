import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChgcar } from '../vasp/chgcar';
import { parseLocpot } from '../vasp/locpot';
import {
  chargeDensityDifference,
  checkGridCompatibility,
  macroscopicAverage,
  planarAverage,
  workFunctionFromLocpot,
} from './volumetric';
import type { Mat3 } from '../crystal/types';

const CUBIC: Mat3 = [
  [5, 0, 0],
  [0, 5, 0],
  [0, 0, 20],
];

describe('M14.3 LOCPOT and volumetric analysis', () => {
  it('computes exact planar averages along all three axes and macroscopic average', () => {
    const grid: [number, number, number] = [2, 3, 4];
    const values = new Float64Array(2 * 3 * 4);
    for (let iz = 0; iz < 4; iz++) {
      for (let iy = 0; iy < 3; iy++) {
        for (let ix = 0; ix < 2; ix++) {
          values[ix + 2 * (iy + 3 * iz)] = 10 * iz + iy + 0.1 * ix;
        }
      }
    }
    const avgZ = planarAverage(values, grid, 2);
    [1.05, 11.05, 21.05, 31.05].forEach((v, i) => expect(avgZ[i]).toBeCloseTo(v, 12));
    const avgX = planarAverage(values, grid, 0);
    expect(avgX[0]).toBeCloseTo(16.0, 12);
    expect(avgX[1]).toBeCloseTo(16.1, 12);
    const mac = macroscopicAverage([2, 2, 2, 2], 3);
    expect(mac).toEqual([2, 2, 2, 2]);
  });

  it('gives zero difference for a CHGCAR with itself and refuses incompatible grids', () => {
    const chg = parseChgcar(readFileSync('tests/reference/vasp-outputs/CHGCAR', 'utf8'));
    const g = { lattice: chg.structure.lattice, grid: chg.grid, values: chg.totalRaw };
    const selfDiff = chargeDensityDifference(g, g);
    expect(selfDiff.ok).toBe(true);
    if (selfDiff.ok) {
      expect(selfDiff.values.every((v) => v === 0)).toBe(true);
    }

    const bad = checkGridCompatibility(g, { lattice: CUBIC, grid: [10, 10, 10] });
    expect(bad.ok).toBe(false);
  });

  it('parses LOCPOT without volume scaling and computes work function with plateau check', () => {
    // Build a synthetic 2x2x20 LOCPOT with vacuum plateau at 5.20 eV and slab dip at 0.0 eV
    const header = [
      'Synthetic slab LOCPOT',
      '1.0',
      '  5.0 0.0 0.0',
      '  0.0 5.0 0.0',
      '  0.0 0.0 20.0',
      'Cu',
      '1',
      'Direct',
      '  0.5 0.5 0.5',
      '',
      '  2 2 20',
    ];
    const vals: number[] = [];
    for (let iz = 0; iz < 20; iz++) {
      const v = iz >= 6 && iz <= 13 ? 0.0 : 5.2;
      for (let i = 0; i < 4; i++) vals.push(v);
    }
    const loc = parseLocpot([...header, vals.join(' ')].join('\n'));
    expect(loc.isVolumeScaled).toBe(false);
    expect(loc.grid).toEqual([2, 2, 20]);

    const planar = planarAverage(loc.potentialEv, loc.grid, 2);
    const wf = workFunctionFromLocpot(planar, 0.7);
    expect(wf.hasFlatPlateau).toBe(true);
    expect(wf.vacuumLevelEv).toBeCloseTo(5.2, 9);
    expect(wf.workFunctionEv).toBeCloseTo(4.5, 9);
    expect(wf.warning).toBeUndefined();

    // Sloped potential (polar slab without dipole correction) triggers warning
    const sloped = Array.from({ length: 20 }, (_, i) => i * 0.5);
    const wfBad = workFunctionFromLocpot(sloped, 0.7);
    expect(wfBad.hasFlatPlateau).toBe(false);
    expect(wfBad.warning).toContain('LDIPOL');
  });
});
