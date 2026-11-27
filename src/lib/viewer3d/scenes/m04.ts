// Module 4 (Kohn-Sham) scenes: a 2D potential landscape and the density it fixes (Hohenberg-Kohn), the interacting
// and the helper system side by side (Kohn-Sham), the exchange-correlation hole of the 1D model atom, and the SCF loop
// as a waterfall of densities and as a path through a space of densities.
// @source S-011 (Hohenberg-Kohn), S-012 (Kohn-Sham), S-143 (soft-Coulomb model), S-144 (LOBPCG)
// @source S-048 (Hartree-Fock self-consistency), S-049 (xc hole, mixing), S-145 (HOMO energy is minus the ionisation energy)
import { runScf, type ScfResult } from '../../physics/scf1d';
import { HARTREE_TO_EV } from '../../physics/units';
import { lowestState2d, potentialFromDensity2d, type Grid2D } from '../../physics/solver2d';
import { nonInteractingDensity, xcHole } from '../../physics/twoelectron1d';
import { atoms, axesLayers, curve, fmt, labels, lines, points } from '../kit';
import type { Layer, MeshLayer, Params, SceneDef, Vec3 } from '../types';
import { dashedPolyline, gridSurface, kohnSham, model, windowIndices, windowOf } from './model1d';

const MODEL_BANNER =
  'A one-dimensional model atom with softened Coulomb forces, not a real atom: two electrons on a line, solved exactly on a 0.5 bohr grid.';
const SCF_BANNER =
  'A 1D two-electron model atom made self-consistent with Hartree-Fock and linear mixing, not a VASP run: the loop, the mixing and the ways it fails are the same idea.';

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

function maxAbs(a: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]!));
  return m;
}

// ---------------------------------------------------------------------------------------------------------------
// Hohenberg-Kohn: a 2D potential landscape, the density it produces, and the potential read back from the density

/** The landscape grid: (-6, 6) bohr in x and y with 47 interior points each (spacing 0.25 bohr). */
export const HK_GRID: Grid2D = { nx: 47, ny: 47, hx: 12 / 48, hy: 12 / 48 };
const hkX = Array.from({ length: HK_GRID.nx }, (_, i) => -6 + (i + 1) * HK_GRID.hx);

/** Two Gaussian wells (atomic units): a fixed one of depth 2 at (-2, -1), one of depth D at (p, 1), plus a constant. */
export function landscape(depth: number, pos: number, shift: number): Float64Array {
  const { nx } = HK_GRID;
  const V = new Float64Array(nx * nx);
  for (let j = 0; j < nx; j++)
    for (let i = 0; i < nx; i++) {
      const x = hkX[i]!;
      const y = hkX[j]!;
      V[i + nx * j] =
        -2 * Math.exp(-((x + 2) ** 2 + (y + 1) ** 2) / 2) -
        depth * Math.exp(-((x - pos) ** 2 + (y - 1) ** 2) / 2) +
        shift;
    }
  return V;
}

const hkCache = new Map<string, { V: Float64Array; n: Float64Array; E: number }>();
/** One electron in the landscape: ground-state energy and density n = psi^2 (sum n h^2 = 1). */
export function landscapeState(depth: number, pos: number, shift: number) {
  const key = `${depth.toFixed(3)}|${pos.toFixed(3)}|${shift.toFixed(3)}`;
  const hit = hkCache.get(key);
  if (hit) return hit;
  const V = landscape(depth, pos, shift);
  const sol = lowestState2d({ ...HK_GRID, c: 0.5, V, tol: 1e-9 });
  const out = { V, n: sol.state.map((v) => v * v), E: sol.energy };
  hkCache.set(key, out);
  return out;
}

const hohenbergKohn: SceneDef = {
  id: 'm04-hohenberg-kohn',
  title: 'A potential landscape and the density it fixes',
  badge: 'toy-model',
  banner:
    'One electron in a 2D landscape of two Gaussian wells, solved exactly on a grid: the smallest case of the theorem, which holds for any number of interacting electrons.',
  sources: ['S-011', 'S-047', 'S-144'],
  params: [
    {
      kind: 'slider',
      id: 'depth',
      label: 'Depth of the second well',
      min: 0,
      max: 3,
      step: 0.1,
      value: 2,
      unit: 'Ha',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'pos',
      label: 'Position of the second well',
      min: -1,
      max: 3,
      step: 0.1,
      value: 1,
      unit: 'bohr',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'shift',
      label: 'Constant added to the potential',
      min: -1,
      max: 1,
      step: 0.1,
      value: 0,
      unit: 'Ha',
      digits: 1,
      physics: true,
    },
    { kind: 'toggle', id: 'invert', label: 'Potential read back from the density', value: false },
  ],
  build(p) {
    const depth = Number(p.depth);
    const pos = Number(p.pos);
    const shift = Number(p.shift);
    const st = landscapeState(depth, pos, shift);
    const flat = landscapeState(depth, pos, 0);
    const ref = landscapeState(2, 1, 0);
    const { nx } = HK_GRID;
    const idx = Array.from({ length: nx }, (_, i) => i);
    const zn = 4 / maxAbs(ref.n);
    const zb = -1.2;
    const layers: Layer[] = [
      gridSurface(
        idx,
        hkX,
        (i, j) => st.V[i + nx * j]!,
        (x, y, v) => [x, y, zb + v],
        {
          group: 'potential',
          name: 'Potential v(x, y)',
          colormap: 'diverging',
          range: [-3.5, 3.5],
          opacity: 0.85,
        },
      ),
      gridSurface(
        idx,
        hkX,
        (i, j) => st.n[i + nx * j]!,
        (x, y, v) => [x, y, 1 + v * zn],
        {
          group: 'density',
          name: 'Density n(x, y)',
          colormap: 'sequential',
          range: [0, maxAbs(ref.n)],
        },
      ),
    ];
    let dShift = 0;
    for (let k = 0; k < st.n.length; k++) dShift = Math.max(dShift, Math.abs(st.n[k]! - flat.n[k]!));
    const nmax = maxAbs(st.n);
    let recErr = 0;
    if (p.invert) {
      // read the potential back from the density alone, the constant fixed by the energy (any constant would do)
      const vr = potentialFromDensity2d(HK_GRID, 0.5, st.n, st.E);
      const keep = (k: number) => st.n[k]! > 1e-4 * nmax;
      const positions: number[] = [];
      for (let j = 0; j < nx; j++)
        for (let i = 0; i < nx; i++) {
          const k = i + nx * j;
          if (keep(k)) recErr = Math.max(recErr, Math.abs(vr[k]! - st.V[k]!));
          positions.push(hkX[i]!, hkX[j]!, zb + (keep(k) ? vr[k]! : st.V[k]!) + 0.04);
        }
      const indices: number[] = [];
      for (let j = 0; j < nx - 1; j++)
        for (let i = 0; i < nx - 1; i++) {
          const k = i + nx * j;
          if ([k, k + 1, k + nx, k + nx + 1].every(keep))
            indices.push(k, k + 1, k + nx + 1, k, k + nx + 1, k + nx);
        }
      const mesh: MeshLayer = {
        kind: 'mesh',
        group: 'recovered',
        name: 'Potential read back from the density',
        positions,
        indices,
        color: 'ink',
        wireframe: true,
      };
      layers.push(mesh);
    }
    layers.push(
      ...axesLayers([12.6, 12.6, 5.5], ['x (bohr)', 'y (bohr)', 'v (Ha) and n'], [-6, -6, zb - 3.5]),
      atoms(
        [
          [-2, -1, zb - 2 + shift],
          [pos, 1, zb - depth + shift],
        ],
        0.18,
        ['c0', 'c1'],
        'wells',
        { labels: ['well 1 (depth 2 Ha)', `well 2 (depth ${fmt(depth, 1)} Ha)`] },
      ),
      labels(
        [
          { text: 'density n(x, y)', at: [-6, 6, 1 + 0.6 * 4] },
          { text: 'potential v(x, y)', at: [-6, 6, zb + 0.8] },
        ],
        'labels',
      ),
    );
    const share = (() => {
      // electrons on the side of the second well (x > 0)
      let s = 0;
      for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) if (hkX[i]! > 0) s += st.n[i + nx * j]!;
      return s * HK_GRID.hx * HK_GRID.hy;
    })();
    const describe =
      `A 2D potential landscape with a well of depth 2 hartree at (-2, -1) bohr and a second of depth ${fmt(depth, 1)} at ` +
      `(${fmt(pos, 1)}, 1), shifted by ${fmt(shift, 1)} hartree, and above it the density of one electron in it. ` +
      `${fmt(share * 100, 0)} percent of the electron sits on the side of the second well; the energy is ${fmt(st.E, 3)} hartree. ` +
      (shift !== 0
        ? `Adding the constant moved the energy by exactly ${fmt(st.E - flat.E, 3)} hartree and changed the density by at most ${dShift.toExponential(1)}, that is, not at all. `
        : '') +
      (p.invert
        ? `The wire mesh is the potential read back from the density alone; where the density is not vanishingly small it matches to ${fmt(recErr, 6)} hartree.`
        : 'Change the wells and the density follows; one density belongs to one potential, up to a constant.');
    const readouts = [
      { label: 'Energy', value: ha(st.E) },
      { label: 'Share near well 2', value: `${fmt(share * 100, 0)} %` },
      { label: 'Density change from the constant', value: dShift.toExponential(1) },
    ];
    if (p.invert) readouts.push({ label: 'Read-back error', value: `${fmt(recErr, 6)} Ha` });
    return { layers, describe, readouts, axes: ['x (bohr)', 'y (bohr)', 'v and n'] };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// The Kohn-Sham idea: interacting electrons and helper electrons with the same density

const ksCache = new Map<string, { n: Float64Array; eps: number; v: Float64Array; phi: Float64Array }>();

/** Two independent electrons in v_ext + t (v_s - v_ext): the helper system on the way to the exact Kohn-Sham one. */
export function helperSystem(Z: number, t: number) {
  const key = `${Z}|${t.toFixed(3)}`;
  const hit = ksCache.get(key);
  if (hit) return hit;
  const s = model(Z, 1);
  const k = kohnSham(Z);
  const v = Float64Array.from(s.vext, (ve, i) => ve + t * (k.vs[i]! - ve));
  const r = nonInteractingDensity(v, s.h);
  const out = { n: r.density, eps: r.eps, v, phi: r.orbital };
  ksCache.set(key, out);
  return out;
}

const kohnShamScene: SceneDef = {
  id: 'm04-kohn-sham',
  title: 'Interacting electrons and their helper system',
  badge: 'toy-model',
  banner: MODEL_BANNER,
  sources: ['S-012', 'S-143', 'S-144', 'S-145', 'S-049'],
  params: [
    Z_PARAM,
    {
      kind: 'slider',
      id: 't',
      label: 'Share of the Hartree-exchange-correlation potential switched on',
      min: 0,
      max: 1,
      step: 0.05,
      value: 1,
      digits: 2,
      physics: true,
    },
  ],
  build(p) {
    const Z = zOf(p);
    const t = Number(p.t);
    const s = model(Z, 1);
    const k = kohnSham(Z);
    const hs = helperSystem(Z, t);
    const { x, M, psi, h } = s;
    const W = windowOf(Z);
    const S = 5 / W;
    const idx = windowIndices(x, W);
    const zs = 4 / maxAbs(model(Z, 0).psi);
    const zn = 3.5 / maxAbs(model(Z, 0).density);
    const L = -6;
    const R = 6;
    const wallY = 5.6;
    const helper = (i: number, j: number) => hs.phi[i]! * hs.phi[j]!;
    let mismatch = 0;
    let overlap = 0;
    for (let i = 0; i < M; i++) mismatch += Math.abs(hs.n[i]! - s.density[i]!) * h;
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) overlap += psi[i + M * j]! * helper(i, j) * h * h;
    const zv = (v: number) => 0.4 + (1.4 * v) / Z;
    const layers: Layer[] = [
      gridSurface(
        idx,
        x,
        (i, j) => psi[i + M * j]!,
        (a, b, v) => [L + a * S, b * S, v * zs],
        {
          group: 'interacting',
          name: 'Interacting electrons: exact psi(x1, x2)',
          colormap: 'sequential',
        },
      ),
      gridSurface(idx, x, helper, (a, b, v) => [R + a * S, b * S, v * zs], {
        group: 'helper',
        name: 'Helper electrons: phi(x1) phi(x2)',
        colormap: 'sequential',
      }),
      curve(
        idx.map((i) => [L + x[i]! * S, wallY, s.density[i]! * zn]),
        'pos',
        'densities',
        { name: 'Densities: exact (orange), helper (blue), target (dashed)', tube: 0.05 },
      ),
      curve(
        idx.map((i) => [R + x[i]! * S, wallY, hs.n[i]! * zn]),
        'neg',
        'densities',
        { tube: 0.05 },
      ),
      dashedPolyline(
        idx.map((i) => [R + x[i]! * S, wallY, s.density[i]! * zn]),
        'pos',
        'densities',
      ),
      curve(
        idx.map((i) => [R + x[i]! * S, -5.6, zv(hs.v[i]!)]),
        'neg',
        'potentials',
        { name: 'Helper potential (solid) and v_ext (dashed)', tube: 0.04 },
      ),
      dashedPolyline(
        idx.map((i) => [R + x[i]! * S, -5.6, zv(s.vext[i]!)]),
        'muted',
        'potentials',
      ),
      ...axesLayers([10.6, 10.6, 4.5], ['x1', 'x2', 'psi'], [L - 5, -5, 0]),
      labels(
        [
          { text: 'interacting electrons', at: [L, -5.8, 4.8] },
          { text: 'helper electrons, no repulsion', at: [R, -5.8, 4.8] },
          { text: 'density n(x)', at: [L, wallY, 4.1] },
          { text: 'helper density', at: [R, wallY, 4.1] },
          { text: 'helper potential', at: [R + 5.5, -5.6, zv(0)] },
        ],
        'labels',
      ),
    ];
    const describe =
      `Left: the exact wavefunction of two interacting electrons in the model atom (Z = ${Z}). Right: two independent ` +
      `helper electrons sharing one orbital in the potential v_ext plus ${fmt(t * 100, 0)} percent of the exact ` +
      `Hartree-exchange-correlation potential. Their densities, on the back walls, differ by ${fmt(mismatch, 4)} electrons ` +
      `in total${t >= 1 ? ', so the helper system reproduces the density exactly' : ''}, although the two wavefunctions ` +
      `are different functions (overlap ${fmt(overlap * 100, 1)} percent). The helper orbital energy is ${fmt(hs.eps, 3)} hartree` +
      `${t >= 1 ? `, minus the ionisation energy ${fmt(k.ionisation, 3)}` : ''}.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Density mismatch', value: `${fmt(mismatch, 4)} electrons` },
        { label: 'Wavefunction overlap', value: `${fmt(overlap * 100, 1)} %` },
        { label: 'Helper orbital energy', value: ha(hs.eps) },
        { label: 'Ionisation energy', value: ha(k.ionisation) },
      ],
      axes: ['x1 (bohr, scaled)', 'x2 (bohr, scaled)', 'psi'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Exchange and correlation: the hole an electron digs around itself

const xcHoleScene: SceneDef = {
  id: 'm04-xc-hole',
  title: 'The exchange-correlation hole',
  badge: 'toy-model',
  banner: MODEL_BANNER,
  sources: ['S-143', 'S-144', 'S-049', 'S-048', 'S-012'],
  params: [
    Z_PARAM,
    {
      kind: 'select',
      id: 'hole',
      label: 'Hole',
      physics: true,
      value: 'xc',
      options: [
        { value: 'xc', label: 'Exact exchange-correlation hole' },
        { value: 'x', label: 'Exchange part only' },
        { value: 'c', label: 'Correlation part (the rest)' },
      ],
    },
    {
      kind: 'slider',
      id: 'ref',
      label: 'Position of the reference electron',
      min: -4,
      max: 4,
      step: 0.5,
      value: 1,
      unit: 'bohr',
      digits: 1,
      physics: true,
    },
  ],
  build(p) {
    const Z = zOf(p);
    const s = model(Z, 1);
    const { x, M, h, density: n } = s;
    const kind = String(p.hole);
    const W = windowOf(Z);
    const S = 5 / W;
    const idx = windowIndices(x, W);
    const holes = new Map<number, Float64Array>();
    const hole = (i: number): Float64Array => {
      let hh = holes.get(i);
      if (!hh) {
        const xc = xcHole(s, i);
        hh = Float64Array.from(xc, (v, j) => (kind === 'xc' ? v : kind === 'x' ? -n[j]! / 2 : v + n[j]! / 2));
        holes.set(i, hh);
      }
      return hh;
    };
    const zs = 4 / maxAbs(n);
    let ir = 0;
    const ref = Number(p.ref);
    for (let i = 0; i < M; i++) if (Math.abs(x[i]! - ref) < Math.abs(x[ir]! - ref)) ir = i;
    const xr = x[ir]!;
    const hr = hole(ir);
    let sum = 0;
    for (let j = 0; j < M; j++) sum += hr[j]! * h;
    const onTop = hr[ir]!;
    let range = 0;
    for (const i of idx) for (const j of idx) range = Math.max(range, Math.abs(hole(i)[j]!));
    const layers: Layer[] = [
      gridSurface(
        idx,
        x,
        (i, j) => hole(i)[j]!,
        (a, b, v) => [a * S, b * S, v * zs],
        {
          group: 'hole',
          name: 'Hole n(x2 | x1) - n(x2) over both positions',
          colormap: 'diverging',
          range: [-range, range],
          opacity: 0.9,
        },
      ),
      curve(
        idx.map((j) => [xr * S, x[j]! * S, hr[j]! * zs + 0.03]),
        'ink',
        'slice',
        { name: 'The hole around the reference electron', tube: 0.06 },
      ),
      dashedPolyline(
        idx.map((j) => [xr * S, x[j]! * S, -n[j]! * zs]),
        'muted',
        'slice',
      ),
      atoms([[xr * S, xr * S, 0.15]], 0.25, 'pos', 'electron', { labels: ['reference electron'] }),
      ...axesLayers([10.6, 10.6, 4.5], ['x1 (reference)', 'x2 (other electron)', 'hole'], [-5, -5, 0]),
      labels(
        [
          { text: 'reference electron', at: [xr * S, xr * S, 1] },
          { text: 'minus the full density (dashed)', at: [xr * S, 5.4, -3.5] },
        ],
        'labels',
      ),
    ];
    const k = kohnSham(Z);
    const name =
      kind === 'xc' ? 'exact exchange-correlation hole' : kind === 'x' ? 'exchange hole' : 'correlation hole';
    const removed = n[ir]! > 0 ? (-onTop / n[ir]!) * 100 : 0;
    const describe =
      `The ${name} of the model atom (Z = ${Z}) as a surface over the position x1 of one electron and x2 of the other: ` +
      `how much the density seen by the other electron changes because the first one is at x1. Blue is a dip. ` +
      `For the electron at x1 = ${fmt(xr, 1)} bohr (dark curve) the hole integrates to ${fmt(sum, 3)} electrons and ` +
      `removes ${fmt(removed, 0)} percent of the density right at the electron. ` +
      `In this model E_xc = ${fmt(k.Exc, 3)} hartree.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Hole integral (sum rule)', value: `${fmt(sum, 3)} electrons` },
        { label: 'Removed at the electron', value: `${fmt(removed, 0)} %` },
        { label: 'Reference electron at', value: `${fmt(xr, 1)} bohr` },
        { label: 'E_xc of the model', value: ha(k.Exc) },
      ],
      axes: ['x1 (bohr, scaled)', 'x2 (bohr, scaled)', 'hole'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------
// The SCF loop: a waterfall of densities, and the same iterations as a path through a space of densities

const scfCache = new Map<string, ScfResult>();
/**
 * Iterations run per setting: past the golden 64 at alpha 0.3 and long enough for the Z = 1, alpha = 1 run, which first
 * looks converged (residual near 1e-10 at step 70) and then is thrown into its two-state oscillation by step 250.
 */
export const SCF_MAX = 260;

/** scf1d at the lab grid (the golden grid), memoised by charge and mixing. */
export function scf(Z: number, alpha: number): ScfResult {
  const key = `${Z}|${alpha.toFixed(3)}`;
  let r = scfCache.get(key);
  if (!r) {
    r = runScf({ Z, alpha, maxIterations: SCF_MAX });
    scfCache.set(key, r);
  }
  return r;
}

/** What the loop does with this mixing, as a phrase after "the loop". */
const verdict = (r: ScfResult): string =>
  r.converged
    ? `converges in ${r.iterations.length} steps`
    : r.behaviour === 'oscillating'
      ? `oscillates between two densities and never converges`
      : r.behaviour === 'diverging'
        ? 'diverges'
        : `has not converged after ${SCF_MAX} steps`;
const outcome = (r: ScfResult): string =>
  r.converged
    ? `converged in ${r.iterations.length} steps`
    : r.behaviour === 'oscillating'
      ? 'oscillating'
      : r.behaviour === 'diverging'
        ? 'diverging'
        : `slow: not converged in ${SCF_MAX}`;

const MIX_PARAM = {
  kind: 'slider' as const,
  id: 'alpha',
  label: 'Mixing alpha',
  min: 0.05,
  max: 1,
  step: 0.05,
  value: 0.3,
  digits: 2,
  physics: true,
};

const WATERFALL_STEPS = 40;

const scfLoop: SceneDef = {
  id: 'm04-scf-loop',
  title: 'The SCF loop as a waterfall of densities',
  badge: 'toy-model',
  banner: SCF_BANNER,
  sources: ['S-048', 'S-047', 'S-031', 'S-143', 'S-049'],
  params: [
    Z_PARAM,
    MIX_PARAM,
    {
      kind: 'step',
      id: 'step',
      label: 'Iteration',
      min: 1,
      max: WATERFALL_STEPS,
      value: 12,
      interval: 0.6,
      physics: true,
    },
    { kind: 'toggle', id: 'potential', label: 'Effective potential of this step', value: true },
  ],
  build(p) {
    const Z = zOf(p);
    const alpha = Number(p.alpha);
    const r = scf(Z, alpha);
    const its = r.iterations;
    const k = Math.min(Math.round(Number(p.step)), its.length);
    const it = its[k - 1]!;
    const W = windowOf(Z);
    const S = 5 / W;
    const sel: number[] = [];
    for (let i = 0; i < r.x.length; i += 2) if (Math.abs(r.x[i]!) <= W) sel.push(i);
    const zn = 3.5 / maxAbs(r.density);
    const yOf = (m: number) => -5 + ((m - 1) * 10) / (WATERFALL_STEPS - 1);
    const row = (d: Float64Array, m: number, dz = 0): Vec3[] =>
      sel.map((i) => [r.x[i]! * S, yOf(m), d[i]! * zn + dz]);
    const history: [Vec3, Vec3][] = [];
    for (let m = 1; m < k; m++) {
      const pts = row(its[m - 1]!.densityIn, m);
      for (let q = 0; q + 1 < pts.length; q++) history.push([pts[q]!, pts[q + 1]!]);
    }
    const layers: Layer[] = [];
    if (history.length)
      layers.push(lines(history, 'muted', 'history', { name: 'Input densities of earlier steps' }));
    layers.push(
      curve(row(it.densityIn, k), 'neg', 'current', {
        name: 'This step: n_in (blue), n_out (orange, dashed)',
        tube: 0.06,
      }),
      dashedPolyline(row(it.densityOut, k), 'pos', 'current'),
    );
    if (r.converged)
      layers.push(
        lines(
          (() => {
            const pts = row(r.density, WATERFALL_STEPS + 1.5);
            const seg: [Vec3, Vec3][] = [];
            for (let q = 0; q + 1 < pts.length; q++) seg.push([pts[q]!, pts[q + 1]!]);
            return seg;
          })(),
          'ink',
          'target',
          { name: 'Self-consistent density (end of the run)', tube: 0.04 },
        ),
      );
    if (p.potential) {
      const zv = (v: number) => -0.5 + (1.5 * v) / Z;
      layers.push(
        curve(
          sel.map((i) => [r.x[i]! * S, yOf(k), zv(it.potential[i]!)]),
          'c3',
          'potential',
          { name: 'Effective potential built from n_in', tube: 0.04 },
        ),
      );
    }
    layers.push(
      ...axesLayers([10.6, 11.5, 4.5], ['x (bohr, scaled)', 'iteration', 'density'], [-5, -5.3, 0]),
      labels(
        [
          { text: `step ${k}`, at: [5.4, yOf(k), 0.5] },
          { text: 'n_in', at: [-1.5, yOf(k), maxAbs(it.densityIn) * zn + 0.4] },
          ...(r.converged
            ? [{ text: 'self-consistent density', at: [0, yOf(WATERFALL_STEPS + 1.5), 4.2] as Vec3 }]
            : []),
          ...(p.potential ? [{ text: 'v_eff', at: [5.4, yOf(k), -0.6] as Vec3 }] : []),
        ],
        'labels',
      ),
    );
    const describe =
      `A waterfall of the input densities of the SCF loop for the model atom (Z = ${Z}), one row per iteration, with ` +
      `mixing alpha = ${fmt(alpha, 2)}. At step ${k} the potential built from n_in gives a new density n_out; the ` +
      `residual between them is ${fmt(it.residual, 6)} and the energy ${fmt(it.totalEnergy, 6)} hartree. ` +
      `With this mixing the loop ${verdict(r)}.`;
    return {
      layers,
      describe,
      readouts: [
        { label: 'Iteration', value: `${k}` },
        { label: 'Residual |n_out - n_in|', value: it.residual.toExponential(2) },
        { label: 'Energy', value: `${fmt(it.totalEnergy, 6)} Ha` },
        { label: 'Outcome', value: outcome(r) },
      ],
      axes: ['x (bohr, scaled)', 'iteration', 'density'],
    };
  },
};

const PATH_STEPS = SCF_MAX;

/** Two numbers that place a density in the state space: the value at the centre and the rms width per electron. */
export function densityCoordinates(r: ScfResult, n: Float64Array): [number, number] {
  const c = (r.x.length - 1) / 2;
  let m2 = 0;
  let tot = 0;
  for (let i = 0; i < r.x.length; i++) {
    m2 += r.x[i]! ** 2 * n[i]!;
    tot += n[i]!;
  }
  return [n[c]!, Math.sqrt(m2 / tot)];
}

const scfPath: SceneDef = {
  id: 'm04-scf-path',
  title: 'The SCF loop as a path toward the fixed point',
  badge: 'toy-model',
  banner: SCF_BANNER,
  sources: ['S-048', 'S-047', 'S-143', 'S-049'],
  params: [
    Z_PARAM,
    MIX_PARAM,
    {
      kind: 'step',
      id: 'step',
      label: 'Iteration',
      min: 1,
      max: PATH_STEPS,
      value: 80,
      interval: 0.12,
      physics: true,
    },
  ],
  build(p) {
    const Z = zOf(p);
    const alpha = Number(p.alpha);
    const r = scf(Z, alpha);
    const its = r.iterations.slice(0, PATH_STEPS);
    const k = Math.min(Math.round(Number(p.step)), its.length);
    const coords = its.map((it) => densityCoordinates(r, it.densityIn));
    // the self-consistent density does not depend on the mixing: take it from the converging run at alpha 0.3
    const fixed = densityCoordinates(r, scf(Z, 0.3).density);
    let da = 1e-9;
    let db = 1e-9;
    for (const [a, b] of coords) {
      da = Math.max(da, Math.abs(a - fixed[0]));
      db = Math.max(db, Math.abs(b - fixed[1]));
    }
    const zOfR = (res: number) => (Math.log10(Math.max(res, 1e-13)) + 13) * 0.6;
    const at = (m: number): Vec3 => [
      ((coords[m]![0] - fixed[0]) / da) * 5,
      ((coords[m]![1] - fixed[1]) / db) * 5,
      zOfR(its[m]!.residual),
    ];
    const path = Array.from({ length: k }, (_, m) => at(m));
    const now = path[k - 1]!;
    const layers: Layer[] = [];
    if (path.length > 1) {
      layers.push(
        curve(path, 'accent', 'path', { name: 'The iterations', tube: 0.04 }),
        points(path, 'accent', 0.08, 'path'),
        dashedPolyline(
          path.map((q) => [q[0], q[1], 0]),
          'muted',
          'shadow',
          'Shadow of the path on the floor',
        ),
      );
    }
    layers.push(
      atoms([now], 0.24, 'pos', 'current', { name: 'This iteration', labels: [`step ${k}`], highlight: [0] }),
      lines(
        [
          [
            [0, 0, 0],
            [0, 0, zOfR(1)],
          ],
        ],
        'ink',
        'target',
        { name: 'The self-consistent density', tube: 0.04 },
      ),
      atoms([[0, 0, zOfR(1e-12)]], 0.18, 'ink', 'target', { labels: ['fixed point, residual 1e-12'] }),
      ...axesLayers([6, 6, zOfR(1) + 0.5], ['centre density', 'width', 'log10 residual'], [-5.5, -5.5, 0]),
      labels(
        [
          { text: 'fixed point', at: [0, 0, zOfR(1) + 0.4] },
          { text: `step ${k}`, at: [now[0] + 0.5, now[1], now[2] + 0.4] },
        ],
        'labels',
      ),
    );
    let best = 0;
    for (let m = 1; m < its.length; m++) if (its[m]!.residual < its[best]!.residual) best = m;
    const cur = its[k - 1]!;
    const describe =
      `Each SCF iteration of the model atom (Z = ${Z}, mixing ${fmt(alpha, 2)}) as a point in a space of densities: ` +
      `across, how far the centre density and the width are from the self-consistent ones (scaled to fit), and up, ` +
      `log10 of the residual. At step ${k} the density has n(0) = ${fmt(coords[k - 1]![0], 4)} per bohr, width ` +
      `${fmt(coords[k - 1]![1], 3)} bohr and residual ${cur.residual.toExponential(2)}. ` +
      (r.converged
        ? `The path falls onto the fixed point and the loop converges in ${r.iterations.length} steps.`
        : r.behaviour === 'oscillating'
          ? `The path first falls to a residual of ${its[best]!.residual.toExponential(1)} at step ${best + 1}, then the fixed point pushes it away and it ends jumping between two densities on either side, at one height: the loop oscillates.`
          : `After ${SCF_MAX} steps the residual is ${r.iterations[r.iterations.length - 1]!.residual.toExponential(1)}: the loop ${verdict(r)}.`);
    return {
      layers,
      describe,
      readouts: [
        { label: 'Iteration', value: `${k}` },
        { label: 'Residual', value: cur.residual.toExponential(2) },
        { label: 'Width of the density', value: `${fmt(coords[k - 1]![1], 3)} bohr` },
        { label: 'Outcome', value: outcome(r) },
      ],
      axes: ['centre density (scaled)', 'width (scaled)', 'log10 residual'],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [hohenbergKohn.id]: hohenbergKohn,
  [kohnShamScene.id]: kohnShamScene,
  [xcHoleScene.id]: xcHoleScene,
  [scfLoop.id]: scfLoop,
  [scfPath.id]: scfPath,
};
