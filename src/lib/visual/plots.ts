// Question visuals, part 1 (M12.3): small computed plots as SVG strings. Pure functions, no DOM, so the same string is
// made at build time (no JavaScript needed) and nothing here ships to the browser. Every number comes from an existing,
// tested physics module; nothing is typed in by hand. The picture never states an answer: titles say what is drawn.
// @source S-047 (box, hydrogen), S-048 and S-049 (cost scaling, Hartree-Fock and Kohn-Sham toy lab, tight-binding band)
import { boxDensity, boxEnergyEV, boxPsi } from '../physics/box';
import { slaterDeterminants, log10Big } from '../physics/combinatorics';
import { HBAR2_OVER_2M_EV_A2 } from '../physics/constants';
import {
  energyEV,
  mostProbableRadius,
  radialNodeRadii,
  radialProbability,
  radialQuantile,
  realYlm,
} from '../physics/hydrogen';
import { log10RelativeCost, methodById, type MethodId } from '../physics/scaling';
import { runScf, type ScfOptions, type ScfResult } from '../physics/scf1d';
import { dispersion } from '../physics/tightbinding2d';

export type PlotBadge = 'computed' | 'toy-model' | 'illustrative';
export interface PlotOut {
  svg: string;
  badge: PlotBadge;
}
type P = Record<string, unknown>;

export const PLOT_IDS = [
  'box-levels',
  'box-wave',
  'box-mix',
  'hydrogen-radial',
  'hydrogen-levels',
  'orbital-slice',
  'occupation',
  'spin-ladders',
  'de-broglie',
  'band-chain',
  'band-gap',
  'exp-wall',
  'grid-wall',
  'cost-scaling',
  'scf-trace',
  'scf-density',
  'density-box',
  'steps',
] as const;
export type PlotId = (typeof PLOT_IDS)[number];

const W = 360;
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r1 = (x: number): string => (Math.round(x * 10) / 10).toString();
const num = (p: P, k: string, d: number): number => (typeof p[k] === 'number' ? (p[k] as number) : d);
const arr = <T>(p: P, k: string, d: T[]): T[] => (Array.isArray(p[k]) ? (p[k] as T[]) : d);

function wrap(alt: string, h: number, body: string): string {
  return `<svg class="vp" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(alt)}">${body}</svg>`;
}
const text = (x: number, y: number, s: string, cls = 'vp-t', anchor = 'middle'): string =>
  `<text class="${cls}" x="${r1(x)}" y="${r1(y)}" text-anchor="${anchor}">${esc(s)}</text>`;
const line = (x1: number, y1: number, x2: number, y2: number, cls: string): string =>
  `<line class="${cls}" x1="${r1(x1)}" y1="${r1(y1)}" x2="${r1(x2)}" y2="${r1(y2)}"/>`;
const path = (pts: [number, number][], cls: string, close = false): string =>
  `<path class="${cls}" d="M${pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join('L')}${close ? 'Z' : ''}"/>`;

interface Chart {
  h: number;
  sx: (x: number) => number;
  sy: (y: number) => number;
  axes: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
/** A plain chart frame: left and bottom axes, axis titles, no numbers unless `ticks` are given. */
function chart(
  xmin: number,
  xmax: number,
  ymin: number,
  ymax: number,
  xlabel: string,
  ylabel: string,
  opts: { h?: number; xticks?: [number, string][]; yticks?: [number, string][] } = {},
): Chart {
  const h = opts.h ?? 200;
  const x0 = 46;
  const x1 = W - 14;
  const y0 = h - 36;
  const y1 = 14;
  const sx = (x: number) => x0 + ((x - xmin) / (xmax - xmin || 1)) * (x1 - x0);
  const sy = (y: number) => y0 - ((y - ymin) / (ymax - ymin || 1)) * (y0 - y1);
  let axes = line(x0, y0, x1, y0, 'vp-axis') + line(x0, y0, x0, y1, 'vp-axis');
  axes += text((x0 + x1) / 2, h - 8, xlabel, 'vp-t');
  axes += `<text class="vp-t" transform="translate(12 ${r1((y0 + y1) / 2)}) rotate(-90)" text-anchor="middle">${esc(ylabel)}</text>`;
  for (const [v, s] of opts.xticks ?? [])
    axes += line(sx(v), y0, sx(v), y0 + 4, 'vp-axis') + text(sx(v), y0 + 16, s, 'vp-t');
  for (const [v, s] of opts.yticks ?? [])
    axes += line(x0 - 4, sy(v), x0, sy(v), 'vp-axis') + text(x0 - 7, sy(v) + 4, s, 'vp-t', 'end');
  return { h, sx, sy, axes, x0, x1, y0, y1 };
}
const sample = (a: number, b: number, n: number): number[] =>
  Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
const key = (o: unknown): string => JSON.stringify(o);

/* ---- box ---- */

function boxLevels(p: P): string {
  const Ls = arr<number>(p, 'Ls', [num(p, 'L', 5)]);
  const nMax = num(p, 'nMax', 5);
  const mark = num(p, 'mark', 0);
  const values = p.values === true;
  const h = 210;
  const top = Math.max(...Ls.map((L) => boxEnergyEV(nMax, L)));
  const c = chart(0, 1, 0, top * 1.05, '', 'Energy', { h: h - 10 });
  const colW = (c.x1 - c.x0) / Ls.length;
  let body = line(c.x0, c.y0, c.x0, c.y1, 'vp-axis') + line(c.x0, c.y0, c.x1, c.y0, 'vp-axis');
  body += `<text class="vp-t" transform="translate(12 ${r1((c.y0 + c.y1) / 2)}) rotate(-90)" text-anchor="middle">Energy</text>`;
  Ls.forEach((L, i) => {
    const xa = c.x0 + i * colW + 16;
    const xb = c.x0 + (i + 1) * colW - 16;
    for (let n = 1; n <= nMax; n++) {
      const y = c.sy(boxEnergyEV(n, L));
      body += line(xa, y, xb, y, n === mark ? 'vp-curve vp-heavy' : 'vp-curve');
      body += text(xa - 4, y + 4, `n = ${n}`, 'vp-t', 'end');
      if (values) body += text(xb + 4, y + 4, `${boxEnergyEV(n, L).toFixed(1)} eV`, 'vp-t', 'start');
    }
    body += text((xa + xb) / 2, h - 18, `L = ${L} Å`, 'vp-t');
  });
  return wrap(p.alt as string, h, body);
}

function boxWave(p: P): string {
  const L = num(p, 'L', 5);
  const n = num(p, 'n', 1);
  const dens = p.density === true;
  const both = p.both === true;
  const showNodes = p.nodes !== false;
  const amp = Math.sqrt(2 / L);
  const ymax = dens ? Math.max(amp * amp, amp) * 1.1 : amp * 1.15;
  const c = chart(
    0,
    L,
    -ymax * (dens && !both ? 0 : 1),
    ymax,
    `position in the box, 0 to L = ${L} Å`,
    dens && !both ? 'Probability density' : 'Wavefunction',
  );
  const xs = sample(0, L, 120);
  let body = c.axes;
  if (!(dens && !both)) body += line(c.x0, c.sy(0), c.x1, c.sy(0), 'vp-zero');
  if (dens && !both) {
    body += path(
      [
        [c.sx(0), c.sy(0)],
        ...xs.map((x) => [c.sx(x), c.sy(boxPsi(n, L, x) ** 2)] as [number, number]),
        [c.sx(L), c.sy(0)],
      ],
      'vp-fill',
      true,
    );
    body += path(
      xs.map((x) => [c.sx(x), c.sy(boxPsi(n, L, x) ** 2)]),
      'vp-curve',
    );
  } else {
    body += path(
      xs.map((x) => [c.sx(x), c.sy(boxPsi(n, L, x))]),
      'vp-curve',
    );
    if (both)
      body += path(
        xs.map((x) => [c.sx(x), c.sy(-boxPsi(n, L, x))]),
        'vp-curve2',
      );
    for (let k = 1; showNodes && k < n; k++)
      body += `<circle class="vp-node" cx="${r1(c.sx((k * L) / n))}" cy="${r1(c.sy(0))}" r="3.5"/>`;
    if (dens) {
      body += path(
        xs.map((x) => [c.sx(x), c.sy(boxPsi(n, L, x) ** 2)]),
        'vp-curve3',
      );
    }
  }
  return wrap(p.alt as string, c.h, body);
}

function boxMix(p: P): string {
  const L = num(p, 'L', 5);
  const n = num(p, 'n', 1);
  const m = num(p, 'm', 2);
  const w = num(p, 'w', 0.5);
  const phases = arr<number>(p, 'phases', [0, 0.5]);
  const ymax =
    Math.max(...sample(0, L, 100).flatMap((x) => phases.map((ph) => boxDensity(L, n, m, w, ph, x)))) * 1.1;
  const c = chart(0, L, 0, ymax, `position in the box, 0 to L = ${L} Å`, 'Probability density');
  let body = c.axes;
  phases.forEach((ph, i) => {
    body += path(
      sample(0, L, 120).map((x) => [c.sx(x), c.sy(boxDensity(L, n, m, w, ph, x))]),
      i === 0 ? 'vp-curve' : 'vp-curve2',
    );
  });
  body += legend(
    c,
    phases.map((ph, i) => [
      i === 0 ? 'vp-curve' : 'vp-curve2',
      `${ph === 0 ? 'start' : `later (${ph} of a beat)`}`,
    ]),
  );
  return wrap(p.alt as string, c.h, body);
}

function legend(c: Chart, items: [string, string][]): string {
  let s = '';
  items.forEach(([cls, label], i) => {
    const y = c.y1 + 8 + i * 15;
    s += line(c.x1 - 118, y, c.x1 - 98, y, cls) + text(c.x1 - 94, y + 4, label, 'vp-t', 'start');
  });
  return s;
}

/* ---- hydrogen ---- */

function hydrogenRadial(p: P): string {
  const n = num(p, 'n', 1);
  const l = num(p, 'l', 0);
  const xmax = radialQuantile(n, l, 0.995);
  const peak = mostProbableRadius(n, l);
  const xs = sample(0, xmax, 200);
  const ymax = Math.max(...xs.map((r) => radialProbability(n, l, r))) * 1.15;
  const c = chart(0, xmax, 0, ymax, 'distance from the nucleus (bohr radii)', 'Radial probability');
  let body = c.axes;
  body += path(
    [
      [c.sx(0), c.sy(0)],
      ...xs.map((r) => [c.sx(r), c.sy(radialProbability(n, l, r))] as [number, number]),
      [c.sx(xmax), c.sy(0)],
    ],
    'vp-fill',
    true,
  );
  body += path(
    xs.map((r) => [c.sx(r), c.sy(radialProbability(n, l, r))]),
    'vp-curve',
  );
  if (p.mark !== false)
    body +=
      line(c.sx(peak), c.y0, c.sx(peak), c.sy(radialProbability(n, l, peak)), 'vp-guide') +
      text(c.sx(peak) + 4, c.y1 + 10, 'highest point', 'vp-t', 'start');
  for (const r of radialNodeRadii(n, l))
    body += `<circle class="vp-node" cx="${r1(c.sx(r))}" cy="${r1(c.sy(0))}" r="3.5"/>`;
  return wrap(p.alt as string, c.h, body);
}

function hydrogenLevels(p: P): string {
  const nMax = num(p, 'nMax', 4);
  const mark = num(p, 'mark', 0);
  const letters = ['s', 'p', 'd', 'f'];
  const h = 210;
  const e1 = energyEV(1);
  const c = chart(0, 1, e1 * 1.08, 0, '', 'Energy', { h: h - 10 });
  let body = line(c.x0, c.y0, c.x0, c.y1, 'vp-axis');
  body += `<text class="vp-t" transform="translate(12 ${r1((c.y0 + c.y1) / 2)}) rotate(-90)" text-anchor="middle">Energy (zero at the top)</text>`;
  for (let n = 1; n <= nMax; n++) {
    const y = c.sy(energyEV(n));
    body += line(c.x0 + 20, y, c.x1 - 90, y, n === mark ? 'vp-curve vp-heavy' : 'vp-curve');
    body += text(c.x0 + 16, y + 4, `n = ${n}`, 'vp-t', 'end');
    body += text(
      c.x1 - 84,
      y + 4,
      Array.from({ length: n }, (_, l) => `${n}${letters[l]}`).join(' '),
      'vp-t',
      'start',
    );
  }
  body += line(c.x0, c.sy(0), c.x1 - 90, c.sy(0), 'vp-guide');
  return wrap(p.alt as string, h, body);
}

let hatchSeq = 0;
function orbitalSlice(p: P): string {
  const list = arr<{ l: number; m: number; plane?: 'xz' | 'xy'; label: string }>(p, 'orbitals', []);
  const size = 104;
  const h = size + 54;
  const gap = (W - list.length * size) / (list.length + 1);
  const hid = `vp-hatch-${hatchSeq++}`;
  // the hatched fill marks the negative lobes, so the sign never depends on colour alone
  let body = `<defs><pattern id="${hid}" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="vp-hatchline" x1="0" y1="0" x2="0" y2="5"/></pattern></defs>`;
  list.forEach((o, i) => {
    const cx = gap * (i + 1) + size * i + size / 2;
    const cy = size / 2 + 10;
    const R = size / 2 - 8;
    const pts: { x: number; y: number; v: number }[] = [];
    for (let k = 0; k < 360; k++) {
      const a = (k * Math.PI) / 180;
      const u = o.plane === 'xy' ? [Math.cos(a), Math.sin(a), 0] : [Math.sin(a), 0, Math.cos(a)];
      const v = realYlm(o.l, o.m, u[0]!, u[1]!, u[2]!);
      pts.push({ x: o.plane === 'xy' ? u[0]! : u[0]!, y: o.plane === 'xy' ? u[1]! : u[2]!, v });
    }
    const vmax = Math.max(...pts.map((q) => Math.abs(q.v))) || 1;
    body += line(cx - R, cy, cx + R, cy, 'vp-zero') + line(cx, cy - R, cx, cy + R, 'vp-zero');
    for (const sign of [1, -1]) {
      let seg: [number, number][] = [];
      const flush = () => {
        if (seg.length > 2)
          body += path([[cx, cy], ...seg], sign > 0 ? 'vp-pos' : 'vp-neg', true).replace(
            '/>',
            sign > 0 ? '/>' : ` fill="url(#${hid})"/>`,
          );
        seg = [];
      };
      for (const q of pts) {
        if (q.v * sign > 1e-9)
          seg.push([cx + (q.x * Math.abs(q.v) * R) / vmax, cy - (q.y * Math.abs(q.v) * R) / vmax]);
        else flush();
      }
      flush();
    }
    body += text(cx, cy + size / 2 + 14, o.label, 'vp-t');
    body += text(
      cx,
      cy + size / 2 + 28,
      o.plane === 'xy' ? 'cut in the x-y plane' : 'cut in the x-z plane',
      'vp-t vp-small',
    );
  });
  return wrap(p.alt as string, h, body);
}

/* ---- spin and shells ---- */

function arrow(x: number, y0: number, y1: number): string {
  const up = y1 < y0;
  const d = up ? 5 : -5;
  return `${line(x, y0, x, y1, 'vp-arrow')}<path class="vp-arrowhead" d="M${r1(x)} ${r1(y1)}L${r1(x - 4)} ${r1(y1 + d)}L${r1(x + 4)} ${r1(y1 + d)}Z"/>`;
}

function occupation(p: P): string {
  const labels = arr<string>(p, 'labels', []);
  const filled = arr<number>(p, 'filled', []);
  const count = Math.max(labels.length, filled.length, num(p, 'orbitals', 1));
  const bw = 40;
  const gap = Math.min(16, (W - 20 - count * bw) / Math.max(1, count - 1));
  const total = count * bw + (count - 1) * gap;
  const x0 = (W - total) / 2;
  let body = '';
  for (let i = 0; i < count; i++) {
    const x = x0 + i * (bw + gap);
    body += `<rect class="vp-box" x="${r1(x)}" y="30" width="${bw}" height="64" rx="4"/>`;
    const f = filled[i] ?? 0;
    if (f >= 1) body += arrow(x + bw / 2 - 8, 86, 38);
    if (f >= 2) body += arrow(x + bw / 2 + 8, 38, 86);
    body += text(x + bw / 2, 112, labels[i] ?? '', 'vp-t');
  }
  body += text(W / 2, 14, (p.title as string) ?? 'One box is one orbital', 'vp-t');
  return wrap(p.alt as string, 128, body);
}

function spinLadders(p: P): string {
  const levels = num(p, 'levels', 3);
  const up = arr<number>(p, 'up', [1, 1, 0]);
  const down = arr<number>(p, 'down', [1, 0, 0]);
  const h = 40 + levels * 36;
  let body = text(W * 0.28, 16, 'spin up', 'vp-t') + text(W * 0.72, 16, 'spin down', 'vp-t');
  for (let i = 0; i < levels; i++) {
    const y = h - 22 - i * 36;
    for (const [cx, arrOn, dir] of [
      [W * 0.28, up[i] ?? 0, 'up'],
      [W * 0.72, down[i] ?? 0, 'down'],
    ] as const) {
      body += line(cx - 42, y, cx + 42, y, 'vp-curve');
      if (arrOn) body += dir === 'up' ? arrow(cx, y - 1, y - 24) : arrow(cx, y - 24, y - 1);
    }
  }
  return wrap(p.alt as string, h, body);
}

function deBroglie(p: P): string {
  const emax = num(p, 'emax', 150);
  const es = sample(1, emax, 150);
  const lam = (e: number) => (2 * Math.PI) / Math.sqrt(e / HBAR2_OVER_2M_EV_A2);
  const c = chart(0, emax, 0, lam(1) * 1.05, 'kinetic energy of the electron', 'de Broglie wavelength');
  return wrap(
    p.alt as string,
    c.h,
    c.axes +
      path(
        es.map((e) => [c.sx(e), c.sy(lam(e))]),
        'vp-curve',
      ),
  );
}

/* ---- bands ---- */

function bandChain(p: P): string {
  const sizes = arr<number>(p, 'sizes', [2, 4, 8, 16]);
  const t = 1;
  const h = 40 + sizes.length * 38;
  const xa = 70;
  const xb = W - 20;
  const sx = (e: number) => xa + ((e + 2 * t) / (4 * t)) * (xb - xa);
  let body = text((xa + xb) / 2, 14, 'energy of each level', 'vp-t');
  sizes.forEach((N, i) => {
    const y = 34 + i * 38;
    body += text(xa - 8, y + 5, `${N} sites`, 'vp-t', 'end') + line(xa, y, xb, y, 'vp-zero');
    for (let j = 0; j < N; j++) {
      const e = dispersion((2 * Math.PI * j) / N, Math.PI / 2, t);
      body += line(sx(e), y - 9, sx(e), y + 9, 'vp-tick');
    }
  });
  return wrap(p.alt as string, h, body);
}

function bandGap(p: P): string {
  const dos = p.dos === true;
  const N = 48;
  const t = 1;
  const es = Array.from({ length: N }, (_, j) => dispersion((2 * Math.PI * j) / N, Math.PI / 2, t)).sort(
    (a, b) => a - b,
  );
  const h = 200;
  const c = chart(0, 1, -2.4, 2.4, '', 'Energy', { h });
  let body = line(c.x0, c.y0, c.x0, c.y1, 'vp-axis');
  body += `<text class="vp-t" transform="translate(12 ${r1((c.y0 + c.y1) / 2)}) rotate(-90)" text-anchor="middle">Energy</text>`;
  if (dos) {
    const bins = 12;
    const counts = new Array<number>(bins).fill(0);
    for (const e of es) counts[Math.min(bins - 1, Math.floor(((e + 2) / 4) * bins))]!++;
    const cmax = Math.max(...counts);
    counts.forEach((cnt, b) => {
      const ya = c.sy(-2 + (4 * (b + 1)) / bins);
      const yb = c.sy(-2 + (4 * b) / bins);
      body += `<rect class="vp-bar" x="${c.x0 + 2}" y="${r1(ya)}" width="${r1((cnt / cmax) * 200)}" height="${r1(yb - ya - 1)}"/>`;
    });
    body += text(c.x0 + 100, h - 8, 'number of levels at each energy', 'vp-t');
  } else {
    const gap = 1.2;
    body += `<rect class="vp-band vp-filled" x="${c.x0 + 60}" y="${r1(c.sy(-0.2))}" width="90" height="${r1(c.sy(-2.2) - c.sy(-0.2))}"/>`;
    body += `<rect class="vp-band" x="${c.x0 + 60}" y="${r1(c.sy(2.2))}" width="90" height="${r1(c.sy(gap - 0.2) - c.sy(2.2))}"/>`;
    body += text(c.x0 + 105, c.sy(-1.2) + 4, 'band, full', 'vp-t');
    body += text(c.x0 + 105, c.sy(1.2) + 4, 'band, empty', 'vp-t');
    if (p.labels !== false) {
      body += `<text class="vp-t" x="${c.x0 + 170}" y="${r1(c.sy(0.5) + 4)}" text-anchor="start">gap</text>`;
      body += line(c.x0 + 160, c.sy(-0.2), c.x0 + 160, c.sy(gap - 0.2), 'vp-guide');
    }
  }
  return wrap(p.alt as string, h, body);
}

/* ---- counting and cost ---- */

function expWall(p: P): string {
  const per = num(p, 'perElectron', 4);
  const nMax = num(p, 'maxN', 20);
  const ns = Array.from({ length: nMax }, (_, i) => i + 1);
  const ys = ns.map((n) => log10Big(slaterDeterminants(n, n * per)));
  const ymax = Math.ceil(Math.max(...ys));
  const c = chart(1, nMax, 0, ymax, 'number of electrons', 'Determinants (powers of ten)', {
    xticks: [
      [1, '1'],
      [nMax, String(nMax)],
    ],
    yticks: [
      [0, '10^0'],
      [ymax, `10^${ymax}`],
    ],
  });
  return wrap(
    p.alt as string,
    c.h,
    c.axes +
      path(
        ns.map((n, i) => [c.sx(n), c.sy(ys[i]!)]),
        'vp-curve',
      ),
  );
}

function gridWall(p: P): string {
  const pts = num(p, 'points', 10);
  const nMax = num(p, 'maxN', 6);
  const ymax = 3 * nMax * Math.log10(pts);
  const c = chart(1, nMax, 0, ymax, 'number of electrons', 'Values to store (powers of ten)', {
    xticks: [
      [1, '1'],
      [nMax, String(nMax)],
    ],
  });
  const ns = Array.from({ length: nMax }, (_, i) => i + 1);
  return wrap(
    p.alt as string,
    c.h,
    c.axes +
      path(
        ns.map((n) => [c.sx(n), c.sy(3 * n * Math.log10(pts))]),
        'vp-curve',
      ) +
      ns
        .map(
          (n) =>
            `<circle class="vp-node vp-solid" cx="${r1(c.sx(n))}" cy="${r1(c.sy(3 * n * Math.log10(pts)))}" r="3"/>`,
        )
        .join(''),
  );
}

const SHORT: Record<MethodId, string> = {
  'force-field': 'FF',
  dft: 'DFT',
  hf: 'HF',
  mp2: 'MP2',
  ccsd: 'CCSD',
  ccsdt: 'CCSD(T)',
  fci: 'exact',
};
function costScaling(p: P): string {
  const ids = arr<MethodId>(p, 'methods', ['dft']);
  const f = (id: MethodId, v: number) => log10RelativeCost(id, 10 ** v);
  const ymax = Math.max(...ids.map((id) => f(id, 2)), 1);
  const c = chart(0, 2, 0, ymax, 'system size (log scale)', 'Cost (log scale)');
  const dashes = ['vp-curve', 'vp-curve2', 'vp-curve3', 'vp-curve4', 'vp-curve5', 'vp-curve6', 'vp-curve7'];
  let body = c.axes;
  ids.forEach((id, i) => {
    body += path(
      sample(0, 2, 60).map((v) => [c.sx(v), c.sy(f(id, v))]),
      dashes[i % dashes.length]!,
    );
  });
  body += legend(
    c,
    ids.map((id, i) => [
      dashes[i % dashes.length]!,
      `${SHORT[id]}${methodById(id).exponent ? ` (power ${methodById(id).exponent})` : ''}`,
    ]),
  );
  return wrap(p.alt as string, c.h, body);
}

/* ---- toy SCF lab ---- */

const scfCache = new Map<string, ScfResult>();
function scf(o: ScfOptions): ScfResult {
  const k = key(o);
  let r = scfCache.get(k);
  if (!r) scfCache.set(k, (r = runScf(o)));
  return r;
}

function scfTrace(p: P): string {
  const o: ScfOptions = { Z: num(p, 'Z', 2), alpha: num(p, 'alpha', 0.3), tol: num(p, 'tol', 1e-8) };
  if (p.nonInteracting === true) o.nonInteracting = true;
  if (typeof p.maxIterations === 'number') o.maxIterations = p.maxIterations;
  const r = scf(o);
  const its = r.iterations.slice(0, num(p, 'show', 40));
  const energy = p.series === 'energy';
  const ys = its.map((it) => (energy ? it.totalEnergy : Math.log10(Math.max(it.residual, 1e-16))));
  const ymin = Math.min(...ys);
  const ymax = Math.max(...ys);
  const pad = (ymax - ymin || 1) * 0.1;
  const c = chart(
    1,
    Math.max(its.length, 2),
    ymin - pad,
    ymax + pad,
    'iteration',
    energy ? 'Energy of each iteration' : 'Change in density (powers of ten)',
  );
  const pts = its.map((it, i) => [c.sx(it.iteration), c.sy(ys[i]!)] as [number, number]);
  return wrap(
    p.alt as string,
    c.h,
    c.axes +
      path(pts, 'vp-curve') +
      pts.map(([x, y]) => `<circle class="vp-node vp-solid" cx="${r1(x)}" cy="${r1(y)}" r="2.5"/>`).join(''),
  );
}

function scfDensity(p: P): string {
  const Zs = arr<number>(p, 'Zs', [2]);
  const runs = Zs.map((Z) => scf({ Z }));
  const x = runs[0]!.x;
  const half = num(p, 'half', 7);
  const idx = Array.from(x.keys()).filter((i) => Math.abs(x[i]!) <= half);
  const dens = runs.map((r) => r.iterations[r.iterations.length - 1]!.densityOut);
  const dmax = Math.max(...dens.flatMap((d) => idx.map((i) => d[i]!))) * 1.1;
  const showPot = p.potential !== false && runs.length === 1;
  const c = chart(
    -half,
    half,
    showPot ? -1.1 : 0,
    dmax,
    'position (bohr)',
    showPot ? 'Density (filled) and potential (dashed, scaled)' : 'Electron density',
  );
  let body = c.axes;
  dens.forEach((d, k) => {
    const pts = idx.map((i) => [c.sx(x[i]!), c.sy(d[i]!)] as [number, number]);
    if (k === 0) body += path([[c.sx(-half), c.sy(0)], ...pts, [c.sx(half), c.sy(0)]], 'vp-fill', true);
    body += path(pts, k === 0 ? 'vp-curve' : 'vp-curve2');
  });
  if (showPot) {
    const v = runs[0]!.vext;
    const vmin = Math.min(...idx.map((i) => v[i]!));
    body += path(
      idx.map((i) => [c.sx(x[i]!), c.sy((v[i]! / Math.abs(vmin)) * 1.0 * (dmax / 1.1) * 0.9)]),
      'vp-curve2',
    );
  }
  if (runs.length > 1)
    body += legend(
      c,
      Zs.map((Z, k) => [k === 0 ? 'vp-curve' : 'vp-curve2', `nuclear charge ${Z}`]),
    );
  return wrap(p.alt as string, c.h, body);
}

function densityBox(p: P): string {
  const L = num(p, 'L', 5);
  const N = num(p, 'electrons', 2);
  const full = Math.floor(N / 2);
  const dens = (x: number) => {
    let s = 0;
    for (let n = 1; n <= full; n++) s += 2 * boxPsi(n, L, x) ** 2;
    if (N % 2) s += boxPsi(full + 1, L, x) ** 2;
    return s;
  };
  const xs = sample(0, L, 160);
  const ymax = Math.max(...xs.map(dens)) * 1.15;
  const c = chart(0, L, 0, ymax, `position in the box, 0 to L = ${L} Å`, 'Electron density');
  const pts = xs.map((x) => [c.sx(x), c.sy(dens(x))] as [number, number]);
  return wrap(
    p.alt as string,
    c.h,
    c.axes + path([[c.sx(0), c.sy(0)], ...pts, [c.sx(L), c.sy(0)]], 'vp-fill', true) + path(pts, 'vp-curve'),
  );
}

/* ---- flow of steps ---- */

interface Step {
  label: string;
  note?: string;
}
function wrapLine(s: string, max: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const w of s.split(' ')) {
    if ((cur + ' ' + w).trim().length > max) {
      out.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}
function steps(p: P): string {
  const items = arr<Step>(p, 'items', []);
  const active = num(p, 'active', -1);
  const loop = p.loop === true;
  const bx = loop ? 28 : 20;
  const bw = W - bx - (loop ? 40 : 20);
  let y = 10;
  let body = '';
  items.forEach((it, i) => {
    const lines = wrapLine(it.label, 46);
    const noteLines = it.note ? wrapLine(it.note, 52) : [];
    const h = 14 + lines.length * 15 + noteLines.length * 13;
    body += `<rect class="vp-step${i === active ? ' vp-active' : ''}" x="${bx}" y="${y}" width="${bw}" height="${h}" rx="6"/>`;
    lines.forEach(
      (l, k) => (body += text(bx + 10, y + 18 + k * 15, l, i === active ? 'vp-t vp-b' : 'vp-t', 'start')),
    );
    noteLines.forEach(
      (l, k) => (body += text(bx + 10, y + 18 + lines.length * 15 + k * 13 - 2, l, 'vp-t vp-small', 'start')),
    );
    if (i < items.length - 1) body += arrowDown(bx + bw / 2, y + h, y + h + 10);
    y += h + 10;
  });
  if (loop && items.length > 1) {
    const x = bx + bw + 14;
    body += `<path class="vp-curve" d="M${bx + bw} 24 H${x} V${y - 24} H${bx + bw + 2}"/>`;
    body += `<path class="vp-arrowhead" d="M${bx + bw} ${y - 24}l7 -4v8Z"/>`;
  }
  return wrap(p.alt as string, y + 2, body);
}
function arrowDown(x: number, y0: number, y1: number): string {
  return `${line(x, y0, x, y1 - 4, 'vp-curve')}<path class="vp-arrowhead" d="M${r1(x)} ${r1(y1)}l-4 -6h8Z"/>`;
}

const RENDER: Record<PlotId, { fn: (p: P) => string; badge: PlotBadge }> = {
  'box-levels': { fn: boxLevels, badge: 'computed' },
  'box-wave': { fn: boxWave, badge: 'computed' },
  'box-mix': { fn: boxMix, badge: 'computed' },
  'hydrogen-radial': { fn: hydrogenRadial, badge: 'computed' },
  'hydrogen-levels': { fn: hydrogenLevels, badge: 'computed' },
  'orbital-slice': { fn: orbitalSlice, badge: 'computed' },
  occupation: { fn: occupation, badge: 'illustrative' },
  'spin-ladders': { fn: spinLadders, badge: 'illustrative' },
  'de-broglie': { fn: deBroglie, badge: 'computed' },
  'band-chain': { fn: bandChain, badge: 'toy-model' },
  'band-gap': { fn: bandGap, badge: 'toy-model' },
  'exp-wall': { fn: expWall, badge: 'computed' },
  'grid-wall': { fn: gridWall, badge: 'computed' },
  'cost-scaling': { fn: costScaling, badge: 'computed' },
  'scf-trace': { fn: scfTrace, badge: 'toy-model' },
  'scf-density': { fn: scfDensity, badge: 'toy-model' },
  'density-box': { fn: densityBox, badge: 'computed' },
  steps: { fn: steps, badge: 'illustrative' },
};

export function isPlotId(id: string): id is PlotId {
  return (PLOT_IDS as readonly string[]).includes(id);
}

/** Renders a plot to an SVG string. Throws on an unknown id so a typo fails the build. */
export function renderPlot(id: string, params: P, alt: string): PlotOut {
  if (!isPlotId(id)) throw new Error(`unknown plot "${id}". Known: ${PLOT_IDS.join(', ')}`);
  const r = RENDER[id];
  return { svg: r.fn({ ...params, alt }), badge: r.badge };
}
