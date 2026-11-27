// The shared VESTA-style look (D-122) in the engine: element colours, two-tone bonds, the Studio finish and the axes marker.
import { describe, expect, it } from 'vitest';
import {
  InstancedMesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Quaternion,
  Vector3,
} from 'three';
import { elementColor, VESTA_MATERIAL, VESTA_SIZES } from '../three/vestaStyle';
import { crystalLayers, speciesTones } from './kit';
import type { Structure } from '../crystal/types';
import type { LinesLayer } from './types';
import { buildLayers, gizmoAxes } from './Viewer3D';

const nacl: Structure = {
  lattice: [
    [5.64, 0, 0],
    [0, 5.64, 0],
    [0, 0, 5.64],
  ],
  species: ['Na', 'Cl'],
  frac: [
    [0, 0, 0],
    [0.5, 0, 0],
  ],
} as unknown as Structure;

describe('the shared look in the engine', () => {
  it('colours a species by its element, the same in every structure', () => {
    expect(speciesTones(['Cl', 'Na']).get('Na')).toBe(elementColor('Na'));
    expect(speciesTones(['Na', 'Cl']).get('Na')).toBe(elementColor('Na'));
  });

  it('draws two-tone bonds: each half in its atom colour, meeting at the midpoint', () => {
    const { layers } = crystalLayers(nacl, { repeat: [2, 1, 1] });
    const bonds = layers.filter((l): l is LinesLayer => l.kind === 'lines' && l.group === 'bonds');
    expect(bonds.length).toBe(2);
    expect(new Set(bonds.map((b) => b.color))).toEqual(new Set([elementColor('Na'), elementColor('Cl')]));
    for (const b of bonds) expect(b.tube).toBe(VESTA_SIZES.bondRadius);
    const na = bonds.find((b) => b.color === elementColor('Na'))!;
    const cl = bonds.find((b) => b.color === elementColor('Cl'))!;
    expect(na.segments.length).toBe(cl.segments.length);
    // every Na half ends where a Cl half starts
    const ends = new Set(na.segments.map(([, e]) => e.map((x) => x.toFixed(4)).join()));
    const starts = [...cl.segments, ...na.segments].map(([a, e]) =>
      [a, e].map((p) => p.map((x) => x.toFixed(4)).join()),
    );
    expect([...ends].every((e) => starts.some((pair) => pair.includes(e)))).toBe(true);
  });

  it('uses the Studio finish for atoms and bonds', () => {
    const { layers } = crystalLayers(nacl);
    const built = buildLayers(layers, 'light', { createElement: () => ({}) } as unknown as Document);
    const mats: MeshStandardMaterial[] = [];
    built.root.traverse((o) => {
      if (o instanceof InstancedMesh && o.material instanceof MeshStandardMaterial) mats.push(o.material);
    });
    const atomMat = mats.find((m) => m.roughness === VESTA_MATERIAL.atom.roughness);
    const bondMat = mats.find((m) => m.roughness === VESTA_MATERIAL.bond.roughness);
    expect(atomMat?.metalness).toBe(VESTA_MATERIAL.atom.metalness);
    expect(bondMat?.metalness).toBe(VESTA_MATERIAL.bond.metalness);
  });

  it('points the axes marker along the screen directions of a, b and c, nearest drawn last', () => {
    const cam = new PerspectiveCamera();
    cam.position.set(0, 0, 10);
    cam.lookAt(new Vector3());
    const ax = gizmoAxes(cam, [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    const byLabel = Object.fromEntries(ax.map((a) => [a.label, a]));
    expect(byLabel.a!.x).toBeCloseTo(1);
    expect(byLabel.b!.y).toBeCloseTo(1);
    expect(byLabel.c!.depth).toBeCloseTo(1);
    expect(ax[2]!.label).toBe('c');
    const o = new OrthographicCamera();
    o.quaternion.copy(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2));
    expect(
      gizmoAxes(o)
        .map((a) => a.label)
        .sort(),
    ).toEqual(['x', 'y', 'z']);
  });
});
