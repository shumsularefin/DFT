// Small pure vector and quaternion helpers for the 3D engine (M16.1). No three.js, so every camera rule is tested in Node.
// Quaternions are [x, y, z, w] with w the scalar part; they rotate vectors as q v q^-1.
export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
}
/** Angle between two vectors in radians (0 for a zero vector). */
export function angleBetween(a: Vec3, b: Vec3): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  // atan2 form: accurate near 0 and pi, where acos loses half the digits
  return Math.atan2(norm(cross(a, b)), dot(a, b));
}

export const QUAT_IDENTITY: Quat = [0, 0, 0, 1];

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatNormalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]);
  if (n === 0) return [...QUAT_IDENTITY];
  // keep w >= 0 so equal rotations have equal numbers (handy for tests and data-camera)
  const s = q[3] < 0 ? -1 / n : 1 / n;
  return [q[0] * s, q[1] * s, q[2] * s, q[3] * s];
}

export const quatConj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];

/** Rotation by `angle` radians about `axis` (need not be unit). A zero axis gives the identity. */
export function quatFromAxisAngle(axis: Vec3, angle: number): Quat {
  const u = normalize(axis);
  if (norm(u) === 0 || angle === 0) return [...QUAT_IDENTITY];
  const s = Math.sin(angle / 2);
  return [u[0] * s, u[1] * s, u[2] * s, Math.cos(angle / 2)];
}

export function rotate(q: Quat, v: Vec3): Vec3 {
  // v' = v + 2 w (u x v) + 2 u x (u x v), u = vector part
  const u: Vec3 = [q[0], q[1], q[2]];
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q[3])), cross(u, t));
}

/** Quaternion of a rotation matrix given by its three columns (an orthonormal right-handed basis). */
export function quatFromBasis(x: Vec3, y: Vec3, z: Vec3): Quat {
  const m00 = x[0],
    m10 = x[1],
    m20 = x[2];
  const m01 = y[0],
    m11 = y[1],
    m21 = y[2];
  const m02 = z[0],
    m12 = z[1],
    m22 = z[2];
  const tr = m00 + m11 + m22;
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s];
  }
  return quatNormalize(q);
}

/** Spherical interpolation, for camera tweens between states. */
export function slerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let c = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (c < 0) {
    c = -c;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (c > 0.9995) {
    return quatNormalize([
      a[0] + t * (bx - a[0]),
      a[1] + t * (by - a[1]),
      a[2] + t * (bz - a[2]),
      a[3] + t * (bw - a[3]),
    ]);
  }
  const th = Math.acos(c);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return quatNormalize([wa * a[0] + wb * bx, wa * a[1] + wb * by, wa * a[2] + wb * bz, wa * a[3] + wb * bw]);
}

/** Invert a 3 x 3 matrix given as rows. Returns null when singular. */
export function invert3(m: readonly (readonly number[])[]): number[][] | null {
  const [a, b, c] = m[0]!;
  const [d, e, f] = m[1]!;
  const [g, h, i] = m[2]!;
  const A = e! * i! - f! * h!;
  const B = -(d! * i! - f! * g!);
  const C = d! * h! - e! * g!;
  const det = a! * A + b! * B + c! * C;
  if (Math.abs(det) < 1e-14) return null;
  const s = 1 / det;
  return [
    [A * s, -(b! * i! - c! * h!) * s, (b! * f! - c! * e!) * s],
    [B * s, (a! * i! - c! * g!) * s, -(a! * f! - c! * d!) * s],
    [C * s, -(a! * h! - b! * g!) * s, (a! * e! - b! * d!) * s],
  ];
}
