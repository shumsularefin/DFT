import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Structure } from '../crystal/types';
import { convexHull, coordinationPolyhedra, neighbours, triangleCount } from './polyhedra';

// Golden cells from tests/reference/kpaths.json (made by scripts/reference/gen_kpaths.py, never hand-edited).
const gold = JSON.parse(readFileSync('tests/reference/kpaths.json', 'utf8')).structures as Record<
  string,
  { input: { lattice_rows: number[][]; frac_coords: number[][]; atomic_numbers: number[] } }
>;
const Z: Record<number, string> = { 8: 'O', 11: 'Na', 17: 'Cl', 22: 'Ti', 38: 'Sr' };
const fromGold = (id: string): Structure => {
  const g = gold[id]!.input;
  return {
    lattice: g.lattice_rows as unknown as Structure['lattice'],
    species: g.atomic_numbers.map((z) => Z[z]!),
    frac: g.frac_coords as unknown as Structure['frac'],
  };
};

describe('convexHull', () => {
  it('octahedron: 8 faces, 12 edges', () => {
    const h = convexHull([
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ]);
    expect(h.faces).toHaveLength(8);
    expect(h.edges).toHaveLength(12);
  });
  it('cube: 6 square faces merged from coplanar points, 12 edges', () => {
    const pts: [number, number, number][] = [];
    for (const x of [0, 1]) for (const y of [0, 1]) for (const z of [0, 1]) pts.push([x, y, z]);
    const h = convexHull(pts);
    expect(h.faces).toHaveLength(6);
    expect(h.faces.every((f) => f.length === 4)).toBe(true);
    expect(h.edges).toHaveLength(12);
    expect(triangleCount(h.faces)).toBe(12);
  });
  it('returns nothing for coplanar points', () => {
    expect(
      convexHull([
        [0, 0, 0],
        [1, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ]).faces,
    ).toHaveLength(0);
  });
});

describe('coordination polyhedra of golden cells', () => {
  it('cubic SrTiO3: one TiO6 octahedron per Ti, Ti-O = a/2', () => {
    const s = fromGold('cubic_perovskite_SrTiO3');
    const a = s.lattice[0][0];
    const p = coordinationPolyhedra(s, { centre: ['Ti'], ligand: ['O'], cutoffA: 2.3 });
    expect(p).toHaveLength(1);
    const oct = p[0]!;
    expect(oct.vertices).toHaveLength(6);
    expect(oct.faces).toHaveLength(8);
    expect(oct.edges).toHaveLength(12);
    for (const v of oct.vertices) expect(Math.abs(v.distance - a / 2)).toBeLessThan(1e-9);
  });
  it('rock-salt NaCl: every Na has 6 Cl at a/2', () => {
    const s = fromGold('rocksalt_NaCl');
    const a = s.lattice[0][0];
    s.species.forEach((sp, i) => {
      if (sp !== 'Na') return;
      const n = neighbours(s, i, ['Cl'], a / 2 + 0.01);
      expect(n).toHaveLength(6);
      for (const v of n) expect(Math.abs(v.distance - a / 2)).toBeLessThan(1e-9);
    });
  });
  it('a cutoff below the bond length gives no polyhedron', () => {
    const s = fromGold('cubic_perovskite_SrTiO3');
    expect(coordinationPolyhedra(s, { centre: ['Ti'], ligand: ['O'], cutoffA: 1.0 })).toHaveLength(0);
  });
});
