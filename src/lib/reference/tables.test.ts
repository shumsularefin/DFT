import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_RULES } from '../vasp/rules';
import { CHECKLIST, READ_ROWS, UNIT_ROWS, formatValue, kspacingFromVaspkitResolution } from './tables';

// Reference digits as printed in the S-042 units table.
const S042: [string, number, number][] = [
  ['1 kBar (OUTCAR stress, Cij)', 0, 0.1],
  ['1 eV/Å³', 0, 160.2177],
  ['1 THz', 0, 33.356],
  ['1 THz', 1, 4.1357],
  ['1 cm⁻¹', 0, 0.12398],
  ['1 Ry', 0, 13.6057],
  ['1 Hartree', 0, 27.2114],
  ['1 eV/atom', 0, 96.485],
  ['1 eV/Å', 0, 1.602],
  ['Boltzmann constant kB', 0, 8.617e-5],
];

function digits(x: number): number {
  const s = x.toExponential().split('e')[0]!.replace('-', '').replace('.', '');
  return s.length;
}

describe('UNIT_ROWS (S-042)', () => {
  it.each(S042)('%s [%i] matches the printed value %f to its last digit', (from, i, ref) => {
    const row = UNIT_ROWS.find((r) => r.from === from);
    const v = row!.to[i]!.value;
    expect(Number(v.toPrecision(digits(ref)))).toBeCloseTo(ref, 12);
  });
  it('has the nine S-042 rows', () => {
    expect(UNIT_ROWS).toHaveLength(9);
  });
  it('formatValue keeps six significant figures', () => {
    expect(formatValue(160.21766)).toBe('160.218');
    expect(formatValue(8.617333e-5)).toBe('8.61733 × 10^-5');
  });
});

describe('kspacingFromVaspkitResolution (S-042: KSPACING = 2π r)', () => {
  it('converts a resolution', () => {
    expect(kspacingFromVaspkitResolution(0.03)).toBeCloseTo(0.18849556, 8);
  });
  it('rejects zero and negative input', () => {
    expect(() => kspacingFromVaspkitResolution(0)).toThrow(RangeError);
    expect(() => kspacingFromVaspkitResolution(-1)).toThrow(RangeError);
  });
});

describe('CHECKLIST', () => {
  const ids = new Set(ALL_RULES.map((r) => r.id));
  it('has the 11 rows S-042 prints', () => {
    expect(CHECKLIST.map((r) => r.calculation)).toEqual([
      'Relax',
      'SCF',
      'DOS',
      'Bands',
      'Optics',
      'Elastic',
      'Phonon',
      'Dielectric / Z*',
      'Bader',
      'DFT+U',
      'Hybrid',
    ]);
  });
  it('every rule id exists in ALL_RULES', () => {
    const used = CHECKLIST.flatMap((r) => [...r.must, ...r.mustNot]).flatMap((i) => i.rules ?? []);
    expect(used.length).toBeGreaterThan(10);
    for (const id of used) expect(ids.has(id), id).toBe(true);
  });
});

describe('READ_ROWS', () => {
  it('every parser function is exported from its file and the field is named there', () => {
    for (const r of READ_ROWS) {
      if (!r.parser) continue;
      const src = readFileSync(r.parser.file, 'utf8');
      expect(src, r.parser.fn).toMatch(new RegExp(`export function ${r.parser.fn}\\b`));
      expect(src, r.parser.field).toMatch(new RegExp(`\\b${r.parser.field}\\b`));
    }
  });
  it('covers all 14 S-041 rows and all 9 S-042 rows', () => {
    expect(READ_ROWS.filter((r) => r.sources.includes('S-041'))).toHaveLength(14);
    expect(READ_ROWS.filter((r) => r.sources.includes('S-042'))).toHaveLength(9);
  });
});
