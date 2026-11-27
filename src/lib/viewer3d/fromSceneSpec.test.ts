import { describe, expect, it } from 'vitest';
import { covalentRadius } from '../crystal/covalent';
import { getScene, lookupStructure, sceneIds } from '../scene/library';
import { resolveScene } from '../scene/resolve';
import { elementColor, VESTA_SIZES } from '../three/vestaStyle';
import { validateFrame } from './kit';
import { cameraOfPreset, frameFromResolved, MINUS } from './fromSceneSpec';
import type { ArrowsLayer, AtomsLayer, LabelsLayer, Layer, LinesLayer, MeshLayer } from './types';

const frameOf = (id: string, step = -1) => {
  const spec = getScene(id);
  const r = resolveScene(spec, lookupStructure, step);
  return { r, f: frameFromResolved(r, spec.alt) };
};
const ofKind = <K extends Layer['kind']>(ls: Layer[], k: K) =>
  ls.filter((l): l is Extract<Layer, { kind: K }> => l.kind === k);

describe('SceneSpec presets as engine frames (M16.4)', () => {
  it('every preset and every step gives a valid crystal frame centred on the origin', () => {
    for (const id of sceneIds()) {
      const steps = getScene(id).steps?.length ?? 0;
      for (let s = -1; s < steps; s++) {
        const { r, f } = frameOf(id, s);
        expect(validateFrame(f), `${id} ${s}`).toEqual([]);
        expect(f.ortho, id).toBe(true);
        expect(f.lattice, id).toEqual(r.structure.lattice);
        expect(f.bounds!.center).toEqual([0, 0, 0]);
        // every drawn point lies inside the framing radius
        for (const a of r.atoms) expect(Math.hypot(...a.cart)).toBeLessThanOrEqual(f.bounds!.radius + 1e-9);
      }
    }
  });

  it('atoms keep the resolved positions, in element colours, at 0.42 of the covalent radius', () => {
    const { r, f } = frameOf('rocksalt');
    const atoms = ofKind(f.layers, 'atoms')[0] as AtomsLayer;
    expect(atoms.positions).toEqual(r.atoms.map((a) => a.cart));
    const na = r.atoms.findIndex((a) => a.species === 'Na');
    expect((atoms.color as string[])[na]).toBe(elementColor('Na'));
    expect((atoms.radius as number[])[na]).toBeCloseTo(
      covalentRadius('Na').radius * VESTA_SIZES.atomScale,
      12,
    );
    expect(atoms.labels![na]).toMatch(/^Na \d+/);
    expect(atoms.group).toBe('atoms');
  });

  it('bonds are two-tone halves, one tube layer per element, meeting at the midpoint', () => {
    const { r, f } = frameOf('diamond');
    expect(r.bonds.length).toBeGreaterThan(0);
    const bonds = ofKind(f.layers, 'lines').filter((l) => l.group === 'bonds') as LinesLayer[];
    const el = r.structure.species[0]!;
    expect(new Set(r.structure.species).size).toBe(1); // the diamond structure has one element
    expect(bonds.length).toBe(1);
    expect(bonds[0]!.color).toBe(elementColor(el));
    expect(bonds[0]!.tube).toBe(VESTA_SIZES.bondRadius);
    expect(bonds[0]!.segments.length).toBe(2 * r.bonds.length);
    const [a, b] = r.bonds[0]!;
    const mid = a.map((x, i) => (x + b[i]!) / 2);
    expect(bonds[0]!.segments[0]![1]).toEqual(mid);
  });

  it('the cell edges are a muted lines layer', () => {
    const { r, f } = frameOf('sc');
    const cell = f.layers.find((l) => l.group === 'cell') as LinesLayer;
    expect(cell.color).toBe('muted');
    expect(cell.segments).toEqual(r.cellEdges);
    expect(cell.segments.length).toBe(12);
  });

  it('polyhedra are translucent meshes with edges in the colour of the centre atom', () => {
    const { r, f } = frameOf('perovskite-octahedra', 1);
    expect(r.polyhedra.length).toBeGreaterThan(0);
    const polys = f.layers.filter((l) => l.group === 'polyhedra') as MeshLayer[];
    expect(polys.length).toBe(r.polyhedra.length);
    for (const p of polys) {
      expect(p.edges).toBe(true);
      expect(p.opacity).toBe(VESTA_SIZES.polyhedronOpacity);
      expect(p.positions.length % 9).toBe(0);
    }
    const centre = r.atoms.find((a) =>
      a.cart.every((x, i) => Math.abs(x - r.polyhedra[0]!.centre[i]!) < 1e-6),
    )!;
    expect(polys[0]!.color).toBe(elementColor(centre.species));
    // the first step shows none
    expect(frameOf('perovskite-octahedra', 0).f.layers.some((l) => l.group === 'polyhedra')).toBe(false);
  });

  it('spin down gets an open head and a minus label, spin up a solid head and a plus', () => {
    const { r, f } = frameOf('afm-g');
    const arrows = f.layers.find((l) => l.kind === 'arrows' && l.group === 'spins') as ArrowsLayer;
    const heads = arrows.head as string[];
    expect(heads.length).toBe(r.spins.length);
    r.spins.forEach((s, i) => expect(heads[i]).toBe(s.sign > 0 ? 'solid' : 'open'));
    expect(heads).toContain('open');
    expect(heads).toContain('solid');
    const signs = (f.layers.find((l) => l.kind === 'labels' && l.group === 'spins') as LabelsLayer).items;
    expect(signs.map((s) => s.text).sort()).toEqual(r.spins.map((s) => (s.sign > 0 ? '+' : MINUS)).sort());
    expect(arrows.vectors).toEqual(r.spins.map((s) => s.vector));
  });

  it('lattice vectors are accent arrows with their labels', () => {
    const { r, f } = frameOf('reciprocal-fcc');
    if (!r.vectors.length) return;
    const arrows = f.layers.find((l) => l.group === 'vectors' && l.kind === 'arrows') as ArrowsLayer;
    expect(arrows.color).toBe('accent');
    expect(arrows.from.length).toBe(r.vectors.length);
    const lab = f.layers.find((l) => l.group === 'vectors' && l.kind === 'labels') as LabelsLayer;
    expect(lab.items.map((i) => i.text)).toEqual(r.vectors.map((v) => v.label));
  });

  it('the frame says what the preset says', () => {
    const spec = getScene('rocksalt');
    expect(frameOf('rocksalt').f.describe).toBe(spec.alt);
  });

  it('cameras: a, b, c become crystal views; iso and angles keep the flat view direction in physics axes', () => {
    const L = [
      [4, 0, 0],
      [0, 4, 0],
      [0, 0, 4],
    ];
    expect(cameraOfPreset('a', L)).toBe('a');
    expect(cameraOfPreset('c', L)).toBe('c');
    const iso = cameraOfPreset('iso', L) as { eye: number[]; up: number[] };
    // flat view iso: scene (1, 0.7, 1), scene axes are (x, z, -y): physics (1, -1, 0.7)
    const n = Math.hypot(1, 0.7, 1);
    expect(iso.eye[0]).toBeCloseTo(1 / n, 12);
    expect(iso.eye[1]).toBeCloseTo(-1 / n, 12);
    expect(iso.eye[2]).toBeCloseTo(0.7 / n, 12);
    expect(iso.up).toEqual([0, 0, 1]);
    const top = cameraOfPreset({ azimuth: 0, elevation: 90 }, L) as { eye: number[]; up: number[] };
    expect(top.eye[2]).toBeCloseTo(1, 12);
    expect(top.up).toEqual([0, 1, 0]);
  });
});
