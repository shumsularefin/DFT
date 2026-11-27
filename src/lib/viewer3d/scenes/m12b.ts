// Module 12 new topics (M16.13, M16.14): surfaces and slabs, point defects, the convex hull, the nudged elastic band and
// molecular dynamics. Pure generators on tested libraries: crystal/slab (with the cubic symmetry provider), crystal/
// defects and supercell, physics/slabPotential, physics/lennardJones, physics/hull and physics/neb.
// @source S-064 S-063 S-066 S-109 S-067 S-125 S-126 S-036 S-044 S-034 S-120 S-167 S-121 S-124
import { covalentRadius } from '../../crystal/covalent';
import { cubicMoyo } from '../../crystal/cubicSymmetry';
import { shortestLatticeVector, vacancy } from '../../crystal/defects';
import { buildSlab, type Hkl, type SlabResult } from '../../crystal/slab';
import { diagonalSupercell } from '../../crystal/supercell';
import type { Structure } from '../../crystal/types';
import { stability, type HullPhase } from '../../physics/hull';
import {
  ARGON,
  DEFAULT_CUTOFF_SIGMA,
  MDRun,
  buildPairs,
  energyForces,
  fccLatticeConstant,
  fccPositions,
  relaxSteepest,
  type LJSpecies,
  type LJSystem,
  type RelaxFrame,
} from '../../physics/lennardJones';
import {
  MB_MINIMA,
  MB_SADDLES,
  MULLER_BROWN,
  linearBand,
  nebForces,
  mullerBrown,
  refineStationary,
  runNeb,
  type NebFrame,
  type P2,
} from '../../physics/neb';
import { planarPotential } from '../../physics/slabPotential';
import { lookupStructure } from '../../scene/library';
import {
  arrows,
  atoms,
  axesLayers,
  cellLayer,
  crystalLayers,
  curve,
  fmt,
  labels,
  lines,
  quadLayer,
  speciesTones,
  sphereLayer,
  surfaceLayer,
} from '../kit';
import type { Color, Layer, Readout, SceneDef, Vec3 } from '../types';

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Keep a memo map small: drop the oldest entry beyond `max`. */
function remember<T>(m: Map<string, T>, key: string, make: () => T, max = 24): T {
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const v = make();
  m.set(key, v);
  if (m.size > max) m.delete(m.keys().next().value!);
  return v;
}

// ---------------------------------------------------------------------------------------------------------------------
// Surfaces and slabs
// ---------------------------------------------------------------------------------------------------------------------

const SLAB_CRYSTALS: Record<string, { label: string; formula: string }> = {
  perovskite: { label: 'SrTiO3 (perovskite)', formula: 'SrTiO3' },
  rocksalt: { label: 'NaCl (rock salt)', formula: 'NaCl' },
  fcc: { label: 'Cu (fcc metal)', formula: 'Cu' },
};

/** Fixed scale of the electrostatic part of the model potential (arbitrary units per volt), see the banner. */
export const SLAB_FIELD_SCALE = 1 / 40;

export interface SlabModel {
  slab: SlabResult;
  /** Cartesian positions (standard frame, z along the normal), the slab centred in a cell of height `c`. */
  positions: Vec3[];
  species: string[];
  /** Cell height (slab thickness plus vacuum), angstrom. */
  c: number;
  inPlane: [Vec3, Vec3];
  /** Atomic layers: height and member atoms. */
  layers: { z: number; atoms: number[] }[];
  /** Nominal charge per atom (0 when none could be assigned). */
  charges: number[];
  /** Net nominal charge per surface cell, e. */
  netCharge: number;
  /** Dipole per area about the slab centre from nominal charges, e / angstrom. */
  dipolePerArea: number;
  thickness: number;
  vacuum: number;
  symmetricFaces: boolean;
  /** Model potential along z (arbitrary units): z grid and values. */
  potential: { z: number[]; v: number[] };
  /** Model potential in the middle of the vacuum just above the top face and just below the bottom face. */
  vacuumTop: number;
  vacuumBottom: number;
  /** Mean slope of the model potential across the vacuum, model units per angstrom. */
  vacuumSlope: number;
}

const slabCache = new Map<string, SlabResult>();
const slabModelCache = new Map<string, SlabModel>();

function clusterZ(z: readonly number[], tol = 0.1): { z: number; atoms: number[] }[] {
  const order = z.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x);
  const out: { z: number; atoms: number[] }[] = [];
  for (const e of order) {
    const last = out[out.length - 1];
    if (last && e.x - z[last.atoms[last.atoms.length - 1]!]! <= tol) last.atoms.push(e.i);
    else out.push({ z: e.x, atoms: [e.i] });
  }
  for (const l of out) l.z = l.atoms.reduce((a, i) => a + z[i]!, 0) / l.atoms.length;
  return out;
}

/**
 * A slab cut by `buildSlab` and, for the symmetric terminations, one more atomic layer: a copy of the bottom layer on
 * top (shifted by the slab's stacking) or of the top layer underneath. Its nominal layer charges give the model
 * potential through the planar Poisson solver.
 */
export function slabModel(
  crystal: string,
  hkl: Hkl,
  periods: number,
  vacuum: number,
  term: string,
  dipoleCorrection: boolean,
): SlabModel {
  const key = `${crystal}|${hkl.join('')}|${periods}|${vacuum}|${term}|${dipoleCorrection}`;
  return remember(slabModelCache, key, () => {
    const bulk = lookupStructure(crystal)!;
    const slab = remember(slabCache, `${crystal}|${hkl.join('')}|${periods}`, () =>
      buildSlab(cubicMoyo, bulk, hkl, { layers: periods, vacuumA: 10, termination: 0 }),
    );
    const L = slab.structure.lattice;
    const a1 = v3(L[0]);
    const a2 = v3(L[1]);
    let pos = slab.structure.frac.map((f) =>
      v3([0, 1, 2].map((k) => f[0] * L[0][k]! + f[1] * L[1][k]! + f[2] * L[2][k]!)),
    );
    const species = [...slab.structure.species];
    // stacking vector of one bulk period in the slab's standard frame (x along a1, z along the normal)
    const [p1] = slab.plan.inPlane;
    const n = slab.plan.normal;
    const e1 = p1.map((x) => x / Math.hypot(...p1));
    const e2 = [n[1] * e1[2]! - n[2] * e1[1]!, n[2] * e1[0]! - n[0] * e1[2]!, n[0] * e1[1]! - n[1] * e1[0]!];
    const st = slab.plan.stacking;
    const dot = (u: readonly number[], w: readonly number[]) => u[0]! * w[0]! + u[1]! * w[1]! + u[2]! * w[2]!;
    const stack: Vec3 = [dot(st, e1) * periods, dot(st, e2) * periods, dot(st, n) * periods];
    const lay0 = clusterZ(pos.map((p) => p[2]));
    if (term === 'bottom' || term === 'top') {
      const src = term === 'bottom' ? lay0[0]! : lay0[lay0.length - 1]!;
      const sgn = term === 'bottom' ? 1 : -1;
      for (const i of src.atoms) {
        pos.push([pos[i]![0] + sgn * stack[0], pos[i]![1] + sgn * stack[1], pos[i]![2] + sgn * stack[2]]);
        species.push(species[i]!);
      }
    }
    // centre the slab in a cell of height thickness + vacuum, so the vacuum straddles the cell boundary
    const zs = pos.map((p) => p[2]);
    const zmin = Math.min(...zs);
    const zmax = Math.max(...zs);
    const thickness = zmax - zmin;
    const c = thickness + vacuum;
    pos = pos.map((p) => [p[0], p[1], p[2] - (zmin + zmax) / 2 + c / 2]);
    // wrap in plane into the cell spanned by a1, a2
    const det = a1[0] * a2[1] - a1[1] * a2[0];
    pos = pos.map((p) => {
      let u = (p[0] * a2[1] - p[1] * a2[0]) / det;
      let w = (a1[0] * p[1] - a1[1] * p[0]) / det;
      u -= Math.floor(u + 1e-9);
      w -= Math.floor(w + 1e-9);
      return [u * a1[0] + w * a2[0], u * a1[1] + w * a2[1], p[2]];
    });
    const nominal = slab.polarity.charges;
    const charges = species.map((s) => nominal?.[s] ?? 0);
    const layers = clusterZ(pos.map((p) => p[2]));
    const area = slab.plan.area;
    const zc = c / 2;
    const netCharge = charges.reduce((a, q) => a + q, 0);
    const dipolePerArea = charges.reduce((a, q, i) => a + q * (pos[i]![2] - zc), 0) / area;
    const sheets = layers.map((l) => ({
      z: l.z,
      charge: l.atoms.reduce((a, i) => a + charges[i]!, 0) / area,
    }));
    const pp = planarPotential(sheets, c, { n: 300, width: 0.4, dipoleCorrection });
    // electron potential energy (minus phi), scaled, plus a schematic well of depth 1 at every atomic layer
    const wells = (z: number) =>
      layers.reduce((acc, l) => {
        let s = 0;
        for (const sh of [-c, 0, c]) s += Math.exp(-((z - l.z - sh) ** 2) / (2 * 0.45 * 0.45));
        return acc - s;
      }, 0);
    const v = pp.z.map((z, k) => -pp.phi[k]! * SLAB_FIELD_SCALE + wells(z));
    const mid = v.reduce((a, b) => a + b, 0) / v.length;
    const vv = v.map((x) => x - mid);
    const at = (z: number) => vv[Math.min(vv.length - 1, Math.max(0, Math.round((z / c) * vv.length)))]!;
    const g = vacuum / 2;
    const vacuumTop = at(zc + thickness / 2 + 0.6 * g);
    const vacuumBottom = at(zc - thickness / 2 - 0.6 * g);
    const s1 = at(zc + thickness / 2 + 0.3 * g);
    const s2 = at(zc + thickness / 2 + 0.9 * g);
    const vacuumSlope = g > 1 ? (s2 - s1) / (0.6 * g) : 0;
    const bottomSp = [...new Set(layers[0]!.atoms.map((i) => species[i]!))].sort();
    const topSp = [...new Set(layers[layers.length - 1]!.atoms.map((i) => species[i]!))].sort();
    return {
      slab,
      positions: pos,
      species,
      c,
      inPlane: [a1, a2],
      layers,
      charges,
      netCharge,
      dipolePerArea,
      thickness,
      vacuum,
      symmetricFaces: bottomSp.join() === topSp.join(),
      potential: { z: pp.z, v: vv },
      vacuumTop,
      vacuumBottom,
      vacuumSlope,
    };
  });
}

const SLAB_ORDER: Record<string, number> = { Sr: 0, Na: 0, Ti: 1, Cu: 0, Cl: 2, O: 2 };
const layerName = (m: SlabModel, k: number): string => {
  const sp = m.layers[k]!.atoms.map((i) => m.species[i]!);
  const counts = new Map<string, number>();
  for (const s of sp) counts.set(s, (counts.get(s) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => (SLAB_ORDER[a[0]] ?? 9) - (SLAB_ORDER[b[0]] ?? 9))
    .map(([s, n]) => (n > 1 ? `${s}${n}` : s))
    .join('');
};

const slabScene: SceneDef = {
  id: 'm12b-slab',
  title: 'A slab cut from the bulk',
  badge: 'toy-model',
  sources: ['S-064', 'S-063', 'S-066', 'S-109', 'S-065'],
  banner:
    'The slab is cut by the tested slab builder (the pymatgen method). The potential beside it is a one-dimensional ' +
    'model in arbitrary units: nominal layer charges through Poisson, scaled down by a fixed factor, plus a schematic ' +
    'well at each atomic layer. It is not a VASP LOCPOT.',
  params: [
    {
      kind: 'select',
      id: 'crystal',
      label: 'Crystal',
      physics: true,
      value: 'perovskite',
      options: Object.entries(SLAB_CRYSTALS).map(([value, c]) => ({ value, label: c.label })),
    },
    {
      kind: 'select',
      id: 'hkl',
      label: 'Miller indices (hkl)',
      physics: true,
      value: '100',
      options: [
        { value: '100', label: '(100)' },
        { value: '110', label: '(110)' },
        { value: '111', label: '(111)' },
      ],
    },
    {
      kind: 'select',
      id: 'term',
      label: 'Termination',
      physics: true,
      value: 'cut',
      options: [
        { value: 'cut', label: 'As cut (whole bulk repeats)' },
        { value: 'bottom', label: 'Bottom layer on both faces' },
        { value: 'top', label: 'Top layer on both faces' },
      ],
    },
    {
      kind: 'slider',
      id: 'periods',
      label: 'Thickness (bulk repeats)',
      min: 1,
      max: 6,
      step: 1,
      value: 3,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'vacuum',
      label: 'Vacuum',
      min: 2,
      max: 24,
      step: 1,
      value: 12,
      unit: 'angstrom',
      digits: 0,
      physics: true,
    },
    { kind: 'toggle', id: 'dipole', label: 'Dipole correction (LDIPOL)', value: false, physics: true },
  ],
  build(p) {
    const crystal = String(p.crystal) in SLAB_CRYSTALS ? String(p.crystal) : 'perovskite';
    const hkl = String(p.hkl).split('').map(Number) as unknown as Hkl;
    const periods = Math.round(Number(p.periods));
    const vac = Number(p.vacuum);
    const term = String(p.term);
    const corr = Boolean(p.dipole);
    const m = slabModel(crystal, hkl, periods, vac, term, corr);
    const [a1, a2] = m.inPlane;
    const latt: [Vec3, Vec3, Vec3] = [a1, a2, [0, 0, m.c]];
    // atoms, bonds and cell from a structure in fractional coordinates, repeated 2 x 2 in plane
    const det = a1[0] * a2[1] - a1[1] * a2[0];
    const s: Structure = {
      lattice: latt,
      species: m.species,
      frac: m.positions.map((q) => [
        (q[0] * a2[1] - q[1] * a2[0]) / det,
        (a1[0] * q[1] - a1[1] * q[0]) / det,
        q[2] / m.c,
      ]),
    };
    const cr = crystalLayers(s, { repeat: [2, 2, 1] });
    const layers: Layer[] = [...cr.layers];
    // the periodic copy of the slab across the vacuum (one in-plane cell, faded)
    const tones = speciesTones(lookupStructure(crystal)!.species);
    layers.push(
      atoms(
        m.positions.map((q) => [q[0], q[1], q[2] + m.c]),
        m.species.map((e) => covalentRadius(e).radius * 0.45),
        m.species.map((e) => tones.get(e) ?? 'c0'),
        'images',
        { name: 'Periodic copy', opacity: 0.25 },
      ),
    );
    // the model planar-average potential, drawn beside the slab against the same heights
    const xMax = Math.max(...cr.positions.map((q) => q[0])) + 2.5;
    const vmin = Math.min(...m.potential.v);
    const xs = (v: number) => xMax + 1.6 * (v - vmin);
    const pts: Vec3[] = m.potential.z.map((z, k) => [xs(m.potential.v[k]!), 0, z]);
    pts.push([xs(m.potential.v[0]!), 0, m.c]);
    layers.push(curve(pts, 'accent', 'potential', { name: 'Planar-average potential', tube: 0.05 }));
    layers.push(
      lines(
        [
          [
            [xMax, 0, 0],
            [xMax, 0, m.c],
          ],
        ],
        'muted',
        'potential',
      ),
    );
    const zTop = m.c / 2 + m.thickness / 2;
    const zBot = m.c / 2 - m.thickness / 2;
    const labelItems = [
      { text: 'planar average V(z)', at: [xMax, 0, m.c + 1] as Vec3 },
      { text: `top: ${layerName(m, m.layers.length - 1)}`, at: [0, 0, zTop + 1.2] as Vec3 },
      { text: `bottom: ${layerName(m, 0)}`, at: [0, 0, zBot - 1.2] as Vec3 },
    ];
    if (vac >= 4) labelItems.push({ text: 'vacuum', at: [a1[0] / 2, 0, m.c - (m.c - zTop) / 2] });
    layers.push(labels(labelItems, 'labels'));
    if (corr) {
      layers.push(
        quadLayer([0, 0, m.c], [2 * a1[0], 2 * a1[1], 0], [2 * a2[0], 2 * a2[1], 0], {
          group: 'dipole',
          name: 'Dipole layer',
          color: 'pos',
          opacity: 0.25,
        }),
      );
    }
    const polar = Math.abs(m.dipolePerArea) > 1e-3;
    const step = m.vacuumTop - m.vacuumBottom;
    const charged = Math.abs(m.netCharge) > 1e-6;
    const tasker = m.slab.polarity.tasker;
    let vacuumText: string;
    if (!polar)
      vacuumText =
        'With nominal charges the slab has no dipole, so the model potential is flat in the vacuum on both sides' +
        (corr ? ' and the dipole correction changes nothing.' : '.');
    else if (!corr)
      vacuumText =
        `The slab carries a dipole of ${fmt(m.dipolePerArea, 3)} e per angstrom, and the periodic cell forces a ` +
        `compensating field across the vacuum: the model potential slopes there by ${fmt(m.vacuumSlope, 3)} units per angstrom, an artefact of the boundary.`;
    else
      vacuumText =
        `The dipole layer at the middle of the vacuum cancels the artificial field: the model potential is flat on both sides ` +
        `and steps by ${fmt(Math.abs(step), 2)} units at that layer, so the two faces have different vacuum levels.`;
    const hklText = `(${hkl.join('')})`;
    const describe =
      `A ${hklText} slab of ${SLAB_CRYSTALS[crystal]!.formula}, ${plural(periods, 'bulk repeat')} thick ` +
      `(${plural(m.layers.length, 'atomic layer')}, ${plural(m.species.length, 'atom')} per surface cell, ${fmt(m.thickness, 1)} angstrom), ` +
      `with ${fmt(vac, 0)} angstrom of vacuum; the bottom face is ${layerName(m, 0)} and the top face ${layerName(m, m.layers.length - 1)}` +
      `${charged ? `, and with nominal charges it carries a net ${fmt(m.netCharge, 0)} e per surface cell` : ''}. ` +
      vacuumText;
    const readouts: Readout[] = [
      {
        label: 'Faces',
        value: `${layerName(m, 0)} / ${layerName(m, m.layers.length - 1)}${m.symmetricFaces ? ' (same)' : ''}`,
      },
      { label: 'Slab, vacuum', value: `${fmt(m.thickness, 1)} Å, ${fmt(vac, 0)} Å` },
      {
        label: 'Tasker type, dipole',
        value: `${tasker ?? 'n/a'}, ${fmt(m.dipolePerArea, 3)} e/Å`,
      },
      {
        label: 'Vacuum levels',
        value: !polar ? 'equal' : corr ? `step ${fmt(Math.abs(step), 2)} (model)` : 'field across vacuum',
      },
    ];
    return {
      layers,
      describe,
      readouts,
      lattice: latt,
      ortho: true,
      camera: 'a',
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Point defects in a Lennard-Jones supercell
// ---------------------------------------------------------------------------------------------------------------------

/** The model solute of the substitution: an atom 15 percent larger than argon, otherwise like it (a toy choice). */
export const SOLUTE: LJSpecies = { sigma: 1.15 * ARGON.sigma, epsilon: ARGON.epsilon, mass: ARGON.mass };
export const DEFECT_STEPS = 20;

export interface DefectModel {
  n: number;
  a0: number;
  box: number;
  /** Defect site, angstrom. */
  site: Vec3;
  types: number[];
  frames: RelaxFrame[];
  /** Index of the defect atom (interstitial or substituted), or -1 for a vacancy. */
  defectAtom: number;
  /** Nearest neighbours of the defect site (indices into the defect cell). */
  neighbours: number[];
  /** Energy of the perfect supercell, eV, and per atom. */
  eBulk: number;
  ePerAtom: number;
  imageDistance: number;
}

const defectCache = new Map<string, DefectModel>();

export function defectModel(kind: string, n: number): DefectModel {
  return remember(defectCache, `${kind}|${n}`, () => {
    const a0 = fccLatticeConstant();
    const conv: Structure = {
      lattice: [
        [a0, 0, 0],
        [0, a0, 0],
        [0, 0, a0],
      ],
      species: ['Ar', 'Ar', 'Ar', 'Ar'],
      frac: [
        [0, 0, 0],
        [0.5, 0.5, 0],
        [0.5, 0, 0.5],
        [0, 0.5, 0.5],
      ],
    };
    const sup = diagonalSupercell(conv, n, n, n);
    const box = n * a0;
    const cart = (f: readonly number[]): Vec3 => [f[0]! * box, f[1]! * box, f[2]! * box];
    const centre: Vec3 = [box / 2, box / 2, box / 2];
    const d2 = (p: Vec3) => (p[0] - centre[0]) ** 2 + (p[1] - centre[1]) ** 2 + (p[2] - centre[2]) ** 2;
    const host = sup.frac.map(cart);
    let nearest = 0;
    host.forEach((p, i) => {
      if (d2(p) < d2(host[nearest]!) - 1e-9) nearest = i;
    });
    let positions: Vec3[];
    let types: number[];
    let site: Vec3;
    let defectAtom = -1;
    if (kind === 'vacancy') {
      const v = vacancy(sup, nearest);
      positions = v.structure.frac.map(cart);
      types = positions.map(() => 0);
      site = host[nearest]!;
    } else if (kind === 'interstitial') {
      // octahedral hole: a cube centre (i + 1/2, j + 1/2, k + 1/2) a0 nearest the supercell centre
      const k = Math.floor((n - 1) / 2);
      site = [(k + 0.5) * a0, (k + 0.5) * a0, (k + 0.5) * a0];
      positions = [...host, site];
      types = positions.map(() => 0);
      defectAtom = positions.length - 1;
    } else {
      positions = host;
      types = host.map((_, i) => (i === nearest ? 1 : 0));
      site = host[nearest]!;
      defectAtom = nearest;
    }
    const sys: LJSystem = {
      box,
      types,
      species: [ARGON, SOLUTE],
      rc: DEFAULT_CUTOFF_SIGMA * ARGON.sigma,
    };
    const flat = Float64Array.from(positions.flat());
    const frames = relaxSteepest(flat, sys, DEFECT_STEPS);
    // perfect crystal of the same size and settings
    const perfect = fccPositions(n, a0);
    const psys: LJSystem = { ...sys, types: host.map(() => 0) };
    const eBulk = energyForces(perfect, psys, buildPairs(perfect, psys, 0)).energy;
    const nn = a0 / Math.SQRT2;
    const neighbours: number[] = [];
    positions.forEach((p, i) => {
      if (i === defectAtom) return;
      let best = Infinity;
      for (const sx of [-box, 0, box])
        for (const sy of [-box, 0, box])
          for (const sz of [-box, 0, box])
            best = Math.min(best, Math.hypot(p[0] + sx - site[0], p[1] + sy - site[1], p[2] + sz - site[2]));
      if (best < (kind === 'interstitial' ? 0.75 * a0 : 1.1 * nn)) neighbours.push(i);
    });
    return {
      n,
      a0,
      box,
      site,
      types,
      frames,
      defectAtom,
      neighbours,
      eBulk,
      ePerAtom: eBulk / host.length,
      imageDistance: shortestLatticeVector(sup.lattice),
    };
  });
}

/** Formation energy in the model: E_defect - (N_defect / N_bulk) E_bulk for a vacancy or an interstitial (S-067). */
export function defectFormationEnergy(m: DefectModel, step: number): number {
  const f = m.frames[Math.min(step, m.frames.length - 1)]!;
  return f.energy - m.types.length * m.ePerAtom;
}

const DEFECT_NAMES: Record<string, string> = {
  vacancy: 'a vacancy',
  interstitial: 'an octahedral interstitial',
  substitution: 'a substituted larger atom X',
};
const ARROW_MAGNIFY = 10;

const defectScene: SceneDef = {
  id: 'm12b-defect',
  title: 'A point defect in a supercell',
  badge: 'toy-model',
  sources: ['S-067', 'S-125', 'S-036'],
  banner:
    'The host is a Lennard-Jones model of solid argon, not a DFT calculation: it shows how neighbours relax around a ' +
    'defect and how far the defect is from its periodic images. X is a model atom 15 percent larger than Ar.',
  params: [
    {
      kind: 'select',
      id: 'defect',
      label: 'Defect',
      physics: true,
      value: 'vacancy',
      options: [
        { value: 'vacancy', label: 'Vacancy' },
        { value: 'interstitial', label: 'Interstitial' },
        { value: 'substitution', label: 'Substitution (larger atom X)' },
      ],
    },
    {
      kind: 'slider',
      id: 'size',
      label: 'Supercell (n x n x n cubic cells)',
      min: 1,
      max: 4,
      step: 1,
      value: 2,
      digits: 0,
      physics: true,
    },
    {
      kind: 'step',
      id: 'step',
      label: 'Relaxation step',
      min: 0,
      max: DEFECT_STEPS,
      value: 0,
      interval: 0.4,
      physics: true,
    },
    { kind: 'toggle', id: 'images', label: 'Periodic images', value: true },
  ],
  build(p) {
    const kind = String(p.defect) in DEFECT_NAMES ? String(p.defect) : 'vacancy';
    const n = Math.round(Number(p.size));
    const step = Math.max(0, Math.min(DEFECT_STEPS, Math.round(Number(p.step))));
    const m = defectModel(kind, n);
    const f = m.frames[step]!;
    const f0 = m.frames[0]!;
    const N = m.types.length;
    const pos: Vec3[] = [];
    for (let i = 0; i < N; i++) pos.push([f.pos[3 * i]!, f.pos[3 * i + 1]!, f.pos[3 * i + 2]!]);
    const hostIdx = pos.map((_, i) => i).filter((i) => i !== m.defectAtom);
    const layers: Layer[] = [
      atoms(
        hostIdx.map((i) => pos[i]!),
        0.75,
        'c0',
        'atoms',
        {
          name: 'Ar atoms',
          labels: hostIdx.map((i) => `Ar ${i + 1}`),
          highlight: hostIdx.map((i, k) => (m.neighbours.includes(i) ? k : -1)).filter((k) => k >= 0),
        },
      ),
      cellLayer(
        [
          [m.box, 0, 0],
          [0, m.box, 0],
          [0, 0, m.box],
        ],
        'cell',
      ),
    ];
    const defectAt: Vec3 = m.defectAtom >= 0 ? pos[m.defectAtom]! : m.site;
    if (kind === 'vacancy')
      layers.push(
        sphereLayer(m.site, 0.75, {
          group: 'defect',
          name: 'Defect',
          color: 'pos',
          wireframe: true,
          segments: 12,
        }),
      );
    else
      layers.push(
        atoms([defectAt], kind === 'substitution' ? 0.86 : 0.75, 'pos', 'defect', {
          name: 'Defect',
          labels: [kind === 'substitution' ? 'X' : 'Ar interstitial'],
          highlight: [0],
        }),
      );
    // displacements of the neighbours since the start, magnified
    const from: Vec3[] = [];
    const vec: Vec3[] = [];
    let maxDisp = 0;
    for (let i = 0; i < N; i++) {
      const d: Vec3 = [
        f.pos[3 * i]! - f0.pos[3 * i]!,
        f.pos[3 * i + 1]! - f0.pos[3 * i + 1]!,
        f.pos[3 * i + 2]! - f0.pos[3 * i + 2]!,
      ];
      const len = Math.hypot(...d);
      maxDisp = Math.max(maxDisp, len);
      if (m.neighbours.includes(i) && len > 1e-4) {
        from.push([f0.pos[3 * i]!, f0.pos[3 * i + 1]!, f0.pos[3 * i + 2]!]);
        vec.push([d[0] * ARROW_MAGNIFY, d[1] * ARROW_MAGNIFY, d[2] * ARROW_MAGNIFY]);
      }
    }
    if (from.length)
      layers.push(arrows(from, vec, 'accent', 'relax', { name: 'Displacements (x10)', thickness: 0.06 }));
    const items: { text: string; at: Vec3 }[] = [
      {
        text: kind === 'vacancy' ? 'vacancy' : kind === 'substitution' ? 'X' : 'interstitial',
        at: [m.site[0], m.site[1], m.site[2] + 1.4],
      },
    ];
    if (p.images) {
      const imgs: Vec3[] = [];
      for (const i of [-1, 0, 1])
        for (const j of [-1, 0, 1])
          for (const k of [-1, 0, 1])
            if (i || j || k) imgs.push([m.site[0] + i * m.box, m.site[1] + j * m.box, m.site[2] + k * m.box]);
      layers.push(
        atoms(imgs, 0.6, 'pos', 'images', { name: 'Periodic images of the defect', opacity: 0.55 }),
      );
      const seg: [Vec3, Vec3][] = [];
      const cellSeg: [Vec3, Vec3][] = [];
      const faces: Vec3[] = [
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      for (const fc of faces) {
        seg.push([m.site, [m.site[0] + fc[0] * m.box, m.site[1] + fc[1] * m.box, m.site[2] + fc[2] * m.box]]);
        const o: Vec3 = [fc[0] * m.box, fc[1] * m.box, fc[2] * m.box];
        const e: [Vec3, Vec3, Vec3] = [
          [m.box, 0, 0],
          [0, m.box, 0],
          [0, 0, m.box],
        ];
        const corner = (a: number, b: number, c: number): Vec3 => [
          o[0] + a * e[0][0],
          o[1] + b * e[1][1],
          o[2] + c * e[2][2],
        ];
        for (const a of [0, 1])
          for (const b of [0, 1]) {
            cellSeg.push([corner(a, b, 0), corner(a, b, 1)]);
            cellSeg.push([corner(a, 0, b), corner(a, 1, b)]);
            cellSeg.push([corner(0, a, b), corner(1, a, b)]);
          }
      }
      layers.push(lines(seg, 'pos', 'images', { dashed: true }));
      layers.push(lines(cellSeg, 'muted', 'images', { dashed: true }));
      items.push({
        text: `${fmt(m.imageDistance, 1)} Å to the next image`,
        at: [m.site[0] + m.box / 2, m.site[1], m.site[2] + 1.0],
      });
    }
    layers.push(labels(items, 'labels'));
    const eRel = f.energy - f0.energy;
    const eForm = defectFormationEnergy(m, step);
    const formation = kind === 'substitution' ? null : eForm;
    const describe =
      `A ${n} x ${n} x ${n} supercell of Lennard-Jones fcc argon (${4 * n ** 3} sites, ${fmt(m.box, 2)} angstrom edge) with ` +
      `${DEFECT_NAMES[kind]} at the centre, after ${step} of ${DEFECT_STEPS} steepest-descent steps. ` +
      `The ${m.neighbours.length} atoms next to the defect have moved by up to ${fmt(maxDisp, 3)} angstrom (arrows drawn ${ARROW_MAGNIFY} times longer) ` +
      `and the energy has dropped by ${fmt(-eRel * 1000, 1)} meV; the defect is ${fmt(m.imageDistance, 2)} angstrom from its nearest periodic image` +
      `${p.images ? ', drawn in the 26 neighbouring cells' : ''}.` +
      (m.imageDistance < DEFAULT_CUTOFF_SIGMA * ARGON.sigma
        ? ` That is inside the ${fmt(DEFAULT_CUTOFF_SIGMA * ARGON.sigma, 2)} angstrom range of the forces, so the defect interacts with its own images.`
        : '');
    return {
      layers,
      describe,
      readouts: [
        { label: 'Supercell', value: `${n} x ${n} x ${n}, ${N} atoms` },
        { label: 'Image distance', value: `${fmt(m.imageDistance, 2)} Å` },
        { label: 'Largest displacement', value: `${fmt(maxDisp, 3)} Å` },
        formation === null
          ? { label: 'Relaxation energy', value: `${fmt(eRel * 1000, 1)} meV` }
          : { label: 'Formation energy (model)', value: `${fmt(formation, 3)} eV` },
      ],
      lattice: [
        [m.box, 0, 0],
        [0, m.box, 0],
        [0, 0, m.box],
      ],
      ortho: true,
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// The ternary convex hull (sample energies)
// ---------------------------------------------------------------------------------------------------------------------

/** Synthetic formation energies (eV/atom) for a made-up A-B-C system: example data, not a real material. */
export const HULL_SAMPLE: readonly HullPhase[] = [
  { name: 'A', counts: [1, 0, 0], energy: 0 },
  { name: 'B', counts: [0, 1, 0], energy: 0 },
  { name: 'C', counts: [0, 0, 1], energy: 0 },
  { name: 'AB', counts: [1, 1, 0], energy: -0.5 },
  { name: 'A2B', counts: [2, 1, 0], energy: -0.38 },
  { name: 'BC', counts: [0, 1, 1], energy: -0.3 },
  { name: 'B2C', counts: [0, 2, 1], energy: -0.18 },
  { name: 'AC2', counts: [1, 0, 2], energy: -0.42 },
  { name: 'AC', counts: [1, 0, 1], energy: -0.35 },
  { name: 'ABC', counts: [1, 1, 1], energy: -0.55 },
  { name: 'A2BC', counts: [2, 1, 1], energy: -0.4 },
  { name: 'ABC2', counts: [1, 1, 2], energy: -0.44 },
];
/** Scene units per eV/atom on the energy axis; the composition triangle has edge 10. */
export const HULL_Z = 12;
const TRI_B: Vec3 = [10, 0, 0];
const TRI_C: Vec3 = [5, 5 * Math.sqrt(3), 0];

export function hullPoint(counts: readonly number[], e: number): Vec3 {
  const t = counts[0]! + counts[1]! + counts[2]!;
  const xb = counts[1]! / t;
  const xc = counts[2]! / t;
  return [xb * TRI_B[0] + xc * TRI_C[0], xb * TRI_B[1] + xc * TRI_C[1], e * HULL_Z];
}

const hullScene: SceneDef = {
  id: 'm12b-hull',
  title: 'A ternary convex hull',
  badge: 'sample',
  sources: ['S-044', 'S-034', 'S-120'],
  banner:
    'Sample data: made-up formation energies for an invented A-B-C system, chosen to show the method. They are not ' +
    'results for any real material.',
  params: [
    {
      kind: 'select',
      id: 'phase',
      label: 'Phase',
      physics: true,
      value: 'A2BC',
      options: HULL_SAMPLE.slice(3).map((h) => ({ value: h.name, label: h.name })),
    },
    {
      kind: 'slider',
      id: 'shift',
      label: 'Shift its energy',
      min: -150,
      max: 150,
      step: 5,
      value: 0,
      unit: 'meV/atom',
      digits: 0,
      physics: true,
    },
    { kind: 'toggle', id: 'drops', label: 'Distances to the hull', value: true },
  ],
  build(p) {
    const pick = Math.max(
      3,
      HULL_SAMPLE.findIndex((h) => h.name === p.phase),
    );
    const shift = Number(p.shift) / 1000;
    const phases: HullPhase[] = HULL_SAMPLE.map((h, i) => ({
      ...h,
      energy: i === pick ? h.energy + shift : h.energy,
    }));
    const st = stability(phases);
    const pts = phases.map((h) => hullPoint(h.counts, h.energy));
    const stable = phases.map((_, i) => st.phases[i]!.aboveHull < 1e-9);
    const meshPos = pts.flatMap((q) => [q[0], q[1], q[2]]);
    const layers: Layer[] = [
      {
        kind: 'mesh',
        group: 'hull',
        name: 'Hull facets',
        positions: meshPos,
        indices: st.facets.flat(),
        color: 'accent',
        values: phases.map((h) => h.energy),
        colormap: 'sequential',
        opacity: 0.6,
        edges: true,
      },
      lines(
        [
          [[0, 0, 0], TRI_B],
          [TRI_B, TRI_C],
          [TRI_C, [0, 0, 0]],
        ],
        'muted',
        'triangle',
        { name: 'Composition triangle' },
      ),
      arrows([[0, 0, 0]], [[0, 0, -0.6 * HULL_Z]], 'muted', 'axes', {
        name: 'Energy axis',
        thickness: 0.015,
      }),
    ];
    const si = phases.map((_, i) => i).filter((i) => stable[i]);
    const ui = phases.map((_, i) => i).filter((i) => !stable[i]);
    layers.push(
      atoms(
        si.map((i) => pts[i]!),
        0.34,
        'c0',
        'phases',
        {
          name: 'Stable phases',
          labels: si.map((i) => `${phases[i]!.name} (on the hull)`),
          highlight: si.map((i, k) => (i === pick ? k : -1)).filter((k) => k >= 0),
        },
      ),
    );
    if (ui.length)
      layers.push(
        atoms(
          ui.map((i) => pts[i]!),
          0.24,
          'pos',
          'phases',
          {
            labels: ui.map(
              (i) => `${phases[i]!.name} (${fmt(st.phases[i]!.aboveHull * 1000, 0)} meV/atom above)`,
            ),
            highlight: ui.map((i, k) => (i === pick ? k : -1)).filter((k) => k >= 0),
          },
        ),
      );
    if (p.drops && ui.length)
      layers.push(
        lines(
          ui.map((i) => [pts[i]!, hullPoint(phases[i]!.counts, st.phases[i]!.hullEnergy)] as [Vec3, Vec3]),
          'pos',
          'drops',
          { name: 'Distance to the hull', dashed: true },
        ),
      );
    const d = st.phases[pick]!;
    const onHull = hullPoint(phases[pick]!.counts, d.hullEnergy);
    if (d.products.length > 1)
      layers.push(
        lines(
          d.products.map((q) => [onHull, pts[q.phase]!] as [Vec3, Vec3]),
          'accent',
          'decomposition',
          { name: 'Decomposition', tube: 0.05 },
        ),
      );
    layers.push(
      labels(
        [
          ...phases.map((h, i) => ({ text: h.name, at: [pts[i]![0], pts[i]![1], pts[i]![2] + 0.6] as Vec3 })),
          { text: '-0.6 eV/atom', at: [0, 0, -0.6 * HULL_Z - 0.5] as Vec3 },
        ],
        'labels',
      ),
    );
    const name = phases[pick]!.name;
    const decomp = d.products.map((q) => `${fmt(q.fraction, 2)} ${phases[q.phase]!.name}`).join(' + ');
    const nStable = si.length;
    const above = d.aboveHull * 1000;
    const verdict =
      above < 1e-6
        ? `${name} sits on the hull, so it is stable against every mixture of the other phases.`
        : `${name} sits ${fmt(above, 0)} meV/atom above the hull and would lower its energy by splitting into ${decomp} (atom fractions), the corners of the facet below it.`;
    const describe =
      `The lower convex hull of ${phases.length} sample phases of an invented A-B-C system, drawn as flat facets below the composition triangle ` +
      `(${plural(st.facets.length, 'facet')}, ${nStable} phases on the hull). ${name} has a formation energy of ${fmt(phases[pick]!.energy, 3)} eV/atom` +
      `${shift ? ` (shifted by ${fmt(shift * 1000, 0)} meV/atom)` : ''}. ${verdict}`;
    return {
      layers,
      describe,
      readouts: [
        { label: `Formation energy of ${name}`, value: `${fmt(phases[pick]!.energy, 3)} eV/atom` },
        { label: 'Energy above hull', value: `${fmt(above, 0)} meV/atom` },
        { label: 'Decomposes into', value: above < 1e-6 ? 'stable' : decomp },
        { label: 'Phases on the hull', value: `${nStable} of ${phases.length}` },
      ],
      axes: ['x: fraction of B', 'y: towards C', `z: formation energy (${HULL_Z} units per eV/atom)`],
      camera: 'iso',
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// NEB on the Muller-Brown surface
// ---------------------------------------------------------------------------------------------------------------------

export const NEB_STEPS_PER_ITER = 10;
export const NEB_ITERS = 40;
/** Scene coordinates: x, y times 4; energy divided by 20 and capped (the model surface rises steeply at its edges). */
const NX = 4;
const NE = 20;
const ECAP = 30;
const nebZ = (e: number): number => Math.min(e, ECAP) / NE;
const nebCache = new Map<string, NebFrame[]>();
const STATIONARY = {
  minima: MB_MINIMA.map((q) => refineStationary(q)),
  saddles: MB_SADDLES.map((q) => refineStationary(q)),
};

export function nebFrames(images: number, climb: boolean): NebFrame[] {
  return remember(nebCache, `${images}|${climb}`, () => {
    const band = linearBand(STATIONARY.minima[0]!, STATIONARY.minima[1]!, images);
    const all = runNeb(band, MULLER_BROWN, { images, climb }, NEB_ITERS * NEB_STEPS_PER_ITER);
    return all.filter((_, k) => k % NEB_STEPS_PER_ITER === 0);
  });
}

/** Exact barrier of the Muller-Brown path from minimum A: the higher saddle minus A. */
export function exactBarrier(): number {
  const eA = mullerBrown(...STATIONARY.minima[0]!);
  return Math.max(...STATIONARY.saddles.map((q) => mullerBrown(...q))) - eA;
}

const nebScene: SceneDef = {
  id: 'm12b-neb',
  title: 'Nudged elastic band on an energy landscape',
  badge: 'toy-model',
  sources: ['S-167', 'S-121', 'S-124'],
  banner:
    'The landscape is the analytic Muller-Brown surface, a standard test for path methods, not a material: positions ' +
    'and energies are in its own units. The band is relaxed by a tested NEB with the improved tangent.',
  params: [
    {
      kind: 'step',
      id: 'iter',
      label: `NEB iteration (${NEB_STEPS_PER_ITER} optimizer steps each)`,
      min: 0,
      max: NEB_ITERS,
      value: 0,
      interval: 0.35,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'images',
      label: 'Intermediate images',
      min: 3,
      max: 13,
      step: 1,
      value: 7,
      digits: 0,
      physics: true,
    },
    { kind: 'toggle', id: 'climb', label: 'Climbing image', value: true, physics: true },
    { kind: 'toggle', id: 'exact', label: 'Exact minima and saddles', value: true },
  ],
  build(p) {
    const images = Math.round(Number(p.images));
    const climb = Boolean(p.climb);
    const it = Math.max(0, Math.min(NEB_ITERS, Math.round(Number(p.iter))));
    const fr = nebFrames(images, climb)[it]!;
    const xr: [number, number] = [-1.5 * NX, 1.1 * NX];
    const yr: [number, number] = [-0.35 * NX, 1.95 * NX];
    const layers: Layer[] = [
      surfaceLayer((x, y) => nebZ(mullerBrown(x / NX, y / NX)), xr, yr, 78, 70, {
        group: 'surface',
        name: 'Energy landscape',
        opacity: 0.9,
      }),
      ...axesLayers([2.2, 2.2, 2.2], ['x', 'y', 'energy'], [xr[0], yr[0], nebZ(-150)], 'axes'),
    ];
    const lift = 0.12;
    const P = fr.points.map((q, i): Vec3 => [q[0] * NX, q[1] * NX, nebZ(fr.energies[i]!) + lift]);
    layers.push(curve(P, 'ink', 'band', { name: 'Elastic band', tube: 0.05 }));
    const colors: Color[] = P.map((_, i) =>
      i === 0 || i === P.length - 1 ? 'c1' : i === fr.climbing ? 'pos' : 'c0',
    );
    layers.push(
      atoms(
        P,
        P.map((_, i) => (i === fr.climbing ? 0.26 : 0.18)),
        colors,
        'band',
        {
          labels: P.map((_, i) =>
            i === 0
              ? 'start A'
              : i === P.length - 1
                ? 'end B'
                : i === fr.climbing
                  ? `image ${i} (climbing)`
                  : `image ${i}`,
          ),
          highlight: fr.climbing > 0 ? [fr.climbing] : [],
        },
      ),
    );
    // NEB forces on the images (in the xy plane, scaled)
    const r = nebForcesFor(fr, climb);
    const from: Vec3[] = [];
    const vec: Vec3[] = [];
    r.forEach((fv, i) => {
      const len = Math.hypot(fv[0], fv[1]);
      if (i === 0 || i === P.length - 1 || len < 1e-3) return;
      const s = Math.min(1.2, len * 0.006) / len;
      from.push(P[i]!);
      vec.push([fv[0] * s, fv[1] * s, 0]);
    });
    if (from.length)
      layers.push(arrows(from, vec, 'accent', 'forces', { name: 'NEB forces', thickness: 0.05 }));
    const items: { text: string; at: Vec3 }[] = [];
    if (p.exact) {
      const mk = (q: P2): Vec3 => [q[0] * NX, q[1] * NX, nebZ(mullerBrown(q[0], q[1])) + 0.05];
      const mins = STATIONARY.minima.map(mk);
      const sads = STATIONARY.saddles.map(mk);
      layers.push(
        atoms(mins, 0.12, 'c2', 'exact', { name: 'Exact minima and saddles', labels: ['A', 'B', 'C'] }),
      );
      layers.push(
        sphereLayer(sads[0]!, 0.22, { group: 'exact', color: 'c3', wireframe: true, segments: 10 }),
        sphereLayer(sads[1]!, 0.22, { group: 'exact', color: 'c3', wireframe: true, segments: 10 }),
      );
      items.push(
        { text: 'A', at: [mins[0]![0], mins[0]![1], mins[0]![2] + 0.6] },
        { text: 'B', at: [mins[1]![0], mins[1]![1], mins[1]![2] + 0.6] },
        { text: 'C (shallow minimum)', at: [mins[2]![0], mins[2]![1], mins[2]![2] + 0.6] },
        { text: 'saddle 1', at: [sads[0]![0], sads[0]![1], sads[0]![2] + 0.6] },
        { text: 'saddle 2', at: [sads[1]![0], sads[1]![1], sads[1]![2] + 0.6] },
      );
    }
    if (items.length) layers.push(labels(items, 'labels'));
    const eA = fr.energies[0]!;
    let top = 1;
    for (let i = 1; i < fr.energies.length - 1; i++) if (fr.energies[i]! > fr.energies[top]!) top = i;
    const barrier = fr.energies[top]! - eA;
    const exact = exactBarrier();
    const converged = fr.maxForce < 0.5;
    const describe =
      `The Muller-Brown model landscape as a surface, with an elastic band of ${images} intermediate images from minimum A to minimum B ` +
      `after ${it * NEB_STEPS_PER_ITER} optimizer steps${climb ? ', with the highest image climbing' : ''}. ` +
      `The highest image is ${fmt(barrier, 2)} units above A against an exact saddle barrier of ${fmt(exact, 2)}; the largest NEB force is ` +
      `${fmt(fr.maxForce, 2)}${converged ? ', so the band has settled on the minimum energy path.' : ', so the band is still moving.'}`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Optimizer steps', value: String(it * NEB_STEPS_PER_ITER) },
        { label: 'Barrier from the band', value: `${fmt(barrier, 2)} (model units)` },
        { label: 'Exact barrier', value: `${fmt(exact, 2)} (model units)` },
        { label: 'Largest NEB force', value: fmt(fr.maxForce, 2) },
      ],
      axes: ['x (model, x4)', 'y (model, x4)', `energy (model units / ${NE}, capped at ${ECAP})`],
      camera: 'iso',
    };
  },
};

function nebForcesFor(fr: NebFrame, climb: boolean): P2[] {
  return nebForces(fr.points, MULLER_BROWN, { spring: 100, climb }).forces;
}

// ---------------------------------------------------------------------------------------------------------------------
// Molecular dynamics of Lennard-Jones argon
// ---------------------------------------------------------------------------------------------------------------------

export const MD_CELLS = 3;
export const MD_FRAMES = 60;
export const MD_STEPS_PER_FRAME = 5;
const TRACKED = [0, 37, 74, 101];
const TRAIL = 20;
const mdCache = new Map<string, MDRun>();

export function mdRun(T: number, dt: number, thermostat: 'nve' | 'andersen'): MDRun {
  return remember(
    mdCache,
    `${T}|${dt}|${thermostat}`,
    () => {
      const a0 = fccLatticeConstant();
      const pos = fccPositions(MD_CELLS, a0);
      const sys: LJSystem = {
        box: MD_CELLS * a0,
        types: Array.from({ length: pos.length / 3 }, () => 0),
        species: [ARGON],
        rc: DEFAULT_CUTOFF_SIGMA * ARGON.sigma,
      };
      return new MDRun(sys, pos, { dt, temperature: T, thermostat, seed: 11 }, MD_STEPS_PER_FRAME);
    },
    12,
  );
}

const mdScene: SceneDef = {
  id: 'm12b-md',
  title: 'Molecular dynamics in a box',
  badge: 'toy-model',
  sources: ['S-125', 'S-126', 'S-036'],
  banner:
    'Lennard-Jones argon with classical pair forces, not DFT forces: it shows how velocity Verlet, the time step and ' +
    'a thermostat behave, not an ab initio run. 108 atoms in a periodic box at the zero-temperature density.',
  params: [
    {
      kind: 'step',
      id: 'frame',
      label: `MD frame (${MD_STEPS_PER_FRAME} time steps each)`,
      min: 0,
      max: MD_FRAMES,
      value: 0,
      interval: 0.15,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'temp',
      label: 'Temperature',
      min: 20,
      max: 300,
      step: 10,
      value: 60,
      unit: 'K',
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'dt',
      label: 'Time step (POTIM)',
      min: 1,
      max: 60,
      step: 1,
      value: 5,
      unit: 'fs',
      digits: 0,
      physics: true,
    },
    {
      kind: 'select',
      id: 'thermostat',
      label: 'Ensemble',
      physics: true,
      value: 'andersen',
      options: [
        { value: 'nve', label: 'NVE (no thermostat)' },
        { value: 'andersen', label: 'NVT, Andersen thermostat' },
      ],
    },
    { kind: 'toggle', id: 'trails', label: 'Trajectories of four atoms', value: true },
  ],
  build(p) {
    const T = Number(p.temp);
    const dt = Number(p.dt);
    const thermo = p.thermostat === 'nve' ? 'nve' : 'andersen';
    const k = Math.max(0, Math.min(MD_FRAMES, Math.round(Number(p.frame))));
    const run = mdRun(T, dt, thermo);
    const f = run.frame(k);
    const shown = run.frames.indexOf(f);
    const L = run.sys.box;
    const n = run.sys.types.length;
    const wrap = (x: number) => x - L * Math.floor(x / L);
    const pos: Vec3[] = [];
    for (let i = 0; i < n; i++)
      pos.push([wrap(f.pos[3 * i]!), wrap(f.pos[3 * i + 1]!), wrap(f.pos[3 * i + 2]!)]);
    const tracked = new Set(TRACKED);
    const layers: Layer[] = [
      atoms(
        pos,
        1.0,
        pos.map((_, i) => (tracked.has(i) ? 'pos' : 'c0')),
        'atoms',
        {
          name: 'Ar atoms',
          labels: pos.map((_, i) => `Ar ${i + 1}`),
          highlight: TRACKED,
        },
      ),
      cellLayer(
        [
          [L, 0, 0],
          [0, L, 0],
          [0, 0, L],
        ],
        'cell',
      ),
    ];
    if (p.trails && shown > 0) {
      for (const i of TRACKED) {
        const start = Math.max(0, shown - TRAIL);
        // unwrapped trail, translated so it ends at the wrapped atom
        const end = run.frames[shown]!.pos;
        const off: Vec3 = [
          pos[i]![0] - end[3 * i]!,
          pos[i]![1] - end[3 * i + 1]!,
          pos[i]![2] - end[3 * i + 2]!,
        ];
        const pts: Vec3[] = [];
        for (let s = start; s <= shown; s++) {
          const q = run.frames[s]!.pos;
          pts.push([q[3 * i]! + off[0], q[3 * i + 1]! + off[1], q[3 * i + 2]! + off[2]]);
        }
        if (pts.length >= 2) layers.push(curve(pts, 'pos', 'trails', { name: 'Trajectories', tube: 0.06 }));
      }
    }
    const f0 = run.frames[0]!;
    const e0 = (f0.potential + f0.kinetic) / n;
    const et = (f.potential + f.kinetic) / n;
    const drift = (et - e0) * 1000;
    let msd = 0;
    for (let q = 0; q < 3 * n; q++) msd += (f.pos[q]! - f0.pos[q]!) ** 2;
    msd /= n;
    const blew = run.blewUpAt !== null && k >= shown && shown < k;
    const ens = thermo === 'nve' ? 'NVE, no thermostat' : `NVT with an Andersen thermostat at ${fmt(T, 0)} K`;
    const describe =
      `${n} Lennard-Jones argon atoms in a periodic box ${fmt(L, 2)} angstrom wide (${ens}), started from the fcc lattice with velocities at ` +
      `${fmt(T, 0)} K, shown after ${fmt(f.time / 1000, 2)} ps in steps of ${fmt(dt, 0)} fs: the instantaneous temperature is ${fmt(f.temperature, 0)} K ` +
      `and the total energy has changed by ${fmt(drift, 2)} meV per atom since the start` +
      (thermo === 'nve'
        ? ' (with no thermostat it should stay constant: a drift means the time step is too long)'
        : ' (the thermostat adds and removes heat, so it need not stay constant)') +
      (blew
        ? `. The run blew up at step ${run.blewUpAt}: the time step is too long for these vibrations.`
        : `; the mean squared displacement is ${fmt(msd, 2)} square angstrom.`);
    return {
      layers,
      describe,
      readouts: [
        { label: 'Time', value: `${fmt(f.time / 1000, 2)} ps${blew ? ' (blew up)' : ''}` },
        { label: 'Temperature', value: `${fmt(f.temperature, 0)} K` },
        { label: 'Energy change', value: `${fmt(drift, 2)} meV/atom` },
        { label: 'Mean squared displacement', value: `${fmt(msd, 2)} Å²` },
      ],
      lattice: [
        [L, 0, 0],
        [0, L, 0],
        [0, 0, L],
      ],
      ortho: true,
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [slabScene.id]: slabScene,
  [defectScene.id]: defectScene,
  [hullScene.id]: hullScene,
  [nebScene.id]: nebScene,
  [mdScene.id]: mdScene,
};
