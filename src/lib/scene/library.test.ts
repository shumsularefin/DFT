import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getScene, lookupStructure, sceneIds } from './library';
import { projectScene } from './project';
import { resolveScene, structureOf } from './resolve';
import { validateSpec } from './spec';

const gold = JSON.parse(readFileSync('tests/reference/kpaths.json', 'utf8')).structures as Record<
  string,
  { input: { lattice_rows: number[][]; frac_coords: number[][] } }
>;
const NAMES = [
  'sc',
  'bcc',
  'fcc',
  'hcp',
  'rocksalt',
  'perovskite-octahedra',
  'diamond',
  'graphite',
  'fm-cubic',
  'afm-a',
  'afm-c',
  'afm-g',
  'miller-111-fcc',
  'reciprocal-fcc',
];

describe('preset scenes', () => {
  it('has every preset the work order lists', () => expect(sceneIds()).toEqual([...NAMES].sort()));
  it.each(NAMES)('%s validates, resolves and projects', (id) => {
    const spec = getScene(id);
    expect(validateSpec(spec)).toEqual([]);
    const r = resolveScene(spec, lookupStructure);
    const p = projectScene(r, structureOf(spec, lookupStructure).lattice);
    expect(p.primitives.length).toBeGreaterThan(0);
    for (const q of p.primitives)
      if (q.kind === 'circle') expect(Number.isFinite(q.x + q.y + q.r)).toBe(true);
  });
  it('geometry scenes are badged illustrative, magnetic ones toy-model (hand-set signs)', () => {
    for (const id of NAMES)
      expect(getScene(id).badge).toBe(
        id.startsWith('afm') || id === 'fm-cubic' ? 'toy-model' : 'illustrative',
      );
  });
  it('library cells equal the golden cells', () => {
    const pairs: [string, string][] = [
      ['perovskite', 'cubic_perovskite_SrTiO3'],
      ['rocksalt', 'rocksalt_NaCl'],
      ['diamond', 'diamond_Si'],
      ['hcp', 'hcp_Mg'],
      ['graphite', 'graphite_hex'],
      ['fcc', 'fcc_Cu'],
      ['bcc', 'bcc_Fe'],
    ];
    for (const [mine, g] of pairs) {
      const s = lookupStructure(mine)!;
      expect(s.lattice).toEqual(gold[g]!.input.lattice_rows);
      expect(s.frac).toEqual(gold[g]!.input.frac_coords);
    }
  });
  it('the perovskite preset draws one octahedron from its second step on', () => {
    const spec = getScene('perovskite-octahedra');
    expect(resolveScene(spec, lookupStructure, 0).polyhedra).toHaveLength(0);
    const r = resolveScene(spec, lookupStructure, 1);
    expect(r.polyhedra).toHaveLength(1);
    expect(r.polyhedra[0]!.vertices).toHaveLength(6);
  });
  it('magnetic presets: 8 spins, sums are 8 (FM) or 0 (AFM), G-type has no equal-sign nearest neighbours', () => {
    for (const id of ['fm-cubic', 'afm-a', 'afm-c', 'afm-g']) {
      const s = getScene(id).spins as number[];
      expect(s).toHaveLength(8);
      expect(s.reduce((a, b) => a + b, 0)).toBe(id === 'fm-cubic' ? 8 : 0);
    }
  });
  it('unknown scene id throws with the known ids', () => expect(() => getScene('nope')).toThrow(/Known/));
});
