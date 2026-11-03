// Small 3x3 linear algebra. Row-major, immutable, no dependencies.
import type { Mat3, Vec3 } from './types';

export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const norm = (a: Vec3): number => Math.sqrt(dot(a, a));
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];

export const det3 = (m: Mat3): number => dot(m[0], cross(m[1], m[2]));

export const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];

export const mul = (a: Mat3, b: Mat3): Mat3 => {
  const bt = transpose(b);
  return [
    [dot(a[0], bt[0]), dot(a[0], bt[1]), dot(a[0], bt[2])],
    [dot(a[1], bt[0]), dot(a[1], bt[1]), dot(a[1], bt[2])],
    [dot(a[2], bt[0]), dot(a[2], bt[1]), dot(a[2], bt[2])],
  ];
};

/** Inverse of a 3x3 matrix. Throws RangeError when singular. */
export function inv3(m: Mat3): Mat3 {
  const d = det3(m);
  if (Math.abs(d) < 1e-14 * Math.max(1, Math.abs(m[0][0] * m[1][1] * m[2][2]))) {
    throw new RangeError('matrix is singular');
  }
  const c0 = cross(m[1], m[2]);
  const c1 = cross(m[2], m[0]);
  const c2 = cross(m[0], m[1]);
  // columns of the inverse are the cross products divided by the determinant
  return [
    [c0[0] / d, c1[0] / d, c2[0] / d],
    [c0[1] / d, c1[1] / d, c2[1] / d],
    [c0[2] / d, c1[2] / d, c2[2] / d],
  ];
}

/** Row vector times matrix: v M. */
export const vecMat = (v: Vec3, m: Mat3): Vec3 => [
  v[0] * m[0][0] + v[1] * m[1][0] + v[2] * m[2][0],
  v[0] * m[0][1] + v[1] * m[1][1] + v[2] * m[2][1],
  v[0] * m[0][2] + v[1] * m[1][2] + v[2] * m[2][2],
];
