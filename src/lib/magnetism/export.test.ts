import { describe, expect, it } from 'vitest';
import golden from '../../../tests/reference/magnetic_reference.json';
import kpaths from '../../../tests/reference/kpaths.json';
import { symbolOf } from '../crystal/elements';
import { parsePoscar } from '../crystal/poscar';
import type { Mat3, Structure, Vec3 } from '../crystal/types';
import { parseIncar } from '../vasp/incar';
import { zipProject } from '../vasp/series';
import { strFromU8, unzipSync } from 'fflate';
import { buildFiles, buildOutputs, checkLdau, ldauEntries, readme, whyThisCell } from './export';
import { commonSupercell, namedOrdering, customOrdering } from './orderings';
import { determinant } from '../crystal/supercell';
import { MagneticError } from './sublattice';

type Input = { lattice_rows: number[][]; frac_coords: number[][]; atomic_numbers: number[] };
const fixture = (name: string): Structure => {
  const d = (kpaths.structures as unknown as Record<string, { input: Input }>)[name]!.input;
  return {
    lattice: d.lattice_rows as unknown as Mat3,
    frac: d.frac_coords as unknown as Vec3[],
    species: d.atomic_numbers.map((z) => symbolOf(z)!),
  };
};
const sto = fixture('cubic_perovskite_SrTiO3');
const gold = golden.orderings.cubic_perovskite_SrTiO3;
const KINDS = ['FM', 'A', 'C', 'G'] as const;
const opts = { magnitudes: { [gold.magnetic_element]: 2 } };
const el = gold.magnetic_element;

describe('common cell export', () => {
  const { matrix, configurations } = commonSupercell(
    sto,
    KINDS.map((kind) => ({ kind })),
    { elements: [el] },
  );
  const outs = buildOutputs(configurations, opts);
  it('has the golden determinant and one folder per ordering', () => {
    expect(determinant(matrix)).toBe(golden.common_supercell.cubic_perovskite_SrTiO3.det);
    expect(outs.map((o) => o.folder)).toEqual([...KINDS]);
  });
  it('gives every POSCAR the same lattice and atom order', () => {
    const polys = outs.map((o) => parsePoscar(o.result.poscar).structure);
    for (const p of polys) {
      expect(p.lattice).toEqual(polys[0]!.lattice);
      expect(p.species).toEqual(polys[0]!.species);
    }
    expect(polys[0]!.species.length).toBe(
      sto.species.length * golden.common_supercell.cubic_perovskite_SrTiO3.det,
    );
  });
  it('passes the M3.4 MAGMOM rules with no issues', () => {
    for (const o of outs) expect(o.issues).toEqual([]);
  });
  it('writes ISPIN, MAGMOM and LORBIT', () => {
    const names = parseIncar(outs[0]!.incarText).entries.map((e) => e.name);
    expect(names).toEqual(['ISPIN', 'MAGMOM', 'LORBIT']);
  });
  it('zips to folders, README and make_potcar.sh without POTCAR content', () => {
    const files = buildFiles(outs, opts);
    const z = unzipSync(zipProject(files));
    expect(Object.keys(z).sort()).toEqual(
      [
        'A/INCAR',
        'A/POSCAR',
        'C/INCAR',
        'C/POSCAR',
        'FM/INCAR',
        'FM/POSCAR',
        'G/INCAR',
        'G/POSCAR',
        'README.md',
        'make_potcar.sh',
      ].sort(),
    );
    expect(strFromU8(z['README.md']!)).toMatch(/same cell and the same atom order/);
    expect(strFromU8(z['README.md']!)).toMatch(/only seed the calculation/);
  });
});

describe('smallest cell per ordering', () => {
  it('G gives the golden minimal cell and the README warns about k-meshes', () => {
    const g = namedOrdering(sto, { kind: 'G' }, { elements: [el] });
    expect(g.structure.frac.length).toBe(gold.cases.G.minimal_cell.n_atoms);
    const a = namedOrdering(sto, { kind: 'A' }, { elements: [el] });
    const outs = buildOutputs([g, a], opts);
    expect(readme(outs, { ...opts, separateCells: true })).toMatch(/separate convergence/);
  });
});

describe('DFT+U and errors', () => {
  const c = namedOrdering(sto, { kind: 'G' }, { elements: [el] });
  it('writes LDAU tags in POSCAR species order from user values only', () => {
    const outs = buildOutputs([c], { ...opts, ldau: { [el]: { l: 2, u: 3, j: 0.5 } } });
    const e = parseIncar(outs[0]!.incarText).entries;
    const labels = outs[0]!.result.structure.species.filter((s, i, a) => i === 0 || s !== a[i - 1]);
    expect(e.find((x) => x.name === 'LDAUU')!.value.split(' ').length).toBe(labels.length);
    expect(e.find((x) => x.name === 'LDAUU')!.value).toBe(
      labels.map((l) => (l === el ? '3' : '0')).join(' '),
    );
    expect(outs[0]!.issues).toEqual([]);
    expect(ldauEntries(c.structure, {}).length).toBeGreaterThan(0);
  });
  it('checks bad U values and a missing magnitude', () => {
    expect(checkLdau({ Ti: { l: 1, u: -1, j: 0 } }).length).toBe(2);
    expect(() => buildOutputs([c], { magnitudes: {} })).toThrow(MagneticError);
  });
  it('explains the cell in plain words', () => {
    expect(whyThisCell(c, 2, false, 1)).toMatch(/up and one down/);
    expect(whyThisCell(customOrdering(sto, [0, 1, 0, 0, 0]), 1, false, 1)).toMatch(/Custom/);
  });
});
