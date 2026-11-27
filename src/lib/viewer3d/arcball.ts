// Free-moving camera for every 3D view (M16.1, D-108). The camera is a quaternion, a distance and a target, like the builder's
// VESTA-style viewer (prior art: `vesta.js` camState on the layout branch), so it turns to ANY orientation: there is no polar
// angle and no pole clamp, which is what made OrbitControls feel stuck. Pure and immutable: every function returns a new state.
// Camera frame: the camera looks along its local -z, its local +y is "up" on screen, its local +x is "right".
import {
  add,
  cross,
  dot,
  normalize,
  norm,
  quatFromAxisAngle,
  quatFromBasis,
  quatMul,
  quatNormalize,
  rotate,
  scale,
  slerp,
  sub,
  type Quat,
  type Vec3,
} from './math';

export interface CameraState {
  /** Orientation of the camera frame in the world. Unit length, w >= 0. */
  q: Quat;
  /** Distance from the camera to the target. */
  dist: number;
  /** The point the camera looks at and turns about. */
  target: Vec3;
}

export interface CameraLimits {
  minDist: number;
  maxDist: number;
}

/** Radians of rotation per pixel of drag. A drag across a 600 px view turns about 180 degrees. */
export const DRAG_RAD_PER_PX = Math.PI / 600;

export const right = (s: CameraState): Vec3 => rotate(s.q, [1, 0, 0]);
export const up = (s: CameraState): Vec3 => rotate(s.q, [0, 1, 0]);
/** Unit vector from the camera towards the target. */
export const viewDirection = (s: CameraState): Vec3 => rotate(s.q, [0, 0, -1]);
export const position = (s: CameraState): Vec3 => add(s.target, rotate(s.q, [0, 0, s.dist]));

/**
 * Orientation that looks along `dir` (from the camera towards the target) with screen-up as close to `upHint` as possible.
 * When `upHint` is parallel to `dir`, a perpendicular fallback is used, so every direction (the poles included) works.
 */
export function lookAlong(dir: Vec3, upHint: Vec3 = [0, 0, 1]): Quat {
  const back = normalize(scale(dir, -1));
  if (norm(back) === 0) return [0, 0, 0, 1];
  let r = cross(upHint, back);
  if (norm(r) < 1e-9 * Math.max(1, norm(upHint))) {
    // up hint along the view: pick the world axis least parallel to the view as the hint
    const axes: Vec3[] = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1],
    ];
    const hint = axes.reduce((best, a) => (Math.abs(dot(a, back)) < Math.abs(dot(best, back)) ? a : best));
    r = cross(hint, back);
  }
  const x = normalize(r);
  const y = cross(back, x);
  return quatFromBasis(x, y, back);
}

export function cameraFrom(eyeDir: Vec3, target: Vec3, dist: number, upHint: Vec3 = [0, 0, 1]): CameraState {
  return { q: lookAlong(scale(eyeDir, -1), upHint), dist, target: [...target] };
}

/**
 * Trackball drag of (dx, dy) pixels, screen y down. The object turns with the pointer about the screen axis perpendicular to
 * the drag (drag right: the front moves right; drag down: the front moves down). The camera turns the opposite way about the
 * target. No angle is clamped, so repeated drags carry the view over the top and keep going.
 */
export function drag(s: CameraState, dx: number, dy: number, radPerPx = DRAG_RAD_PER_PX): CameraState {
  const len = Math.hypot(dx, dy);
  if (len === 0) return s;
  const axisCam: Vec3 = [dy / len, dx / len, 0];
  return rotateObject(s, axisCam, len * radPerPx);
}

/** Turn the object by `angle` radians about an axis given in camera coordinates (x right, y up, z towards the viewer). */
export function rotateObject(s: CameraState, axisCam: Vec3, angle: number): CameraState {
  return { ...s, q: quatNormalize(quatMul(s.q, quatFromAxisAngle(axisCam, -angle))) };
}

/** Roll about the line of sight; positive turns the picture counter-clockwise. */
export function roll(s: CameraState, angle: number): CameraState {
  return rotateObject(s, [0, 0, 1], angle);
}

/** Half height of the view at the target plane (perspective: from the field of view; orthographic uses the same rule). */
export const halfHeight = (s: CameraState, fovDeg: number): number =>
  s.dist * Math.tan((fovDeg * Math.PI) / 360);

/**
 * Multiply the distance by `factor`, keeping the world point under the cursor fixed. `ndc` is the cursor in normalised device
 * coordinates (-1..1, y up); omit it to zoom about the centre. The distance stays within `limits`.
 */
export function zoom(
  s: CameraState,
  factor: number,
  limits: CameraLimits,
  ndc?: [number, number],
  aspect = 1,
  fovDeg = 35,
): CameraState {
  const dist = Math.max(limits.minDist, Math.min(limits.maxDist, s.dist * factor));
  const f = dist / s.dist;
  if (!ndc) return { ...s, dist };
  const hh = halfHeight(s, fovDeg);
  const offset = add(scale(right(s), ndc[0] * hh * aspect), scale(up(s), ndc[1] * hh));
  return { ...s, dist, target: add(s.target, scale(offset, 1 - f)) };
}

/** Slide the view: the content follows the pointer by (dx, dy) pixels, screen y down, in a view `viewportH` pixels tall. */
export function pan(s: CameraState, dx: number, dy: number, viewportH: number, fovDeg = 35): CameraState {
  const perPx = (2 * halfHeight(s, fovDeg)) / Math.max(1, viewportH);
  const shift = add(scale(right(s), -dx * perPx), scale(up(s), dy * perPx));
  return { ...s, target: add(s.target, shift) };
}

/** World point that a screen point (ndc) at the target depth corresponds to. Used by zoom-to-cursor tests and picking. */
export function ndcToWorld(s: CameraState, ndc: [number, number], aspect = 1, fovDeg = 35): Vec3 {
  const hh = halfHeight(s, fovDeg);
  return add(s.target, add(scale(right(s), ndc[0] * hh * aspect), scale(up(s), ndc[1] * hh)));
}

/** Project a world point to ndc for a perspective camera with the given field of view. */
export function worldToNdc(s: CameraState, p: Vec3, aspect = 1, fovDeg = 35): [number, number, number] {
  const rel = sub(p, position(s));
  const z = -dot(rel, rotate(s.q, [0, 0, 1])); // depth in front of the camera
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const x = dot(rel, right(s)) / (z * t * aspect);
  const y = dot(rel, up(s)) / (z * t);
  return [x, y, z];
}

/** Camera tween for state changes: spherical in orientation, linear in distance and target. */
export function interpolate(a: CameraState, b: CameraState, t: number): CameraState {
  const k = Math.max(0, Math.min(1, t));
  return {
    q: slerp(a.q, b.q, k),
    dist: a.dist + (b.dist - a.dist) * k,
    target: add(a.target, scale(sub(b.target, a.target), k)),
  };
}

/**
 * Inertia after a drag: keeps turning about the last drag axis, slowing by `decayPerSecond`. Returns the new state and the
 * remaining angular speed (rad/s); the caller stops when the speed falls below a threshold. Off under reduced motion.
 */
export function coast(
  s: CameraState,
  axisCam: Vec3,
  speed: number,
  dt: number,
  decayPerSecond = 6,
): { state: CameraState; speed: number } {
  const next = speed * Math.exp(-decayPerSecond * dt);
  return { state: rotateObject(s, axisCam, ((speed + next) / 2) * dt), speed: next };
}

/** Compact text form for `data-camera` (quaternion and distance), read by e2e tests. */
export const cameraKey = (s: CameraState): string =>
  [...s.q, s.dist, ...s.target].map((v) => (Math.abs(v) < 5e-5 ? 0 : v).toFixed(4)).join(' ');
