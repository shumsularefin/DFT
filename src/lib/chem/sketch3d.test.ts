import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../crystal/types';
import { geometry3d } from './geom3d';
import {
  MOLECULE_PRESETS,
  fillHydrogens,
  grapheneFlake,
  graphFromDistances,
  neighbours,
  placeBonded,
  radiusOf,
} from './sketch3d';

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const angle = (a: Vec3, c: Vec3, b: Vec3) => {
  const u = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const v = [b[0] - c[0], b[1] - c[1], b[2] - c[2]];
  const d = u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
  return (Math.acos(d / (Math.hypot(...u) * Math.hypot(...v))) * 180) / Math.PI;
};

describe('placeBonded', () => {
  it('puts the new atom at the sum of covalent radii from the anchor', () => {
    const p = placeBonded(['C'], [[0, 0, 0]], 0, 'O');
    expect(dist(p, [0, 0, 0])).toBeCloseTo(radiusOf('C') + radiusOf('O'), 6);
  });

  it('keeps the tetrahedral angle at a carbon that already has a bond', () => {
    const species = ['C', 'C'];
    const positions: Vec3[] = [
      [0, 0, 0],
      [1.52, 0, 0],
    ];
    const p = placeBonded(species, positions, 1, 'C');
    expect(angle(positions[0]!, positions[1]!, p)).toBeGreaterThan(104);
    expect(angle(positions[0]!, positions[1]!, p)).toBeLessThan(115);
  });
});

describe('fillHydrogens', () => {
  it('turns one carbon into methane with tetrahedral H-C-H angles', () => {
    const h = fillHydrogens(['C'], [[0, 0, 0]]);
    expect(h).toHaveLength(4);
    for (const p of h) expect(dist(p, [0, 0, 0])).toBeCloseTo(radiusOf('C') + radiusOf('H'), 6);
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        expect(angle(h[i]!, [0, 0, 0], h[j]!)).toBeGreaterThan(104);
        expect(angle(h[i]!, [0, 0, 0], h[j]!)).toBeLessThan(115);
      }
  });

  it('gives water two hydrogens and leaves metals alone', () => {
    expect(fillHydrogens(['O'], [[0, 0, 0]])).toHaveLength(2);
    expect(fillHydrogens(['Fe'], [[0, 0, 0]])).toHaveLength(0);
  });

  it('adds nothing to a molecule whose valences are full', () => {
    const r = geometry3d(MOLECULE_PRESETS.find((p) => p.id === 'methane')!.graph);
    expect(fillHydrogens(r.species, r.positions)).toHaveLength(0);
  });
});

describe('presets and bonds from distances', () => {
  it('every preset builds, and its bonds from distances match its graph', () => {
    for (const p of MOLECULE_PRESETS) {
      const r = geometry3d(p.graph);
      const g = graphFromDistances(r.species, r.positions);
      expect(g.bonds.length, p.id).toBe(r.graph.bonds.length);
    }
  });

  it('neighbours ignores atoms beyond 1.2 times the covalent sum', () => {
    expect(
      neighbours(
        ['C', 'C'],
        [
          [0, 0, 0],
          [3, 0, 0],
        ],
        0,
      ),
    ).toEqual([]);
  });
});

describe('grapheneFlake', () => {
  it('builds coronene, C24H12, flat, with 1.42 A carbon bonds', () => {
    const f = grapheneFlake();
    expect(f.species.filter((e) => e === 'C')).toHaveLength(24);
    expect(f.species.filter((e) => e === 'H')).toHaveLength(12);
    expect(f.positions.every((p) => p[2] === 0)).toBe(true);
    const c = f.positions.slice(0, 24);
    const nearest = c.map((p, i) => Math.min(...c.filter((_, j) => j !== i).map((q) => dist(p, q))));
    for (const d of nearest) expect(d).toBeCloseTo(1.42, 6);
  });
});
