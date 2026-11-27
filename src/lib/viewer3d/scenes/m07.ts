// Module 7 (running a calculation) scenes: the cores of a job and how KPAR and NCORE group them, the SCF energy path of an
// OSZICAR per ionic step, a charge density carried into a restart, the five-step protocol as a tree of runs, and a k-path
// in the zone as VASPKIT writes it to KPATH.in.
// @source S-041 (Field Handbook), S-042 (Workflow Handbook), S-019 (VASP wiki: KPAR, NCORE, OSZICAR, ICHARG)
import { reciprocalLattice } from '../../crystal/lattice';
import type { Mat3 } from '../../crystal/types';
import { HARTREE_EV } from '../../physics/scf1d';
import { runRestart, type RestartResult } from '../../physics/scfRestart1d';
import { groupsOfRank, kpointsOfGroup, parallelSplit } from '../../physics/vaspParallel';
import { parseOszicar } from '../../vasp/oszicar';
import { OUTPUT_SAMPLES } from '../../vasp/outputSamples';
import {
  arrows,
  atoms,
  axesLayers,
  brillouinLayers,
  curve,
  fmt,
  labels,
  lines,
  points,
  quadLayer,
} from '../kit';
import { add, norm, scale, sub } from '../math';
import type { Color, Layer, MeshLayer, SceneDef, Vec3 } from '../types';
import { boxMesh } from './blocks';

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const mat = (rows: readonly (readonly number[])[]): Mat3 =>
  [v3(rows[0]!), v3(rows[1]!), v3(rows[2]!)] as unknown as Mat3;
const TONES: Color[] = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];

// ---------------------------------------------------------------------------------------------------------------------
// Job scripts: the cores of the job, grouped by KPAR into k-point groups and by NCORE into band groups.

const parallel: SceneDef = {
  id: 'm07-parallel',
  title: 'Cores grouped by KPAR and NCORE',
  badge: 'computed',
  sources: ['S-019', 'S-041'],
  params: [
    { kind: 'slider', id: 'nodes', label: 'Nodes', min: 1, max: 4, step: 1, value: 2, physics: true },
    {
      kind: 'select',
      id: 'tpn',
      label: 'Cores per node',
      physics: true,
      value: '16',
      options: [
        { value: '16', label: '16' },
        { value: '32', label: '32' },
      ],
    },
    { kind: 'slider', id: 'kpar', label: 'KPAR', min: 1, max: 8, step: 1, value: 4, physics: true },
    { kind: 'slider', id: 'ncore', label: 'NCORE', min: 1, max: 16, step: 1, value: 4, physics: true },
    {
      kind: 'slider',
      id: 'nkpts',
      label: 'Irreducible k-points',
      min: 1,
      max: 40,
      step: 1,
      value: 10,
      physics: true,
    },
  ],
  build(p) {
    const nodes = Number(p.nodes);
    const tpn = p.tpn === '32' ? 32 : 16;
    const ranks = nodes * tpn;
    const s = parallelSplit(ranks, Number(p.kpar), Number(p.ncore), Number(p.nkpts));
    const cols = 4;
    const rows = tpn / cols;
    const gap = 1.6;
    const coreAt = (r: number): Vec3 => {
      const node = Math.floor(r / tpn);
      const local = r % tpn;
      return [node * (cols + gap) + (local % cols), Math.floor(local / cols), 0];
    };
    const layers: Layer[] = [];
    const items: { text: string; at: Vec3 }[] = [];
    for (let n = 0; n < nodes; n++)
      items.push({ text: `node ${n + 1}`, at: [n * (cols + gap) + 1.5, -1.1, 0] });
    if (!s.valid) {
      layers.push(
        boxMesh(
          Array.from({ length: ranks }, (_, r) => ({ c: coreAt(r), s: [0.8, 0.8, 0.4] as Vec3 })),
          { group: 'cores', name: 'Cores', color: 'muted', opacity: 0.6 },
        ),
      );
      items.push({ text: 'not a valid split', at: [((cols + gap) * nodes) / 2, rows / 2, 1.4] });
    } else {
      const byGroup: Vec3[][] = Array.from({ length: s.kpar }, () => []);
      for (let r = 0; r < ranks; r++) byGroup[groupsOfRank(s, r).kGroup]!.push(coreAt(r));
      byGroup.forEach((cs, g) =>
        layers.push(
          boxMesh(
            cs.map((c) => ({ c, s: [0.8, 0.8, 0.4] as Vec3 })),
            {
              group: 'cores',
              name: g === 0 ? 'Cores by k-point group' : undefined,
              color: TONES[g % 8]!,
              opacity: 0.85,
            },
          ),
        ),
      );
      // one bar over the cores that share a band (a band group of NCORE ranks)
      const bars: [Vec3, Vec3][] = [];
      for (let r0 = 0; r0 < ranks; r0 += s.ncore) {
        const a = coreAt(r0);
        const b = coreAt(r0 + s.ncore - 1);
        if (s.ncore === 1) bars.push([add(a, [-0.25, 0, 0.32]), add(a, [0.25, 0, 0.32])]);
        else if (a[1] === b[1] && a[0] <= b[0]) bars.push([add(a, [0, 0, 0.32]), add(b, [0, 0, 0.32])]);
        else
          for (let r = r0; r < r0 + s.ncore - 1; r++)
            bars.push([add(coreAt(r), [0, 0, 0.32]), add(coreAt(r + 1), [0, 0, 0.32])]);
      }
      layers.push(lines(bars, 'ink', 'bands', { name: 'Band groups (NCORE cores each)', tube: 0.06 }));
      // the k-points each group computes, stacked in rounds above the group
      const done: Vec3[] = [];
      const doneTone: Color[] = [];
      const idle: Vec3[] = [];
      byGroup.forEach((cs, g) => {
        const c = scale(
          cs.reduce((acc, q) => add(acc, q), [0, 0, 0] as Vec3),
          1 / cs.length,
        );
        const ks = kpointsOfGroup(s, g);
        for (let round = 0; round < s.rounds; round++) {
          const at: Vec3 = [c[0], c[1], 1.2 + 0.7 * round];
          if (round < ks.length) {
            done.push(at);
            doneTone.push(TONES[g % 8]!);
          } else idle.push(at);
        }
        if (s.kpar <= 8)
          items.push({ text: `group ${g + 1}: ${ks.length} k`, at: [c[0], c[1], 1.2 + 0.7 * s.rounds] });
      });
      layers.push(atoms(done, 0.26, doneTone, 'kpoints', { name: 'k-points, one round per level' }));
      if (idle.length)
        layers.push(
          atoms(idle, 0.26, 'muted', 'idle', { name: 'Idle slots in the last round', opacity: 0.25 }),
        );
    }
    layers.push(labels(items.slice(0, 12), 'labels'));
    const describe = s.valid
      ? `${ranks} ranks on ${nodes} node${nodes === 1 ? '' : 's'} of ${tpn} cores. KPAR = ${s.kpar} makes ${s.kpar} k-point group${s.kpar === 1 ? '' : 's'} of ${s.ranksPerKGroup} ranks (one colour each); ` +
        `NCORE = ${s.ncore} puts ${s.ncore} rank${s.ncore === 1 ? '' : 's'} on each band (the dark bars), so NPAR = ${s.npar} band groups per k-point group. ` +
        `The ${s.nkpts} k-points are dealt to the groups in turn and stacked above them: ${s.rounds} round${s.rounds === 1 ? '' : 's'}, with ${s.idleSlots} idle slot${s.idleSlots === 1 ? '' : 's'} in the last round.`
      : `${ranks} ranks on ${nodes} node${nodes === 1 ? '' : 's'} of ${tpn} cores, drawn grey: ${s.problem} ${s.ranksPerKGroup ? `Choose NCORE from the divisors of ${s.ranksPerKGroup}.` : `Choose KPAR from the divisors of ${ranks}.`}`;
    return {
      layers,
      describe,
      camera: 'iso',
      readouts: [
        { label: 'Ranks', value: String(ranks) },
        { label: 'k-point groups', value: s.valid ? `${s.kpar} x ${s.ranksPerKGroup} ranks` : 'invalid' },
        { label: 'NPAR (band groups)', value: s.valid ? String(s.npar) : 'invalid' },
        { label: 'k-point rounds', value: `${s.rounds} (${s.idleSlots} idle slots)` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// OSZICAR: the electronic energy changes of each ionic step as a waterfall, against the EDIFF plane.

const OSZ = OUTPUT_SAMPLES.filter((s) => s.kind === 'OSZICAR');
const parsed = new Map(OSZ.map((s) => [s.id, parseOszicar(s.text)]));

/** Electronic steps grouped by the ionic step they belong to. */
export function loopsOf(id: string): { dE: number[]; e: number[]; f: number; e0: number; mag?: number }[] {
  const r = parsed.get(id) ?? parsed.get(OSZ[0]!.id)!;
  const out: { dE: number[]; e: number[]; f: number; e0: number; mag?: number }[] = [];
  let k = 0;
  for (const ion of r.ionic) {
    const steps = r.electronic.slice(k, k + ion.nElectronic);
    k += ion.nElectronic;
    out.push({
      dE: steps.map((s) => s.dE),
      e: steps.map((s) => s.e),
      f: ion.f,
      e0: ion.e0,
      ...(ion.mag !== undefined ? { mag: ion.mag } : {}),
    });
  }
  return out;
}

const oszicar: SceneDef = {
  id: 'm07-oszicar',
  title: 'OSZICAR as an energy path per ionic step',
  badge: 'sample',
  banner:
    'Synthetic OSZICAR files written to the documented line format with invented numbers; they show how to read the log, not a result.',
  sources: ['S-019', 'S-041'],
  params: [
    {
      kind: 'select',
      id: 'sample',
      label: 'Sample file',
      physics: true,
      value: OSZ[0]!.id,
      options: OSZ.map((s) => ({ value: s.id, label: s.label.replace('OSZICAR: ', '') })),
    },
    {
      kind: 'slider',
      id: 'ediff',
      label: 'EDIFF, as a power of ten',
      unit: 'eV',
      min: -6,
      max: -1,
      step: 1,
      value: -3,
      physics: true,
    },
    {
      kind: 'step',
      id: 'upto',
      label: 'Ionic steps read so far',
      min: 1,
      max: 3,
      value: 3,
      interval: 1.2,
      physics: true,
    },
  ],
  build(p) {
    const id = parsed.has(String(p.sample)) ? String(p.sample) : OSZ[1]!.id;
    const all = loopsOf(id);
    const upto = Math.min(all.length, Math.max(1, Number(p.upto)));
    const loops = all.slice(0, upto);
    const ediff = 10 ** Number(p.ediff);
    const z0 = 7; // z = log10 |dE| + 7, so 1E-7 eV sits on the floor
    const zOf = (d: number) => Math.max(0, Math.log10(Math.max(Math.abs(d), 1e-12)) + z0);
    const dx = 1.4;
    const dy = 3;
    const maxN = Math.max(...all.map((l) => l.dE.length));
    const layers: Layer[] = [];
    const ends: Vec3[] = [];
    const endTone: Color[] = [];
    const items: { text: string; at: Vec3 }[] = [];
    const verdicts: string[] = [];
    loops.forEach((l, i) => {
      const pts = l.dE.map((d, n) => [(n + 1) * dx, i * dy, zOf(d)] as Vec3);
      if (pts.length > 1)
        layers.push(
          curve(pts, 'accent', 'path', {
            name: i === 0 ? 'Electronic steps per ionic step' : undefined,
            tube: 0.06,
          }),
        );
      layers.push(
        points(pts, 'accent', 0.16, 'steps', {
          name: 'Electronic steps',
          labels: l.dE.map((d, n) => `ionic ${i + 1}, step ${n + 1}: dE ${d.toExponential(2)} eV`),
        }),
      );
      const last = l.dE[l.dE.length - 1]!;
      const ok = Math.abs(last) < ediff;
      verdicts.push(ok ? 'converged' : 'not converged');
      ends.push(pts[pts.length - 1]!);
      endTone.push(ok ? 'neg' : 'pos');
      items.push({
        text: `ionic ${i + 1}: ${ok ? 'below EDIFF' : 'above EDIFF'}`,
        at: add(pts[pts.length - 1]!, [0.6, 0, 0.6]),
      });
    });
    layers.push(
      atoms(ends, 0.3, endTone, 'ends', {
        name: 'Last step of each loop',
        highlight: verdicts.map((v, i) => (v === 'converged' ? -1 : i)).filter((i) => i >= 0),
      }),
    );
    const zE = zOf(ediff);
    const W = (maxN + 1) * dx;
    const D = Math.max(1, all.length - 1) * dy + 1.5;
    layers.push(
      quadLayer([0, -0.75, zE], [W, 0, 0], [0, D, 0], {
        group: 'ediff',
        name: 'EDIFF plane',
        color: 'neg',
        opacity: 0.22,
      }),
    );
    layers.push(...axesLayers([W, D, 10], ['electronic step', 'ionic step', 'log10 |dE|'], [0, -0.75, 0]));
    items.push({ text: `EDIFF = 1E${Number(p.ediff)}`, at: [W, D - 0.75, zE + 0.3] });
    layers.push(labels(items, 'labels'));
    const lastIon = loops[loops.length - 1]!;
    const nBad = verdicts.filter((v) => v !== 'converged').length;
    return {
      layers,
      camera: 'iso',
      axes: ['electronic step', 'ionic step', 'log10 |dE| + 7 (eV)'],
      describe:
        `Sample OSZICAR, ${upto} of ${all.length} ionic step${all.length === 1 ? '' : 's'} read: each tube is one electronic loop, its height the log of the energy change dE per step. ` +
        `The blue plane is EDIFF = 1E${Number(p.ediff)} eV; ${nBad === 0 ? 'every loop ends below it' : `${nBad} of ${loops.length} loop${loops.length === 1 ? '' : 's'} end${nBad === 1 ? 's' : ''} above it (outlined), so ${nBad === 1 ? 'that ionic step has' : 'those ionic steps have'} no converged energy`}. ` +
        `The last ionic line reads F = ${fmt(lastIon.f, 4)} eV, E0 = ${fmt(lastIon.e0, 4)} eV${lastIon.mag !== undefined ? `, mag = ${fmt(lastIon.mag, 4)}` : ''}.`,
      readouts: [
        { label: 'Ionic steps read', value: `${upto} of ${all.length}` },
        { label: 'Loops above EDIFF', value: String(nBad) },
        { label: 'Last F', value: `${fmt(lastIon.f, 4)} eV` },
        { label: 'Last E0', value: `${fmt(lastIon.e0, 4)} eV` },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Restarts: a charge density carried from one run into the next (ICHARG), in the 1D two-electron SCF toy.

const TOL = 1e-6;
const runs = new Map<string, RestartResult>();
function restartRun(key: string): RestartResult {
  const hit = runs.get(key);
  if (hit) return hit;
  let r: RestartResult;
  if (key === 'fresh') r = runRestart({ tol: TOL });
  else if (key === 'other') r = runRestart({ Z: 1.5, tol: TOL });
  else if (key === '1') r = runRestart({ tol: TOL, start: restartRun('fresh').density });
  else if (key === '1-other') r = runRestart({ tol: TOL, start: restartRun('other').density });
  else if (key === '11') r = runRestart({ start: restartRun('fresh').density, fixed: true });
  else if (key === '11-other') r = runRestart({ start: restartRun('other').density, fixed: true });
  else r = restartRun('fresh');
  runs.set(key, r);
  return r;
}

const START_TEXT: Record<string, string> = {
  '2': 'ICHARG = 2: start from the atoms',
  '1': 'ICHARG = 1: read the CHGCAR of a converged run of this system, then iterate',
  '1-other': 'ICHARG = 1: read a CHGCAR written by a run with other settings, then iterate',
  '11': 'ICHARG = 11: read the CHGCAR of this system and keep it fixed',
  '11-other': 'ICHARG = 11: read a CHGCAR written by a run with other settings and keep it fixed',
};

const restarts: SceneDef = {
  id: 'm07-restarts',
  title: 'A charge density carried into the next run',
  badge: 'toy-model',
  banner:
    'A 1D model with two electrons (Hartree-Fock with soft-Coulomb potentials, not Kohn-Sham DFT); "settings" stands for a different nuclear charge. It shows ICHARG, not ISTART.',
  sources: ['S-011', 'S-047', 'S-019', 'S-042'],
  params: [
    {
      kind: 'select',
      id: 'icharg',
      label: 'Start',
      physics: true,
      value: '2',
      options: Object.entries(START_TEXT).map(([value, label]) => ({ value, label })),
    },
    {
      kind: 'step',
      id: 'iteration',
      label: 'SCF iteration',
      min: 1,
      max: 40,
      value: 40,
      interval: 0.4,
      physics: true,
    },
  ],
  build(p) {
    const key = String(p.icharg) in START_TEXT ? String(p.icharg) : '2';
    const r = restartRun(key === '2' ? 'fresh' : key);
    const ref = restartRun('fresh');
    const its = r.iterations;
    const shown = Math.min(its.length, Math.max(1, Number(p.iteration)));
    const idx: number[] = [];
    for (let i = 0; i < r.x.length; i += 2) if (Math.abs(r.x[i]!) <= 6) idx.push(i);
    const zs = 8;
    const dy = 0.3;
    const row = (n: Float64Array, y: number): Vec3[] => idx.map((i) => [r.x[i]!, y, zs * n[i]!]);
    const layers: Layer[] = [];
    for (let k = 0; k < shown; k++) {
      const tone: Color = k === shown - 1 ? 'accent' : 'muted';
      layers.push(
        curve(row(its[k]!.densityIn, k * dy), tone, 'density', {
          name: k === 0 ? 'Density fed into each iteration' : undefined,
          tube: k === shown - 1 ? 0.06 : 0.02,
        }),
      );
    }
    const back = Math.max(shown, 4) * dy + 0.6;
    layers.push(curve(row(ref.density, back), 'ink', 'target', { name: 'Converged density of this system' }));
    layers.push(
      lines(
        [
          [
            [-6, back, 0],
            [6, back, 0],
          ],
        ],
        'muted',
        'target',
        { dashed: true },
      ),
    );
    layers.push(...axesLayers([12.5, back + 0.5, 6], ['x (bohr)', 'iteration', 'density'], [-6, 0, 0]));
    const fixed = key.startsWith('11');
    layers.push(
      labels(
        [
          { text: fixed ? 'fixed: never updated' : `iteration ${shown}`, at: [6.3, (shown - 1) * dy, 0.5] },
          { text: 'converged, this system', at: [6.3, back, 0.4] },
        ],
        'labels',
      ),
    );
    const eps = r.orbitalEnergy * HARTREE_EV;
    const epsRef = ref.orbitalEnergy * HARTREE_EV;
    const off = Math.abs(eps - epsRef);
    const done = !fixed && r.converged && shown === its.length;
    const describe =
      `${START_TEXT[key]}. Each curve is the density fed into one SCF iteration (iteration runs back), the curve at the rear, on the dashed baseline, is the converged density of this system. ` +
      (fixed
        ? `The density is read once and never updated, so the run solves for the orbital once: its energy is ${fmt(eps, 3)} eV, ${off < 0.01 ? 'equal to the converged SCF value because the CHGCAR fits this system' : `${fmt(off, 3)} eV off the converged ${fmt(epsRef, 3)} eV, because the CHGCAR belongs to another problem`}.`
        : `Showing ${shown} of the ${its.length} iterations it takes to bring the density change below 1e-6 (residual now ${its[shown - 1]!.residual.toExponential(1)}). ${done ? `It ends at an orbital energy of ${fmt(eps, 3)} eV${key === '2' ? '' : ', the same as from scratch'}.` : ''}`);
    return {
      layers,
      describe,
      camera: 'iso',
      axes: ['x (bohr)', 'SCF iteration (0.3 units each)', 'density (8 units per electron/bohr)'],
      readouts: [
        { label: 'Iterations', value: fixed ? '1 (no update)' : String(its.length) },
        { label: 'Orbital energy', value: `${fmt(eps, 3)} eV` },
        { label: 'Converged SCF value', value: `${fmt(epsRef, 3)} eV` },
        { label: 'Residual shown', value: its[shown - 1]!.residual.toExponential(1) },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// The workflow: the five-step protocol as a tree of runs, with what each run hands to the next.

interface Station {
  name: string;
  at: Vec3;
  tags: string;
}
/** The protocol of the-workflow.mdx (S-042), one station per step. */
export const STATIONS: Station[] = [
  { name: '1 Relaxation', at: [0, 0, 0], tags: 'ENCUT = 1.3 x ENMAX, EDIFF, ISPIN, MAGMOM' },
  { name: '2 SCF', at: [0, 0, 3], tags: 'ISTART = 1, LORBIT = 11, same folder' },
  { name: '3 Bands', at: [-3.5, 1, 6], tags: 'ICHARG = 11, KPATH.in from VASPKIT 303' },
  { name: '4 Elastic', at: [4, 2.5, 3], tags: 'IBRION = 6 to 8, ENCUT = 620, NCORE commented out' },
  { name: '5 Optics', at: [3.5, -2, 6], tags: 'EDIFF 1E-6 to 1E-8, NBANDS x 3' },
];
/** [from, to, what is carried]. */
export const LINKS: [number, number, string][] = [
  [0, 1, 'CONTCAR, WAVECAR'],
  [1, 2, 'CHGCAR'],
  [0, 3, 'CONTCAR'],
  [1, 4, 'converged SCF'],
];

const workflow: SceneDef = {
  id: 'm07-workflow',
  title: 'The five-step protocol as a tree of runs',
  badge: 'illustrative',
  sources: ['S-042', 'S-041'],
  params: [
    {
      kind: 'step',
      id: 'step',
      label: 'Protocol step',
      min: 1,
      max: 5,
      value: 1,
      interval: 1.4,
      physics: true,
    },
    {
      kind: 'toggle',
      id: 'mismatch',
      label: 'Change ENCUT after the relaxation',
      value: false,
      physics: true,
    },
    { kind: 'toggle', id: 'spine', label: 'Settings that must match', value: true },
  ],
  build(p) {
    const step = Math.min(5, Math.max(1, Number(p.step)));
    const mismatch = Boolean(p.mismatch);
    const size: Vec3 = [2.2, 1.4, 1];
    const done = STATIONS.filter((_, i) => i < step - 1).map((s) => ({ c: s.at, s: size }));
    const cur = STATIONS[step - 1]!;
    const todo = STATIONS.filter((_, i) => i >= step).map((s) => ({ c: s.at, s: size }));
    const layers: Layer[] = [];
    if (done.length)
      layers.push(boxMesh(done, { group: 'stations', name: 'Runs', color: 'c0', opacity: 0.75 }));
    layers.push(
      boxMesh([{ c: cur.at, s: scale(size, 1.12) }], { group: 'stations', color: 'accent', opacity: 0.9 }),
    );
    if (todo.length) {
      const g: MeshLayer = boxMesh(todo, { group: 'stations', color: 'muted', opacity: 0.15 });
      g.wireframe = true;
      layers.push(g);
    }
    const from: Vec3[] = [];
    const vec: Vec3[] = [];
    const broken: [Vec3, Vec3][] = [];
    const items: { text: string; at: Vec3 }[] = STATIONS.map((s, i) => ({
      text: i === step - 1 ? `${s.name} (now)` : s.name,
      at: add(s.at, [0, 0, 0.85]),
    }));
    for (const [a, b, what] of LINKS) {
      if (b > step - 1) continue;
      const A = STATIONS[a]!.at;
      const B = STATIONS[b]!.at;
      const d = sub(B, A);
      const u = scale(d, 1 / norm(d));
      const s0 = add(A, scale(u, 0.9));
      const s1 = sub(B, scale(u, 0.9));
      if (mismatch && a === 0) broken.push([s0, s1]);
      else {
        from.push(s0);
        vec.push(sub(s1, s0));
      }
      items.push({
        text: mismatch && a === 0 ? `${what} (ENCUT changed)` : what,
        at: add(scale(add(A, B), 0.5), [0.4, 0, 0]),
      });
    }
    if (from.length)
      layers.push(arrows(from, vec, 'ink', 'links', { name: 'What each run hands on', thickness: 0.02 }));
    if (broken.length)
      layers.push(
        lines(broken, 'pos', 'broken', { name: 'Links broken by a changed ENCUT', dashed: true, tube: 0.04 }),
      );
    if (p.spine) {
      const spine: [Vec3, Vec3][] = [];
      for (const [a, b] of LINKS) {
        if (b > step - 1 || (mismatch && a === 0)) continue;
        spine.push([add(STATIONS[a]!.at, [0, 0, -0.7]), add(STATIONS[b]!.at, [0, 0, -0.7])]);
      }
      if (spine.length)
        layers.push(
          lines(spine, 'accent', 'spine', {
            name: 'Same ENCUT, ISPIN, MAGMOM, LMAXMIX, functional, cell',
            dashed: true,
          }),
        );
    }
    layers.push(labels(items.slice(0, 12), 'labels'));
    const reads = LINKS.filter(([, b]) => b === step - 1).map(
      ([a, , w]) => `${w} from ${STATIONS[a]!.name.slice(2)}`,
    );
    return {
      layers,
      camera: 'iso',
      describe:
        `The author's protocol as a tree of runs, step ${step} of 5: ${cur.name.slice(2)} (${cur.tags}). ` +
        (reads.length ? `It reads ${reads.join(' and ')}. ` : 'It starts from the four input files. ') +
        (mismatch
          ? 'ENCUT was changed after the relaxation, so every link out of it is broken (dashed): the later runs no longer belong to the relaxed structure.'
          : 'Links show what each run hands to the next; the dashed spine joins runs that must share ENCUT, ISPIN, MAGMOM, LMAXMIX, the functional and the cell.'),
      readouts: [
        { label: 'Step', value: `${step} of 5: ${cur.name.slice(2)}` },
        { label: 'Key tags', value: cur.tags },
        { label: 'Reads', value: reads.length ? reads.join('; ') : 'POSCAR, INCAR, KPOINTS, POTCAR' },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// VASPKIT: the band path it writes to KPATH.in (task 303), drawn in the Brillouin zone.

interface PathTable {
  label: string;
  /** Primitive cell rows (Angstrom) in the convention the point coordinates refer to. */
  lattice: Mat3;
  points: Record<string, Vec3>;
  path: string[][];
}
/** Setyawan-Curtarolo tables (S-005, as ported in crystal/kpath/setyawan.ts); checked against tests/reference/kpaths.json. */
export const KPATHS: Record<string, PathTable> = {
  fcc: {
    label: 'Si, fcc (a = 5.43 A)',
    lattice: mat([
      [0, 2.715, 2.715],
      [2.715, 0, 2.715],
      [2.715, 2.715, 0],
    ]),
    points: {
      G: [0, 0, 0],
      K: [3 / 8, 3 / 8, 3 / 4],
      L: [0.5, 0.5, 0.5],
      U: [5 / 8, 1 / 4, 5 / 8],
      W: [0.5, 1 / 4, 3 / 4],
      X: [0.5, 0, 0.5],
    },
    path: [
      ['G', 'X', 'W', 'K', 'G', 'L', 'U', 'W', 'L', 'K'],
      ['U', 'X'],
    ],
  },
  bcc: {
    label: 'Fe, bcc (a = 2.87 A)',
    lattice: mat([
      [-1.435, 1.435, 1.435],
      [1.435, -1.435, 1.435],
      [1.435, 1.435, -1.435],
    ]),
    points: { G: [0, 0, 0], H: [0.5, -0.5, 0.5], P: [0.25, 0.25, 0.25], N: [0, 0, 0.5] },
    path: [
      ['G', 'H', 'N', 'G', 'P', 'H'],
      ['P', 'N'],
    ],
  },
  sc: {
    label: 'Simple cubic (a = 3.35 A)',
    lattice: mat([
      [3.35, 0, 0],
      [0, 3.35, 0],
      [0, 0, 3.35],
    ]),
    points: { G: [0, 0, 0], X: [0, 0.5, 0], R: [0.5, 0.5, 0.5], M: [0.5, 0.5, 0] },
    path: [
      ['G', 'X', 'M', 'G', 'R', 'X'],
      ['M', 'R'],
    ],
  },
  hex: {
    label: 'Mg, hexagonal (a = 3.21 A, c = 5.21 A)',
    lattice: mat([
      [1.605, -2.7799415461, 0],
      [1.605, 2.7799415461, 0],
      [0, 0, 5.21],
    ]),
    points: {
      G: [0, 0, 0],
      A: [0, 0, 0.5],
      H: [1 / 3, 1 / 3, 0.5],
      K: [1 / 3, 1 / 3, 0],
      L: [0.5, 0, 0.5],
      M: [0.5, 0, 0],
    },
    path: [
      ['G', 'M', 'K', 'G', 'A', 'L', 'H', 'A'],
      ['L', 'M'],
      ['K', 'H'],
    ],
  },
};
const show = (l: string) => (l === 'G' ? 'Γ' : l);
const say = (l: string) => (l === 'G' ? 'Gamma' : l);

/** The k-points of a line-mode file: `n` points per segment, both ends included (as VASP reads line mode, S-019). */
export function lineModePoints(
  t: PathTable,
  n: number,
): { segments: [string, string][]; points: Vec3[][]; length: number } {
  const b = reciprocalLattice(t.lattice).map(v3) as unknown as [Vec3, Vec3, Vec3];
  const cart = (q: Vec3): Vec3 => add(add(scale(b[0], q[0]), scale(b[1], q[1])), scale(b[2], q[2]));
  const segments: [string, string][] = [];
  const pts: Vec3[][] = [];
  let length = 0;
  for (const chain of t.path)
    for (let i = 0; i + 1 < chain.length; i++) {
      const A = cart(t.points[chain[i]!]!);
      const B = cart(t.points[chain[i + 1]!]!);
      segments.push([chain[i]!, chain[i + 1]!]);
      pts.push(Array.from({ length: n }, (_, j) => add(A, scale(sub(B, A), j / (n - 1)))));
      length += norm(sub(B, A));
    }
  return { segments, points: pts, length };
}

const kpath: SceneDef = {
  id: 'm07-kpath',
  title: 'The k-path VASPKIT writes to KPATH.in',
  badge: 'computed',
  sources: ['S-005', 'S-034', 'S-020', 'S-042', 'S-019'],
  params: [
    {
      kind: 'select',
      id: 'lattice',
      label: 'Crystal',
      physics: true,
      value: 'fcc',
      options: Object.entries(KPATHS).map(([value, t]) => ({ value, label: t.label })),
    },
    {
      kind: 'slider',
      id: 'density',
      label: 'Points per segment (KPATH.in line 2)',
      min: 5,
      max: 40,
      step: 1,
      value: 20,
      physics: true,
    },
    {
      kind: 'step',
      id: 'segments',
      label: 'Segments drawn',
      min: 1,
      max: 10,
      value: 10,
      interval: 0.6,
      physics: true,
    },
  ],
  build(p) {
    const id = String(p.lattice) in KPATHS ? String(p.lattice) : 'fcc';
    const t = KPATHS[id]!;
    const n = Number(p.density);
    const lm = lineModePoints(t, n);
    const shown = Math.min(lm.segments.length, Math.max(1, Number(p.segments)));
    const { layers } = brillouinLayers(t.lattice);
    const b = reciprocalLattice(t.lattice).map(v3) as unknown as [Vec3, Vec3, Vec3];
    const cart = (q: Vec3): Vec3 => add(add(scale(b[0], q[0]), scale(b[1], q[1])), scale(b[2], q[2]));
    for (let s = 0; s < shown; s++) {
      const pts = lm.points[s]!;
      layers.push(
        curve([pts[0]!, pts[pts.length - 1]!], 'accent', 'path', {
          name: s === 0 ? 'Path segments' : undefined,
          tube: 0.03,
        }),
      );
    }
    const dots = lm.points.slice(0, shown).flat();
    const bmax = Math.max(...b.map(norm));
    layers.push(points(dots, 'ink', bmax * 0.012, 'kpoints', { name: 'k-points written' }));
    const used = new Set(lm.segments.slice(0, shown).flat());
    const names = Object.keys(t.points);
    layers.push(
      atoms(
        names.map((k) => cart(t.points[k]!)),
        bmax * 0.03,
        names.map((k) => (used.has(k) ? 'pos' : 'muted')),
        'special',
        {
          name: 'High-symmetry points',
          labels: names.map((k) => `${say(k)} (${t.points[k]!.map((x) => fmt(x, 3)).join(', ')})`),
        },
      ),
    );
    layers.push(
      labels(
        names.map((k) => ({
          text: show(k),
          at: k === 'G' ? ([0, 0, -bmax * 0.08] as Vec3) : scale(cart(t.points[k]!), 1.1),
        })),
        'labels',
      ),
    );
    const pathText = t.path.map((c) => c.map(show).join('-')).join(' | ');
    const segText = lm.segments
      .slice(0, shown)
      .map(([a, c]) => `${say(a)} to ${say(c)}`)
      .join(', ');
    return {
      layers,
      lattice: [v3(t.lattice[0]), v3(t.lattice[1]), v3(t.lattice[2])],
      ortho: true,
      camera: 'iso',
      axes: ['kx (1/A)', 'ky (1/A)', 'kz (1/A)'],
      describe:
        `${t.label}: the first Brillouin zone with the standard band path (Setyawan-Curtarolo) that KPATH.in holds for a band run. ` +
        `${shown} of ${lm.segments.length} segments drawn (${segText}), ${n} points each, ${shown * n} k-points so far; the whole path is ${fmt(lm.length, 2)} 1/Angstrom long. ` +
        `Orange spheres are the high-symmetry points the drawn segments use.`,
      readouts: [
        { label: 'Path', value: pathText },
        { label: 'Segments', value: `${shown} of ${lm.segments.length}` },
        { label: 'k-points', value: `${lm.segments.length * n} in the file` },
        { label: 'Path length', value: `${fmt(lm.length, 2)} 1/A` },
      ],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [parallel.id]: parallel,
  [oszicar.id]: oszicar,
  [restarts.id]: restarts,
  [workflow.id]: workflow,
  [kpath.id]: kpath,
};
