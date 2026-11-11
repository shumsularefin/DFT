import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { parseChgcar, electronCount, maxDensity, gridIndex } from './chgcar';
import { parseEigenval } from './eigenval';
import { parseXdatcar } from './xdatcar';
import { parseDoscar } from './doscar';
import { bandGap } from './bandGap';
import { ParseError } from '../crystal/errors';

// Golden values are read from tests/reference/vasp-outputs/expected.json (made by scripts/reference/gen_vasp_output_fixtures.py).
// The fixtures are SYNTHETIC: parser tests only, never shown as results.
const DIR = 'tests/reference/vasp-outputs/';
const read = (f: string) => fs.readFileSync(DIR + f, 'utf8');
const expected = JSON.parse(read('expected.json'));
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300);

describe.each(['CHGCAR', 'CHGCAR_spin'])('%s (@source S-019, S-041)', (name) => {
  const ex = expected[name];
  const c = parseChgcar(read(name));
  it('grid 20 x 20 x 24 and the cell volume', () => {
    expect(c.grid).toEqual(ex.grid);
    expect(c.grid).toEqual([20, 20, 24]);
    expect(c.volume).toBeCloseTo(ex.cell_volume_A3, 9);
    expect(c.data.length).toBe(20 * 20 * 24);
  });
  it('the five sample values at their indices (raw rho*V, 1e-9 relative; the non-cubic grid catches axis-order mistakes)', () => {
    for (const [key, want] of Object.entries(ex.samples_raw_rho_times_V) as [string, number][]) {
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      expect(rel(c.data[gridIndex(c.grid, x, y, z)]!, want), key).toBeLessThan(1e-9);
    }
  });
  it('electrons = sum / N_grid and the maximum density', () => {
    expect(Math.abs(electronCount(c.data) - ex.electrons_from_grid_sum_over_N)).toBeLessThan(1e-6);
    expect(Math.abs(electronCount(c.data) - 1.99995)).toBeLessThan(1e-5);
    expect(Math.abs(maxDensity(c) - ex.max_density_e_per_A3)).toBeLessThan(1e-9);
  });
});

describe('CHGCAR magnetization', () => {
  it('the spin file has a second grid whose integral is 0.99997; the plain file has none', () => {
    const s = parseChgcar(read('CHGCAR_spin'));
    expect(s.magnetization).toBeDefined();
    expect(
      Math.abs(electronCount(s.magnetization!) - expected.CHGCAR_spin.magnetization_from_grid_sum_over_N),
    ).toBeLessThan(1e-6);
    expect(Math.abs(electronCount(s.magnetization!) - 0.99997)).toBeLessThan(1e-5);
    expect(parseChgcar(read('CHGCAR')).magnetization).toBeUndefined();
  });
  it('skips an augmentation block between the grids and reports progress', () => {
    const t = read('CHGCAR_spin');
    const i = t.indexOf('\n   20   20   24\n', t.indexOf('\n   20   20   24\n') + 5);
    const aug =
      '\naugmentation occupancies   1   4\n  0.1000000E+01  0.2000000E+00  0.3000000E+00  0.4000000E+00\n';
    const calls: number[] = [];
    const s = parseChgcar(t.slice(0, i) + aug + t.slice(i + 1), (f) => calls.push(f));
    expect(s.magnetization).toBeDefined();
    expect(Math.abs(electronCount(s.magnetization!) - 0.99997)).toBeLessThan(1e-5);
    expect(calls.at(-1)).toBe(1);
    expect(calls.every((f, k) => k === 0 || f >= calls[k - 1]!)).toBe(true);
  });
  it('rejects a truncated file with a ParseError', () => {
    const t = read('CHGCAR');
    expect(() => parseChgcar(t.slice(0, t.length / 2))).toThrow(ParseError);
    expect(() => parseChgcar('not a chgcar')).toThrow(ParseError);
  });
});

describe.each(['EIGENVAL_ispin1', 'EIGENVAL_ispin2'])('%s equals the pymatgen reading', (name) => {
  const ex = expected[name];
  const e = parseEigenval(read(name));
  it('header, k-points and weights', () => {
    expect(e.ispin).toBe(ex.ispin);
    expect(e.nkpt).toBe(ex.nkpt);
    expect(e.nbands).toBe(ex.nbands);
    expect(e.kpoints).toEqual(ex.kpoints);
    expect(e.weights).toEqual(ex.kpoint_weights);
  });
  it('energies and occupations per spin', () => {
    for (const [spin, want] of Object.entries(ex.eigenvalues_and_occupations_by_spin) as [
      string,
      number[][][],
    ][]) {
      const got = e.bands[spin === '1' ? 0 : 1]!;
      want.forEach((kb, k) =>
        kb.forEach(([en, occ], b) => {
          expect(got[k]![b]!.e).toBeCloseTo(en!, 9);
          expect(got[k]![b]!.occ).toBeCloseTo(occ!, 9);
        }),
      );
    }
  });
});

describe('XDATCAR', () => {
  const ex = expected.XDATCAR;
  const x = parseXdatcar(read('XDATCAR'));
  it('three frames with the listed fractional coordinates', () => {
    expect(x.frames.length).toBe(ex.n_frames);
    expect(x.frames).toEqual(ex.frac_coords);
    expect(x.species).toEqual(ex.species);
    expect(x.lattices[0]![0]![0]).toBeCloseTo(5.43, 9);
  });
  it('variable-cell files repeat the header before each frame', () => {
    const head = (a: string) =>
      ['Si', '1.0', `${a} 0 0`, `0 ${a} 0`, `0 0 ${a}`, 'Si', '1', ''].join('\n').replace(/\n$/, '');
    const t = [
      head('5.43'),
      'Direct configuration= 1',
      '0 0 0',
      head('5.5'),
      'Direct configuration= 2',
      '0 0 0.01',
    ].join('\n');
    const v = parseXdatcar(t);
    expect(v.frames).toEqual([[[0, 0, 0]], [[0, 0, 0.01]]]);
    expect(v.lattices[0]![0]![0]).toBeCloseTo(5.43, 9);
    expect(v.lattices[1]![0]![0]).toBeCloseTo(5.5, 9);
  });
  it('VASP 4 files (no symbols line) are refused with a line number', () => {
    const t = read('XDATCAR').split('\n');
    t.splice(5, 1);
    expect(() => parseXdatcar(t.join('\n'))).toThrow(ParseError);
  });
});

describe('DOSCAR (fixture not independently validated, Q-008)', () => {
  const ex = expected.DOSCAR_ispin2_lorbit11;
  const d = parseDoscar(read('DOSCAR_ispin2_lorbit11'));
  it('header and energy axis', () => {
    expect([d.nions, d.nedos, d.ispin, d.lorbit]).toEqual([ex.nions, ex.nedos, ex.ispin, ex.lorbit]);
    expect(d.efermi).toBe(ex.efermi);
    expect(Array.from(d.energies)).toEqual(ex.energies);
  });
  it('total and projected arrays equal the expected ones', () => {
    expect(Array.from(d.totalUp)).toEqual(ex.total_up);
    expect(Array.from(d.totalDown!)).toEqual(ex.total_down);
    expect(d.ions[0]!.orbitals).toEqual(ex.orbital_order);
    expect(Array.from(d.ions[0]!.up[0]!)).toEqual(ex.ion1_s_up);
    const dx2 = ex.orbital_order.indexOf('dx2');
    expect(Array.from(d.ions[1]!.down![dx2]!)).toEqual(ex.ion2_dx2_down);
  });
  it('ISPIN 1 with LORBIT 10 layout', () => {
    const t = [
      '1 1 1 1',
      '0.1E+02 0.1E-09 0.1E-09 0.1E-09 0.5E-15',
      '1.0E-04',
      'CAR',
      'x',
      '1.0 -1.0 2 0.0 1.0',
      '-1.0 0.5 0.25',
      ' 1.0 0.6 0.30',
      '1.0 -1.0 2 0.0 1.0',
      '-1.0 0.1 0.2 0.3',
      ' 1.0 0.4 0.5 0.6',
    ].join('\n');
    const r = parseDoscar(t);
    expect(r.lorbit).toBe(10);
    expect(r.ions[0]!.orbitals).toEqual(['s', 'p', 'd']);
    expect(Array.from(r.ions[0]!.up[2]!)).toEqual([0.3, 0.6]);
  });
  it('rejects an unknown column count', () => {
    const t = [
      '1 1 1 1',
      '1 1 1 1 1',
      '1E-4',
      'CAR',
      'x',
      '1 -1 1 0 1',
      '0 0.5 0.25',
      '1 -1 1 0 1',
      '0 0.1 0.2 0.3 0.4',
    ].join('\n');
    expect(() => parseDoscar(t)).toThrow(ParseError);
  });
});

describe('band gap (hand-made bands)', () => {
  // k-points: Gamma, X. Two bands, one occupied.
  const k = [
    [0, 0, 0],
    [0.5, 0, 0],
  ] as [number, number, number][];
  const mk = (v: number[][], o: number[][]) => [v.map((kb, i) => kb.map((e, b) => ({ e, occ: o[i]![b]! })))];
  it('VBM at Gamma and CBM at X is an indirect gap', () => {
    const r = bandGap(
      mk(
        [
          [-1, 2],
          [-3, 1.5],
        ],
        [
          [1, 0],
          [1, 0],
        ],
      ),
      k,
    );
    expect(r.metallic).toBe(false);
    expect(r.vbm).toMatchObject({ e: -1, k: 0, band: 0 });
    expect(r.cbm).toMatchObject({ e: 1.5, k: 1, band: 1 });
    expect(r.gap).toBeCloseTo(2.5, 12);
    expect(r.direct).toBe(false);
    expect(r.directGap).toBeCloseTo(3, 12); // at Gamma: 2 - (-1) = 3; at X: 1.5 - (-3) = 4.5
  });
  it('both at Gamma is direct', () => {
    const r = bandGap(
      mk(
        [
          [-1, 0.5],
          [-3, 2],
        ],
        [
          [1, 0],
          [1, 0],
        ],
      ),
      k,
    );
    expect(r.direct).toBe(true);
    expect(r.gap).toBeCloseTo(1.5, 12);
    expect(r.directGap).toBeCloseTo(1.5, 12);
  });
  it('a band with occupied and empty states is metallic with gap 0', () => {
    const r = bandGap(
      mk(
        [
          [-1, 2],
          [0.3, 1],
        ],
        [
          [1, 0],
          [0, 0],
        ],
      ),
      k,
    );
    expect(r.metallic).toBe(true);
    expect(r.gap).toBe(0);
  });
  it('uses the spin channel that sets each edge', () => {
    const r = bandGap(
      [
        [
          [
            { e: -1, occ: 1 },
            { e: 2, occ: 0 },
          ],
        ],
        [
          [
            { e: -0.5, occ: 1 },
            { e: 1, occ: 0 },
          ],
        ],
      ],
      [[0, 0, 0]],
    );
    expect(r.vbm.spin).toBe(1);
    expect(r.cbm.spin).toBe(1);
    expect(r.gap).toBeCloseTo(1.5, 12);
  });
  it('real EIGENVAL fixture: occupations decide', () => {
    const e = parseEigenval(read('EIGENVAL_ispin2'));
    const r = bandGap(e.bands, e.kpoints);
    expect(r.vbm.e).toBeCloseTo(-0.251037, 6);
    expect(r.cbm.e).toBeCloseTo(0.048963, 6);
  });
});
