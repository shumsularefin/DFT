// Module 3 (many electrons) scenes: the two-electron wavefunction of a 1D model atom as a surface, the exponential
// wall as a surface over two counts, a 3D density of filled hydrogen shells, the density as the shadow of the
// wavefunction, and what an approximate wavefunction gets wrong.
// @source S-143 (soft-Coulomb 1D model atom), S-048 (many-electron problem, Slater determinants, Hartree-Fock)
// @source S-144 (LOBPCG for the exact two-electron state), S-047 and S-031 (hydrogen orbitals, Bohr radius)
import { binomial, formatBig, log10Big } from '../../physics/combinatorics';
import { radial, realYlm } from '../../physics/hydrogen';
import { applyHamiltonian2d } from '../../physics/solver2d';
import { softCoulomb } from '../../physics/twoelectron1d';
import { HARTREE_TO_EV } from '../../physics/units';
import {
  atoms,
  axesLayers,
  curve,
  fmt,
  gridIsosurfaceLayer,
  labels,
  lines,
  points,
  quadLayer,
  sliceLayer,
} from '../kit';
import type { Layer, Params, SceneDef, Vec3 } from '../types';
import {
  GRID,
  dashedPolyline,
  gridSurface,
  hartreeFock,
  kohnSham,
  model,
  windowIndices,
  windowOf,
} from './toy1d';

const MODEL_BANNER =
  'A one-dimensional model atom with softened Coulomb forces, not a real atom: two electrons on a line, solved exactly on a 0.5 bohr grid.';

const Z_PARAM = {
  kind: 'select' as const,
  id: 'Z',
  label: 'Nuclear charge',
  physics: true,
  value: '2',
  options: [
    { value: '2', label: 'Z = 2 (helium-like)' },
    { value: '1', label: 'Z = 1 (hydride-like, weakly bound)' },
  ],
};

const zOf = (p: Params): number => (p.Z === '1' ? 1 : 2);
const ha = (e: number, d = 3) => `${fmt(e, d)} Ha (${fmt(e * HARTREE_TO_EV, 1)} eV)`;

/** Maps the window |x| <= W onto [-5, 5] in the scene. */
const scaleOf = (W: number) => 5 / W;

/** Axes along the two electron coordinates, from the near corner of the square. */
function pairAxes(zlen: number, zlabel: string, dx = 0): Layer[] {
  return axesLayers([10.6, 10.6, zlen], ['x1 (electron 1)', 'x2 (electron 2)', zlabel], [-5 + dx, -5, 0]);
}

function maxAbs(a: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]!));
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// The many-electron problem: psi(x1, x2) and the repulsion ridge

const twoElectron: SceneDef = {
  id: 'm03-two-electron',
  title: 'Two electrons: one wavefunction over both positions',
  badge: 'toy-model',
  banner: MODEL_BANNER,
  sources: ['S-143', 'S-048', 'S-144'],
  params: [
    Z_PARAM,
    {
      kind: 'slider',
      id: 'lambda',
      label: 'Repulsion strength',
      min: 0,
      max: 2,
      step: 0.1,
      value: 1,
      digits: 1,
      physics: true,
    },
    { kind: 'toggle', id: 'landscape', label: 'Potential landscape below', value: true },
  ],
  build(p) {
    const Z = zOf(p);
    const lambda = Number(p.lambda);
    const s = model(Z, lambda);
    const s0 = model(Z, 0);
    const { x, M, psi } = s;
    const W = windowOf(Z);
    const S = scaleOf(W);
    const idx = windowIndices(x, W);
    const zs = 4 / maxAbs(s0.psi);
    const layers: Layer[] = [
      gridSurface(
        idx,
        x,
        (i, j) => psi[i + M * j]!,
        (a, b, v) => [a * S, b * S, v * zs],
        {
          group: 'wavefunction',
          name: 'Wavefunction psi(x1, x2)',
          colormap: 'sequential',
          range: [0, maxAbs(s0.psi)],
        },
      ),
    ];
    // the diagonal x1 = x2, where the two electrons sit at the same point
    const diag: Vec3[] = idx.map((i) => [x[i]! * S, x[i]! * S, psi[i + M * i]! * zs + 0.03]);
    layers.push(curve(diag, 'pos', 'diagonal', { name: 'Both electrons at one point', tube: 0.05 }));
    const labs: { text: string; at: Vec3 }[] = [{ text: 'x1 = x2', at: [5.4, 5.4, 0.4] }];
    if (p.landscape) {
      const sv = 2.5 / (2 * Z);
      const zb = -1.2 - sv * 2;
      const V = (i: number, j: number) => s.vext[i]! + s.vext[j]! + lambda * softCoulomb(x[i]! - x[j]!);
      layers.push(
        gridSurface(idx, x, V, (a, b, v) => [a * S, b * S, zb + sv * v], {
          group: 'landscape',
          name: 'Potential v(x1) + v(x2) + repulsion',
          colormap: 'diverging',
          opacity: 0.75,
        }),
      );
      if (lambda > 0) labs.push({ text: 'repulsion ridge', at: [-4.2, -4.2, zb + sv * lambda + 0.5] });
      labs.push({ text: 'nucleus well', at: [0, 0, zb + sv * (-2 * Z + lambda) - 0.5] });
    }
    layers.push(...pairAxes(5, 'psi'), labels(labs, 'labels'));
    // chance of meeting at the centre, against two independent electrons with the same density
    const c = (M - 1) / 2;
    const meet = (2 * psi[c + M * c]! ** 2) / (s.density[c]! ** 2 / 2);
    const unbound = s.energy > s.oneElectron[0];
    const describe =
      `The two-electron wavefunction psi(x1, x2) of a 1D model atom with Z = ${Z}, drawn as a surface over the ` +
      `positions of electron 1 and electron 2 (window plus or minus ${W} bohr). With repulsion strength ${fmt(lambda, 1)} ` +
      `the energy is ${fmt(s.energy, 3)} hartree, against ${fmt(s.nonInteractingEnergy, 3)} with no repulsion. ` +
      `Along the diagonal x1 = x2 the chance of finding both electrons at the centre is ${fmt(meet * 100, 0)} percent ` +
      `of what two independent electrons would give${p.landscape ? '; below, the potential landscape shows the repulsion as a ridge along the same diagonal' : ''}.` +
      (unbound
        ? ` With this much repulsion the second electron is not bound: the energy is above the ${fmt(s.oneElectron[0], 3)} hartree of one electron alone, so it leaves for the edge of the box.`
        : '');
    return {
      layers,
      describe,
      readouts: [
        { label: 'Energy', value: ha(s.energy) },
        { label: 'Without repulsion', value: ha(s.nonInteractingEnergy) },
        { label: 'Repulsion energy', value: ha(s.interaction) },
        { label: 'Meeting at the centre', value: `${fmt(meet * 100, 0)} % of independent` },
      ],
      axes: ['x1 (bohr, scaled)', 'x2 (bohr, scaled)', 'psi'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// The exponential wall: counts as surfaces over two variables

const TB_DOUBLES = Math.log10(1e12 / 8);

function bytesText(log10Bytes: number): string {
  const units: [string, number][] = [
    ['TB', 12],
    ['GB', 9],
    ['MB', 6],
    ['kB', 3],
  ];
  for (const [u, e] of units) if (log10Bytes >= e) return `${fmt(10 ** (log10Bytes - e), 1)} ${u}`;
  return `${fmt(10 ** log10Bytes, 0)} bytes`;
}

const wall: SceneDef = {
  id: 'm03-exponential-wall',
  title: 'The exponential wall as a surface',
  badge: 'computed',
  sources: ['S-048'],
  params: [
    {
      kind: 'select',
      id: 'count',
      label: 'What is counted',
      physics: true,
      value: 'determinants',
      options: [
        { value: 'determinants', label: 'Slater determinants C(M, N)' },
        { value: 'grid', label: 'Grid values g^(3N)' },
      ],
    },
    {
      kind: 'slider',
      id: 'electrons',
      label: 'Electrons N',
      min: 1,
      max: 20,
      step: 1,
      value: 10,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'orbitals',
      label: 'Spin orbitals M',
      min: 2,
      max: 60,
      step: 1,
      value: 40,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'points',
      label: 'Grid points per axis g',
      min: 2,
      max: 12,
      step: 1,
      value: 10,
      physics: true,
    },
  ],
  build(p) {
    const det = p.count !== 'grid';
    const N = Math.round(Number(p.electrons));
    const Mo = Math.max(N, Math.round(Number(p.orbitals)));
    const g = Math.round(Number(p.points));
    const NX = 20;
    const sx = 0.5; // scene units per electron
    // y: spin orbitals 2..60 or grid points 2..12, both onto 0..10
    const [ylo, yhi] = det ? [2, 60] : [2, 12];
    const sy = 10 / (yhi - ylo);
    const zs = det ? 0.5 : 0.13;
    const log10Count = (n: number, y: number): number =>
      det ? (n > y ? 0 : log10Big(binomial(y, n))) : 3 * n * Math.log10(y);
    const positions: number[] = [];
    const values: number[] = [];
    const ny = yhi - ylo;
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i < NX; i++) {
        const v = log10Count(i + 1, ylo + j);
        positions.push(i * sx, j * sy, v * zs);
        values.push(v);
      }
    const indices: number[] = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < NX - 1; i++) {
        const k = i + NX * j;
        indices.push(k, k + 1, k + NX + 1, k, k + NX + 1, k + NX);
      }
    const yv = det ? Mo : g;
    const here = log10Count(N, yv);
    const top: Vec3 = [(N - 1) * sx, (yv - ylo) * sy, here * zs];
    const layers: Layer[] = [
      {
        kind: 'mesh',
        group: 'surface',
        name: det ? 'log10 of the determinant count' : 'log10 of the grid values',
        positions,
        indices,
        values,
        colormap: 'sequential',
        color: 'accent',
        opacity: 0.9,
      },
      lines([[[top[0], top[1], 0], top]], 'pos', 'marker', { name: 'Your system', tube: 0.08 }),
      atoms([top], 0.22, 'pos', 'marker', { labels: [`N = ${N}`] }),
      quadLayer([0, 0, TB_DOUBLES * zs], [(NX - 1) * sx, 0, 0], [0, 10, 0], {
        group: 'memory',
        name: 'One terabyte of 8-byte numbers',
        color: 'neg',
        opacity: 0.25,
      }),
      ...axesLayers(
        [(NX - 1) * sx + 0.6, 10.6, 9],
        ['electrons N', det ? 'spin orbitals M' : 'grid points per axis g', 'log10 count'],
      ),
    ];
    const labs: { text: string; at: Vec3 }[] = [
      { text: '1 TB of numbers', at: [(NX - 1) * sx + 0.6, 10, TB_DOUBLES * zs] },
      { text: det ? `C(${Mo}, ${N})` : `${g}^${3 * N}`, at: [top[0], top[1], top[2] + 0.7] },
    ];
    if (!det) {
      // the grid one electron needs: g^3 points, drawn as a small cube of dots beside the surface
      const pts: Vec3[] = [];
      const side = 2.5;
      const o: Vec3 = [-4.5, 3.5, 0];
      for (let a = 0; a < g; a++)
        for (let b = 0; b < g; b++)
          for (let c = 0; c < g; c++)
            pts.push([o[0] + (side * a) / (g - 1), o[1] + (side * b) / (g - 1), o[2] + (side * c) / (g - 1)]);
      layers.push(points(pts, 'c2', 0.05, 'grid', { name: 'Grid of one electron' }));
      labs.push({ text: `one electron: ${g ** 3} values`, at: [o[0] + side / 2, o[1], side + 0.6] });
    }
    layers.push(labels(labs, 'labels'));
    const exact = det ? binomial(Mo, N) : BigInt(g) ** BigInt(3 * N);
    const logB = here + Math.log10(8);
    const over = logB - 12;
    const describe = det
      ? `A surface of log10 of the number of Slater determinants C(M, N) for N from 1 to 20 electrons and M from 2 to 60 ` +
        `spin orbitals. The marker at N = ${N}, M = ${Mo} stands at ${formatBig(exact)} determinants, ` +
        `${bytesText(logB)} at 8 bytes each, ${over >= 0 ? `${fmt(10 ** over, 1)} times` : `${fmt(10 ** over, 3)} of`} the ` +
        `one-terabyte plane. Each extra electron multiplies the count; it never just adds.`
      : `A surface of log10 of g^(3N), the values a grid of g points per axis needs for N electrons in 3D. ` +
        `The marker at N = ${N}, g = ${g} stands at ${formatBig(exact)} values, ${bytesText(logB)} at 8 bytes each; ` +
        `the small cube shows the ${g ** 3} grid points one electron needs.`;
    return {
      layers,
      describe,
      readouts: [
        { label: det ? 'Determinants' : 'Grid values', value: formatBig(exact) },
        { label: 'Memory at 8 bytes', value: bytesText(logB) },
        { label: 'log10 count', value: fmt(here, 2) },
      ],
      axes: ['electrons N', det ? 'spin orbitals M' : 'grid points per axis g', 'log10 count'],
      camera: 'iso',
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Electron density: non-interacting electrons filling hydrogen levels, a density in 3D

const SHELLS: { label: string; n: number; l: number; m: number }[] = [
  { label: '1s', n: 1, l: 0, m: 0 },
  { label: '2s', n: 2, l: 0, m: 0 },
  { label: '2p_z', n: 2, l: 1, m: 0 },
  { label: '2p_x', n: 2, l: 1, m: 1 },
  { label: '2p_y', n: 2, l: 1, m: -1 },
];

/** Occupations, two electrons per orbital in the order of SHELLS. */
export function occupations(electrons: number): number[] {
  return SHELLS.map((_, k) => Math.max(0, Math.min(2, electrons - 2 * k)));
}

const DENSITY_GRID = 40;
const orbitalGrids = new Map<number, Float64Array[]>();
const densityCache = new Map<number, { values: Float64Array; R: number; h: number; sum: number }>();

/** |psi_k|^2 of the five orbitals of SHELLS on the cube [-R, R]^3, computed once per box. */
function orbitalDensities(R: number): Float64Array[] {
  const hit = orbitalGrids.get(R);
  if (hit) return hit;
  const n = DENSITY_GRID;
  const h = (2 * R) / (n - 1);
  const out = SHELLS.map(() => new Float64Array(n * n * n));
  const y00 = realYlm(0, 0, 0, 0, 1);
  for (let k = 0; k < n; k++)
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = -R + i * h;
        const y = -R + j * h;
        const z = -R + k * h;
        const r = Math.hypot(x, y, z);
        const u: Vec3 = r > 1e-9 ? [x / r, y / r, z / r] : [0, 0, 1];
        const at = i + n * (j + n * k);
        out[0]![at] = (radial(1, 0, r) * y00) ** 2;
        out[1]![at] = (radial(2, 0, r) * y00) ** 2;
        const R21 = radial(2, 1, r);
        for (let q = 2; q < 5; q++) out[q]![at] = (R21 * realYlm(1, SHELLS[q]!.m, u[0], u[1], u[2])) ** 2;
      }
  orbitalGrids.set(R, out);
  return out;
}

/** Density n(r) = sum_k f_k |psi_k(r)|^2 of hydrogen orbitals on a cube grid, in electrons per a0^3. */
export function shellDensity(electrons: number): { values: Float64Array; R: number; h: number; sum: number } {
  const hit = densityCache.get(electrons);
  if (hit) return hit;
  const f = occupations(electrons);
  const R = electrons > 2 ? 14 : 5;
  const n = DENSITY_GRID;
  const h = (2 * R) / (n - 1);
  const orb = orbitalDensities(R);
  const values = new Float64Array(n * n * n);
  let sum = 0;
  for (let at = 0; at < values.length; at++) {
    let d = 0;
    for (let q = 0; q < 5; q++) if (f[q]) d += f[q]! * orb[q]![at]!;
    values[at] = d;
    sum += d;
  }
  const out = { values, R, h, sum: sum * h * h * h };
  densityCache.set(electrons, out);
  return out;
}

/** Exact density at the nucleus: only s orbitals reach it, |psi_1s(0)|^2 = 1/pi, |psi_2s(0)|^2 = 1/(8 pi) per electron. */
export const densityAtNucleus = (electrons: number): number => {
  const f = occupations(electrons);
  return f[0]! / Math.PI + f[1]! / (8 * Math.PI);
};

const density: SceneDef = {
  id: 'm03-density',
  title: 'Electron density of filled shells',
  badge: 'toy-model',
  banner:
    'Non-interacting electrons filling the hydrogen levels two at a time: a real atom has more nuclear charge and electron repulsion, which shrink and reshape these shells.',
  sources: ['S-047', 'S-031', 'S-048'],
  params: [
    {
      kind: 'slider',
      id: 'electrons',
      label: 'Electrons',
      min: 1,
      max: 10,
      step: 1,
      value: 4,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'level',
      label: 'Surface level (log10 of n in 1/a0^3)',
      min: -4,
      max: -1,
      step: 0.1,
      value: -2.5,
      digits: 1,
      physics: true,
    },
    { kind: 'toggle', id: 'slice', label: 'Colour slice', value: true },
    {
      kind: 'slider',
      id: 'cut',
      label: 'Slice height z',
      min: -6,
      max: 6,
      step: 0.25,
      value: 0,
      unit: 'a0',
      digits: 2,
    },
  ],
  build(p) {
    const e = Math.round(Number(p.electrons));
    const d = shellDensity(e);
    const { values, R } = d;
    const n = DENSITY_GRID;
    const lvl = 10 ** Number(p.level);
    const toScene = (g: Vec3): Vec3 => [-R + g[0] * d.h, -R + g[1] * d.h, -R + g[2] * d.h];
    const f = occupations(e);
    const config = SHELLS.map((s, k) => (f[k] ? `${s.label.replace('_', '')}${f[k] === 1 ? '1' : '2'}` : ''))
      .filter(Boolean)
      .join(' ');
    const layers: Layer[] = [
      gridIsosurfaceLayer(values, [n, n, n], toScene, lvl, {
        group: 'isosurface',
        name: 'Density surface',
        color: 'accent',
        opacity: 0.45,
      }),
      atoms([[0, 0, 0]], 0.25, 'ink', 'nucleus', { labels: ['nucleus'] }),
      ...axesLayers(R * 0.95, ['x (a0)', 'y (a0)', 'z (a0)']),
    ];
    const cut = Math.max(-R, Math.min(R, Number(p.cut)));
    const sample = (q: Vec3): number => {
      // trilinear interpolation of the grid
      const t = [(q[0] + R) / d.h, (q[1] + R) / d.h, (q[2] + R) / d.h];
      const i0 = t.map((v) => Math.max(0, Math.min(n - 2, Math.floor(v))));
      const fr = t.map((v, k) => Math.max(0, Math.min(1, v - i0[k]!)));
      let s = 0;
      for (let a = 0; a < 2; a++)
        for (let b = 0; b < 2; b++)
          for (let c = 0; c < 2; c++) {
            const w = (a ? fr[0]! : 1 - fr[0]!) * (b ? fr[1]! : 1 - fr[1]!) * (c ? fr[2]! : 1 - fr[2]!);
            s += w * values[i0[0]! + a + n * (i0[1]! + b + n * (i0[2]! + c))]!;
          }
      return s;
    };
    if (p.slice)
      layers.push(
        sliceLayer(
          (q) => Math.log10(Math.max(sample(q), 1e-6)),
          [-R, -R, cut],
          [2 * R, 0, 0],
          [0, 2 * R, 0],
          60,
          { group: 'slice', name: 'Slice coloured by log10 n', range: [-6, 0], opacity: 0.9 },
        ),
      );
    layers.push(labels([{ text: `n = 10^${fmt(Number(p.level), 1)}`, at: [0, 0, R * 0.8] }], 'labels'));
    const n0 = densityAtNucleus(e);
    const describe =
      `The electron density of ${e} non-interacting electron${e === 1 ? '' : 's'} in the hydrogen levels (${config}), ` +
      `drawn as the surface where n = ${fmt(lvl, 4)} electrons per a0^3 inside a cube ${fmt(2 * R, 0)} a0 across. ` +
      `Summed on the grid it holds ${fmt(d.sum, 2)} electrons; at the nucleus n = ${fmt(n0, 3)} per a0^3` +
      `${f[2] && !f[3] ? '. The half-filled 2p_z makes the density longer along z' : ''}` +
      `${p.slice ? `. The slice at z = ${fmt(cut, 2)} a0 is coloured by log10 n` : ''}.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Configuration', value: config },
        { label: 'Electrons on the grid', value: fmt(d.sum, 2) },
        { label: 'n at the nucleus', value: `${fmt(n0, 3)} 1/a0^3` },
      ],
      axes: ['x (a0)', 'y (a0)', 'z (a0)'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// From wavefunction to density: the density is the shadow of |psi|^2 on the wall

const projection: SceneDef = {
  id: 'm03-projection',
  title: 'The density as the shadow of the wavefunction',
  badge: 'toy-model',
  banner: MODEL_BANNER,
  sources: ['S-143', 'S-048', 'S-144'],
  params: [
    Z_PARAM,
    {
      kind: 'slider',
      id: 'lambda',
      label: 'Repulsion strength',
      min: 0,
      max: 2,
      step: 0.1,
      value: 1,
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'sweep',
      label: 'Share of x2 added up',
      min: 0,
      max: 1,
      step: 0.02,
      value: 1,
      digits: 2,
      physics: true,
    },
    { kind: 'toggle', id: 'full', label: 'Full density for comparison', value: true },
  ],
  build(p) {
    const Z = zOf(p);
    const lambda = Number(p.lambda);
    const s = model(Z, lambda);
    const { x, M, psi, h } = s;
    const W = windowOf(Z);
    const S = scaleOf(W);
    const idx = windowIndices(x, W);
    const sweep = Number(p.sweep);
    const cut = -W + 2 * W * sweep;
    const p2 = (i: number, j: number) => psi[i + M * j]! ** 2;
    const ref = model(Z, 0);
    const zs = 4 / maxAbs(ref.psi.map((v) => v * v));
    const zn = 3.5 / maxAbs(ref.density);
    const partial = new Float64Array(M);
    for (let j = 0; j < M; j++) {
      // rows below the cut count fully, a row on the cut by half (the trapezoid rule at the moving edge)
      const w = sweep >= 1 || x[j]! < cut - 1e-9 ? 1 : Math.abs(x[j]! - cut) <= 1e-9 ? 0.5 : 0;
      if (!w) continue;
      for (let i = 0; i < M; i++) partial[i] = partial[i]! + 2 * h * w * p2(i, j);
    }
    let collected = 0;
    for (let i = 0; i < M; i++) collected += partial[i]! * h;
    const wallY = 5.6;
    const layers: Layer[] = [
      gridSurface(idx, x, p2, (a, b, v) => [a * S, b * S, v * zs], {
        group: 'probability',
        name: 'Probability |psi(x1, x2)|^2',
        colormap: 'sequential',
        colorBy: (i, j) => (x[j]! <= cut + 1e-9 || sweep >= 1 ? p2(i, j) : 0),
        opacity: 0.9,
      }),
      quadLayer([-5, wallY, 0], [10, 0, 0], [0, 0, 4.2], {
        group: 'wall',
        name: 'Wall: the density n(x1)',
        color: 'muted',
        opacity: 0.12,
      }),
      curve(
        idx.map((i) => [x[i]! * S, wallY, partial[i]! * zn]),
        'pos',
        'density',
        { name: 'Density collected so far', tube: 0.05 },
      ),
    ];
    if (sweep < 1) {
      const cs = cut * S;
      layers.push(
        quadLayer([-5, cs, 0], [10, 0, 0], [0, 0, 4.2], {
          group: 'cut',
          name: 'Cut at x2',
          color: 'accent',
          opacity: 0.18,
        }),
      );
      let jc = 0;
      for (let j = 0; j < M; j++) if (Math.abs(x[j]! - cut) < Math.abs(x[jc]! - cut)) jc = j;
      layers.push(
        curve(
          idx.map((i) => [x[i]! * S, x[jc]! * S, p2(i, jc) * zs + 0.03]),
          'accent',
          'cut',
          { tube: 0.04 },
        ),
      );
    }
    if (p.full)
      layers.push(
        dashedPolyline(
          idx.map((i) => [x[i]! * S, wallY, s.density[i]! * zn]),
          'ink',
          'full',
          'Full density n(x)',
        ),
      );
    layers.push(
      ...pairAxes(4.5, '|psi|^2'),
      labels(
        [
          { text: 'n(x1) on the wall', at: [0, wallY, 4.4] },
          ...(sweep < 1 ? [{ text: `x2 = ${fmt(cut, 1)} bohr`, at: [5.4, cut * S, 1.5] as Vec3 }] : []),
        ],
        'labels',
      ),
    );
    const c = (M - 1) / 2;
    const describe =
      `The probability |psi(x1, x2)|^2 of the two-electron model atom (Z = ${Z}, repulsion ${fmt(lambda, 1)}) as a surface. ` +
      (sweep < 1
        ? `Adding it up along x2 from the far edge to x2 = ${fmt(cut, 1)} bohr and doubling (two electrons) has collected ` +
          `${fmt(collected, 2)} of the 2 electrons on the wall so far.`
        : `Added up along every x2 and doubled, it casts the density n(x1) on the back wall: ${fmt(collected, 3)} electrons, ` +
          `with n = ${fmt(s.density[c]!, 3)} per bohr at the centre.`) +
      ` A function of two positions becomes a function of one.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Electrons collected', value: `${fmt(collected, 3)} of 2` },
        { label: 'Cut at x2', value: sweep < 1 ? `${fmt(cut, 1)} bohr` : 'all of x2' },
        { label: 'n at the centre', value: `${fmt(s.density[c]!, 3)} 1/bohr` },
      ],
      axes: ['x1 (bohr, scaled)', 'x2 (bohr, scaled)', '|psi|^2'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// What we still have to approximate: an approximate wavefunction against the exact one

/** Energy <psi|H|psi> (h^2 sum) of a grid-normalised two-electron function under the full model Hamiltonian. */
export function modelEnergy(Z: number, psiA: Float64Array): number {
  const s = model(Z, 1);
  const { x, M, h } = s;
  const V = new Float64Array(M * M);
  for (let j = 0; j < M; j++)
    for (let i = 0; i < M; i++) V[i + M * j] = s.vext[i]! + s.vext[j]! + softCoulomb(x[i]! - x[j]!);
  const Hp = applyHamiltonian2d({ nx: M, ny: M, hx: h, hy: h }, 0.5, V, psiA, new Float64Array(M * M));
  let e = 0;
  let nn = 0;
  for (let k = 0; k < M * M; k++) {
    e += psiA[k]! * Hp[k]!;
    nn += psiA[k]! ** 2;
  }
  return e / nn;
}

/** Product phi(x1) phi(x2) of a doubly occupied orbital phi = sqrt(n / 2). */
export function productState(n: ArrayLike<number>, M: number): Float64Array {
  const phi = Array.from({ length: M }, (_, i) => Math.sqrt(Math.max(0, n[i]!) / 2));
  const out = new Float64Array(M * M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) out[i + M * j] = phi[i]! * phi[j]!;
  return out;
}

const approxCache = new Map<string, { psiA: Float64Array; nA: Float64Array; E: number }>();

function approximation(Z: number, kind: string): { psiA: Float64Array; nA: Float64Array; E: number } {
  const key = `${Z}|${kind}`;
  const hit = approxCache.get(key);
  if (hit) return hit;
  const M = GRID.M;
  const nA = kind === 'hartree-fock' ? hartreeFock(Z).density : model(Z, 0).density;
  const psiA = productState(nA, M);
  const out = { psiA, nA, E: modelEnergy(Z, psiA) };
  approxCache.set(key, out);
  return out;
}

const approximations: SceneDef = {
  id: 'm03-approximations',
  title: 'Exact and approximate wavefunctions',
  badge: 'toy-model',
  banner: MODEL_BANNER,
  sources: ['S-143', 'S-048', 'S-144', 'S-012', 'S-145'],
  params: [
    Z_PARAM,
    {
      kind: 'select',
      id: 'approx',
      label: 'Approximation',
      physics: true,
      value: 'hartree-fock',
      options: [
        { value: 'independent', label: 'Independent electrons (repulsion ignored)' },
        { value: 'hartree-fock', label: 'Hartree-Fock (one shared orbital, no correlation)' },
      ],
    },
    { kind: 'toggle', id: 'wire', label: 'Approximate surface as a wire mesh', value: true },
  ],
  build(p) {
    const Z = zOf(p);
    const s = model(Z, 1);
    const { x, M, psi } = s;
    const a = approximation(Z, String(p.approx));
    const W = windowOf(Z);
    const S = scaleOf(W);
    const idx = windowIndices(x, W);
    const zs = 4 / maxAbs(psi);
    const diffMax = maxAbs(psi.map((v, k) => v - a.psiA[k]!));
    const layers: Layer[] = [
      gridSurface(
        idx,
        x,
        (i, j) => psi[i + M * j]!,
        (u, v, w) => [u * S, v * S, w * zs],
        {
          group: 'exact',
          name: 'Exact psi, coloured by exact minus approximate',
          colormap: 'diverging',
          colorBy: (i, j) => psi[i + M * j]! - a.psiA[i + M * j]!,
          range: [-diffMax, diffMax],
        },
      ),
    ];
    if (p.wire)
      layers.push(
        gridSurface(
          idx,
          x,
          (i, j) => a.psiA[i + M * j]!,
          (u, v, w) => [u * S, v * S, w * zs],
          {
            group: 'approximate',
            name: 'Approximate psi',
            color: 'muted',
            wireframe: true,
          },
        ),
      );
    const wallY = 5.6;
    const zn = 3.5 / maxAbs(s.density);
    layers.push(
      curve(
        idx.map((i) => [x[i]! * S, wallY, s.density[i]! * zn]),
        'pos',
        'densities',
        { name: 'Exact density (solid) and approximate (dashed)', tube: 0.05 },
      ),
      dashedPolyline(
        idx.map((i) => [x[i]! * S, wallY, a.nA[i]! * zn]),
        'neg',
        'densities',
      ),
      ...pairAxes(4.5, 'psi'),
      labels(
        [
          { text: 'densities on the wall', at: [0, wallY, 4] },
          { text: 'orange: exact above', at: [-5, -5.6, 0.3] },
        ],
        'labels',
      ),
    );
    let dn = 0;
    for (let i = 0; i < M; i++) dn += Math.abs(s.density[i]! - a.nA[i]!) * s.h;
    const k = kohnSham(Z);
    const err = a.E - s.energy;
    const name = p.approx === 'hartree-fock' ? 'Hartree-Fock' : 'independent electrons';
    const describe =
      `The exact two-electron wavefunction of the model atom (Z = ${Z}) as a surface, coloured orange where it is higher ` +
      `and blue where it is lower than the ${name} wavefunction${p.wire ? ', drawn as a wire mesh' : ''}. ` +
      `The approximate state has an energy ${fmt(err, 4)} hartree above the exact ${fmt(s.energy, 3)}, and its density ` +
      `misses by ${fmt(dn, 3)} electrons in total (dashed curve on the wall). Of the exact energy, ${fmt(k.Exc, 3)} hartree is ` +
      `exchange and correlation, the one piece Kohn-Sham DFT has to approximate.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Energy error', value: ha(err, 4) },
        { label: 'Density error', value: `${fmt(dn, 3)} electrons` },
        { label: 'Exact E_xc of the model', value: ha(k.Exc) },
      ],
      axes: ['x1 (bohr, scaled)', 'x2 (bohr, scaled)', 'psi'],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [twoElectron.id]: twoElectron,
  [wall.id]: wall,
  [density.id]: density,
  [projection.id]: projection,
  [approximations.id]: approximations,
};
