// The build-time poster of a stage (M16.2, D-111): the same layers as the live view, projected orthographically from the
// state's camera and painted far to near as one small SVG. It is what the reader sees before the engine loads, without
// JavaScript and without WebGL, so it must be honest: same geometry, same colours, the badge and the description beside it.
// Pure and deterministic (no randomness), so pages do not churn between builds. Sizes are capped so a poster stays small.
import { cameraFrom, right as rightOf, up as upOf, viewDirection } from './arcball';
import { frameBounds } from './kit';
import { dot, normalize, sub, type Vec3 } from './math';
import { colormap, hexToRgb01, resolveColor } from './palette3d';
import type { CameraSpec, Color, Layer, SceneFrame } from './types';
import { cameraForSpec } from './viewSpec';

export const POSTER_LIMITS = { triangles: 800, points: 600, atoms: 600, segments: 1200 };

export interface PosterOptions {
  width?: number;
  height?: number;
  /** Visible layer groups (null: all). */
  groups?: readonly string[] | null;
  camera?: CameraSpec;
}

interface Item {
  depth: number;
  svg: string;
}

const LIGHT: Vec3 = normalize([0.35, 0.55, 1]);

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n1 = (x: number) => (Math.round(x * 10) / 10).toString();

/** Ink and muted follow the page theme through CSS classes; every other colour is the light-theme value. */
function paint(c: Color, attr: 'fill' | 'stroke'): string {
  if (c === 'ink') return `class="v3p-ink-${attr}"`;
  if (c === 'muted') return `class="v3p-muted-${attr}"`;
  return `${attr}="${resolveColor(c, 'light')}"`;
}

function shade(hex: string, k: number): string {
  const [r, g, b] = hexToRgb01(hex);
  const f = (x: number) =>
    Math.round(Math.max(0, Math.min(1, x * k)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${f(r)}${f(g)}${f(b)}`;
}

/** Evenly spaced indices, at most `max` of `n`. */
function stride(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = n / max;
  return Array.from({ length: max }, (_, i) => Math.floor(i * step));
}

export function posterSVG(frame: SceneFrame, opts: PosterOptions = {}): string {
  const W = opts.width ?? 640;
  const H = opts.height ?? 480;
  const groups = opts.groups ? new Set(opts.groups) : null;
  const shown = frame.layers.filter((l) => !groups || groups.has(l.group));
  const b = frame.bounds ?? frameBounds(frame.layers);
  const { eye, up, zoom } = cameraForSpec(opts.camera ?? frame.camera, frame);
  const cam = cameraFrom(eye, b.center, 10, up);
  const R = rightOf(cam);
  const U = upOf(cam);
  const V = viewDirection(cam);
  const s = (Math.min(W, H) / 2 / Math.max(b.radius, 1e-6)) * 0.92 * zoom;
  const proj = (p: Vec3): [number, number, number] => {
    const d = sub(p, b.center);
    return [W / 2 + dot(d, R) * s, H / 2 - dot(d, U) * s, -dot(d, V)];
  };
  const items: Item[] = [];
  const texts: string[] = [];
  let atomBudget = POSTER_LIMITS.atoms;
  let pointBudget = POSTER_LIMITS.points;
  let segBudget = POSTER_LIMITS.segments;
  const triTotal = shown.reduce(
    (t, l) => t + (l.kind === 'mesh' ? (l.indices ? l.indices.length : l.positions.length) / 3 : 0),
    0,
  );
  const triShare = triTotal > POSTER_LIMITS.triangles ? POSTER_LIMITS.triangles / triTotal : 1;

  for (const l of shown) {
    switch (l.kind) {
      case 'atoms': {
        const idx = stride(l.positions.length, Math.max(0, atomBudget));
        atomBudget -= idx.length;
        for (const i of idx) {
          const [x, y, z] = proj(l.positions[i]!);
          const r = (typeof l.radius === 'number' ? l.radius : (l.radius[i] ?? 0.3)) * s;
          const c = Array.isArray(l.color) ? (l.color[i] ?? l.color[0]!) : l.color;
          const op = l.opacity !== undefined && l.opacity < 1 ? ` fill-opacity="${n1(l.opacity)}"` : '';
          items.push({
            depth: z,
            svg: `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(Math.max(r, 0.8))}" ${paint(c, 'fill')}${op} class="v3p-atom"/>`,
          });
        }
        break;
      }
      case 'points': {
        const idx = stride(l.positions.length, Math.max(0, pointBudget));
        pointBudget -= idx.length;
        for (const i of idx) {
          const [x, y, z] = proj(l.positions[i]!);
          const c = Array.isArray(l.color) ? (l.color[i] ?? l.color[0]!) : l.color;
          items.push({
            depth: z,
            svg: `<circle cx="${n1(x)}" cy="${n1(y)}" r="${n1(Math.max(l.size * s, 0.8))}" ${paint(c, 'fill')}/>`,
          });
        }
        break;
      }
      case 'lines': {
        const idx = stride(l.segments.length, Math.max(0, segBudget));
        segBudget -= idx.length;
        const dash = l.dashed ? ' stroke-dasharray="4 3"' : '';
        const w = l.tube ? Math.max(1, l.tube * s * 2) : 1.2;
        for (const i of idx) {
          const [a, c] = l.segments[i]!;
          const pa = proj(a);
          const pc = proj(c);
          items.push({
            depth: (pa[2] + pc[2]) / 2,
            svg: `<line x1="${n1(pa[0])}" y1="${n1(pa[1])}" x2="${n1(pc[0])}" y2="${n1(pc[1])}" ${paint(l.color, 'stroke')} stroke-width="${n1(w)}"${dash}/>`,
          });
        }
        break;
      }
      case 'curve': {
        const pts = l.points.map(proj);
        if (pts.length < 2) break;
        const step = Math.max(1, Math.ceil(pts.length / 300));
        const kept = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
        const d =
          kept.map((p, i) => `${i ? 'L' : 'M'}${n1(p[0])} ${n1(p[1])}`).join('') + (l.closed ? 'Z' : '');
        const w = l.tube ? Math.max(1.2, l.tube * s * 2) : 1.6;
        const depth = kept.reduce((t, p) => t + p[2], 0) / kept.length;
        items.push({
          depth,
          svg: `<path d="${d}" fill="none" ${paint(l.color, 'stroke')} stroke-width="${n1(w)}" stroke-linejoin="round"/>`,
        });
        break;
      }
      case 'arrows': {
        for (let i = 0; i < l.from.length && segBudget > 0; i++, segBudget--) {
          const a = l.from[i]!;
          const v = l.vectors[i]!;
          const pa = proj(a);
          const pb = proj([a[0] + v[0], a[1] + v[1], a[2] + v[2]]);
          const dx = pb[0] - pa[0];
          const dy = pb[1] - pa[1];
          const len = Math.hypot(dx, dy);
          const c = Array.isArray(l.color) ? (l.color[i] ?? l.color[0]!) : l.color;
          const head = Array.isArray(l.head) ? (l.head[i] ?? 'solid') : (l.head ?? 'solid');
          let svg = `<line x1="${n1(pa[0])}" y1="${n1(pa[1])}" x2="${n1(pb[0])}" y2="${n1(pb[1])}" ${paint(c, 'stroke')} stroke-width="2"/>`;
          if (len > 2) {
            const ux = dx / len;
            const uy = dy / len;
            const hl = Math.min(10, len * 0.35);
            const p1 = [pb[0] - ux * hl - uy * hl * 0.45, pb[1] - uy * hl + ux * hl * 0.45];
            const p2 = [pb[0] - ux * hl + uy * hl * 0.45, pb[1] - uy * hl - ux * hl * 0.45];
            const pts = `${n1(p1[0]!)},${n1(p1[1]!)} ${n1(pb[0])},${n1(pb[1])} ${n1(p2[0]!)},${n1(p2[1]!)}`;
            svg +=
              head === 'solid'
                ? `<polygon points="${pts}" ${paint(c, 'fill')}/>`
                : `<polyline points="${pts}" fill="none" ${paint(c, 'stroke')} stroke-width="1.6"/>`;
          }
          items.push({ depth: (pa[2] + pb[2]) / 2, svg });
        }
        break;
      }
      case 'mesh': {
        const P = l.positions;
        const tri = l.indices ?? Array.from({ length: P.length / 3 }, (_, i) => i);
        const nt = Math.floor(tri.length / 3);
        const keep = stride(nt, Math.max(1, Math.floor(nt * triShare)));
        const base = resolveColor(l.color, 'light');
        const cmap = l.values && l.colormap ? colormap(l.values, l.colormap, l.range) : undefined;
        const op = l.opacity !== undefined && l.opacity < 1 ? ` fill-opacity="${n1(l.opacity)}"` : '';
        for (const t of keep) {
          const ia = tri[3 * t]!;
          const ib = tri[3 * t + 1]!;
          const ic = tri[3 * t + 2]!;
          const va: Vec3 = [P[3 * ia]!, P[3 * ia + 1]!, P[3 * ia + 2]!];
          const vb: Vec3 = [P[3 * ib]!, P[3 * ib + 1]!, P[3 * ib + 2]!];
          const vc: Vec3 = [P[3 * ic]!, P[3 * ic + 1]!, P[3 * ic + 2]!];
          const pa = proj(va);
          const pb = proj(vb);
          const pc = proj(vc);
          const e1 = sub(vb, va);
          const e2 = sub(vc, va);
          const nrm = normalize([
            e1[1] * e2[2] - e1[2] * e2[1],
            e1[2] * e2[0] - e1[0] * e2[2],
            e1[0] * e2[1] - e1[1] * e2[0],
          ]);
          // light fixed to the camera: brightness from the normal in camera space, two-sided
          const ncam: Vec3 = [dot(nrm, R), dot(nrm, U), -dot(nrm, V)];
          const k = 0.55 + 0.5 * Math.abs(dot(ncam, LIGHT));
          let hex = base;
          if (cmap) {
            const c = [0, 1, 2].map((j) => (cmap[3 * ia + j]! + cmap[3 * ib + j]! + cmap[3 * ic + j]!) / 3);
            hex = `#${c
              .map((x) =>
                Math.round(x * 255)
                  .toString(16)
                  .padStart(2, '0'),
              )
              .join('')}`;
          }
          const pts = `${n1(pa[0])},${n1(pa[1])} ${n1(pb[0])},${n1(pb[1])} ${n1(pc[0])},${n1(pc[1])}`;
          const fill = l.wireframe
            ? `fill="none" stroke="${shade(hex, k)}" stroke-width="0.6"`
            : `fill="${shade(hex, k)}" stroke="${shade(hex, k)}" stroke-width="0.3"`;
          items.push({ depth: (pa[2] + pb[2] + pc[2]) / 3, svg: `<polygon points="${pts}" ${fill}${op}/>` });
        }
        break;
      }
      case 'labels': {
        for (const it of l.items.slice(0, 16)) {
          const [x, y] = proj(it.at);
          texts.push(
            `<text x="${n1(x)}" y="${n1(y)}" class="v3p-label" text-anchor="middle" dominant-baseline="middle">${esc(it.text)}</text>`,
          );
        }
        break;
      }
    }
  }
  items.sort((a, c) => a.depth - c.depth);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" class="v3p" aria-hidden="true" focusable="false">` +
    items.map((i) => i.svg).join('') +
    texts.join('') +
    `</svg>`
  );
}

/** How many drawable elements a poster would hold (for the size test and the budget report). */
export function posterCounts(svg: string): Record<string, number> {
  const count = (tag: string) => (svg.match(new RegExp(`<${tag}[ >]`, 'g')) ?? []).length;
  return {
    circle: count('circle'),
    polygon: count('polygon'),
    line: count('line'),
    path: count('path'),
    text: count('text'),
  };
}

export type { Layer };
