// Physics of the module 5 new-topic scenes: symmetry operations against moyo (S-032), the relaxation landscape and
// ISIF table, and the GW gap data.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cellVolume } from '../../crystal/lattice';
import { loadMoyoNode } from '../../crystal/moyo-node';
import { latticePointGroup } from '../../crystal/pointgroup';
import { analyzeWith } from '../../crystal/symmetry';
import {
  applyOp,
  cellOperations,
  centringVectors,
  classify,
  geometricRotation,
  latticeRotations,
  mismatch,
  partialOp,
} from '../../crystal/symmetryElements';
import type { Mat3 } from '../../crystal/types';
import { withDefaults } from '../types';
import {
  CELL_EASE,
  CELL_START,
  GW_GAPS,
  ISIF_DOF,
  MB_POINTS,
  RELAX_FORCE_TOL,
  SYM_CASES,
  cellAfter,
  cellLattice,
  primitiveVectors,
  relaxRun,
  rungErrors,
  scenes,
  symData,
} from './m05b';

const symmetry = scenes['m05b-symmetry']!;
const relaxation = scenes['m05b-relaxation']!;
const beyond = scenes['m05b-beyond-dft']!;

describe('crystal symmetry', () => {
  it('finds as many operations per conventional cell as moyo, and the space-group numbers agree', async () => {
    const api = await loadMoyoNode();
    for (const c of SYM_CASES) {
      const r = analyzeWith(api, c.structure);
      expect(r.number, c.id).toBe(c.sgNumber);
      expect(cellOperations(c.structure).length, c.id).toBe(r.operations.length);
    }
  }, 60_000);

  it('the fast lattice point group matches the reference search', () => {
    for (const id of ['cP', 'cF', 'hP', 'hR', 'tI', 'oC', 'mP', 'aP']) {
      const L = SYM_CASES.find((c) => c.id === id)!.structure.lattice;
      expect(latticeRotations(L).length, id).toBe(latticePointGroup(L).length);
    }
  });

  it('every operation maps its crystal onto itself', () => {
    for (const id of ['perovskite', 'diamond', 'hcp']) {
      const s = SYM_CASES.find((c) => c.id === id)!.structure;
      for (const op of cellOperations(s)) expect(mismatch(s, op)).toBeLessThan(1e-6);
    }
  });

  it('Pm-3m has the 48 point operations by kind of ITA (S-105)', () => {
    const s = SYM_CASES.find((c) => c.id === 'perovskite')!.structure;
    const ops = cellOperations(s);
    const count: Record<string, number> = {};
    for (const op of ops) {
      const e = classify(op, s.lattice, centringVectors(ops));
      count[e.symbol] = (count[e.symbol] ?? 0) + 1;
    }
    expect(count).toEqual({ '1': 1, '2': 9, '3': 8, '4': 6, '-1': 1, '-4': 6, m: 9, '-3': 8 });
  });

  it('diamond (Fd-3m) has 4_1 and 4_3 screw axes and d glides but no pure fourfold axis', () => {
    const d = symData('diamond');
    const symbols = new Set(d.base.map((b) => b.el.symbol));
    expect(symbols.has('4')).toBe(false);
    expect([...symbols].some((x) => x === '4_1' || x === '4_3')).toBe(true);
    expect(d.base.some((b) => b.el.kind === 'glide')).toBe(true);
  });

  it('the drawn element reproduces the operation: the full partial move equals the operation', () => {
    for (const id of ['diamond', 'hcp', 'cI']) {
      const d = symData(id);
      const x: [number, number, number] = [0.31, 0.47, 0.83];
      for (const { el } of d.base) {
        const a = applyOp(el, x);
        const b = partialOp(el, x, 1);
        for (let i = 0; i < 3; i++) expect(b[i]).toBeCloseTo(a[i]!, 9);
      }
    }
  });

  it('primitive cells hold 1, 2, 4 and 2 times less volume for P, I, F and C', () => {
    for (const [id, n] of [
      ['cP', 1],
      ['cI', 2],
      ['cF', 4],
      ['oC', 2],
    ] as const) {
      const d = symData(id);
      const V = cellVolume(d.c.structure.lattice);
      expect(Math.abs(cellVolume(d.primitive as unknown as Mat3)), id).toBeCloseTo(V / n, 8);
      expect(primitiveVectors(d.c.structure.lattice, d.letter)).toEqual(d.primitive);
    }
  });

  it('a fivefold turn is not a symmetry of any lattice; the scene says it misses', () => {
    const five = geometricRotation([0, 0, 1], [0, 0, 0], (2 * Math.PI) / 5);
    expect(five.order).toBe(5);
    const f = symmetry.build({ ...withDefaults(symmetry), op: 'five', apply: 1 });
    expect(f.readouts!.map((r) => r.value).join(' ')).toMatch(/misses by/);
    const g = symmetry.build({ ...withDefaults(symmetry), op: 'main', apply: 1 });
    expect(g.readouts!.map((r) => r.value).join(' ')).toMatch(/maps the crystal onto itself/);
  });

  it('readouts give the operations of the conventional cell and the atoms per conventional and primitive cell', () => {
    const f = symmetry.build({ ...withDefaults(symmetry), structure: 'rocksalt' });
    const text = f.readouts!.map((r) => `${r.label}: ${r.value}`).join('; ');
    expect(text).toMatch(/Fm-3m/);
    expect(text).toMatch(/Operations in this cell: 192/);
    expect(text).toMatch(/8 \/ 2 atoms/);
  });
});

describe('geometry relaxation', () => {
  it('the valleys and saddles of the model agree with the published positions (S-164)', () => {
    const ref = [
      [-0.558, 1.442, -146.7],
      [-0.05, 0.467, -80.77],
      [0.623, 0.028, -108.17],
      [-0.822, 0.624, -40.66],
      [0.212, 0.293, -72.25],
    ];
    MB_POINTS.forEach((q, i) => {
      expect(q.x).toBeCloseTo(ref[i]![0]!, 2);
      expect(q.y).toBeCloseTo(ref[i]![1]!, 2);
      expect(Math.abs(q.e - ref[i]![2]!)).toBeLessThan(0.02);
    });
  });

  it('every optimiser from the upper start ends in the deepest valley; from the middle start in a local one', () => {
    for (const m of ['cg', 'bfgs', 'damped', 'sd'] as const) {
      const r = relaxRun(m, 1, 'upper');
      expect(r.converged, m).toBe(true);
      const end = r.steps.at(-1)!;
      expect(Math.hypot(end.fx, end.fy)).toBeLessThan(RELAX_FORCE_TOL);
      expect(Math.abs(end.e - MB_POINTS[0]!.e), m).toBeLessThan(0.5);
    }
    const mid = relaxRun('cg', 1, 'middle').steps.at(-1)!;
    expect(Math.abs(mid.e - MB_POINTS[1]!.e)).toBeLessThan(0.5);
  });

  it('conjugate gradients needs fewer evaluations than steepest descent here', () => {
    expect(relaxRun('cg', 1, 'upper').steps.length).toBeLessThan(relaxRun('sd', 1, 'upper').steps.length);
  });

  it('the ISIF table agrees with the tag visuals for 2, 3 and 4', () => {
    const tv = JSON.parse(readFileSync('src/data/tag-visuals.json', 'utf8')) as {
      tags: { tag: string; cases?: { value: string; params: Record<string, boolean> }[] }[];
    };
    const isif = tv.tags.find((t) => t.tag === 'ISIF')!;
    for (const c of isif.cases!) {
      const d = ISIF_DOF[c.value]!;
      expect({ atoms: d.ions, shape: d.shape, volume: d.volume }, c.value).toEqual(c.params);
    }
  });

  it('the toy cell eases only the allowed coordinates, by the factor per step', () => {
    for (const [k, dof] of Object.entries(ISIF_DOF)) {
      const st = cellAfter(k, 3);
      const f = CELL_EASE ** 3;
      expect(st.off, k).toBeCloseTo(dof.ions ? CELL_START.off * f : CELL_START.off, 12);
      expect(st.ca, k).toBeCloseTo(dof.shape ? 1 + (CELL_START.ca - 1) * f : CELL_START.ca, 12);
      expect(st.vol, k).toBeCloseTo(dof.volume ? 1 + (CELL_START.vol - 1) * f : CELL_START.vol, 12);
    }
  });

  it('shape changes keep the volume: the cell volume is a0^3 times the volume factor', () => {
    const a0 = 3.905;
    for (const st of [cellAfter('4', 0), cellAfter('4', 7), cellAfter('3', 5)]) {
      const L = cellLattice(a0, st) as unknown as Mat3;
      expect(cellVolume(L)).toBeCloseTo(a0 ** 3 * st.vol, 9);
      expect((Math.hypot(...L[2]) * Math.cos((st.tilt * Math.PI) / 180)) / L[0][0]).toBeCloseTo(st.ca, 9);
    }
  });

  it('the cell view draws held motions with open arrow heads', () => {
    const f = relaxation.build({ ...withDefaults(relaxation), view: 'cell', isif: '2' });
    const heads = Object.fromEntries(
      f.layers.filter((l) => l.kind === 'arrows').map((l) => [l.group, (l as { head?: unknown }).head]),
    );
    expect(heads.ions).toBe('solid');
    expect(heads.volume).toBe('open');
    expect(heads.shape).toBe('open');
  });
});

describe('beyond DFT gaps', () => {
  it('PBE underestimates every gap and GW0 is at least G0W0 (the trend reported in S-131)', () => {
    for (const g of GW_GAPS) {
      expect(g.pbe, g.id).toBeLessThan(g.exp);
      expect(g.gw0, g.id).toBeGreaterThanOrEqual(g.g0w0);
    }
  });

  it('the mean errors are those of the table and shrink up the ladder', () => {
    const mae = GW_GAPS.reduce((a, g) => a + Math.abs(g.pbe - g.exp), 0) / GW_GAPS.length;
    expect(rungErrors('pbe').mae).toBeCloseTo(mae, 12);
    expect(rungErrors('g0w0').mae).toBeLessThan(rungErrors('pbe').mae);
    expect(rungErrors('gw0').mae).toBeLessThan(rungErrors('g0w0').mae);
  });

  it('the description quotes the chosen material', () => {
    const f = beyond.build({ ...withDefaults(beyond), material: 'Si', method: 'g0w0' });
    expect(f.describe).toMatch(/Si: PBE 0\.62, G0W0 1\.12, GW0 1\.20 eV against 1\.17 eV/);
  });
});
