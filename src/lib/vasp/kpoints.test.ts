import { describe, expect, it } from 'vitest';
import bz from '../../../tests/reference/bz_geometry.json';
import kref from '../../../tests/reference/pw_kmesh_reference.json';
import { ParseError } from '../crystal/errors';
import { fromParameters } from '../crystal/lattice';
import type { Mat3, Structure } from '../crystal/types';
import {
  gammaCoords,
  kpointCount,
  meshFromKspacing,
  meshFromLength,
  meshFromResolution,
  meshSymmetryRisk,
  monkhorstPackCoords,
  parseKpoints,
  recommendCentering,
  reciprocalLengths,
  writeAutoKpoints,
  writeExplicitKpoints,
  writeGammaOnly,
  writeLineMode,
  writeMeshKpoints,
  type RoundingRule,
} from './kpoints';

const FCC_CU: Mat3 = [
  [0, 1.805, 1.805],
  [1.805, 0, 1.805],
  [1.805, 1.805, 0],
];
const cells: Record<string, Mat3> = {
  'fcc_Cu_a3.61_primitive': FCC_CU,
  'hex_a3.0_c5.0': fromParameters(3, 3, 5, 90, 90, 120),
  'Si_a5.43_primitive': [
    [0, 2.715, 2.715],
    [2.715, 0, 2.715],
    [2.715, 2.715, 0],
  ],
};
const rowsOf = (name: string) =>
  (bz.lattices as Record<string, { direct_lattice_rows: number[][] }>)[name]!
    .direct_lattice_rows as unknown as Mat3;
const struct = (lattice: Mat3): Structure => ({ lattice, species: ['X'], frac: [[0, 0, 0]] });

describe('mesh coordinates versus golden (N = 1..6)', () => {
  for (const [k, v] of Object.entries(kref.mp_and_gamma_coordinates)) {
    it(`N = ${k}`, () => {
      const N = Number(k);
      monkhorstPackCoords(N).forEach((x, i) =>
        expect(Math.abs(x - v.monkhorst_pack[i]!)).toBeLessThan(1e-11),
      );
      gammaCoords(N).forEach((x, i) => expect(Math.abs(x - v.gamma_centred[i]!)).toBeLessThan(1e-11));
    });
  }
});

describe('KSPACING versus golden for all three rules', () => {
  const rules: [RoundingRule, 'mesh_rule_ceil' | 'mesh_rule_round_half_up' | 'mesh_rule_int_plus_0p999'][] = [
    ['ceil', 'mesh_rule_ceil'],
    ['round', 'mesh_rule_round_half_up'],
    ['plus0.999', 'mesh_rule_int_plus_0p999'],
  ];
  it('has 18 candidates over 3 cells', () => expect(kref.kspacing_candidates).toHaveLength(18));
  kref.kspacing_candidates.forEach((c, i) => {
    it(`#${i} ${c.cell} KSPACING ${c.kspacing}`, () => {
      const m = cells[c.cell]!;
      reciprocalLengths(m).forEach((b, j) =>
        expect(Math.abs(b - c.reciprocal_lengths_with_2pi[j]!)).toBeLessThan(1e-9),
      );
      for (const [rule, key] of rules) {
        const r = meshFromKspacing(m, c.kspacing, rule);
        expect([...r.mesh]).toEqual(c[key]);
        expect(r.rule).toBe(rule);
        // resolution is spacing / (2 pi)
        expect([...meshFromResolution(m, c.kspacing / (2 * Math.PI), rule).mesh]).toEqual(c[key]);
      }
    });
  });
  it('documented rule (ceil, S-019 KSPACING page, S-058 VASPKIT 102) and the comparison cases: fcc Cu primitive', () => {
    const get = (k: number) =>
      kref.kspacing_candidates.find((c) => c.cell.startsWith('fcc') && c.kspacing === k)!;
    expect(get(0.3).mesh_rule_ceil).toEqual([11, 11, 11]);
    expect(get(0.3).mesh_rule_round_half_up).toEqual([10, 10, 10]);
    expect(meshFromKspacing(FCC_CU, 0.3, 'round').mesh).toEqual([10, 10, 10]);
    expect(meshFromKspacing(FCC_CU, 0.30145, 'plus0.999').mesh).toEqual([10, 10, 10]);
    expect(meshFromKspacing(FCC_CU, 0.3).mesh).toEqual([11, 11, 11]);
  });
  it('default rule is ceil and is reported', () => {
    expect(meshFromKspacing(FCC_CU, 0.3).rule).toBe('ceil');
  });
  it('a tiny reciprocal vector gives at least 1', () => {
    const big: Mat3 = [
      [100, 0, 0],
      [0, 100, 0],
      [0, 0, 100],
    ];
    for (const r of ['ceil', 'round', 'plus0.999'] as const)
      expect(meshFromKspacing(big, 5, r).mesh).toEqual([1, 1, 1]);
  });
  it('bad input throws', () => {
    expect(() => meshFromKspacing(FCC_CU, 0)).toThrow(RangeError);
    expect(() => meshFromResolution(FCC_CU, -1)).toThrow(RangeError);
    expect(() => meshFromLength(FCC_CU, 0)).toThrow(RangeError);
  });
});

describe('Auto length mode (S-019 KPOINTS page: N = int(max(1, R_k |b| + 0.5)), |b| without 2 pi)', () => {
  it('fcc Cu primitive, |b| = 0.47979 1/A: R_k 20 -> int(10.096) = 10', () => {
    expect(meshFromLength(FCC_CU, 20)).toEqual([10, 10, 10]);
  });
  it('rounds half up: R_k 30 -> int(14.89) = 14, R_k 32 -> int(15.85) = 15', () => {
    expect(meshFromLength(FCC_CU, 30)).toEqual([14, 14, 14]);
    expect(meshFromLength(FCC_CU, 32)).toEqual([15, 15, 15]);
  });
  it('never below 1', () => {
    expect(meshFromLength(FCC_CU, 0.1)).toEqual([1, 1, 1]);
  });
});

describe('meshSymmetryRisk reproduces the golden mesh_point_group_symmetry', () => {
  const lat: Record<string, Mat3> = {
    'hcp_Mg_P6_3/mmc': fromParameters(3.21, 3.21, 5.21, 90, 90, 120),
    fcc_Cu_primitive: FCC_CU,
    'sc_a4.0': [
      [4, 0, 0],
      [0, 4, 0],
      [0, 0, 4],
    ],
    bcc_Fe_primitive: rowsOf('bcc_primitive'),
  };
  kref.mesh_point_group_symmetry.forEach((e, i) => {
    it(`#${i} ${e.system} n=${e.n}`, () => {
      expect(meshSymmetryRisk(lat[e.system]!, 'monkhorst-pack', e.n)).toBe(!e.monkhorst_pack_symmetric);
      expect(meshSymmetryRisk(lat[e.system]!, 'gamma', e.n)).toBe(false);
    });
  });
});

describe('recommendCentering', () => {
  for (const n of ['hex_ideal', 'hex_tall', 'fcc_primitive', 'rhombohedral']) {
    it(`${n} -> gamma`, () => expect(recommendCentering(struct(rowsOf(n))).centering).toBe('gamma'));
  }
  for (const n of ['sc', 'tetragonal', 'orthorhombic']) {
    it(`${n} -> either`, () => expect(recommendCentering(struct(rowsOf(n))).centering).toBe('either'));
  }
  it('reasons: measured claim only for hexagonal and fcc primitive', () => {
    expect(recommendCentering(struct(rowsOf('hex_ideal'))).reason).toContain('S-019');
    expect(recommendCentering(struct(rowsOf('hex_ideal'))).reason).toContain('Measured');
    expect(recommendCentering(struct(rowsOf('fcc_primitive'))).reason).toContain('Measured');
    const rh = recommendCentering(struct(rowsOf('rhombohedral'))).reason;
    expect(rh).toContain('S-042');
    expect(rh).toContain('not measured');
    expect(rh).not.toContain('Measured');
  });
});

describe('writers (hand-written snapshots of the VASP format)', () => {
  it('Gamma 4 4 4', () => {
    expect(writeMeshKpoints([4, 4, 4])).toBe('Automatic mesh\n0\nGamma\n 4 4 4\n 0 0 0\n');
  });
  it('Monkhorst-Pack with a shift', () => {
    expect(writeMeshKpoints([6, 6, 2], 'monkhorst-pack', [0.5, 0.5, 0], 'MP')).toBe(
      'MP\n0\nMonkhorst-Pack\n 6 6 2\n 0.5 0.5 0\n',
    );
  });
  it('Gamma only', () => expect(writeGammaOnly()).toBe('Gamma point only\n0\nGamma\n 1 1 1\n 0 0 0\n'));
  it('Auto', () => expect(writeAutoKpoints(20)).toBe('Fully automatic mesh\n0\nAuto\n 20\n'));
  it('explicit list', () => {
    expect(
      writeExplicitKpoints(
        [
          { k: [0, 0, 0], weight: 1 },
          { k: [0.5, 0, 0], weight: 3 },
        ],
        'cartesian',
        'two',
      ),
    ).toBe('two\n2\nCartesian\n 0 0 0 1\n 0.5 0 0 3\n');
  });
  it('line mode with labels', () => {
    const t = writeLineMode(
      [
        { from: [0, 0, 0], to: [0.5, 0, 0], fromLabel: 'G', toLabel: 'X' },
        { from: [0.5, 0, 0], to: [0.5, 0.5, 0], fromLabel: 'X', toLabel: 'M' },
      ],
      20,
    );
    expect(t).toBe(
      'k-path\n20\nLine-mode\nReciprocal\n0 0 0 ! G\n0.5 0 0 ! X\n\n0.5 0 0 ! X\n0.5 0.5 0 ! M\n',
    );
  });
  it('count is the full mesh, not the irreducible one', () => expect(kpointCount([4, 4, 2])).toBe(32));
});

describe('parser round trips and errors', () => {
  it('mesh', () => {
    expect(parseKpoints(writeMeshKpoints([3, 4, 5], 'monkhorst-pack', [0.5, 0, 0]))).toEqual({
      kind: 'mesh',
      centering: 'monkhorst-pack',
      mesh: [3, 4, 5],
      shift: [0.5, 0, 0],
      comment: 'Automatic mesh',
    });
  });
  it('mesh without a shift line, CRLF', () => {
    const r = parseKpoints('x\r\n0\r\nG\r\n2 2 2\r\n');
    expect(r).toMatchObject({ kind: 'mesh', centering: 'gamma', shift: [0, 0, 0] });
  });
  it('auto', () =>
    expect(parseKpoints(writeAutoKpoints(25.5))).toMatchObject({ kind: 'auto', length: 25.5 }));
  it('explicit', () => {
    const p = [
      { k: [0, 0, 0] as const, weight: 1 },
      { k: [0.25, 0.25, 0.25] as const, weight: 2 },
    ];
    const r = parseKpoints(
      writeExplicitKpoints(p.map((x) => ({ k: [...x.k] as [number, number, number], weight: x.weight }))),
    );
    expect(r).toMatchObject({ kind: 'explicit', coords: 'reciprocal' });
    if (r.kind === 'explicit') expect(r.points.map((x) => x.weight)).toEqual([1, 2]);
  });
  it('line mode with labels', () => {
    const segs = [
      {
        from: [0, 0, 0] as [number, number, number],
        to: [0.5, 0, 0] as [number, number, number],
        fromLabel: 'G',
        toLabel: 'X',
      },
    ];
    expect(parseKpoints(writeLineMode(segs, 10))).toMatchObject({
      kind: 'line',
      pointsPerSegment: 10,
      segments: segs,
    });
  });
  const bad: [string, number][] = [
    ['c\n0\n', 3],
    ['c\nx\nG\n1 1 1\n', 2],
    ['c\n0\nQ\n1 1 1\n', 3],
    ['c\n0\nG\n1 0 1\n', 4],
    ['c\n2\nR\n0 0 0 1\n', 5],
    ['c\n1\nR\n0 0 0\n', 4],
  ];
  it.each(bad)('%j fails on line %i', (t, line) => {
    try {
      parseKpoints(t);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ParseError);
      expect((e as ParseError).line).toBe(line);
    }
  });
});
