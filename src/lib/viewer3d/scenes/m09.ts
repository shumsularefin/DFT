// Module 9 (analysis) scenes: bands along a path beside the zone and as a surface, a DOS sheet linked to the band
// surface, a model charge density with slices and a difference density, forces and stress in a displaced and strained
// cell, a relaxation trajectory, bonding and antibonding orbitals with a COHP sheet, and Wannier functions on a chain.
// Pure generators over tested libraries; every number on a stage comes from those libraries or a closed form.
// @source S-036, S-005, S-017, S-019 (bands and DOS), S-048, S-128 (diatomic and COHP), S-125, S-092 (Lennard-Jones
// forces and stress), S-068, S-041 (optimizers), S-161, S-133 (Wannier functions on the dimerized chain)
import type { Mat3 } from '../../crystal/types';
import { HBAR2_OVER_2M_EV_A2 } from '../../physics/constants';
import { cohpCurve, densities, icohp, orbitals, twoLevel, ZETA_H2 } from '../../physics/diatomic';
import {
  equilibriumFcc,
  evaluate,
  fccSupercell,
  maxForce,
  pressureKbar,
  relax,
  rng,
  strainCell,
  TOY_LJ,
  type Cell,
  type M3,
  type Optimizer,
  type RelaxStep,
  type V3,
} from '../../physics/ljcell';
import { blochAt, gap, lowerBand, wannier, wannierAt } from '../../physics/sshchain';
import {
  energyGrid,
  fermiLevel,
  gaussianDos,
  kPath,
  meshEigenvalues,
  modelBands,
  modelById,
  MODELS,
  pointLabel,
  primitiveLattice,
  reciprocalRows,
  SPECIAL_POINTS,
  tetrahedronDos,
  trapz,
  zoneSliceKz0,
  type BandModel,
  type K3,
} from '../../physics/tightbinding3d';
import { chargeDensityDifference, type VolumetricGrid } from '../../physics/volumetric';
import {
  arrows,
  atoms,
  axesLayers,
  brillouinLayers,
  cellEdges,
  curve,
  fmt,
  gridIsosurfaceLayer,
  isosurfaceLayer,
  labels,
  lines,
  points,
  quadLayer,
  sliceLayer,
} from '../kit';
import type { Color, Layer, MeshLayer, SceneDef, Vec3 } from '../types';

// ---------------------------------------------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------------------------------------------

/** hbar^2 / m_e in eV Angstrom^2 (twice the CODATA hbar^2 / 2 m_e, S-031): m* / m_e = (hbar^2 / m_e) / (d2E/dk2). */
const HBAR2_OVER_M = 2 * HBAR2_OVER_2M_EV_A2;

function memo<T>(cache: Map<string, T>, key: string, make: () => T): T {
  let v = cache.get(key);
  if (v === undefined) {
    v = make();
    cache.set(key, v);
    if (cache.size > 64) cache.delete(cache.keys().next().value!);
  }
  return v;
}

/** A flat ribbon through centre points, of half-width w[i] along the direction `side`. */
function ribbon(
  centres: Vec3[],
  halfWidth: number[],
  side: Vec3,
  o: { group: string; name?: string; color: Color; opacity?: number },
): MeshLayer {
  const positions: number[] = [];
  centres.forEach((c, i) => {
    const w = halfWidth[i]!;
    positions.push(c[0] - side[0] * w, c[1] - side[1] * w, c[2] - side[2] * w);
    positions.push(c[0] + side[0] * w, c[1] + side[1] * w, c[2] + side[2] * w);
  });
  const indices: number[] = [];
  for (let i = 0; i + 1 < centres.length; i++) {
    const a = 2 * i;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const l: MeshLayer = { kind: 'mesh', positions, indices, ...o };
  return l;
}

/** A filled sheet between a base line and a curve, both given as points (same length). */
function sheet(
  base: Vec3[],
  top: Vec3[],
  values: number[],
  o: {
    group: string;
    name?: string;
    colormap: 'diverging' | 'sequential';
    range?: [number, number];
    opacity?: number;
  },
): MeshLayer {
  const positions: number[] = [];
  for (let i = 0; i < base.length; i++) positions.push(...base[i]!, ...top[i]!);
  const indices: number[] = [];
  for (let i = 0; i + 1 < base.length; i++) {
    const a = 2 * i;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const vals: number[] = [];
  for (const v of values) vals.push(v, v);
  const l: MeshLayer = {
    kind: 'mesh',
    group: o.group,
    positions,
    indices,
    color: 'accent',
    values: vals,
    colormap: o.colormap,
  };
  if (o.name) l.name = o.name;
  if (o.range) l.range = o.range;
  if (o.opacity !== undefined) l.opacity = o.opacity;
  return l;
}

// ---------------------------------------------------------------------------------------------------------------
// Bands: the model, its reference energy, the path and the band surface over the kz = 0 plane of the zone
// ---------------------------------------------------------------------------------------------------------------

const MODEL_OPTIONS = MODELS.map((m) => ({ value: m.id, label: m.label }));

interface BandData {
  model: BandModel;
  /** Energy zero: the Fermi level of a metal, the valence-band maximum of an insulator. */
  ref: number;
  path: ReturnType<typeof kPath>;
  /** e[b][i] relative to ref; w2[b][i] the weight of orbital 2. */
  e: number[][];
  w2: number[][];
  vbm?: { E: number; i: number };
  cbm?: { E: number; i: number };
  ef?: number;
}

const bandCache = new Map<string, BandData>();
const meshCache = new Map<string, Float64Array[]>();

function meshOf(model: BandModel, n: number, v: number): Float64Array[] {
  return memo(meshCache, `${model.id}|${n}|${v}`, () => meshEigenvalues(model, n, v));
}

function bandData(id: string, v: number): BandData {
  return memo(bandCache, `${id}|${v}`, () => {
    const model = modelById(id);
    const path = kPath(model.lattice, model.a, 240);
    const nb = model.bands.length;
    const raw = path.k.map((k) => modelBands(model, k, v));
    let ref: number;
    let vbm: BandData['vbm'];
    let cbm: BandData['cbm'];
    let ef: number | undefined;
    if (nb === 1) {
      ef = fermiLevel(meshOf(model, 24, v), model.filling);
      ref = ef;
    } else {
      vbm = { E: -Infinity, i: 0 };
      cbm = { E: Infinity, i: 0 };
      raw.forEach((r, i) => {
        if (r.e[0]! > vbm!.E) vbm = { E: r.e[0]!, i };
        if (r.e[1]! < cbm!.E) cbm = { E: r.e[1]!, i };
      });
      ref = vbm.E;
      vbm = { E: 0, i: vbm.i };
      cbm = { E: cbm.E - ref, i: cbm.i };
    }
    const e = Array.from({ length: nb }, (_, b) => raw.map((r) => r.e[b]! - ref));
    const w2 = Array.from({ length: nb }, (_, b) => raw.map((r) => r.w2[b]!));
    const out: BandData = { model, ref, path, e, w2 };
    if (vbm) out.vbm = vbm;
    if (cbm) out.cbm = cbm;
    if (ef !== undefined) out.ef = ef;
    return out;
  });
}

/** Label of a path index: the special point there, or the two it lies between. */
function kLabel(d: BandData, i: number): string {
  const t = d.path.ticks;
  const at = t.find((x) => x.index === i);
  if (at) return pointLabel(at.label);
  for (let q = 0; q + 1 < t.length; q++)
    if (i > t[q]!.index && i < t[q + 1]!.index)
      return `between ${pointLabel(t[q]!.label)} and ${pointLabel(t[q + 1]!.label)}`;
  return 'on the path';
}

/** Effective mass (m* / m_e) of band b at path index i, along the path direction there, from the closed form. */
function effectiveMass(d: BandData, b: number, i: number, v: number): { m: number; dir: string } {
  const k = d.path.k;
  const j = i > 0 ? i - 1 : i + 1;
  const dv = [k[i]![0] - k[j]![0], k[i]![1] - k[j]![1], k[i]![2] - k[j]![2]];
  const len = Math.hypot(dv[0]!, dv[1]!, dv[2]!) || 1;
  const u = dv.map((x) => x / len);
  const h = 1e-3;
  const E = (s: number) =>
    modelBands(
      d.model,
      [0, 1, 2].map((c) => k[i]![c]! + s * h * u[c]!),
      v,
    ).e[b]!;
  const curv = (E(1) - 2 * E(0) + E(-1)) / (h * h);
  // the direction named by the segment the point closes (or opens)
  const t = d.path.ticks;
  let dir = 'along the path';
  for (let q = 0; q + 1 < t.length; q++)
    if ((i > t[q]!.index && i <= t[q + 1]!.index) || (i === 0 && q === 0)) {
      dir = `along ${pointLabel(t[q]!.label)}-${pointLabel(t[q + 1]!.label)}`;
      break;
    }
  return { m: HBAR2_OVER_M / curv, dir };
}

/** Fan triangulation of the kz = 0 slice of the zone: E(kx, ky) of one band as a mesh, z = E * zs. */
function bandSurface(
  model: BandModel,
  band: number,
  v: number,
  ref: number,
  zs: number,
  o: { group: string; name?: string; color: Color; opacity?: number },
): { mesh: MeshLayer; poly: [number, number][] } {
  const rec = reciprocalRows(primitiveLattice(model.lattice, model.a));
  const poly = zoneSliceKz0(rec);
  const angles = new Set<number>();
  const na = 72;
  for (let i = 0; i < na; i++) angles.add((2 * Math.PI * i) / na);
  for (const p of poly) angles.add((Math.atan2(p[1], p[0]) + 2 * Math.PI) % (2 * Math.PI));
  const th = [...angles].sort((x, y) => x - y);
  const radius = (t: number) => {
    const dx = Math.cos(t);
    const dy = Math.sin(t);
    let best = Infinity;
    for (let q = 0; q < poly.length; q++) {
      const A = poly[q]!;
      const B = poly[(q + 1) % poly.length]!;
      const ex = B[0] - A[0];
      const ey = B[1] - A[1];
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const s = (A[0] * ey - A[1] * ex) / den;
      const u = (A[0] * dy - A[1] * dx) / den;
      if (s > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, s);
    }
    return best;
  };
  const nr = 22;
  const positions: number[] = [];
  const E = (kx: number, ky: number) => modelBands(model, [kx, ky, 0], v).e[band]! - ref;
  positions.push(0, 0, E(0, 0) * zs);
  for (const t of th) {
    const R = radius(t);
    for (let j = 1; j <= nr; j++) {
      const r = (R * j) / nr;
      const kx = r * Math.cos(t);
      const ky = r * Math.sin(t);
      positions.push(kx, ky, E(kx, ky) * zs);
    }
  }
  const indices: number[] = [];
  const id = (a: number, j: number) => 1 + (a % th.length) * nr + (j - 1);
  for (let a = 0; a < th.length; a++) {
    indices.push(0, id(a, 1), id(a + 1, 1));
    for (let j = 1; j < nr; j++)
      indices.push(id(a, j), id(a, j + 1), id(a + 1, j + 1), id(a, j), id(a + 1, j + 1), id(a + 1, j));
  }
  const mesh: MeshLayer = { kind: 'mesh', positions, indices, ...o };
  return { mesh, poly };
}

const BAND_TONES: Color[] = ['neg', 'pos'];
const bandTone = (m: BandModel, b: number): Color => (m.bands.length === 1 ? 'accent' : BAND_TONES[b]!);
const bandName = (m: BandModel, b: number): string =>
  m.bands.length === 1 ? 'the s band' : b === 0 ? 'the valence band' : 'the conduction band';

const E_SURF = 0.4; // surface units per eV

const bands: SceneDef = {
  id: 'm09-bands',
  title: 'Bands along a path, in the zone and as a surface',
  badge: 'toy-model',
  sources: ['S-036', 'S-050', 'S-005', 'S-031'],
  banner:
    'Tight-binding s bands on cubic lattices with hoppings chosen for teaching, and a two-band insulator made of two such bands; not a real material.',
  params: [
    {
      kind: 'select',
      id: 'model',
      label: 'Model',
      physics: true,
      value: 'fcc-indirect',
      options: MODEL_OPTIONS,
    },
    {
      kind: 'slider',
      id: 'cursor',
      label: 'k-point along the path',
      min: 0,
      max: 1,
      step: 0.005,
      value: 0,
      digits: 3,
    },
    {
      kind: 'select',
      id: 'view',
      label: 'View',
      value: 'path',
      options: [
        { value: 'path', label: 'Path through the zone and band ribbons' },
        { value: 'surface', label: 'Band surface E(kx, ky) over the kz = 0 plane' },
      ],
    },
    {
      kind: 'slider',
      id: 'mix',
      label: 'Orbital mixing V (two-band models)',
      min: 0,
      max: 1.5,
      step: 0.05,
      value: 0,
      unit: 'eV',
      digits: 2,
      physics: true,
    },
  ],
  build(p) {
    const v = Number(p.mix);
    const d = bandData(String(p.model), v);
    const m = d.model;
    const nb = m.bands.length;
    const n = d.path.k.length;
    const ci = Math.max(0, Math.min(n - 1, Math.round(Number(p.cursor) * (n - 1))));
    const kc = d.path.k[ci]!;
    const at = kLabel(d, ci);
    const where = at.startsWith('between') || at === 'on the path' ? at : `at ${at}`;
    const layers: Layer[] = [];
    const ePlot = d.e.map((band) => band.map((x) => x));
    const fmtK = (k: readonly number[]) => `(${fmt(k[0]!, 2)}, ${fmt(k[1]!, 2)}, ${fmt(k[2]!, 2)})`;
    const twoBand = nb === 2;
    const gapText = (() => {
      if (!twoBand || !d.vbm || !d.cbm) return '';
      const direct = d.vbm.i === d.cbm.i || Math.abs(d.path.s[d.vbm.i]! - d.path.s[d.cbm.i]!) < 1e-9;
      const sameK =
        direct ||
        Math.hypot(
          ...([0, 1, 2].map((c) => d.path.k[d.vbm!.i]![c]! - d.path.k[d.cbm!.i]![c]!) as [
            number,
            number,
            number,
          ]),
        ) < 1e-9;
      return `${sameK ? 'direct' : 'indirect'} gap of ${fmt(d.cbm.E, 2)} eV, valence maximum at ${kLabel(d, d.vbm.i)}, conduction minimum at ${kLabel(d, d.cbm.i)}`;
    })();
    const readouts = [
      { label: 'k-point', value: `${at}, ${fmtK(kc)} 1/Å` },
      { label: 'E at the cursor', value: ePlot.map((b) => `${fmt(b[ci]!, 2)}`).join(', ') + ' eV' },
    ];
    if (twoBand && d.cbm && d.vbm) {
      const mc = effectiveMass(d, 1, d.cbm.i, v);
      const mv = effectiveMass(d, 0, d.vbm.i, v);
      readouts.push({ label: 'Gap', value: `${fmt(d.cbm.E, 2)} eV (${gapText.split(' gap')[0]})` });
      readouts.push({
        label: 'Masses m*/me',
        value: `electron ${fmt(mc.m, 2)} ${mc.dir}, hole ${fmt(Math.abs(mv.m), 2)} ${mv.dir}`,
      });
    } else {
      const mm = effectiveMass(d, 0, 0, v);
      readouts.push({
        label: 'Band width',
        value: `${fmt(Math.max(...ePlot[0]!) - Math.min(...ePlot[0]!), 2)} eV`,
      });
      readouts.push({ label: 'm*/me at the band bottom (Gamma)', value: fmt(mm.m, 2) });
    }

    if (p.view === 'surface') {
      let lowest = Infinity;
      let highest = -Infinity;
      for (let b = 0; b < nb; b++) {
        const s = bandSurface(m, b, v, d.ref, E_SURF, {
          group: 'surface',
          name: 'Band surfaces',
          color: bandTone(m, b),
          opacity: 0.85,
        });
        layers.push(s.mesh);
        for (let i = 2; i < s.mesh.positions.length; i += 3) {
          lowest = Math.min(lowest, s.mesh.positions[i]!);
          highest = Math.max(highest, s.mesh.positions[i]!);
        }
        if (b === 0) {
          const base = lowest - 0.6;
          const ring = s.poly.map((q) => [q[0], q[1], base] as Vec3);
          layers.push(curve(ring, 'muted', 'outline', { closed: true, name: 'Zone slice kz = 0' }));
        }
      }
      // the part of the path that lies in the plane, drawn on each surface
      for (let b = 0; b < nb; b++) {
        let run: Vec3[] = [];
        const flush = () => {
          if (run.length > 1)
            layers.push(curve(run, 'ink', 'cut', { tube: 0.02, name: 'Path in the plane' }));
          run = [];
        };
        d.path.k.forEach((k, i) => {
          if (Math.abs(k[2]) < 1e-9) run.push([k[0], k[1], d.e[b]![i]! * E_SURF]);
          else flush();
        });
        flush();
      }
      // reference plane: the Fermi level of a metal, the valence maximum of an insulator
      const R = Math.max(
        ...layers
          .filter((l) => l.group === 'outline')
          .flatMap((l) => (l.kind === 'curve' ? l.points.map((q) => Math.hypot(q[0], q[1])) : [1])),
      );
      layers.push(
        quadLayer([-R, -R, 0], [2 * R, 0, 0], [0, 2 * R, 0], {
          group: 'reference',
          name: twoBand ? 'Valence maximum (E = 0)' : 'Fermi level (E = 0)',
          color: 'muted',
          opacity: 0.18,
        }),
      );
      const sp = SPECIAL_POINTS[m.lattice];
      const u = (2 * Math.PI) / m.a;
      const inPlane = Object.entries(sp).filter(([, f]) => f[2] === 0);
      const lab = inPlane.map(([name, f]) => {
        const k: K3 = [f[0] * u, f[1] * u, 0];
        return {
          text: name === 'G' ? 'Γ' : name,
          at: [k[0], k[1], (modelBands(m, k, v).e[0]! - d.ref) * E_SURF + 0.25] as Vec3,
        };
      });
      layers.push(labels(lab, 'labels'));
      if (Math.abs(kc[2]) < 1e-9)
        layers.push(
          points(
            ePlot.map((b) => [kc[0], kc[1], b[ci]! * E_SURF] as Vec3),
            'ink',
            0.07,
            'cursor',
            { name: 'Cursor', labels: ePlot.map((b) => `${fmt(b[ci]!, 2)} eV`) },
          ),
        );
      layers.push(
        ...axesLayers([R * 0.9, R * 0.9, 1.5], ['kx (1/Å)', 'ky (1/Å)', 'E'], [-R, -R, lowest - 0.6]),
      );
      const describe =
        `${m.label}: ${nb === 1 ? 'the band' : 'both bands'} drawn as surfaces E(kx, ky) over the kz = 0 slice of the zone, ${fmt(E_SURF, 1)} units per eV, ` +
        `with the in-plane part of the path traced on ${nb === 1 ? 'it' : 'them'} and a flat plane at ${twoBand ? 'the valence maximum' : 'the Fermi level'}. ` +
        (twoBand
          ? `This model has ${gapText.startsWith('indirect') ? 'an' : 'a'} ${gapText}.`
          : `The band is ${readouts[2]!.value} wide.`) +
        (Math.abs(kc[2]) < 1e-9
          ? ` The cursor is ${where}.`
          : ` The cursor k-point (${at}) is out of this plane.`);
      return {
        layers,
        describe,
        readouts,
        camera: 'iso',
        axes: ['kx (1/Å)', 'ky (1/Å)', 'E (eV, 0.4 units per eV)'],
      };
    }

    // path view: the zone with the path, and the bands as ribbons in the plane y = 0 to the right
    // the plot is sized to the zone: 4 zone radii wide, 2.8 tall, starting 1.5 radii to the right of Gamma
    const Rz = Math.max(...d.path.k.map((k) => Math.hypot(k[0], k[1], k[2])));
    const zone = brillouinLayers(primitiveLattice(m.lattice, m.a) as unknown as Mat3, { group: 'zone' });
    layers.push(...zone.layers);
    layers.push(
      curve(
        d.path.k.map((k) => [k[0], k[1], k[2]] as Vec3),
        'accent',
        'path',
        { tube: 0.025, name: 'k-path' },
      ),
    );
    const tickK = d.path.ticks.map((t) => d.path.k[t.index]!);
    layers.push(
      points(
        tickK.map((k) => [k[0], k[1], k[2]] as Vec3),
        'ink',
        0.035 * Rz,
        'path',
        { labels: d.path.ticks.map((t) => pointLabel(t.label)) },
      ),
    );
    const PLOT_X0 = 1.5 * Rz;
    const PLOT_W = 4 * Rz;
    const eAll = ePlot.flat();
    const E_PLOT = (2.8 * Rz) / (Math.max(...eAll) - Math.min(...eAll));
    const sx = PLOT_W / d.path.length;
    const X = (i: number) => PLOT_X0 + d.path.s[i]! * sx;
    for (let b = 0; b < nb; b++) {
      const centres = d.path.k.map((_, i) => [X(i), 0, ePlot[b]![i]! * E_PLOT] as Vec3);
      const hw = d.w2[b]!.map((w) => Rz * (twoBand ? 0.025 + 0.13 * w : 0.06));
      layers.push(
        ribbon(centres, hw, [0, 1, 0], {
          group: 'bands',
          name: 'Band ribbons',
          color: bandTone(m, b),
          opacity: 0.95,
        }),
      );
    }
    const all = ePlot.flat();
    const zlo = Math.min(...all) * E_PLOT - 0.2 * Rz;
    const zhi = Math.max(...all) * E_PLOT + 0.2 * Rz;
    layers.push(
      lines(
        d.path.ticks.map(
          (t) =>
            [
              [X(t.index), 0, zlo],
              [X(t.index), 0, zhi],
            ] as [Vec3, Vec3],
        ),
        'muted',
        'ticks',
        { dashed: true, name: 'Special points' },
      ),
    );
    layers.push(
      lines(
        [
          [
            [PLOT_X0, 0, 0],
            [PLOT_X0 + PLOT_W, 0, 0],
          ],
        ],
        'ink',
        'ticks',
        { dashed: true },
      ),
    );
    layers.push(
      labels(
        [
          ...d.path.ticks.map((t) => ({
            text: t.label === 'G' ? 'Γ' : t.label,
            at: [X(t.index), 0, zlo - 0.15 * Rz] as Vec3,
          })),
          { text: twoBand ? 'E = 0 (VBM)' : 'E = 0 (EF)', at: [PLOT_X0 + PLOT_W + 0.6 * Rz, 0, 0] as Vec3 },
        ],
        'labels',
      ),
    );
    // cursor in the zone and on the bands
    layers.push(
      points([[kc[0], kc[1], kc[2]]], 'ink', 0.06 * Rz, 'cursor', { name: 'Cursor', labels: [`k: ${at}`] }),
    );
    layers.push(
      lines(
        [
          [
            [X(ci), 0, zlo],
            [X(ci), 0, zhi],
          ],
        ],
        'ink',
        'cursor',
      ),
    );
    layers.push(
      points(
        ePlot.map((b) => [X(ci), 0, b[ci]! * E_PLOT] as Vec3),
        'ink',
        0.05 * Rz,
        'cursor',
        { labels: ePlot.map((b, i) => `${bandName(m, i)}: ${fmt(b[ci]!, 2)} eV`) },
      ),
    );
    if (twoBand && d.vbm && d.cbm) {
      const ev = d.path.k[d.vbm.i]!;
      const ec = d.path.k[d.cbm.i]!;
      layers.push(
        points(
          [
            [ev[0], ev[1], ev[2]],
            [ec[0], ec[1], ec[2]],
            [X(d.vbm.i), 0, 0],
            [X(d.cbm.i), 0, d.cbm.E * E_PLOT],
          ],
          ['neg', 'pos', 'neg', 'pos'],
          0.07 * Rz,
          'edges',
          { name: 'Band edges', labels: ['VBM', 'CBM', 'VBM', 'CBM'] },
        ),
      );
    }
    const path = d.path.ticks.map((t) => pointLabel(t.label)).join('-');
    const describe =
      `The ${m.lattice} Brillouin zone (a = ${fmt(m.a, 2)} Å) with the path ${path} drawn through it, and to its right the ` +
      `${nb === 1 ? 'band' : `${nb} bands`} along that path as ribbons, energy up at ${fmt(E_PLOT, 2)} units per eV` +
      `${twoBand ? ', ribbon width showing the share of the conduction-like orbital' : ''}. ` +
      `The cursor is ${where}, k = ${fmtK(kc)} 1/Å, where ${ePlot.map((b, i) => `${bandName(m, i)} is at ${fmt(b[ci]!, 2)} eV`).join(' and ')}. ` +
      (twoBand
        ? `This model has ${gapText.startsWith('indirect') ? 'an' : 'a'} ${gapText}.`
        : `The band is half filled, so the Fermi level (E = 0) crosses it: a metal.`);
    return { layers, describe, readouts, camera: 'iso', ortho: false };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// DOS: a sheet D(E) sharing the energy axis with the band surface
// ---------------------------------------------------------------------------------------------------------------

const dosCache = new Map<string, { grid: number[]; dos: number[] }>();

const D_CLIP = 2; // states/eV drawn at most

const dos: SceneDef = {
  id: 'm09-dos',
  title: 'Density of states beside the band surface',
  badge: 'toy-model',
  sources: ['S-036', 'S-017', 'S-019', 'S-005'],
  banner:
    'DOS of tight-binding toy bands on a uniform k-mesh (Gaussian broadening or linear tetrahedra); the model is not a real material.',
  params: [
    {
      kind: 'select',
      id: 'model',
      label: 'Model',
      physics: true,
      value: 'fcc-indirect',
      options: MODEL_OPTIONS,
    },
    {
      kind: 'select',
      id: 'method',
      label: 'Broadening (ISMEAR)',
      physics: true,
      value: 'gaussian',
      options: [
        { value: 'gaussian', label: 'Gaussian (ISMEAR = 0)' },
        { value: 'tetra', label: 'Tetrahedra (ISMEAR = -5)' },
      ],
    },
    {
      kind: 'slider',
      id: 'sigma',
      label: 'SIGMA',
      min: 0.01,
      max: 0.5,
      step: 0.01,
      value: 0.1,
      unit: 'eV',
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'nedos',
      label: 'NEDOS',
      min: 51,
      max: 3001,
      step: 50,
      value: 301,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'kmesh',
      label: 'k-mesh N x N x N',
      min: 4,
      max: 16,
      step: 2,
      value: 12,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'energy',
      label: 'Energy cut',
      min: -6,
      max: 5,
      step: 0.05,
      value: 0,
      unit: 'eV',
      digits: 2,
    },
  ],
  build(p) {
    const d = bandData(String(p.model), 0);
    const m = d.model;
    const nb = m.bands.length;
    const n = Number(p.kmesh);
    const nedos = Math.round(Number(p.nedos));
    const sigma = Number(p.sigma);
    const tetra = p.method === 'tetra';
    const mesh = meshOf(m, n, 0).map((b) => b.map((x) => x - d.ref));
    let lo = Infinity;
    let hi = -Infinity;
    for (const b of mesh) for (const x of b) [lo, hi] = [Math.min(lo, x), Math.max(hi, x)];
    const emin = Math.floor(lo) - 1;
    const emax = Math.ceil(hi) + 1;
    const key = `${m.id}|${n}|${nedos}|${tetra ? 'T' : sigma}`;
    const { grid, dos: D } = memo(dosCache, key, () => {
      const grid = energyGrid(emin, emax, nedos);
      return { grid, dos: tetra ? tetrahedronDos(mesh, n, grid) : gaussianDos(mesh, grid, sigma) };
    });
    const layers: Layer[] = [];
    let zlo = Infinity;
    let R = 0;
    for (let b = 0; b < nb; b++) {
      const s = bandSurface(m, b, 0, d.ref, E_SURF, {
        group: 'surface',
        name: 'Band surfaces',
        color: bandTone(m, b),
        opacity: 0.8,
      });
      layers.push(s.mesh);
      for (let i = 2; i < s.mesh.positions.length; i += 3) zlo = Math.min(zlo, s.mesh.positions[i]!);
      R = Math.max(R, ...s.poly.map((q) => Math.hypot(q[0], q[1])));
    }
    // the sheet stands in the plane y = 0 to the right of the surfaces, energy up, D(E) along +x from x0
    const y0 = 0;
    const x0 = R + 0.5;
    const D_SCALE = 1.5 * R; // units per state/eV
    const base = grid.map((E) => [x0, y0, E * E_SURF] as Vec3);
    const top = grid.map((E, i) => [x0 + Math.min(D[i]!, D_CLIP) * D_SCALE, y0, E * E_SURF] as Vec3);
    layers.push(
      sheet(
        base,
        top,
        D.map((x) => Math.min(x, D_CLIP)),
        { group: 'dos', name: 'DOS sheet', colormap: 'sequential', range: [0, D_CLIP], opacity: 0.9 },
      ),
    );
    layers.push(curve(top, 'ink', 'dos'));
    const Ecut = Math.max(emin, Math.min(emax, Number(p.energy)));
    const ic = Math.max(
      0,
      Math.min(grid.length - 1, Math.round((Ecut - emin) / ((emax - emin) / (nedos - 1)))),
    );
    const zc = Ecut * E_SURF;
    layers.push(
      quadLayer([-R, -R, zc], [2 * R, 0, 0], [0, 2 * R, 0], {
        group: 'cut',
        name: 'Energy cut',
        color: 'ink',
        opacity: 0.15,
      }),
    );
    layers.push(
      lines(
        [
          [
            [x0, y0, zc],
            [x0 + D_CLIP * D_SCALE, y0, zc],
          ],
        ],
        'ink',
        'cut',
      ),
    );
    layers.push(
      points([[x0 + Math.min(D[ic]!, D_CLIP) * D_SCALE, y0, zc]], 'ink', 0.07, 'cut', {
        labels: [`D = ${fmt(D[ic]!, 3)} states/eV`],
      }),
    );
    layers.push(
      lines(
        [
          [
            [x0 - 0.2, y0, 0],
            [x0 + D_CLIP * D_SCALE, y0, 0],
          ],
        ],
        'ink',
        'reference',
        { dashed: true, name: nb === 1 ? 'Fermi level' : 'Valence maximum' },
      ),
    );
    layers.push(
      labels(
        [
          { text: nb === 1 ? 'EF' : 'VBM', at: [x0 + D_CLIP * D_SCALE + 0.3, y0, 0] },
          { text: 'D(E)', at: [x0 + D_CLIP * D_SCALE + 0.3, y0, emin * E_SURF] },
          { text: `${fmt(Ecut, 2)} eV`, at: [x0 - 0.7, y0, zc] },
        ],
        'labels',
      ),
    );
    layers.push(...axesLayers([R * 0.8, R * 0.8, 1.2], ['kx (1/Å)', 'ky (1/Å)', 'E'], [-R, -R, zlo - 0.4]));
    // numbers
    const dE = (emax - emin) / (nedos - 1);
    const below = grid.map((E, i) => (E <= 0 ? D[i]! : 0));
    const nel = 2 * trapz(below, grid);
    const peak = Math.max(...D);
    let gapSeen = '';
    if (nb === 2 && d.cbm) {
      const mid = d.cbm.E / 2;
      const im = Math.round((mid - emin) / dE);
      let a = im;
      let b = im;
      const th = 0.01 * peak;
      while (a > 0 && D[a]! < th) a--;
      while (b < grid.length - 1 && D[b]! < th) b++;
      const seen = D[im]! < th ? grid[b]! - grid[a]! : 0;
      gapSeen = fmt(seen, 2);
    }
    const readouts = [
      { label: 'Energy step (EMAX - EMIN) / (NEDOS - 1)', value: `${fmt(dE, 3)} eV` },
      { label: 'D at the cut', value: `${fmt(D[ic]!, 3)} states/eV/cell/spin` },
      { label: 'Electrons below E = 0 (two spins)', value: fmt(nel, 3) },
      nb === 2 && d.cbm
        ? {
            label: 'Gap: eigenvalues / seen in DOS (1 percent of peak)',
            value: `${fmt(d.cbm.E, 2)} / ${gapSeen} eV`,
          }
        : {
            label: 'D at the Fermi level',
            value: `${fmt(D[Math.round((0 - emin) / dE)]!, 3)} states/eV/cell/spin`,
          },
    ];
    const describe =
      `${m.label}: the DOS from a ${n} x ${n} x ${n} k-mesh with ${tetra ? 'linear tetrahedra' : `Gaussian broadening of ${fmt(sigma, 2)} eV`} on ${nedos} energies ` +
      `(step ${fmt(dE, 3)} eV), drawn as a sheet that shares its energy axis with the band surfaces beside it (the surfaces show the kz = 0 plane, the DOS counts the whole zone). ` +
      `At the cut, ${fmt(Ecut, 2)} eV, D = ${fmt(D[ic]!, 3)} states per eV per cell and spin; the curve integrates to ${fmt(nel, 3)} electrons below E = 0` +
      (nb === 2 && d.cbm
        ? `, and the gap of ${fmt(d.cbm.E, 2)} eV looks ${gapSeen} eV wide in this DOS.`
        : '.') +
      (peak > D_CLIP ? ` Peaks above ${D_CLIP} states per eV are clipped.` : '');
    return {
      layers,
      describe,
      readouts,
      camera: 'iso',
      axes: ['kx (1/Å)', 'ky (1/Å)', 'E (eV, 0.4 units per eV)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Charge density of an H2-like molecule in a box: total, superposed atoms, difference; isosurfaces and a slice
// ---------------------------------------------------------------------------------------------------------------

interface DensityGrids {
  lo: Vec3;
  hi: Vec3;
  n: [number, number, number];
  bond: VolumetricGrid;
  atoms: VolumetricGrid;
  diff: Float64Array;
  voxel: number;
  S: number;
}
const densityCache = new Map<string, DensityGrids>();
const isoCache = new Map<string, Layer[]>();

function densityGrids(R: number): DensityGrids {
  return memo(densityCache, String(R), () => {
    const half = R / 2 + 3.6;
    const lo: Vec3 = [-half, -3.6, -3.6];
    const hi: Vec3 = [half, 3.6, 3.6];
    const n: [number, number, number] = [36, 28, 28];
    const ds = densities({ R, zeta: ZETA_H2 });
    // periodic sampling as in CHGCAR: n points per edge, no repeated end point, so the voxel is V / N exactly
    const h = [0, 1, 2].map((k) => (hi[k]! - lo[k]!) / n[k]!);
    const sample = (f: (x: number, y: number, z: number) => number) => {
      const out = new Float64Array(n[0] * n[1] * n[2]);
      for (let k = 0; k < n[2]; k++)
        for (let j = 0; j < n[1]; j++)
          for (let i = 0; i < n[0]; i++)
            out[i + n[0] * (j + n[1] * k)] = f(lo[0] + i * h[0]!, lo[1] + j * h[1]!, lo[2] + k * h[2]!);
      return out;
    };
    const lattice: Mat3 = [
      [hi[0] - lo[0], 0, 0],
      [0, hi[1] - lo[1], 0],
      [0, 0, hi[2] - lo[2]],
    ];
    const bond: VolumetricGrid = { lattice, grid: n, values: sample(ds.bond) };
    const atomsG: VolumetricGrid = { lattice, grid: n, values: sample(ds.atoms) };
    const r = chargeDensityDifference(bond, atomsG);
    if (!r.ok) throw new Error(r.reason);
    return { lo, hi, n, bond, atoms: atomsG, diff: r.values, voxel: h[0]! * h[1]! * h[2]!, S: ds.S };
  });
}

const density: SceneDef = {
  id: 'm09-density',
  title: 'Charge density, slices and a difference density',
  badge: 'toy-model',
  sources: ['S-048', 'S-030', 'S-019', 'S-043'],
  banner:
    'Model density of an H2-like molecule in a box from two 1s orbitals (LCAO); a CHGCAR holds a self-consistent density on the same kind of grid.',
  params: [
    {
      kind: 'select',
      id: 'show',
      label: 'Density',
      physics: true,
      value: 'total',
      options: [
        { value: 'total', label: 'Total density of the molecule' },
        { value: 'atoms', label: 'Superposed free atoms' },
        { value: 'difference', label: 'Difference: molecule minus atoms' },
      ],
    },
    {
      kind: 'slider',
      id: 'bond',
      label: 'Bond length',
      min: 1.0,
      max: 3.0,
      step: 0.1,
      value: 1.4,
      unit: 'a0',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'level',
      label: 'Isovalue (fraction of the largest value)',
      min: 0.02,
      max: 0.8,
      step: 0.01,
      value: 0.15,
      digits: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'slice',
      label: 'Slice',
      value: 'along',
      options: [
        { value: 'none', label: 'No slice' },
        { value: 'along', label: 'Plane through the bond (xz)' },
        { value: 'across', label: 'Plane across the bond (yz)' },
      ],
    },
    {
      kind: 'slider',
      id: 'offset',
      label: 'Slice offset',
      min: -3,
      max: 3,
      step: 0.1,
      value: 0,
      unit: 'a0',
      digits: 1,
    },
  ],
  build(p) {
    const R = Number(p.bond);
    const g = densityGrids(R);
    const ds = densities({ R, zeta: ZETA_H2 });
    const show = String(p.show);
    const values = show === 'total' ? g.bond.values : show === 'atoms' ? g.atoms.values : g.diff;
    let vmax = 0;
    for (let i = 0; i < values.length; i++) vmax = Math.max(vmax, Math.abs(values[i]!));
    const level = Number(p.level) * vmax;
    const [nx, ny, nz] = g.n;
    const toScene = (q: Vec3): Vec3 => [
      g.lo[0] + (q[0] * (g.hi[0] - g.lo[0])) / nx,
      g.lo[1] + (q[1] * (g.hi[1] - g.lo[1])) / ny,
      g.lo[2] + (q[2] * (g.hi[2] - g.lo[2])) / nz,
    ];
    const layers: Layer[] = [
      ...memo(isoCache, `${R}|${show}|${level}`, () => {
        if (show !== 'difference')
          return [
            gridIsosurfaceLayer(values, g.n, toScene, level, {
              group: 'isosurface',
              name: 'Isosurface',
              color: 'accent',
              opacity: 0.55,
            }),
          ];
        const neg = values.map((x) => -x);
        return [
          gridIsosurfaceLayer(values, g.n, toScene, level, {
            group: 'isosurface',
            name: 'Gain (orange) and loss (blue)',
            color: 'pos',
            opacity: 0.8,
          }),
          gridIsosurfaceLayer(neg, g.n, toScene, level, { group: 'isosurface', color: 'neg', opacity: 0.55 }),
        ];
      }),
    ];
    layers.push(
      atoms(
        [
          [-R / 2, 0, 0],
          [R / 2, 0, 0],
        ],
        0.18,
        ['c0', 'c0'],
        'atoms',
        { name: 'Nuclei', labels: ['H A', 'H B'] },
      ),
    );
    layers.push(
      lines(
        cellEdges(
          [
            [g.hi[0] - g.lo[0], 0, 0],
            [0, g.hi[1] - g.lo[1], 0],
            [0, 0, g.hi[2] - g.lo[2]],
          ],
          g.lo,
        ),
        'muted',
        'cell',
        { name: 'Box' },
      ),
    );
    const f = show === 'total' ? ds.bond : show === 'atoms' ? ds.atoms : ds.diff;
    const off = Number(p.offset);
    const sliceRange: [number, number] = show === 'difference' ? [-vmax, vmax] : [0, vmax];
    const cmap = show === 'difference' ? 'diverging' : 'sequential';
    let sliceText = '';
    if (p.slice === 'along') {
      const y = Math.max(g.lo[1], Math.min(g.hi[1], off));
      layers.push(
        sliceLayer(
          (q) => f(q[0], q[1], q[2]),
          [g.lo[0], y, g.lo[2]],
          [g.hi[0] - g.lo[0], 0, 0],
          [0, 0, g.hi[2] - g.lo[2]],
          60,
          {
            group: 'slice',
            name: 'Slice',
            colormap: cmap,
            range: sliceRange,
            opacity: 0.75,
          },
        ),
      );
      sliceText = ` A colour slice through the bond axis sits at y = ${fmt(y, 1)} a0.`;
    } else if (p.slice === 'across') {
      const x = Math.max(g.lo[0], Math.min(g.hi[0], off));
      layers.push(
        sliceLayer(
          (q) => f(q[0], q[1], q[2]),
          [x, g.lo[1], g.lo[2]],
          [0, g.hi[1] - g.lo[1], 0],
          [0, 0, g.hi[2] - g.lo[2]],
          50,
          {
            group: 'slice',
            name: 'Slice',
            colormap: cmap,
            range: sliceRange,
            opacity: 0.9,
          },
        ),
      );
      sliceText = ` A colour slice across the bond sits at x = ${fmt(x, 1)} a0${Math.abs(x) < R / 2 ? ', between the nuclei' : ''}.`;
    }
    // numbers from the grids (CHGCAR convention: rho times V, averaged over the grid, counts the electrons)
    const V = (g.hi[0] - g.lo[0]) * (g.hi[1] - g.lo[1]) * (g.hi[2] - g.lo[2]);
    let sumBond = 0;
    let gain = 0;
    for (let i = 0; i < g.bond.values.length; i++) {
      sumBond += g.bond.values[i]!;
      if (g.diff[i]! > 0) gain += g.diff[i]!;
    }
    const nGrid = g.bond.values.length;
    const nel = (sumBond * V) / nGrid;
    const moved = (gain * V) / nGrid;
    const mid = ds.diff(0, 0, 0);
    const describe =
      `An H2-like molecule with a bond of ${fmt(R, 1)} a0 in a box ${fmt(g.hi[0] - g.lo[0], 1)} by ${fmt(g.hi[1] - g.lo[1], 1)} by ${fmt(g.hi[2] - g.lo[2], 1)} a0, ` +
      (show === 'difference'
        ? `showing molecule minus free atoms: orange surfaces where charge is gained, blue where it is lost, at plus and minus ${fmt(level, 4)} e/a0^3. ${fmt(moved, 3)} electrons move, and the bond midpoint gains ${fmt(mid, 4)} e/a0^3.`
        : `showing the ${show === 'total' ? 'total density of the molecule' : 'superposed free-atom densities'} as the surface where it equals ${fmt(level, 4)} e/a0^3 (${fmt(Number(p.level) * 100, 0)} percent of its peak).`) +
      sliceText;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Overlap S of the two 1s orbitals', value: fmt(g.S, 3) },
        { label: 'Grid mean of rho x V (electrons)', value: fmt(nel, 3) },
        { label: 'Charge moved (integral of the gain)', value: `${fmt(moved, 3)} e` },
        { label: 'Isovalue', value: `${fmt(level, 4)} e/a0^3` },
      ],
      camera: 'iso',
      axes: ['x (a0)', 'y (a0)', 'z (a0)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Energies and forces: a Lennard-Jones fcc cell with one displaced atom and a strain
// ---------------------------------------------------------------------------------------------------------------

const A_LJ = equilibriumFcc(TOY_LJ, 2);
const F_SCALE = 2.5; // Angstrom of arrow per eV/Angstrom
const S_SCALE = 0.6; // Angstrom of arrow per GPa of traction

function strainTensor(kind: string, e: number): M3 {
  if (kind === 'uniaxial')
    return [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, e],
    ];
  if (kind === 'shear')
    return [
      [0, e / 2, 0],
      [e / 2, 0, 0],
      [0, 0, 0],
    ];
  return [
    [e, 0, 0],
    [0, e, 0],
    [0, 0, e],
  ];
}

const DISP_DIR: Record<string, V3> = {
  x: [1, 0, 0],
  xy: [Math.SQRT1_2, Math.SQRT1_2, 0],
  xyz: [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
};

const forces: SceneDef = {
  id: 'm09-forces',
  title: 'Forces on atoms and the stress of a cell',
  badge: 'toy-model',
  sources: ['S-125', 'S-092', 'S-093', 'S-041'],
  banner:
    'Lennard-Jones atoms (well 0.05 eV, sigma 2.3 Å) in a periodic fcc cell, a toy whose forces have the size of DFT forces; VASP gets the same quantities from the electrons.',
  params: [
    {
      kind: 'slider',
      id: 'disp',
      label: 'Displacement of the centre atom',
      min: 0,
      max: 0.4,
      step: 0.01,
      value: 0.15,
      unit: 'Å',
      digits: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'dir',
      label: 'Displacement direction',
      value: 'x',
      options: [
        { value: 'x', label: '[100]' },
        { value: 'xy', label: '[110]' },
        { value: 'xyz', label: '[111]' },
      ],
    },
    {
      kind: 'slider',
      id: 'strain',
      label: 'Strain',
      min: -4,
      max: 4,
      step: 0.25,
      value: 0,
      unit: 'percent',
      digits: 2,
      physics: true,
    },
    {
      kind: 'select',
      id: 'kind',
      label: 'Strain type',
      value: 'iso',
      options: [
        { value: 'iso', label: 'Isotropic (volume change)' },
        { value: 'uniaxial', label: 'Uniaxial along z' },
        { value: 'shear', label: 'Shear in xy' },
      ],
    },
  ],
  build(p) {
    const ref = fccSupercell(A_LJ, 2);
    const centre = ref.positions.findIndex(
      (q) => Math.abs(q[0] - A_LJ) + Math.abs(q[1] - A_LJ) + Math.abs(q[2] - A_LJ) < 1e-9,
    );
    const disp = Number(p.disp);
    const dir = DISP_DIR[String(p.dir)] ?? DISP_DIR.x!;
    const moved: Cell = {
      lattice: ref.lattice,
      positions: ref.positions.map((q, i) =>
        i === centre ? ([q[0] + disp * dir[0], q[1] + disp * dir[1], q[2] + disp * dir[2]] as V3) : q,
      ),
    };
    const eps = Number(p.strain) / 100;
    const cell = strainCell(moved, strainTensor(String(p.kind), eps));
    const r = evaluate(cell);
    const r0 = evaluate(ref);
    const fm = maxForce(r.forces);
    const drift = [0, 1, 2].map((k) => r.forces.reduce((s, f) => s + f[k]!, 0));
    const pk = pressureKbar(r.stress);
    const toGPa = 160.2176634;
    const layers: Layer[] = [];
    const pos = cell.positions as Vec3[];
    layers.push(
      atoms(
        pos,
        0.3,
        pos.map((_, i) => (i === centre ? 'c1' : 'c0')),
        'atoms',
        {
          name: 'Atoms',
          labels: r.forces.map((f, i) => `atom ${i + 1}: |F| = ${fmt(Math.hypot(...f), 3)} eV/Å`),
          highlight: [centre],
        },
      ),
    );
    const show = r.forces.map((f, i) => ({ f, i })).filter(({ f }) => Math.hypot(...f) > 0.005);
    if (show.length)
      layers.push(
        arrows(
          show.map(({ i }) => pos[i]!),
          show.map(({ f }) => [f[0] * F_SCALE, f[1] * F_SCALE, f[2] * F_SCALE] as Vec3),
          show.map(({ i }) => (i === centre ? 'pos' : 'accent')),
          'forces',
          { name: 'Forces', thickness: 0.06 },
        ),
      );
    layers.push(
      lines(cellEdges(cell.lattice as unknown as Vec3[]), 'ink', 'cell', { name: 'Strained cell' }),
    );
    if (eps !== 0)
      layers.push(
        lines(cellEdges(ref.lattice as unknown as Vec3[]), 'muted', 'reference', {
          dashed: true,
          name: 'Unstrained cell',
        }),
      );
    // traction on the six faces: the push of the cell on its walls, -sigma n (outward when the pressure is positive)
    const L = cell.lattice;
    const centreOf = add3(scale3(add3(add3(L[0], L[1]), L[2]), 0.5), [0, 0, 0]);
    const faceFrom: Vec3[] = [];
    const faceVec: Vec3[] = [];
    for (let a = 0; a < 3; a++) {
      const nrm = normal3(cross3(L[(a + 1) % 3]!, L[(a + 2) % 3]!));
      const sgn = dot3(nrm, L[a]!) > 0 ? 1 : -1;
      for (const side of [1, -1]) {
        const n = scale3(nrm, sgn * side);
        const at = add3(centreOf, scale3(L[a]!, side * 0.5));
        const t = [0, 1, 2].map(
          (i) =>
            -(r.stress[i]![0]! * n[0] + r.stress[i]![1]! * n[1] + r.stress[i]![2]! * n[2]) * toGPa * S_SCALE,
        ) as Vec3;
        if (Math.hypot(...t) > 1e-3) {
          faceFrom.push(at);
          faceVec.push(t);
        }
      }
    }
    if (faceVec.length)
      layers.push(
        arrows(faceFrom, faceVec, 'neg', 'stress', {
          name: 'Stress on the faces',
          head: 'open',
          thickness: 0.05,
        }),
      );
    layers.push(labels([{ text: 'displaced atom', at: add3(pos[centre]!, [0, 0, 0.8]) }], 'labels'));
    const dE = (r.energy - r0.energy) / pos.length;
    const sxx = r.stress.map((row) => row.map((x) => -x * toGPa * 10));
    const describe =
      `A periodic cell of ${pos.length} Lennard-Jones atoms (fcc, a = ${fmt(A_LJ, 3)} Å, drawn 2 by 2 by 2) with the centre atom moved ${fmt(disp, 2)} Å along ${p.dir === 'x' ? '[100]' : p.dir === 'xy' ? '[110]' : '[111]'} ` +
      `and a ${fmt(Number(p.strain), 2)} percent ${p.kind === 'iso' ? 'isotropic' : p.kind === 'uniaxial' ? 'uniaxial z' : 'xy shear'} strain. ` +
      (fm.value < 5e-4
        ? `No atom feels a force: in the undisplaced crystal every atom sits at a centre of symmetry, even under strain. `
        : `Arrows show the forces (${fmt(F_SCALE, 1)} Å per eV/Å): the largest is ${fmt(fm.value, 3)} eV/Å on atom ${fm.index + 1}, and they sum to ${fmt(Math.hypot(...drift), 4)} eV/Å. `) +
      `The pressure is ${fmt(pk, 2)} kB; open arrows on the faces show the push of the cell on its walls.`;
    return {
      layers,
      describe,
      readouts: [
        {
          label: 'Largest force',
          value: fm.value < 5e-4 ? '0.000 eV/Å' : `${fmt(fm.value, 3)} eV/Å (atom ${fm.index + 1})`,
        },
        { label: 'Total drift |sum of F|', value: `${fmt(Math.hypot(...drift), 4)} eV/Å` },
        { label: 'Pressure', value: `${fmt(pk, 2)} kB` },
        {
          label: 'Stress xx, yy, zz, xy (kB, VASP sign)',
          value: `${fmt(sxx[0]![0]!, 1)}, ${fmt(sxx[1]![1]!, 1)}, ${fmt(sxx[2]![2]!, 1)}, ${fmt(sxx[0]![1]!, 1)}`,
        },
        { label: 'Energy change per atom', value: `${fmt(dE * 1000, 2)} meV` },
      ],
      lattice: cell.lattice as unknown as [Vec3, Vec3, Vec3],
      ortho: true,
      camera: 'iso',
    };
  },
};

function add3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[0]! + b[0]!, a[1]! + b[1]!, a[2]! + b[2]!];
}
function scale3(a: readonly number[], s: number): Vec3 {
  return [a[0]! * s, a[1]! * s, a[2]! * s];
}
function dot3(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}
function cross3(a: readonly number[], b: readonly number[]): Vec3 {
  return [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
}
function normal3(a: readonly number[]): Vec3 {
  const n = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
  return [a[0]! / n, a[1]! / n, a[2]! / n];
}

// ---------------------------------------------------------------------------------------------------------------
// Relaxation: a vacancy cell started from rattled positions, relaxed step by step
// ---------------------------------------------------------------------------------------------------------------

const RELAX_STEPS = 40;
const relaxCache = new Map<string, RelaxStep[]>();

function relaxStart(): Cell {
  const c = fccSupercell(A_LJ, 2);
  const centre = c.positions.findIndex(
    (q) => Math.abs(q[0] - A_LJ) + Math.abs(q[1] - A_LJ) + Math.abs(q[2] - A_LJ) < 1e-9,
  );
  const g = rng(7);
  const positions = c.positions
    .filter((_, i) => i !== centre)
    .map(
      (q) => [q[0] + 0.12 * (2 * g() - 1), q[1] + 0.12 * (2 * g() - 1), q[2] + 0.12 * (2 * g() - 1)] as V3,
    );
  return { lattice: c.lattice, positions };
}

const OPT_LABEL: Record<Optimizer, string> = {
  sd: 'steepest descent',
  damped: 'damped dynamics (like IBRION = 3)',
  bfgs: 'quasi-Newton BFGS (like IBRION = 1)',
};

const relaxation: SceneDef = {
  id: 'm09-relax',
  title: 'A relaxation, step by step',
  badge: 'toy-model',
  sources: ['S-125', 'S-068', 'S-041', 'S-019'],
  banner:
    'Lennard-Jones toy cell with a vacancy, started from rattled positions; the optimizers follow the textbook schemes, not VASP code, and each step is capped at 0.25 Å.',
  params: [
    {
      kind: 'step',
      id: 'step',
      label: 'Ionic step',
      min: 0,
      max: RELAX_STEPS,
      value: 0,
      physics: true,
      interval: 0.5,
    },
    {
      kind: 'select',
      id: 'method',
      label: 'Optimizer (IBRION)',
      physics: true,
      value: 'sd',
      options: (Object.keys(OPT_LABEL) as Optimizer[]).map((k) => ({ value: k, label: OPT_LABEL[k] })),
    },
    {
      kind: 'slider',
      id: 'potim',
      label: 'POTIM (step scale)',
      min: 0.1,
      max: 2,
      step: 0.1,
      value: 0.5,
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'ediffg',
      label: '|EDIFFG| (force criterion)',
      min: 0.005,
      max: 0.1,
      step: 0.005,
      value: 0.02,
      unit: 'eV/Å',
      digits: 3,
    },
  ],
  build(p) {
    const method = String(p.method) as Optimizer;
    const potim = Number(p.potim);
    const traj = memo(relaxCache, `${method}|${potim}`, () =>
      relax(relaxStart(), method, potim, RELAX_STEPS),
    );
    const s = Math.max(0, Math.min(RELAX_STEPS, Math.round(Number(p.step))));
    const cur = traj[s]!;
    const eFinal = Math.min(...traj.map((t) => t.energy));
    const crit = Number(p.ediffg);
    const stop = traj.findIndex((t) => t.fmax < crit);
    const L = A_LJ * 2;
    const layers: Layer[] = [];
    const pos = cur.positions as Vec3[];
    const r = evaluate({ lattice: relaxStart().lattice, positions: cur.positions });
    layers.push(
      atoms(pos, 0.3, 'c0', 'atoms', {
        name: 'Atoms',
        labels: r.forces.map((f, i) => `atom ${i + 1}: |F| = ${fmt(Math.hypot(...f), 3)} eV/Å`),
      }),
    );
    layers.push(
      atoms(traj[0]!.positions as Vec3[], 0.2, 'muted', 'start', { name: 'Start positions', opacity: 0.35 }),
    );
    const vac: Vec3 = [A_LJ, A_LJ, A_LJ];
    layers.push(atoms([vac], 0.3, 'pos', 'vacancy', { name: 'Vacancy', opacity: 0.3, labels: ['vacancy'] }));
    // trails of the atoms that move most
    const disp = traj[0]!.positions.map((q, i) =>
      Math.hypot(...q.map((x, k) => x - traj[RELAX_STEPS]!.positions[i]![k]!)),
    );
    const order = disp
      .map((d, i) => ({ d, i }))
      .sort((a, b) => b.d - a.d)
      .slice(0, 12);
    for (const { i } of order)
      layers.push(
        curve(
          traj
            .slice(0, s + 1)
            .map((t) => t.positions[i] as Vec3)
            .concat(s === 0 ? [traj[0]!.positions[i] as Vec3] : []),
          'accent',
          'trails',
          { name: 'Trails' },
        ),
      );
    layers.push(
      arrows(
        pos,
        r.forces.map((f) => [f[0] * F_SCALE, f[1] * F_SCALE, f[2] * F_SCALE] as Vec3),
        'pos',
        'forces',
        { name: 'Forces', thickness: 0.06 },
      ),
    );
    layers.push(
      lines(
        cellEdges([
          [L, 0, 0],
          [0, L, 0],
          [0, 0, L],
        ]),
        'muted',
        'cell',
        { name: 'Cell' },
      ),
    );
    // the force trace beside the cell: step along x, log10 Fmax up, the EDIFFG line dashed
    const gx0 = L + 2.5;
    const gw = 6;
    const zOf = (f: number) => ((Math.log10(Math.max(f, 1e-4)) + 4) / 4.5) * L;
    const trace = traj.map((t, i) => [gx0 + (gw * i) / RELAX_STEPS, 0, zOf(t.fmax)] as Vec3);
    layers.push(curve(trace, 'ink', 'trace', { name: 'Max force trace', tube: 0.03 }));
    layers.push(
      lines(
        [
          [
            [gx0, 0, zOf(crit)],
            [gx0 + gw, 0, zOf(crit)],
          ],
        ],
        'neg',
        'trace',
        { dashed: true },
      ),
    );
    layers.push(
      lines(
        [
          [
            [gx0, 0, 0],
            [gx0, 0, L],
          ],
          [
            [gx0, 0, 0],
            [gx0 + gw, 0, 0],
          ],
        ],
        'muted',
        'trace',
      ),
    );
    layers.push(
      points([trace[s]!], 'pos', 0.12, 'trace', { labels: [`step ${s}: Fmax ${fmt(cur.fmax, 3)} eV/Å`] }),
    );
    layers.push(
      labels(
        [
          { text: 'log10 Fmax', at: [gx0, 0, L + 0.4] },
          { text: 'ionic step', at: [gx0 + gw, 0, -0.5] },
          { text: `|EDIFFG| ${fmt(crit, 3)}`, at: [gx0 + gw + 0.8, 0, zOf(crit)] },
          { text: 'vacancy', at: [vac[0], vac[1], vac[2] + 0.7] },
        ],
        'labels',
      ),
    );
    const status =
      stop < 0
        ? `In ${RELAX_STEPS} steps the largest force never falls below ${fmt(crit, 3)} eV/Å: this run would stop at NSW unfinished.`
        : s >= stop
          ? `The criterion |EDIFFG| = ${fmt(crit, 3)} eV/Å was met at step ${stop}: VASP would print "reached required accuracy" there.`
          : `The criterion |EDIFFG| = ${fmt(crit, 3)} eV/Å is met at step ${stop}.`;
    const describe =
      `Ionic step ${s} of a ${OPT_LABEL[method]} relaxation with POTIM ${fmt(potim, 1)} of a ${pos.length}-atom Lennard-Jones cell with a vacancy at its centre, started from rattled positions (faint dots). ` +
      `The energy is ${fmt((cur.energy - eFinal) * 1000, 1)} meV above the lowest reached and the largest force is ${fmt(cur.fmax, 3)} eV/Å. ${status}`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Step', value: `${s} of ${RELAX_STEPS}` },
        { label: 'E minus lowest E', value: `${fmt((cur.energy - eFinal) * 1000, 1)} meV` },
        { label: 'Largest force', value: `${fmt(cur.fmax, 3)} eV/Å` },
        { label: 'Criterion met at step', value: stop < 0 ? `not within ${RELAX_STEPS}` : String(stop) },
      ],
      lattice: [
        [L, 0, 0],
        [0, L, 0],
        [0, 0, L],
      ],
      ortho: true,
      camera: 'iso',
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// COHP: bonding and antibonding orbitals of a two-level molecule at their energies, with the -COHP sheet
// ---------------------------------------------------------------------------------------------------------------

const Z_COHP = 1.0; // units per eV
const BOND_R = 1.4; // a0
const orbitalCache = new Map<string, Layer[]>();

const cohp: SceneDef = {
  id: 'm09-cohp',
  title: 'Bonding and antibonding states and their COHP',
  badge: 'toy-model',
  sources: ['S-128', 'S-129', 'S-048', 'S-049'],
  banner:
    'Two orbitals, one on each atom, in an orthogonal two-level model with chosen energies; LOBSTER gets the same kind of COHP from projected VASP states.',
  params: [
    {
      kind: 'select',
      id: 'electrons',
      label: 'Electrons in the bond',
      physics: true,
      value: '2',
      options: [
        { value: '1', label: '1 (like H2+)' },
        { value: '2', label: '2 (like H2)' },
        { value: '3', label: '3 (like He2+)' },
        { value: '4', label: '4 (like He2)' },
      ],
    },
    {
      kind: 'slider',
      id: 'hop',
      label: 'Hopping |H_AB|',
      min: 1.5,
      max: 4,
      step: 0.1,
      value: 2.5,
      unit: 'eV',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'delta',
      label: 'On-site difference eB - eA',
      min: 0,
      max: 4,
      step: 0.1,
      value: 0,
      unit: 'eV',
      digits: 1,
      physics: true,
    },
  ],
  build(p) {
    const ne = Number(p.electrons);
    const beta = -Number(p.hop);
    const delta = Number(p.delta);
    const h = { eA: -delta / 2, eB: delta / 2, beta };
    const lv = twoLevel(h, ne);
    const ic = icohp(lv);
    const ef = ne <= 2 ? lv[0]!.E : lv[1]!.E;
    const layers: Layer[] = [];
    const key = `${delta}|${beta}`;
    const orb = memo(orbitalCache, key, () => {
      const o = orbitals({ R: BOND_R, zeta: ZETA_H2 });
      const out: Layer[] = [];
      lv.forEach((l, j) => {
        const f = o.combination(l.cA, l.cB);
        const z = l.E * Z_COHP;
        const lo: Vec3 = [-BOND_R / 2 - 2.8, -2.3, -2.3];
        const hi: Vec3 = [BOND_R / 2 + 2.8, 2.3, 2.3];
        let peak = 0;
        for (const x of [-BOND_R / 2, 0, BOND_R / 2]) peak = Math.max(peak, Math.abs(f(x, 0, 0)));
        const lvl = 0.3 * peak;
        const shift =
          (g: (x: number, y: number, z: number) => number) => (x: number, y: number, zz: number) =>
            g(x, y, zz - z);
        const grp = j === 0 ? 'bonding' : 'antibonding';
        out.push(
          isosurfaceLayer(shift(f), [lo[0], lo[1], lo[2] + z], [hi[0], hi[1], hi[2] + z], [28, 22, 22], lvl, {
            group: grp,
            name: j === 0 ? 'Bonding orbital' : 'Antibonding orbital',
            color: 'pos',
            opacity: 0.8,
          }),
        );
        out.push(
          isosurfaceLayer(
            shift((x, y, zz) => -f(x, y, zz)),
            [lo[0], lo[1], lo[2] + z],
            [hi[0], hi[1], hi[2] + z],
            [28, 22, 22],
            lvl,
            {
              group: grp,
              color: 'neg',
              opacity: 0.8,
            },
          ),
        );
      });
      return out;
    });
    layers.push(...orb);
    // nuclei at each level, atomic levels at the sides, dashed correlation lines
    const nuc: Vec3[] = [];
    lv.forEach((l) => nuc.push([-BOND_R / 2, 0, l.E * Z_COHP], [BOND_R / 2, 0, l.E * Z_COHP]));
    layers.push(
      atoms(
        nuc,
        0.12,
        nuc.map((_, i) => (i % 2 ? 'c1' : 'c0')),
        'atoms',
        { name: 'Nuclei', labels: nuc.map((_, i) => (i % 2 ? 'atom B' : 'atom A')) },
      ),
    );
    const xa = -BOND_R / 2 - 4.2;
    const xb = BOND_R / 2 + 4.2;
    const segs: [Vec3, Vec3][] = [
      [
        [xa - 0.6, 0, h.eA * Z_COHP],
        [xa + 0.6, 0, h.eA * Z_COHP],
      ],
      [
        [xb - 0.6, 0, h.eB * Z_COHP],
        [xb + 0.6, 0, h.eB * Z_COHP],
      ],
    ];
    layers.push(lines(segs, 'ink', 'levels', { tube: 0.04, name: 'Atomic levels' }));
    const corr: [Vec3, Vec3][] = [];
    for (const l of lv) {
      corr.push([
        [xa + 0.6, 0, h.eA * Z_COHP],
        [-BOND_R / 2 - 2.4, 0, l.E * Z_COHP],
      ]);
      corr.push([
        [xb - 0.6, 0, h.eB * Z_COHP],
        [BOND_R / 2 + 2.4, 0, l.E * Z_COHP],
      ]);
    }
    layers.push(lines(corr, 'muted', 'levels', { dashed: true }));
    // electrons as spin arrows: up solid, down open-headed
    const from: Vec3[] = [];
    const vec: Vec3[] = [];
    const heads: ('solid' | 'open')[] = [];
    lv.forEach((l) => {
      const z = l.E * Z_COHP;
      if (l.f >= 1) {
        from.push([-0.35, -2.9, z - 0.35]);
        vec.push([0, 0, 0.7]);
        heads.push('solid');
      }
      if (l.f >= 2) {
        from.push([0.35, -2.9, z + 0.35]);
        vec.push([0, 0, -0.7]);
        heads.push('open');
      }
    });
    if (from.length)
      layers.push(
        arrows(from, vec, 'ink', 'electrons', {
          name: 'Electrons (up solid, down open)',
          head: heads,
          thickness: 0.06,
        }),
      );
    // the -COHP sheet in the plane y = 0 at x0, sharing the energy axis
    const x0 = BOND_R / 2 + 7;
    const w = 0.25;
    const Es: number[] = [];
    const emin = Math.min(...lv.map((l) => l.E)) - 1.5;
    const emax = Math.max(...lv.map((l) => l.E)) + 1.5;
    for (let i = 0; i <= 240; i++) Es.push(emin + ((emax - emin) * i) / 240);
    const mc = Es.map((E) => -cohpCurve(lv, E, w));
    const cmax = Math.max(...mc.map(Math.abs), 1e-9);
    const sx = 2.5 / cmax;
    layers.push(
      sheet(
        Es.map((E) => [x0, 0, E * Z_COHP] as Vec3),
        Es.map((E, i) => [x0 + mc[i]! * sx, 0, E * Z_COHP] as Vec3),
        mc,
        { group: 'cohp', name: '-COHP sheet', colormap: 'diverging', range: [-cmax, cmax], opacity: 0.9 },
      ),
    );
    layers.push(
      lines(
        [
          [
            [x0, 0, emin * Z_COHP],
            [x0, 0, emax * Z_COHP],
          ],
        ],
        'ink',
        'cohp',
      ),
    );
    layers.push(
      lines(
        [
          [
            [x0 - 3, 0, ef * Z_COHP],
            [x0 + 3, 0, ef * Z_COHP],
          ],
        ],
        'ink',
        'fermi',
        { dashed: true, name: 'Highest filled level' },
      ),
    );
    layers.push(
      labels(
        [
          { text: 'bonding', at: [x0 + 2.2, 0, emax * Z_COHP] },
          { text: 'antibonding', at: [x0 - 2.4, 0, emax * Z_COHP] },
          { text: '-COHP', at: [x0, 0, emax * Z_COHP + 0.6] },
          { text: 'A', at: [xa, 0, h.eA * Z_COHP - 0.5] },
          { text: 'B', at: [xb, 0, h.eB * Z_COHP - 0.5] },
          { text: 'highest filled', at: [x0 + 3.6, 0, ef * Z_COHP] },
        ],
        'labels',
      ),
    );
    const bo = (lv[0]!.f - lv[1]!.f) / 2;
    const describe =
      `Two atoms ${fmt(BOND_R, 1)} a0 apart with one orbital each, on-site energies ${fmt(h.eA, 1)} and ${fmt(h.eB, 1)} eV and hopping ${fmt(beta, 1)} eV. ` +
      `The bonding orbital (one sign, charge between the atoms) sits at ${fmt(lv[0]!.E, 2)} eV and the antibonding one (a sign change and a node between the atoms) at ${fmt(lv[1]!.E, 2)} eV, each drawn at its energy. ` +
      `With ${ne} electron${ne === 1 ? '' : 's'} the ICOHP is ${fmt(ic, 2)} eV and the bond order ${fmt(bo, 1)}; the -COHP sheet on the right is positive (bonding) at the lower level and negative (antibonding) at the upper one.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Levels', value: `${fmt(lv[0]!.E, 2)} eV (bonding), ${fmt(lv[1]!.E, 2)} eV (antibonding)` },
        { label: 'Occupations', value: `${lv[0]!.f}, ${lv[1]!.f}` },
        { label: 'ICOHP up to the highest filled level', value: `${fmt(ic, 2)} eV` },
        { label: 'Bond order', value: fmt(bo, 1) },
      ],
      camera: 'front',
      axes: ['x (a0)', 'y (a0)', 'E (eV, 1 unit per eV)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Wannier functions: Bloch states of a dimerized chain summed into a localized function
// ---------------------------------------------------------------------------------------------------------------

const W_AMP = 1.0;
const wannierScene: SceneDef = {
  id: 'm09-wannier',
  title: 'Bloch states summed into a Wannier function',
  badge: 'toy-model',
  sources: ['S-161', 'S-133', 'S-036', 'S-049'],
  banner:
    'A dimerized two-site chain (SSH model) with Gaussian site orbitals, a 1D tight-binding toy; Wannier90 does the same with DFT Bloch states in 3D.',
  params: [
    {
      kind: 'slider',
      id: 'smooth',
      label: 'Gauge smoothness (0 random phases, 1 maximally localized)',
      min: 0,
      max: 1,
      step: 0.05,
      value: 1,
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'dimer',
      label: 'Dimerization (v - w) / (v + w)',
      min: -0.8,
      max: 0.8,
      step: 0.05,
      value: 0.4,
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'nk',
      label: 'k-points (cells in the chain)',
      min: 6,
      max: 16,
      step: 2,
      value: 10,
      digits: 0,
      physics: true,
    },
  ],
  build(p) {
    const dm = Number(p.dimer);
    const c = { v: 1 + dm, w: 1 - dm, n: Math.round(Number(p.nk)) };
    const wf = wannier(c, Number(p.smooth));
    const half = Math.floor(c.n / 2);
    const xmin = -half - 0.25;
    const xmax = c.n - half - 0.25;
    const layers: Layer[] = [];
    // the chain: A sites (larger) at integers, B sites (smaller) at half-integers; bond tubes scale with the hopping
    const A: Vec3[] = [];
    const B: Vec3[] = [];
    for (let n = -half; n < c.n - half; n++) {
      A.push([n, 0, 0]);
      B.push([n + 0.5, 0, 0]);
    }
    layers.push(
      atoms(A, 0.11, 'c0', 'atoms', { name: 'Sites A and B', labels: A.map((_, i) => `A ${i - half}`) }),
    );
    layers.push(atoms(B, 0.08, 'c1', 'atoms', { labels: B.map((_, i) => `B ${i - half}`) }));
    const strong: [Vec3, Vec3][] = [];
    const weak: [Vec3, Vec3][] = [];
    for (let i = 0; i < A.length; i++) {
      (c.v >= c.w ? strong : weak).push([A[i]!, B[i]!]);
      if (i + 1 < A.length) (c.w > c.v ? strong : weak).push([B[i]!, A[i + 1]!]);
    }
    if (strong.length)
      layers.push(lines(strong, 'ink', 'bonds', { tube: 0.035, name: 'Hoppings (thick strong, thin weak)' }));
    if (weak.length) layers.push(lines(weak, 'muted', 'bonds', { tube: 0.012 }));
    // Bloch states of the lower band, one per k, stacked behind the chain: x, Im along y around the baseline, Re up
    const nx = 220;
    const xs = Array.from({ length: nx + 1 }, (_, i) => xmin + ((xmax - xmin) * i) / nx);
    let bmax = 0;
    const bl = Array.from({ length: c.n }, (_, j) => xs.map((x) => blochAt(c, j, wf.theta[j]!, x)));
    for (const b of bl) for (const z of b) bmax = Math.max(bmax, Math.hypot(z.re, z.im));
    const bs = 0.35 / (bmax || 1);
    bl.forEach((b, j) => {
      const y0 = 1.2 + 0.55 * j;
      layers.push(
        curve(
          b.map((z, i) => [xs[i]!, y0 + bs * z.im, 0.6 + bs * z.re] as Vec3),
          j === 0 ? 'ink' : 'c2',
          'bloch',
          { name: 'Bloch states (one per k)' },
        ),
      );
    });
    layers.push(
      lines(
        [
          [
            [xmin, 1.2, 0.6],
            [xmin, 1.2 + 0.55 * (c.n - 1), 0.6],
          ],
        ],
        'muted',
        'bloch',
        { dashed: true },
      ),
    );
    // the Wannier function on the chain: Re up, Im along -y; its centre as a marker
    const wv = xs.map((x) => wannierAt(wf, x));
    let wmax = 0;
    for (const z of wv) wmax = Math.max(wmax, Math.hypot(z.re, z.im));
    const ws = W_AMP / (wmax || 1);
    layers.push(
      curve(
        wv.map((z, i) => [xs[i]!, -ws * z.im, ws * z.re] as Vec3),
        'pos',
        'wannier',
        { tube: 0.025, name: 'Wannier function (Re up, Im sideways)' },
      ),
    );
    layers.push(
      curve(
        wv.map((z, i) => [xs[i]!, 0, -0.9 + ws * 0.6 * (z.re * z.re + z.im * z.im) * wmax] as Vec3),
        'neg',
        'wannier',
        { name: '|w|^2 below the chain' },
      ),
    );
    layers.push(
      arrows([[wf.centre, 0, -1.6]], [[0, 0, 0.6]], 'ink', 'centre', {
        name: 'Wannier centre',
        thickness: 0.05,
      }),
    );
    const inside = Math.abs(wf.centre - 0.25) < Math.abs(wf.centre + 0.25);
    const clear = wf.spread < 1;
    const where = !clear
      ? 'spread over many cells, so the centre means little'
      : inside
        ? 'on the bond inside the cell'
        : 'on the bond across the cell boundary';
    layers.push(
      labels(
        [
          { text: 'Bloch states, k = 0 at the front', at: [xmax + 0.4, 1.2, 0.6] },
          { text: 'Wannier function', at: [xmax + 0.4, 0, 0.6] },
          { text: `centre ${fmt(wf.centre, 2)}`, at: [wf.centre, 0, -1.9] },
        ],
        'labels',
      ),
    );
    const g = gap(c);
    const E0 = lowerBand(c, 0).E;
    const describe =
      `A chain of ${c.n} cells, each with sites A and B, hoppings v = ${fmt(c.v, 2)} inside a cell and w = ${fmt(c.w, 2)} between cells (gap ${fmt(g, 2)}). ` +
      `Behind it the ${c.n} Bloch states of the lower band (energies from ${fmt(E0, 2)}) are drawn as twisting curves, real part up and imaginary part sideways. ` +
      `Their sum with gauge smoothness ${fmt(Number(p.smooth), 2)} is the Wannier function on the chain: centre at ${fmt(wf.centre, 2)} cells (${where}), spread ${fmt(wf.spread, 3)} cells squared.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Hoppings v, w', value: `${fmt(c.v, 2)}, ${fmt(c.w, 2)} (gap ${fmt(g, 2)})` },
        {
          label: 'Wannier centre',
          value: `${fmt(wf.centre, 3)} cells (${!clear ? 'not localized' : inside ? 'intra-cell bond' : 'inter-cell bond'})`,
        },
        { label: 'Spread over the sites', value: `${fmt(wf.spread, 3)} cells^2` },
      ],
      camera: 'iso',
      axes: ['x (cells)', 'Im (Bloch states stacked by k)', 'Re'],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [bands.id]: bands,
  [dos.id]: dos,
  [density.id]: density,
  [forces.id]: forces,
  [relaxation.id]: relaxation,
  [cohp.id]: cohp,
  [wannierScene.id]: wannierScene,
};
