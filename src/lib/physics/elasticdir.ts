// Elastic strain in three dimensions (M16.11): strain energy, the strained cell and the directional Young's modulus.
// Voigt order 11 22 33 23 13 12 with engineering shear strains (e4 = 2 eps_23, ...), as in mechanics/elastic.ts.
//   Strain energy density: U = (1/2) e^T C e (S-042, S-158).
//   Directional Young's modulus: 1 / E(n) = s_ijkl n_i n_j n_k n_l, with s_ijkl from the Voigt compliance S_mn
//   (s_ijkl = S_mn when m, n <= 3; S_mn / 2 when one of them is a shear index; S_mn / 4 when both are) (S-158).
//   For a cubic crystal this reduces to 1/E = S11 - 2 (S11 - S12 - S44 / 2)(n1^2 n2^2 + n2^2 n3^2 + n3^2 n1^2).
// @source S-158 (Nye, tensor properties), S-042 (elastic chapter), S-076
export type Voigt6 = [number, number, number, number, number, number];
type V3 = [number, number, number];

/** Voigt index (0..5) of the tensor index pair (i, j), 0-based: 00 11 22 12 02 01. */
export const voigtIndex = (i: number, j: number): number => (i === j ? i : 6 - i - j);

/** Strain energy density (1/2) e^T C e in the units of C (GPa for C in GPa and dimensionless strain). */
export function strainEnergyDensity(c: readonly (readonly number[])[], e: readonly number[]): number {
  let u = 0;
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) u += e[i]! * c[i]![j]! * e[j]!;
  return u / 2;
}

/** Stress sigma = C e (Voigt), units of C. */
export function stressFromStrain(c: readonly (readonly number[])[], e: readonly number[]): Voigt6 {
  return [0, 1, 2, 3, 4, 5].map((i) => c[i]!.reduce((s, cij, j) => s + cij * e[j]!, 0)) as Voigt6;
}

/** The symmetric strain tensor eps_ij of a Voigt strain (engineering shears halved). */
export function strainTensor(e: readonly number[]): [V3, V3, V3] {
  return [
    [e[0]!, e[5]! / 2, e[4]! / 2],
    [e[5]! / 2, e[1]!, e[3]! / 2],
    [e[4]! / 2, e[3]! / 2, e[2]!],
  ];
}

/** Lattice rows after the deformation x -> (I + eps) x (rows are vectors, so a' = a (I + eps)^T = a (I + eps)). */
export function strainLattice(lattice: readonly (readonly number[])[], e: readonly number[]): [V3, V3, V3] {
  const t = strainTensor(e);
  return lattice.map(
    (r) => [0, 1, 2].map((j) => r[j]! + r[0]! * t[0]![j]! + r[1]! * t[1]![j]! + r[2]! * t[2]![j]!) as V3,
  ) as [V3, V3, V3];
}

/** Young's modulus along the direction n (any length), from the Voigt compliance S (1/GPa): returns GPa. */
export function directionalYoung(s: readonly (readonly number[])[], n: readonly number[]): number {
  const len = Math.hypot(n[0]!, n[1]!, n[2]!);
  const u = [n[0]! / len, n[1]! / len, n[2]! / len];
  let inv = 0;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++)
        for (let l = 0; l < 3; l++) {
          const m = voigtIndex(i, j);
          const p = voigtIndex(k, l);
          const f = (m > 2 ? 0.5 : 1) * (p > 2 ? 0.5 : 1);
          inv += f * s[m]![p]! * u[i]! * u[j]! * u[k]! * u[l]!;
        }
  return 1 / inv;
}

/**
 * The surface r(n) = E(n) n over a theta-phi grid (`nt` x `np` quads), scaled by `scale`: flat positions, triangle
 * indices and the modulus per vertex (GPa). The closed surface of directional stiffness.
 */
export function youngSurface(
  s: readonly (readonly number[])[],
  nt = 36,
  np = 72,
  scale = 1,
): { positions: number[]; indices: number[]; values: number[]; min: number; max: number } {
  const positions: number[] = [];
  const values: number[] = [];
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j <= nt; j++) {
    const th = (Math.PI * j) / nt;
    for (let i = 0; i <= np; i++) {
      const ph = (2 * Math.PI * i) / np;
      const n: V3 = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
      const e = directionalYoung(s, n);
      positions.push(n[0] * e * scale, n[1] * e * scale, n[2] * e * scale);
      values.push(e);
      min = Math.min(min, e);
      max = Math.max(max, e);
    }
  }
  const indices: number[] = [];
  const w = np + 1;
  for (let j = 0; j < nt; j++)
    for (let i = 0; i < np; i++) {
      const a = j * w + i;
      indices.push(a, a + w, a + 1, a + 1, a + w, a + w + 1);
    }
  return { positions, indices, values, min, max };
}

/** Isotropic stiffness (Voigt) from the bulk and shear moduli: C11 = B + 4G/3, C12 = B - 2G/3, C44 = G. */
export function isotropicStiffness(b: number, g: number): number[][] {
  const c11 = b + (4 * g) / 3;
  const c12 = b - (2 * g) / 3;
  return [0, 1, 2, 3, 4, 5].map((i) =>
    [0, 1, 2, 3, 4, 5].map((j) => (i < 3 && j < 3 ? (i === j ? c11 : c12) : i === j ? g : 0)),
  );
}
