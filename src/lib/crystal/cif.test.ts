import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadMoyoNode } from './moyo-node';
import { analyzeWith, type MoyoApi } from './symmetry';
import { parseCif, parseSymop, writeCif } from './cif';
import { ParseError } from './errors';
import { cellVolume, latticeParameters } from './lattice';

const dir = join(__dirname, '../../../tests/reference/cif');
const read = (f: string) => readFileSync(join(dir, f), 'utf8');
const expected = JSON.parse(read('expected.json')).files as Record<
  string,
  {
    accept: boolean;
    n_blocks?: number;
    n_atoms_input_cell: number;
    lattice_abc: number[];
    lattice_angles: number[];
    volume: number;
    spacegroup_number: number;
  }
>;

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

const regular = Object.entries(expected).filter(
  ([k, v]) => v.accept && v.n_blocks === undefined && !k.startsWith('edge_'),
);

describe('golden CIF files', () => {
  it.each(regular)('%s: atoms, cell and space group', (file, e) => {
    const blocks = parseCif(read(file));
    expect(blocks).toHaveLength(1);
    const s = blocks[0]!.structure;
    expect(s.species).toHaveLength(e.n_atoms_input_cell);
    const p = latticeParameters(s.lattice);
    [p.a, p.b, p.c].forEach((x, i) => expect(Math.abs(x - e.lattice_abc[i]!)).toBeLessThan(1e-4));
    expect(Math.abs(cellVolume(s.lattice) - e.volume)).toBeLessThan(1e-3);
    // Q-036: the symmetrized triclinic file stores the equivalent cell 82/85/79 where expected.json lists 82/95/101
    // (same volume, same space group). Every other file matches the listed angles.
    if (file !== 'triclinic_P1bar.sym.cif')
      [p.alpha, p.beta, p.gamma].forEach((x, i) =>
        expect(Math.abs(x - e.lattice_angles[i]!)).toBeLessThan(1e-4),
      );
    expect(analyzeWith(api, s, { symprec: 1e-3 }).number).toBe(e.spacegroup_number);
  });

  it('the symmetrized and P1 files of a pair give the same structure', () => {
    const a = parseCif(read('pnma_perovskite_like.sym.cif'))[0]!.structure;
    const b = parseCif(read('pnma_perovskite_like.p1.cif'))[0]!.structure;
    expect(a.species.length).toBe(b.species.length);
    const key = (s: typeof a) =>
      s.frac
        .map(
          (f, i) => `${s.species[i]} ${f.map((x) => (Math.round(x * 1e4) / 1e4 + 0).toFixed(3)).join(' ')}`,
        )
        .sort();
    expect(key(a)).toEqual(key(b));
  });
});

describe('edge cases', () => {
  it('reads uncertainties as plain numbers', () => {
    const b = parseCif(read('edge_uncertainties.cif'))[0]!;
    expect(latticeParameters(b.structure.lattice).a).toBeCloseTo(5.64, 8);
    expect(b.structure.species).toHaveLength(8);
  });
  it('accepts the alternate symmetry tag', () => {
    expect(parseCif(read('edge_alternate_symop_tag.cif'))[0]!.structure.species).toHaveLength(8);
  });
  it('rejects partial occupancy with a reason', () => {
    expect(() => parseCif(read('edge_partial_occupancy.cif'))).toThrow(
      /occupancy 0\.5.*disordered.*ordered/s,
    );
  });
  it('returns one result per data block', () => {
    const blocks = parseCif(read('edge_two_blocks.cif'));
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.structure.species.length)).toEqual([8, 2]);
    expect(blocks.map((b) => b.spaceGroupNumber)).toEqual([225, 194]);
  });
});

describe('symmetry operation text', () => {
  it('parses signs, fractions and decimals', () => {
    const o = parseSymop('-x+y, x, 1/2+z');
    expect(o.rotation).toEqual([
      [-1, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ]);
    expect(o.translation).toEqual([0, 0, 0.5]);
    expect(parseSymop('x,-y+0.25,z-1/4').translation).toEqual([0, 0.25, -0.25]);
  });
  it('rejects garbage', () => {
    expect(() => parseSymop('x, y')).toThrow(ParseError);
    expect(() => parseSymop('x, y, q')).toThrow(ParseError);
    expect(() => parseSymop('x, y, z/0')).toThrow(ParseError);
  });
});

const MIN = `data_t
_cell_length_a 4
_cell_length_b 4
_cell_length_c 4
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
`;

describe('tokenizer and malformed input', () => {
  it('reads a minimal P1 file and handles comments, quotes and text fields', () => {
    const b = parseCif(`# hi\n${MIN}Fe 0 0 0 # iron\n"O" 0.5 0.5 0.5\n`)[0]!;
    expect(b.structure.species).toEqual(['Fe', 'O']);
    expect(b.warnings[0]).toMatch(/P1/);
    const t = parseCif(
      `data_x\n_publ_section_title\n;\nsome text\n;\n${MIN.split('\n').slice(1).join('\n')}C 0 0 0\n`,
    );
    expect(t[0]!.structure.species).toEqual(['C']);
  });
  it('strips charges from type symbols and falls back to the label', () => {
    const b = parseCif(
      `${MIN.replace('_atom_site_type_symbol', '_atom_site_label')}Fe2+ 0 0 0\nO1 0.5 0.5 0.5\n`,
    )[0]!;
    expect(b.structure.species).toEqual(['Fe', 'O']);
  });
  it('merges duplicate positions produced by symmetry', () => {
    const t = `${MIN.replace('loop_\n', "loop_\n_symmetry_equiv_pos_as_xyz\n'x,y,z'\n'-x,-y,-z'\nloop_\n")}Si 0 0 0\n`;
    expect(parseCif(t)[0]!.structure.species).toHaveLength(1);
  });
  const bad: [string, string, RegExp, number | undefined][] = [
    ['empty', '', /data_/, 1],
    ['not CIF', 'hello world', /data_/, 1],
    ['unterminated quote', `${MIN}Fe 0 0 0\n_x 'abc\n`, /never closed/, 14],
    ['unterminated text field', `data_a\n_x\n;\nabc\n`, /never closed/, 3],
    ['loop value missing', `${MIN}Fe 0 0\n`, /value is missing/, 13],
    ['no cell', 'data_a\n_cell_length_a 4\n', /_cell_length_b/, undefined],
    [
      'bad number',
      MIN.replace('_cell_length_a 4', '_cell_length_a abc') + 'Fe 0 0 0\n',
      /expected a number/,
      2,
    ],
    ['unknown element', `${MIN}Xx 0 0 0\n`, /not a known element/, 13],
    ['no atoms', MIN.split('loop_')[0]!, /fractional atom positions/, undefined],
    [
      'bad angle',
      MIN.replace('_cell_angle_beta 90', '_cell_angle_beta 200') + 'Fe 0 0 0\n',
      /angles/,
      undefined,
    ],
  ];
  it.each(bad)('%s raises ParseError', (_n, text, re, line) => {
    let err: unknown;
    try {
      parseCif(text);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ParseError);
    expect((err as ParseError).message).toMatch(re);
    if (line !== undefined) expect((err as ParseError).line).toBe(line);
  });

  it('never throws anything but ParseError on truncated real files', () => {
    const text = read('hcp_Mg.sym.cif');
    for (let n = 0; n < text.length; n += 37) {
      try {
        parseCif(text.slice(0, n));
      } catch (e) {
        expect(e).toBeInstanceOf(ParseError);
      }
    }
  });
});

describe('writeCif', () => {
  it('round-trips through parseCif', () => {
    const s = parseCif(read('pnma_perovskite_like.sym.cif'))[0]!.structure;
    const out = writeCif(s, { name: 'my struct', symmetry: { number: 62, hmSymbol: 'Pnma' } });
    expect(out).toMatch(/^# detected space group Pnma/m);
    const back = parseCif(out)[0]!;
    expect(back.spaceGroupNumber).toBe(1);
    expect(back.structure.species).toEqual(s.species);
    back.structure.frac.forEach((f, i) =>
      f.forEach((x, k) => {
        const d = x - s.frac[i]![k]!;
        expect(Math.abs(d - Math.round(d))).toBeLessThan(1e-7);
      }),
    );
    const p = latticeParameters(back.structure.lattice);
    const q = latticeParameters(s.lattice);
    expect(p.a).toBeCloseTo(q.a, 6);
    expect(p.gamma).toBeCloseTo(q.gamma, 6);
  });
});
