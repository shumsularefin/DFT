// Symmetric 3x3 tensors (M16.11): principal values and axes, rotation, and the response D = eps E. Pure.
// Principal axes by cyclic Jacobi rotations (Numerical Recipes 11.1, S-068), with the eigenvectors accumulated.
// The dielectric tensor is symmetric for a non-magnetic crystal, so D = eps E and the field component
// E.eps.E / |E|^2 (eps along the field direction) are the closed forms used by the dielectric scene (S-082, S-042).
// @source S-068, S-082, S-042
export type Vec3 = [number, number, number];

export type Mat3x3 = [Vec3, Vec3, Vec3];

/** Principal values (ascending) and unit principal axes (axes[i] belongs to values[i]) of a symmetric 3x3 matrix. */
export function symmetricEigen3(m: readonly (readonly number[])[]): {
  values: Vec3;
  axes: [Vec3, Vec3, Vec3];
} {
  const a = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (m[i]![j]! + m[j]![i]!) / 2));
  const v = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
  for (let sweep = 0; sweep < 60; sweep++) {
    const off = a[0]![1]! ** 2 + a[0]![2]! ** 2 + a[1]![2]! ** 2;
    const diag = a[0]![0]! ** 2 + a[1]![1]! ** 2 + a[2]![2]! ** 2;
    if (off <= 1e-32 * Math.max(diag, 1e-300)) break;
    for (let p = 0; p < 2; p++)
      for (let q = p + 1; q < 3; q++) {
        const apq = a[p]![q]!;
        if (apq === 0) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < 3; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = c * akp - s * akq;
          a[k]![q] = s * akp + c * akq;
        }
        for (let k = 0; k < 3; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = c * apk - s * aqk;
          a[q]![k] = s * apk + c * aqk;
        }
        for (let k = 0; k < 3; k++) {
          const vkp = v[k]![p]!;
          const vkq = v[k]![q]!;
          v[k]![p] = c * vkp - s * vkq;
          v[k]![q] = s * vkp + c * vkq;
        }
      }
  }
  const order = [0, 1, 2].sort((i, j) => a[i]![i]! - a[j]![j]!);
  const values = order.map((i) => a[i]![i]!) as unknown as Vec3;
  const axes = order.map((i) => [v[0]![i]!, v[1]![i]!, v[2]![i]!] as Vec3) as [Vec3, Vec3, Vec3];
  return { values, axes };
}

/** Rotation by `angle` (radians) about the y axis. */
export function rotationY(angle: number): Mat3x3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [c, 0, s],
    [0, 1, 0],
    [-s, 0, c],
  ];
}

export function matVec(m: readonly (readonly number[])[], x: readonly number[]): Vec3 {
  return [0, 1, 2].map((i) => m[i]![0]! * x[0]! + m[i]![1]! * x[1]! + m[i]![2]! * x[2]!) as unknown as Vec3;
}

/** R diag(d) R^T: a symmetric tensor with principal values d along the columns of R. */
export function fromPrincipal(d: readonly [number, number, number], r: Mat3x3): Mat3x3 {
  return [0, 1, 2].map(
    (i) =>
      [0, 1, 2].map(
        (j) => d[0] * r[i]![0]! * r[j]![0]! + d[1] * r[i]![1]! * r[j]![1]! + d[2] * r[i]![2]! * r[j]![2]!,
      ) as unknown as Vec3,
  ) as Mat3x3;
}

/** eps along a direction: n.eps.n / |n|^2. */
export function alongDirection(m: readonly (readonly number[])[], n: readonly number[]): number {
  const e = matVec(m, n);
  return (e[0] * n[0]! + e[1] * n[1]! + e[2] * n[2]!) / (n[0]! ** 2 + n[1]! ** 2 + n[2]! ** 2);
}

/** Unit vector from polar angle theta (from z) and azimuth phi, radians. */
export const direction = (theta: number, phi: number): Vec3 => [
  Math.sin(theta) * Math.cos(phi),
  Math.sin(theta) * Math.sin(phi),
  Math.cos(theta),
];
