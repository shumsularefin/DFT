// Module 5, spin and magnetism (M16.8): spins as free 3D arrows on real orderings, the Stoner energy as a surface, d-shell
// spin densities, per-site moments read from an OUTCAR table, and non-collinear textures. Up spins have solid heads, down
// spins open heads (never colour alone).
// @source S-058 (A-, C-, G-type names), S-034 (golden orderings, OUTCAR table layout), S-059 (Heisenberg, Stoner, Hund),
// S-060 (energy mapping), S-065 (MAGMOM, ISPIN, LORBIT, SAXIS), S-047 (hydrogen 3d shapes), S-041 (OUTCAR grep list)
import type { IntMat3 } from '../../crystal/reduction';
import type { Structure } from '../../crystal/types';
import { patternKept, rankEnergies, totalMomentCheck } from '../../magnetism/analysis';
import { DEFAULT_CONVENTION, shellCoefficients } from '../../magnetism/heisenberg';
import { magmomFor } from '../../magnetism/magmom';
import {
  NAMED_LABEL,
  bondStatistics,
  commonSupercell,
  namedOrdering,
  netMoment,
  type MagneticConfiguration,
  type NamedKind,
} from '../../magnetism/orderings';
import { radial, radialQuantile, realYlm } from '../../physics/hydrogen';
import {
  chainEnergy,
  helixOptimum,
  netPerSite,
  saxisToCartesian,
  textureSpin,
  type TextureKind,
  type TextureParams,
} from '../../physics/spintexture';
import { solveStoner, stonerEnergy, type StonerParams } from '../../physics/stoner';
import { stonerDescent } from '../../physics/stonerPath';
import { lookupStructure } from '../../scene/library';
import { parseOutcar, type MagnetizationTable } from '../../vasp/outcar';
import { UNKNOWN_ELEMENT_COLOR, VESTA_SIZES } from '../../three/vestaStyle';
import {
  arrows,
  atoms,
  axesLayers,
  crystalLayers,
  curve,
  fmt,
  gridIsosurfaceLayer,
  labels,
  lines,
  points,
  quadLayer,
  surfaceLayer,
} from '../kit';
import type { ArrowsLayer, Color, Layer, MeshLayer, SceneDef, Vec3 } from '../types';

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const MU = 'μB';
const signWord = (x: number) => (x > 0 ? '+' : '');

/** Collinear spin arrows along z, centred on each site: up solid, down open. */
function spinArrows(
  at: readonly Vec3[],
  moments: readonly number[],
  perMu: number,
  group = 'spins',
): ArrowsLayer {
  const keep = moments.map((m, i) => [m, i] as const).filter(([m]) => Math.abs(m) > 1e-3);
  return arrows(
    keep.map(([m, i]) => [at[i]![0], at[i]![1], at[i]![2] - (m * perMu) / 2] as Vec3),
    keep.map(([m]) => [0, 0, m * perMu] as Vec3),
    keep.map(([m]) => (m > 0 ? 'pos' : 'neg') as Color),
    group,
    {
      name: 'Spins (up solid, down open)',
      head: keep.map(([m]) => (m > 0 ? 'solid' : 'open')),
      thickness: 0.07,
    },
  );
}

// ---------- the perovskite every ordering lives on ----------

/** Ideal cubic ABO3 cell of the scene library (a = 3.905 Angstrom), with La on A and the magnetic Mn on B. */
const PEROVSKITE: Structure = (() => {
  const s = lookupStructure('perovskite')!;
  const swap: Record<string, string> = { Sr: 'La', Ti: 'Mn' };
  return { ...s, species: s.species.map((e) => swap[e] ?? e) };
})();
const MAG = { elements: ['Mn'] as const };
const A0 = PEROVSKITE.lattice[0][0];
const AXES = ['a', 'b', 'c'] as const;
const DIAG = (n1: number, n2: number, n3: number): IntMat3 => [
  [n1, 0, 0],
  [0, n2, 0],
  [0, 0, n3],
];

const configCache = new Map<string, MagneticConfiguration>();
function ordering(kind: NamedKind, cell: string, axis: 0 | 1 | 2): MagneticConfiguration {
  const key = `${kind}|${cell}|${axis}`;
  let c = configCache.get(key);
  if (!c) {
    const req = kind === 'A' || kind === 'C' ? { kind, axis } : { kind };
    const opts = { elements: [...MAG.elements] };
    if (cell === 'common') {
      const reqs = (['FM', 'A', 'C', 'G'] as const).map((k) =>
        k === 'A' || k === 'C' ? { kind: k, axis } : { kind: k },
      );
      const { matrix } = commonSupercell(PEROVSKITE, reqs, opts);
      c = namedOrdering(PEROVSKITE, req, { ...opts, cell: matrix });
    } else if (cell === 'minimal') c = namedOrdering(PEROVSKITE, req, opts);
    else {
      const [n1, n2, n3] = cell.split('x').map(Number) as [number, number, number];
      c = namedOrdering(PEROVSKITE, req, { ...opts, cell: DIAG(n1, n2, n3) });
    }
    configCache.set(key, c);
  }
  return c;
}

const cellDet = (c: MagneticConfiguration): number => {
  const m = c.matrix;
  return Math.round(
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]),
  );
};

const PATTERN: Record<NamedKind, (axis: string) => string> = {
  FM: () => 'Every Mn moment points the same way.',
  A: (ax) =>
    `Mn planes perpendicular to ${ax} are ferromagnetic, and neighbouring planes point opposite ways.`,
  C: (ax) => `Mn chains along ${ax} are ferromagnetic, and neighbouring chains point opposite ways.`,
  G: () => 'Every nearest Mn neighbour points the opposite way.',
  RS2: () => 'Ferromagnetic (111) planes alternate.',
};

/** Translucent planes (A) or lines (C) through the ferromagnetic groups of sites, by the sign of the group. */
function patternLayers(kind: NamedKind, axisIdx: number, at: Vec3[], signs: number[]): Layer[] {
  if (kind !== 'A' && kind !== 'C') return [];
  const k = axisIdx;
  const [i, j] = [0, 1, 2].filter((x) => x !== k) as [number, number];
  const pad = 0.6;
  const key = (x: number) => Math.round(x * 100) / 100;
  const groups = new Map<string, { pts: Vec3[]; sign: number }>();
  at.forEach((p, n) => {
    const id = kind === 'A' ? `${key(p[k]!)}` : `${key(p[i]!)},${key(p[j]!)}`;
    const g = groups.get(id) ?? { pts: [], sign: signs[n]! };
    g.pts.push(p);
    groups.set(id, g);
  });
  const out: Layer[] = [];
  const lo = (pts: Vec3[], d: number) => Math.min(...pts.map((p) => p[d]!)) - pad;
  const hi = (pts: Vec3[], d: number) => Math.max(...pts.map((p) => p[d]!)) + pad;
  if (kind === 'A') {
    for (const g of groups.values()) {
      const o: Vec3 = [0, 0, 0];
      o[i] = lo(g.pts, i);
      o[j] = lo(g.pts, j);
      o[k] = g.pts[0]![k]!;
      const u: Vec3 = [0, 0, 0];
      const v: Vec3 = [0, 0, 0];
      u[i] = hi(g.pts, i) - o[i];
      v[j] = hi(g.pts, j) - o[j];
      out.push(
        quadLayer(o, u, v, {
          group: 'planes',
          name: 'Ferromagnetic planes',
          color: g.sign > 0 ? 'pos' : 'neg',
          opacity: 0.22,
        }),
      );
    }
  } else {
    const up: [Vec3, Vec3][] = [];
    const down: [Vec3, Vec3][] = [];
    for (const g of groups.values()) {
      const a: Vec3 = [...g.pts[0]!];
      const b: Vec3 = [...g.pts[0]!];
      a[k] = lo(g.pts, k);
      b[k] = hi(g.pts, k);
      (g.sign > 0 ? up : down).push([a, b]);
    }
    if (up.length) out.push(lines(up, 'pos', 'planes', { name: 'Ferromagnetic chains', tube: 0.05 }));
    if (down.length) out.push(lines(down, 'neg', 'planes', { dashed: true, tube: 0.05 }));
  }
  return out;
}

/** Atoms (all, or only the magnetic ones), cell and spin arrows of one configuration, shifted by `offset`. */
function configLayers(
  c: MagneticConfiguration,
  moment: number,
  ligands: boolean,
  offset: Vec3 = [0, 0, 0],
): { layers: Layer[]; mn: Vec3[]; signs: number[] } {
  const shift = (p: Vec3): Vec3 => [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]];
  const s = ligands
    ? c.structure
    : {
        lattice: c.structure.lattice,
        species: c.magneticSites.map((j) => c.structure.species[j]!),
        frac: c.magneticSites.map((j) => c.structure.frac[j]!),
      };
  const { layers, positions } = crystalLayers(s, {
    bonds: ligands,
    // magnetic sites alone are drawn smaller, so the spin arrows through them stay readable
    radiusScale: ligands ? VESTA_SIZES.atomScale : 0.3,
  });
  const mnPos = ligands ? c.magneticSites.map((j) => positions[j]!) : positions;
  const mn = mnPos.map(shift);
  const signs = c.magneticSites.map((j) => c.signs[j]!);
  const moved = layers.map((l): Layer => {
    if (l.kind === 'atoms') return { ...l, positions: l.positions.map(shift) };
    if (l.kind === 'lines') return { ...l, segments: l.segments.map(([a, b]) => [shift(a), shift(b)]) };
    return l;
  });
  moved.push(
    spinArrows(
      mn,
      signs.map((x) => x * moment),
      0.42,
    ),
  );
  return { layers: moved, mn, signs };
}

const KIND_OPTIONS = (['FM', 'A', 'C', 'G'] as const).map((k) => ({ value: k, label: NAMED_LABEL[k] }));

const orderings: SceneDef = {
  id: 'm05s-orderings',
  title: 'Magnetic orderings on a perovskite supercell',
  badge: 'computed',
  sources: ['S-058', 'S-034', 'S-065'],
  params: [
    { kind: 'select', id: 'order', label: 'Ordering', physics: true, value: 'G', options: KIND_OPTIONS },
    {
      kind: 'select',
      id: 'cell',
      label: 'Supercell',
      physics: true,
      value: '2x2x2',
      options: [
        { value: 'minimal', label: 'Smallest cell for this ordering' },
        { value: 'common', label: 'Smallest cell that holds all four' },
        { value: '2x2x2', label: '2 x 2 x 2' },
        { value: '4x4x2', label: '4 x 4 x 2' },
      ],
    },
    {
      kind: 'select',
      id: 'axis',
      label: 'Stacking or chain axis (A, C)',
      physics: true,
      value: 'c',
      options: AXES.map((a) => ({ value: a, label: a })),
    },
    {
      kind: 'slider',
      id: 'moment',
      label: 'Moment per Mn',
      min: 0.5,
      max: 5,
      step: 0.5,
      value: 4,
      unit: MU,
      digits: 1,
      physics: true,
    },
    { kind: 'toggle', id: 'ligands', label: 'La and O atoms', value: true },
    { kind: 'toggle', id: 'planes', label: 'Ferromagnetic planes or chains', value: true },
  ],
  build(p) {
    const kind = String(p.order) as NamedKind;
    const axis = Math.max(0, AXES.indexOf(String(p.axis) as 'a')) as 0 | 1 | 2;
    const cell = String(p.cell);
    const moment = Number(p.moment);
    const c = ordering(kind, cell, axis);
    const { layers, mn, signs } = configLayers(c, moment, Boolean(p.ligands));
    const axisIdx = c.axis?.index ?? axis;
    const axisCart = c.axis ? c.axis.vector.map(Math.abs) : [0, 0, 1];
    const cartIdx = axisCart.indexOf(Math.max(...axisCart));
    if (p.planes) layers.push(...patternLayers(kind, cartIdx, mn, signs));
    const up = signs.filter((x) => x > 0).length;
    const down = signs.length - up;
    const net = netMoment(c, { Mn: moment });
    const det = cellDet(c);
    const nb = bondStatistics(c).sites[0]!.shells[0]!;
    const magmom = magmomFor(c, { magnitudes: { Mn: moment } }).magmom;
    const axisName = AXES[axisIdx]!;
    const cellText =
      cell === '2x2x2' || cell === '4x4x2'
        ? `a ${cell.split('x').join(' x ')} supercell`
        : cell === 'common'
          ? `the smallest cell that holds FM, A, C and G at once (${det} formula units)`
          : `its smallest cell (${det} formula unit${det === 1 ? '' : 's'})`;
    const describe =
      `${NAMED_LABEL[kind]} order of the Mn moments in ${cellText} of an ideal cubic LaMnO3-type perovskite, ` +
      `a = ${fmt(A0, 3)} Angstrom: ${c.structure.species.length} atoms, ${signs.length} Mn. ` +
      `${PATTERN[kind](axisName)} ${up} moments point up (orange, solid heads) and ${down} down (blue, open heads); ` +
      `each Mn has ${nb.parallel} parallel and ${nb.antiparallel} antiparallel nearest Mn neighbours, and the net moment is ` +
      `${fmt(net, 1)} ${MU} per cell.`;
    return {
      layers,
      describe,
      lattice: c.structure.lattice.map(v3) as [Vec3, Vec3, Vec3],
      ortho: true,
      camera: 'iso',
      readouts: [
        { label: 'Net moment', value: `${fmt(net, 1)} ${MU} per cell` },
        { label: 'Mn up / down', value: `${up} / ${down}` },
        { label: 'Cell', value: `${det} formula units, ${c.structure.species.length} atoms` },
        { label: 'MAGMOM', value: magmom },
      ],
    };
  },
};

// ---------- ground state: Heisenberg energies of the four orderings on one cell ----------

const LADDER = ['FM', 'A', 'C', 'G'] as const;
const ladderCoeffs = (() => {
  let memo: { kind: NamedKind; c: MagneticConfiguration; coeff: number[]; shells: number[] }[] | undefined;
  return () =>
    (memo ??= LADDER.map((kind) => {
      const c = ordering(kind, '2x2x2', 2);
      const s = shellCoefficients(c, 2, DEFAULT_CONVENTION);
      return { kind, c, coeff: s.perIon, shells: s.shells };
    }));
})();

/** Heisenberg energy per Mn, meV, of each ordering for J1, J2 in meV (default convention, unit spins). */
export function ladderEnergies(j1: number, j2: number): { kind: NamedKind; meV: number }[] {
  return ladderCoeffs().map((x) => ({ kind: x.kind, meV: x.coeff[0]! * j1 + x.coeff[1]! * j2 }));
}

const groundState: SceneDef = {
  id: 'm05s-ground-state',
  title: 'Energy ladder of magnetic orderings',
  badge: 'toy-model',
  sources: ['S-059', 'S-060', 'S-058', 'S-034'],
  banner:
    'J1 and J2 are values you set, not computed exchange constants; the energies follow from them through the Heisenberg model on the four real orderings.',
  params: [
    {
      kind: 'slider',
      id: 'j1',
      label: 'J1, nearest Mn neighbours',
      min: -10,
      max: 10,
      step: 0.5,
      value: -4,
      unit: 'meV',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'j2',
      label: 'J2, second neighbours',
      min: -5,
      max: 5,
      step: 0.25,
      value: 0,
      unit: 'meV',
      digits: 2,
      physics: true,
    },
    { kind: 'toggle', id: 'ligands', label: 'La and O atoms', value: false },
  ],
  build(p) {
    const j1 = Number(p.j1);
    const j2 = Number(p.j2);
    const rows = ladderCoeffs();
    const e = ladderEnergies(j1, j2);
    const ranking = rankEnergies(
      e.map((x, i) => ({
        label: x.kind,
        energy: (x.meV / 1000) * rows[i]!.c.magneticSites.length,
        nMagnetic: rows[i]!.c.magneticSites.length,
        source: 'Heisenberg model',
      })),
    );
    const lowest = ranking.rows[0]!;
    const gap = ranking.rows[1] ? (ranking.rows[1].perIon - lowest.perIon) * 1000 : 0;
    const zPer = 0.12; // Angstrom of height per meV
    const side = 2 * A0;
    const spacing = side + 5;
    const layers: Layer[] = [];
    const items: { text: string; at: Vec3 }[] = [];
    const guides: [Vec3, Vec3][] = [];
    e.forEach((x, i) => {
      const z = x.meV * zPer;
      const off: Vec3 = [i * spacing, 0, z];
      layers.push(...configLayers(rows[i]!.c, 4, Boolean(p.ligands), off).layers);
      const isLow = x.kind === lowest.label;
      layers.push(
        quadLayer([off[0] - 0.8, -0.8, z - 0.9], [side + 1.6, 0, 0], [0, side + 1.6, 0], {
          group: 'ladder',
          name: 'Energy ladder',
          color: isLow ? 'accent' : 'muted',
          opacity: isLow ? 0.55 : 0.25,
        }),
      );
      guides.push([
        [off[0] + side / 2, side / 2, -0.9],
        [off[0] + side / 2, side / 2, z - 0.9],
      ]);
      items.push({
        text: `${x.kind}: ${signWord(x.meV)}${fmt(x.meV, 1)} meV${isLow ? ' (lowest)' : ''}`,
        at: [off[0] + side / 2, side / 2, z + side + 1.2],
      });
    });
    const width = 3 * spacing + side;
    layers.push(
      lines(
        [
          [
            [-1, -1, -0.9],
            [width + 1, -1, -0.9],
          ],
          [
            [-1, side + 1, -0.9],
            [width + 1, side + 1, -0.9],
          ],
          ...guides,
        ],
        'muted',
        'ladder',
        { dashed: true },
      ),
    );
    items.push({ text: 'E0: uncorrelated spins', at: [width + 2, side / 2, -0.9] });
    layers.push(labels(items, 'labels'));
    const list = e.map((x) => `${x.kind} ${signWord(x.meV)}${fmt(x.meV, 1)}`).join(', ');
    const describe =
      `The four orderings FM, A, C and G drawn on one common 2 x 2 x 2 cell (8 Mn), each lifted by its Heisenberg ` +
      `energy per Mn for J1 = ${fmt(j1, 1)} meV and J2 = ${fmt(j2, 2)} meV (H = -sum J Si.Sj, unit spins, so J > 0 is ` +
      `ferromagnetic): ${list} meV relative to uncorrelated spins. ` +
      `${NAMED_LABEL[lowest.label as NamedKind]} is lowest` +
      (ranking.rows[1] ? `, ${fmt(gap, 1)} meV per Mn below ${ranking.rows[1].label}.` : '.') +
      (gap < 1 ? ' The two lowest are within 1 meV per Mn: settings this close can swap the order.' : '');
    return {
      layers,
      describe,
      camera: 'front',
      ortho: true,
      readouts: [
        { label: 'Lowest', value: NAMED_LABEL[lowest.label as NamedKind] },
        { label: 'Gap to next', value: `${fmt(gap, 1)} meV per Mn` },
        { label: 'E per Mn (FM, A, C, G)', value: e.map((x) => fmt(x.meV, 1)).join(' / ') + ' meV' },
        {
          label: 'Shells',
          value: `${rows[0]!.shells.map((d) => fmt(d, 2)).join(' and ')} Angstrom (6 and 12 Mn)`,
        },
      ],
    };
  },
};

// ---------- Stoner: energy over moment and interaction ----------

const SX = 2; // scene units per mu_B
const SY = 4; // scene units per eV of I
const SZ = 6; // scene units per eV of energy
const E_CLIP = 0.6;
const M_MAX = 2.4;
const I_MAX = 2;

const stoner: SceneDef = {
  id: 'm05s-stoner',
  title: 'Stoner energy over moment and exchange',
  badge: 'toy-model',
  sources: ['S-059', 'S-065'],
  banner:
    'Constant-DOS Stoner toy model: one flat band per spin, a mean-field exchange I and a small quartic term for saturation. The downhill path is a plain minimiser, not VASP density mixing.',
  params: [
    {
      kind: 'slider',
      id: 'stonerI',
      label: 'Stoner exchange I',
      min: 0,
      max: I_MAX,
      step: 0.05,
      value: 1.5,
      unit: 'eV',
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'dos',
      label: 'DOS at the Fermi level N, per spin',
      min: 0.6,
      max: 1.5,
      step: 0.05,
      value: 1,
      unit: 'states/eV',
      digits: 2,
      physics: true,
    },
    { kind: 'toggle', id: 'ispin', label: 'ISPIN = 2 (spin polarized)', value: true, physics: true },
    {
      kind: 'slider',
      id: 'magmom',
      label: 'Starting moment (MAGMOM)',
      min: 0,
      max: M_MAX,
      step: 0.1,
      value: 0.4,
      unit: MU,
      digits: 1,
      physics: true,
    },
    { kind: 'step', id: 'step', label: 'Minimiser step', min: 0, max: 20, value: 20, physics: true },
  ],
  build(p) {
    const n = Number(p.dos);
    const iNow = Number(p.stonerI);
    const ispin = Boolean(p.ispin);
    const start = ispin ? Number(p.magmom) : 0;
    const steps = Math.round(Number(p.step));
    const sp = (i: number): StonerParams => ({ dosPerSpin: n, stonerI: i });
    const clip = (e: number) => Math.min(E_CLIP, e);
    const at = (m: number, i: number): Vec3 => [m * SX, i * SY, clip(stonerEnergy(sp(i), m)) * SZ];
    const layers: Layer[] = [
      surfaceLayer(
        (x, y) => clip(stonerEnergy(sp(y / SY), x / SX)),
        [-M_MAX * SX, M_MAX * SX],
        [0, I_MAX * SY],
        60,
        40,
        { group: 'surface', name: 'Energy surface', zScale: SZ, opacity: 0.85 },
      ),
    ];
    // the valley: m* for every I (both signs), and m = 0 where it is the minimum
    const iC = 1 / n;
    const valleyPlus: Vec3[] = [];
    const valleyMinus: Vec3[] = [];
    for (let k = 0; k <= 120; k++) {
      const i = iC + ((I_MAX - iC) * k) / 120;
      if (i > I_MAX) break;
      const m = solveStoner(sp(i)).equilibriumMoment;
      valleyPlus.push(at(m, i));
      valleyMinus.push(at(-m, i));
    }
    const flat: Vec3[] = [at(0, 0), at(0, Math.min(iC, I_MAX))];
    layers.push(curve(flat, 'ink', 'valley', { name: 'Lowest energy', tube: 0.06 }));
    if (valleyPlus.length > 1) {
      layers.push(curve(valleyPlus, 'ink', 'valley', { tube: 0.06 }));
      layers.push(curve(valleyMinus, 'ink', 'valley', { tube: 0.06 }));
    }
    // the slice at the current I
    const slice: Vec3[] = [];
    for (let k = 0; k <= 160; k++) {
      const m = -M_MAX + (2 * M_MAX * k) / 160;
      slice.push([m * SX, iNow * SY, clip(stonerEnergy(sp(iNow), m)) * SZ + 0.05]);
    }
    layers.push(curve(slice, 'accent', 'slice', { name: 'Slice at this I', tube: 0.04 }));
    // the minimiser's path from MAGMOM
    const path = stonerDescent(sp(iNow), start, steps);
    const pts = path.moments.map((m) => at(m, iNow));
    const mNow = path.moments.at(-1)!;
    const eNow = path.energies.at(-1)!;
    layers.push(points(pts, 'pos', 0.09, 'path', { name: 'Minimiser path' }));
    layers.push(
      atoms([[mNow * SX, iNow * SY, clip(eNow) * SZ + 0.25]], 0.25, 'pos', 'path', {
        labels: [`moment ${fmt(mNow, 2)} ${MU}`],
        highlight: [0],
      }),
    );
    const eq = solveStoner(sp(iNow));
    const items = [
      { text: 'I N = 1', at: [0, iC * SY, 0.4] as Vec3 },
      {
        text: `start ${fmt(start, 1)} ${MU}`,
        at: v3(pts[0]!).map((x, k) => (k === 2 ? x + 0.8 : x)) as Vec3,
      },
    ];
    if (iC > I_MAX) items.shift();
    layers.push(labels(items, 'labels'));
    layers.push(
      ...axesLayers(
        [M_MAX * SX + 0.6, I_MAX * SY + 0.6, E_CLIP * SZ + 0.6],
        [`m (${MU})`, 'I (eV)', 'E(m) - E(0) (eV)'],
        [-M_MAX * SX - 0.6, 0, 0],
      ),
    );
    const stuck = ispin && start === 0 && eq.isMagnetic;
    const verdict = !ispin
      ? 'ISPIN = 1 forces m = 0, so the moment cannot leave the middle line.'
      : stuck
        ? 'The start is m = 0, a stationary point: the minimiser never leaves it even though m = 0 is a maximum here.'
        : Math.abs(mNow - Math.sign(start || 1) * eq.equilibriumMoment) < 0.01
          ? `It has reached the minimum at ${fmt(mNow, 2)} ${MU}.`
          : `It is still on its way to the minimum at ${fmt(Math.sign(start || 1) * eq.equilibriumMoment, 2)} ${MU}.`;
    const describe =
      `Surface of the Stoner energy E(m) - E(0) over the moment m (${-M_MAX} to ${M_MAX} ${MU}) and the exchange I ` +
      `(0 to ${I_MAX} eV) for N = ${fmt(n, 2)} states/eV per spin, cut off above ${E_CLIP} eV; the thick line is the lowest ` +
      `energy: m = 0 up to I N = 1 (I = ${fmt(iC, 2)} eV), then two valleys at plus and minus m*. At I = ${fmt(iNow, 2)} eV ` +
      `(I N = ${fmt(eq.productIN, 2)}) the minimum is at m* = ${fmt(eq.equilibriumMoment, 2)} ${MU}; the path from a start of ` +
      `${fmt(start, 1)} ${MU} after ${steps} steps is at ${fmt(mNow, 2)} ${MU}. ${verdict}`;
    return {
      layers,
      describe,
      camera: 'iso',
      axes: [`m (${MU})`, 'I (eV)', 'E(m) - E(0) (eV)'],
      readouts: [
        { label: 'I N', value: fmt(eq.productIN, 2) },
        { label: 'Equilibrium moment m*', value: `${fmt(ispin ? eq.equilibriumMoment : 0, 2)} ${MU}` },
        { label: 'Moment reached', value: `${fmt(mNow, 2)} ${MU}` },
        { label: 'Exchange splitting I m', value: `${fmt(iNow * Math.abs(mNow), 2)} eV` },
      ],
    };
  },
};

// ---------- spin densities of a d shell ----------

const D_ORDER = [-2, -1, 1, 0, 2] as const; // xy, yz, xz (t2g), then z2, x2-y2 (eg)
const D_NAME: Record<number, string> = { [-2]: 'xy', [-1]: 'yz', 1: 'xz', 0: 'z2', 2: 'x2-y2' };
const GRID = 30;
const R_D = radialQuantile(3, 2, 0.97);
const isoCache = new Map<string, MeshLayer>();
let dGrids: { orbitals: Float64Array[]; peak: number } | undefined;
/**
 * |psi_3d,m|^2 on a GRID^3 box of half-width R_D (a0), x fastest, one array per entry of D_ORDER, and the peak of the
 * full shell (one electron in each of the five, a sphere). The radial part is evaluated once per grid point.
 */
function dDensities(): { orbitals: Float64Array[]; peak: number } {
  if (dGrids) return dGrids;
  const h = (2 * R_D) / (GRID - 1);
  const orbitals = D_ORDER.map(() => new Float64Array(GRID ** 3));
  let peak = 0;
  for (let k = 0; k < GRID; k++)
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++) {
        const x = -R_D + i * h;
        const y = -R_D + j * h;
        const z = -R_D + k * h;
        const r = Math.hypot(x, y, z);
        if (r < 1e-9) continue;
        const rad = radial(3, 2, r);
        const idx = i + GRID * (j + GRID * k);
        let sum = 0;
        D_ORDER.forEach((m, o) => {
          const psi = rad * realYlm(2, m, x / r, y / r, z / r);
          orbitals[o]![idx] = psi * psi;
          sum += psi * psi;
        });
        peak = Math.max(peak, sum);
      }
  dGrids = { orbitals, peak };
  return dGrids;
}

/** Occupation per orbital (order D_ORDER) and spin for n d electrons: Hund high spin, or paired when not polarized. */
export function dOccupations(n: number, polarized: boolean): { up: number[]; down: number[] } {
  if (polarized) {
    const up = D_ORDER.map((_, k) => (k < Math.min(n, 5) ? 1 : 0));
    const down = D_ORDER.map((_, k) => (k < Math.max(0, n - 5) ? 1 : 0));
    return { up, down };
  }
  const pair = D_ORDER.map((_, k) => Math.min(2, Math.max(0, n - 2 * k)) / 2);
  return { up: pair, down: [...pair] };
}

const spinDensity: SceneDef = {
  id: 'm05s-spin-density',
  title: 'Up and down spin densities of a d shell',
  badge: 'toy-model',
  sources: ['S-059', 'S-047'],
  banner:
    'Hydrogen 3d shapes stand in for the d shell of a transition-metal ion, filled by Hund rule (high spin, t2g before eg as in an octahedral site). Level spacings are not to scale.',
  params: [
    {
      kind: 'slider',
      id: 'electrons',
      label: 'd electrons',
      min: 0,
      max: 10,
      step: 1,
      value: 3,
      digits: 0,
      physics: true,
    },
    { kind: 'toggle', id: 'ispin', label: 'ISPIN = 2 (spin polarized)', value: true, physics: true },
    {
      kind: 'select',
      id: 'show',
      label: 'Show',
      value: 'both',
      physics: true,
      options: [
        { value: 'both', label: 'Up (solid) and down (wire) densities' },
        { value: 'up', label: 'Up density' },
        { value: 'down', label: 'Down density' },
        { value: 'magnetization', label: 'Magnetization, up minus down' },
      ],
    },
    {
      kind: 'slider',
      id: 'level',
      label: 'Surface level',
      min: 0.05,
      max: 0.6,
      step: 0.05,
      value: 0.25,
      digits: 2,
      physics: true,
    },
  ],
  build(p) {
    const n = Math.round(Number(p.electrons));
    const pol = Boolean(p.ispin);
    const show = String(p.show);
    const occ = dOccupations(n, pol);
    const { orbitals: g, peak } = dDensities();
    const size = GRID ** 3;
    const nUp = new Float64Array(size);
    const nDn = new Float64Array(size);
    occ.up.forEach((f, k) => {
      if (f) for (let i = 0; i < size; i++) nUp[i]! += f * g[k]![i]!;
    });
    occ.down.forEach((f, k) => {
      if (f) for (let i = 0; i < size; i++) nDn[i]! += f * g[k]![i]!;
    });
    // level relative to the peak of one full spin channel (five electrons, a sphere)
    const level = Number(p.level) * peak;
    const h = (2 * R_D) / (GRID - 1);
    const toScene = (q: Vec3): Vec3 => [-R_D + q[0] * h, -R_D + q[1] * h, -R_D + q[2] * h];
    const iso = (vals: ArrayLike<number>, color: Color, name: string, key: string, wire = false) => {
      const id = `${key}|${level}|${color}|${wire}`;
      const hit = isoCache.get(id);
      if (hit) return hit;
      const l = gridIsosurfaceLayer(vals, [GRID, GRID, GRID], toScene, level, {
        group: 'density',
        name,
        color,
        opacity: wire ? 0.5 : 0.7,
      });
      if (wire) l.wireframe = true;
      if (isoCache.size > 64) isoCache.clear();
      isoCache.set(id, l);
      return l;
    };
    const kUp = occ.up.join(',');
    const kDn = occ.down.join(',');
    const layers: Layer[] = [];
    const sumUp = occ.up.reduce((a, b) => a + b, 0);
    const sumDn = occ.down.reduce((a, b) => a + b, 0);
    if ((show === 'both' || show === 'up') && sumUp > 0)
      layers.push(iso(nUp, 'pos', 'Up density', `u${kUp}`));
    if ((show === 'both' || show === 'down') && sumDn > 0)
      layers.push(iso(nDn, 'neg', 'Down density', `d${kDn}`, show === 'both'));
    if (show === 'magnetization') {
      const mPlus = nUp.map((u, i) => u - nDn[i]!);
      const mMinus = mPlus.map((x) => -x);
      layers.push(iso(mPlus, 'pos', 'Magnetization, up excess', `m${kUp}/${kDn}`));
      layers.push(iso(mMinus, 'neg', 'Magnetization, down excess', `n${kUp}/${kDn}`));
    }
    const moment = sumUp - sumDn;
    const unit = R_D / 6; // arrow length per mu_B
    if (moment > 1e-9)
      layers.push(
        arrows([[0, 0, 0]], [[0, 0, moment * unit]], 'ink', 'moment', {
          name: 'Net moment',
          head: 'solid',
          thickness: 0.03,
        }),
      );
    layers.push(atoms([[0, 0, 0]], 0.6, 'muted', 'nucleus', { labels: ['nucleus'] }));
    // level stacks: t2g (3 plates) below eg (2), up on the left, down on the right
    const plate = R_D * 0.18;
    const split = pol ? 1.2 : 0;
    const stack = (side: -1 | 1, f: number[], tone: Color) => {
      const out: Layer[] = [];
      D_ORDER.forEach((_, k) => {
        const eg = k >= 3;
        const slot = eg ? k - 3 : k;
        const x0 = side * R_D * 1.35 + (slot - (eg ? 0.5 : 1)) * plate * 1.3 - plate / 2;
        const z0 = (eg ? 1 : 0) * plate * 2.2 + (side === -1 ? -split : split) * plate - plate * 1.5;
        const l = quadLayer([x0, -plate / 2, z0], [plate, 0, 0], [0, plate, 0], {
          group: 'levels',
          name: 'Levels per spin',
          color: f[k]! > 0 ? tone : 'muted',
          opacity: f[k]! >= 1 ? 0.9 : f[k]! > 0 ? 0.5 : 0.25,
        });
        if (f[k] === 0) l.wireframe = true;
        out.push(l);
      });
      return out;
    };
    layers.push(...stack(-1, occ.up, 'pos'), ...stack(1, occ.down, 'neg'));
    layers.push(
      labels(
        [
          { text: `up: ${fmt(sumUp, 1)} e`, at: [-R_D * 1.35, 0, plate * 4.2] },
          { text: `down: ${fmt(sumDn, 1)} e`, at: [R_D * 1.35, 0, plate * 4.2] },
          { text: 't2g', at: [-R_D * 1.35 - plate * 3, 0, -plate * 1.5 - split * plate] },
          { text: 'eg', at: [-R_D * 1.35 - plate * 3, 0, plate * 0.7 - split * plate] },
          ...(moment > 1e-9
            ? [{ text: `${fmt(moment, 0)} ${MU}`, at: [0, 0, moment * unit + 1.5] as Vec3 }]
            : []),
        ],
        'labels',
      ),
    );
    layers.push(...axesLayers(R_D * 0.9, ['x (a0)', 'y (a0)', 'z (a0)']));
    const filled = (f: number[]) =>
      D_ORDER.filter((_, k) => f[k]! > 0)
        .map((m) => D_NAME[m])
        .join(', ') || 'none';
    const showText: Record<string, string> = {
      both: 'the up density as solid orange surfaces and the down density as blue wire surfaces',
      up: 'the up density as orange surfaces',
      down: 'the down density as blue surfaces',
      magnetization: 'the magnetization (up minus down): orange where up wins, blue where down wins',
    };
    const describe =
      `A d shell with ${n} electron${n === 1 ? '' : 's'}, ${pol ? 'spin polarized (ISPIN = 2)' : 'not spin polarized (ISPIN = 1)'}: ` +
      `${fmt(sumUp, 1)} up and ${fmt(sumDn, 1)} down, so the spin moment is ${fmt(moment, 0)} ${MU}. ` +
      `Shown: ${showText[show]}, at ${fmt(Number(p.level) * 100, 0)} percent of the peak of a full spin channel; ` +
      `up electrons fill ${filled(occ.up)} and down electrons fill ${filled(occ.down)}. The level stacks beside the ion show ` +
      `the same filling, t2g below eg, ${pol ? 'with the up stack lowered by exchange' : 'with both stacks equal'}.`;
    return {
      layers,
      describe,
      camera: 'iso',
      axes: ['x (a0)', 'y (a0)', 'z (a0)'],
      readouts: [
        { label: 'Up / down electrons', value: `${fmt(sumUp, 1)} / ${fmt(sumDn, 1)}` },
        { label: 'Spin moment', value: `${fmt(moment, 0)} ${MU}` },
        { label: 'ISPIN', value: pol ? '2' : '1' },
      ],
    };
  },
};

// ---------- reading per-site moments from an OUTCAR table ----------

/** Copy of tests/reference/vasp-outputs/OUTCAR_mag_spd (synthetic parser fixture; a test keeps them equal). */
export const SAMPLE_OUTCAR = ` vasp.6.4.2 18Apr23 (build) complex
   number of dos      NEDOS =    301   number of ions     NIONS =      3
   k-points           NKPTS =      4   k-points in BZ     NKDIM =      4   number of bands    NBANDS=     24
 total plane-waves  NPLWV =  32768
   ISPIN  =      2    spin polarized calculation?
   IBRION =     -1    ionic relax: 0-MD 1-quasi-New 2-CG
 magnetization (x)
 
# of ion       s       p       d       tot
------------------------------------------
    1     0.010     0.020     2.000     2.030
    2     0.000     0.000    -1.900    -1.900
    3     0.000     0.000     0.000     0.000
--------------------------------------------------
tot         0.010     0.020     0.100     0.130

 number of electron      40.0000000 magnetization       0.0010000

 magnetization (x)
 
# of ion       s       p       d       tot
------------------------------------------
    1    -0.012    -0.034     3.456     3.410
    2     0.012     0.034    -3.456    -3.410
    3     0.000     0.001     0.000     0.001
--------------------------------------------------
tot         0.000     0.001     0.000     0.001

`;

/** Every per-site magnetization table of the sample, in file order, each read by the tested OUTCAR parser. */
export const sampleTables = (() => {
  let memo: { table: MagnetizationTable; cell: number }[] | undefined;
  return () => {
    if (memo) return memo;
    const heads: number[] = [];
    const re = / magnetization \(x\)\n/g;
    for (let m = re.exec(SAMPLE_OUTCAR); m; m = re.exec(SAMPLE_OUTCAR)) heads.push(m.index);
    memo = heads.map((_, k) => {
      const r = parseOutcar(SAMPLE_OUTCAR.slice(0, heads[k + 1] ?? SAMPLE_OUTCAR.length));
      return { table: r.siteMagnetization!, cell: r.magnetization!.value };
    });
    return memo;
  };
})();

const INTENDED: Record<string, number[] | undefined> = {
  afm: [4, -4, 0],
  fm: [4, 4, 0],
  none: undefined,
};

const siteMoments: SceneDef = {
  id: 'm05s-site-moments',
  title: 'Per-site moments from an OUTCAR table',
  badge: 'sample',
  sources: ['S-034', 'S-041', 'S-065'],
  banner:
    'Sample data: a synthetic OUTCAR excerpt written for parser tests (3 ions, invented moments), not a calculation. The table has no positions, so the ions are drawn in a row in file order.',
  params: [
    {
      kind: 'step',
      id: 'table',
      label: 'Magnetization table in the file',
      min: 1,
      max: 2,
      value: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'column',
      label: 'Column',
      value: 'tot',
      physics: true,
      options: [
        { value: 'tot', label: 'tot (all orbitals)' },
        { value: 'd', label: 'd' },
        { value: 'p', label: 'p' },
        { value: 's', label: 's' },
      ],
    },
    {
      kind: 'select',
      id: 'magmom',
      label: 'MAGMOM you started from',
      value: 'afm',
      physics: true,
      options: [
        { value: 'afm', label: '4.0 -4.0 0.0 (antiferromagnetic)' },
        { value: 'fm', label: '4.0 4.0 0.0 (ferromagnetic)' },
        { value: 'none', label: 'Not given' },
      ],
    },
  ],
  build(p) {
    const tabs = sampleTables();
    const k = Math.min(tabs.length, Math.max(1, Math.round(Number(p.table)))) - 1;
    const { table, cell } = tabs[k]!;
    const col = String(p.column);
    const tot = table.sites.map((s) => s.tot);
    const shown = table.sites.map((s) => (col === 'tot' ? s.tot : (s.values[col] ?? 0)));
    const intended = INTENDED[String(p.magmom)];
    const pattern = intended ? patternKept(intended, tot) : undefined;
    const check = totalMomentCheck(tot, cell);
    const spacing = 3.2;
    const at: Vec3[] = table.sites.map((_, i) => [i * spacing, 0, 0]);
    const perMu = 0.8;
    const layers: Layer[] = [
      // the table names no species, so the ions take the Studio viewer's grey for an unknown element (D-122);
      // the moment is carried by the arrows (length, solid or open head) and the labels, not by the ion colour
      atoms(at, 0.45, UNKNOWN_ELEMENT_COLOR as Color, 'atoms', {
        name: 'Ions',
        labels: table.sites.map((s) => `ion ${s.ion}: ${fmt(s.tot, 3)} ${MU}`),
      }),
      spinArrows(at, shown, perMu),
    ];
    if (intended) {
      const segs: [Vec3, Vec3][] = intended
        .map((m0, i) => [m0, i] as const)
        .filter(([m0]) => m0 !== 0)
        .map(([m0, i]) => [
          [at[i]![0] + 0.75, 0, (-m0 * perMu) / 2],
          [at[i]![0] + 0.75, 0, (m0 * perMu) / 2],
        ]);
      layers.push(
        lines(segs, 'muted', 'magmom', { name: 'Starting MAGMOM (dashed)', dashed: true, tube: 0.04 }),
      );
    }
    layers.push(
      labels(
        table.sites.map((s, i) => ({
          text: `ion ${s.ion}: ${signWord(shown[i]!)}${fmt(shown[i]!, 3)}${pattern ? ` (${pattern.sites[i]!.verdict})` : ''}`,
          at: [at[i]![0], 0, Math.max(2, Math.abs(shown[i]!) * perMu * 0.5 + 0.9)] as Vec3,
        })),
        'labels',
      ),
    );
    const verdicts = pattern
      ? pattern.sites.map((s) => `ion ${s.ion} ${s.verdict}`).join(', ')
      : 'no MAGMOM given, so no pattern check';
    const describe =
      `Table ${k + 1} of ${tabs.length} in a sample OUTCAR (the last one belongs to the final step): ${table.sites.length} ions ` +
      `drawn in file order with arrows for the ${col} column, ${shown.map((x) => `${signWord(x)}${fmt(x, 3)}`).join(', ')} ${MU}; ` +
      `up arrows have solid heads, down arrows open heads. Against the starting MAGMOM: ${verdicts}. The site tot values ` +
      `add up to ${fmt(check.siteSum, 3)} ${MU}, the cell moment line says ${fmt(cell, 3)} ${MU}; the gap is the part outside the spheres.`;
    return {
      layers,
      describe,
      camera: 'front',
      ortho: true,
      readouts: [
        {
          label: 'Table',
          value: `${k + 1} of ${tabs.length}${k + 1 === tabs.length ? ' (final step)' : ''}`,
        },
        { label: 'Sum of site tot', value: `${fmt(check.siteSum, 3)} ${MU}` },
        { label: 'Cell moment (electron line)', value: `${fmt(cell, 3)} ${MU}` },
        {
          label: 'Pattern kept (heuristic)',
          value: pattern ? (pattern.kept ? 'yes' : 'no') : 'not checked',
        },
      ],
    };
  },
};

// ---------- non-collinear textures and SAXIS ----------

const SAXES: Record<string, Vec3> = {
  '001': [0, 0, 1],
  '100': [1, 0, 0],
  '110': [1, 1, 0],
  '111': [1, 1, 1],
};
const SITES = 16;
const A_NC = 2; // scene units per lattice spacing a

const noncollinear: SceneDef = {
  id: 'm05s-noncollinear',
  title: 'Non-collinear spins: canting, helix and cone',
  badge: 'toy-model',
  sources: ['S-059', 'S-065'],
  banner:
    'Classical unit spins on a chain with nearest and next-nearest exchange J1 and J2 and no spin-orbit coupling; the textures come from formulas, not from a VASP run.',
  params: [
    {
      kind: 'select',
      id: 'texture',
      label: 'Texture',
      value: 'helix',
      physics: true,
      options: [
        { value: 'canted', label: 'Canted antiferromagnet' },
        { value: 'helix', label: 'Flat helix' },
        { value: 'cone', label: 'Conical helix' },
      ],
    },
    {
      kind: 'slider',
      id: 'angle',
      label: 'Cant or cone angle',
      min: 0,
      max: 90,
      step: 1,
      value: 30,
      unit: 'degree',
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'q',
      label: 'Wave vector q',
      min: 0,
      max: 0.5,
      step: 0.01,
      value: 0.17,
      unit: '2 pi / a',
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'j2',
      label: 'J2 / |J1|',
      min: -1,
      max: 0.5,
      step: 0.05,
      value: -0.5,
      digits: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'saxis',
      label: 'SAXIS',
      value: '001',
      physics: true,
      options: Object.keys(SAXES).map((k) => ({ value: k, label: k.split('').join(' ') })),
    },
  ],
  build(p) {
    const kind = String(p.texture) as TextureKind;
    const tp: TextureParams = { kind, angle: (Number(p.angle) * Math.PI) / 180, q: Number(p.q) };
    const saxis = SAXES[String(p.saxis)] ?? SAXES['001']!;
    const j1 = kind === 'canted' ? -1 : 1;
    const j2 = Number(p.j2);
    const J = [j1, j2];
    const len = 1.6;
    const local = Array.from({ length: SITES }, (_, j) => textureSpin(tp, j));
    const cart = local.map((s) => saxisToCartesian(s, saxis));
    const sites: Vec3[] = cart.map((_, j) => [j * A_NC, 0, 0]);
    const from = sites.map((s, j) => [
      s[0] - (cart[j]![0] * len) / 2,
      s[1] - (cart[j]![1] * len) / 2,
      s[2] - (cart[j]![2] * len) / 2,
    ]) as Vec3[];
    const tips = sites.map((s, j) => [
      s[0] + (cart[j]![0] * len) / 2,
      s[1] + (cart[j]![1] * len) / 2,
      s[2] + (cart[j]![2] * len) / 2,
    ]) as Vec3[];
    const up = local.map((s) => s[2] >= 0);
    const layers: Layer[] = [
      atoms(sites, 0.22, 'muted', 'atoms', { name: 'Sites', labels: sites.map((_, j) => `site ${j + 1}`) }),
      arrows(
        from,
        cart.map((s) => [s[0] * len, s[1] * len, s[2] * len] as Vec3),
        up.map((u) => (u ? 'pos' : 'neg') as Color),
        'spins',
        { name: 'Spins', head: up.map((u) => (u ? 'solid' : 'open')), thickness: 0.06 },
      ),
      curve(tips, 'muted', 'envelope', { name: 'Arrow tips' }),
    ];
    const sDir = saxisToCartesian([0, 0, 1], saxis);
    const axisFrom: Vec3 = [-2.5 * A_NC, 0, 0];
    layers.push(
      arrows([axisFrom], [[sDir[0] * 3, sDir[1] * 3, sDir[2] * 3]], 'accent', 'saxis', {
        name: 'SAXIS',
        thickness: 0.03,
      }),
      labels(
        [
          {
            text: `SAXIS ${String(p.saxis).split('').join(' ')}`,
            at: [axisFrom[0] + sDir[0] * 3.4, sDir[1] * 3.4, sDir[2] * 3.4],
          },
          { text: 'chain along x', at: [(SITES - 1) * A_NC + 1.5, 0, 0] },
        ],
        'labels',
      ),
    );
    const net = saxisToCartesian(netPerSite(tp), saxis);
    const netLen = Math.hypot(...net);
    if (netLen > 1e-6)
      layers.push(
        arrows([[(SITES / 2) * A_NC, -3, 0]], [[net[0] * 2.5, net[1] * 2.5, net[2] * 2.5]], 'ink', 'net', {
          name: 'Net moment per site',
          thickness: 0.04,
        }),
      );
    const e = chainEnergy(tp, J);
    const qBest = helixOptimum(j1, j2);
    const magmom = local
      .slice(0, 2)
      .map((s) => s.map((x) => fmt(x * 3, 2)).join(' '))
      .join('  ');
    const texText: Record<TextureKind, string> = {
      canted: `a collinear antiferromagnet along the SAXIS direction with every spin tilted by ${fmt(Number(p.angle), 0)} degrees toward x`,
      helix: `a flat helix: each spin turns by ${fmt(Number(p.q) * 360, 0)} degrees from one site to the next, in the plane perpendicular to the chain`,
      cone: `a conical helix of half-angle ${fmt(Number(p.angle), 0)} degrees about the chain, turning ${fmt(Number(p.q) * 360, 0)} degrees per site`,
    };
    const energyText =
      kind === 'canted'
        ? `With J1 = -1 (antiferromagnetic) and J2 = ${fmt(j2, 2)}, the energy is ${fmt(e, 3)} |J1| per spin; isotropic exchange alone prefers no canting.`
        : `With J1 = +1 (ferromagnetic) and J2 = ${fmt(j2, 2)}, the energy is ${fmt(e, 3)} J1 per spin; the lowest flat helix has q = ${fmt(qBest, 3)}.`;
    const describe =
      `A chain of ${SITES} classical spins along x showing ${texText[kind]}, with the spin frame turned to SAXIS ` +
      `${String(p.saxis).split('').join(' ')}; the net moment is ${fmt(netLen, 2)} per site in units of one moment. ${energyText} ` +
      `Turning SAXIS turns every spin together and leaves this energy unchanged; only spin-orbit coupling would tell the directions apart.`;
    return {
      layers,
      describe,
      camera: 'iso',
      readouts: [
        { label: 'Net moment per site', value: fmt(netLen, 2) },
        { label: 'Energy per spin', value: `${fmt(e, 3)} |J1|` },
        { label: 'Best helix q (J1 > 0)', value: `${fmt(helixOptimum(1, j2), 3)} x 2 pi / a` },
        { label: `MAGMOM, sites 1 and 2 (3 ${MU})`, value: magmom },
      ],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [orderings.id]: orderings,
  [groundState.id]: groundState,
  [stoner.id]: stoner,
  [spinDensity.id]: spinDensity,
  [siteMoments.id]: siteMoments,
  [noncollinear.id]: noncollinear,
};
