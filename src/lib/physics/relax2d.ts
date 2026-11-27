// Geometry optimisers on a two-dimensional energy surface (M16, geometry relaxation topic). A ball stands for the
// atomic coordinates; each recorded step is one energy and force evaluation, which is what VASP counts as an ionic step.
// The optimisers are simplified versions of the IBRION choices, not VASP's code:
//   'sd'     steepest descent with a fixed step (not a VASP option; the baseline that zig-zags),
//   'cg'     conjugate gradients with a trial step and a corrector step along each line (the IBRION = 2 idea),
//   'bfgs'   quasi-Newton: a curvature estimate built from the history of forces (the idea behind IBRION = 1),
//   'damped' damped second-order dynamics (the IBRION = 3 idea).
// @source S-164 (the Muller-Brown surface), S-068 (steepest descent, conjugate gradients with a line minimisation,
// the BFGS update), S-041 (what IBRION 1, 2 and 3 do in VASP)

export interface Surface2D {
  energy(x: number, y: number): number;
  gradient(x: number, y: number): [number, number];
}

/** The Muller-Brown surface: E = sum_i A_i exp(a_i dx^2 + b_i dx dy + c_i dy^2), dx = x - x0_i, dy = y - y0_i (S-164). */
export const MB = {
  A: [-200, -100, -170, 15],
  a: [-1, -1, -6.5, 0.7],
  b: [0, 0, 11, 0.6],
  c: [-10, -10, -6.5, 0.7],
  x0: [1, 0, -0.5, -1],
  y0: [0, 0.5, 1.5, 1],
} as const;

export const MULLER_BROWN: Surface2D = {
  energy(x, y) {
    let e = 0;
    for (let i = 0; i < 4; i++) {
      const dx = x - MB.x0[i]!;
      const dy = y - MB.y0[i]!;
      e += MB.A[i]! * Math.exp(MB.a[i]! * dx * dx + MB.b[i]! * dx * dy + MB.c[i]! * dy * dy);
    }
    return e;
  },
  gradient(x, y) {
    let gx = 0;
    let gy = 0;
    for (let i = 0; i < 4; i++) {
      const dx = x - MB.x0[i]!;
      const dy = y - MB.y0[i]!;
      const t = MB.A[i]! * Math.exp(MB.a[i]! * dx * dx + MB.b[i]! * dx * dy + MB.c[i]! * dy * dy);
      gx += t * (2 * MB.a[i]! * dx + MB.b[i]! * dy);
      gy += t * (MB.b[i]! * dx + 2 * MB.c[i]! * dy);
    }
    return [gx, gy];
  },
};

/** E = 1/2 (h11 x^2 + 2 h12 x y + h22 y^2): the exact quadratic that the optimisers are tested on. */
export function quadratic(h11: number, h12: number, h22: number): Surface2D {
  return {
    energy: (x, y) => 0.5 * (h11 * x * x + 2 * h12 * x * y + h22 * y * y),
    gradient: (x, y) => [h11 * x + h12 * y, h12 * x + h22 * y],
  };
}

export type Optimizer = 'sd' | 'cg' | 'bfgs' | 'damped';

export interface RelaxStep {
  x: number;
  y: number;
  e: number;
  /** Force = minus the gradient. */
  fx: number;
  fy: number;
  /** 'trial' and 'correct' are the two evaluations of one conjugate-gradient line; the rest are plain steps. */
  kind: 'start' | 'trial' | 'correct' | 'step';
}

export interface RelaxOptions {
  /** Step scale (the role of POTIM): length of a trial step per unit of force. */
  step: number;
  /** Largest number of evaluations after the start (the role of NSW). */
  maxSteps: number;
  /** Stop when the size of the force is below this (the role of a negative EDIFFG). */
  forceTol?: number;
  /** Friction of the damped dynamics, 0 to 2 (default 0.4). */
  damping?: number;
  /** Largest move of one step (a trust radius); default unlimited. */
  maxMove?: number;
}

export interface RelaxResult {
  steps: RelaxStep[];
  converged: boolean;
}

/** Run one optimiser from (x0, y0). Every element of `steps` after the first is one evaluation of energy and force. */
export function relax(
  surface: Surface2D,
  start: [number, number],
  method: Optimizer,
  o: RelaxOptions,
): RelaxResult {
  const tol = o.forceTol ?? 0;
  const cap = o.maxMove ?? Infinity;
  const steps: RelaxStep[] = [];
  const evalAt = (x: number, y: number, kind: RelaxStep['kind']): RelaxStep => {
    const [gx, gy] = surface.gradient(x, y);
    const s: RelaxStep = { x, y, e: surface.energy(x, y), fx: -gx, fy: -gy, kind };
    steps.push(s);
    return s;
  };
  const clampMove = (dx: number, dy: number): [number, number] => {
    const L = Math.hypot(dx, dy);
    return L > cap ? [(dx * cap) / L, (dy * cap) / L] : [dx, dy];
  };
  const fnorm = (s: RelaxStep) => Math.hypot(s.fx, s.fy);
  let cur = evalAt(start[0], start[1], 'start');
  const done = () => fnorm(cur) < tol;
  const budget = () => steps.length - 1 < o.maxSteps;

  if (method === 'sd') {
    while (budget() && !done()) {
      const [dx, dy] = clampMove(o.step * cur.fx, o.step * cur.fy);
      cur = evalAt(cur.x + dx, cur.y + dy, 'step');
    }
  } else if (method === 'damped') {
    const mu = o.damping ?? 0.4;
    let vx = 0;
    let vy = 0;
    while (budget() && !done()) {
      // v_{n+1/2} = ((1 - mu/2) v_{n-1/2} + step F_n) / (1 + mu/2); x_{n+1} = x_n + v_{n+1/2}
      vx = ((1 - mu / 2) * vx + o.step * cur.fx) / (1 + mu / 2);
      vy = ((1 - mu / 2) * vy + o.step * cur.fy) / (1 + mu / 2);
      [vx, vy] = clampMove(vx, vy);
      cur = evalAt(cur.x + vx, cur.y + vy, 'step');
    }
  } else if (method === 'cg') {
    // search direction d starts along the force; each line takes a trial step and a corrector step
    let dx = cur.fx;
    let dy = cur.fy;
    while (budget() && !done()) {
      const g0 = -(dx * cur.fx + dy * cur.fy); // slope of E along d at the start of the line (negative)
      const [tx, ty] = clampMove(o.step * dx, o.step * dy);
      const tau = Math.hypot(tx, ty) / Math.hypot(dx, dy);
      const trial = evalAt(cur.x + tx, cur.y + ty, 'trial');
      if (!budget()) break;
      const gt = -(dx * trial.fx + dy * trial.fy);
      // secant on the slope: the minimum of the parabola through both slopes (exact on a quadratic)
      let alpha = g0 - gt < 0 ? (tau * g0) / (g0 - gt) : 3 * tau;
      if (!(alpha > 0)) alpha = 3 * tau;
      const [cx, cy] = clampMove(alpha * dx, alpha * dy);
      const next = evalAt(cur.x + cx, cur.y + cy, 'correct');
      // Polak-Ribiere update, restarted along the force when it stops pointing downhill
      const gg = cur.fx * cur.fx + cur.fy * cur.fy;
      const beta = Math.max(0, (next.fx * (next.fx - cur.fx) + next.fy * (next.fy - cur.fy)) / gg);
      dx = next.fx + beta * dx;
      dy = next.fy + beta * dy;
      if (dx * next.fx + dy * next.fy <= 0) {
        dx = next.fx;
        dy = next.fy;
      }
      cur = next;
    }
  } else {
    // BFGS on the inverse Hessian H, starting from H = step * identity
    let h = [o.step, 0, 0, o.step]; // h11, h12, h21, h22
    while (budget() && !done()) {
      let [px, py] = [h[0]! * cur.fx + h[1]! * cur.fy, h[2]! * cur.fx + h[3]! * cur.fy];
      [px, py] = clampMove(px, py);
      const next = evalAt(cur.x + px, cur.y + py, 'step');
      const sx = px;
      const sy = py;
      const yx = cur.fx - next.fx; // y = g_new - g_old = F_old - F_new
      const yy = cur.fy - next.fy;
      const sy_ = sx * yx + sy * yy;
      if (sy_ > 1e-14) {
        const r = 1 / sy_;
        // H <- (I - r s y^T) H (I - r y s^T) + r s s^T
        const a = [1 - r * sx * yx, -r * sx * yy, -r * sy * yx, 1 - r * sy * yy];
        const ah = [
          a[0]! * h[0]! + a[1]! * h[2]!,
          a[0]! * h[1]! + a[1]! * h[3]!,
          a[2]! * h[0]! + a[3]! * h[2]!,
          a[2]! * h[1]! + a[3]! * h[3]!,
        ];
        h = [
          ah[0]! * a[0]! + ah[1]! * a[1]! + r * sx * sx,
          ah[0]! * a[2]! + ah[1]! * a[3]! + r * sx * sy,
          ah[2]! * a[0]! + ah[3]! * a[1]! + r * sy * sx,
          ah[2]! * a[2]! + ah[3]! * a[3]! + r * sy * sy,
        ];
      }
      cur = next;
    }
  }
  return { steps, converged: done() };
}

/** Newton's method on the gradient (finite-difference Hessian): an independent way to locate a stationary point. */
export function newtonStationary(
  surface: Surface2D,
  start: [number, number],
  iterations = 50,
): [number, number] {
  let [x, y] = start;
  const h = 1e-6;
  for (let k = 0; k < iterations; k++) {
    const [gx, gy] = surface.gradient(x, y);
    const [gxx1, gyx1] = surface.gradient(x + h, y);
    const [gxx0, gyx0] = surface.gradient(x - h, y);
    const [gxy1, gyy1] = surface.gradient(x, y + h);
    const [gxy0, gyy0] = surface.gradient(x, y - h);
    const hxx = (gxx1 - gxx0) / (2 * h);
    const hyx = (gyx1 - gyx0) / (2 * h);
    const hxy = (gxy1 - gxy0) / (2 * h);
    const hyy = (gyy1 - gyy0) / (2 * h);
    const det = hxx * hyy - hxy * hyx;
    x -= (hyy * gx - hxy * gy) / det;
    y -= (-hyx * gx + hxx * gy) / det;
  }
  return [x, y];
}
