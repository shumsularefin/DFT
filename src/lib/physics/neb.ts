// The nudged elastic band on a two-dimensional energy landscape (M16.14): the Muller-Brown model surface (S-164), its
// stationary points refined by Newton's method, and a NEB with the improved tangent and the climbing image (S-121)
// relaxed by the quick-min optimizer (velocity Verlet with the velocity projected onto the force, S-124).
// Energies and coordinates are in the model's own units (it is a test surface, not a material).
// @source S-164 S-121 S-124
export type P2 = [number, number];

// Muller and Brown, Theor. Chim. Acta 53, 75 (1979), equation for the model potential (S-164).
const A = [-200, -100, -170, 15];
const a = [-1, -1, -6.5, 0.7];
const b = [0, 0, 11, 0.6];
const c = [-10, -10, -6.5, 0.7];
const X0 = [1, 0, -0.5, -1];
const Y0 = [0, 0.5, 1.5, 1];

/** The Muller-Brown potential V(x, y). */
export function mullerBrown(x: number, y: number): number {
  let v = 0;
  for (let k = 0; k < 4; k++) {
    const dx = x - X0[k]!;
    const dy = y - Y0[k]!;
    v += A[k]! * Math.exp(a[k]! * dx * dx + b[k]! * dx * dy + c[k]! * dy * dy);
  }
  return v;
}

/** Analytic gradient of the Muller-Brown potential. */
export function mullerBrownGradient(x: number, y: number): P2 {
  let gx = 0;
  let gy = 0;
  for (let k = 0; k < 4; k++) {
    const dx = x - X0[k]!;
    const dy = y - Y0[k]!;
    const e = A[k]! * Math.exp(a[k]! * dx * dx + b[k]! * dx * dy + c[k]! * dy * dy);
    gx += e * (2 * a[k]! * dx + b[k]! * dy);
    gy += e * (b[k]! * dx + 2 * c[k]! * dy);
  }
  return [gx, gy];
}

/** Analytic Hessian [[xx, xy], [xy, yy]] of the Muller-Brown potential. */
export function mullerBrownHessian(x: number, y: number): [number, number, number] {
  let hxx = 0;
  let hxy = 0;
  let hyy = 0;
  for (let k = 0; k < 4; k++) {
    const dx = x - X0[k]!;
    const dy = y - Y0[k]!;
    const e = A[k]! * Math.exp(a[k]! * dx * dx + b[k]! * dx * dy + c[k]! * dy * dy);
    const px = 2 * a[k]! * dx + b[k]! * dy;
    const py = b[k]! * dx + 2 * c[k]! * dy;
    hxx += e * (px * px + 2 * a[k]!);
    hxy += e * (px * py + b[k]!);
    hyy += e * (py * py + 2 * c[k]!);
  }
  return [hxx, hxy, hyy];
}

/** Literature positions of the three minima and two saddle points, rounded to 3 decimals (S-164). */
export const MB_MINIMA: readonly P2[] = [
  [-0.558, 1.442],
  [0.623, 0.028],
  [-0.05, 0.467],
];
export const MB_SADDLES: readonly P2[] = [
  [-0.822, 0.624],
  [0.212, 0.293],
];

/** Newton's method on grad V = 0 from a starting guess: converges to the nearby minimum or saddle. */
export function refineStationary(p: P2, iterations = 50): P2 {
  let [x, y] = p;
  for (let it = 0; it < iterations; it++) {
    const [gx, gy] = mullerBrownGradient(x, y);
    const [hxx, hxy, hyy] = mullerBrownHessian(x, y);
    const det = hxx * hyy - hxy * hxy;
    if (Math.abs(det) < 1e-14) break;
    const sx = (hyy * gx - hxy * gy) / det;
    const sy = (hxx * gy - hxy * gx) / det;
    x -= sx;
    y -= sy;
    if (Math.hypot(sx, sy) < 1e-13) break;
  }
  return [x, y];
}

/** Number of negative Hessian eigenvalues: 0 at a minimum, 1 at a first-order saddle point. */
export function morseIndex(p: P2): number {
  const [hxx, hxy, hyy] = mullerBrownHessian(p[0], p[1]);
  const tr = hxx + hyy;
  const det = hxx * hyy - hxy * hxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  return [tr / 2 - disc, tr / 2 + disc].filter((l) => l < 0).length;
}

export interface Landscape {
  energy(x: number, y: number): number;
  gradient(x: number, y: number): P2;
}

export const MULLER_BROWN: Landscape = { energy: mullerBrown, gradient: mullerBrownGradient };

export interface NebOptions {
  /** Intermediate images (the two end points are extra and fixed). */
  images: number;
  /** Spring constant along the band, model energy per length squared. */
  spring?: number;
  climb?: boolean;
  /** Quick-min time step. */
  dt?: number;
  /** Largest move of one image in one step. */
  maxMove?: number;
}

export interface NebFrame {
  /** End points included: images + 2 points. */
  points: P2[];
  energies: number[];
  /** Largest force on an intermediate image after the projection (the convergence measure). */
  maxForce: number;
  /** Index (into `points`) of the climbing image, or -1. */
  climbing: number;
}

const sub2 = (p: P2, q: P2): P2 => [p[0] - q[0], p[1] - q[1]];
const len2 = (p: P2): number => Math.hypot(p[0], p[1]);
const unit2 = (p: P2): P2 => {
  const l = len2(p) || 1;
  return [p[0] / l, p[1] / l];
};

/** Improved tangent of Henkelman and Jonsson (S-121) at interior image i. */
export function improvedTangent(points: readonly P2[], energies: readonly number[], i: number): P2 {
  const tp = sub2(points[i + 1]!, points[i]!);
  const tm = sub2(points[i]!, points[i - 1]!);
  const [ep, e0, em] = [energies[i + 1]!, energies[i]!, energies[i - 1]!];
  let t: P2;
  if (ep > e0 && e0 > em) t = tp;
  else if (ep < e0 && e0 < em) t = tm;
  else {
    const dmax = Math.max(Math.abs(ep - e0), Math.abs(em - e0));
    const dmin = Math.min(Math.abs(ep - e0), Math.abs(em - e0));
    t =
      ep > em
        ? [tp[0] * dmax + tm[0] * dmin, tp[1] * dmax + tm[1] * dmin]
        : [tp[0] * dmin + tm[0] * dmax, tp[1] * dmin + tm[1] * dmax];
  }
  return unit2(t);
}

/** NEB forces on every point (zero on the fixed end points) and the climbing image index. */
export function nebForces(
  points: readonly P2[],
  land: Landscape,
  o: { spring: number; climb: boolean },
): { forces: P2[]; energies: number[]; climbing: number } {
  const energies = points.map((p) => land.energy(p[0], p[1]));
  const n = points.length;
  let climbing = -1;
  if (o.climb) {
    let best = -Infinity;
    for (let i = 1; i < n - 1; i++)
      if (energies[i]! > best) {
        best = energies[i]!;
        climbing = i;
      }
  }
  const forces: P2[] = points.map(() => [0, 0]);
  for (let i = 1; i < n - 1; i++) {
    const t = improvedTangent(points, energies, i);
    const g = land.gradient(points[i]![0], points[i]![1]);
    const gpar = g[0] * t[0] + g[1] * t[1];
    if (i === climbing) {
      forces[i] = [-g[0] + 2 * gpar * t[0], -g[1] + 2 * gpar * t[1]];
      continue;
    }
    const fperp: P2 = [-g[0] + gpar * t[0], -g[1] + gpar * t[1]];
    const ds = o.spring * (len2(sub2(points[i + 1]!, points[i]!)) - len2(sub2(points[i]!, points[i - 1]!)));
    forces[i] = [fperp[0] + ds * t[0], fperp[1] + ds * t[1]];
  }
  return { forces, energies, climbing };
}

/** Straight-line interpolation between two end points with `images` intermediate points. */
export function linearBand(start: P2, end: P2, images: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i <= images + 1; i++) {
    const t = i / (images + 1);
    out.push([start[0] + t * (end[0] - start[0]), start[1] + t * (end[1] - start[1])]);
  }
  return out;
}

/**
 * Relax a band with quick-min: one global velocity, kept only along the force when it points with the force, as in
 * the VTST quick-min optimizer (S-124). Returns frame 0 (the input band) and one frame after each of `iterations`.
 */
export function runNeb(band0: readonly P2[], land: Landscape, o: NebOptions, iterations: number): NebFrame[] {
  const spring = o.spring ?? 100;
  const climb = o.climb ?? false;
  const dt = o.dt ?? 0.002;
  const maxMove = o.maxMove ?? 0.05;
  let pts: P2[] = band0.map((p) => [p[0], p[1]]);
  let vel: P2[] = pts.map(() => [0, 0]);
  const frameOf = (): NebFrame => {
    const r = nebForces(pts, land, { spring, climb });
    let m = 0;
    for (let i = 1; i < pts.length - 1; i++) m = Math.max(m, len2(r.forces[i]!));
    return { points: pts.map((p) => [p[0], p[1]]), energies: r.energies, maxForce: m, climbing: r.climbing };
  };
  const frames: NebFrame[] = [frameOf()];
  for (let it = 0; it < iterations; it++) {
    const { forces } = nebForces(pts, land, { spring, climb });
    let vf = 0;
    let ff = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      vf += vel[i]![0] * forces[i]![0] + vel[i]![1] * forces[i]![1];
      ff += forces[i]![0] ** 2 + forces[i]![1] ** 2;
    }
    vel = vel.map((_, i) => {
      if (i === 0 || i === pts.length - 1 || vf <= 0 || ff === 0) return [0, 0];
      return [(vf / ff) * forces[i]![0], (vf / ff) * forces[i]![1]];
    });
    pts = pts.map((p, i) => {
      if (i === 0 || i === pts.length - 1) return p;
      vel[i] = [vel[i]![0] + dt * forces[i]![0], vel[i]![1] + dt * forces[i]![1]];
      let dx = dt * vel[i]![0];
      let dy = dt * vel[i]![1];
      const d = Math.hypot(dx, dy);
      if (d > maxMove) {
        dx *= maxMove / d;
        dy *= maxMove / d;
      }
      return [p[0] + dx, p[1] + dy];
    });
    frames.push(frameOf());
  }
  return frames;
}
