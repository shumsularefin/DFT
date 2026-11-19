import { describe, expect, it } from 'vitest';
import type { Structure } from '../crystal/types';
import { cameraDirection, projectPoint, projectScene, viewBasis } from './project';
import { planePolygon, resolveScene } from './resolve';
import type { SceneSpec } from './spec';

const cube: Structure = {
  lattice: [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ],
  species: ['X'],
  frac: [[0, 0, 0]],
};

describe('projection', () => {
  it('a unit cube viewed along [001] is a square and the back vertices sit on the front ones', () => {
    const v = viewBasis(cameraDirection('c', cube.lattice));
    const front: [number, number, number][] = [];
    const back: [number, number, number][] = [];
    for (const x of [0, 1])
      for (const y of [0, 1]) {
        front.push([x, y, 1]);
        back.push([x, y, 0]);
      }
    front.forEach((f, i) => {
      const p = projectPoint(f, v);
      const q = projectPoint(back[i]!, v);
      expect(Math.abs(p.x - q.x)).toBeLessThan(1e-9);
      expect(Math.abs(p.y - q.y)).toBeLessThan(1e-9);
      expect(p.depth).toBeGreaterThan(q.depth); // the +c face is nearer the camera
    });
    const xs = front.map((f) => projectPoint(f, v).x);
    const ys = front.map((f) => projectPoint(f, v).y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 9);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1, 9);
    // a to the right, b up
    expect(projectPoint([1, 0, 0], v).x).toBeGreaterThan(projectPoint([0, 0, 0], v).x);
    expect(projectPoint([0, 1, 0], v).y).toBeGreaterThan(projectPoint([0, 0, 0], v).y);
  });

  it('painter order: the nearer atom is drawn last', () => {
    const s: Structure = {
      ...cube,
      species: ['A', 'B'],
      frac: [
        [0.5, 0.5, 0.2],
        [0.5, 0.5, 0.8],
      ],
    };
    const spec: SceneSpec = {
      id: 't',
      badge: 'illustrative',
      alt: 'two atoms behind one another',
      structure: s,
      camera: 'c',
      show: { cell: false },
    };
    const pr = projectScene(
      resolveScene(spec, () => undefined),
      s.lattice,
    ).primitives.filter((p) => p.kind === 'circle');
    expect(pr).toHaveLength(2);
    // B (z = 0.8) is nearer a camera on +c, so it is last in the list
    const colours = resolveScene(spec, () => undefined).atoms.map((a) => a.color);
    expect((pr[1] as { fill: string }).fill).toBe(colours[1]);
  });

  it('vertical camera keeps a stable screen frame', () => {
    const v = viewBasis([0, 1, 0]);
    expect(v.right[0]).toBeCloseTo(1, 12);
    expect(Math.abs(v.right[1]) + Math.abs(v.right[2])).toBeCloseTo(0, 12);
  });
});

describe('planes', () => {
  it('(111) of a cube is a triangle with vertices on the axes', () => {
    const poly = planePolygon([1, 1, 1], cube.lattice);
    expect(poly).toHaveLength(3);
    for (const p of poly) expect(p[0] + p[1] + p[2]).toBeCloseTo(1, 9);
  });
  it('(110) of a cube is a rectangle through (1,0,0), (0,1,0) and the c edge', () => {
    expect(planePolygon([1, 1, 0], cube.lattice)).toHaveLength(4);
  });
});

describe('resolve', () => {
  it('spins must match the site count', () => {
    const spec: SceneSpec = {
      id: 'x',
      badge: 'illustrative',
      alt: 'text alternative here',
      structure: cube,
      spins: [1, -1],
    };
    expect(() => resolveScene(spec, () => undefined)).toThrow(/spins count/);
  });
  it('zero-moment sites get no arrow; up and down differ in head style', () => {
    const s: Structure = {
      ...cube,
      species: ['A', 'A', 'A'],
      frac: [
        [0, 0, 0],
        [0.5, 0.5, 0],
        [0, 0.5, 0.5],
      ],
    };
    const spec: SceneSpec = {
      id: 'x',
      badge: 'illustrative',
      alt: 'three sites, up, down, zero',
      structure: s,
      spins: [2, -2, 0],
      show: { cell: false },
    };
    const r = resolveScene(spec, () => undefined);
    const arrows = projectScene(r, s.lattice).primitives.filter((p) => p.kind === 'arrow') as {
      head: string;
    }[];
    expect(new Set(arrows.map((a) => a.head))).toEqual(new Set(['solid', 'open']));
  });
  it('repeat changes the picture only, not the structure', () => {
    const spec: SceneSpec = {
      id: 'x',
      badge: 'illustrative',
      alt: 'a repeated cell for display',
      structure: cube,
      repeat: [2, 2, 1],
    };
    const r = resolveScene(spec, () => undefined);
    expect(r.structure.frac).toHaveLength(1);
    expect(r.atoms.length).toBeGreaterThan(4);
  });
});

import { rotateCamera } from './project';
describe('rotateCamera', () => {
  it('turns by the step and clamps short of the poles', () => {
    const c = rotateCamera({ azimuth: 10, elevation: 20 }, cube.lattice, 5, 0);
    expect(c).toEqual({ azimuth: 15, elevation: 20 });
    expect(rotateCamera({ azimuth: 0, elevation: 88 }, cube.lattice, 0, 10).elevation).toBe(89);
  });
  it('a preset becomes an explicit camera pointing the same way', () => {
    const c = rotateCamera('iso', cube.lattice, 0, 0);
    expect(c.azimuth).toBe(45);
  });
});
