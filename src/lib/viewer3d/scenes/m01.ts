// Module 1 (why DFT) scenes: from a crystal block to the electrons around one atom, the cost ladder of methods as a 3D
// chart, what DFT can and cannot say about one crystal, and the route of a first project laid out as stations.
// @source S-036 (rock-salt and perovskite structures), S-048 and S-049 (formal cost scaling, via physics/scaling.ts)
// @source S-042 (the author's five-step protocol), S-005 (cubic k-path Gamma-X-M-Gamma-R-X|M-R), S-007 and S-019 (k-mesh,
// KSPACING as |b| / N)
import { reciprocalLattice } from '../../crystal/lattice';
import { meshPoints } from '../../crystal/kmesh';
import type { Mat3, Structure } from '../../crystal/types';
import { covalentRadius } from '../../crystal/covalent';
import { METHODS, log10RelativeCost, type MethodId } from '../../physics/scaling';
import { lookupStructure } from '../../scene/library';
import {
  arrows,
  atoms,
  brillouinLayers,
  cellEdges,
  crystalLayers,
  curve,
  fmt,
  gridIsosurfaceLayer,
  labels,
  lines,
  points,
  quadLayer,
  sliceLayer,
} from '../kit';
import { add, norm, scale, sub } from '../math';
import type { AtomsLayer, Color, Layer, MeshLayer, SceneDef, Vec3 } from '../types';

const ROCKSALT = lookupStructure('rocksalt')!;
const PEROVSKITE = lookupStructure('perovskite')!;
const GRAPHITE = lookupStructure('graphite')!;
const A_NACL = ROCKSALT.lattice[0][0];

const v3 = (p: readonly number[]): Vec3 => [p[0]!, p[1]!, p[2]!];
const rows = (m: Mat3): [Vec3, Vec3, Vec3] => [v3(m[0]), v3(m[1]), v3(m[2])];

function withLattice(s: Structure, m: Mat3): Structure {
  return { ...s, lattice: m };
}

// ---------------------------------------------------------------------------------------------------------------------
// An illustrative electron cloud: each atom carries an atom-like cloud exp(-r / r_s), r_s a fixed share of its covalent
// radius, and the clouds are simply added (no bonding, no charge transfer). It shows where electrons sit, not how much.

const CLOUD_SHARE = 0.35;
const cloudGrids = new Map<
  string,
  { values: Float64Array; grid: [number, number, number]; lo: Vec3; hi: Vec3 }
>();

function cloudGrid(
  key: string,
  centres: { at: Vec3; rs: number }[],
  lo: Vec3,
  hi: Vec3,
  n: number,
): { values: Float64Array; grid: [number, number, number]; lo: Vec3; hi: Vec3 } {
  const gk = `${key}|${n}`;
  const hit = cloudGrids.get(gk);
  if (hit) return hit;
  const grid: [number, number, number] = [n, n, n];
  const values = new Float64Array(n * n * n);
  const h = [0, 1, 2].map((k) => (hi[k]! - lo[k]!) / (n - 1));
  const cut = 3.2;
  for (const c of centres) {
    const reach = c.rs * 9; // exp(-9) is far below any surface level shown
    const i0 = [0, 1, 2].map((k) => Math.max(0, Math.floor((c.at[k]! - reach - lo[k]!) / h[k]!)));
    const i1 = [0, 1, 2].map((k) => Math.min(n - 1, Math.ceil((c.at[k]! + reach - lo[k]!) / h[k]!)));
    for (let k = i0[2]!; k <= i1[2]!; k++)
      for (let j = i0[1]!; j <= i1[1]!; j++)
        for (let i = i0[0]!; i <= i1[0]!; i++) {
          const dx = lo[0] + i * h[0]! - c.at[0];
          const dy = lo[1] + j * h[1]! - c.at[1];
          const dz = lo[2] + k * h[2]! - c.at[2];
          const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (r < cut) values[i + n * (j + n * k)] += Math.exp(-r / c.rs);
        }
  }
  const out = { values, grid, lo, hi };
  if (cloudGrids.size > 16) cloudGrids.clear();
  cloudGrids.set(gk, out);
  return out;
}

/** Cloud centres: every atom of the structure and its periodic images that reach into the box [lo, hi]. */
function cloudCentres(s: Structure, lo: Vec3, hi: Vec3): { at: Vec3; rs: number }[] {
  const L = rows(s.lattice);
  const out: { at: Vec3; rs: number }[] = [];
  for (let a = -1; a <= 2; a++)
    for (let b = -1; b <= 2; b++)
      for (let c = -1; c <= 2; c++)
        s.frac.forEach((f, i) => {
          const at = add(add(scale(L[0], f[0] + a), scale(L[1], f[1] + b)), scale(L[2], f[2] + c));
          const rs = CLOUD_SHARE * covalentRadius(s.species[i]!).radius;
          if ([0, 1, 2].every((k) => at[k]! > lo[k]! - 3 && at[k]! < hi[k]! + 3)) out.push({ at, rs });
        });
  return out;
}

const cloudMeshes = new Map<string, MeshLayer>();

function cloudLayer(
  key: string,
  s: Structure,
  lo: Vec3,
  hi: Vec3,
  n: number,
  level: number,
  group = 'density',
) {
  const mk = `${key}|${n}|${level.toFixed(3)}|${group}`;
  const hit = cloudMeshes.get(mk);
  if (hit) return hit;
  const g = cloudGrid(key, cloudCentres(s, lo, hi), lo, hi, n);
  const h = [0, 1, 2].map((k) => (hi[k]! - lo[k]!) / (n - 1));
  const mesh = gridIsosurfaceLayer(
    g.values,
    g.grid,
    (q) => [lo[0] + q[0] * h[0]!, lo[1] + q[1] * h[1]!, lo[2] + q[2] * h[2]!],
    level,
    { group, name: 'Electron cloud (illustrative)', color: 'accent', opacity: 0.45 },
  );
  if (cloudMeshes.size > 48) cloudMeshes.clear();
  cloudMeshes.set(mk, mesh);
  return mesh;
}

// ---------------------------------------------------------------------------------------------------------------------
// Why simulate materials: three scales, and two lenses (what an experiment sees, what DFT computes).

const scales: SceneDef = {
  id: 'm01-scales',
  title: 'From a crystal to the electrons around one atom',
  badge: 'illustrative',
  sources: ['S-036', 'S-048'],
  params: [
    {
      kind: 'select',
      id: 'scale',
      label: 'Scale',
      value: 'block',
      physics: true,
      options: [
        { value: 'block', label: 'A block of crystal (3 by 3 by 3 cells)' },
        { value: 'cell', label: 'One unit cell' },
        { value: 'atom', label: 'Around one atom' },
      ],
    },
    {
      kind: 'select',
      id: 'lens',
      label: 'Lens',
      value: 'experiment',
      physics: true,
      options: [
        { value: 'experiment', label: 'What an experiment sees' },
        { value: 'dft', label: 'What DFT computes' },
      ],
    },
    {
      kind: 'slider',
      id: 'level',
      label: 'Cloud surface level',
      min: 0.03,
      max: 0.6,
      step: 0.01,
      value: 0.15,
      digits: 2,
      physics: true,
    },
  ],
  build(p) {
    const scaleId = String(p.scale);
    const dft = p.lens === 'dft';
    const level = Number(p.level);
    const a = A_NACL;
    const lat = rows(ROCKSALT.lattice);
    const layers: Layer[] = [];
    let across = a;
    let count: number;
    let say: string;
    if (scaleId === 'block') {
      const n = 3;
      across = n * a;
      const { layers: cl, positions } = crystalLayers(ROCKSALT, {
        repeat: [n, n, n],
        boundary: true,
        bonds: false,
      });
      count = positions.length;
      if (!dft) {
        layers.push(...cl);
        // (200) planes: the stacking an X-ray or electron diffraction experiment measures, spacing a/2
        for (let k = 0; k <= 2 * n; k++)
          layers.push(
            quadLayer([0, 0, (k * a) / 2], [n * a, 0, 0], [0, n * a, 0], {
              group: 'planes',
              name: 'Lattice planes',
              color: 'muted',
              opacity: 0.12,
            }),
          );
        say = `A block of rock salt, ${n} by ${n} by ${n} cells (${fmt(across, 1)} A across, ${count} ions drawn). An experiment sees the ions as a regular stack of planes, here every a/2 along z, and the outer shape of the block.`;
      } else {
        // nuclei as small fixed dots; electrons computed in one cell
        layers.push(points(positions, 'ink', 0.12, 'nuclei', { name: 'Nuclei (held fixed)' }));
        layers.push({
          kind: 'lines',
          group: 'cell',
          name: 'One cell',
          segments: cellEdges(lat),
          color: 'accent',
        });
        layers.push(cloudLayer('cell', ROCKSALT, [0, 0, 0], [a, a, a], 28, level), {
          kind: 'lines',
          group: 'block',
          name: 'Block outline',
          segments: cellEdges([scale(lat[0], n), scale(lat[1], n), scale(lat[2], n)]),
          color: 'muted',
          dashed: true,
        });
        say = `The same block as DFT sees it: ${count} nuclei held fixed as dots, and the electron cloud worked out for one repeating cell (outlined), since every other cell is a copy of it.`;
      }
      layers.push(
        labels(
          [
            { text: `${fmt(across, 1)} A`, at: [across / 2, -1, -0.6] },
            { text: dft ? 'one cell computed' : 'planes every a/2', at: [-1.2, -1.2, dft ? a : a / 2] },
          ],
          'labels',
        ),
      );
    } else if (scaleId === 'cell') {
      const { layers: cl, positions } = crystalLayers(ROCKSALT, { boundary: true });
      count = positions.length;
      if (!dft) {
        layers.push(...cl);
        say = `One cubic cell of rock salt, ${fmt(a, 2)} A on a side, ${count} ions drawn with the copies on its faces. This repeating block is all a simulation needs to describe the whole crystal.`;
      } else {
        layers.push(points(positions, 'ink', 0.12, 'nuclei', { name: 'Nuclei (held fixed)' }));
        layers.push(cl.find((l) => l.group === 'cell')!);
        layers.push(cloudLayer('cell', ROCKSALT, [0, 0, 0], [a, a, a], 28, level));
        say = `One cell with the nuclei as fixed dots and an illustrative electron cloud drawn at ${fmt(level * 100, 0)} percent of a single atom's peak. Lower the level and the clouds join into one connected sea; that shared cloud is what DFT computes.`;
      }
      layers.push(labels([{ text: `a = ${fmt(a, 2)} A`, at: [a / 2, -0.8, -0.5] }], 'labels'));
    } else {
      // one Cl at the centre of the cell and its six Na neighbours
      const c: Vec3 = [a / 2, a / 2, a / 2];
      const nb: Vec3[] = [
        [0, a / 2, a / 2],
        [a, a / 2, a / 2],
        [a / 2, 0, a / 2],
        [a / 2, a, a / 2],
        [a / 2, a / 2, 0],
        [a / 2, a / 2, a],
      ];
      count = 7;
      across = 0.8 * a;
      const rNa = covalentRadius('Na').radius;
      const rCl = covalentRadius('Cl').radius;
      if (!dft) {
        layers.push(
          atoms([c], rCl * 0.45, 'c1', 'atoms', { name: 'Ions', labels: ['Cl'] }),
          atoms(nb, rNa * 0.45, 'c0', 'atoms', { labels: nb.map((_, i) => `Na ${i + 1}`) }),
          lines(
            nb.map((q) => [c, q] as [Vec3, Vec3]),
            'muted',
            'bonds',
            { name: 'Neighbours', tube: 0.06 },
          ),
        );
        say = `One Cl ion with its six Na neighbours at ${fmt(a / 2, 2)} A. At this scale an experiment gives positions and distances, not the electrons themselves.`;
      } else {
        const lo: Vec3 = [0.1 * a, 0.1 * a, 0.1 * a];
        const hi: Vec3 = [0.9 * a, 0.9 * a, 0.9 * a];
        layers.push(
          points([c, ...nb], 'ink', 0.1, 'nuclei', { name: 'Nuclei (held fixed)' }),
          cloudLayer('atom', ROCKSALT, lo, hi, 36, level),
        );
        const g = cloudGrid('atom', cloudCentres(ROCKSALT, lo, hi), lo, hi, 36);
        const peak = Math.max(...g.values);
        const n = 36;
        const h = (hi[0] - lo[0]) / (n - 1);
        layers.push(
          sliceLayer(
            (q) => {
              const i = Math.min(n - 1, Math.max(0, Math.round((q[0] - lo[0]) / h)));
              const k = Math.min(n - 1, Math.max(0, Math.round((q[2] - lo[2]) / h)));
              const j = Math.round((c[1] - lo[1]) / h);
              return g.values[i + n * (j + n * k)]! / peak;
            },
            [lo[0], c[1], lo[2]],
            [hi[0] - lo[0], 0, 0],
            [0, 0, hi[2] - lo[2]],
            48,
            { group: 'slice', name: 'Slice through the cloud', range: [0, 1], opacity: 0.8 },
          ),
        );
        say = `Zoomed in on one Cl ion: the nuclei are fixed dots and the cloud around them, cut by a coloured slice through the centre, is the kind of electron density DFT computes. Here it is an illustrative sum of atom-like clouds.`;
      }
      layers.push(labels([{ text: 'Cl', at: [c[0], c[1], c[2] + 0.9] }], 'labels'));
    }
    const describe = `${say}${dft ? '' : ' Switch the lens to see what DFT computes instead.'}`;
    return {
      layers,
      describe,
      lattice: lat,
      ortho: true,
      camera: 'iso',
      readouts: [
        { label: 'Scale', value: `${fmt(across, 1)} A across` },
        { label: 'Ions shown', value: String(count) },
        { label: 'Lens', value: dft ? 'what DFT computes' : 'what an experiment sees' },
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// The ladder of methods: relative cost (log10, from physics/scaling.ts) over system size and method, with a budget plane.

const X_PER_DECADE = 4; // size axis: log10 of the size multiple, 0 to 2
const Y_PER_RUNG = 1.3;
const Z_PER_DECADE = 0.5;
const MAX_DECADES = 16;
const LADDER: MethodId[] = ['force-field', 'dft', 'hf', 'mp2', 'ccsd', 'ccsdt', 'fci'];

const ladder: SceneDef = {
  id: 'm01-ladder',
  title: 'The ladder of methods as a cost landscape',
  badge: 'toy-model',
  sources: ['S-048', 'S-049'],
  banner:
    'Relative cost only: every prefactor is set equal, and the force-field and exact curves are qualitative shapes. Compare steepness, not heights.',
  params: [
    {
      kind: 'slider',
      id: 'size',
      label: 'System size (log10 of the multiple of the smallest)',
      min: 0,
      max: 2,
      step: 0.05,
      value: 1,
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'budget',
      label: 'Affordable cost (decades above the smallest run)',
      min: 1,
      max: 14,
      step: 0.5,
      value: 6,
      digits: 1,
      physics: true,
    },
    { kind: 'toggle', id: 'qualitative', label: 'Qualitative curves (force field, exact)', value: true },
  ],
  build(p) {
    const ls = Number(p.size);
    const size = 10 ** ls;
    const budget = Number(p.budget);
    const layers: Layer[] = [];
    const marks: Vec3[] = [];
    const markColor: Color[] = [];
    const over: [Vec3, Vec3][] = [];
    const affordable: string[] = [];
    const items: { text: string; at: Vec3 }[] = [];
    const methods = LADDER.map((id) => METHODS.find((m) => m.id === id)!);
    methods.forEach((m, rung) => {
      if (m.kind === 'qualitative' && !p.qualitative) return;
      const y = rung * Y_PER_RUNG;
      const pts: Vec3[] = [];
      for (let i = 0; i <= 120; i++) {
        const l = (2 * i) / 120;
        const dec = log10RelativeCost(m.id, 10 ** l);
        if (dec > MAX_DECADES) break;
        pts.push([X_PER_DECADE * l, y, Z_PER_DECADE * dec]);
      }
      const tone = `c${rung % 8}` as Color;
      if (m.kind === 'formal') layers.push(curve(pts, tone, 'curves', { name: 'Cost curves', tube: 0.06 }));
      else
        layers.push(
          lines(
            pts
              .slice(1)
              .map((q, i) => [pts[i]!, q] as [Vec3, Vec3])
              .filter((_, i) => i % 2 === 0),
            tone,
            'curves',
            { dashed: true },
          ),
        );
      const end = pts[pts.length - 1]!;
      items.push({ text: m.short, at: [end[0] + 0.3, y, end[2] + 0.3] });
      // qualitative curves are shapes only: no marker and no verdict, since no number is claimed for them
      if (m.kind === 'qualitative') return;
      const dec = log10RelativeCost(m.id, size);
      const z = Z_PER_DECADE * Math.min(dec, MAX_DECADES);
      marks.push([X_PER_DECADE * ls, y, z]);
      const ok = dec <= budget;
      markColor.push(ok ? 'accent' : 'muted');
      if (ok) affordable.push(m.short);
      else
        over.push([
          [X_PER_DECADE * ls, y, Z_PER_DECADE * budget],
          [X_PER_DECADE * ls, y, z],
        ]);
    });
    const yTop = (LADDER.length - 1) * Y_PER_RUNG;
    layers.push(
      atoms(marks, 0.16, markColor, 'markers', {
        name: 'Cost at this size',
        highlight: markColor.map((c, i) => (c === 'accent' ? i : -1)).filter((i) => i >= 0),
      }),
      quadLayer([0, -0.6, Z_PER_DECADE * budget], [2 * X_PER_DECADE, 0, 0], [0, yTop + 1.2, 0], {
        group: 'budget',
        name: 'Budget plane',
        color: 'accent',
        opacity: 0.18,
      }),
      quadLayer([X_PER_DECADE * ls, -0.6, 0], [0, yTop + 1.2, 0], [0, 0, Z_PER_DECADE * MAX_DECADES], {
        group: 'size',
        name: 'Chosen size',
        color: 'muted',
        opacity: 0.08,
      }),
    );
    if (over.length) layers.push(lines(over, 'ink', 'markers', { dashed: true }));
    layers.push(
      lines(
        [
          [
            [0, -0.6, 0],
            [2 * X_PER_DECADE + 0.5, -0.6, 0],
          ],
          [
            [0, -0.6, 0],
            [0, yTop + 0.8, 0],
          ],
          [
            [0, -0.6, 0],
            [0, -0.6, Z_PER_DECADE * MAX_DECADES],
          ],
        ],
        'muted',
        'axes',
        { name: 'Axes' },
      ),
      labels(
        [
          ...items,
          { text: 'size x1 to x100', at: [X_PER_DECADE, -1.4, 0] },
          { text: 'rung', at: [-0.8, yTop / 2, 0] },
          { text: 'cost (log10)', at: [-0.4, -0.8, Z_PER_DECADE * MAX_DECADES + 0.4] },
          {
            text: `budget 10^${fmt(budget, 1)}`,
            at: [2 * X_PER_DECADE + 0.4, yTop + 0.6, Z_PER_DECADE * budget],
          },
        ],
        'labels',
      ),
    );
    const dft = log10RelativeCost('dft', size);
    const cc = log10RelativeCost('ccsdt', size);
    const describe =
      `Relative cost of each method (rungs, front to back: ${methods.map((m) => m.short).join(', ')}) over system size, with cost ` +
      `on a log scale upward. At ${fmt(size, size < 10 ? 1 : 0)} times the smallest system DFT costs 10^${fmt(dft, 1)} times more and ` +
      `CCSD(T) 10^${fmt(cc, 1)} times more. Under a budget of 10^${fmt(budget, 1)}, the methods with a formal exponent still below the plane are: ` +
      `${affordable.length ? affordable.join(', ') : 'none'}` +
      (p.qualitative
        ? '. The dashed force-field and exact curves are shapes only and carry no marker.'
        : '.');
    return {
      layers,
      describe,
      camera: { eye: [16, -10, 9], up: [0, 0, 1] },
      readouts: [
        { label: 'Size', value: `${fmt(size, size < 10 ? 1 : 0)} x smallest` },
        { label: 'DFT cost', value: `10^${fmt(dft, 1)} x` },
        { label: 'CCSD(T) cost', value: `10^${fmt(cc, 1)} x` },
        { label: 'Affordable', value: affordable.length ? affordable.join(', ') : 'none' },
      ],
      axes: ['size (log10 of the multiple)', 'method (rung)', 'relative cost (log10)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// What DFT can and cannot tell you: one crystal, one probe at a time, each tagged with how far DFT can be trusted on it.

/**
 * Spin sign of a cation at Cartesian q in a rock-salt lattice of constant a, for the order of NiO (AFM-II): cations in
 * one (111) plane share a spin and the next plane is opposite. Cation (111) planes are x + y + z = m a, m whole.
 */
export function afmSign(q: Vec3, a: number): 1 | -1 {
  const m = Math.round((q[0] + q[1] + q[2]) / a);
  return m % 2 === 0 ? 1 : -1;
}

type Probe = 'forces' | 'density' | 'gap' | 'magnetism' | 'vdw' | 'phonons' | 'light';
const VERDICT: Record<Probe, string> = {
  forces: 'reliable: a ground-state property',
  density: 'reliable: the central quantity of DFT',
  gap: 'needs care: common functionals underestimate gaps',
  magnetism: 'needs care: DFT+U is often added',
  vdw: 'needs care: add a van der Waals correction',
  phonons: 'extra steps: finite displacements or perturbation theory',
  light: 'outside ground-state DFT: excited states',
};

const probes: SceneDef = {
  id: 'm01-probes',
  title: 'Probing one crystal with DFT',
  badge: 'illustrative',
  sources: ['S-011', 'S-012', 'S-014', 'S-025', 'S-027', 'S-028'],
  params: [
    {
      kind: 'select',
      id: 'probe',
      label: 'Question',
      value: 'forces',
      physics: true,
      options: [
        { value: 'forces', label: 'Forces on the atoms' },
        { value: 'density', label: 'Where the electrons are' },
        { value: 'gap', label: 'The band gap' },
        { value: 'magnetism', label: 'Magnetic order' },
        { value: 'vdw', label: 'Weak binding between layers' },
        { value: 'phonons', label: 'Vibrations (phonons)' },
        { value: 'light', label: 'Absorbing light' },
      ],
    },
    {
      kind: 'slider',
      id: 'shift',
      label: 'Push the centre atom (or open the layers)',
      min: 0,
      max: 0.8,
      step: 0.02,
      value: 0.4,
      unit: 'Angstrom',
      digits: 2,
      physics: true,
    },
    { kind: 'time', id: 'time', label: 'Vibration time', period: 1, value: 0.25 },
  ],
  build(p) {
    const probe = String(p.probe) as Probe;
    const shift = Number(p.shift);
    const a = A_NACL;
    const lat = rows(ROCKSALT.lattice);
    const layers: Layer[] = [];
    let say: string;
    const items: { text: string; at: Vec3 }[] = [];
    let latOut: [Vec3, Vec3, Vec3] = lat;
    if (probe === 'vdw') {
      // graphite: the layers held by weak forces, opened by the slider
      const g = rows(GRAPHITE.lattice);
      const c0 = norm(g[2]);
      const c = c0 + 2 * shift;
      const gl: Mat3 = [g[0], g[1], scale(g[2], c / c0)];
      const s = withLattice(GRAPHITE, gl);
      const { layers: cl } = crystalLayers(s, { repeat: [2, 2, 1], boundary: true });
      layers.push(...cl);
      const z1 = c / 4;
      const z2 = (3 * c) / 4;
      const sp: [Vec3, Vec3][] = [];
      for (const [x, y] of [
        [0.5, 0.5],
        [2, 1],
        [1, 2],
      ] as const) {
        const q = add(scale(gl[0], x), scale(gl[1], y));
        sp.push([
          [q[0], q[1], z1],
          [q[0], q[1], z2],
        ]);
      }
      layers.push(lines(sp, 'accent', 'probe', { name: 'Weak interlayer binding', dashed: true }));
      items.push({ text: VERDICT.vdw, at: [0, 0, c + 1] });
      latOut = rows(gl);
      say = `Graphite layers ${fmt(c / 2, 2)} A apart (opened by ${fmt(shift, 2)} A from the preset cell). The dashed lines stand for the weak van der Waals attraction between layers, which simple functionals miss.`;
    } else {
      const s = ROCKSALT;
      const { layers: cl, positions } = crystalLayers(s, { boundary: true });
      const centre: Vec3 = [a / 2, a / 2, a / 2];
      const ci = positions.findIndex((q) => norm(sub(q, centre)) < 1e-6);
      const atomsLayer = cl.find((l): l is AtomsLayer => l.kind === 'atoms')!;
      if (probe === 'forces' || probe === 'phonons') {
        const t = Number(p.time);
        const moved = positions.map((q, i): Vec3 => {
          if (probe === 'forces') return i === ci ? add(q, [shift, 0, 0]) : q;
          const sign = atomsLayer.labels![i]!.startsWith('Na') ? 1 : -1;
          return add(q, [0, 0, sign * 0.25 * Math.sin(2 * Math.PI * t)]);
        });
        atomsLayer.positions = moved;
        layers.push(
          atomsLayer,
          cl.find((l) => l.group === 'cell')!,
        );
        if (probe === 'forces') {
          atomsLayer.highlight = [ci];
          layers.push(
            arrows([moved[ci]!], [[-1.6 * shift - 0.2, 0, 0]], 'accent', 'probe', {
              name: 'Restoring force',
              thickness: 0.06,
            }),
            lines([[centre, moved[ci]!]], 'ink', 'probe', { dashed: true }),
          );
          items.push({ text: VERDICT.forces, at: [a / 2, a / 2, a + 1] });
          say = `The Cl at the cell centre is pushed ${fmt(shift, 2)} A along x (dashed line: where it was). DFT gives the force pulling it back, drawn as the arrow; forces like this drive every relaxation.`;
        } else {
          const z = 0.25 * Math.sin(2 * Math.PI * t);
          items.push({ text: VERDICT.phonons, at: [a / 2, a / 2, a + 1] });
          say = `A vibration: Na and Cl move against each other along z (now ${fmt(Math.abs(z), 2)} A from rest, drawn exaggerated). DFT gives vibrations, but through extra calculations on displaced atoms.`;
        }
      } else {
        layers.push(...cl);
        if (probe === 'density') {
          layers.push(cloudLayer('cell', s, [0, 0, 0], [a, a, a], 28, 0.15, 'probe'));
          items.push({ text: VERDICT.density, at: [a / 2, a / 2, a + 1] });
          say = `The electron cloud of the cell (an illustrative sum of atom-like clouds). DFT is built on this density and computes it reliably.`;
        } else if (probe === 'gap' || probe === 'light') {
          // two band slabs above the crystal: filled (valence) and empty (conduction)
          const z0 = a + 1.2;
          const zv = z0;
          const zc = z0 + 2.2;
          layers.push(
            quadLayer([0, 0, zv], [a, 0, 0], [0, a, 0], {
              group: 'probe',
              name: 'Filled band',
              color: 'neg',
              opacity: 0.4,
            }),
            quadLayer([0, 0, zc], [a, 0, 0], [0, a, 0], {
              group: 'probe',
              name: 'Empty band',
              color: 'pos',
              opacity: 0.25,
            }),
          );
          if (probe === 'gap') {
            layers.push(
              arrows([[a * 0.35, a / 2, zv]], [[0, 0, zc - zv]], 'ink', 'probe', {
                name: 'Gap from DFT',
                thickness: 0.03,
              }),
              lines(
                [
                  [
                    [a * 0.65, a / 2, zv],
                    [a * 0.65, a / 2, zc + 1.2],
                  ],
                ],
                'ink',
                'probe',
                { dashed: true },
              ),
            );
            items.push(
              { text: 'DFT gap', at: [a * 0.35 - 0.8, a / 2, (zv + zc) / 2] },
              { text: 'measured gap (often larger)', at: [a * 0.65 + 0.3, a / 2, zc + 1.4] },
              { text: VERDICT.gap, at: [a / 2, a / 2, zc + 2.4] },
            );
            say = `A filled band (blue) and an empty band (orange) above the crystal. The solid arrow is the gap a common functional gives; the dashed line reaches the typically larger measured gap.`;
          } else {
            const wave: Vec3[] = [];
            for (let i = 0; i <= 160; i++) {
              const u = i / 160;
              const base: Vec3 = [-4 + 4 * u + a * 0.2 * u, a / 2, zc + 3 - 3 * u];
              wave.push(add(base, [0, 0.35 * Math.sin(2 * Math.PI * 7 * u), 0]));
            }
            layers.push(
              curve(wave, 'accent', 'probe', { name: 'Light', tube: 0.04 }),
              lines(
                [
                  [
                    [a * 0.5, a / 2, zv],
                    [a * 0.5, a / 2, zc],
                  ],
                ],
                'ink',
                'probe',
                { dashed: true },
              ),
              atoms([[a * 0.5, a / 2, zc]], 0.15, 'ink', 'probe', { labels: ['excited electron'] }),
            );
            items.push({ text: VERDICT.light, at: [a / 2, a / 2, zc + 3.6] });
            say = `Light arriving from the upper left lifts an electron from the filled band to the empty one (dashed). That is an excited state, outside the ground-state theory; methods built on top of DFT are needed.`;
          }
        } else {
          // magnetism: spins on the cation sites, ferromagnetic (111) planes alternating, the order of NiO
          const from: Vec3[] = [];
          const vec: Vec3[] = [];
          const head: ('solid' | 'open')[] = [];
          const col: Color[] = [];
          positions.forEach((q, i) => {
            if (!atomsLayer.labels![i]!.startsWith('Na')) return;
            const up = afmSign(q, a) > 0;
            from.push(add(q, [0, 0, up ? -0.5 : 0.5]));
            vec.push([0, 0, up ? 1 : -1]);
            head.push(up ? 'solid' : 'open');
            col.push(up ? 'pos' : 'neg');
          });
          layers.push(arrows(from, vec, col, 'probe', { name: 'Spins', head, thickness: 0.06 }));
          items.push({ text: VERDICT.magnetism, at: [a / 2, a / 2, a + 1] });
          say = `Spins on the cation sites of the rock-salt lattice, up (solid head) and down (open head) in alternating (111) planes, the order of antiferromagnetic oxides such as NiO. DFT finds such orders, but for these oxides a correction such as DFT+U is often added.`;
        }
      }
    }
    layers.push(labels(items, 'labels'));
    return {
      layers,
      describe: `${say} Verdict: ${VERDICT[probe]}. The picture is illustrative: it shows the idea, not computed values.`,
      lattice: latOut,
      ortho: true,
      camera: 'iso',
      readouts: [{ label: 'Verdict', value: VERDICT[probe] }],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// The roadmap: the five steps of a first project (S-042) as stations on a rising path, each a small live scene of SrTiO3.

const STATIONS = [
  { id: 'relax', name: '1 Relax the structure', module: 'Module 7' },
  { id: 'scf', name: '2 SCF on a k-mesh', module: 'Module 7' },
  { id: 'bands', name: '3 Bands along a k-path', module: 'Module 9' },
  { id: 'elastic', name: '4 Elastic: strain the cell', module: 'Module 12' },
  { id: 'optics', name: '5 Optics: light in', module: 'Module 12' },
] as const;
const A_STO = PEROVSKITE.lattice[0][0];
const K_SCALE = 2.2; // reciprocal objects drawn 2.2 scene units per 1/Angstrom
const STRAIN_SHOWN = 0.1; // the elastic station shows a 10 percent strain so it is visible (real runs use about 1 percent)

// the cubic path of S-005 in fractions of b1, b2, b3
const CUB_POINTS: Record<string, Vec3> = {
  Gamma: [0, 0, 0],
  X: [0, 0.5, 0],
  M: [0.5, 0.5, 0],
  R: [0.5, 0.5, 0.5],
};
const CUB_PATH: string[][] = [
  ['Gamma', 'X', 'M', 'Gamma', 'R', 'X'],
  ['M', 'R'],
];

const roadmap: SceneDef = {
  id: 'm01-roadmap',
  title: 'The route of a first VASP project',
  badge: 'computed',
  sources: ['S-042', 'S-005', 'S-007', 'S-019', 'S-036'],
  params: [
    { kind: 'step', id: 'station', label: 'Station', min: 1, max: 5, value: 1, physics: true, interval: 1.2 },
    {
      kind: 'slider',
      id: 'a',
      label: 'Lattice constant of SrTiO3',
      min: 3.7,
      max: 4.1,
      step: 0.005,
      value: A_STO,
      unit: 'Angstrom',
      digits: 3,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'kmesh',
      label: 'k-mesh divisions',
      min: 2,
      max: 8,
      step: 1,
      value: 4,
      digits: 0,
      physics: true,
    },
  ],
  build(p) {
    const st = Math.min(STATIONS.length, Math.max(1, Math.round(Number(p.station)) || 1));
    const a = Number(p.a);
    const nk = Math.round(Number(p.kmesh));
    const lat: Mat3 = [
      [a, 0, 0],
      [0, a, 0],
      [0, 0, a],
    ];
    const sto = withLattice(PEROVSKITE, lat);
    const rec = rows(reciprocalLattice(lat));
    const bLen = norm(rec[0]);
    // stations on a rising arc, 9 units from the axis
    const centreOf = (i: number): Vec3 => {
      const th = (-70 + (140 * i) / (STATIONS.length - 1)) * (Math.PI / 180);
      return [9 * Math.sin(th), -9 * Math.cos(th) + 9, 1.8 * i];
    };
    const layers: Layer[] = [];
    const items: { text: string; at: Vec3 }[] = [];
    const path: Vec3[] = [];
    for (let i = 0; i <= 80; i++) {
      const u = (i / 80) * (STATIONS.length - 1);
      const k = Math.min(STATIONS.length - 2, Math.floor(u));
      const f = u - k;
      const p0 = centreOf(k);
      const p1 = centreOf(k + 1);
      path.push(add(add(scale(p0, 1 - f), scale(p1, f)), [0, 0, -2.6]));
    }
    layers.push(curve(path, 'muted', 'path', { name: 'Route', tube: 0.05 }));
    const cellOf = (i: number, m: Mat3 = lat): Layer[] => {
      const c = sub(centreOf(i), [a / 2, a / 2, a / 2]);
      const { layers: cl } = crystalLayers(withLattice(sto, m), { boundary: true });
      return cl.map((l) => shiftLayer(l, c, `station-${i + 1}`));
    };
    STATIONS.forEach((s, i) => {
      const c = centreOf(i);
      const done = i + 1 < st;
      const now = i + 1 === st;
      items.push({ text: s.name, at: add(c, [0, 0, -3.3]) });
      if (s.id === 'relax' || s.id === 'optics') layers.push(...cellOf(i));
      if (s.id === 'scf') {
        // the k-mesh in the zone of the cell (a cube in reciprocal space), drawn in place of the atoms
        const { layers: bz } = brillouinLayers(lat, { group: `station-${i + 1}`, faces: false });
        layers.push(...bz.map((l) => scaleLayer(l, K_SCALE, c)));
        const mesh = meshPoints([nk, nk, nk], 'gamma');
        const kp: Vec3[] = [];
        for (let q = 0; q < mesh.count; q++) {
          const f: Vec3 = [mesh.coords[3 * q]!, mesh.coords[3 * q + 1]!, mesh.coords[3 * q + 2]!];
          const k = add(add(scale(rec[0], f[0]), scale(rec[1], f[1])), scale(rec[2], f[2]));
          kp.push(add(c, scale(k, K_SCALE)));
        }
        layers.push(points(kp, 'accent', 0.07, `station-${i + 1}`, { name: 'k-points' }));
      }
      if (s.id === 'bands') {
        const { layers: bz } = brillouinLayers(lat, { group: `station-${i + 1}` });
        layers.push(...bz.map((l) => scaleLayer(l, K_SCALE, c)));
        const at = (lab: string) =>
          add(
            c,
            scale(
              add(
                add(scale(rec[0], CUB_POINTS[lab]![0]), scale(rec[1], CUB_POINTS[lab]![1])),
                scale(rec[2], CUB_POINTS[lab]![2]),
              ),
              K_SCALE,
            ),
          );
        for (const seg of CUB_PATH)
          layers.push(curve(seg.map(at), 'accent', `station-${i + 1}`, { tube: 0.04 }));
        for (const lab of ['Gamma', 'X', 'M', 'R'])
          items.push({ text: lab === 'Gamma' ? 'G' : lab, at: add(at(lab), [0.2, 0.2, 0.3]) });
      }
      if (s.id === 'elastic') {
        const e = STRAIN_SHOWN;
        const strained: Mat3 = [
          [a * (1 + e), 0, 0],
          [0, a, 0],
          [0, 0, a * (1 - e / 3)],
        ];
        layers.push(...cellOf(i, strained));
        layers.push(
          lines(cellEdges(rows(lat), sub(c, [a / 2, a / 2, a / 2])), 'muted', `station-${i + 1}`, {
            dashed: true,
          }),
        );
      }
      if (s.id === 'optics') {
        const wave: Vec3[] = [];
        for (let q = 0; q <= 120; q++) {
          const u = q / 120;
          wave.push(add(c, [-4 + 8 * u, -3, 0.4 * Math.sin(2 * Math.PI * 6 * u)]));
        }
        layers.push(curve(wave, 'accent', `station-${i + 1}`, { name: 'Light' }));
      }
      // future stations are drawn faint: their lines dashed
      if (!done && !now)
        for (const l of layers) if (l.group === `station-${i + 1}` && l.kind === 'lines') l.dashed = true;
    });
    const here = centreOf(st - 1);
    layers.push(
      atoms(
        STATIONS.map((_, i) => add(centreOf(i), [0, 0, -2.6])),
        STATIONS.map((_, i) => (i + 1 === st ? 0.35 : 0.2)),
        STATIONS.map((_, i): Color => (i + 1 < st ? 'ink' : i + 1 === st ? 'accent' : 'muted')),
        'stops',
        {
          name: 'Stations',
          labels: STATIONS.map((s) => `${s.name} (${s.module})`),
          highlight: [st - 1],
        },
      ),
      labels(items, 'labels'),
    );
    const spacing = bLen / nk;
    const cur = STATIONS[st - 1]!;
    const detail: Record<string, string> = {
      relax: `the SrTiO3 cell, a = ${fmt(a, 3)} A, whose shape and size the relaxation settles`,
      scf: `a ${nk} by ${nk} by ${nk} Gamma-centred k-mesh (${nk ** 3} points, spacing ${fmt(spacing, 3)} per A) in the reciprocal cell beside the atoms`,
      bands: `the Brillouin zone, a cube ${fmt(bLen, 3)} per A wide (2 pi / a), with the path Gamma-X-M-Gamma-R-X and M-R`,
      elastic: `the cell stretched along x and squeezed along z (shown at ${fmt(STRAIN_SHOWN * 100, 0)} percent; real runs use about 1 percent) over the dashed unstrained cell`,
      optics: 'the cell with light passing through, the input to the optical properties',
    };
    const describe =
      `The five steps of a first project as stations on a rising path, done ones solid, later ones dashed. ` +
      `Station ${st} of 5, "${cur.name.slice(2)}" (${cur.module}), shows ${detail[cur.id]}. ` +
      `Change a and every station follows: the cell grows while the zone and the k-mesh shrink.`;
    return {
      layers,
      describe,
      camera: { eye: [here[0] + 2, -14, here[2] + 10], up: [0, 0, 1] },
      readouts: [
        { label: 'Station', value: `${st}: ${cur.name.slice(2)}` },
        { label: 'Lattice constant', value: `${fmt(a, 3)} A` },
        { label: 'Zone width 2 pi / a', value: `${fmt(bLen, 3)} 1/A` },
        { label: 'k spacing', value: `${fmt(spacing, 3)} 1/A (${nk} divisions)` },
      ],
    };
  },
};

/** A copy of a layer moved by d (and regrouped). */
function shiftLayer(l: Layer, d: Vec3, group: string): Layer {
  const mv = (q: Vec3): Vec3 => add(q, d);
  switch (l.kind) {
    case 'atoms':
    case 'points':
      return { ...l, group, positions: l.positions.map(mv) } as Layer;
    case 'lines':
      return { ...l, group, segments: l.segments.map(([x, y]) => [mv(x), mv(y)] as [Vec3, Vec3]) };
    case 'curve':
      return { ...l, group, points: l.points.map(mv) };
    case 'arrows':
      return { ...l, group, from: l.from.map(mv) };
    case 'labels':
      return { ...l, group, items: l.items.map((it) => ({ ...it, at: mv(it.at) })) };
    case 'mesh': {
      const positions = l.positions.map((x, i) => x + d[i % 3]!);
      return { ...l, group, positions } as MeshLayer;
    }
  }
}

/** A reciprocal-space layer scaled by s about the origin and moved to c. */
function scaleLayer(l: Layer, s: number, c: Vec3): Layer {
  const mv = (q: Vec3): Vec3 => add(scale(q, s), c);
  if (l.kind === 'lines')
    return { ...l, segments: l.segments.map(([x, y]) => [mv(x), mv(y)] as [Vec3, Vec3]) };
  if (l.kind === 'mesh') return { ...l, positions: l.positions.map((x, i) => x * s + c[i % 3]!) };
  return l;
}

export const scenes: Record<string, SceneDef> = {
  [scales.id]: scales,
  [ladder.id]: ladder,
  [probes.id]: probes,
  [roadmap.id]: roadmap,
};
