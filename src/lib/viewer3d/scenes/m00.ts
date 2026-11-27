// Module 0 (start) scene: the stage itself, shown on a small rock-salt crystal you can turn, read and change.
// @source S-036 (Ashcroft and Mermin: the sodium chloride structure, nearest neighbours at a/2), S-043 (VESTA view
// conventions: orthographic crystal views along a, b, c)
import type { Mat3, Structure } from '../../crystal/types';
import { lookupStructure } from '../../scene/library';
import { arrows, crystalLayers, fmt, labels } from '../kit';
import { norm, sub } from '../math';
import type { AtomsLayer, Layer, SceneDef, Vec3 } from '../types';

const ROCKSALT = lookupStructure('rocksalt')!;
const A0 = ROCKSALT.lattice[0][0]; // 5.64 A, the preset cell

function scaled(s: Structure, a: number): Structure {
  const f = a / A0;
  return {
    ...s,
    lattice: s.lattice.map((r) => r.map((x) => x * f)) as unknown as Mat3,
  };
}

const tour: SceneDef = {
  id: 'm00-tour',
  title: 'A rock-salt crystal on the stage',
  badge: 'computed',
  sources: ['S-036', 'S-043'],
  params: [
    {
      kind: 'slider',
      id: 'a',
      label: 'Lattice constant a',
      min: 5,
      max: 6.4,
      step: 0.02,
      value: A0,
      unit: 'Angstrom',
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'repeat',
      label: 'Cells along each axis',
      min: 1,
      max: 3,
      step: 1,
      value: 1,
      digits: 0,
      physics: true,
    },
    { kind: 'toggle', id: 'pick', label: 'Pick the centre Cl atom', value: false },
    { kind: 'toggle', id: 'bonds', label: 'Bonds', value: true },
  ],
  build(p) {
    const a = Number(p.a);
    const r = Math.round(Number(p.repeat));
    const s = scaled(ROCKSALT, a);
    const { layers, positions, species } = crystalLayers(s, {
      repeat: [r, r, r],
      boundary: true,
      bonds: Boolean(p.bonds),
    });
    const nn = a / 2;
    const centre: Vec3 = [a / 2, a / 2, a / 2];
    const ci = positions.findIndex((q) => norm(sub(q, centre)) < 1e-6);
    const neighbours = positions
      .map((q, i) => [i, norm(sub(q, centre))] as const)
      .filter(([i, d]) => i !== ci && Math.abs(d - nn) < 1e-6)
      .map(([i]) => i);
    const atomsLayer = layers.find((l): l is AtomsLayer => l.kind === 'atoms')!;
    if (p.pick && ci >= 0) atomsLayer.highlight = [ci, ...neighbours];
    const lat = s.lattice.map((v) => [v[0], v[1], v[2]]) as [Vec3, Vec3, Vec3];
    const out: Layer[] = [
      ...layers,
      arrows(
        [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
        lat,
        'muted',
        'axes',
        { name: 'Cell vectors a, b, c', thickness: 0.012 },
      ),
      labels(
        [
          { text: 'a', at: [a * 1.06, 0, 0] },
          { text: 'b', at: [0, a * 1.06, 0] },
          { text: 'c', at: [0, 0, a * 1.06] },
          { text: `a = ${fmt(a, 2)} A`, at: [a / 2, -0.7, -0.4] },
          { text: 'Na', at: [-0.6, -0.6, 0] },
          { text: 'Cl', at: [a / 2 - 0.6, -0.6, 0] },
        ],
        'labels',
      ),
    ];
    if (p.pick && ci >= 0)
      out.push(labels([{ text: `Cl, six Na at ${fmt(nn, 2)} A`, at: [a / 2, a / 2, a / 2 + 0.9] }], 'pick'));
    const nNa = species.filter((x) => x === 'Na').length;
    const nCl = species.length - nNa;
    const describe =
      `Rock salt (NaCl) with lattice constant ${fmt(a, 2)} A, ${r} by ${r} by ${r} cell${r === 1 ? '' : 's'}: ${species.length} atoms drawn ` +
      `(${nNa} Na and ${nCl} Cl, counting the copies on the far faces, edges and corners). Each ion sits between six of the other kind ` +
      `at a/2 = ${fmt(nn, 2)} A along x, y and z.` +
      (p.pick && ci >= 0
        ? ` The picked Cl at the cell centre is outlined with its ${neighbours.length} Na neighbours.`
        : '');
    return {
      layers: out,
      describe,
      lattice: lat,
      ortho: true,
      camera: 'iso',
      readouts: [
        { label: 'Lattice constant', value: `${fmt(a, 2)} A` },
        { label: 'Na to Cl', value: `${fmt(nn, 2)} A` },
        { label: 'Cell volume', value: `${fmt(a ** 3, 1)} A^3 (4 NaCl)` },
        { label: 'Atoms drawn', value: String(species.length) },
      ],
    };
  },
};

export const scenes: Record<string, SceneDef> = { [tour.id]: tour };
