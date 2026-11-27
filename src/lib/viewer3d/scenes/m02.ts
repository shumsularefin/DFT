// Module 2 (quantum basics) scenes. Reference pattern for every scene module: pure generators, real libraries, honest badges.
// @source S-047 (hydrogen orbitals), S-031 (Bohr radius)
import {
  energyEV,
  listOrbitals,
  radial,
  radialNodeRadii,
  radialQuantile,
  realYlm,
  sampleOrbital,
} from '../../physics/hydrogen';
import { axesLayers, fmt, isosurfaceLayer, labels, points, sphereLayer } from '../kit';
import type { Color, Layer, SceneDef, Vec3 } from '../types';

const ORBITALS = listOrbitals(4);

function psi(n: number, l: number, m: number): (x: number, y: number, z: number) => number {
  return (x, y, z) => {
    const r = Math.hypot(x, y, z);
    if (r < 1e-9) return l === 0 ? radial(n, 0, 0) * realYlm(0, 0, 0, 0, 1) : 0;
    return radial(n, l, r) * realYlm(l, m, x / r, y / r, z / r);
  };
}

const orbital: SceneDef = {
  id: 'm02-orbital',
  title: 'Hydrogen orbital in 3D',
  badge: 'computed',
  sources: ['S-047', 'S-031'],
  params: [
    {
      kind: 'select',
      id: 'orbital',
      label: 'Orbital',
      physics: true,
      value: '2p_z',
      options: ORBITALS.map((o) => ({ value: o.label, label: o.label.replace('_', ' ') })),
    },
    {
      kind: 'slider',
      id: 'level',
      label: 'Surface level',
      min: 0.05,
      max: 0.6,
      step: 0.01,
      value: 0.2,
      digits: 2,
      physics: true,
    },
    { kind: 'toggle', id: 'cloud', label: 'Probability cloud', value: false },
    { kind: 'toggle', id: 'nodes', label: 'Radial nodes', value: true },
  ],
  build(p) {
    const o = ORBITALS.find((x) => x.label === p.orbital) ?? ORBITALS[2]!;
    const { n, l, m } = o;
    const f = psi(n, l, m);
    const R = radialQuantile(n, l, 0.97) * 1.05; // in a0: the box that holds the orbital
    // the largest |psi| on a coarse grid sets the surface level as a fraction of it
    let peak = 0;
    const c = 24;
    for (let i = 0; i < c; i++)
      for (let j = 0; j < c; j++)
        for (let k = 0; k < c; k++) {
          const x = -R + (2 * R * (i + 0.5)) / c;
          const y = -R + (2 * R * (j + 0.5)) / c;
          const z = -R + (2 * R * (k + 0.5)) / c;
          peak = Math.max(peak, Math.abs(f(x, y, z)));
        }
    const level = Number(p.level) * peak;
    const lo: Vec3 = [-R, -R, -R];
    const hi: Vec3 = [R, R, R];
    const N = n >= 3 ? 46 : 40;
    const layers: Layer[] = [
      isosurfaceLayer(f, lo, hi, N, level, {
        group: 'lobes',
        name: 'Positive lobes',
        color: 'pos',
        opacity: 0.85,
      }),
      isosurfaceLayer((x, y, z) => -f(x, y, z), lo, hi, N, level, {
        group: 'lobes',
        color: 'neg',
        opacity: 0.85,
      }),
      ...axesLayers(R * 0.9, ['x', 'y', 'z']),
    ];
    const nodes = radialNodeRadii(n, l);
    if (p.nodes && nodes.length)
      for (const r of nodes)
        layers.push(
          sphereLayer([0, 0, 0], r, {
            group: 'nodes',
            name: 'Radial nodes',
            color: 'muted',
            opacity: 0.15,
            wireframe: true,
            segments: 20,
          }),
        );
    if (p.cloud) {
      const cloud = sampleOrbital(n, l, m, 2500, 11);
      const pos: Vec3[] = [];
      const col: Color[] = [];
      for (let i = 0; i < cloud.signs.length; i++) {
        pos.push([cloud.positions[3 * i]!, cloud.positions[3 * i + 1]!, cloud.positions[3 * i + 2]!]);
        col.push(cloud.signs[i]! > 0 ? 'pos' : 'neg');
      }
      layers.push(points(pos, col, R * 0.006, 'cloud', { name: 'Probability cloud' }));
    }
    layers.push(labels([{ text: 'nucleus', at: [0, 0, 0] }], 'labels'));
    const angular = l;
    const describe =
      `The ${o.label.replace('_', ' ')} orbital of hydrogen, drawn as the surface where the wavefunction equals ` +
      `plus or minus ${fmt(Number(p.level) * 100, 0)} percent of its largest value. Orange lobes are positive, blue lobes negative. ` +
      `It has ${nodes.length} radial node${nodes.length === 1 ? '' : 's'}${nodes.length ? ` at ${nodes.map((r) => fmt(r, 1)).join(' and ')} a0` : ''} ` +
      `and ${angular} angular node${angular === 1 ? '' : 's'}; the box shown is ${fmt(2 * R, 0)} a0 across.`;
    return {
      layers,
      describe,
      camera: 'iso',
      readouts: [
        { label: 'n, l', value: `${n}, ${l}` },
        { label: 'Radial nodes', value: String(nodes.length) },
        { label: 'Angular nodes', value: String(angular) },
        { label: 'Energy', value: `${fmt(energyEV(n), 2)} eV` },
      ],
      axes: ['x (a0)', 'y (a0)', 'z (a0)'],
    };
  },
};

export const scenes: Record<string, SceneDef> = { [orbital.id]: orbital };
