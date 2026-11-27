// Module 7, new topic (M16): performance and parallelisation. The wavefunction work of one electronic step drawn as a
// block of bands x k-points x plane waves, cut into the pieces each MPI rank holds. Plain data, no three.js.
// @source S-041 (KPAR, NCORE, NPAR and what each level costs), S-019 (NBANDS rounded up), S-165 (Amdahl's law)
import { splitWork, toySpeedup, type WorkInput } from '../../physics/workSplit';
import { axesLayers, fmt, labels, lines } from '../kit';
import type { Color, Layer, SceneDef, Vec3 } from '../types';

/** Ranks per node in the toy machine. */
export const CORES_PER_NODE = 16;

/** Sizes of three runs, chosen to show the three regimes; illustrative inputs, not measured systems. */
export const PERF_SYSTEMS: Record<
  string,
  { label: string; npw: number; nbands: number; nk: number; nspin: number }
> = {
  page: {
    label: 'Example on this page (20 000 plane waves, 500 bands, 10 k-points, 2 spins)',
    npw: 20000,
    nbands: 500,
    nk: 10,
    nspin: 2,
  },
  bulk: {
    label: 'Small cell, dense mesh (1 500 plane waves, 32 bands, 56 k-points)',
    npw: 1500,
    nbands: 32,
    nk: 56,
    nspin: 1,
  },
  supercell: {
    label: 'Large supercell, one k-point (120 000 plane waves, 1 600 bands)',
    npw: 120000,
    nbands: 1600,
    nk: 1,
    nspin: 1,
  },
};

/** Size of the drawn work block: bands along x, k-points along y, plane waves along z (scene units). */
const BX = 8;
const BY = 6;
const BZ = 4;
const GAP = 0.08;

export function workInput(p: Record<string, unknown>): WorkInput {
  const sys = PERF_SYSTEMS[String(p.system)] ?? PERF_SYSTEMS.page!;
  return {
    npw: sys.npw,
    nbands: sys.nbands,
    nk: sys.nk,
    nspin: sys.nspin,
    ranks: Number(p.nodes) * CORES_PER_NODE,
    kpar: Number(p.kpar),
    ncore: Number(p.ncore),
  };
}

function bytes(b: number): string {
  if (b >= 1e9) return `${fmt(b / 1e9, 2)} GB`;
  if (b >= 1e6) return `${fmt(b / 1e6, 1)} MB`;
  return `${fmt(b / 1e3, 1)} kB`;
}

function pushBox(pos: number[], idx: number[], lo: Vec3, hi: Vec3): void {
  const o = pos.length / 3;
  for (const z of [lo[2], hi[2]])
    for (const y of [lo[1], hi[1]]) for (const x of [lo[0], hi[0]]) pos.push(x, y, z);
  for (const [a, b, c, d] of [
    [0, 1, 3, 2],
    [4, 6, 7, 5],
    [0, 4, 5, 1],
    [2, 3, 7, 6],
    [0, 2, 6, 4],
    [1, 5, 7, 3],
  ] as const)
    idx.push(o + a, o + b, o + c, o + a, o + c, o + d);
}

function boxEdges(lo: Vec3, hi: Vec3): [Vec3, Vec3][] {
  const c = (i: number): Vec3 => [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
  const out: [Vec3, Vec3][] = [];
  for (let i = 0; i < 8; i++) for (const b of [1, 2, 4]) if (!(i & b)) out.push([c(i), c(i | b)]);
  return out;
}

const parallel: SceneDef = {
  id: 'm07b-parallel',
  title: 'How the work is split over ranks',
  badge: 'toy-model',
  sources: ['S-041', 'S-019', 'S-165'],
  banner:
    'Toy model. The system sizes are illustrative, the machine has 16 ranks per node, memory counts only the wavefunctions, and the speed-up is the Amdahl law with a serial fraction you choose. Communication is not modelled, so the real benefit of NCORE does not show here.',
  params: [
    {
      kind: 'select',
      id: 'system',
      label: 'System',
      physics: true,
      value: 'page',
      options: Object.entries(PERF_SYSTEMS).map(([value, s]) => ({ value, label: s.label })),
    },
    {
      kind: 'slider',
      id: 'nodes',
      label: 'Nodes (16 ranks each)',
      min: 1,
      max: 8,
      step: 1,
      value: 1,
      digits: 0,
      physics: true,
    },
    {
      kind: 'select',
      id: 'kpar',
      label: 'KPAR',
      physics: true,
      value: '1',
      options: ['1', '2', '4', '8'].map((v) => ({ value: v, label: `KPAR = ${v}` })),
    },
    {
      kind: 'select',
      id: 'ncore',
      label: 'NCORE',
      physics: true,
      value: '4',
      options: ['1', '2', '4', '8', '16'].map((v) => ({ value: v, label: `NCORE = ${v}` })),
    },
    {
      kind: 'slider',
      id: 'serial',
      label: 'Serial fraction inside a k group',
      min: 0,
      max: 0.2,
      step: 0.01,
      value: 0.05,
      digits: 2,
      physics: true,
    },
  ],
  build(p) {
    const w = workInput(p);
    const L = splitWork(w);
    const s = Number(p.serial);
    const layers: Layer[] = [];
    const frame: [Vec3, Vec3] = [
      [0, 0, 0],
      [BX, BY, BZ],
    ];
    layers.push(lines(boxEdges(...frame), 'ink', 'work', { name: 'All the wavefunction work' }));
    const axes = axesLayers(
      [2, 2, 2],
      [`bands (${L.valid ? L.nbandsUsed : w.nbands})`, `k-points (${w.nk})`, `plane waves (${w.npw})`],
      [-0.8, -0.8, 0],
    );
    if (!L.valid) {
      layers.push(...axes);
      return {
        layers,
        describe: `The layout is not valid: ${L.problem}. ${w.ranks} ranks, KPAR = ${w.kpar}, NCORE = ${w.ncore}; choose values that divide evenly.`,
        camera: 'iso',
        axes: ['bands', 'k-points', 'plane waves'],
        readouts: [
          { label: 'Ranks', value: `${w.ranks}` },
          { label: 'Layout', value: `not valid: ${L.problem}` },
        ],
      };
    }
    // the real bands fill x up to nbands / nbandsUsed of the block; the rest is the padding VASP adds
    const dxBand = BX / L.npar;
    const dyK = BY / w.nk;
    const dzPw = BZ / w.ncore;
    const many = w.nk * L.npar * w.ncore > 600;
    L.kOfGroup.forEach((ks, g) => {
      if (!ks.length) return;
      const pos: number[] = [];
      const idx: number[] = [];
      for (const k of ks)
        for (let j = 0; j < L.npar; j++)
          for (let r = 0; r < w.ncore; r++) {
            const gx = Math.min(GAP, dxBand * 0.15);
            const gy = Math.min(GAP, dyK * 0.15);
            const gz = Math.min(GAP, dzPw * 0.15);
            pushBox(
              pos,
              idx,
              [j * dxBand + gx, k * dyK + gy, r * dzPw + gz],
              [(j + 1) * dxBand - gx, (k + 1) * dyK - gy, (r + 1) * dzPw - gz],
            );
          }
      layers.push({
        kind: 'mesh',
        group: 'blocks',
        name: `k group ${g + 1}: ${ks.length} k-points`,
        positions: pos,
        indices: idx,
        color: `c${g % 8}` as Color,
        opacity: 0.85,
        edges: !many,
      });
    });
    // rank 0: band group 1, plane-wave slice 1, every k-point of k group 1
    const r0: [Vec3, Vec3][] = [];
    for (const k of L.kOfGroup[0]!) r0.push(...boxEdges([0, k * dyK, 0], [dxBand, (k + 1) * dyK, dzPw]));
    layers.push(lines(r0, 'ink', 'rank0', { name: 'What rank 0 holds', tube: 0.03 }));
    if (L.nbandsUsed > w.nbands) {
      const x0 = (BX * w.nbands) / L.nbandsUsed;
      layers.push(
        lines(boxEdges([x0, 0, 0], [BX, BY, BZ]), 'neg', 'padding', {
          name: `Padded bands: ${L.nbandsUsed - w.nbands}`,
          dashed: true,
        }),
      );
    }
    const items = L.kOfGroup.flatMap((ks, g) =>
      ks.length ? [{ text: `k group ${g + 1}`, at: [BX + 0.5, (ks[0]! + 0.5) * dyK, BZ] as Vec3 }] : [],
    );
    items.push({ text: 'rank 0', at: [dxBand / 2, -0.5, dzPw + 0.3] });
    layers.push(labels(items, 'labels'), ...axes);

    const t = toySpeedup(w, L, s);
    const idle = L.idleGroups ? `, ${L.idleGroups} k group${L.idleGroups > 1 ? 's' : ''} idle` : '';
    const describe =
      `${w.ranks} ranks on ${Number(p.nodes)} node${Number(p.nodes) > 1 ? 's' : ''} split the work into ${w.kpar} k group${w.kpar > 1 ? 's' : ''} of ${L.groupRanks} ranks${idle}; each k group has ${L.npar} band group${L.npar > 1 ? 's' : ''} (NPAR) of NCORE = ${w.ncore} rank${w.ncore > 1 ? 's' : ''}, so every block is ${L.bandsPerGroup} band${L.bandsPerGroup > 1 ? 's' : ''} by ${L.pwPerRank} plane waves for one k-point. ` +
      `NBANDS ${L.nbandsUsed === w.nbands ? `stays at ${w.nbands}` : `is rounded up from ${w.nbands} to ${L.nbandsUsed}`}; wavefunctions take ${bytes(L.totalBytes)} in all and at most ${bytes(L.perRankBytes)} on one rank, with ${w.kpar} cop${w.kpar > 1 ? 'ies' : 'y'} of the shared arrays. ` +
      `Toy speed-up ${fmt(t.speedup, 1)} times, efficiency ${fmt(t.efficiency * 100, 0)} percent at serial fraction ${fmt(s, 2)}.`;
    return {
      layers,
      describe,
      camera: 'iso',
      axes: ['bands', 'k-points', 'plane waves'],
      readouts: [
        {
          label: 'Ranks: k groups x band groups x NCORE',
          value: `${w.ranks} = ${w.kpar} x ${L.npar} x ${w.ncore}`,
        },
        {
          label: 'NBANDS used',
          value: L.nbandsUsed === w.nbands ? `${w.nbands}` : `${L.nbandsUsed} (from ${w.nbands})`,
        },
        { label: 'Wavefunctions per rank (all)', value: `${bytes(L.perRankBytes)} (${bytes(L.totalBytes)})` },
        {
          label: 'Toy speed-up, efficiency',
          value: `${fmt(t.speedup, 1)} x, ${fmt(t.efficiency * 100, 0)} %`,
        },
      ],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [parallel.id]: parallel,
};
