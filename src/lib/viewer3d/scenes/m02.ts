// Module 2 (quantum basics) scenes. Reference pattern for every scene module: pure generators, real libraries, honest badges.
// @source S-047 (hydrogen orbitals, box, free wave packet, identical particles), S-031 (Bohr radius, hbar^2/2m)
// @source S-050, S-036, S-140 (tight-binding chain)
import {
  energyEV,
  listOrbitals,
  radial,
  radialNodeRadii,
  radialQuantile,
  realYlm,
  sampleOrbital,
} from '../../physics/hydrogen';
import {
  box3dEnergyEV,
  box3dLevels,
  box3dPeakDensity,
  box3dPsi,
  boxEnergyEV,
  boxPairPsi,
  boxPsi,
  fillLevels,
} from '../../physics/box';
import { chainEnergies, harrisonHopping, infiniteChainBands } from '../../physics/chain1d';
import {
  deBroglie,
  groupVelocity,
  kFromEnergy,
  packetCentre,
  packetDensity,
  packetPsi,
  packetWidth,
  probabilityBetween,
  spreadTime,
  type Packet,
} from '../../physics/wavepacket';
import {
  arrows,
  atoms,
  axesLayers,
  cellEdges,
  curve,
  fmt,
  graph1d,
  gridIsosurfaceLayer,
  isosurfaceLayer,
  labels,
  lines,
  points,
  quadLayer,
  sliceLayer,
  sphereLayer,
  surfaceLayer,
} from '../kit';
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
    { kind: 'toggle', id: 'clip', label: 'Cut away the front half', value: false, physics: true },
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
    // the clip plane y = 0 removes the half nearer the front and iso cameras; the cut face shows psi itself
    const clip = Boolean(p.clip);
    const lo: Vec3 = [-R, clip ? 0 : -R, -R];
    const hi: Vec3 = [R, R, R];
    const N = n >= 3 ? 46 : 40;
    const grid: [number, number, number] = clip ? [N, Math.ceil(N / 2) + 1, N] : [N, N, N];
    const layers: Layer[] = [
      isosurfaceLayer(f, lo, hi, grid, level, {
        group: 'lobes',
        name: 'Positive lobes',
        color: 'pos',
        opacity: 0.85,
      }),
      isosurfaceLayer((x, y, z) => -f(x, y, z), lo, hi, grid, level, {
        group: 'lobes',
        color: 'neg',
        opacity: 0.85,
      }),
      ...axesLayers(R * 0.9, ['x', 'y', 'z']),
    ];
    if (clip)
      layers.push(
        sliceLayer((q) => f(q[0], q[1], q[2]), [-R, 0, -R], [2 * R, 0, 0], [0, 0, 2 * R], 64, {
          group: 'cut',
          name: 'Cut plane (psi)',
          colormap: 'diverging',
          range: [-peak, peak],
          opacity: 0.9,
        }),
      );
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
      `and ${angular} angular node${angular === 1 ? '' : 's'}; the box shown is ${fmt(2 * R, 0)} a0 across.` +
      (clip
        ? ' The half with y below zero is cut away; the cut plane is coloured by psi, orange positive and blue negative, so nodes show as the boundaries between colours.'
        : '');
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

// ---------------------------------------------------------------------------------------------------------------------
// The particle in a 3D box: the |psi|^2 surface of (nx, ny, nz), a stretchable side, and the energy ladder beside it.

type T3 = [number, number, number];
const BOX_SIDE = 5; // Angstrom: the x and y sides; z is the stretchable one

const boxIso = new Map<string, Layer[]>();

function boxSurfaces(n: T3, L: T3, level: number): Layer[] {
  const key = `${n.join(',')}|${L.map((x) => x.toFixed(3)).join(',')}|${level.toFixed(3)}`;
  const hit = boxIso.get(key);
  if (hit) return hit;
  const c = Math.sqrt(level * box3dPeakDensity(L)); // |psi|^2 = level * peak  <=>  |psi| = c
  const Lmax = Math.max(...L);
  const grid = L.map((x) => Math.max(20, Math.round((32 * x) / Lmax))) as T3;
  // psi is a product of three 1D states, so the grid is filled from three short tables (box3dPsi = boxPsi x boxPsi x boxPsi).
  // One surface |psi| = c holds the lobes of both signs; each vertex is then coloured by the sign of psi there.
  const axis = (k: number) =>
    Array.from({ length: grid[k]! }, (_, i) => boxPsi(n[k]!, L[k]!, (L[k]! * i) / (grid[k]! - 1)));
  const [ax, ay, az] = [axis(0), axis(1), axis(2)];
  const vals = new Float64Array(grid[0] * grid[1] * grid[2]);
  for (let k = 0; k < grid[2]; k++)
    for (let j = 0; j < grid[1]; j++)
      for (let i = 0; i < grid[0]; i++)
        vals[i + grid[0] * (j + grid[1] * k)] = Math.abs(ax[i]! * ay[j]! * az[k]!);
  const toScene = (g: Vec3): Vec3 => [0, 1, 2].map((k) => (L[k]! * g[k]!) / (grid[k]! - 1)) as Vec3;
  const mesh = gridIsosurfaceLayer(vals, grid, toScene, c, {
    group: 'density',
    name: '|psi|^2 surface (orange psi > 0, blue psi < 0)',
    color: 'pos',
    opacity: 0.85,
  });
  const values: number[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3)
    values.push(
      Math.sign(box3dPsi(n, L, mesh.positions[i]!, mesh.positions[i + 1]!, mesh.positions[i + 2]!)) || 1,
    );
  mesh.values = values;
  mesh.colormap = 'diverging';
  mesh.range = [-1, 1];
  const out: Layer[] = [mesh];
  if (boxIso.size > 64) boxIso.clear();
  boxIso.set(key, out);
  return out;
}

const box: SceneDef = {
  id: 'm02-box',
  title: 'Particle in a 3D box',
  badge: 'computed',
  sources: ['S-047', 'S-031'],
  params: [
    { kind: 'slider', id: 'nx', label: 'nx', min: 1, max: 4, step: 1, value: 1, digits: 0, physics: true },
    { kind: 'slider', id: 'ny', label: 'ny', min: 1, max: 4, step: 1, value: 1, digits: 0, physics: true },
    { kind: 'slider', id: 'nz', label: 'nz', min: 1, max: 4, step: 1, value: 1, digits: 0, physics: true },
    {
      kind: 'slider',
      id: 'lz',
      label: 'Box length along z',
      min: 3,
      max: 10,
      step: 0.1,
      value: 5,
      unit: 'Angstrom',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'level',
      label: 'Surface level (share of the peak)',
      min: 0.1,
      max: 0.8,
      step: 0.05,
      value: 0.3,
      digits: 2,
    },
    { kind: 'toggle', id: 'nodes', label: 'Nodal planes', value: false },
  ],
  build(p) {
    const n: T3 = [Number(p.nx), Number(p.ny), Number(p.nz)];
    const L: T3 = [BOX_SIDE, BOX_SIDE, Number(p.lz)];
    const E = box3dEnergyEV(n, L);
    const levels = box3dLevels(L, 40);
    const here = levels.findIndex((lv) => Math.abs(lv.energy - E) <= 1e-9 * E);
    const deg = levels[here]?.states.length ?? 1;
    // the ladder shows at least eight levels and always reaches the chosen state
    const shown = levels.slice(0, Math.max(8, here + 1));
    const top = shown[shown.length - 1]!.energy;
    const H = 10; // ladder height in scene units (Angstrom-sized), E = 0 at the floor of the box
    const zOf = (e: number) => (H * e) / top;
    const x0 = L[0] + 2.5;
    const layers: Layer[] = [
      ...boxSurfaces(n, L, Number(p.level)),
      {
        kind: 'lines',
        group: 'box',
        name: 'Box walls',
        segments: cellEdges([
          [L[0], 0, 0],
          [0, L[1], 0],
          [0, 0, L[2]],
        ]),
        color: 'ink',
      },
    ];
    if (p.nodes) {
      const quads: Layer[] = [];
      for (let k = 0; k < 3; k++)
        for (let i = 1; i < n[k]!; i++) {
          const o: Vec3 = [0, 0, 0];
          o[k] = (i * L[k]!) / n[k]!;
          const u: Vec3 = [0, 0, 0];
          const v: Vec3 = [0, 0, 0];
          u[(k + 1) % 3] = L[(k + 1) % 3]!;
          v[(k + 2) % 3] = L[(k + 2) % 3]!;
          quads.push(
            quadLayer(o, u, v, { group: 'nodes', name: 'Nodal planes', color: 'muted', opacity: 0.18 }),
          );
        }
      layers.push(...quads);
    }
    // energy ladder: one line per level, one dot per state on it (degeneracy you can count), the chosen state marked
    const segs: [Vec3, Vec3][] = [];
    const dots: Vec3[] = [];
    shown.forEach((lv) => {
      const z = zOf(lv.energy);
      segs.push([
        [x0, L[1] / 2, z],
        [x0 + 3, L[1] / 2, z],
      ]);
      lv.states.forEach((_, j) => dots.push([x0 + 0.3 + (2.4 * (j + 0.5)) / lv.states.length, L[1] / 2, z]));
    });
    const zE = zOf(E);
    layers.push(
      lines(segs, 'ink', 'ladder', { name: 'Energy ladder' }),
      points(dots, 'muted', 0.12, 'ladder'),
      lines(
        [
          [
            [x0, L[1] / 2, 0],
            [x0, L[1] / 2, H],
          ],
        ],
        'muted',
        'ladder',
        { dashed: true },
      ),
      arrows([[x0 - 1.6, L[1] / 2, zE]], [[1.4, 0, 0]], 'accent', 'ladder', { thickness: 0.05 }),
      labels(
        [
          { text: `(${n.join(', ')}): ${fmt(E, 2)} eV`, at: [x0 + 3.4, L[1] / 2, zE] },
          {
            text: `ground ${fmt(levels[0]!.energy, 2)} eV`,
            at: [x0 + 3.4, L[1] / 2, zOf(levels[0]!.energy) - 0.5],
          },
          { text: 'E', at: [x0, L[1] / 2, H + 0.6] },
          { text: `Lz = ${fmt(L[2], 1)} A`, at: [-0.6, -0.6, L[2] / 2] },
        ],
        'labels',
      ),
    );
    const nodesCount = n[0] - 1 + n[1] - 1 + n[2] - 1;
    const partners = levels[here]?.states.filter((s) => s.join() !== n.join()) ?? [];
    const describe =
      `One electron in a box of ${fmt(L[0], 1)} by ${fmt(L[1], 1)} by ${fmt(L[2], 1)} A in state (${n.join(', ')}), ` +
      `energy ${fmt(E, 2)} eV. The surfaces enclose where |psi|^2 exceeds ${fmt(Number(p.level) * 100, 0)} percent of its peak, ` +
      `orange where psi is positive and blue where negative; there are ${nodesCount} flat nodal plane${nodesCount === 1 ? '' : 's'}. ` +
      (deg > 1
        ? `This level is ${deg}-fold degenerate: ${partners.map((s) => `(${s.join(', ')})`).join(', ')} share the energy.`
        : `No other state shares this energy (degeneracy 1).`);
    return {
      layers,
      describe,
      camera: 'iso',
      readouts: [
        { label: 'Energy', value: `${fmt(E, 2)} eV` },
        { label: 'Degeneracy', value: String(deg) },
        { label: 'Ground state', value: `${fmt(levels[0]!.energy, 2)} eV` },
        { label: 'Nodal planes', value: String(nodesCount) },
      ],
      axes: ['x (Angstrom)', 'y (Angstrom)', 'z (Angstrom); ladder: energy'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Particles and waves: a free Gaussian packet as a surface |psi(x, t)|^2 over position and time, with the real part as a
// ribbon at the chosen time and the classical particle riding at the group velocity.

const PACKET_WINDOW_FS = 1;

function packetFrame(energy: number, sigma0: number) {
  const k0 = kFromEnergy(energy);
  const pk: Packet = { k0, sigma0, x0: 0 };
  const v = groupVelocity(k0);
  const wEnd = packetWidth(pk, PACKET_WINDOW_FS);
  const xmin = -4 * sigma0;
  const xmax = v * PACKET_WINDOW_FS + 4 * wEnd;
  const peak = 1 / (Math.sqrt(2 * Math.PI) * sigma0);
  const X = (x: number) => (10 * (x - xmin)) / (xmax - xmin);
  const Y = (t: number) => (6 * t) / PACKET_WINDOW_FS;
  const Z = (rho: number) => (3 * rho) / peak;
  return { k0, pk, v, xmin, xmax, peak, X, Y, Z };
}

const packet: SceneDef = {
  id: 'm02-packet',
  title: 'A wave packet moving and spreading',
  badge: 'computed',
  sources: ['S-047', 'S-031'],
  params: [
    {
      kind: 'slider',
      id: 'energy',
      label: 'Kinetic energy',
      min: 1,
      max: 40,
      step: 0.5,
      value: 10,
      unit: 'eV',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'width',
      label: 'Starting width',
      min: 0.5,
      max: 3,
      step: 0.1,
      value: 1.5,
      unit: 'Angstrom',
      digits: 1,
      physics: true,
    },
    { kind: 'time', id: 'time', label: 'Time (share of 1 fs)', period: 1, value: 0.3, physics: true },
    { kind: 'toggle', id: 'ribbon', label: 'Real part of psi', value: true },
  ],
  build(p) {
    const energy = Number(p.energy);
    const sigma0 = Number(p.width);
    const t = ((Number(p.time) % 1) + 1) % 1;
    const { k0, pk, v, xmin, xmax, peak, X, Y, Z } = packetFrame(energy, sigma0);
    const layers: Layer[] = [
      surfaceLayer(
        (sx, sy) => Z(packetDensity(pk, xmin + (sx / 10) * (xmax - xmin), (sy / 6) * PACKET_WINDOW_FS)),
        [0, 10],
        [0, 6],
        150,
        48,
        { group: 'surface', name: '|psi|^2 over x and t', opacity: 0.8 },
      ),
    ];
    const now = graph1d(
      (x) => Z(packetDensity(pk, x, t)),
      xmin,
      xmax,
      240,
      (x, z) => [X(x), Y(t), z],
    );
    layers.push(curve(now, 'ink', 'now', { name: 'Density now', tube: 0.04 }));
    if (p.ribbon) {
      const re = graph1d(
        (x) => (1.5 * packetPsi(pk, x, t)[0]) / Math.sqrt(peak),
        xmin,
        xmax,
        300,
        (x, z) => [X(x), Y(t) - 0.02, z],
      );
      layers.push(curve(re, 'accent', 'ribbon', { name: 'Real part of psi' }));
    }
    const xc = packetCentre(pk, t);
    layers.push(
      atoms([[X(xc), Y(t), 0]], 0.18, 'c2', 'particle', {
        name: 'Classical particle',
        labels: ['classical particle'],
      }),
      ...axesLayers([10.6, 6.6, 3.6], ['x', 't', '|psi|^2']),
      labels(
        [
          { text: 't = 0', at: [-0.6, 0, 0] },
          { text: `t = ${fmt(PACKET_WINDOW_FS, 0)} fs`, at: [-0.8, 6, 0] },
          { text: 'particle at v t', at: [X(xc), Y(t), -0.6] },
        ],
        'labels',
      ),
    );
    const lam = deBroglie(k0);
    const w = packetWidth(pk, t);
    const tau = spreadTime(sigma0);
    const describe =
      `A free electron with ${fmt(energy, 1)} eV as a Gaussian wave packet: the surface is |psi|^2 over position (across) ` +
      `and time (from 0 to ${fmt(PACKET_WINDOW_FS, 0)} fs, back). Its de Broglie wavelength is ${fmt(lam, 2)} A and the packet moves at ` +
      `${fmt(v, 1)} A per fs. At t = ${fmt(t, 2)} fs the centre is at ${fmt(xc, 1)} A and the width has grown from ${fmt(sigma0, 1)} to ` +
      `${fmt(w, 2)} A (it grows by a factor sqrt 2 after ${fmt(tau, 2)} fs).`;
    return {
      layers,
      describe,
      camera: { eye: [5, -14, 9], up: [0, 0, 1] },
      readouts: [
        { label: 'Wavelength', value: `${fmt(lam, 2)} A` },
        { label: 'Speed', value: `${fmt(v, 1)} A/fs` },
        { label: 'Width now', value: `${fmt(w, 2)} A` },
        { label: 'Spreading time', value: `${fmt(tau, 2)} fs` },
      ],
      axes: [
        `x (${fmt(xmin, 0)} to ${fmt(xmax, 0)} A)`,
        `t (0 to ${fmt(PACKET_WINDOW_FS, 0)} fs)`,
        '|psi|^2 (relative)',
      ],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// The wavefunction: real and imaginary parts of a Gaussian packet as a helix around the x axis, the density as a band.

const helix: SceneDef = {
  id: 'm02-helix',
  title: 'Wavefunction as a twisting ribbon',
  badge: 'computed',
  sources: ['S-047', 'S-053'],
  params: [
    {
      kind: 'slider',
      id: 'k',
      label: 'Wave number k (momentum / hbar)',
      min: -3,
      max: 3,
      step: 0.1,
      value: 2,
      unit: '1/Angstrom',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'width',
      label: 'Width',
      min: 0.5,
      max: 3,
      step: 0.1,
      value: 1.5,
      unit: 'Angstrom',
      digits: 1,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'probe',
      label: 'Probe point x',
      min: -6,
      max: 6,
      step: 0.1,
      value: 1,
      unit: 'Angstrom',
      digits: 1,
    },
    { kind: 'toggle', id: 'phase', label: 'Phase arrows', value: true },
  ],
  build(p) {
    const k0 = Number(p.k);
    const sigma0 = Number(p.width);
    const xp = Number(p.probe);
    const pk: Packet = { k0, sigma0, x0: 0 };
    const amp = (2 * Math.PI * sigma0 * sigma0) ** -0.25; // largest |psi|
    const S = 0.6; // scene units per Angstrom along x
    const A = 2.5 / amp; // scene units per unit of psi
    const B = 1.8 / (amp * amp); // half-width of the density band per unit of |psi|^2
    const zb = -3.6;
    const xr: [number, number] = [-8, 8];
    const helixPts: Vec3[] = graph1d(
      (x) => x,
      xr[0],
      xr[1],
      300,
      (x) => {
        const [re, im] = packetPsi(pk, x, 0);
        return [S * x, A * re, A * im];
      },
    );
    // density band: a strip on the floor whose half-width and colour follow |psi|^2
    const positions: number[] = [];
    const values: number[] = [];
    const nb = 200;
    for (let i = 0; i <= nb; i++) {
      const x = xr[0] + ((xr[1] - xr[0]) * i) / nb;
      const rho = packetDensity(pk, x, 0);
      positions.push(S * x, -B * rho, zb, S * x, B * rho, zb);
      values.push(rho, rho);
    }
    const indices: number[] = [];
    for (let i = 0; i < nb; i++) indices.push(2 * i, 2 * i + 2, 2 * i + 3, 2 * i, 2 * i + 3, 2 * i + 1);
    const layers: Layer[] = [
      curve(helixPts, 'accent', 'psi', { name: 'psi (real, imaginary)', tube: 0.05 }),
      {
        kind: 'mesh',
        group: 'density',
        name: '|psi|^2 band',
        positions,
        indices,
        values,
        colormap: 'sequential',
        color: 'accent',
        opacity: 0.85,
      },
      lines(
        [
          [
            [S * xr[0], 0, 0],
            [S * xr[1], 0, 0],
          ],
        ],
        'muted',
        'axis',
        { name: 'x axis' },
      ),
      ...axesLayers([S * xr[1] + 0.6, 3, 3], ['x', 'Re psi', 'Im psi'], [0, 0, 0], 'axes'),
    ];
    if (p.phase) {
      const from: Vec3[] = [];
      const vec: Vec3[] = [];
      const col: Color[] = [];
      const head: ('solid' | 'open')[] = [];
      for (let i = 0; i <= 32; i++) {
        const x = -3 * sigma0 + (6 * sigma0 * i) / 32;
        const [re, im] = packetPsi(pk, x, 0);
        if (Math.hypot(re, im) < 0.08 * amp) continue;
        from.push([S * x, 0, 0]);
        vec.push([0, A * re, A * im]);
        col.push(re >= 0 ? 'pos' : 'neg');
        head.push(im >= 0 ? 'solid' : 'open');
      }
      if (from.length)
        layers.push(arrows(from, vec, col, 'phase', { name: 'Phase arrows', head, thickness: 0.03 }));
    }
    const [rp, ip] = packetPsi(pk, xp, 0);
    const rho = packetDensity(pk, xp, 0);
    const prob = probabilityBetween(pk, 0, xp - 0.5, xp + 0.5);
    layers.push(
      lines(
        [
          [
            [S * xp, 0, zb],
            [S * xp, A * rp, A * ip],
          ],
        ],
        'ink',
        'probe',
        { name: 'Probe', dashed: true },
      ),
      points([[S * xp, A * rp, A * ip]], 'ink', 0.1, 'probe'),
      labels(
        [
          { text: '|psi|^2', at: [S * xr[0] - 0.4, 0, zb] },
          { text: `x = ${fmt(xp, 1)} A`, at: [S * xp, 0, zb - 0.5] },
        ],
        'labels',
      ),
    );
    const lam = Math.abs(k0) > 1e-9 ? deBroglie(k0) : Infinity;
    const twist =
      k0 > 0 ? 'turns anticlockwise seen from the +x end' : k0 < 0 ? 'turns the other way' : 'does not turn';
    const describe =
      `psi(x) of a Gaussian packet of width ${fmt(sigma0, 1)} A and wave number ${fmt(k0, 1)} per A, drawn in 3D: along x, ` +
      `with the real part sideways and the imaginary part up, so the curve ${twist}` +
      (Number.isFinite(lam) ? `, once every ${fmt(lam, 2)} A (the wavelength)` : '') +
      `. Its distance from the axis is |psi|; the band on the floor is |psi|^2. ` +
      `At x = ${fmt(xp, 1)} A the density is ${fmt(rho, 3)} per A and the chance of finding the electron within 0.5 A of that point is ${fmt(prob * 100, 1)} percent.`;
    return {
      layers,
      describe,
      camera: { eye: [-6, -12, 7], up: [0, 0, 1] },
      readouts: [
        { label: 'Wavelength', value: Number.isFinite(lam) ? `${fmt(lam, 2)} A` : 'none (k = 0)' },
        { label: '|psi|^2 at probe', value: `${fmt(rho, 3)} 1/A` },
        { label: 'P(within 0.5 A)', value: `${fmt(prob * 100, 1)} %` },
        { label: 'Phase at probe', value: `${fmt((Math.atan2(ip, rp) * 180) / Math.PI, 0)} degree` },
      ],
      axes: ['x (0.6 units per A)', 'Re psi', 'Im psi'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Spin and Pauli: levels of a 5 A box filled with up and down arrows, and the two-electron surface psi(x1, x2).

const PAULI_L = 5;
const PAULI_LEVELS = 5;
const PAIRS: Record<string, [number, number]> = {
  '1-2': [1, 2],
  '1-3': [1, 3],
  '2-3': [2, 3],
  '1-1': [1, 1],
};

const pauli: SceneDef = {
  id: 'm02-pauli',
  title: 'Spin, Pauli and the swap of two electrons',
  badge: 'computed',
  sources: ['S-047', 'S-031'],
  params: [
    {
      kind: 'step',
      id: 'electrons',
      label: 'Electrons',
      min: 1,
      max: 10,
      value: 2,
      physics: true,
      interval: 0.8,
    },
    {
      kind: 'select',
      id: 'kind',
      label: 'Particles',
      value: 'antisymmetric',
      physics: true,
      options: [
        { value: 'antisymmetric', label: 'Electrons (antisymmetric)' },
        { value: 'symmetric', label: 'Bosons (symmetric)' },
      ],
    },
    {
      kind: 'select',
      id: 'pair',
      label: 'Occupied box states',
      value: '1-2',
      physics: true,
      options: [
        { value: '1-2', label: 'n = 1 and 2' },
        { value: '1-3', label: 'n = 1 and 3' },
        { value: '2-3', label: 'n = 2 and 3' },
        { value: '1-1', label: 'both in n = 1' },
      ],
    },
    { kind: 'toggle', id: 'swap', label: 'Swap the two electrons', value: false, physics: true },
    { kind: 'toggle', id: 'pauli', label: 'Exclusion principle', value: true, physics: true },
  ],
  build(p) {
    const kind = p.kind === 'symmetric' ? 'symmetric' : 'antisymmetric';
    const [a, b] = PAIRS[String(p.pair)] ?? [1, 2];
    const swap = Boolean(p.swap);
    const S = 1.6; // scene units per Angstrom on the x1, x2 square
    // the surface psi(x1, x2), or psi(x2, x1) after the swap
    const f = (x1: number, x2: number) =>
      swap ? boxPairPsi(a, b, PAULI_L, x2, x1, kind) : boxPairPsi(a, b, PAULI_L, x1, x2, kind);
    let peak = 0;
    for (let i = 0; i <= 40; i++)
      for (let j = 0; j <= 40; j++)
        peak = Math.max(
          peak,
          Math.abs(boxPairPsi(a, b, PAULI_L, (PAULI_L * i) / 40, (PAULI_L * j) / 40, kind)),
        );
    const Zs = peak > 0 ? 2.5 / peak : 1;
    const surf = surfaceLayer((u, v) => f(u / S, v / S), [0, PAULI_L * S], [0, PAULI_L * S], 60, 60, {
      group: 'surface',
      name: 'psi(x1, x2)',
      colormap: 'diverging',
      zScale: Zs,
      opacity: 0.9,
    });
    surf.range = [-Math.max(peak, 1e-12), Math.max(peak, 1e-12)];
    const W = PAULI_L * S;
    const layers: Layer[] = [
      surf,
      lines(
        [
          [
            [0, 0, 0],
            [W, W, 0],
          ],
        ],
        'ink',
        'diagonal',
        { name: 'x1 = x2', dashed: true },
      ),
      lines(
        [
          [
            [0, 0, 0],
            [W, 0, 0],
          ],
          [
            [W, 0, 0],
            [W, W, 0],
          ],
          [
            [W, W, 0],
            [0, W, 0],
          ],
          [
            [0, W, 0],
            [0, 0, 0],
          ],
        ],
        'muted',
        'square',
        { name: 'Both electrons in the box (0 to 5 A)' },
      ),
    ];
    // levels of one electron in the box, filled two at a time (or all in the lowest without the exclusion principle)
    const ne = Number(p.electrons);
    const occ = p.pauli ? fillLevels(ne, PAULI_LEVELS) : [ne, 0, 0, 0, 0];
    const E = Array.from({ length: PAULI_LEVELS }, (_, i) => boxEnergyEV(i + 1, PAULI_L));
    const zOf = (e: number) => (8 * e) / E[PAULI_LEVELS - 1]!;
    const x0 = W + 2;
    const plateW = p.pauli ? 2.4 : 6;
    const from: Vec3[] = [];
    const vec: Vec3[] = [];
    const head: ('solid' | 'open')[] = [];
    const col: Color[] = [];
    E.forEach((e, i) => {
      const z = zOf(e);
      layers.push(
        quadLayer([x0, 2, z], [plateW, 0, 0], [0, 3, 0], {
          group: 'levels',
          name: 'Levels of one electron',
          color: 'muted',
          opacity: 0.3,
        }),
      );
      for (let k = 0; k < occ[i]!; k++) {
        const up = p.pauli ? k % 2 === 0 : true;
        const xk = x0 + (plateW * (k + 0.5)) / Math.max(2, occ[i]!);
        from.push([xk, 3.5, up ? z + 0.05 : z + 0.85]);
        vec.push([0, 0, up ? 0.8 : -0.8]);
        head.push(up ? 'solid' : 'open');
        col.push(up ? 'pos' : 'neg');
      }
    });
    if (from.length)
      layers.push(arrows(from, vec, col, 'spins', { name: 'Electrons (up, down)', head, thickness: 0.06 }));
    const filled = occ.filter((k) => k > 0).length;
    const total = occ.reduce((s, k, i) => s + k * E[i]!, 0);
    layers.push(
      labels(
        [
          { text: 'x1', at: [W + 0.4, 0, 0] },
          { text: 'x2', at: [0, W + 0.4, 0] },
          { text: 'x1 = x2', at: [W + 0.3, W + 0.3, 0.3] },
          { text: `n = 1: ${fmt(E[0]!, 2)} eV`, at: [x0 + plateW + 0.6, 3.5, zOf(E[0]!)] },
          {
            text: `n = ${PAULI_LEVELS}: ${fmt(E[PAULI_LEVELS - 1]!, 1)} eV`,
            at: [x0 + plateW + 0.6, 3.5, zOf(E[PAULI_LEVELS - 1]!)],
          },
        ],
        'labels',
      ),
    );
    const zero = kind === 'antisymmetric' && a === b;
    const surfSay = zero
      ? `With both electrons in n = ${a} and the same spin, the antisymmetric wavefunction is zero everywhere: the state is forbidden.`
      : `The surface is psi(x1, x2) for one electron in n = ${a} and one in n = ${b}, ${kind}; ` +
        (kind === 'antisymmetric'
          ? 'it is zero along the dashed diagonal x1 = x2, so two such electrons are never found at the same place. '
          : 'it is largest near the diagonal, so the particles bunch together. ') +
        (swap
          ? kind === 'antisymmetric'
            ? 'After the swap every height has changed sign.'
            : 'After the swap nothing has changed.'
          : 'Toggle the swap to exchange x1 and x2.');
    const describe =
      `${ne} electron${ne === 1 ? '' : 's'} in a ${PAULI_L} A box, ` +
      (p.pauli
        ? `filled two per level (one up, solid head; one down, open head) up to level ${filled}`
        : `all in the lowest level, as if there were no exclusion principle`) +
      `; total energy ${fmt(total, 2)} eV. ${surfSay}`;
    return {
      layers,
      describe,
      camera: 'iso',
      readouts: [
        { label: 'Electrons', value: String(ne) },
        { label: 'Highest filled level', value: `n = ${filled}` },
        { label: 'Total energy', value: `${fmt(total, 2)} eV` },
        { label: 'psi on x1 = x2', value: kind === 'antisymmetric' ? '0 (always)' : 'not zero' },
      ],
      axes: ['x1 (1.6 units per A)', 'x2 (1.6 units per A)', 'psi; levels: energy'],
    };
  },
};

// ---------------------------------------------------------------------------------------------------------------------
// Why energy levels matter: a chain of N atoms whose levels split into bonding and antibonding, then into a band, as
// the atoms come closer; an alternating chain opens a gap.

const CHAIN_D0 = 2.5; // Angstrom: the distance where the hopping is t0 (the energy unit)
const chainCurves = new Map<string, Vec3[][]>();

function chainSpaghetti(
  n: number,
  delta: number,
  Y: (d: number) => number,
  Z: (e: number) => number,
  xs: number,
) {
  const key = `${n}|${delta.toFixed(3)}`;
  const hit = chainCurves.get(key);
  if (hit) return hit;
  const ds = Array.from({ length: 61 }, (_, i) => 1.5 + (2.5 * i) / 60);
  const per = ds.map((d) => chainEnergies(n, harrisonHopping(d, CHAIN_D0), delta));
  const out = Array.from({ length: n }, (_, k) => ds.map((d, i): Vec3 => [xs, Y(d), Z(per[i]![k]!)]));
  if (chainCurves.size > 80) chainCurves.clear();
  chainCurves.set(key, out);
  return out;
}

const chain: SceneDef = {
  id: 'm02-chain',
  title: 'From levels to bands in a chain of atoms',
  badge: 'toy-model',
  sources: ['S-050', 'S-036', 'S-140'],
  banner:
    'Toy model: one orbital per atom, nearest-neighbour hopping that grows as 1/d^2, energies in units of the hopping t0 at 2.5 A. It shows the trend, not a real material.',
  params: [
    {
      kind: 'slider',
      id: 'atoms',
      label: 'Atoms in the chain',
      min: 1,
      max: 20,
      step: 1,
      value: 2,
      digits: 0,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'distance',
      label: 'Distance between atoms',
      min: 1.5,
      max: 4,
      step: 0.05,
      value: 2.5,
      unit: 'Angstrom',
      digits: 2,
      physics: true,
    },
    {
      kind: 'slider',
      id: 'delta',
      label: 'Difference between atoms A and B (Delta)',
      min: 0,
      max: 1.5,
      step: 0.05,
      value: 0,
      unit: 't0',
      digits: 2,
      physics: true,
    },
    { kind: 'toggle', id: 'fill', label: 'Electrons (one per atom)', value: true },
  ],
  build(p) {
    const n = Math.round(Number(p.atoms));
    const d = Number(p.distance);
    const delta = Number(p.delta);
    const t = harrisonHopping(d, CHAIN_D0);
    const energies = chainEnergies(n, t, delta);
    const Z = (e: number) => 0.9 * e;
    const span = n > 1 ? (n - 1) * d : 0;
    const s = span > 9 ? 9 / span : 1; // the chain is drawn at most 9 units long
    const xOf = (j: number) => (j - (n - 1) / 2) * d * s;
    const half = Math.max(1.2, (span * s) / 2 + 0.6);
    const zAtoms = Z(-6.2);
    const xs = -6.5; // the plane of the level-versus-distance curves
    const Y = (dd: number) => (dd - 2.75) * 2.4;
    const atomPos: Vec3[] = Array.from({ length: n }, (_, j) => [xOf(j), 0, zAtoms]);
    const layers: Layer[] = [
      atoms(
        atomPos,
        0.35,
        atomPos.map((_, j) => (delta > 0 && j % 2 === 1 ? 'c1' : 'c0')),
        'atoms',
        {
          name: 'Atoms',
          labels: atomPos.map((_, j) => `${delta > 0 ? (j % 2 ? 'B' : 'A') : 'atom'} ${j + 1}`),
        },
      ),
    ];
    if (n > 1)
      layers.push(
        lines(
          atomPos.slice(1).map((q, j) => [atomPos[j]!, q] as [Vec3, Vec3]),
          'muted',
          'atoms',
          { tube: 0.05 },
        ),
      );
    // level plates over the chain
    energies.forEach((e) =>
      layers.push(
        quadLayer([-half, -0.7, Z(e)], [2 * half, 0, 0], [0, 1.4, 0], {
          group: 'levels',
          name: 'Energy levels',
          color: 'accent',
          opacity: 0.35,
        }),
      ),
    );
    // electrons, one per atom, two per level (up solid, down open)
    if (p.fill) {
      const occ = fillLevels(n, n);
      const from: Vec3[] = [];
      const vec: Vec3[] = [];
      const head: ('solid' | 'open')[] = [];
      const col: Color[] = [];
      occ.forEach((k, i) => {
        for (let q = 0; q < k; q++) {
          const up = q === 0;
          from.push([(up ? -0.25 : 0.25) + half - 0.4, 0, Z(energies[i]!) + (up ? 0.02 : 0.42)]);
          vec.push([0, 0, up ? 0.4 : -0.4]);
          head.push(up ? 'solid' : 'open');
          col.push(up ? 'pos' : 'neg');
        }
      });
      layers.push(arrows(from, vec, col, 'electrons', { name: 'Electrons', head, thickness: 0.08 }));
    }
    // levels as a function of distance (left), the current distance marked
    const curves = chainSpaghetti(n, delta, Y, Z, xs);
    curves.forEach((c) =>
      layers.push(curve(c, 'muted', 'versus-distance', { name: 'Levels versus distance' })),
    );
    layers.push(
      lines(
        [
          [
            [xs, Y(d), Z(-6.2)],
            [xs, Y(d), Z(6.2)],
          ],
          [
            [xs, Y(d), Z(energies[0]!)],
            [-half, 0, Z(energies[0]!)],
          ],
        ],
        'ink',
        'versus-distance',
        { dashed: true },
      ),
      points(
        energies.map((e): Vec3 => [xs, Y(d), Z(e)]),
        'ink',
        0.08,
        'versus-distance',
      ),
    );
    const width = energies[n - 1]! - energies[0]!;
    const homo = Math.ceil(n / 2) - 1;
    const gap = n % 2 === 0 && n > 1 ? energies[homo + 1]! - energies[homo]! : 0;
    const items: { text: string; at: Vec3 }[] = [
      { text: 'distance d', at: [xs, Y(4.1), Z(-6.2)] },
      { text: 'd = 1.5 A', at: [xs, Y(1.5), Z(-6.6)] },
      { text: 'E (t0)', at: [xs, Y(1.5), Z(6.6)] },
    ];
    if (n === 2) {
      items.push({ text: 'bonding', at: [half + 0.6, 0, Z(energies[0]!)] });
      items.push({ text: 'antibonding', at: [half + 0.6, 0, Z(energies[1]!)] });
    } else if (n >= 6) {
      items.push({ text: delta > 0 ? 'two bands' : 'a band', at: [half + 0.6, 0, Z(energies[n - 1]!)] });
      if (gap > 0.05)
        items.push({ text: 'gap', at: [half + 0.6, 0, Z((energies[homo]! + energies[homo + 1]!) / 2)] });
    }
    layers.push(labels(items, 'labels'));
    const what =
      n === 1
        ? 'one atom has one level'
        : n === 2
          ? `two atoms split one level into a bonding level at ${fmt(energies[0]!, 2)} and an antibonding level at ${fmt(energies[1]!, 2)} t0`
          : `${n} atoms spread the level into ${n} levels from ${fmt(energies[0]!, 2)} to ${fmt(energies[n - 1]!, 2)} t0, a band ${fmt(width, 2)} t0 wide`;
    const fillSay =
      n % 2 === 0
        ? gap > 1e-6
          ? `With one electron per atom the lowest ${n === 2 ? 'level is' : `${n / 2} levels are`} full and ${fmt(gap, 2)} t0 separates ${n === 2 ? 'it' : 'them'} from the first empty level.`
          : 'With one electron per atom the lower half is full.'
        : 'With one electron per atom the middle level is half full.';
    const describe =
      `A chain of ${n} atom${n === 1 ? '' : 's'} ${fmt(d, 2)} A apart (hopping ${fmt(t, 2)} t0${delta > 0 ? `, atoms alternate A at -${fmt(delta, 2)} and B at +${fmt(delta, 2)} t0` : ''}): ` +
      `${what}. The curves on the left show how every level moves with the distance; closer atoms spread the levels further. ${fillSay}`;
    return {
      layers,
      describe,
      camera: { eye: [4, -14, 4], up: [0, 0, 1] },
      readouts: [
        { label: 'Hopping t', value: `${fmt(t, 2)} t0` },
        { label: 'Spread of levels', value: `${fmt(width, 2)} t0` },
        {
          label: 'Gap above filled levels',
          value: n % 2 === 0 ? `${fmt(gap, 2)} t0` : '0 (half-filled level)',
        },
        {
          label: 'Infinite chain',
          value:
            infiniteChainBands(t, delta)
              .map(([lo, hi]) => `${fmt(lo, 2)} to ${fmt(hi, 2)}`)
              .join(' and ') + ' t0',
        },
      ],
      axes: ['x: along the chain', 'y: distance d (left curves)', 'z: energy (t0)'],
    };
  },
};

export const scenes: Record<string, SceneDef> = {
  [orbital.id]: orbital,
  [box.id]: box,
  [packet.id]: packet,
  [helix.id]: helix,
  [pauli.id]: pauli,
  [chain.id]: chain,
};
