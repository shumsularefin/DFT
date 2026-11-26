// Planar averages against pymatgen VolumetricData.get_average_along_axis (S-034), tolerance 1e-9 (M14.3 work order).
// Golden: tests/reference/volumetric_reference.json made by scripts/reference/gen_volumetric_reference.py.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseChgcar } from '../vasp/chgcar';
import { parseLocpot } from '../vasp/locpot';
import { planarAverage } from './volumetric';

const ref = JSON.parse(readFileSync('tests/reference/volumetric_reference.json', 'utf8')) as {
  files: Record<string, { file: string; grid: number[]; average_along_axis: Record<string, number[]> }>;
};

function values(name: string, text: string): { v: Float64Array; grid: readonly [number, number, number] } {
  if (name.startsWith('LOCPOT')) {
    const l = parseLocpot(text);
    return { v: l.potentialEv, grid: l.grid };
  }
  const c = parseChgcar(text);
  return { v: c.totalRaw, grid: c.grid };
}

describe('planarAverage vs pymatgen get_average_along_axis', () => {
  for (const [name, f] of Object.entries(ref.files)) {
    const { v, grid } = values(name, readFileSync(`tests/reference/${f.file}`, 'utf8'));
    it(`${name}: grid ${f.grid.join('x')}`, () => expect([...grid]).toEqual(f.grid));
    for (const axis of [0, 1, 2] as const) {
      it(`${name}: axis ${axis}`, () => {
        const got = planarAverage(v, grid, axis);
        const want = f.average_along_axis[String(axis)]!;
        expect(got.length).toBe(want.length);
        got.forEach((x, i) =>
          expect(Math.abs(x - want[i]!)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(want[i]!))),
        );
      });
    }
  }
});
