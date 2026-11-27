// Module 12 (properties) scenes, M16.11. Pure generators on tested libraries: phonon chains, strain and the elastic
// tensor, the equation of state, the dielectric tensor, optical spectra, a Bader partition and a hub of small models.
// @source S-050 S-036 (phonon chains), S-042 S-072 S-076 S-158 (elasticity), S-061 S-062 S-068 (equation of state),
//   S-082 (dielectric function, Lorentz oscillator), S-029 S-084 (Bader), S-049 S-031 (tight-binding band, constants)
import { stability, invert6 } from '../../mechanics/elastic';
import { opticalPoint } from '../../optics/derived';
import { baderPartition, cropToLevel, gaussianAtom } from '../../physics/badergrid';
import { EV_PER_A3_IN_GPA, HBAR2_OVER_2M_EV_A2 } from '../../physics/constants';
import {
  directionalYoung,
  strainEnergyDensity,
  strainLattice,
  stressFromStrain,
  youngSurface,
} from '../../physics/elasticdir';
import { eosEnergy, fitEos, type EosFit, type EosForm } from '../../physics/eos';
import { lorentzEps, type Oscillator } from '../../physics/lorentz';
import {
  diatomicAmplitudes,
  diatomicGroupVelocity,
  diatomicOmega,
  chainDisplacements,
  zoneBoundaryGap,
} from '../../physics/phononchain';
import {
  alongDirection,
  direction,
  fromPrincipal,
  matVec,
  rotationY,
  symmetricEigen3,
} from '../../physics/tensor3';
import { dispersion } from '../../physics/tightbinding2d';
import { convexHull } from '../../scene/polyhedra';
import { lookupStructure } from '../../scene/library';
import {
  arrows,
  atoms,
  axesLayers,
  cellEdges,
  crystalLayers,
  curve,
  fmt,
  gridIsosurfaceLayer,
  hullLayer,
  labels,
  lines,
  surfaceLayer,
} from '../kit';
import { add, cross, dot, norm, normalize, scale, sub } from '../math';
import type { Color, Layer, MeshLayer, Params, SceneDef, Vec3 } from '../types';

const DEG = Math.PI / 180;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const num = (p: Params, k: string) => Number(p[k]);
const str = (p: Params, k: string) => String(p[k]);

/** Small bounded memo: heavy results keyed by the parameters that matter. */
function memo<T>(size = 24) {
  const m = new Map<string, T>();
  return (key: string, make: () => T): T => {
    const hit = m.get(key);
    if (hit !== undefined) return hit;
    const v = make();
    if (m.size >= size) m.delete(m.keys().next().value as string);
    m.set(key, v);
    return v;
  };
}

/** Move every coordinate of the layers by d. */
function shift(layers: Layer[], d: Vec3): Layer[] {
  const s = (p: Vec3): Vec3 => add(p, d);
  return layers.map((l): Layer => {
    switch (l.kind) {
      case 'atoms':
      case 'points':
        return { ...l, positions: l.positions.map(s) };
      case 'lines':
        return { ...l, segments: l.segments.map(([a, b]) => [s(a), s(b)] as [Vec3, Vec3]) };
      case 'curve':
        return { ...l, points: l.points.map(s) };
      case 'arrows':
        return { ...l, from: l.from.map(s) };
      case 'mesh':
        return { ...l, positions: l.positions.map((x, i) => x + d[i % 3]!) };
      case 'labels':
        return { ...l, items: l.items.map((it) => ({ ...it, at: s(it.at) })) };
    }
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Phonons: a diatomic ball-and-spring chain and its two branches as surfaces over q and the mass ratio.

const CHAIN_CELLS = 10;
const CHAIN_Y = -2.4;
const Q_UNITS = 8 / Math.PI; // scene units per (1/a) along the q axis: q = pi/a sits at x = 8
const R_UNITS = 2; // scene units per unit of mass ratio, ratio 1 at y = 0
const W_UNITS = 2.5; // scene units per sqrt(K/m1)

const phonons: SceneDef = {
  id: 'm12-phonon-chain',
  title: 'Phonons of a diatomic chain',
  badge: 'computed',
  sources: ['S-050', 'S-036'],
  params: [
    {
      kind: 'select',
      id: 'branch',
      label: 'Branch',
      physics: true,
      value: 'acoustic',
      options: [
        { value: 'acoustic', label: 'Acoustic' },
        { value: 'optical', label: 'Optical' },
      ],
    },
    {
      kind: 'slider',
      id: 'q',
      label: 'Wavevector q',
      unit: 'pi/a',
      min: 0,
      max: 1,
      step: 0.02,
      value: 0.3,
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'ratio',
      label: 'Mass ratio m2/m1',
      min: 1,
      max: 4,
      step: 0.1,
      value: 2,
      digits: 1,
      physics: true,
    },
    {
      kind: 'select',
      id: 'polarization',
      label: 'Polarization',
      physics: true,
      value: 'longitudinal',
      options: [
        { value: 'longitudinal', label: 'Longitudinal (along the chain)' },
        { value: 'transverse', label: 'Transverse (across the chain)' },
      ],
    },
    { kind: 'time', id: 't', label: 'Time (periods)', period: 1, value: 0, physics: true },
    { kind: 'toggle', id: 'surfaces', label: 'Dispersion surfaces', value: true },
  ],
  build(p) {
    const branch = str(p, 'branch') === 'optical' ? 1 : 0;
    const qr = clamp(num(p, 'q'), 0, 1);
    const q = qr * Math.PI; // a = 1
    const r = clamp(num(p, 'ratio'), 1, 4);
    const transverse = str(p, 'polarization') === 'transverse';
    const t = num(p, 't');
    const w = diatomicOmega(q, 1, r)[branch];
    const [gapLo, gapHi] = zoneBoundaryGap(1, r);
    const vg = diatomicGroupVelocity(q, 1, r, branch);
    const [u1, u2] = diatomicAmplitudes(q, 1, r, branch);
    const m1Amp = Math.hypot(u1.re, u1.im);
    const m2Amp = Math.hypot(u2.re, u2.im);
    const inPhase = u1.re * u2.re + u1.im * u2.im;
    // the chain: cells of length 1, atom 1 at n, atom 2 at n + 1/2, displaced along x or z
    const amp = transverse ? 0.32 : 0.16;
    const disp = chainDisplacements(CHAIN_CELLS, q, 1, r, branch, t, amp);
    const pos: Vec3[] = [];
    const rad: number[] = [];
    const col: Color[] = [];
    const lab: string[] = [];
    for (let n = 0; n < CHAIN_CELLS; n++)
      for (let j = 0; j < 2; j++) {
        const u = disp[2 * n + j]!;
        const x = n + j / 2;
        pos.push(transverse ? [x, CHAIN_Y, u] : [x + u, CHAIN_Y, 0]);
        rad.push(j === 0 ? 0.13 : 0.13 * Math.cbrt(r));
        col.push(j === 0 ? 'c0' : 'c1');
        lab.push(`${j === 0 ? 'm1' : 'm2'} in cell ${n + 1}`);
      }
    const springs: [Vec3, Vec3][] = [];
    for (let i = 0; i + 1 < pos.length; i++) springs.push([pos[i]!, pos[i + 1]!]);
    const layers: Layer[] = [
      atoms(pos, rad, col, 'chain', { name: 'Chain atoms', labels: lab }),
      lines(springs, 'muted', 'springs', { name: 'Springs', tube: 0.025 }),
      lines(
        [
          [
            [-0.3, CHAIN_Y, 0],
            [CHAIN_CELLS, CHAIN_Y, 0],
          ],
        ],
        'muted',
        'springs',
        { dashed: true },
      ),
    ];
    // the two branches over (q, ratio), and the slice at the current ratio
    const omegaAt = (x: number, y: number, b: 0 | 1) =>
      W_UNITS * diatomicOmega(x / Q_UNITS, 1, 1 + y / R_UNITS)[b];
    const yR = (r - 1) * R_UNITS;
    if (p.surfaces) {
      layers.push(
        surfaceLayer((x, y) => omegaAt(x, y, 0), [0, 8], [0, 6], 32, 24, {
          group: 'dispersion',
          name: 'Dispersion surfaces',
          color: 'neg',
          colormap: false,
          opacity: 0.5,
        }),
        surfaceLayer((x, y) => omegaAt(x, y, 1), [0, 8], [0, 6], 32, 24, {
          group: 'dispersion',
          color: 'pos',
          colormap: false,
          opacity: 0.5,
        }),
      );
    }
    const slice = (b: 0 | 1): Vec3[] =>
      Array.from({ length: 121 }, (_, i) => {
        const x = (8 * i) / 120;
        return [x, yR, omegaAt(x, yR, b)] as Vec3;
      });
    const marker: Vec3 = [q * Q_UNITS, yR, W_UNITS * w];
    layers.push(
      curve(slice(0), 'neg', 'branches', { name: 'Branches at this mass ratio', tube: 0.04 }),
      curve(slice(1), 'pos', 'branches', { tube: 0.04 }),
      atoms([marker], 0.16, 'accent', 'mode', {
        name: 'Chosen mode',
        labels: ['chosen mode'],
        highlight: [0],
      }),
      lines([[[marker[0], yR, 0], marker]], 'accent', 'mode', { dashed: true }),
      ...axesLayers([8.6, 6.6, 5.6], ['q (0 to pi/a)', 'm2/m1 (1 to 4)', 'omega / sqrt(K/m1)']),
      labels(
        [
          { text: 'm1', at: add(pos[0]!, [0, 0, 0.45]) },
          { text: 'm2', at: add(pos[1]!, [0, 0, 0.45]) },
          { text: 'acoustic', at: [8.3, yR, W_UNITS * gapLo] },
          { text: 'optical', at: [8.3, yR, W_UNITS * gapHi + 0.2] },
        ],
        'labels',
      ),
    );
    const name = branch ? 'optical' : 'acoustic';
    const still = branch === 0 && qr === 0;
    const phaseWords = still
      ? 'all atoms move together: a rigid translation with zero frequency'
      : m1Amp < 1e-9 || m2Amp < 1e-9
        ? `only the ${m1Amp < 1e-9 ? 'heavy m2' : 'light m1'} atoms move`
        : `neighbors move ${inPhase > 0 ? 'in phase' : 'against each other'}, the heavy m2 atoms ${fmt(m2Amp / m1Amp, 2)} times as far as m1`;
    const describe =
      `A chain of ${CHAIN_CELLS} cells with alternating masses (m2/m1 = ${fmt(r, 1)}) vibrating in the ${name} ` +
      `${transverse ? 'transverse' : 'longitudinal'} mode at q = ${fmt(qr, 2)} pi/a, frequency ${fmt(w, 3)} sqrt(K/m1); ${phaseWords}. ` +
      `Behind it the acoustic (blue) and optical (orange) branches are surfaces over q and the mass ratio; at this ratio ` +
      `the gap at the zone boundary runs from ${fmt(gapLo, 3)} to ${fmt(gapHi, 3)} sqrt(K/m1).`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Frequency', value: `${fmt(w, 3)} sqrt(K/m1)` },
        { label: 'Gap at pi/a', value: `${fmt(gapLo, 3)} to ${fmt(gapHi, 3)}` },
        { label: 'Group velocity', value: `${fmt(vg, 3)} a sqrt(K/m1)` },
        { label: 'Amplitude m2/m1', value: m1Amp < 1e-9 ? 'm1 at rest' : fmt(m2Amp / m1Amp, 2) },
      ],
      axes: ['q (0 to pi/a)', 'm2/m1', 'omega / sqrt(K/m1)'],
      camera: 'iso',
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Elastic constants: a volume element under one Voigt strain, the stress it needs, and the energy over two strains.

/** Example stiffness tensors, GPa, Voigt order. Cubic, hexagonal, triclinic: the golden test tensors (pymatgen). */
const C_CUBIC = [
  [168.4, 121.4, 121.4, 0, 0, 0],
  [121.4, 168.4, 121.4, 0, 0, 0],
  [121.4, 121.4, 168.4, 0, 0, 0],
  [0, 0, 0, 75.4, 0, 0],
  [0, 0, 0, 0, 75.4, 0],
  [0, 0, 0, 0, 0, 75.4],
];
const C_HEX = [
  [162.4, 92.0, 69.0, 0, 0, 0],
  [92.0, 162.4, 69.0, 0, 0, 0],
  [69.0, 69.0, 180.7, 0, 0, 0],
  [0, 0, 0, 46.7, 0, 0],
  [0, 0, 0, 0, 46.7, 0],
  [0, 0, 0, 0, 0, 35.2],
];
const C_TRICLINIC = [
  [251.0, 103.0, 87.0, -11.0, 6.5, -4.2],
  [103.0, 219.0, 95.0, 7.3, -9.1, 3.8],
  [87.0, 95.0, 233.0, -5.6, 2.9, 8.4],
  [-11.0, 7.3, -5.6, 61.0, -3.3, 1.7],
  [6.5, -9.1, 2.9, -3.3, 72.0, -2.4],
  [-4.2, 3.8, 8.4, 1.7, -2.4, 58.0],
];
/** A cubic pattern with C12 > C11: it breaks the Born condition C11 - C12 > 0 (S-072). */
const C_UNSTABLE = [
  [120, 140, 140, 0, 0, 0],
  [140, 120, 140, 0, 0, 0],
  [140, 140, 120, 0, 0, 0],
  [0, 0, 0, 60, 0, 0],
  [0, 0, 0, 0, 60, 0],
  [0, 0, 0, 0, 0, 60],
];
export const ELASTIC_TENSORS: Record<string, { c: number[][]; label: string }> = {
  cubic: { c: C_CUBIC, label: 'cubic' },
  hexagonal: { c: C_HEX, label: 'hexagonal' },
  triclinic: { c: C_TRICLINIC, label: 'triclinic' },
  unstable: { c: C_UNSTABLE, label: 'cubic with C12 > C11 (unstable)' },
};
/** Strain choices: Voigt index, partner index for the energy surface, words. */
const STRAINS: Record<string, { i: number; partner: number; words: string }> = {
  e1: { i: 0, partner: 1, words: 'a stretch along x (e1)' },
  e3: { i: 2, partner: 0, words: 'a stretch along z (e3)' },
  e4: { i: 3, partner: 4, words: 'a shear in the yz plane (e4)' },
  e6: { i: 5, partner: 3, words: 'a shear in the xy plane (e6)' },
};
const VOIGT = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'];
const SIGMA = ['xx', 'yy', 'zz', 'yz', 'xz', 'xy'];
const CUBE = 4; // edge of the drawn volume element, Angstrom
const EXAGGERATE = 10; // strains are drawn ten times larger than they are
const GPA_TO_MEV_A3 = 1000 / EV_PER_A3_IN_GPA;
const ELASTIC_SURF: Vec3 = [10, 2, 0]; // center of the energy surface or the modulus surface

export function elasticState(tensor: string, strain: string, percent: number) {
  const { c } = ELASTIC_TENSORS[tensor] ?? ELASTIC_TENSORS.cubic!;
  const s = STRAINS[strain] ?? STRAINS.e1!;
  const e = [0, 0, 0, 0, 0, 0];
  e[s.i] = percent / 100;
  const u = strainEnergyDensity(c, e); // GPa
  const sigma = stressFromStrain(c, e);
  const stab = stability(c);
  return { c, s, e, uMeV: u * GPA_TO_MEV_A3, sigma, stab, compliance: invert6(c) };
}

const elastic: SceneDef = {
  id: 'm12-elastic-strain',
  title: 'Strain, stress and the elastic tensor',
  badge: 'sample',
  banner:
    'Example stiffness tensors with the pattern of each crystal class (the golden test tensors), not results for a real material. Strains are drawn ten times larger than they are.',
  sources: ['S-042', 'S-072', 'S-076', 'S-158'],
  params: [
    {
      kind: 'select',
      id: 'tensor',
      label: 'Stiffness tensor',
      physics: true,
      value: 'cubic',
      options: [
        { value: 'cubic', label: 'Cubic' },
        { value: 'hexagonal', label: 'Hexagonal' },
        { value: 'triclinic', label: 'Triclinic' },
        { value: 'unstable', label: 'Cubic, unstable (C12 > C11)' },
      ],
    },
    {
      kind: 'select',
      id: 'strain',
      label: 'Strain',
      physics: true,
      value: 'e1',
      options: [
        { value: 'e1', label: 'e1: stretch along x' },
        { value: 'e3', label: 'e3: stretch along z' },
        { value: 'e4', label: 'e4: shear yz' },
        { value: 'e6', label: 'e6: shear xy' },
      ],
    },
    {
      kind: 'slider',
      id: 'amount',
      label: 'Strain amplitude',
      unit: '%',
      min: -3,
      max: 3,
      step: 0.1,
      value: 2,
      digits: 1,
      physics: true,
    },
    {
      kind: 'select',
      id: 'show',
      label: 'Surface',
      physics: true,
      value: 'energy',
      options: [
        { value: 'energy', label: 'Strain energy over two strains' },
        { value: 'young', label: "Directional Young's modulus" },
      ],
    },
  ],
  build(p) {
    const tensor = str(p, 'tensor');
    const strain = str(p, 'strain');
    const pct = clamp(num(p, 'amount'), -3, 3);
    const st = elasticState(tensor, strain, pct);
    const { c, s, e, sigma, stab } = st;
    const layers: Layer[] = [];
    // the volume element: reference cube (dashed) and the strained one, strained about its center
    const ref: Vec3[] = [
      [CUBE, 0, 0],
      [0, CUBE, 0],
      [0, 0, CUBE],
    ];
    const ctr: Vec3 = [CUBE / 2, CUBE / 2, CUBE / 2];
    const lat = strainLattice(
      ref,
      e.map((x) => x * EXAGGERATE),
    ) as unknown as [Vec3, Vec3, Vec3];
    const origin = sub(ctr, scale(add(add(lat[0], lat[1]), lat[2]), 0.5));
    const corners: Vec3[] = [];
    for (const i of [0, 1])
      for (const j of [0, 1])
        for (const k of [0, 1])
          corners.push(add(origin, add(add(scale(lat[0], i), scale(lat[1], j)), scale(lat[2], k))));
    layers.push(
      lines(cellEdges(ref), 'muted', 'reference', { name: 'Unstrained element', dashed: true }),
      hullLayer(corners, { group: 'element', name: 'Strained element', color: 'accent', opacity: 0.25 }),
    );
    // traction on each face: t = sigma . n (GPa), drawn 0.45 Angstrom per GPa; open heads for compression
    const sig = [
      [sigma[0], sigma[5], sigma[4]],
      [sigma[5], sigma[1], sigma[3]],
      [sigma[4], sigma[3], sigma[2]],
    ];
    const from: Vec3[] = [];
    const vec: Vec3[] = [];
    const tone: Color[] = [];
    const head: ('solid' | 'open')[] = [];
    for (let k = 0; k < 3; k++)
      for (const sgn of [1, -1]) {
        const nrm = normalize(cross(lat[(k + 1) % 3]!, lat[(k + 2) % 3]!));
        const n = scale(nrm, dot(nrm, lat[k]!) >= 0 ? sgn : -sgn);
        const tr = matVec(sig, n) as Vec3;
        if (norm(tr) < 1e-9) continue;
        const face = add(ctr, scale(lat[k]!, 0.5 * sgn));
        from.push(face);
        vec.push(scale(tr, 0.45));
        const tension = dot(tr, n) >= 0;
        tone.push(tension ? 'pos' : 'neg');
        head.push(tension ? 'solid' : 'open');
      }
    if (from.length)
      layers.push(arrows(from, vec, tone, 'stress', { name: 'Stress on the faces', head, thickness: 0.05 }));
    // the surface beside the element
    const show = str(p, 'show') === 'young' ? 'young' : 'energy';
    const pname = VOIGT[s.partner]!;
    const sname = VOIGT[s.i]!;
    let surfWords: string;
    if (show === 'energy') {
      const zs = 2; // scene units per meV/A^3
      const u = (a: number, b: number) => {
        const v = [0, 0, 0, 0, 0, 0];
        v[s.i] = a / 100;
        v[s.partner] = b / 100;
        return strainEnergyDensity(c, v) * GPA_TO_MEV_A3 * zs;
      };
      const surf = surfaceLayer(u, [-3, 3], [-3, 3], 30, 30, {
        group: 'energy',
        name: 'Strain energy surface',
        colormap: 'diverging',
        opacity: 0.8,
      });
      const sliceLine = Array.from({ length: 61 }, (_, i) => {
        const a = -3 + i / 10;
        return [a, 0, u(a, 0)] as Vec3;
      });
      const mark: Vec3 = [pct, 0, u(pct, 0)];
      layers.push(
        ...shift(
          [
            surf,
            curve(sliceLine, 'ink', 'energy', { tube: 0.035 }),
            atoms([mark], 0.14, 'accent', 'marker', {
              name: 'This strain',
              labels: ['this strain'],
              highlight: [0],
            }),
            ...axesLayers([3.6, 3.6, 3], [`${sname} (%)`, `${pname} (%)`, 'U (meV/Å³)'], [0, 0, 0]),
          ],
          ELASTIC_SURF,
        ),
      );
      const minEig = stab.eigenvaluesGPa[0]!;
      surfWords = stab.stable
        ? `The energy over ${sname} and ${pname} is a bowl: every strain costs energy.`
        : `The energy over ${sname} and ${pname} is a saddle: along some strain combinations it falls, because the smallest eigenvalue of C is ${fmt(minEig, 1)} GPa.`;
    } else {
      const comp = st.compliance!;
      const raw = youngSurface(comp, 24, 48, 1);
      const big = Math.max(...raw.values.map(Math.abs));
      const k = 3 / big;
      const mesh: MeshLayer = {
        kind: 'mesh',
        group: 'young',
        name: "Young's modulus surface",
        positions: raw.positions.map((x, i) => x * k + ELASTIC_SURF[i % 3]! + (i % 3 === 2 ? 2 : 0)),
        indices: raw.indices,
        values: raw.values,
        colormap: raw.min < 0 ? 'diverging' : 'sequential',
        color: 'accent',
        opacity: 0.85,
      };
      layers.push(mesh, ...axesLayers(3.4, ['x', 'y', 'z'], add(ELASTIC_SURF, [0, 0, 2])));
      const ex = directionalYoung(comp, [1, 0, 0]);
      const e111 = directionalYoung(comp, [1, 1, 1]);
      surfWords =
        raw.min < 0
          ? `Young's modulus is negative in some directions (down to ${fmt(raw.min, 0)} GPa), the sign of an unstable tensor.`
          : `Young's modulus by direction runs from ${fmt(raw.min, 0)} to ${fmt(raw.max, 0)} GPa: ${fmt(ex, 0)} GPa along x and ${fmt(e111, 0)} GPa along [111].`;
    }
    const active = sigma
      .map((v, i) => ({ v, i }))
      .filter((x) => Math.abs(x.v) > 1e-6)
      .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
      .slice(0, 3)
      .map((x) => `sigma_${SIGMA[x.i]} = ${fmt(x.v, 2)} GPa`)
      .join(', ');
    const describe =
      `A ${CUBE} Å volume element of a ${ELASTIC_TENSORS[tensor]?.label ?? 'cubic'} crystal under ${s.words} of ${fmt(pct, 1)} percent ` +
      `(drawn ten times larger), which costs ${fmt(st.uMeV, 3)} meV per cubic Angstrom. Holding every other strain at zero needs ` +
      `${active || 'no stress'}; arrows show the force per area on each face, solid heads pulling, open heads pushing. ${surfWords}`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Strain', value: `${sname} = ${fmt(pct, 1)} %` },
        { label: 'Energy density', value: `${fmt(st.uMeV, 3)} meV/Å³` },
        { label: `Stress sigma_${SIGMA[s.i]}`, value: `${fmt(sigma[s.i]!, 2)} GPa` },
        {
          label: 'Born stability',
          value: `${stab.stable ? 'stable' : 'unstable'} (smallest eigenvalue ${fmt(stab.eigenvaluesGPa[0]!, 1)} GPa)`,
        },
      ],
      axes: show === 'energy' ? [`${sname} (%)`, `${pname} (%)`, 'U (meV/Å³)'] : ['x', 'y', 'z'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Equation of state: the E(V) fit, the enthalpy surface H(V, P) whose valley is V(P), and the fcc cell at V.

/** Example data: set A of the golden EOS file, generated from Birch-Murnaghan E0 = -3.72 eV, V0 = 11.95 A^3, B0 = 0.87 eV/A^3, B0' = 4.8. */
const EOS_GEN = { e0: -3.72, v0: 11.95, b0: 0.87, b1: 4.8 };
const EOS_NOISY = [
  -3.6595880819471938, -3.679404330217273, -3.7001247194224787, -3.7136894176329003, -3.719147441238085,
  -3.720290998676002, -3.7156289412202774, -3.7114868344717564, -3.7033377361699147, -3.69375888229163,
  -3.6759521748825525,
];
export function eosData(set: string): { volume: number; energy: number }[] {
  const ks = set === 'clean7' ? [-3, -2, -1, 0, 1, 2, 3] : [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  return ks.map((k, i) => {
    const volume = EOS_GEN.v0 * (1 + 0.02 * k);
    return {
      volume,
      energy: set === 'noisy11' ? EOS_NOISY[i]! : eosEnergy('birch_murnaghan', volume, EOS_GEN),
    };
  });
}
const eosMemo = memo<EosFit>();
export const eosFitFor = (set: string, form: EosForm): EosFit =>
  eosMemo(`${set}|${form}`, () => fitEos(eosData(set), form));
/** Pressure -dE/dV of the fitted form, eV/A^3. */
export function eosPressure(f: EosFit, v: number): number {
  const h = 1e-5 * v;
  return -(eosEnergy(f.form, v + h, f.params) - eosEnergy(f.form, v - h, f.params)) / (2 * h);
}

const EOS_X = 40; // scene units per unit of V/V0
const EOS_Z = 1 / 40; // scene units per meV/atom
const EOS_CELL: Vec3 = [-11, -1.8, 0];

const eos: SceneDef = {
  id: 'm12-eos',
  title: 'Equation of state and the enthalpy valley',
  badge: 'sample',
  banner:
    'Example E(V) points generated from a Birch-Murnaghan curve (the golden test set A), not a DFT calculation. The fit, the pressures and the cell are computed from them.',
  sources: ['S-061', 'S-062', 'S-068', 'S-042'],
  params: [
    {
      kind: 'slider',
      id: 'volume',
      label: 'Volume V/V0',
      min: 0.9,
      max: 1.1,
      step: 0.005,
      value: 1,
      digits: 3,
      physics: true,
    },
    {
      kind: 'select',
      id: 'data',
      label: 'Data set',
      physics: true,
      value: 'clean7',
      options: [
        { value: 'clean7', label: '7 points, plus or minus 6 %' },
        { value: 'wide11', label: '11 points, plus or minus 10 %' },
        { value: 'noisy11', label: '11 points with 2 meV noise' },
      ],
    },
    {
      kind: 'select',
      id: 'form',
      label: 'Fit form',
      physics: true,
      value: 'birch_murnaghan',
      options: [
        { value: 'birch_murnaghan', label: 'Birch-Murnaghan' },
        { value: 'murnaghan', label: 'Murnaghan' },
      ],
    },
    { kind: 'toggle', id: 'surface', label: 'Enthalpy surface', value: true },
  ],
  build(p) {
    const set = str(p, 'data');
    const form: EosForm = str(p, 'form') === 'murnaghan' ? 'murnaghan' : 'birch_murnaghan';
    const f = eosFitFor(set, form);
    const { v0, e0 } = f.params;
    const ratio = clamp(num(p, 'volume'), 0.9, 1.1);
    const v = ratio * v0;
    const E = (vv: number) => eosEnergy(form, vv, f.params);
    const pv = eosPressure(f, v); // eV/A^3
    const pGPa = pv * EV_PER_A3_IN_GPA;
    const pHi = eosPressure(f, 0.9 * v0);
    const pLo = eosPressure(f, 1.1 * v0);
    const yOf = (pp: number) => (pp * 6) / (pHi - pLo); // scene units, P = 0 at y = 0
    const xOf = (vv: number) => (vv / v0 - 1) * EOS_X;
    const fineV = Array.from({ length: 241 }, (_, i) => v0 * (0.88 + (0.24 * i) / 240));
    const hMin = (pp: number) => Math.min(...fineV.map((vv) => E(vv) + pp * vv));
    const zOf = (vv: number, pp: number, hm: number) => (E(vv) + pp * vv - hm) * 1000 * EOS_Z;
    const layers: Layer[] = [];
    if (p.surface) {
      const rows = new Map<number, number>();
      const surf = surfaceLayer(
        (x, y) => {
          const vv = v0 * (1 + x / EOS_X);
          const pp = (y * (pHi - pLo)) / 6;
          let hm = rows.get(y);
          if (hm === undefined) rows.set(y, (hm = hMin(pp)));
          return zOf(vv, pp, hm);
        },
        [xOf(0.9 * v0), xOf(1.1 * v0)],
        [yOf(pLo), yOf(pHi)],
        40,
        30,
        { group: 'enthalpy', name: 'Enthalpy surface H(V, P)', colormap: 'sequential', opacity: 0.7 },
      );
      layers.push(surf);
    }
    const vs = Array.from({ length: 121 }, (_, i) => v0 * (0.9 + (0.2 * i) / 120));
    const ev: Vec3[] = vs.map((vv) => [xOf(vv), 0, (E(vv) - e0) * 1000 * EOS_Z]);
    const valley: Vec3[] = vs.map((vv) => [xOf(vv), yOf(eosPressure(f, vv)), 0.02]);
    const hm = hMin(pv);
    const slice: Vec3[] = vs.map((vv) => [xOf(vv), yOf(pv), zOf(vv, pv, hm) + 0.02]);
    const dE = -pv;
    const tangent: [Vec3, Vec3] = [
      [xOf(v - 0.04 * v0), 0, (E(v) - e0 + dE * -0.04 * v0) * 1000 * EOS_Z],
      [xOf(v + 0.04 * v0), 0, (E(v) - e0 + dE * 0.04 * v0) * 1000 * EOS_Z],
    ];
    const data = eosData(set);
    layers.push(
      curve(ev, 'ink', 'ev', { name: 'E(V) at P = 0', tube: 0.05 }),
      atoms(
        data.map((d) => [xOf(d.volume), 0, (d.energy - e0) * 1000 * EOS_Z] as Vec3),
        0.12,
        'c2',
        'points',
        {
          name: 'Data points',
          labels: data.map((d) => `V = ${fmt(d.volume, 3)} Å³, E = ${fmt(d.energy, 4)} eV`),
        },
      ),
      curve(valley, 'accent', 'valley', { name: 'V(P): the valley floor', tube: 0.04 }),
      curve(slice, 'pos', 'slice', { name: 'H at this pressure', tube: 0.035 }),
      lines([tangent], 'neg', 'tangent', { name: 'Tangent: slope = -P', tube: 0.025 }),
      atoms([[xOf(v), yOf(pv), 0.02]], 0.16, 'accent', 'marker', {
        name: 'This volume',
        labels: ['this volume'],
        highlight: [0],
      }),
      atoms([[xOf(v), 0, (E(v) - e0) * 1000 * EOS_Z]], 0.12, 'neg', 'marker', { labels: ['on E(V)'] }),
      ...axesLayers(
        [5, yOf(pHi) + 0.8, 4.5],
        ['V/V0 - 1 (x 40)', 'P (GPa)', 'H - H_min (meV/atom)'],
        [xOf(0.9 * v0) - 0.2, 0, 0],
      ),
      labels(
        [
          { text: 'E(V) at P = 0', at: [xOf(1.1 * v0) + 0.4, 0, (E(1.1 * v0) - e0) * 1000 * EOS_Z] },
          { text: 'V(P) valley', at: [xOf(0.9 * v0), yOf(pHi) + 0.3, 0.3] },
        ],
        'labels',
      ),
    );
    // the fcc cell at this volume (4 atoms per conventional cell), and the cell at V0 dashed
    const fcc = lookupStructure('fcc')!;
    const a = Math.cbrt(4 * v);
    const a0 = Math.cbrt(4 * v0);
    const scaled = {
      ...fcc,
      lattice: [
        [a, 0, 0],
        [0, a, 0],
        [0, 0, a],
      ] as const,
    };
    const crystal = crystalLayers(scaled, { boundary: true, bonds: false, radiusScale: 0.35 });
    const off = sub(EOS_CELL, [a / 2, a / 2, 0]);
    layers.push(
      ...shift(crystal.layers, off),
      lines(
        cellEdges(
          [
            [a0, 0, 0],
            [0, a0, 0],
            [0, 0, a0],
          ],
          sub(EOS_CELL, [a0 / 2, a0 / 2, 0]),
        ),
        'muted',
        'cell-v0',
        { name: 'Cell at V0', dashed: true },
      ),
    );
    const describe =
      `The ${form === 'murnaghan' ? 'Murnaghan' : 'Birch-Murnaghan'} fit to ${data.length} example points gives V0 = ${fmt(v0, 3)} Å³ per atom, ` +
      `B0 = ${fmt(f.b0GPa, 1)} GPa and B0' = ${fmt(f.params.b1, 2)}. At V/V0 = ${fmt(ratio, 3)} the fcc cell has a = ${fmt(a, 3)} Å ` +
      `and the pressure, minus the slope of E(V), is ${fmt(pGPa, 2)} GPa. The surface is the enthalpy E + PV over volume and pressure; ` +
      `its valley floor is the equation of state V(P), and the marked volume sits at its bottom for that pressure.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Volume', value: `${fmt(v, 3)} Å³/atom (a = ${fmt(a, 3)} Å)` },
        { label: 'Pressure', value: `${fmt(pGPa, 2)} GPa` },
        { label: 'E - E0', value: `${fmt((E(v) - e0) * 1000, 1)} meV/atom` },
        { label: "Fit B0, B0'", value: `${fmt(f.b0GPa, 1)} GPa, ${fmt(f.params.b1, 2)}` },
      ],
      axes: ['V/V0 - 1 (x 40)', 'P (GPa)', 'H - H_min (meV/atom)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Dielectric tensor: the ellipsoid traced by D = eps E for every unit field direction, its principal axes, and D
// against E for the chosen field.

const EPS_PRESETS: Record<string, { d: [number, number, number]; words: string }> = {
  cubic: { d: [6, 6, 6], words: 'cubic (isotropic)' },
  uniaxial: { d: [5, 5, 8], words: 'uniaxial (tetragonal or hexagonal)' },
  biaxial: { d: [4.5, 6, 8.5], words: 'biaxial (orthorhombic)' },
  monoclinic: { d: [4.5, 6, 8.5], words: 'monoclinic' },
};
const EPS_SCALE = 0.45; // scene units per unit of eps

export function dielectricTensor(sym: string, tiltDeg: number) {
  const pre = EPS_PRESETS[sym] ?? EPS_PRESETS.cubic!;
  const r = rotationY(sym === 'monoclinic' ? tiltDeg * DEG : 0);
  return { eps: fromPrincipal(pre.d, r), pre };
}

const dielectric: SceneDef = {
  id: 'm12-dielectric',
  title: 'The dielectric tensor as an ellipsoid',
  badge: 'sample',
  banner:
    'The principal values are example inputs, not results for a material. D = eps E and the principal axes are exact for any symmetric tensor.',
  sources: ['S-082', 'S-042', 'S-068'],
  params: [
    {
      kind: 'select',
      id: 'symmetry',
      label: 'Crystal symmetry',
      physics: true,
      value: 'uniaxial',
      options: [
        { value: 'cubic', label: 'Cubic' },
        { value: 'uniaxial', label: 'Uniaxial' },
        { value: 'biaxial', label: 'Orthorhombic' },
        { value: 'monoclinic', label: 'Monoclinic' },
      ],
    },
    {
      kind: 'slider',
      id: 'tilt',
      label: 'Axis tilt (monoclinic)',
      unit: 'degree',
      min: 0,
      max: 60,
      step: 1,
      value: 25,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'theta',
      label: 'Field polar angle',
      unit: 'degree',
      min: 0,
      max: 180,
      step: 1,
      value: 50,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'phi',
      label: 'Field azimuth',
      unit: 'degree',
      min: 0,
      max: 360,
      step: 1,
      value: 30,
      digits: 0,
      physics: true,
    },
  ],
  build(p) {
    const sym = str(p, 'symmetry');
    const tilt = num(p, 'tilt');
    const { eps, pre } = dielectricTensor(sym, tilt);
    const { values, axes } = symmetricEigen3(eps);
    const n = direction(num(p, 'theta') * DEG, num(p, 'phi') * DEG);
    const dvec = matVec(eps, n);
    const along = alongDirection(eps, n);
    const angle = Math.acos(clamp(dot(dvec, n) / norm(dvec), -1, 1)) / DEG;
    // ellipsoid: r = s eps u over the unit sphere, colored by eps along u
    const nt = 24;
    const np = 48;
    const positions: number[] = [];
    const vals: number[] = [];
    for (let j = 0; j <= nt; j++)
      for (let i = 0; i <= np; i++) {
        const u = direction((Math.PI * j) / nt, (2 * Math.PI * i) / np);
        const rr = matVec(eps, u);
        positions.push(rr[0] * EPS_SCALE, rr[1] * EPS_SCALE, rr[2] * EPS_SCALE);
        vals.push(alongDirection(eps, u));
      }
    const indices: number[] = [];
    for (let j = 0; j < nt; j++)
      for (let i = 0; i < np; i++) {
        const a = j * (np + 1) + i;
        indices.push(a, a + np + 1, a + 1, a + 1, a + np + 1, a + np + 2);
      }
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const ell: MeshLayer = {
      kind: 'mesh',
      group: 'ellipsoid',
      name: 'Dielectric ellipsoid',
      positions,
      indices,
      color: 'accent',
      opacity: 0.45,
      ...(hi - lo > 1e-9
        ? { values: vals, colormap: 'sequential' as const, range: [lo, hi] as [number, number] }
        : {}),
    };
    const dTip = scale(dvec, EPS_SCALE);
    const eTip = scale(n, along * EPS_SCALE);
    const big = hi * EPS_SCALE * 1.25;
    const layers: Layer[] = [
      ell,
      lines(
        axes.map(
          (ax, i) =>
            [scale(ax, -values[i]! * EPS_SCALE * 1.15), scale(ax, values[i]! * EPS_SCALE * 1.15)] as [
              Vec3,
              Vec3,
            ],
        ),
        'ink',
        'principal',
        { name: 'Principal axes', dashed: true },
      ),
      labels(
        axes.map((ax, i) => ({
          text: `eps${i + 1} = ${fmt(values[i]!, 2)}`,
          at: scale(ax, values[i]! * EPS_SCALE * 1.25),
        })),
        'principal',
      ),
      lines([[scale(n, -big), scale(n, big)]], 'muted', 'field', { name: 'Field direction', dashed: true }),
      arrows(
        [
          [0, 0, 0],
          [0, 0, 0],
        ],
        [eTip, dTip],
        ['accent', 'pos'],
        'field',
        { thickness: 0.03 },
      ),
      lines([[eTip, dTip]], 'pos', 'field', { dashed: true }),
      labels(
        [
          { text: 'E (length: eps along E)', at: scale(eTip, 1.08) },
          { text: 'D = eps E', at: scale(dTip, 1.08) },
        ],
        'field',
      ),
      ...axesLayers(hi * EPS_SCALE * 1.5, ['x', 'y', 'z']),
    ];
    const describe =
      `A ${pre.words} dielectric tensor with principal values ${values.map((x) => fmt(x, 2)).join(', ')}` +
      `${sym === 'monoclinic' ? `, its axes tilted ${fmt(tilt, 0)} degrees about y` : ''}, drawn as the ellipsoid that D = eps E traces for every field direction. ` +
      `For the field shown, eps along E is ${fmt(along, 2)} and D points ${fmt(angle, 1)} degrees away from E` +
      `${angle < 0.05 ? ', because the field lies along a principal axis or the crystal is isotropic' : ''}.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Principal values', value: values.map((x) => fmt(x, 2)).join(', ') },
        { label: 'eps along E', value: fmt(along, 3) },
        { label: 'Angle between D and E', value: `${fmt(angle, 1)} degree` },
        { label: 'Average (trace / 3)', value: fmt((eps[0][0] + eps[1][1] + eps[2][2]) / 3, 3) },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Optical properties: a Lorentz-oscillator model of a uniaxial crystal, absorption over energy and a second variable.

/** Example oscillators (eV, eV^2) for the field along x and along z; not a material. */
export const OPTICS_MODEL: { xx: Oscillator[]; zz: Oscillator[]; epsInf: number } = {
  xx: [
    { e0: 3.2, f: 45, gamma: 0.3 },
    { e0: 7.5, f: 60, gamma: 0.3 },
  ],
  zz: [
    { e0: 4.4, f: 70, gamma: 0.3 },
    { e0: 8.0, f: 40, gamma: 0.3 },
  ],
  epsInf: 1.8,
};
/** eps along a field at angle theta (degree) from x toward z, with broadening gamma (eV): eps_xx cos^2 + eps_zz sin^2. */
export function opticsEps(e: number, gamma: number, thetaDeg: number): [number, number] {
  const g = (os: Oscillator[]) => os.map((o) => ({ ...o, gamma }));
  const x = lorentzEps(e, g(OPTICS_MODEL.xx), OPTICS_MODEL.epsInf);
  const z = lorentzEps(e, g(OPTICS_MODEL.zz), OPTICS_MODEL.epsInf);
  const c2 = Math.cos(thetaDeg * DEG) ** 2;
  return [c2 * x[0] + (1 - c2) * z[0], c2 * x[1] + (1 - c2) * z[1]];
}
const QUANTITIES: Record<
  string,
  { label: string; z: (e: number, eps: [number, number]) => number; axis: string }
> = {
  alpha: {
    label: 'absorption coefficient',
    axis: 'log10 alpha (1/cm) - 2',
    z: (e, [a, b]) => 1.2 * Math.max(0, Math.log10(Math.max(opticalPoint(e, a, b).alphaPerCm, 100)) - 2),
  },
  eps2: { label: 'eps2', axis: 'eps2 / 10', z: (_e, [, b]) => Math.min(b, 80) / 10 },
  reflectivity: {
    label: 'reflectivity',
    axis: 'R (x 6)',
    z: (e, [a, b]) => 6 * opticalPoint(e, a, b).reflectivity,
  },
};
const E_MIN = 0.2;
const E_MAX = 10;

const optics: SceneDef = {
  id: 'm12-optics',
  title: 'Absorption over energy, broadening and polarization',
  badge: 'toy-model',
  banner:
    'Model spectrum: two Lorentz oscillators per field direction with example energies and strengths, not a LOPTICS result. n, k, alpha and R are derived from it with the tested formulas.',
  sources: ['S-082', 'S-042', 'S-031'],
  params: [
    {
      kind: 'select',
      id: 'sweep',
      label: 'Second axis',
      physics: true,
      value: 'broadening',
      options: [
        { value: 'broadening', label: 'Broadening gamma' },
        { value: 'polarization', label: 'Field angle (x to z)' },
      ],
    },
    {
      kind: 'select',
      id: 'quantity',
      label: 'Quantity',
      physics: true,
      value: 'alpha',
      options: [
        { value: 'alpha', label: 'Absorption coefficient (log)' },
        { value: 'eps2', label: 'eps2' },
        { value: 'reflectivity', label: 'Reflectivity' },
      ],
    },
    {
      kind: 'slider',
      id: 'energy',
      label: 'Photon energy',
      unit: 'eV',
      min: 0.5,
      max: 10,
      step: 0.05,
      value: 3.2,
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'gamma',
      label: 'Broadening gamma',
      unit: 'eV',
      min: 0.1,
      max: 1,
      step: 0.02,
      value: 0.3,
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'angle',
      label: 'Field angle from x',
      unit: 'degree',
      min: 0,
      max: 90,
      step: 1,
      value: 0,
      digits: 0,
      physics: true,
    },
  ],
  build(p) {
    const byGamma = str(p, 'sweep') !== 'polarization';
    const qn = QUANTITIES[str(p, 'quantity')] ?? QUANTITIES.alpha!;
    const en = clamp(num(p, 'energy'), E_MIN, E_MAX);
    const gamma = clamp(num(p, 'gamma'), 0.1, 1);
    const angle = clamp(num(p, 'angle'), 0, 90);
    // y axis: 0..8 scene units for gamma 0.1..1 eV or angle 0..90 degree
    const yToVar = (y: number) => (byGamma ? 0.1 + (0.9 * y) / 8 : (90 * y) / 8);
    const varToY = (v: number) => (byGamma ? ((v - 0.1) * 8) / 0.9 : (v * 8) / 90);
    const epsAt = (e: number, y: number) =>
      byGamma ? opticsEps(e, yToVar(y), angle) : opticsEps(e, gamma, yToVar(y));
    const z = (e: number, y: number) => qn.z(e, epsAt(e, y));
    const yNow = varToY(byGamma ? gamma : angle);
    const layers: Layer[] = [
      surfaceLayer(z, [E_MIN, E_MAX], [0, 8], 98, 24, {
        group: 'spectrum',
        name: `${qn.label} surface`,
        colormap: 'sequential',
        opacity: 0.85,
      }),
      curve(
        Array.from({ length: 197 }, (_, i) => {
          const e = E_MIN + ((E_MAX - E_MIN) * i) / 196;
          return [e, yNow, z(e, yNow) + 0.03] as Vec3;
        }),
        'ink',
        'slice',
        { name: 'Spectrum at this setting', tube: 0.04 },
      ),
      curve(
        Array.from({ length: 41 }, (_, i) => {
          const y = (8 * i) / 40;
          return [en, y, z(en, y) + 0.03] as Vec3;
        }),
        'pos',
        'cursor',
        { name: 'Energy cursor', tube: 0.035 },
      ),
      atoms([[en, yNow, z(en, yNow) + 0.03]], 0.14, 'accent', 'cursor', {
        labels: ['this energy'],
        highlight: [0],
      }),
      lines(
        [
          [
            [en, yNow, 0],
            [en, yNow, z(en, yNow)],
          ],
        ],
        'accent',
        'cursor',
        { dashed: true },
      ),
      ...axesLayers(
        [E_MAX + 0.6, 8.6, 6.5],
        ['photon energy (eV)', byGamma ? 'gamma (0.1 to 1 eV)' : 'field angle (0 to 90 degree)', qn.axis],
      ),
    ];
    const [e1, e2] = opticsEps(en, gamma, angle);
    const op = opticalPoint(en, e1, e2);
    // where the slice peaks
    let peakE = E_MIN;
    let peakZ = -Infinity;
    for (let i = 0; i <= 392; i++) {
      const e = E_MIN + ((E_MAX - E_MIN) * i) / 392;
      const v = z(e, yNow);
      if (v > peakZ) [peakZ, peakE] = [v, e];
    }
    const describe =
      `The model ${qn.label} as a surface over photon energy and ${byGamma ? 'broadening gamma' : 'the angle of the field between x and z'}. ` +
      `At gamma = ${fmt(gamma, 2)} eV and a field ${fmt(angle, 0)} degrees from x the highlighted spectrum peaks near ${fmt(peakE, 2)} eV; ` +
      `at ${fmt(en, 2)} eV, eps1 = ${fmt(e1, 2)}, eps2 = ${fmt(e2, 2)}, alpha = ${fmt(op.alphaPerCm / 1e5, 2)} x 10^5 per cm and R = ${fmt(op.reflectivity, 3)}. ` +
      `${byGamma ? 'Wider broadening lowers and spreads each peak.' : 'Turning the field from x to z moves the peaks from the x oscillators to the z ones.'}`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'eps1, eps2', value: `${fmt(e1, 2)}, ${fmt(e2, 2)}` },
        { label: 'n, k', value: `${fmt(op.n, 3)}, ${fmt(op.k, 3)}` },
        { label: 'Absorption alpha', value: `${fmt(op.alphaPerCm / 1e5, 2)} x 10^5 /cm` },
        { label: 'Reflectivity', value: fmt(op.reflectivity, 3) },
      ],
      axes: ['photon energy (eV)', byGamma ? 'gamma (eV)' : 'field angle (degree)', qn.axis],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Bader charges: two model atoms, the on-grid steepest-ascent partition, the basins and the zero-flux surface.

/** Model atoms: N electrons in a Gaussian of exponent alpha (1/Angstrom^2). */
const BADER_PAIRS: Record<
  string,
  { a: { n: number; l: number }; b: { n: number; l: number }; words: string }
> = {
  same: { a: { n: 4, l: 2.0 }, b: { n: 4, l: 2.0 }, words: 'two identical atoms of 4 electrons' },
  polar: {
    a: { n: 1, l: 0.8 },
    b: { n: 7, l: 3.0 },
    words: 'a diffuse atom A of 1 electron and a compact atom B of 7',
  },
};
const BADER_PAD = 3;
const BADER_GRID: Vec3 = [42, 30, 30];

interface BaderModel {
  values: Float64Array;
  indicator: Float64Array;
  coarseGrid: Vec3;
  basinA: Float64Array;
  basinB: Float64Array;
  lo: Vec3;
  h: Vec3;
  qa: number;
  qb: number;
  total: number;
  na: number;
  nb: number;
  na0: number;
  nb0: number;
}
const baderMemo = memo<BaderModel>(12);
const baderMesh = memo<MeshLayer>(48);
export function baderModel(pair: string, d: number, transfer: number): BaderModel {
  return baderMemo(`${pair}|${d}|${transfer}`, () => {
    const pr = BADER_PAIRS[pair] ?? BADER_PAIRS.same!;
    const na = pr.a.n - transfer;
    const nb = pr.b.n + transfer;
    const ca: Vec3 = [-d / 2, 0, 0];
    const cb: Vec3 = [d / 2, 0, 0];
    const fa = gaussianAtom(na, pr.a.l, ca);
    const fb = gaussianAtom(nb, pr.b.l, cb);
    const lo: Vec3 = [-d / 2 - BADER_PAD, -BADER_PAD, -BADER_PAD];
    const hi: Vec3 = [d / 2 + BADER_PAD, BADER_PAD, BADER_PAD];
    const g = BADER_GRID;
    const h = [0, 1, 2].map((k) => (hi[k]! - lo[k]!) / (g[k]! - 1)) as Vec3;
    const n = g[0] * g[1] * g[2];
    const values = new Float64Array(n);
    for (let k = 0; k < g[2]; k++)
      for (let j = 0; j < g[1]; j++)
        for (let i = 0; i < g[0]; i++) {
          const x = lo[0] + i * h[0];
          const y = lo[1] + j * h[1];
          const z = lo[2] + k * h[2];
          values[i + g[0] * (j + g[1] * k)] = fa(x, y, z) + fb(x, y, z);
        }
    const r = baderPartition(values, g, h);
    // each maximum (one per nucleus for these smooth densities) belongs to the nearer nucleus
    const coord = (idx: number): Vec3 => {
      const i = idx % g[0];
      const j = Math.floor(idx / g[0]) % g[1];
      const k = Math.floor(idx / (g[0] * g[1]));
      return [lo[0] + i * h[0], lo[1] + j * h[1], lo[2] + k * h[2]];
    };
    const toA = r.maxima.map((mx) => norm(sub(coord(mx), ca)) <= norm(sub(coord(mx), cb)));
    let qa = 0;
    let qb = 0;
    r.charges.forEach((q, id) => {
      if (toA[id]) qa += q;
      else qb += q;
    });
    const isA = new Uint8Array(n);
    for (let p = 0; p < n; p++) isA[p] = toA[r.basin[p]!] ? 1 : 0;
    // basin densities for the lobes; a coarse indicator (every second point, averaged over its 3 x 3 x 3
    // neighbourhood) for a smooth zero-flux surface at an eighth of the cost
    const basinA = new Float64Array(n);
    const basinB = new Float64Array(n);
    for (let p = 0; p < n; p++) {
      basinA[p] = isA[p] ? values[p]! : 0;
      basinB[p] = isA[p] ? 0 : values[p]!;
    }
    const cg: Vec3 = [Math.ceil(g[0] / 2), Math.ceil(g[1] / 2), Math.ceil(g[2] / 2)];
    const indicator = new Float64Array(cg[0] * cg[1] * cg[2]);
    for (let K = 0; K < cg[2]; K++)
      for (let J = 0; J < cg[1]; J++)
        for (let I = 0; I < cg[0]; I++) {
          let sum = 0;
          let cnt = 0;
          for (let c = Math.max(0, 2 * K - 1); c <= Math.min(g[2] - 1, 2 * K + 1); c++)
            for (let b = Math.max(0, 2 * J - 1); b <= Math.min(g[1] - 1, 2 * J + 1); b++)
              for (let a = Math.max(0, 2 * I - 1); a <= Math.min(g[0] - 1, 2 * I + 1); a++) {
                sum += isA[a + g[0] * (b + g[1] * c)]!;
                cnt++;
              }
          indicator[I + cg[0] * (J + cg[1] * K)] = sum / cnt;
        }
    return {
      values,
      indicator,
      coarseGrid: cg,
      basinA,
      basinB,
      lo,
      h,
      qa,
      qb,
      total: r.total,
      na,
      nb,
      na0: pr.a.n,
      nb0: pr.b.n,
    };
  });
}

const bader: SceneDef = {
  id: 'm12-bader',
  title: 'Bader basins and the zero-flux surface',
  badge: 'toy-model',
  banner:
    'Model density: two spherical Gaussian atoms added together (no bonding), not a DFT density. The partition is the real on-grid steepest-ascent Bader algorithm.',
  sources: ['S-029', 'S-084'],
  params: [
    {
      kind: 'select',
      id: 'pair',
      label: 'Atom pair',
      physics: true,
      value: 'polar',
      options: [
        { value: 'same', label: 'Two identical atoms' },
        { value: 'polar', label: 'Diffuse A, compact B' },
      ],
    },
    {
      kind: 'slider',
      id: 'distance',
      label: 'Distance',
      unit: 'Å',
      min: 1.8,
      max: 3.4,
      step: 0.1,
      value: 2.6,
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'transfer',
      label: 'Electrons moved from A to B',
      unit: 'e',
      min: 0,
      max: 0.8,
      step: 0.05,
      value: 0,
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'level',
      label: 'Density surface',
      unit: 'e/Å³',
      min: 0.01,
      max: 0.3,
      step: 0.01,
      value: 0.05,
      digits: 2,
      physics: true,
    },
    { kind: 'toggle', id: 'surface', label: 'Zero-flux surface', value: true },
  ],
  build(p) {
    const pair = str(p, 'pair') === 'same' ? 'same' : 'polar';
    const d = Math.round(clamp(num(p, 'distance'), 1.8, 3.4) * 10) / 10;
    const tr = Math.round(clamp(num(p, 'transfer'), 0, 0.8) * 100) / 100;
    const level = clamp(num(p, 'level'), 0.01, 0.3);
    const m = baderModel(pair, d, tr);
    const key = `${pair}|${d}|${tr}`;
    const iso = (
      values: Float64Array,
      lvl: number,
      o: { group: string; name: string; color: Color; opacity: number },
      coarse = false,
    ): MeshLayer =>
      baderMesh(`${key}|${o.group}|${lvl}`, () => {
        const c = cropToLevel(values, coarse ? m.coarseGrid : BADER_GRID, lvl);
        if (!c) return { kind: 'mesh', positions: [], indices: [], ...o };
        const st = coarse ? 2 : 1;
        const toScene = (gp: Vec3): Vec3 => [
          m.lo[0] + (gp[0] + c.offset[0]) * st * m.h[0],
          m.lo[1] + (gp[1] + c.offset[1]) * st * m.h[1],
          m.lo[2] + (gp[2] + c.offset[2]) * st * m.h[2],
        ];
        return gridIsosurfaceLayer(c.values, c.grid, toScene, lvl, o);
      });
    const layers: Layer[] = [
      iso(m.basinA, level, { group: 'basin-a', name: 'Basin of A', color: 'c0', opacity: 0.6 }),
      iso(m.basinB, level, { group: 'basin-b', name: 'Basin of B', color: 'c1', opacity: 0.6 }),
    ];
    if (p.surface)
      layers.push(
        iso(
          m.indicator,
          0.5,
          { group: 'zero-flux', name: 'Zero-flux surface', color: 'muted', opacity: 0.3 },
          true,
        ),
      );
    const ca: Vec3 = [-d / 2, 0, 0];
    const cb: Vec3 = [d / 2, 0, 0];
    const pr = BADER_PAIRS[pair]!;
    const chargeA = m.na0 - m.qa;
    const chargeB = m.nb0 - m.qb;
    layers.push(
      atoms([ca, cb], [0.12, 0.12], ['c0', 'c1'], 'nuclei', {
        name: 'Nuclei',
        labels: [`A: ${fmt(m.qa, 2)} e in its basin`, `B: ${fmt(m.qb, 2)} e in its basin`],
      }),
      lines([[sub(ca, [1, 0, 0]), add(cb, [1, 0, 0])]], 'muted', 'nuclei', { dashed: true }),
      labels(
        [
          { text: `A ${chargeA >= 0 ? '+' : ''}${fmt(chargeA, 2)}`, at: add(ca, [0, 0, 1.6]) },
          { text: `B ${chargeB >= 0 ? '+' : ''}${fmt(chargeB, 2)}`, at: add(cb, [0, 0, 1.6]) },
        ],
        'labels',
      ),
    );
    const describe =
      `A model density of ${pr.words}, ${fmt(d, 1)} Å apart${tr > 0 ? `, with ${fmt(tr, 2)} electrons moved from A to B` : ''}. ` +
      `The on-grid Bader partition gives ${fmt(m.qa, 2)} electrons to A and ${fmt(m.qb, 2)} to B (grid total ${fmt(m.total, 2)}), so the Bader charges are ` +
      `${fmt(chargeA, 2)} on A and ${fmt(chargeB, 2)} on B. Each colored lobe is the density surface at ${fmt(level, 2)} e/Å³ inside one basin; ` +
      `the gray sheet between them is the zero-flux surface.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Electrons in basin A', value: `${fmt(m.qa, 3)} e` },
        { label: 'Electrons in basin B', value: `${fmt(m.qb, 3)} e` },
        { label: 'Bader charge A, B', value: `${fmt(chargeA, 2)}, ${fmt(chargeB, 2)} e` },
        { label: 'Grid total (model)', value: `${fmt(m.total, 3)} of ${fmt(m.na + m.nb, 2)} e` },
      ],
      axes: ['x (Å)', 'y (Å)', 'z (Å)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Other calculations: one tiny live example per family (an energy difference, a reading of the potential, a reading
// of the bands).

const HULL_TRI: Record<string, Vec3> = {
  A: [0, 0, 0],
  B: [8, 0, 0],
  C: [4, 6.928, 0],
};
const HULL_Z = 1 / 50; // scene units per meV/atom
/** Example formation energies, meV/atom; the ternary ABC comes from the slider. */
const HULL_PHASES: { name: string; x: [number, number, number]; e: number }[] = [
  { name: 'A', x: [1, 0, 0], e: 0 },
  { name: 'B', x: [0, 1, 0], e: 0 },
  { name: 'C', x: [0, 0, 1], e: 0 },
  { name: 'AB', x: [0.5, 0.5, 0], e: -220 },
  { name: 'BC', x: [0, 0.5, 0.5], e: -160 },
  { name: 'AC', x: [0.5, 0, 0.5], e: -90 },
];
const hullPoint = (x: readonly number[], e: number): Vec3 =>
  add(
    add(scale(HULL_TRI.A!, x[0]!), scale(HULL_TRI.B!, x[1]!)),
    add(scale(HULL_TRI.C!, x[2]!), [0, 0, e * HULL_Z]),
  );

/** Lower convex hull faces (triangles of point indices) of points lifted by energy. */
function lowerHull(pts: Vec3[]): number[][] {
  const { faces } = convexHull(pts);
  const c = scale(
    pts.reduce((s, q) => add(s, q), [0, 0, 0] as Vec3),
    1 / pts.length,
  );
  const out: number[][] = [];
  for (const f of faces)
    for (let k = 1; k + 1 < f.length; k++) {
      const tri = [f[0]!, f[k]!, f[k + 1]!];
      let n = cross(sub(pts[tri[1]!]!, pts[tri[0]!]!), sub(pts[tri[2]!]!, pts[tri[0]!]!));
      if (dot(n, sub(pts[tri[0]!]!, c)) < 0) n = scale(n, -1);
      if (n[2] < -1e-9 * norm(n)) out.push(tri);
    }
  return out;
}

/** Energy above the hull of the other phases at composition x, meV/atom, with the phases it would split into. */
export function energyAboveHull(x: [number, number, number], e: number): { eHull: number; into: string[] } {
  const pts = HULL_PHASES.map((ph) => hullPoint(ph.x, ph.e));
  const tris = lowerHull(pts);
  const target = hullPoint(x, 0);
  for (const t of tris) {
    const [a, b, c] = t.map((i) => pts[i]!) as [Vec3, Vec3, Vec3];
    // barycentric coordinates in the xy plane
    const det = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    const l1 = ((target[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (target[1] - a[1])) / det;
    const l2 = ((b[0] - a[0]) * (target[1] - a[1]) - (target[0] - a[0]) * (b[1] - a[1])) / det;
    const l0 = 1 - l1 - l2;
    if (l0 < -1e-9 || l1 < -1e-9 || l2 < -1e-9) continue;
    const zh = (l0 * a[2] + l1 * b[2] + l2 * c[2]) / HULL_Z;
    return {
      eHull: Math.max(0, e - zh),
      into: t.map((i, k) => ([l0, l1, l2][k]! > 1e-9 ? HULL_PHASES[i]!.name : '')).filter(Boolean),
    };
  }
  return { eHull: 0, into: [] };
}

const SLAB_LAYERS = 5;
const SLAB_DZ = 2.0;
const WF_U = 6; // depth of each layer's well, eV (model)
const WF_LAMBDA = 1.0; // decay length, Angstrom (model)
const WF_EF = -4.6; // Fermi level against the true vacuum, eV (model)
/** Model planar-average potential of a periodic slab of 5 layers with `vac` Angstrom of vacuum, eV. */
export function slabPotential(z: number, vac: number): number {
  const c = (SLAB_LAYERS - 1) * SLAB_DZ + vac;
  let v = 0;
  for (let img = -3; img <= 3; img++)
    for (let l = 0; l < SLAB_LAYERS; l++)
      v -= WF_U * Math.exp(-Math.abs(z - l * SLAB_DZ - img * c) / WF_LAMBDA);
  return v;
}

const hub: SceneDef = {
  id: 'm12-property-hub',
  title: 'Other calculations: one live example per family',
  badge: 'toy-model',
  banner:
    'Each example is a tiny model with example inputs (formation energies, a model potential, a tight-binding band), not a calculation for a material.',
  sources: ['S-042', 'S-049', 'S-031'],
  params: [
    {
      kind: 'select',
      id: 'family',
      label: 'Example',
      physics: true,
      value: 'hull',
      options: [
        { value: 'hull', label: 'Energy difference: the convex hull' },
        { value: 'work-function', label: 'Reading the potential: work function' },
        { value: 'effective-mass', label: 'Reading the bands: effective mass' },
      ],
    },
    {
      kind: 'slider',
      id: 'formation',
      label: 'Formation energy of ABC (hull)',
      unit: 'meV/atom',
      min: -300,
      max: 0,
      step: 5,
      value: -120,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'vacuum',
      label: 'Vacuum thickness (work function)',
      unit: 'Å',
      min: 3,
      max: 20,
      step: 0.5,
      value: 6,
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'hopping',
      label: 'Hopping t (effective mass)',
      unit: 'eV',
      min: 0.3,
      max: 2,
      step: 0.05,
      value: 1,
      digits: 2,
      physics: true,
    },
  ],
  build(p) {
    const fam = str(p, 'family');
    if (fam === 'work-function') return workFunctionFrame(num(p, 'vacuum'));
    if (fam === 'effective-mass') return effectiveMassFrame(num(p, 'hopping'));
    return hullFrame(num(p, 'formation'));
  },
};

function hullFrame(eAbc: number) {
  const pts = HULL_PHASES.map((ph) => hullPoint(ph.x, ph.e));
  const all = [...pts, hullPoint([1 / 3, 1 / 3, 1 / 3], eAbc)];
  const tris = lowerHull(all);
  const positions = all.flatMap((q) => [q[0], q[1], q[2]]);
  const { eHull, into } = energyAboveHull([1 / 3, 1 / 3, 1 / 3], eAbc);
  const stable = eHull <= 1e-9;
  const abc = all[6]!;
  const below = add(abc, [0, 0, -eHull * HULL_Z]);
  const layers: Layer[] = [
    {
      kind: 'mesh',
      group: 'hull',
      name: 'Lower convex hull',
      positions,
      indices: tris.flat(),
      color: 'accent',
      opacity: 0.4,
      edges: true,
    },
    lines(
      [
        [HULL_TRI.A!, HULL_TRI.B!],
        [HULL_TRI.B!, HULL_TRI.C!],
        [HULL_TRI.C!, HULL_TRI.A!],
      ],
      'muted',
      'triangle',
      { name: 'Composition triangle' },
    ),
    atoms(
      all,
      all.map((_, i) => (i === 6 ? 0.22 : 0.16)),
      all.map((_, i) => (i === 6 ? (stable ? 'c2' : 'pos') : 'c4')),
      'phases',
      {
        name: 'Phases',
        labels: [...HULL_PHASES.map((ph) => `${ph.name}: ${ph.e} meV/atom`), `ABC: ${fmt(eAbc, 0)} meV/atom`],
        highlight: [6],
      },
    ),
    labels(
      [
        ...HULL_PHASES.map((ph, i) => ({ text: ph.name, at: add(pts[i]!, [0, 0, 0.45]) })),
        { text: 'ABC', at: add(abc, [0, 0, 0.5]) },
      ],
      'labels',
    ),
  ];
  if (!stable)
    layers.push(lines([[abc, below]], 'pos', 'ehull', { name: 'Energy above the hull', dashed: true }));
  const describe = stable
    ? `A ternary A-B-C system: example formation energies lifted below the composition triangle and the lower convex hull through them. ` +
      `With a formation energy of ${fmt(eAbc, 0)} meV/atom the compound ABC lies on the hull (E_hull = 0), so it is stable against AB, BC and AC.`
    : `A ternary A-B-C system: example formation energies lifted below the composition triangle and the lower convex hull through them. ` +
      `ABC at ${fmt(eAbc, 0)} meV/atom sits ${fmt(eHull, 1)} meV/atom above the hull (the dashed drop), so it would decompose into ${into.join(', ')}.`;
  return {
    layers,
    describe,
    readouts: [
      { label: 'Formation energy of ABC', value: `${fmt(eAbc, 0)} meV/atom` },
      { label: 'Energy above hull', value: `${fmt(eHull, 1)} meV/atom` },
      { label: 'Decomposes into', value: stable ? 'stable' : into.join(' + ') },
    ],
    axes: ['composition', 'composition', 'formation energy (1 unit = 50 meV/atom)'] as [
      string,
      string,
      string,
    ],
  };
}

function workFunctionFrame(vac: number) {
  const top = (SLAB_LAYERS - 1) * SLAB_DZ;
  const zlo = -vac / 2;
  const zhi = top + vac / 2;
  const zmid = top + vac / 2;
  const pos: Vec3[] = [];
  for (let l = 0; l < SLAB_LAYERS; l++)
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++) pos.push([i * 2.6 + (l % 2) * 1.3, j * 2.6 + (l % 2) * 1.3, l * SLAB_DZ]);
  const x0 = -2.5;
  const vs = 0.55; // scene units per eV
  const prof: Vec3[] = Array.from({ length: 241 }, (_, i) => {
    const z = zlo + ((zhi - zlo) * i) / 240;
    return [x0 + slabPotential(z, vac) * vs, 0, z];
  });
  const vMid = slabPotential(zmid, vac);
  const slope = (slabPotential(zmid - 0.5, vac) - slabPotential(zmid - 1.5, vac)) / 1.0;
  const phi = vMid - WF_EF;
  const flat = Math.abs(vMid) < 0.01;
  const xF = x0 + WF_EF * vs;
  const xV = x0 + vMid * vs;
  const lat: Vec3[] = [
    [7.8, 0, 0],
    [0, 7.8, 0],
    [0, 0, zhi - zlo],
  ];
  const layers: Layer[] = [
    atoms(pos, 0.5, 'c3', 'slab', {
      name: 'Slab atoms',
      labels: pos.map((_, i) => `layer ${Math.floor(i / 9) + 1}`),
    }),
    lines(cellEdges(lat, [-0.65, -0.65, zlo]), 'muted', 'cell', { name: 'Cell with vacuum' }),
    curve(prof, 'ink', 'potential', { name: 'Planar-average potential', tube: 0.04 }),
    lines(
      [
        [
          [xF, 0, zlo],
          [xF, 0, zhi],
        ],
      ],
      'neg',
      'levels',
      { name: 'Fermi level and vacuum level', dashed: true },
    ),
    lines(
      [
        [
          [x0, 0, zlo],
          [x0, 0, zhi],
        ],
      ],
      'muted',
      'levels',
      { dashed: true },
    ),
    arrows([[xF, 0, zmid]], [[xV - xF, 0, 0]], 'pos', 'levels', { thickness: 0.03 }),
    labels(
      [
        { text: 'E_F', at: [xF, 0, zhi + 0.5] },
        { text: 'true vacuum (0 eV)', at: [x0, 0, zhi + 0.5] },
        { text: `Phi read = ${fmt(phi, 2)} eV`, at: [(xF + xV) / 2, 0, zmid + 0.6] },
      ],
      'labels',
    ),
  ];
  const describe =
    `A five-layer slab with ${fmt(vac, 1)} Å of vacuum, and beside it the model planar-average potential along z. ` +
    `In the middle of the vacuum the potential is ${fmt(vMid, 3)} eV ${flat ? 'and flat' : `and still sloping (${fmt(slope, 3)} eV/Å)`}, so the work function read ` +
    `there is ${fmt(phi, 2)} eV against the model's ${fmt(-WF_EF, 2)} eV for an infinite vacuum.` +
    `${flat ? '' : ' Thicken the vacuum until the plateau is flat.'}`;
  return {
    layers,
    describe,
    readouts: [
      { label: 'Vacuum', value: `${fmt(vac, 1)} Å` },
      { label: 'Potential at mid vacuum', value: `${fmt(vMid, 3)} eV` },
      { label: 'Work function read', value: `${fmt(phi, 2)} eV` },
      { label: 'Plateau', value: flat ? 'flat (within 10 meV)' : 'not converged' },
    ],
    ortho: true,
  };
}

const TB_A = 3; // Angstrom, model lattice constant
const TB_K = 3.5; // scene units per 1/Angstrom
const TB_E = 0.8; // scene units per eV
/** Effective mass m* / m_e at the band bottom of E = -2t (cos kx a + cos ky a): hbar^2 / (2 m_e t a^2). */
export const effectiveMass = (t: number, a = TB_A): number => HBAR2_OVER_2M_EV_A2 / (t * a * a);

function effectiveMassFrame(t: number) {
  const kmax = Math.PI / TB_A;
  const band = surfaceLayer(
    (x, y) => dispersion((x / TB_K) * TB_A, (y / TB_K) * TB_A, t) * TB_E,
    [-kmax * TB_K, kmax * TB_K],
    [-kmax * TB_K, kmax * TB_K],
    40,
    40,
    { group: 'band', name: 'Band E(kx, ky)', colormap: 'sequential', opacity: 0.85 },
  );
  const mStar = effectiveMass(t);
  const kp = 0.55 * kmax;
  const parab: Vec3[] = Array.from({ length: 81 }, (_, i) => {
    const k = -kp + (2 * kp * i) / 80;
    return [k * TB_K, 0, (-4 * t + (HBAR2_OVER_2M_EV_A2 / mStar) * k * k) * TB_E + 0.03];
  });
  const exact: Vec3[] = Array.from({ length: 121 }, (_, i) => {
    const k = -kmax + (2 * kmax * i) / 120;
    return [k * TB_K, 0, dispersion(k * TB_A, 0, t) * TB_E + 0.03];
  });
  const layers: Layer[] = [
    band,
    curve(exact, 'ink', 'cut', { name: 'Cut along kx', tube: 0.035 }),
    curve(parab, 'pos', 'parabola', { name: 'Parabola with m*', tube: 0.03 }),
    atoms([[0, 0, -4 * t * TB_E]], 0.14, 'accent', 'gamma', {
      labels: ['Gamma, band bottom'],
      highlight: [0],
    }),
    ...axesLayers([kmax * TB_K + 0.6, kmax * TB_K + 0.6, 4 * 2 * TB_E], ['kx (1/Å)', 'ky (1/Å)', 'E (eV)']),
    labels([{ text: 'Gamma', at: [0, 0, -4 * t * TB_E - 0.5] }], 'labels'),
  ];
  const describe =
    `A model tight-binding band E = -2t (cos kx a + cos ky a) with t = ${fmt(t, 2)} eV and a = ${TB_A} Å, drawn over the Brillouin zone; ` +
    `its width is ${fmt(8 * t, 2)} eV. Near Gamma it follows the orange parabola of effective mass m* = ${fmt(mStar, 3)} m_e, from the curvature ` +
    `1/m* = (1/hbar^2) d2E/dk2; a larger hopping gives a steeper band and a lighter mass.`;
  return {
    layers,
    describe,
    readouts: [
      { label: 'Hopping t', value: `${fmt(t, 2)} eV` },
      { label: 'Band width', value: `${fmt(8 * t, 2)} eV` },
      { label: 'm* at Gamma', value: `${fmt(mStar, 3)} m_e` },
    ],
    axes: ['kx (1/Å)', 'ky (1/Å)', 'E (eV, x 0.8)'] as [string, string, string],
  };
}

export const scenes: Record<string, SceneDef> = {
  [phonons.id]: phonons,
  [elastic.id]: elastic,
  [eos.id]: eos,
  [dielectric.id]: dielectric,
  [optics.id]: optics,
  [bader.id]: bader,
  [hub.id]: hub,
};
