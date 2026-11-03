import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import presets from '../../data/incar-presets.json';
import { writeIncar } from './incar';
import { POTCAR_FIELDS, annotate, mergeAnnotations } from './annotate';

const CU = readFileSync('src/lib/crystal/__fixtures__/cu-fcc.vasp', 'utf8');
const lines = (a: { line: number }[]) => a.map((x) => x.line);

describe('POSCAR annotations', () => {
  it('annotates all 9 lines of the one-atom fcc Cu fixture', () => {
    const a = annotate('POSCAR', CU);
    expect(lines(a)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(a.map((x) => x.label)).toEqual([
      'Comment',
      'Scaling factor',
      'Lattice vector 1',
      'Lattice vector 2',
      'Lattice vector 3',
      'Species names',
      'Atom counts',
      'Direct coordinates',
      'Atom 1 (Cu)',
    ]);
  });
  it('handles the VASP 4 format (no species line), Cartesian and selective dynamics', () => {
    const v4 = annotate('POSCAR', 'x\n1\n1 0 0\n0 1 0\n0 0 1\n2\nCartesian\n0 0 0\n1 1 1\n');
    expect(v4.map((x) => x.label)).toContain('Cartesian coordinates');
    expect(v4.filter((x) => /^Atom \d/.test(x.label))).toHaveLength(2);
    const sd = annotate(
      'POSCAR',
      'x\n1\n1 0 0\n0 1 0\n0 0 1\nSi\n1\nSelective dynamics\nDirect\n0 0 0 T T F\n',
    );
    expect(sd.map((x) => x.label)).toContain('Selective dynamics');
    expect(sd.at(-1)!.intermediate).toMatch(/T or F/);
  });
  it('labels each atom with its species', () => {
    const a = annotate('POSCAR', 'x\n1\n1 0 0\n0 1 0\n0 0 1\nNa Cl\n1 1\nDirect\n0 0 0\n.5 .5 .5\n');
    expect(a.map((x) => x.label).slice(-2)).toEqual(['Atom 1 (Na)', 'Atom 2 (Cl)']);
  });
  it('does not throw on garbage or empty input', () => {
    expect(() => annotate('POSCAR', '')).not.toThrow();
    expect(() => annotate('POSCAR', 'a\nb\nc')).not.toThrow();
  });
});

describe('KPOINTS annotations', () => {
  it('annotates every line of a Gamma mesh file', () => {
    const a = annotate('KPOINTS', 'mesh\n0\nGamma\n8 8 8\n0 0 0\n');
    expect(lines(a)).toEqual([1, 2, 3, 4, 5]);
    expect(a[2]!.label).toBe('Gamma-centred mesh');
  });
  it('tells Monkhorst-Pack from Gamma and omits the shift line when absent', () => {
    const a = annotate('KPOINTS', 'mesh\n0\nMonkhorst-Pack\n4 4 4\n');
    expect(a[2]!.label).toBe('Monkhorst-Pack mesh');
    expect(lines(a)).toEqual([1, 2, 3, 4]);
  });
  it('annotates automatic, explicit and line modes', () => {
    expect(lines(annotate('KPOINTS', 'a\n0\nAuto\n30\n'))).toEqual([1, 2, 3, 4]);
    const ex = annotate('KPOINTS', 'e\n2\nReciprocal\n0 0 0 1\n.5 .5 .5 1\n');
    expect(lines(ex)).toEqual([1, 2, 3, 4, 5]);
    const ln = annotate('KPOINTS', 'l\n20\nLine\nReciprocal\n0 0 0 ! G\n.5 0 0 ! X\n');
    expect(lines(ln)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('INCAR annotations', () => {
  it('annotates every tag of every preset variant', () => {
    for (const p of presets.presets) {
      for (const v of p.variants) {
        const text = writeIncar(v.entries.map((e) => ({ name: e.name, value: e.value })));
        const a = annotate('INCAR', text);
        expect(a.map((x) => x.tag).sort(), `${p.id}/${v.id}`).toEqual(v.entries.map((e) => e.name).sort());
      }
    }
  });
  it('gives a known tag all text levels and marks it known', () => {
    const [a] = annotate('INCAR', 'ENCUT = 520\n');
    expect(a).toMatchObject({ line: 1, tag: 'ENCUT', known: true });
    expect(a!.beginner.length).toBeGreaterThan(10);
    expect(a!.whatIf).toBeTruthy();
  });
  it('flags an unknown tag as not in the database', () => {
    const a = annotate('INCAR', 'ENCUT = 520\nFOOBAR = 1\n');
    expect(a[1]).toMatchObject({ line: 2, tag: 'FOOBAR', known: false });
    expect(a[1]!.label).toMatch(/not in the database/);
  });
  it('reports an unreadable line instead of throwing', () => {
    const a = annotate('INCAR', 'ENCUT = 520\nthis is not valid\n');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ line: 2, known: false });
  });
});

describe('other kinds and helpers', () => {
  it('OSZICAR and OUTCAR excerpts have no defaults before M4.1', () => {
    expect(annotate('OSZICAR', 'N= 1')).toEqual([]);
    expect(annotate('OUTCAR-excerpt', 'x')).toEqual([]);
  });
  it('caller annotations replace defaults on the same line', () => {
    const d = annotate('POSCAR', CU);
    const m = mergeAnnotations(d, [{ line: 1, label: 'Mine', beginner: 'custom' }]);
    expect(m).toHaveLength(9);
    expect(m[0]!.label).toBe('Mine');
  });
  it('POTCAR field list is structure only', () => {
    expect(POTCAR_FIELDS.map((f) => f.name)).toEqual([
      'TITEL',
      'POMASS',
      'ZVAL',
      'RWIGS',
      'ENMAX',
      'ENMIN',
      'LEXCH',
    ]);
    for (const f of POTCAR_FIELDS) expect(f.meaning).not.toMatch(/\d\.\d{3,}/);
  });
});
