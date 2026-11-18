import { beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import kp from '../../../tests/reference/kpaths.json';
import ref from '../../../tests/reference/element_reference.json';
import pv from '../../../tests/reference/perovskite_reference.json';
import concepts from '../../data/concepts.json';
import { symbolOf } from '../crystal/elements';
import { loadMoyoNode } from '../crystal/moyo-node';
import { analyzeWith, type MoyoApi } from '../crystal/symmetry';
import type { Mat3, Structure, Vec3 } from '../crystal/types';
import { formatAssignment, searchCharges } from './charge';
import { contacts } from './geometry';
import { RADIUS_RATIO_LIMITS, RULES, THRESHOLDS, radiusRatioLimit } from './rules';
import { check, exportGate, withOverrideComment, type Issue } from './validity';

type KInput = { lattice_rows: Mat3; frac_coords: Vec3[]; atomic_numbers: number[] };
const KS = kp.structures as unknown as Record<string, { input: KInput }>;
const fromK = (name: string): Structure => {
  const i = KS[name]!.input;
  return { lattice: i.lattice_rows, species: i.atomic_numbers.map((z) => symbolOf(z)!), frac: i.frac_coords };
};
const cubic = (a: number): Mat3 => [
  [a, 0, 0],
  [0, a, 0],
  [0, 0, a],
];
const make = (a: number, atoms: [string, Vec3][]): Structure => ({
  lattice: cubic(a),
  species: atoms.map((x) => x[0]),
  frac: atoms.map((x) => x[1]),
});
const perovskite = (a: number, A: string, B: string, X: string) =>
  make(a, [
    [A, [0, 0, 0]],
    [B, [0.5, 0.5, 0.5]],
    [X, [0.5, 0.5, 0]],
    [X, [0.5, 0, 0.5]],
    [X, [0, 0.5, 0.5]],
  ]);
const by = (issues: Issue[], code: string, severity?: string) =>
  issues.filter((i) => i.code === code && (!severity || i.severity === severity));
const serious = (issues: Issue[]) => issues.filter((i) => i.severity !== 'info');

const NaCl = fromK('rocksalt_NaCl');
const SrTiO3 = fromK('cubic_perovskite_SrTiO3');

describe('radius-ratio limits (B006), derived here', () => {
  it('equals the geometric values', () => {
    // Triangle: anions of radius R touch along the edge 2R; the centre-to-corner distance is 2R / sqrt(3) = r + R.
    const tri = 2 / Math.sqrt(3) - 1;
    // Tetrahedron in a cube of edge e: anion-anion along a face diagonal e sqrt(2) = 2R; centre to corner e sqrt(3) / 2 = r + R.
    const tet = Math.sqrt(3) / Math.sqrt(2) - 1;
    // Octahedron: anions at distance r + R along the axes; neighbours (r + R) sqrt(2) apart = 2R.
    const oct = Math.sqrt(2) - 1;
    // Cube: anions on the corners, edge 2R; body diagonal 2R sqrt(3) = 2 (r + R).
    const cube = Math.sqrt(3) - 1;
    expect(tri).toBeCloseTo(0.155, 3);
    expect(tet).toBeCloseTo(0.225, 3);
    expect(oct).toBeCloseTo(0.414, 3);
    expect(cube).toBeCloseTo(0.732, 3);
    expect(RADIUS_RATIO_LIMITS.map((r) => r.limit)).toEqual([cube, oct, Math.sqrt(1.5) - 1, tri]);
    expect(Math.sqrt(1.5) - 1).toBeCloseTo(tet, 12);
    expect(radiusRatioLimit(12)?.limit).toBe(cube);
    expect(radiusRatioLimit(5)?.limit).toBe(Math.sqrt(1.5) - 1);
    expect(radiusRatioLimit(2)).toBeUndefined();
  });
});

describe('rule table', () => {
  it('links every rule to an existing concept and a recorded decision', () => {
    const decisions = fs.readFileSync('docs/DECISIONS.md', 'utf8');
    const byId = new Map((concepts as { id: string; module: number }[]).map((c) => [c.id, c.module]));
    for (const r of Object.values(RULES)) {
      expect(byId.get(r.learn.concept), r.code).toBe(r.learn.module);
      expect(decisions, r.code).toContain(`**${r.decision}.`);
    }
  });
});

describe('real structures', () => {
  it('rock-salt NaCl (kpaths.json) passes with no error or warning', () => {
    const issues = check(NaCl);
    expect(serious(issues)).toEqual([]);
    expect(by(issues, 'B005', 'info')[0]?.data?.assignment).toBe('Na+ Cl-');
  });

  it('SrTiO3 passes and B008 reports t = 1.0016 (golden)', () => {
    const issues = check(SrTiO3);
    expect(serious(issues)).toEqual([]);
    const g = pv.compounds.find((c) => c.formula === 'SrTiO3')!;
    const b8 = by(issues, 'B008')[0]!;
    expect(b8.severity).toBe('info');
    expect(b8.data!.t as number).toBeCloseTo(g.t, 6);
    expect(b8.data!.mu as number).toBeCloseTo(g.mu, 6);
    expect(b8.data!.A).toBe('Sr');
    expect(b8.title).toContain('t = 1.0016');
  });

  it('no kpaths.json structure is flagged as too dense (half-radius spheres, D-063)', () => {
    for (const name of Object.keys(KS)) expect(by(check(fromK(name)), 'B003'), name).toEqual([]);
  });
});

describe('B001 overlap and B002 short contact', () => {
  const twoNa = make(10, [
    ['Na', [0.2, 0.2, 0.2]],
    ['Na', [0.24, 0.2, 0.2]],
  ]);
  it('two Na atoms 0.4 Angstrom apart fail B001; the merge fix leaves one atom at the midpoint', () => {
    const e = by(check(twoNa), 'B001', 'error');
    expect(e).toHaveLength(1);
    expect(e[0]!.data!.distance as number).toBeCloseTo(0.4, 9);
    expect(e[0]!.fix!.label).toMatch(/Merge/);
    const merged = e[0]!.fix!.apply(twoNa);
    expect(merged.species).toEqual(['Na']);
    expect(merged.frac[0]![0]).toBeCloseTo(0.22, 12);
    expect(by(check(merged), 'B001')).toEqual([]);
    expect(twoNa.species).toHaveLength(2); // the fix is pure
    const [del, apart] = e[0]!.alternatives!;
    expect(del!.apply(twoNa).species).toHaveLength(1);
    const moved = apart!.apply(twoNa);
    expect(contacts(moved, 5).find((c) => c.i === 0 && c.j === 1)!.distance).toBeCloseTo(2 * 1.66, 9);
  });
  it('different elements: the primary fix moves them apart', () => {
    const s = make(10, [
      ['Na', [0.2, 0.2, 0.2]],
      ['Cl', [0.25, 0.2, 0.2]],
    ]);
    const e = by(check(s), 'B001', 'error')[0]!;
    expect(e.fix!.label).toMatch(/Move apart/);
    expect(by(check(e.fix!.apply(s)), 'B001')).toEqual([]);
  });
  it('an overlap across the cell boundary is found through the periodic image', () => {
    const s = make(10, [
      ['Na', [0.01, 0.5, 0.5]],
      ['Cl', [0.99, 0.5, 0.5]],
    ]);
    expect(by(check(s), 'B001', 'error')).toHaveLength(1);
  });
  it('B002 warns between 0.5 and 0.75 of the radius sum', () => {
    // Na 1.66 + Cl 1.02 = 2.68; 1.8 Angstrom is 0.67 of it
    const s = make(10, [
      ['Na', [0.2, 0.2, 0.2]],
      ['Cl', [0.38, 0.2, 0.2]],
    ]);
    const issues = check(s);
    expect(by(issues, 'B001')).toEqual([]);
    const w = by(issues, 'B002', 'warning');
    expect(w).toHaveLength(1);
    expect(by(check(w[0]!.fix!.apply(s)), 'B002')).toEqual([]);
    expect(by(check(NaCl), 'B002')).toEqual([]);
  });
  it('skips elements without a covalent radius and says so', () => {
    const s = make(10, [
      ['Bk', [0.2, 0.2, 0.2]],
      ['Bk', [0.22, 0.2, 0.2]],
    ]);
    const issues = check(s);
    expect(by(issues, 'B001', 'error')).toEqual([]);
    expect(by(issues, 'B001', 'info')[0]!.why).toContain('Bk');
  });
});

describe('B003 cell too dense', () => {
  // 30 Na atoms on a 4 x 4 x 2 grid (two corners left empty) in a 10 Angstrom^3 cell
  const pts: Vec3[] = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) for (let k = 0; k < 2; k++) pts.push([i / 4, j / 4, k / 2]);
  const dense = make(
    Math.cbrt(10),
    pts.slice(0, 30).map((p) => ['Na', p] as [string, Vec3]),
  );
  it('30 atoms in 10 Angstrom^3 fail; scaling the cell clears B001 to B003', () => {
    const issues = check(dense);
    const e = by(issues, 'B003', 'error');
    expect(e).toHaveLength(1);
    expect(e[0]!.data!.cellVolume as number).toBeCloseTo(10, 9);
    const fixed = e[0]!.fix!.apply(dense);
    const after = check(fixed);
    for (const c of ['B001', 'B002', 'B003']) expect(by(after, c), c).toEqual([]);
  });
  it('coincident atoms: no scale fix is offered', () => {
    const s = { ...dense, frac: [...dense.frac.slice(0, 29), dense.frac[0]!] };
    expect(by(check(s), 'B003', 'error')[0]!.fix).toBeUndefined();
  });
  it('real crystals pass', () => {
    expect(by(check(NaCl), 'B003')).toEqual([]);
  });
});

describe('B004 degenerate cell', () => {
  const t = (10 * Math.PI) / 180;
  const flat: Structure = {
    lattice: [
      [5, 0, 0],
      [5 * Math.cos(t), 5 * Math.sin(t), 0],
      [0, 0, 5],
    ],
    species: ['Na'],
    frac: [[0, 0, 0]],
  };
  it('a 10 degree cell angle fails', () => {
    const e = by(check(flat), 'B004', 'error');
    expect(e).toHaveLength(1);
    expect(e[0]!.data!.gamma as number).toBeCloseTo(10, 9);
  });
  it('a volume below 1 Angstrom^3 per atom fails', () => {
    expect(
      by(
        check(
          make(1.5, [
            ['H', [0, 0, 0]],
            ['H', [0.5, 0.5, 0.5]],
            ['H', [0.5, 0, 0]],
            ['H', [0, 0.5, 0]],
          ]),
        ),
        'B004',
        'error',
      ),
    ).toHaveLength(1);
  });
  it('NaCl passes', () => expect(by(check(NaCl), 'B004')).toEqual([]));
});

describe('B005 charge neutrality', () => {
  const REF = ref.elements as unknown as Record<string, { oxidation_share_icsd24: Record<string, number> }>;
  it('"Na2Cl" fails', () => {
    const s = make(5, [
      ['Na', [0, 0, 0]],
      ['Na', [0.5, 0.5, 0]],
      ['Cl', [0.5, 0, 0]],
    ]);
    const e = by(check(s), 'B005', 'error');
    expect(e).toHaveLength(1);
    expect(e[0]!.data!.formula).toBe('Na2Cl');
  });
  it('NdCuO3 needs Cu3+: known-rare warning with the share from element_reference.json', () => {
    const w = by(check(perovskite(3.8, 'Nd', 'Cu', 'O')), 'B005', 'warning');
    expect(w).toHaveLength(1);
    expect(w[0]!.data!.rare).toBe('Cu3+');
    expect(w[0]!.data!.share as number).toBeCloseTo(REF.Cu!.oxidation_share_icsd24['3']!, 4); // reference rounds to 4 places
    expect(w[0]!.data!.share).toBeCloseTo(0.03, 3);
  });
  it('finds mixed valence (Fe3O4) with common states only', () => {
    const r = searchCharges(
      [
        { el: 'Fe', count: 3 },
        { el: 'O', count: 4 },
      ],
      true,
    );
    expect(r.kind).toBe('assigned');
    if (r.kind === 'assigned') expect(formatAssignment(r.best)).toBe('Fe2+ x1, Fe3+ x2 O2-');
  });
  it('requires anions to be more electronegative than cations', () => {
    // Cl- with Na+ balances; Na- with Cl+ would too, but is excluded by the ordering
    const r = searchCharges([
      { el: 'Na', count: 1 },
      { el: 'Cl', count: 1 },
    ]);
    expect(r.kind === 'assigned' && formatAssignment(r.best)).toBe('Na+ Cl-');
  });
  it('skips all-metal systems and single elements with an info', () => {
    const cuzn = make(2.95, [
      ['Cu', [0, 0, 0]],
      ['Zn', [0.5, 0.5, 0.5]],
    ]);
    expect(by(check(cuzn), 'B005').map((i) => i.severity)).toEqual(['info']);
    expect(by(check(fromK('diamond_Si')), 'B005').map((i) => i.severity)).toEqual(['info']);
  });
});

describe("B006 and B007 Pauling's rules", () => {
  it('CsCl-type LiI: Li+ too small for CN 8', () => {
    const s = make(3.46, [
      ['Li', [0, 0, 0]],
      ['I', [0.5, 0.5, 0.5]],
    ]);
    const w = by(check(s), 'B006', 'warning');
    expect(w).toHaveLength(1);
    expect(w[0]!.data!.cn).toBe(8);
    expect(w[0]!.data!.ratio as number).toBeCloseTo(0.76 / 2.2, 9); // Shannon CN VI: Li+ 0.76, I- 2.20
    expect(w[0]!.data!.limit).toBe(Math.sqrt(3) - 1);
  });
  it('rock salt NaCl and SrTiO3 satisfy both rules', () => {
    for (const s of [NaCl, SrTiO3]) {
      const issues = check(s);
      expect(by(issues, 'B006')).toEqual([]);
      expect(by(issues, 'B007')).toEqual([]);
    }
  });
  it('B007 flags anions whose bond-strength sum misses the valence by more than 25 %', () => {
    // Ti at the origin bonded to O1 on both sides along x and to O2 once along z: CN 3, s = 4/3
    const s: Structure = {
      lattice: [
        [4, 0, 0],
        [0, 4, 0],
        [0, 0, 6],
      ],
      species: ['Ti', 'O', 'O'],
      frac: [
        [0, 0, 0],
        [0.5, 0, 0],
        [0, 0, 1 / 3],
      ],
    };
    const w = by(check(s), 'B007', 'warning');
    expect(w.map((i) => i.data!.sum as number).sort()).toEqual(
      [4 / 3, 8 / 3].map((x) => expect.closeTo(x, 9)) as unknown as number[],
    );
    expect(w.map((i) => i.atoms)).toEqual(expect.arrayContaining([[1], [2]]));
  });
});

describe('B008 perovskite', () => {
  it('only for ABX3 compositions', () => {
    expect(by(check(NaCl), 'B008')).toEqual([]);
  });
  it('warns when a heuristic range fails (NdCuO3 with Cu3+: mu below sqrt(2) - 1)', () => {
    const b8 = by(check(perovskite(3.8, 'Nd', 'Cu', 'O')), 'B008')[0]!;
    expect(b8.severity).toBe('warning');
    expect(b8.data!.mu as number).toBeLessThan(Math.SQRT2 - 1);
  });
});

describe('B009 Hume-Rothery', () => {
  it('CuZn: within both limits, with the stand-in note', () => {
    const issues = by(
      check(
        make(2.95, [
          ['Cu', [0, 0, 0]],
          ['Zn', [0.5, 0.5, 0.5]],
        ]),
      ),
      'B009',
    );
    expect(issues.map((i) => i.severity)).toEqual(['info']);
    expect(issues[0]!.why).toMatch(/not checked/);
  });
  it('Cu with K: size mismatch above 15 %', () => {
    const w = by(
      check(
        make(4, [
          ['Cu', [0, 0, 0]],
          ['Cu', [0.5, 0.5, 0]],
          ['K', [0.5, 0.5, 0.5]],
        ]),
      ),
      'B009',
      'warning',
    );
    expect(w.some((i) => i.title.includes('Size'))).toBe(true);
    expect(w.find((i) => i.title.includes('Size'))!.data!.mismatch as number).toBeCloseTo(
      Math.abs(2.03 - 1.32) / 1.32,
      9,
    );
  });
  it('Cu with Au: electronegativity difference above 0.4', () => {
    const w = by(
      check(
        make(4, [
          ['Cu', [0, 0, 0]],
          ['Cu', [0.5, 0.5, 0]],
          ['Au', [0.5, 0.5, 0.5]],
        ]),
      ),
      'B009',
      'warning',
    );
    expect(w.map((i) => i.title)).toEqual(['Electronegativity difference (Hume-Rothery)']);
    expect(w[0]!.why).toContain('0.64');
  });
  it('not for ionic compounds', () => expect(by(check(NaCl), 'B009')).toEqual([]));
});

describe('B010 periodic images', () => {
  it('atoms outside [0, 1): info with a wrap fix', () => {
    const s = { ...NaCl, frac: NaCl.frac.map((f, i) => (i === 0 ? ([1, 1, -1] as Vec3) : f)) };
    const i = by(check(s), 'B010', 'info');
    expect(i).toHaveLength(1);
    const w = i[0]!.fix!.apply(s);
    expect(w.frac.flat().every((x) => x >= 0 && x < 1)).toBe(true);
    expect(by(check(w), 'B010')).toEqual([]);
  });
  it('duplicate sites across the boundary: error, and the fix merges them', () => {
    const s = make(5, [
      ['Na', [0, 0, 0]],
      ['Na', [0.9999, 0, 0]],
      ['Cl', [0.5, 0.5, 0.5]],
    ]);
    const issues = check(s);
    const e = by(issues, 'B010', 'error');
    expect(e).toHaveLength(1);
    expect(by(issues, 'B001')).toEqual([]); // reported once, as a duplicate
    const fixed = e[0]!.fix!.apply(s);
    expect(fixed.species).toEqual(['Na', 'Cl']);
    expect(by(check(fixed), 'B010')).toEqual([]);
  });
  it('NaCl has none', () => expect(by(check(NaCl), 'B010')).toEqual([]));
});

describe('B011 symmetry and B012 molecule mode', () => {
  let api: MoyoApi;
  beforeAll(async () => {
    api = await loadMoyoNode();
  });
  it('reports the space group and Wyckoff letters when given the analysis', () => {
    const i = by(check(NaCl, 'crystal', { symmetry: analyzeWith(api, NaCl) }), 'B011')[0]!;
    expect(i.title).toBe('Space group F m -3 m (225)');
    expect(i.why).toMatch(/Na a, Cl b/);
    expect(by(check(NaCl), 'B011')[0]!.title).toMatch(/not analysed/);
  });
  it('molecule mode: distances only, without periodic images, plus the RDKit note', () => {
    const s = make(10, [
      ['C', [0.01, 0.5, 0.5]],
      ['C', [0.99, 0.5, 0.5]],
    ]);
    expect(by(check(s, 'crystal'), 'B001', 'error')).toHaveLength(1);
    const m = check(s, 'molecule');
    expect(m.map((i) => i.code)).toEqual(['B012']);
    const close = make(10, [
      ['C', [0.5, 0.5, 0.5]],
      ['C', [0.53, 0.5, 0.5]],
    ]);
    expect(by(check(close, 'molecule'), 'B001', 'error')).toHaveLength(1);
  });
});

describe('every issue explains itself', () => {
  it('has a title, a reason, a learn link and the rule flags', () => {
    const all = [
      NaCl,
      SrTiO3,
      perovskite(3.8, 'Nd', 'Cu', 'O'),
      make(2.95, [
        ['Cu', [0, 0, 0]],
        ['Zn', [0.5, 0.5, 0.5]],
      ]),
    ].flatMap((s) => check(s));
    for (const i of all) {
      expect(i.title.length, i.code).toBeGreaterThan(3);
      expect(i.why.length, i.code).toBeGreaterThan(20);
      expect(i.why, i.code).not.toContain(String.fromCharCode(0x2014));
      expect(i.learn).toEqual(RULES[i.code].learn);
      expect(i.heuristic).toBe(RULES[i.code].heuristic);
    }
    expect(THRESHOLDS.overlapFactor).toBeLessThan(THRESHOLDS.shortContactFactor);
  });
});

describe('export gate', () => {
  const bad = check(
    make(10, [
      ['Na', [0.2, 0.2, 0.2]],
      ['Na', [0.24, 0.2, 0.2]],
    ]),
  );
  it('errors block export without a reason', () => {
    expect(exportGate(bad).allowed).toBe(false);
    expect(exportGate(bad, { reason: '  \n ' }).allowed).toBe(false);
    expect(exportGate(check(NaCl)).allowed).toBe(true);
  });
  it('an override with a reason is allowed and recorded in the comment line', () => {
    const g = exportGate(bad, { reason: 'testing a\nmerged site' });
    expect(g.allowed).toBe(true);
    expect(g.commentLine).toBe('OVERRIDE B001: testing a merged site');
    const s = withOverrideComment({ ...NaCl, comment: 'NaCl' }, g);
    expect(s.comment).toBe('NaCl | OVERRIDE B001: testing a merged site');
    expect(withOverrideComment(NaCl, exportGate(check(NaCl)))).toBe(NaCl);
  });
});
