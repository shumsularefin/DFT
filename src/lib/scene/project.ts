// Orthographic projection of a resolved scene to flat 2D primitives with painter's ordering (M12.2). The SVG fallback is
// computed from the same geometry as the 3D view, never drawn by hand. Pure geometry, no physics.
import { cross, norm } from '../crystal/linalg';
import type { Vec3 } from '../crystal/types';
import { toScene } from '../three/cellEdges';
import type { ResolvedScene } from './resolve';
import type { Camera } from './spec';

/** Where the camera sits, as a unit direction from the origin in SCENE coordinates (y up; see three/cellEdges.ts). */
export function cameraDirection(camera: Camera, lattice: readonly (readonly number[])[]): Vec3 {
  let d: Vec3;
  if (typeof camera === 'string') {
    if (camera === 'iso') d = [1, 0.7, 1];
    else {
      const a = lattice[{ a: 0, b: 1, c: 2 }[camera]]!;
      d = toScene(a[0]!, a[1]!, a[2]!);
    }
  } else {
    const az = (camera.azimuth * Math.PI) / 180;
    const el = (camera.elevation * Math.PI) / 180;
    d = [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)];
  }
  const n = norm(d) || 1;
  return [d[0] / n, d[1] / n, d[2] / n];
}

export interface View {
  right: Vec3;
  up: Vec3;
  /** Unit vector towards the camera: a larger dot product is nearer. */
  toward: Vec3;
}

/** Screen axes for a camera direction. Looking straight along the vertical, physical y points up on the screen. */
export function viewBasis(direction: Vec3): View {
  const d = direction;
  const nearVertical = Math.abs(d[1]) > 0.9999;
  const up0: Vec3 = nearVertical ? [0, 0, -1] : [0, 1, 0];
  const r0 = cross(up0, d);
  const rn = norm(r0) || 1;
  const right: Vec3 = [r0[0] / rn, r0[1] / rn, r0[2] / rn];
  const up = cross(d, right);
  return { right, up, toward: d };
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Project a physics-coordinate point (Angstrom): screen x to the right, y up, and depth (larger = nearer). */
export function projectPoint(p: Vec3, v: View): { x: number; y: number; depth: number } {
  const s = toScene(p[0], p[1], p[2]);
  return { x: dot(s, v.right), y: dot(s, v.up), depth: dot(s, v.toward) };
}

export type Tone = 'ink' | 'muted' | 'accent';
export type Primitive =
  | { kind: 'circle'; x: number; y: number; r: number; fill: string; ring: boolean; depth: number }
  | {
      kind: 'line';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      tone: Tone;
      width: number;
      dash: boolean;
      depth: number;
    }
  | { kind: 'polygon'; points: [number, number][]; tone: Tone; opacity: number; depth: number }
  | {
      kind: 'arrow';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      tone: Tone;
      /** `solid` head for an up moment, `open` (outlined) head for a down moment, so the sign is not carried by colour. */
      head: 'solid' | 'open' | 'plain';
      depth: number;
    }
  | { kind: 'text'; x: number; y: number; text: string; tone: Tone; depth: number };

export interface Projection {
  /** Square viewBox, y down, units are SVG user units. */
  size: number;
  primitives: Primitive[];
}

/**
 * Project everything to primitives, sorted far to near (painter's order: the nearer atom is drawn last), and fitted to a
 * `size` x `size` box with `pad` user units of margin. y is flipped so the result is SVG-ready.
 */
export function projectScene(
  r: ResolvedScene,
  lattice: readonly (readonly number[])[],
  opts: { size?: number; pad?: number; camera?: Camera } = {},
): Projection {
  const size = opts.size ?? 400;
  const pad = opts.pad ?? 28;
  const v = viewBasis(cameraDirection(opts.camera ?? r.camera, lattice));
  const P = (p: Vec3) => projectPoint(p, v);
  type Raw = Primitive; // built in Angstrom screen units first, fitted after
  const out: Raw[] = [];

  for (const [a, b] of r.cellEdges) {
    const p = P(a);
    const q = P(b);
    out.push({
      kind: 'line',
      x1: p.x,
      y1: p.y,
      x2: q.x,
      y2: q.y,
      tone: 'muted',
      width: 1,
      dash: false,
      depth: Math.min(p.depth, q.depth) - 1e3,
    });
  }
  for (const pl of r.planes) {
    const pts = pl.polygon.map(P);
    if (pts.length >= 3)
      out.push({
        kind: 'polygon',
        points: pts.map((p) => [p.x, p.y]),
        tone: 'accent',
        opacity: 0.22,
        depth: Math.max(...pts.map((p) => p.depth)) - 500,
      });
  }
  for (const poly of r.polyhedra) {
    const vs = poly.vertices.map(P);
    for (const f of poly.faces) {
      const fp = f.map((i) => vs[i]!);
      out.push({
        kind: 'polygon',
        points: fp.map((p) => [p.x, p.y]),
        tone: 'accent',
        opacity: 0.16,
        depth: Math.max(...fp.map((p) => p.depth)) - 400,
      });
    }
    for (const [i, j] of poly.edges) {
      const p = vs[i]!;
      const q = vs[j]!;
      out.push({
        kind: 'line',
        x1: p.x,
        y1: p.y,
        x2: q.x,
        y2: q.y,
        tone: 'accent',
        width: 1,
        dash: false,
        depth: Math.max(p.depth, q.depth) - 399,
      });
    }
  }
  for (const [a, b] of r.bonds) {
    const p = P(a);
    const q = P(b);
    out.push({
      kind: 'line',
      x1: p.x,
      y1: p.y,
      x2: q.x,
      y2: q.y,
      tone: 'ink',
      width: 1.4,
      dash: false,
      depth: (p.depth + q.depth) / 2 - 0.001,
    });
  }
  for (const a of r.atoms) {
    const p = P(a.cart);
    out.push({
      kind: 'circle',
      x: p.x,
      y: p.y,
      r: a.radius,
      fill: a.color,
      ring: a.highlighted,
      depth: p.depth,
    });
  }
  for (const s of r.spins) {
    const p = P(s.from);
    const tip = P([s.from[0] + s.vector[0], s.from[1] + s.vector[1], s.from[2] + s.vector[2]]);
    const head = s.sign > 0 ? 'solid' : 'open';
    out.push({
      kind: 'arrow',
      x1: p.x,
      y1: p.y,
      x2: tip.x,
      y2: tip.y,
      tone: 'ink',
      head,
      depth: p.depth + 0.002,
    });
    out.push({
      kind: 'text',
      x: tip.x,
      y: tip.y,
      text: s.sign > 0 ? '+' : '−',
      tone: 'ink',
      depth: p.depth + 0.003,
    });
  }
  for (const vec of r.vectors) {
    const p = P(vec.from);
    const q = P(vec.to);
    out.push({
      kind: 'arrow',
      x1: p.x,
      y1: p.y,
      x2: q.x,
      y2: q.y,
      tone: 'accent',
      head: 'solid',
      depth: 1e3,
    });
    out.push({ kind: 'text', x: q.x, y: q.y, text: vec.label, tone: 'accent', depth: 1e3 + 1 });
  }
  for (const l of r.labels) {
    const p = P(l.at);
    out.push({ kind: 'text', x: p.x, y: p.y, text: l.text, tone: 'ink', depth: p.depth + 0.001 });
  }

  // bounds from the geometry (circles by their radius)
  let x0 = Infinity,
    x1 = -Infinity,
    y0 = Infinity,
    y1 = -Infinity;
  const grow = (x: number, y: number, m = 0) => {
    x0 = Math.min(x0, x - m);
    x1 = Math.max(x1, x + m);
    y0 = Math.min(y0, y - m);
    y1 = Math.max(y1, y + m);
  };
  for (const p of out) {
    if (p.kind === 'circle') grow(p.x, p.y, p.r);
    else if (p.kind === 'line' || p.kind === 'arrow') {
      grow(p.x1, p.y1);
      grow(p.x2, p.y2);
    } else if (p.kind === 'polygon') p.points.forEach(([x, y]) => grow(x, y));
    else grow(p.x, p.y);
  }
  if (!isFinite(x0)) {
    x0 = y0 = -1;
    x1 = y1 = 1;
  }
  const span = Math.max(x1 - x0, y1 - y0, 1e-6);
  const k = (size - 2 * pad) / span;
  const ox = size / 2 - ((x0 + x1) / 2) * k;
  const oy = size / 2 + ((y0 + y1) / 2) * k;
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => oy - y * k;
  const fitted: Primitive[] = out
    .sort((a, b) => a.depth - b.depth)
    .map((p): Primitive => {
      switch (p.kind) {
        case 'circle':
          return { ...p, x: X(p.x), y: Y(p.y), r: Math.max(2.5, p.r * k) };
        case 'line':
          return { ...p, x1: X(p.x1), y1: Y(p.y1), x2: X(p.x2), y2: Y(p.y2) };
        case 'arrow':
          return { ...p, x1: X(p.x1), y1: Y(p.y1), x2: X(p.x2), y2: Y(p.y2) };
        case 'polygon':
          return { ...p, points: p.points.map(([x, y]) => [X(x), Y(y)] as [number, number]) };
        case 'text':
          return { ...p, x: X(p.x), y: Y(p.y) };
      }
    });
  return { size, primitives: fitted };
}

/** Turn a camera by azimuth and elevation steps (degrees). Elevation stops short of the poles. Returns an explicit camera. */
export function rotateCamera(
  camera: Camera,
  lattice: readonly (readonly number[])[],
  dAzimuthDeg: number,
  dElevationDeg: number,
): { azimuth: number; elevation: number } {
  const d = cameraDirection(camera, lattice);
  const az = (Math.atan2(d[0], d[2]) * 180) / Math.PI + dAzimuthDeg;
  const el = (Math.asin(Math.max(-1, Math.min(1, d[1]))) * 180) / Math.PI + dElevationDeg;
  return {
    azimuth: Math.round(((az + 540) % 360) - 180),
    elevation: Math.max(-89, Math.min(89, Math.round(el))),
  };
}
