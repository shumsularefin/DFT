// Physics of the module 5 spin and magnetism scenes, against the golden orderings, the tested libraries and closed forms.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import golden from '../../../../tests/reference/magnetic_reference.json';
import { solveStoner, stonerEnergy } from '../../physics/stoner';
import { helixOptimum, netPerSite } from '../../physics/spintexture';
import type { ArrowsLayer, AtomsLayer, LabelsLayer, Layer, MeshLayer, SceneFrame } from '../types';
import { withDefaults } from '../types';
import { SAMPLE_OUTCAR, dOccupations, ladderEnergies, sampleTables, scenes } from './m05s';

const build = (id: string, over: Record<string, number | string | boolean> = {}): SceneFrame => {
  const def = scenes[id]!;
  return def.build(withDefaults(def, over));
};
const layersOf = <K extends Layer['kind']>(f: SceneFrame, kind: K, group?: string) =>
  f.layers.filter((l) => l.kind === kind && (!group || l.group === group)) as Extract<Layer, { kind: K }>[];
const readout = (f: SceneFrame, label: string) => f.readouts!.find((r) => r.label === label)!.value;

type Counts = {
  n_atoms: number;
  n_magnetic: number;
  n_up: number;
  n_down: number;
  net_moment_unit: number;
  nn_parallel_antiparallel_per_site: number[][];
};
const gold = (
  golden.orderings as unknown as Record<
    string,
    { cases: Record<string, { minimal_cell: Counts; diagonal_cell: Counts; diagonal_dims: number[] }> }
  >
).cubic_perovskite_SrTiO3!.cases;

/** Up and down arrow counts of the spin layer, by head style (solid up, open down). */
function spinCounts(f: SceneFrame): { up: number; down: number; lengths: number[] } {
  const a = layersOf(f, 'arrows', 'spins')[0] as ArrowsLayer;
  const heads = a.head as ('solid' | 'open')[];
  return {
    up: heads.filter((h) => h === 'solid').length,
    down: heads.filter((h) => h === 'open').length,
    lengths: a.vectors.map((v) => v[2]),
  };
}

describe('m05s-orderings: FM, A, C and G on the perovskite equal the golden data (S-034, S-058)', () => {
  for (const kind of ['FM', 'A', 'C', 'G'] as const) {
    it(`${kind}: smallest cell and 2 x 2 x 2 cell`, () => {
      const g = gold[kind]!;
      const min = build('m05s-orderings', { order: kind, cell: 'minimal', moment: 1 });
      const s = spinCounts(min);
      expect(s.up).toBe(g.minimal_cell.n_up);
      expect(s.down).toBe(g.minimal_cell.n_down);
      expect(readout(min, 'Net moment')).toBe(`${g.minimal_cell.net_moment_unit.toFixed(1)} μB per cell`);
      expect(readout(min, 'Cell')).toContain(`${g.minimal_cell.n_atoms} atoms`);
      const big = build('m05s-orderings', { order: kind, cell: '2x2x2', moment: 1 });
      const b = spinCounts(big);
      expect(b.up + b.down).toBe(8);
      // the nearest-neighbour statistics per site do not depend on the cell
      const [par, anti] = g.minimal_cell.nn_parallel_antiparallel_per_site[0]!;
      expect(big.describe).toContain(`${par} parallel and ${anti} antiparallel nearest Mn neighbours`);
      expect(b.up - b.down).toBe(kind === 'FM' ? 8 : 0);
    });
  }

  it('the cell that holds all four has the golden size, and the net moment scales with the moment slider', () => {
    const f = build('m05s-orderings', { order: 'A', cell: 'common' });
    expect(readout(f, 'Cell')).toMatch(
      new RegExp(`^${golden.common_supercell.cubic_perovskite_SrTiO3.det} formula units`),
    );
    const fm = build('m05s-orderings', { order: 'FM', cell: '2x2x2', moment: 3.5 });
    expect(readout(fm, 'Net moment')).toBe('28.0 μB per cell');
    expect(spinCounts(fm).lengths.every((z) => Math.abs(z - 3.5 * 0.42) < 1e-12)).toBe(true);
    expect(readout(fm, 'MAGMOM')).toBe('8*0.0 8*3.5 24*0.0');
  });

  it('A-type planes are perpendicular to the chosen axis and alternate in sign', () => {
    const f = build('m05s-orderings', { order: 'A', cell: '2x2x2', axis: 'a', planes: true });
    const planes = layersOf(f, 'mesh', 'planes') as MeshLayer[];
    expect(planes).toHaveLength(2);
    for (const q of planes) {
      const xs = [0, 3, 6, 9].map((i) => q.positions[i]!);
      expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-9); // a plane of constant x
    }
    expect(new Set(planes.map((q) => q.color))).toEqual(new Set(['pos', 'neg']));
  });
});

describe('m05s-ground-state: Heisenberg energies on one cell (S-059, S-060)', () => {
  it('per-ion energies equal the closed forms for the simple-cubic Mn sublattice (6 first, 12 second neighbours)', () => {
    for (const [j1, j2] of [
      [-4, 0],
      [4, -2],
      [-4, -2],
      [2.5, 1.25],
    ] as const) {
      const e = Object.fromEntries(ladderEnergies(j1, j2).map((x) => [x.kind, x.meV]));
      expect(e.FM).toBeCloseTo(-3 * j1 - 6 * j2, 12);
      expect(e.A).toBeCloseTo(-j1 + 2 * j2, 12);
      expect(e.C).toBeCloseTo(j1 + 2 * j2, 12);
      expect(e.G).toBeCloseTo(3 * j1 - 6 * j2, 12);
    }
  });

  it('the lowest ordering follows the signs of J1 and J2, and the cells are lifted by their energy', () => {
    const lowest = (j1: number, j2: number) => readout(build('m05s-ground-state', { j1, j2 }), 'Lowest');
    expect(lowest(-4, 0)).toBe('G-type antiferromagnetic');
    expect(lowest(4, 0)).toBe('Ferromagnetic');
    expect(lowest(4, -2)).toBe('A-type antiferromagnetic');
    expect(lowest(-4, -2)).toBe('C-type antiferromagnetic');
    const f = build('m05s-ground-state', { j1: 4, j2: -2 });
    const plates = layersOf(f, 'mesh', 'ladder') as MeshLayer[];
    const z = plates.map((q) => q.positions[2]! + 0.9);
    ladderEnergies(4, -2).forEach((x, i) => expect(z[i]).toBeCloseTo(x.meV * 0.12, 9));
  });
});

describe('m05s-stoner: the surface and the minimum (S-059)', () => {
  it('the surface heights are stonerEnergy, cut off at 0.6 eV', () => {
    const f = build('m05s-stoner', { dos: 1.2, stonerI: 1 });
    const s = layersOf(f, 'mesh', 'surface')[0] as MeshLayer;
    for (let v = 0; v < s.positions.length / 3; v += 97) {
      const [x, y, z] = [s.positions[3 * v]!, s.positions[3 * v + 1]!, s.positions[3 * v + 2]!];
      const e = Math.min(0.6, stonerEnergy({ dosPerSpin: 1.2, stonerI: y / 4 }, x / 2));
      expect(z).toBeCloseTo(e * 6, 9);
    }
  });

  it('after enough steps the moment is the equilibrium m* of solveStoner; it moves from zero to non-zero at I N = 1', () => {
    const at = (stonerI: number, magmom = 1) =>
      Number(
        readout(build('m05s-stoner', { stonerI, dos: 1, magmom, step: 20 }), 'Moment reached').split(' ')[0],
      );
    expect(at(0.8)).toBeCloseTo(0, 2);
    for (const i of [1.5, 1.8, 2])
      expect(at(i, 2)).toBeCloseTo(solveStoner({ dosPerSpin: 1, stonerI: i }).equilibriumMoment, 2);
  });

  it('ISPIN = 1 or a zero start keeps m = 0 even when I N > 1', () => {
    const off = build('m05s-stoner', { stonerI: 2, ispin: false });
    expect(readout(off, 'Moment reached')).toBe('0.00 μB');
    const zero = build('m05s-stoner', { stonerI: 2, magmom: 0 });
    expect(readout(zero, 'Moment reached')).toBe('0.00 μB');
    expect(zero.describe).toContain('stationary point');
  });
});

describe('m05s-spin-density: Hund filling of a d shell (S-059, S-047)', () => {
  it('high-spin moments are 0 1 2 3 4 5 4 3 2 1 0, and ISPIN = 1 gives none', () => {
    const m = Array.from({ length: 11 }, (_, n) => {
      const o = dOccupations(n, true);
      expect(o.up.reduce((a, b) => a + b, 0) + o.down.reduce((a, b) => a + b, 0)).toBe(n);
      return o.up.reduce((a, b) => a + b, 0) - o.down.reduce((a, b) => a + b, 0);
    });
    expect(m).toEqual([0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 0]);
    for (let n = 0; n <= 10; n++) {
      const o = dOccupations(n, false);
      expect(o.up).toEqual(o.down);
      expect(2 * o.up.reduce((a, b) => a + b, 0)).toBe(n);
    }
  });

  it('the moment arrow and readout follow the filling, and d5 up density is drawn while down is empty', () => {
    const f = build('m05s-spin-density', { electrons: 5 });
    expect(readout(f, 'Spin moment')).toBe('5 μB');
    const arrow = layersOf(f, 'arrows', 'moment')[0] as ArrowsLayer;
    expect(arrow.vectors[0]![2]).toBeGreaterThan(0);
    const dens = layersOf(f, 'mesh', 'density') as MeshLayer[];
    expect(dens.map((d) => d.color)).toEqual(['pos']);
    const off = build('m05s-spin-density', { electrons: 5, ispin: false });
    expect(readout(off, 'Spin moment')).toBe('0 μB');
    expect(layersOf(off, 'arrows', 'moment')).toHaveLength(0);
  });
});

describe('m05s-site-moments: the sample OUTCAR, read by the tested parser (S-034)', () => {
  const dir = 'tests/reference/vasp-outputs/';
  it('the embedded sample is the golden fixture, byte for byte', () => {
    expect(SAMPLE_OUTCAR).toBe(readFileSync(`${dir}OUTCAR_mag_spd`, 'utf8'));
  });

  it('the last table equals the pymatgen reading, and the first table is the earlier step', () => {
    const exp = JSON.parse(readFileSync(`${dir}expected.json`, 'utf8')) as Record<
      string,
      { magnetization: { tot: number }[]; total_mag: number }
    >;
    const tabs = sampleTables();
    expect(tabs).toHaveLength(2);
    tabs[1]!.table.sites.forEach((s, i) =>
      expect(s.tot).toBeCloseTo(exp.OUTCAR_mag_spd!.magnetization[i]!.tot, 9),
    );
    expect(tabs[1]!.cell).toBeCloseTo(exp.OUTCAR_mag_spd!.total_mag, 9);
    expect(tabs[0]!.table.sites.map((s) => s.tot)).toEqual([2.03, -1.9, 0]);
  });

  it('arrow lengths are the chosen column; the pattern check flags a flip for an FM start', () => {
    const f = build('m05s-site-moments', { table: 2, column: 'd' });
    expect(spinCounts(f).lengths.map((z) => z / 0.8)).toEqual(
      [3.456, -3.456].map((x) => expect.closeTo(x, 9)),
    );
    expect(readout(f, 'Pattern kept (heuristic)')).toBe('yes');
    const fm = build('m05s-site-moments', { magmom: 'fm' });
    expect(readout(fm, 'Pattern kept (heuristic)')).toBe('no');
    expect(fm.describe).toContain('ion 2 flipped');
    const early = build('m05s-site-moments', { table: 1 });
    expect(early.describe).toContain('ion 2 shrunk');
  });
});

describe('m05s-noncollinear: textures and SAXIS (S-059, S-065)', () => {
  it('a helix at q = 0 is ferromagnetic along SAXIS; SAXIS 1 0 0 turns every spin to x', () => {
    const z = build('m05s-noncollinear', { texture: 'helix', q: 0 });
    const az = layersOf(z, 'arrows', 'spins')[0] as ArrowsLayer;
    for (const v of az.vectors) expect(v[2]).toBeCloseTo(1.6, 12);
    const x = build('m05s-noncollinear', { texture: 'helix', q: 0, saxis: '100' });
    const ax = layersOf(x, 'arrows', 'spins')[0] as ArrowsLayer;
    for (const v of ax.vectors) expect(v[0]).toBeCloseTo(1.6, 12);
    // MAGMOM is written in the SAXIS frame: the same numbers for both
    expect(readout(x, 'MAGMOM, sites 1 and 2 (3 μB)')).toBe(readout(z, 'MAGMOM, sites 1 and 2 (3 μB)'));
    expect(readout(x, 'Energy per spin')).toBe(readout(z, 'Energy per spin'));
  });

  it('canting gives a net moment sin(angle); the best helix q follows cos(2 pi q) = -J1 / (4 J2)', () => {
    const f = build('m05s-noncollinear', { texture: 'canted', angle: 30 });
    expect(Number(readout(f, 'Net moment per site'))).toBeCloseTo(0.5, 2);
    const net = layersOf(f, 'arrows', 'net')[0] as ArrowsLayer;
    expect(Math.hypot(...net.vectors[0]!) / 2.5).toBeCloseTo(
      Math.hypot(...netPerSite({ kind: 'canted', angle: Math.PI / 6, q: 0 })),
      12,
    );
    const h = build('m05s-noncollinear', { j2: -0.5 });
    expect(readout(h, 'Best helix q (J1 > 0)')).toBe(`${helixOptimum(1, -0.5).toFixed(3)} x 2 pi / a`);
    expect(helixOptimum(1, -0.5)).toBeCloseTo(1 / 6, 12);
    const flat = build('m05s-noncollinear', { j2: -0.2 });
    expect(readout(flat, 'Best helix q (J1 > 0)')).toBe('0.000 x 2 pi / a');
  });

  it('spin heads are open exactly where the spin points down in the SAXIS frame', () => {
    const f = build('m05s-noncollinear', { texture: 'canted', angle: 10 });
    const a = layersOf(f, 'arrows', 'spins')[0] as ArrowsLayer;
    (a.head as string[]).forEach((h, j) => expect(h).toBe(j % 2 === 0 ? 'solid' : 'open'));
    const atomsLayer = layersOf(f, 'atoms', 'atoms')[0] as AtomsLayer;
    expect(atomsLayer.positions).toHaveLength(16);
    const lab = layersOf(f, 'labels')[0] as LabelsLayer;
    expect(lab.items.length).toBeLessThanOrEqual(12);
  });
});
