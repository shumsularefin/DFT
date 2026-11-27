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
import { HARTREE_EV, runScf, type ScfOptions, type ScfResult } from '../physics/scf1d';
import { dispersion } from '../physics/tightbinding2d';
import { allElectronLike, pseudo as pawPseudo } from '../physics/paw';
import { dudarevEnergy, dudarevPotential } from '../physics/dftu';
import { SMEARINGS, delta as smearDelta, occupation as smearOcc, type SmearingId } from '../physics/smearing';

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
  'pw-parabola',
  'pw-count',
  'smearing-curves',
  'dftu-penalty',
  'kmesh-grid',
  'bz-1d',
  'paw-radial',
  'ladder-rungs',
  'ispin-ladders',
  'dof-cell',
  'ionic-steps',
  'ediff-trace',
  'force-band',
  'sigma-width',
  'file-flow',
  'restart-chain',
  'oszicar-trace',
  'parallel-split',
  'conv-series',
  'scf-iterations',
  'density-map',
  'pw-sphere',
  'bands-dos',
  'real-reciprocal',
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

/** Rough width of a label in user units at the 11 px plot font (about 0.56 em per character): enough for layout. */
const textWidth = (s: string): number => (/^10\^/.test(s) ? 2 + 0.75 * (s.length - 3) : s.length) * 6.2;
/** One line when it fits the length `room`, else two lines split at the space nearest the middle. */
function splitTitle(s: string, room: number): string[] {
  if (textWidth(s) <= room) return [s];
  let best = -1;
  for (let i = 0; i < s.length; i++)
    if (s[i] === ' ' && (best < 0 || Math.abs(i - s.length / 2) < Math.abs(best - s.length / 2))) best = i;
  return best < 0 ? [s] : [s.slice(0, best), s.slice(best + 1)];
}
/** A tick label; "10^19" is drawn as 10 with a raised, smaller 19 (the page font has no superscript digits). */
function tickText(x: number, y: number, s: string, anchor: string): string {
  const m = /^10\^(-?\d+)$/.exec(s);
  if (!m) return text(x, y, s, 'vp-t', anchor);
  return `<text class="vp-t" x="${r1(x)}" y="${r1(y)}" text-anchor="${anchor}">10<tspan class="vp-sup" dy="-4">${m[1]}</tspan></text>`;
}

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
  const y0 = h - 36;
  const y1 = 14;
  // the y title is one rotated line, or two when it is longer than the axis; the tick labels sit between it and the
  // axis, so the plot area starts far enough right that neither ever overlaps the other
  const yLines = splitTitle(ylabel, y0 - y1);
  const titleRight = yLines.length > 1 ? 33 : 17;
  const tickW = Math.max(0, ...(opts.yticks ?? []).map(([, s]) => textWidth(s)));
  const x0 = Math.max(46, Math.ceil(titleRight + 4 + tickW + 7));
  const x1 = W - 14;
  const sx = (x: number) => x0 + ((x - xmin) / (xmax - xmin || 1)) * (x1 - x0);
  const sy = (y: number) => y0 - ((y - ymin) / (ymax - ymin || 1)) * (y0 - y1);
  let axes = line(x0, y0, x1, y0, 'vp-axis') + line(x0, y0, x0, y1, 'vp-axis');
  axes += text((x0 + x1) / 2, h - 8, xlabel, 'vp-t');
  yLines.forEach((s, i) => {
    axes += `<text class="vp-t" transform="translate(${11 + i * 16} ${r1((y0 + y1) / 2)}) rotate(-90)" text-anchor="middle">${esc(s)}</text>`;
  });
  for (const [v, s] of opts.xticks ?? [])
    axes += line(sx(v), y0, sx(v), y0 + 4, 'vp-axis') + tickText(sx(v), y0 + 16, s, 'middle');
  for (const [v, s] of opts.yticks ?? [])
    axes += line(x0 - 4, sy(v), x0, sy(v), 'vp-axis') + tickText(x0 - 7, sy(v) + 4, s, 'end');
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
    // label at the middle of the empty band (it spans gap - 0.2 to 2.2), as the full band's label is at its middle
    body += text(c.x0 + 105, c.sy((gap - 0.2 + 2.2) / 2) + 4, 'band, empty', 'vp-t');
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
  let labels = '';
  if (p.labels === true && nMax > 1) {
    // the count at the end of the curve and how much the last electron multiplied it, both read off the curve itself
    const last = ys[nMax - 1]!;
    const factor = Math.round(10 ** (last - ys[nMax - 2]!));
    const sup = (k: number) => `10<tspan class="vp-sup" dy="-4">${k}</tspan>`;
    labels +=
      `<circle class="vp-node vp-solid" cx="${r1(c.sx(nMax))}" cy="${r1(c.sy(last))}" r="3"/>` +
      `<text class="vp-t vp-small" x="${r1(c.x0 + 8)}" y="${r1(c.y1 + 10)}">${nMax} electrons: about ${sup(Math.round(last))} ways</text>` +
      text(
        c.x0 + 8,
        c.y1 + 24,
        `The last electron multiplied the count by ${factor}`,
        'vp-t vp-small',
        'start',
      );
  }
  return wrap(
    p.alt as string,
    c.h,
    c.axes +
      path(
        ns.map((n, i) => [c.sx(n), c.sy(ys[i]!)]),
        'vp-curve',
      ) +
      labels,
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
    if (p.labels === true) {
      // name the two curves where they are, so no legend is needed
      const dpeak = Math.max(...idx.map((i) => dens[0]![i]!));
      body += text(c.sx(0), c.sy(dpeak) - 5, 'density of the electrons', 'vp-t vp-small vp-halo');
      body += text(
        c.sx(0),
        c.sy(-0.9 * (dmax / 1.1)) + 14,
        'the potential they all move in',
        'vp-t vp-small vp-halo',
      );
    }
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

/* ---- module 5: plane waves, k-points, smearing, DFT+U (M7.2) ---- */
// @source S-049 (plane waves), S-036 (reciprocal lattice, Brillouin zone), S-007 (mesh points), S-015 and S-016 (smearing), S-014 (DFT+U)

/** Kinetic energy of a plane wave against its wave vector, with the cutoff drawn as a line when asked. */
function pwParabola(p: P): string {
  const ecut = num(p, 'cutoff', 30);
  const kmax = Math.max(num(p, 'kmax', 4), 0);
  const emax = HBAR2_OVER_2M_EV_A2 * kmax * kmax;
  const c = chart(-kmax, kmax, 0, emax, 'wave vector k', 'kinetic energy');
  let body = c.axes;
  body += path(
    sample(-kmax, kmax, 80).map((k) => [c.sx(k), c.sy(HBAR2_OVER_2M_EV_A2 * k * k)]),
    'vp-curve',
  );
  if (p.showCutoff !== false) {
    const kc = Math.sqrt(ecut / HBAR2_OVER_2M_EV_A2);
    body += line(c.x0, c.sy(ecut), c.x1, c.sy(ecut), 'vp-guide');
    body +=
      line(c.sx(-kc), c.y0, c.sx(-kc), c.sy(ecut), 'vp-guide') +
      line(c.sx(kc), c.y0, c.sx(kc), c.sy(ecut), 'vp-guide');
    body += text(c.x1 - 4, c.sy(ecut) - 5, 'cutoff', 'vp-t', 'end');
  }
  return wrap(p.alt as string, c.h, body);
}

/** Number of plane waves below an energy: N proportional to E^(3/2), drawn relative to the largest energy. */
function pwCount(p: P): string {
  const c = chart(0, 1, 0, 1, 'cutoff energy', 'number of plane waves');
  const body =
    c.axes +
    path(
      sample(0, 1, 60).map((e) => [c.sx(e), c.sy(e ** 1.5)]),
      'vp-curve',
    );
  return wrap(p.alt as string, c.h, body);
}

const SMEAR_CLASS = ['vp-curve', 'vp-curve2', 'vp-curve3', 'vp-curve4'];
/** Occupation f(x) or broadened delta(x) for chosen smearing schemes, x in units of the width. */
function smearingCurves(p: P): string {
  const ids = arr<SmearingId>(p, 'schemes', ['gaussian']).filter((i) => SMEARINGS.some((s) => s.id === i));
  const occ = p.series !== 'delta';
  const f = (id: SmearingId, x: number) => (occ ? smearOcc(id, x) : smearDelta(id, x));
  const xs = sample(-4, 4, 160);
  const all = ids.flatMap((id) => xs.map((x) => f(id, x)));
  const ymin = Math.min(0, ...all);
  const ymax = Math.max(occ ? 1 : 0, ...all) * 1.05;
  const c = chart(
    -4,
    4,
    ymin * 1.05,
    ymax,
    'energy from the Fermi level, in units of the width',
    occ ? 'occupation' : 'broadened delta function',
  );
  let body = c.axes + line(c.sx(0), c.y0, c.sx(0), c.y1, 'vp-guide');
  if (ymin < 0) body += line(c.x0, c.sy(0), c.x1, c.sy(0), 'vp-zero');
  ids.forEach((id, i) => {
    body += path(
      xs.map((x) => [c.sx(x), c.sy(f(id, x))]),
      SMEAR_CLASS[i % SMEAR_CLASS.length]!,
    );
  });
  body += legend(
    c,
    ids.map((id, i) => [SMEAR_CLASS[i % SMEAR_CLASS.length]!, SMEARINGS.find((s) => s.id === id)!.label]),
  );
  return wrap(p.alt as string, c.h, body);
}

/** The Dudarev penalty (and optionally its potential) against the occupation of one orbital. */
function dftuPenalty(p: P): string {
  const U = num(p, 'U', 4);
  const both = p.series === 'both';
  const ns = sample(0, 1, 80);
  const e = (n: number) => dudarevEnergy(U, n);
  const v = (n: number) => dudarevPotential(U, n);
  const lo = both ? -U / 2 : 0;
  const hi = both ? U / 2 : U / 8;
  const c = chart(
    0,
    1,
    lo * 1.1,
    hi * 1.2,
    'occupation n of one orbital',
    both ? 'energy and potential' : 'penalty energy',
  );
  let body = c.axes + line(c.x0, c.sy(0), c.x1, c.sy(0), 'vp-zero');
  body += path(
    ns.map((n) => [c.sx(n), c.sy(e(n))]),
    'vp-curve',
  );
  if (both)
    body += path(
      ns.map((n) => [c.sx(n), c.sy(v(n))]),
      'vp-curve2',
    );
  if (both)
    body += legend(c, [
      ['vp-curve', 'penalty energy'],
      ['vp-curve2', 'potential'],
    ]);
  return wrap(p.alt as string, c.h, body);
}

/** Gamma-centred or Monkhorst-Pack mesh in a 2D reciprocal cell (fractions of the reciprocal vectors). */
function kmeshGrid(p: P): string {
  const n = Math.min(40, Math.max(1, Math.round(num(p, 'n', 4))));
  const m = Math.min(40, Math.max(1, Math.round(num(p, 'm', n))));
  const gamma = p.gamma !== false;
  const angle = (num(p, 'angle', 90) * Math.PI) / 180;
  const ratio = num(p, 'ratio', 1);
  const h = 220;
  const cx = W / 2;
  const cy = h / 2;
  const scale = 120;
  const b1: [number, number] = [scale, 0];
  const b2: [number, number] = [ratio * scale * Math.cos(angle), -ratio * scale * Math.sin(angle)];
  const pt = (u: number, w: number): [number, number] => [
    cx + u * b1[0] + w * b2[0],
    cy + u * b1[1] + w * b2[1],
  ];
  let body = path([pt(-0.5, -0.5), pt(0.5, -0.5), pt(0.5, 0.5), pt(-0.5, 0.5)], 'vp-guide', true);
  const sx = gamma ? 0 : n % 2 === 0 ? 0.5 : 0;
  const sy = gamma ? 0 : m % 2 === 0 ? 0.5 : 0;
  const wrapU = (u: number) => (u >= 0.5 - 1e-9 ? u - 1 : u);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const [x, y] = pt(wrapU((i + sx) / n), wrapU((j + sy) / m));
      body += `<circle class="vp-node vp-solid" cx="${r1(x)}" cy="${r1(y)}" r="3.5"/>`;
    }
  const [gx, gy] = pt(0, 0);
  body +=
    `<circle class="vp-node vp-ring" cx="${r1(gx)}" cy="${r1(gy)}" r="7"/>` +
    text(gx + 9, gy - 9, 'Γ', 'vp-t vp-halo', 'start');
  body += text(W / 2, h - 6, 'reciprocal cell with the k-points of the mesh', 'vp-t');
  return wrap(p.alt as string, h, body);
}

/** A row of atoms and the matching reciprocal axis, marked only with symbols. */
function bz1d(p: P): string {
  const atoms = Math.max(2, Math.round(num(p, 'atoms', 7)));
  const h = 150;
  const a = (W - 60) / (atoms - 1);
  let body = text(W / 2, 14, 'real space: a row of atoms', 'vp-t');
  for (let i = 0; i < atoms; i++)
    body += `<circle class="vp-node vp-solid" cx="${r1(30 + i * a)}" cy="38" r="5"/>`;
  body += line(30, 56, 30 + a, 56, 'vp-axis') + text(30 + a / 2, 70, 'a', 'vp-t');
  const x0 = 40;
  const x1 = W - 40;
  const mid = (x0 + x1) / 2;
  const q = (x1 - x0) / 4;
  body += text(W / 2, 92, 'reciprocal space: wave vector k', 'vp-t');
  body += line(x0, 112, x1, 112, 'vp-axis');
  body += `<rect class="vp-fill" x="${r1(mid - q)}" y="104" width="${r1(2 * q)}" height="16"/>`;
  [
    [-2, '-2π/a'],
    [-1, '-π/a'],
    [0, '0'],
    [1, 'π/a'],
    [2, '2π/a'],
  ].forEach(([m, label]) => {
    const x = mid + (m as number) * q;
    body += line(x, 108, x, 116, 'vp-tick') + text(x, 134, label as string, 'vp-t');
  });
  return wrap(p.alt as string, h, body);
}

/** Schematic radial functions (invented shapes): a smooth one and one with nodes inside rc. */
function pawRadial(p: P): string {
  const rc = num(p, 'rc', 2);
  const both = p.curves !== 'smooth';
  const rs = sample(0.02, 6, 200);
  const ae = rs.map((r) => allElectronLike(r, rc));
  const ps = rs.map((r) => pawPseudo(r));
  const ymax = Math.max(...ae, ...ps) * 1.1;
  const ymin = Math.min(...ae, ...ps) * 1.1;
  const c = chart(0, 6, ymin, ymax, 'distance from the nucleus (made-up units)', 'amplitude');
  let body = c.axes + line(c.x0, c.sy(0), c.x1, c.sy(0), 'vp-zero');
  if (p.showRc !== false)
    body +=
      line(c.sx(rc), c.y0, c.sx(rc), c.y1, 'vp-guide') +
      text(c.sx(rc) + 4, c.y1 + 10, 'r_c', 'vp-t', 'start');
  body += path(
    ps.map((y, i) => [c.sx(rs[i]!), c.sy(y)]),
    both ? 'vp-curve2' : 'vp-curve',
  );
  if (both)
    body += path(
      ae.map((y, i) => [c.sx(rs[i]!), c.sy(y)]),
      'vp-curve',
    );
  return wrap(p.alt as string, c.h, body);
}

/** The five rungs as a stacked list; `highlight` is the index (0 = bottom) of the rung to mark. */
function ladderRungs(p: P): string {
  const names = ['LDA', 'GGA', 'Meta-GGA', 'Hybrid', 'Beyond'];
  const hi = num(p, 'highlight', -1);
  const h = 190;
  let body = '';
  names.forEach((n, i) => {
    const y = h - 30 - i * 32;
    body +=
      `<rect class="${i === hi ? 'vp-fill' : 'vp-box'}" x="110" y="${y}" width="140" height="26" rx="4"/>` +
      text(180, y + 18, n, 'vp-t');
  });
  body += text(60, h - 17, 'cheaper', 'vp-t') + text(60, 24, 'costlier', 'vp-t');
  return wrap(p.alt as string, h, body);
}

/* ---- tag visuals (M12.5): pictures for INCAR tag cards ---- */
// @source S-019 and S-042 for what each tag means; the SCF energy change uses the toy of M7.1 (S-011, S-031 for hartree to eV)

/** ISPIN: one set of orbitals holding two electrons each, or separate up and down sets. */
function ispinLadders(p: P): string {
  if (num(p, 'spin', 2) !== 1) return spinLadders({ ...p, levels: 3, up: [1, 1, 1], down: [1, 1, 0] });
  const h = 40 + 3 * 36;
  const cx = W / 2;
  let body = text(cx, 16, 'one set of orbitals', 'vp-t');
  for (let i = 0; i < 3; i++) {
    const y = h - 22 - i * 36;
    body += line(cx - 42, y, cx + 42, y, 'vp-curve');
    if (i < 2) body += arrow(cx - 10, y - 1, y - 24) + arrow(cx + 10, y - 24, y - 1);
  }
  return wrap(p.alt as string, h, body);
}

/** ISIF and IBRION: which of atoms, cell shape and cell volume may change (solid: start, dashed: after a change). */
function dofCell(p: P): string {
  const atoms = p.atoms === true;
  const shape = p.shape === true;
  const volume = p.volume === true;
  const h = 210;
  const A: [number, number] = [90, 150];
  const B: [number, number] = [220, 150];
  const D: [number, number] = [120, 56];
  const at = (u: number, w: number): [number, number] => [
    A[0] + u * (B[0] - A[0]) + w * (D[0] - A[0]),
    A[1] + u * (B[1] - A[1]) + w * (D[1] - A[1]),
  ];
  const cell = (s: number, shear: number, cls: string) => {
    const c: [number, number] = [W / 2, 103];
    const f = (q: [number, number]): [number, number] => [
      c[0] + (q[0] - c[0]) * s + (q[1] < 100 ? shear : 0),
      c[1] + (q[1] - c[1]) * s,
    ];
    const C: [number, number] = [B[0] + D[0] - A[0], D[1]];
    return path([f(A), f(B), f(C), f(D)], cls, true);
  };
  let body = cell(1, 0, 'vp-curve');
  if (volume) body += cell(1.22, 0, 'vp-guide');
  if (shape && !volume) body += cell(1, 30, 'vp-guide');
  if (shape && volume) body += cell(1.22, 30, 'vp-guide');
  for (const [u, w, up] of [
    [0.25, 0.3, true],
    [0.7, 0.7, false],
  ] as const) {
    const [x, y] = at(u, w);
    body += `<circle class="vp-node vp-solid" cx="${r1(x)}" cy="${r1(y)}" r="5"/>`;
    if (atoms) body += up ? arrow(x + 10, y + 4, y - 20) : arrow(x + 10, y - 4, y + 20);
  }
  const moves = [atoms && 'ions', shape && 'cell shape', volume && 'cell volume'].filter(Boolean) as string[];
  body += text(W / 2, h - 12, moves.length ? `may change: ${moves.join(', ')}` : 'nothing changes', 'vp-t');
  return wrap(p.alt as string, h, body);
}

/** NSW: the upper limit on ionic steps, as a row of boxes. */
function ionicSteps(p: P): string {
  const nsw = Math.max(0, Math.round(num(p, 'nsw', 0)));
  const shown = Math.min(Math.max(nsw, 1), 8);
  const h = 120;
  const bw = Math.min(34, (W - 60) / shown);
  const x0 = (W - shown * bw - (shown - 1) * 6) / 2;
  let body = '';
  for (let i = 0; i < shown; i++) {
    const x = x0 + i * (bw + 6);
    body += `<rect class="vp-step${nsw === 0 ? ' vp-active' : ''}" x="${r1(x)}" y="30" width="${r1(bw)}" height="34" rx="5"/>`;
    body += text(x + bw / 2, 52, nsw === 0 ? '1' : String(i + 1), 'vp-t');
  }
  if (nsw > 8) body += text(W / 2, 86, `... up to step ${nsw}`, 'vp-t');
  body += text(
    W / 2,
    nsw > 8 ? 106 : 92,
    nsw === 0 ? 'one calculation, no ionic movement' : `at most ${nsw} ionic step${nsw === 1 ? '' : 's'}`,
    'vp-t',
  );
  return wrap(p.alt as string, h, body);
}

/** EDIFF: energy change between electronic steps of the toy SCF of module 4, with the stop threshold. */
function ediffTrace(p: P): string {
  const ediff = Math.max(1e-16, num(p, 'ediff', 1e-4));
  const r = scf({ Z: 2, alpha: 0.3, tol: 1e-13 });
  const its = r.iterations;
  const dE = its
    .slice(1)
    .map((it, i) => Math.max(Math.abs(it.totalEnergy - its[i]!.totalEnergy) * HARTREE_EV, 1e-16));
  const ys = dE.map((d) => Math.log10(d));
  const t = Math.log10(ediff);
  const lo = Math.min(...ys, t) - 0.5;
  const hi = Math.max(...ys, t) + 0.5;
  const n = Math.min(ys.length, 40);
  const c = chart(1, Math.max(n, 2), lo, hi, 'electronic step', 'energy change (powers of ten, eV)');
  const pts = ys.slice(0, n).map((y, i) => [c.sx(i + 1), c.sy(y)] as [number, number]);
  const stop = dE.findIndex((d) => d < ediff);
  let body = c.axes + line(c.x0, c.sy(t), c.x1, c.sy(t), 'vp-guide') + path(pts, 'vp-curve');
  body += text(c.x1 - 4, c.sy(t) - 5, 'EDIFF', 'vp-t', 'end');
  body += pts
    .map(([x, y]) => `<circle class="vp-node vp-solid" cx="${r1(x)}" cy="${r1(y)}" r="2.5"/>`)
    .join('');
  if (stop >= 0 && stop < n) {
    body += `<circle class="vp-node" cx="${r1(c.sx(stop + 1))}" cy="${r1(c.sy(ys[stop]!))}" r="6"/>`;
  }
  return wrap(p.alt as string, c.h, body);
}

/** EDIFFG < 0: the largest force on any ion at each ionic step (illustrative decay) with the stop band. */
function forceBand(p: P): string {
  const tol = Math.max(1e-6, Math.abs(num(p, 'tol', 0.01)));
  const n = 12;
  const f = (i: number) => 0.4 * 0.62 ** i;
  const ys = Array.from({ length: n }, (_, i) => Math.log10(f(i)));
  const t = Math.log10(tol);
  const lo = Math.min(...ys, t) - 0.3;
  const hi = Math.max(...ys, t) + 0.3;
  const c = chart(1, n, lo, hi, 'ionic step', 'largest force (powers of ten, eV/A)');
  const pts = ys.map((y, i) => [c.sx(i + 1), c.sy(y)] as [number, number]);
  const stop = ys.findIndex((y) => y < t);
  let body = c.axes + line(c.x0, c.sy(t), c.x1, c.sy(t), 'vp-guide') + path(pts, 'vp-curve');
  body += text(c.x1 - 4, c.sy(t) - 5, '|EDIFFG|', 'vp-t', 'end');
  body += pts
    .map(([x, y]) => `<circle class="vp-node vp-solid" cx="${r1(x)}" cy="${r1(y)}" r="2.5"/>`)
    .join('');
  if (stop >= 0)
    body += `<circle class="vp-node" cx="${r1(c.sx(stop + 1))}" cy="${r1(c.sy(ys[stop]!))}" r="6"/>`;
  return wrap(p.alt as string, c.h, body);
}

/** ISMEAR and SIGMA: occupation against energy in eV for one scheme and one width. */
function sigmaWidth(p: P): string {
  const id = (typeof p.scheme === 'string' ? p.scheme : 'gaussian') as SmearingId;
  const scheme = SMEARINGS.some((s) => s.id === id) ? id : 'gaussian';
  const sigma = Math.max(1e-3, num(p, 'sigma', 0.1));
  const span = 0.6;
  const es = sample(-span, span, 160);
  const ys = es.map((e) => smearOcc(scheme, e / sigma));
  const ymin = Math.min(0, ...ys);
  const ymax = Math.max(1, ...ys) * 1.05;
  const c = chart(-span, span, ymin * 1.05, ymax, 'energy from the Fermi level (eV)', 'occupation');
  let body = c.axes + line(c.sx(0), c.y0, c.sx(0), c.y1, 'vp-guide');
  if (ymin < 0) body += line(c.x0, c.sy(0), c.x1, c.sy(0), 'vp-zero');
  body += path(
    es.map((e, i) => [c.sx(e), c.sy(ys[i]!)]),
    'vp-curve',
  );
  body += line(c.sx(-sigma), c.sy(0.5), c.sx(sigma), c.sy(0.5), 'vp-guide');
  body += text(c.sx(0), c.sy(0.5) - 6, `SIGMA = ${sigma} eV`, 'vp-t');
  return wrap(p.alt as string, c.h, body);
}

/* ---- modules 6 and 7: files and running a calculation (M7.3) ---- */
// @source S-041 and S-042 (the file lists, restart rules and KPAR/NCORE entries of the author's handbooks), S-019

/** The four input files going into VASP and the main output files coming out. Which ones to emphasise is a parameter. */
function fileFlow(p: P): string {
  const hot = new Set(arr<string>(p, 'highlight', []));
  const ins = ['INCAR', 'POSCAR', 'KPOINTS', 'POTCAR'];
  const outs = ['OUTCAR', 'OSZICAR', 'CONTCAR', 'CHGCAR', 'WAVECAR'];
  const rowH = 30;
  const h = Math.max(ins.length, outs.length) * rowH + 24;
  const box = (x: number, y: number, w: number, label: string) =>
    `<rect class="vp-step${hot.has(label) ? ' vp-active' : ''}" x="${r1(x)}" y="${r1(y)}" width="${w}" height="24" rx="5"/>` +
    text(x + w / 2, y + 16, label, 'vp-t');
  let body = '';
  const yIn = (i: number) => 12 + i * rowH + ((outs.length - ins.length) * rowH) / 2;
  ins.forEach((n, i) => {
    body += box(8, yIn(i), 78, n);
    body += line(86, yIn(i) + 12, 130, h / 2, 'vp-guide');
  });
  body +=
    `<rect class="vp-box" x="130" y="${r1(h / 2 - 22)}" width="86" height="44" rx="8"/>` +
    text(173, h / 2 + 5, 'VASP', 'vp-t');
  outs.forEach((n, i) => {
    body += box(274, 12 + i * rowH, 78, n);
    body += line(216, h / 2, 274, 12 + i * rowH + 12, 'vp-guide');
  });
  return wrap(p.alt as string, h, body);
}

/** Relaxation, then SCF, then a band or DOS run: which file travels along each arrow. `focus` emphasises one arrow. */
function restartChain(p: P): string {
  const focus = typeof p.focus === 'string' ? (p.focus as string) : '';
  const stages = [
    ['Relaxation', 'writes CONTCAR, WAVECAR'],
    ['SCF, same folder', 'ISTART = 1; writes CHGCAR'],
    ['Band or DOS run', 'ICHARG = 11 reads CHGCAR'],
  ];
  const links = [
    ['CONTCAR', 'copied to POSCAR'],
    ['CHGCAR', 'kept fixed'],
  ];
  const h = 210;
  let body = '';
  stages.forEach(([a, b], i) => {
    const y = 10 + i * 72;
    body += `<rect class="vp-box" x="70" y="${y}" width="220" height="42" rx="7"/>`;
    body += text(180, y + 18, a!, 'vp-t') + text(180, y + 34, b!, 'vp-t');
  });
  links.forEach(([f, n], i) => {
    const y0 = 52 + i * 72;
    const on = focus === f;
    body += `<g class="${on ? 'vp-hot' : ''}">${arrowDown(180, y0, y0 + 30)}</g>`;
    body += text(190, y0 + 18, `${f}: ${n}`, 'vp-t', 'start');
  });
  return wrap(p.alt as string, h, body);
}

/** Energy change at each electronic step of a run, on a log axis, with the EDIFF threshold. `dE` lists |dE| in eV. */
function oszicarTrace(p: P): string {
  const dE = arr<number>(p, 'dE', [1e1, 1e-1, 1e-3, 1e-5, 1e-7]).map((d) => Math.max(Math.abs(d), 1e-16));
  const ediff = Math.max(1e-16, num(p, 'ediff', 1e-4));
  const ys = dE.map((d) => Math.log10(d));
  const t = Math.log10(ediff);
  const lo = Math.floor(Math.min(...ys, t)) - 1;
  const hi = Math.ceil(Math.max(...ys, t)) + 1;
  const c = chart(
    1,
    Math.max(dE.length, 2),
    lo,
    hi,
    'electronic step',
    'change in energy (powers of ten, eV)',
  );
  const pts = ys.map((y, i) => [c.sx(i + 1), c.sy(y)] as [number, number]);
  let body = c.axes + line(c.x0, c.sy(t), c.x1, c.sy(t), 'vp-guide') + path(pts, 'vp-curve');
  body += text(c.x1 - 4, c.sy(t) - 5, 'EDIFF', 'vp-t', 'end');
  body += pts
    .map(([x, y]) => `<circle class="vp-node vp-solid" cx="${r1(x)}" cy="${r1(y)}" r="3"/>`)
    .join('');
  return wrap(p.alt as string, c.h, body);
}

/**
 * A convergence series: how much the energy per atom still changes from one setting to the next, on a log axis,
 * with the accepted threshold as a dashed line. `diff` lists |E(n) - E(n+1)| (any unit, same unit as `threshold`).
 * No numbers are printed, so a question can ask for the value.
 */
function convSeries(p: P): string {
  const diff = arr<number>(p, 'diff', [20, 6, 2, 0.6, 0.2]).map((d) => Math.max(Math.abs(d), 1e-9));
  const thr = Math.max(1e-9, num(p, 'threshold', 1));
  const xlabel = typeof p.xlabel === 'string' ? p.xlabel : 'setting (rising)';
  const ys = diff.map((d) => Math.log10(d));
  const t = Math.log10(thr);
  const lo = Math.floor(Math.min(...ys, t)) - 1;
  const hi = Math.ceil(Math.max(...ys, t)) + 1;
  const c = chart(
    1,
    Math.max(diff.length, 2),
    lo,
    hi,
    xlabel,
    'change from the next setting (powers of ten)',
  );
  const pts = ys.map((y, i) => [c.sx(i + 1), c.sy(y)] as [number, number]);
  let body = c.axes + line(c.x0, c.sy(t), c.x1, c.sy(t), 'vp-guide') + path(pts, 'vp-curve');
  body += text(c.x1 - 4, c.sy(t) - 5, 'threshold', 'vp-t', 'end');
  body += pts
    .map(([x, y]) => `<circle class="vp-node vp-solid" cx="${r1(x)}" cy="${r1(y)}" r="3"/>`)
    .join('');
  return wrap(p.alt as string, c.h, body);
}

/** How the MPI ranks are split by KPAR (k-point groups) and NCORE (cores per band). Pure arithmetic. */
function parallelSplit(p: P): string {
  const ranks = Math.min(64, Math.max(1, Math.round(num(p, 'ranks', 16))));
  const kpar = Math.max(1, Math.round(num(p, 'kpar', 1)));
  const ncore = Math.max(1, Math.round(num(p, 'ncore', 1)));
  if (ranks % kpar !== 0) {
    const body =
      text(W / 2, 40, `${ranks} ranks cannot be split into KPAR = ${kpar} equal groups.`, 'vp-t') +
      text(W / 2, 60, 'The number of ranks must be divisible by KPAR.', 'vp-t');
    return wrap(p.alt as string, 90, body);
  }
  const per = ranks / kpar;
  const cols = Math.min(per, 16);
  const cell = Math.min(18, (W - 60) / cols);
  const rowH = Math.ceil(per / cols) * (cell + 4) + 22;
  const h = kpar * (rowH + 8) + 28;
  let body = '';
  for (let g = 0; g < kpar; g++) {
    const y = 8 + g * (rowH + 8);
    body += `<rect class="vp-box" x="8" y="${y}" width="${W - 16}" height="${rowH}" rx="6"/>`;
    body += text(14, y + 14, `k-point group ${g + 1}`, 'vp-t', 'start');
    for (let i = 0; i < per; i++) {
      const cx = 20 + (i % cols) * (cell + 4);
      const cy = y + 20 + Math.floor(i / cols) * (cell + 4);
      const band = Math.floor(i / ncore);
      body += `<rect class="vp-step${band % 2 === 0 ? ' vp-active' : ''}" x="${r1(cx)}" y="${r1(cy)}" width="${r1(cell)}" height="${r1(cell)}" rx="3"/>`;
    }
  }
  body += text(
    W / 2,
    h - 8,
    `${kpar} group${kpar === 1 ? '' : 's'} of ${per} ranks; ${per / ncore >= 1 ? Math.floor(per / ncore) : 0} band group${Math.floor(per / ncore) === 1 ? '' : 's'} of ${ncore} per k-point group`,
    'vp-t',
  );
  return wrap(p.alt as string, h, body);
}

/* ---- guided path pictures that explain themselves (M16.5) ---- */
// @source S-048 and S-049 (toy SCF loop, tight-binding bands), S-047 (box), S-049 (plane waves), S-036 and S-050 (reciprocal lattice)

/** A positive number as "1.4 × 10" with a raised power, as SVG markup (the digits come from the number itself). */
const fmtE = (x: number): string => {
  if (!(x > 0)) return '0';
  const e = Math.floor(Math.log10(x));
  return `${(x / 10 ** e).toFixed(1)} × 10<tspan class="vp-sup" dy="-4">${e}</tspan>`;
};

/**
 * The self-consistency loop as it happens: the density that goes into each step of the toy SCF loop (scf1d), earlier steps
 * faint, the chosen step bold, the converged answer dashed; underneath, one bar per step for how much the density still
 * changed, on a log scale, the chosen step highlighted. The bars shrink until the change is below the tolerance.
 */
function scfIterations(p: P): string {
  const o: ScfOptions = { Z: num(p, 'Z', 2), alpha: num(p, 'alpha', 0.3), tol: num(p, 'tol', 1e-6) };
  const r = scf(o);
  const its = r.iterations;
  const n = its.length;
  const step = Math.min(n, Math.max(1, Math.round(num(p, 'step', 1))));
  const half = num(p, 'half', 6);
  const idx = Array.from(r.x.keys()).filter((i) => Math.abs(r.x[i]!) <= half);
  const dmax =
    Math.max(...its.flatMap((it) => idx.map((i) => it.densityIn[i]!)), ...idx.map((i) => r.density[i]!)) *
    1.08;
  const h = 300;
  const x0 = 46;
  const x1 = W - 14;
  const ya0 = 150; // bottom of the density panel
  const ya1 = 30;
  const sx = (x: number) => x0 + ((x + half) / (2 * half)) * (x1 - x0);
  const sy = (d: number) => ya0 - (d / dmax) * (ya0 - ya1);
  const curve = (d: Float64Array) => idx.map((i) => [sx(r.x[i]!), sy(d[i]!)] as [number, number]);
  let body = line(x0, ya0, x1, ya0, 'vp-axis') + line(x0, ya0, x0, ya1, 'vp-axis');
  body += `<text class="vp-t" transform="translate(14 ${r1((ya0 + ya1) / 2)}) rotate(-90)" text-anchor="middle">density</text>`;
  body += text((x0 + x1) / 2, ya0 + 14, 'position along the toy atom', 'vp-t vp-small');
  for (let k = 0; k < step - 1; k++) body += path(curve(its[k]!.densityIn), 'vp-curve3');
  body += path(curve(r.density), 'vp-curve2');
  const cur = curve(its[step - 1]!.densityIn);
  body += path([[sx(-half), ya0], ...cur, [sx(half), ya0]], 'vp-fill', true) + path(cur, 'vp-curve vp-heavy');
  body += text(x0, 14, `Step ${step} of ${n}: the density going in (bold)`, 'vp-t vp-b', 'start');
  body +=
    line(x1 - 96, ya1 + 4, x1 - 80, ya1 + 4, 'vp-curve2') +
    text(x1 - 76, ya1 + 8, 'final answer', 'vp-t vp-small', 'start');
  body +=
    line(x1 - 96, ya1 + 18, x1 - 80, ya1 + 18, 'vp-curve3') +
    text(x1 - 76, ya1 + 22, 'earlier steps', 'vp-t vp-small', 'start');
  // residual bars
  const yb0 = h - 34;
  const yb1 = 188;
  const logs = its.map((it) => Math.log10(Math.max(it.residual, 1e-16)));
  const top = Math.ceil(Math.max(...logs));
  const bottom = Math.floor(Math.min(Math.log10(o.tol!), ...logs)) - 0.5;
  const by = (v: number) => yb0 - ((v - bottom) / (top - bottom)) * (yb0 - yb1);
  const bw = (x1 - x0) / n;
  body += line(x0, yb0, x1, yb0, 'vp-axis') + line(x0, yb0, x0, yb1, 'vp-axis');
  body += text(x0, yb1 - 8, 'Change in density at each step', 'vp-t vp-b', 'start');
  its.forEach((_, k) => {
    const y = by(logs[k]!);
    const cls = k === step - 1 ? 'vp-bar vp-hot' : k < step ? 'vp-bar' : 'vp-bar vp-later';
    body += `<rect class="${cls}" x="${r1(x0 + k * bw + 1)}" y="${r1(y)}" width="${r1(Math.max(1, bw - 2))}" height="${r1(Math.max(0, yb0 - y))}"/>`;
  });
  const yt = by(Math.log10(o.tol!));
  body +=
    line(x0, yt, x1, yt, 'vp-guide') +
    text(x1 - 2, yt - 3, 'small enough: stop', 'vp-t vp-small vp-halo', 'end');
  body +=
    text(x0, yb0 + 14, 'step 1', 'vp-t vp-small', 'start') +
    text(x1, yb0 + 14, `step ${n}`, 'vp-t vp-small', 'end');
  const res = fmtE(its[step - 1]!.residual);
  const verdict = step === n ? 'Settled, the loop stops.' : 'Not settled yet.';
  body += `<text class="vp-t" x="${r1((x0 + x1) / 2)}" y="${h - 4}" text-anchor="middle">${verdict} Change at step ${step}: ${res}</text>`;
  return wrap(p.alt as string, h, body);
}

/**
 * Electron density in a box, drawn two ways: as a curve (how much charge at each place) and as a shaded strip under it,
 * the same numbers as a map (darker where there is more charge), with the walls marked. The density is the sum of the
 * occupied levels, two electrons per level (box.ts).
 */
function densityMap(p: P): string {
  const L = num(p, 'L', 5);
  const N = Math.max(1, Math.round(num(p, 'electrons', 2)));
  const full = Math.floor(N / 2);
  const dens = (x: number) => {
    let s = 0;
    for (let k = 1; k <= full; k++) s += 2 * boxPsi(k, L, x) ** 2;
    if (N % 2) s += boxPsi(full + 1, L, x) ** 2;
    return s;
  };
  const xs = sample(0, L, 160);
  const ys = xs.map(dens);
  const ymax = Math.max(...ys) * 1.15;
  const h = 262;
  const x0 = 46;
  const x1 = W - 14;
  const y0 = 140;
  const y1 = 26;
  const sx = (x: number) => x0 + (x / L) * (x1 - x0);
  const sy = (d: number) => y0 - (d / ymax) * (y0 - y1);
  let body = line(x0, y0, x1, y0, 'vp-axis') + line(x0, y0, x0, y1, 'vp-axis');
  body += `<text class="vp-t" transform="translate(14 ${r1((y0 + y1) / 2)}) rotate(-90)" text-anchor="middle">density</text>`;
  body += text(x0, 14, `${N} electron${N === 1 ? '' : 's'} in a box ${L} Å long`, 'vp-t vp-b', 'start');
  const pts = xs.map((x, i) => [sx(x), sy(ys[i]!)] as [number, number]);
  body += path([[sx(0), y0], ...pts, [sx(L), y0]], 'vp-fill', true) + path(pts, 'vp-curve');
  // where the curve peaks, say so
  const imax = ys.indexOf(Math.max(...ys));
  body += text(sx(xs[imax]!), sy(ys[imax]!) - 5, 'most charge', 'vp-t vp-small');
  // the map strip
  const ms0 = 172;
  const ms1 = 206;
  body += text(x0, ms0 - 8, 'Same numbers as a map: darker = more charge', 'vp-t vp-b', 'start');
  const cells = 48;
  for (let c = 0; c < cells; c++) {
    const xm = ((c + 0.5) / cells) * L;
    const op = Math.min(1, dens(xm) / (ymax / 1.15));
    body += `<rect class="vp-heat" x="${r1(sx((c / cells) * L))}" y="${ms0}" width="${r1((x1 - x0) / cells + 0.4)}" height="${ms1 - ms0}" fill-opacity="${op.toFixed(2)}"/>`;
  }
  body += `<rect class="vp-frame" x="${x0}" y="${ms0}" width="${x1 - x0}" height="${ms1 - ms0}"/>`;
  body += line(x0, ms0 - 2, x0, ms1 + 2, 'vp-heavyline') + line(x1, ms0 - 2, x1, ms1 + 2, 'vp-heavyline');
  body +=
    text(x0, ms1 + 14, 'wall: no charge', 'vp-t vp-small', 'start') +
    text(x1, ms1 + 14, 'wall: no charge', 'vp-t vp-small', 'end');
  body += text(
    (x0 + x1) / 2,
    h - 10,
    'One number per point stands in for all the electrons',
    'vp-t vp-small',
  );
  return wrap(p.alt as string, h, body);
}

/**
 * The plane-wave cutoff as a circle: every dot is one plane wave of a square toy cell (a reciprocal lattice vector G, in
 * a 2D slice of the 3D grid). A plane wave of vector G has kinetic energy (hbar^2 / 2m) G^2, so the waves below the cutoff
 * are exactly the dots inside a circle (a sphere in 3D) of radius sqrt(cutoff / (hbar^2 / 2m)). Kept dots are filled.
 */
function pwSphere(p: P): string {
  const ecut = num(p, 'cutoff', 200);
  const a = num(p, 'a', 4);
  const m = Math.max(2, Math.round(num(p, 'span', 7)));
  const g = (2 * Math.PI) / a;
  const gc = Math.sqrt(ecut / HBAR2_OVER_2M_EV_A2);
  const h = 260;
  const size = 186;
  const cx0 = 14 + size / 2;
  const cy0 = 36 + size / 2;
  const step = size / (2 * m + 1);
  const px = (i: number) => cx0 + i * step;
  const py = (j: number) => cy0 - j * step;
  let kept = 0;
  let body = text(14, 14, `Cutoff ${r1(ecut)} eV, toy cell a = ${a} Å`, 'vp-t vp-b', 'start');
  body += `<rect class="vp-frame" x="${14}" y="${36}" width="${size}" height="${size}"/>`;
  const rpx = (gc / g) * step;
  body += `<circle class="vp-cut" cx="${r1(cx0)}" cy="${r1(cy0)}" r="${r1(rpx)}"/>`;
  for (let i = -m; i <= m; i++)
    for (let j = -m; j <= m; j++) {
      const inside = Math.hypot(i, j) * g <= gc;
      if (inside) kept++;
      body += `<circle class="${inside ? 'vp-node vp-solid' : 'vp-node'}" cx="${r1(px(i))}" cy="${r1(py(j))}" r="${inside ? 2.6 : 2}"/>`;
    }
  body += text(cx0, 36 + size + 16, `${kept} waves kept`, 'vp-t vp-small');
  // the key, on the right
  const kx = 14 + size + 14;
  const wave = (y: number, cycles: number, cls: string) =>
    path(
      sample(0, 1, 60).map((t) => [kx + t * (W - 14 - kx), y - 7 * Math.sin(2 * Math.PI * cycles * t)]),
      cls,
    );
  body += text(kx, 46, 'Each dot is one wave.', 'vp-t vp-small', 'start');
  body += text(kx, 60, 'Centre: long, slow wave.', 'vp-t vp-small', 'start');
  body += wave(80, 1, 'vp-curve');
  body += text(kx, 106, 'Far out: short wave,', 'vp-t vp-small', 'start');
  body += text(kx, 119, 'high energy.', 'vp-t vp-small', 'start');
  body += wave(140, 5, 'vp-curve3');
  body += text(kx, 170, 'Circle = cutoff (ENCUT).', 'vp-t vp-small', 'start');
  body += text(kx, 184, 'Filled dots: kept.', 'vp-t vp-small', 'start');
  body += text(kx, 198, 'Open dots: dropped.', 'vp-t vp-small', 'start');
  body += text(kx, 220, 'Higher cutoff: bigger', 'vp-t vp-small', 'start');
  body += text(kx, 233, 'circle, more waves,', 'vp-t vp-small', 'start');
  body += text(kx, 246, 'slower, more accurate.', 'vp-t vp-small', 'start');
  return wrap(p.alt as string, h, body);
}

/**
 * Bands and the density of states of a toy chain with two atoms per cell (alternating hoppings t1 = 1 and t2): two bands
 * E(k) = +-|t1 + t2 e^{ik}|, side by side with the DOS on the same energy axis. Where a band is flat, many k share one
 * energy, so the DOS is tall there. Unequal hoppings open a gap (an insulator); equal ones close it (a metal at half
 * filling). The lower band is filled up to the Fermi level, which sits in the middle (E = 0).
 */
function bandsDos(p: P): string {
  const t2 = num(p, 't2', 0.6);
  const t1 = 1;
  const e = (k: number) => Math.hypot(t1 + t2 * Math.cos(k), t2 * Math.sin(k));
  const emax = t1 + t2;
  const gap = 2 * Math.abs(t1 - t2);
  const h = 264;
  const y0 = 206;
  const y1 = 26;
  const ey = (E: number) => y0 - ((E + emax * 1.08) / (2 * emax * 1.08)) * (y0 - y1);
  const bx0 = 40;
  const bx1 = 196;
  const dx0 = 216;
  const dx1 = W - 14;
  const ks = sample(-Math.PI, Math.PI, 120);
  const kx = (k: number) => bx0 + ((k + Math.PI) / (2 * Math.PI)) * (bx1 - bx0);
  let body = text(bx0, 14, 'Bands: energy against k', 'vp-t vp-b', 'start');
  body += text(dx0, 14, 'DOS: how many states', 'vp-t vp-b', 'start');
  body += line(bx0, y0, bx1, y0, 'vp-axis') + line(bx0, y0, bx0, y1, 'vp-axis');
  body += line(dx0, y0, dx1, y0, 'vp-axis') + line(dx0, y0, dx0, y1, 'vp-axis');
  body += `<text class="vp-t" transform="translate(14 ${r1((y0 + y1) / 2)}) rotate(-90)" text-anchor="middle">energy</text>`;
  const lower = ks.map((k) => [kx(k), ey(-e(k))] as [number, number]);
  const upper = ks.map((k) => [kx(k), ey(e(k))] as [number, number]);
  body += path([[bx0, y0], ...lower, [bx1, y0]], 'vp-fill', true);
  body += path(lower, 'vp-curve vp-heavy') + path(upper, 'vp-curve');
  body +=
    text(bx0, y0 + 14, '-π/a', 'vp-t vp-small', 'start') +
    text((bx0 + bx1) / 2, y0 + 14, '0', 'vp-t vp-small');
  body += text(bx1, y0 + 14, 'π/a', 'vp-t vp-small', 'end');
  body += text((bx0 + bx1) / 2, y0 + 30, 'wave vector k', 'vp-t vp-small');
  // DOS: histogram of both bands over a fine k grid, same energy axis
  const bins = 40;
  const counts = new Array<number>(bins).fill(0);
  const fine = sample(-Math.PI, Math.PI, 4000);
  for (const k of fine)
    for (const E of [-e(k), e(k)])
      counts[Math.min(bins - 1, Math.floor(((E + emax) / (2 * emax)) * bins))]!++;
  const cmax = Math.max(...counts);
  counts.forEach((cnt, b) => {
    if (!cnt) return;
    const ya = ey(-emax + (2 * emax * (b + 1)) / bins);
    const yb = ey(-emax + (2 * emax * b) / bins);
    const filled = -emax + (2 * emax * (b + 0.5)) / bins < 0;
    body += `<rect class="${filled ? 'vp-bar' : 'vp-bar vp-later'}" x="${dx0 + 1}" y="${r1(ya)}" width="${r1((cnt / cmax) * (dx1 - dx0 - 4))}" height="${r1(Math.max(0.5, yb - ya - 0.6))}"/>`;
  });
  body += text((dx0 + dx1) / 2, y0 + 14, 'number of states', 'vp-t vp-small');
  // Fermi level across both panels
  body += line(bx0, ey(0), dx1, ey(0), 'vp-guide');
  body += text(dx1, ey(0) - 4, 'Fermi level', 'vp-t vp-small', 'end');
  // flat band edge: the band is flattest at k = 0 (top of the upper band) and k = pi/a (edges of the gap)
  const yEdge = ey(emax);
  body += line(kx(0), yEdge, dx0 + 8, yEdge, 'vp-curve3');
  body += text(kx(0) + 8, yEdge - 4, 'flat band: tall DOS', 'vp-t vp-small vp-halo', 'start');
  body += text(
    W / 2,
    h - 4,
    gap > 1e-6 ? 'A gap at the Fermi level: an insulator' : 'No gap at the Fermi level: a metal',
    'vp-t',
  );
  return wrap(p.alt as string, h, body);
}

/**
 * Real space and reciprocal space side by side for a 2D lattice: left, the lattice points with the cell vectors a1, a2;
 * right, the reciprocal lattice with b1, b2 (b_i . a_j = 2 pi delta_ij) and the first Brillouin zone (the points closer to
 * the origin than to any other reciprocal lattice point). A long real direction gives a short reciprocal one.
 */
function realReciprocal(p: P): string {
  const kind = typeof p.lattice === 'string' ? p.lattice : 'square';
  const a = num(p, 'a', 4);
  const ratio = kind === 'rect' ? num(p, 'ratio', 2) : 1;
  const a1: [number, number] = [a, 0];
  const a2: [number, number] = kind === 'hex' ? [a / 2, (a * Math.sqrt(3)) / 2] : [0, a * ratio];
  const det = a1[0] * a2[1] - a1[1] * a2[0];
  const tp = 2 * Math.PI;
  const b1: [number, number] = [(tp * a2[1]) / det, (-tp * a2[0]) / det];
  const b2: [number, number] = [(-tp * a1[1]) / det, (tp * a1[0]) / det];
  const h = 270;
  const pw = 160;
  const L0 = 14;
  const R0 = W - 14 - pw;
  const top = 40;
  const cy = top + pw / 2;
  const scaleR = pw / 2 / (2.2 * Math.max(Math.hypot(...a1), Math.hypot(...a2)));
  const scaleK = pw / 2 / (2.2 * Math.max(Math.hypot(...b1), Math.hypot(...b2)));
  let body = text(L0, 14, 'Real space: atoms', 'vp-t vp-b', 'start');
  body += text(R0, 14, 'Reciprocal space: waves', 'vp-t vp-b', 'start');
  body +=
    text(L0, 28, 'distances in Å', 'vp-t vp-small', 'start') +
    text(R0, 28, 'wave vectors in 1/Å', 'vp-t vp-small', 'start');
  body += `<rect class="vp-frame" x="${L0}" y="${top}" width="${pw}" height="${pw}"/>`;
  body += `<rect class="vp-frame" x="${R0}" y="${top}" width="${pw}" height="${pw}"/>`;
  const lx = (v: [number, number]) => L0 + pw / 2 + v[0] * scaleR;
  const ly = (v: [number, number]) => cy - v[1] * scaleR;
  const rx = (v: [number, number]) => R0 + pw / 2 + v[0] * scaleK;
  const ry = (v: [number, number]) => cy - v[1] * scaleK;
  const inBox = (x: number, y: number, x0: number) =>
    x > x0 + 3 && x < x0 + pw - 3 && y > top + 3 && y < top + pw - 3;
  // unit cell (parallelogram) in real space
  const o: [number, number] = [0, 0];
  const cell = [o, a1, [a1[0] + a2[0], a1[1] + a2[1]] as [number, number], a2].map(
    (v) => [lx(v), ly(v)] as [number, number],
  );
  body += path(cell, 'vp-fill', true);
  for (let i = -6; i <= 6; i++)
    for (let j = -6; j <= 6; j++) {
      const v: [number, number] = [i * a1[0] + j * a2[0], i * a1[1] + j * a2[1]];
      if (inBox(lx(v), ly(v), L0))
        body += `<circle class="vp-node vp-solid" cx="${r1(lx(v))}" cy="${r1(ly(v))}" r="3"/>`;
      const g: [number, number] = [i * b1[0] + j * b2[0], i * b1[1] + j * b2[1]];
      if (inBox(rx(g), ry(g), R0))
        body += `<circle class="vp-node" cx="${r1(rx(g))}" cy="${r1(ry(g))}" r="2.6"/>`;
    }
  // first Brillouin zone: clip a large square by the perpendicular bisectors of the nearest reciprocal points
  let poly: [number, number][] = [
    [-50, -50],
    [50, -50],
    [50, 50],
    [-50, 50],
  ];
  for (let i = -2; i <= 2; i++)
    for (let j = -2; j <= 2; j++) {
      if (!i && !j) continue;
      const g: [number, number] = [i * b1[0] + j * b2[0], i * b1[1] + j * b2[1]];
      const c = (g[0] * g[0] + g[1] * g[1]) / 2;
      const out: [number, number][] = [];
      for (let k = 0; k < poly.length; k++) {
        const P1 = poly[k]!;
        const P2 = poly[(k + 1) % poly.length]!;
        const f1 = P1[0] * g[0] + P1[1] * g[1] - c;
        const f2 = P2[0] * g[0] + P2[1] * g[1] - c;
        if (f1 <= 0) out.push(P1);
        if (f1 * f2 < 0) {
          const t = f1 / (f1 - f2);
          out.push([P1[0] + t * (P2[0] - P1[0]), P1[1] + t * (P2[1] - P1[1])]);
        }
      }
      poly = out;
    }
  body += path(
    poly.map((v) => [rx(v), ry(v)] as [number, number]),
    'vp-fill',
    true,
  );
  body += path(
    poly.map((v) => [rx(v), ry(v)] as [number, number]),
    'vp-curve',
    true,
  );
  const arrow = (x0: number, y0: number, x1: number, y1: number) => {
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const hx = x1 - 7 * Math.cos(ang);
    const hy = y1 - 7 * Math.sin(ang);
    return (
      line(x0, y0, hx, hy, 'vp-arrow') +
      `<path class="vp-arrowhead" d="M${r1(x1)} ${r1(y1)}L${r1(hx - 3.5 * Math.sin(ang))} ${r1(hy + 3.5 * Math.cos(ang))}L${r1(hx + 3.5 * Math.sin(ang))} ${r1(hy - 3.5 * Math.cos(ang))}Z"/>`
    );
  };
  body += arrow(lx(o), ly(o), lx(a1), ly(a1)) + arrow(lx(o), ly(o), lx(a2), ly(a2));
  body += arrow(rx(o), ry(o), rx(b1), ry(b1)) + arrow(rx(o), ry(o), rx(b2), ry(b2));
  const lab = (x: number, y: number, s: string) =>
    `<text class="vp-t vp-b vp-halo" x="${r1(x)}" y="${r1(y)}" text-anchor="middle">${esc(s)}</text>`;
  body += lab(lx(a1) + 4, ly(a1) + 14, 'a1') + lab(lx(a2) - 12, ly(a2) + 2, 'a2');
  body += lab(rx(b1) + 4, ry(b1) + 14, 'b1') + lab(rx(b2) - 12, ry(b2) + 2, 'b2');
  const la1 = Math.hypot(...a1);
  const la2 = Math.hypot(...a2);
  const lb1 = Math.hypot(...b1);
  const lb2 = Math.hypot(...b2);
  const yb = top + pw + 16;
  body += text(L0, yb, `|a1| = ${la1.toFixed(1)} Å, |a2| = ${la2.toFixed(1)} Å`, 'vp-t vp-small', 'start');
  body += text(R0, yb, `|b1| = ${lb1.toFixed(2)}, |b2| = ${lb2.toFixed(2)} 1/Å`, 'vp-t vp-small', 'start');
  body += text(L0, yb + 14, 'shaded: the unit cell', 'vp-t vp-small', 'start');
  body += text(R0, yb + 14, 'shaded: the Brillouin zone', 'vp-t vp-small', 'start');
  body += text(
    W / 2,
    h - 6,
    kind === 'rect'
      ? 'a2 is twice as long, so b2 is half as long'
      : kind === 'hex'
        ? '60 degree cell: the zone is a hexagon'
        : 'Equal sides: a square cell and a square zone',
    'vp-t',
  );
  return wrap(p.alt as string, h, body);
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
  'pw-parabola': { fn: pwParabola, badge: 'computed' },
  'pw-count': { fn: pwCount, badge: 'computed' },
  'smearing-curves': { fn: smearingCurves, badge: 'computed' },
  'dftu-penalty': { fn: dftuPenalty, badge: 'computed' },
  'kmesh-grid': { fn: kmeshGrid, badge: 'computed' },
  'bz-1d': { fn: bz1d, badge: 'illustrative' },
  'paw-radial': { fn: pawRadial, badge: 'illustrative' },
  'ladder-rungs': { fn: ladderRungs, badge: 'illustrative' },
  'ispin-ladders': { fn: ispinLadders, badge: 'illustrative' },
  'dof-cell': { fn: dofCell, badge: 'illustrative' },
  'ionic-steps': { fn: ionicSteps, badge: 'illustrative' },
  'ediff-trace': { fn: ediffTrace, badge: 'toy-model' },
  'force-band': { fn: forceBand, badge: 'illustrative' },
  'sigma-width': { fn: sigmaWidth, badge: 'computed' },
  'file-flow': { fn: fileFlow, badge: 'illustrative' },
  'restart-chain': { fn: restartChain, badge: 'illustrative' },
  'oszicar-trace': { fn: oszicarTrace, badge: 'illustrative' },
  'parallel-split': { fn: parallelSplit, badge: 'computed' },
  'conv-series': { fn: convSeries, badge: 'illustrative' },
  'scf-iterations': { fn: scfIterations, badge: 'toy-model' },
  'density-map': { fn: densityMap, badge: 'computed' },
  'pw-sphere': { fn: pwSphere, badge: 'computed' },
  'bands-dos': { fn: bandsDos, badge: 'toy-model' },
  'real-reciprocal': { fn: realReciprocal, badge: 'computed' },
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
