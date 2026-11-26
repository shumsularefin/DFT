// Elastic-tensor analysis: compliance, stability, averaged moduli, sound velocities, Debye temperature and the
// empirical mechanical indicators. Pure functions on a 6x6 stiffness matrix in Voigt order (11 22 33 23 13 12), GPa.
// @source S-042 (elastic chapter: formulas and indicator table), S-072 (stability), S-076 (Voigt, Reuss, Hill),
// S-077 (universal anisotropy), S-078 (sound velocities, Debye temperature), S-073, S-074, S-075, S-079 (indicators)
// Golden values: tests/reference/elastic_reference.json (pymatgen ElasticTensor, S-034).
import { cellVolume } from '../crystal/lattice';
import { densityGcm3 } from '../crystal/structure';
import type { Structure } from '../crystal/types';
import { BOLTZMANN_J_K, PLANCK_J_S } from '../physics/constants';
import type { EosFit } from '../physics/eos';

export type Matrix6 = number[][];

/** Crystal classes with a closed-form Born condition shown as explanation (S-042 table, checked against S-072). */
export type BornClass = 'cubic' | 'hexagonal' | 'tetragonal-I';

/** (C + C^T) / 2. VASP prints a nearly symmetric matrix; the analysis always uses the symmetric part. */
export function symmetrize(c: readonly (readonly number[])[]): Matrix6 {
  return Array.from({ length: 6 }, (_, i) =>
    Array.from({ length: 6 }, (_, j) => (c[i]![j]! + c[j]![i]!) / 2),
  );
}

/** Inverse of a 6x6 matrix by Gauss-Jordan elimination with partial pivoting. Undefined when (near) singular. */
export function invert6(c: readonly (readonly number[])[]): Matrix6 | undefined {
  const n = 6;
  const a = c.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(...c.flat().map(Math.abs));
  if (!(scale > 0)) return undefined;
  for (let col = 0; col < n; col++) {
    let p = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r]![col]!) > Math.abs(a[p]![col]!)) p = r;
    if (Math.abs(a[p]![col]!) < 1e-12 * scale) return undefined;
    [a[col], a[p]] = [a[p]!, a[col]!];
    const piv = a[col]![col]!;
    for (let k = 0; k < 2 * n; k++) a[col]![k]! /= piv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r]![col]!;
      if (f !== 0) for (let k = 0; k < 2 * n; k++) a[r]![k]! -= f * a[col]![k]!;
    }
  }
  return a.map((r) => r.slice(n));
}

/** Eigenvalues of a symmetric matrix (cyclic Jacobi rotations), ascending. */
export function symmetricEigenvalues(m: readonly (readonly number[])[]): number[] {
  const n = m.length;
  const a = m.map((r) => [...r]);
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    let diag = 0;
    for (let i = 0; i < n; i++) {
      diag += a[i]![i]! ** 2;
      for (let j = i + 1; j < n; j++) off += a[i]![j]! ** 2;
    }
    if (off <= 1e-30 * diag || off === 0) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = a[p]![q]!;
        if (apq === 0) continue;
        const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const cs = 1 / Math.sqrt(t * t + 1);
        const sn = t * cs;
        for (let k = 0; k < n; k++) {
          const akp = a[k]![p]!;
          const akq = a[k]![q]!;
          a[k]![p] = cs * akp - sn * akq;
          a[k]![q] = sn * akp + cs * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p]![k]!;
          const aqk = a[q]![k]!;
          a[p]![k] = cs * apk - sn * aqk;
          a[q]![k] = sn * apk + cs * aqk;
        }
      }
  }
  return a.map((r, i) => r[i]!).sort((x, y) => x - y);
}

export interface BornCondition {
  /** The inequality as text, Voigt indices. */
  text: string;
  holds: boolean;
}

export interface Stability {
  /** The six eigenvalues of the symmetric part of C, ascending, GPa. */
  eigenvaluesGPa: number[];
  /** All six eigenvalues positive: the necessary and sufficient Born condition for any lattice (S-072). */
  stable: boolean;
  /** Closed-form conditions for the chosen class, shown as explanation only; the eigenvalue test decides. */
  classConditions?: { cls: BornClass; conditions: BornCondition[] };
}

const c = (m: Matrix6, i: number, j: number): number => m[i - 1]![j - 1]!;

/**
 * Closed-form Born conditions for cubic, hexagonal and tetragonal (I) lattices, as tabulated in S-042 and checked
 * against Mouhat and Coudert (S-072). They assume the tensor already has that class's pattern.
 */
export function bornConditions(cm: Matrix6, cls: BornClass): BornCondition[] {
  const C = (i: number, j: number) => c(cm, i, j);
  if (cls === 'cubic')
    return [
      { text: 'C11 - C12 > 0', holds: C(1, 1) - C(1, 2) > 0 },
      { text: 'C11 + 2 C12 > 0', holds: C(1, 1) + 2 * C(1, 2) > 0 },
      { text: 'C44 > 0', holds: C(4, 4) > 0 },
    ];
  const common = [
    { text: 'C11 > |C12|', holds: C(1, 1) > Math.abs(C(1, 2)) },
    { text: '2 C13^2 < C33 (C11 + C12)', holds: 2 * C(1, 3) ** 2 < C(3, 3) * (C(1, 1) + C(1, 2)) },
    { text: 'C44 > 0', holds: C(4, 4) > 0 },
  ];
  if (cls === 'hexagonal')
    return [...common, { text: 'C66 = (C11 - C12) / 2 > 0', holds: (C(1, 1) - C(1, 2)) / 2 > 0 }];
  return [...common, { text: 'C66 > 0', holds: C(6, 6) > 0 }];
}

/** Stability by the eigenvalue test (S-072). `cls` adds the closed-form conditions for explanation. */
export function stability(cIn: readonly (readonly number[])[], cls?: BornClass): Stability {
  const cm = symmetrize(cIn);
  const eigenvaluesGPa = symmetricEigenvalues(cm);
  return {
    eigenvaluesGPa,
    stable: eigenvaluesGPa.every((e) => e > 0),
    ...(cls ? { classConditions: { cls, conditions: bornConditions(cm, cls) } } : {}),
  };
}

export interface Moduli {
  bVoigt: number;
  bReuss: number;
  bHill: number;
  gVoigt: number;
  gReuss: number;
  gHill: number;
  /** Young's modulus from the Hill averages, E = 9BG / (3B + G), GPa. */
  eHill: number;
  /** Poisson ratio from the Hill averages, nu = (3B - 2G) / (2 (3B + G)). */
  nuHill: number;
  /** Universal anisotropy A^U = 5 G_V / G_R + B_V / B_R - 6; 0 for an isotropic solid (S-077). */
  aU: number;
}

/** Young's modulus E = 9BG / (3B + G) (S-042). */
export const youngModulus = (b: number, g: number): number => (9 * b * g) / (3 * b + g);
/** Poisson ratio nu = (3B - 2G) / (2 (3B + G)) (S-042). */
export const poissonRatio = (b: number, g: number): number => (3 * b - 2 * g) / (2 * (3 * b + g));

export interface ElasticAnalysis {
  /** Symmetric part of the input, GPa. */
  stiffnessGPa: Matrix6;
  /** S = C^-1, 1/GPa. Undefined when C is singular. */
  complianceInvGPa?: Matrix6;
  stability: Stability;
  /** Undefined when C is singular (the Reuss bounds need S). */
  moduli?: Moduli;
}

/** Voigt-Reuss-Hill averages (S-076) and A^U (S-077) from C and S, formulas as in S-042. */
export function vrhModuli(cm: Matrix6, sm: Matrix6): Moduli {
  const C = (i: number, j: number) => c(cm, i, j);
  const S = (i: number, j: number) => c(sm, i, j);
  const bVoigt = (C(1, 1) + C(2, 2) + C(3, 3) + 2 * (C(1, 2) + C(1, 3) + C(2, 3))) / 9;
  const gVoigt =
    (C(1, 1) + C(2, 2) + C(3, 3) - (C(1, 2) + C(1, 3) + C(2, 3)) + 3 * (C(4, 4) + C(5, 5) + C(6, 6))) / 15;
  const bReuss = 1 / (S(1, 1) + S(2, 2) + S(3, 3) + 2 * (S(1, 2) + S(1, 3) + S(2, 3)));
  const gReuss =
    15 /
    (4 * (S(1, 1) + S(2, 2) + S(3, 3)) -
      4 * (S(1, 2) + S(1, 3) + S(2, 3)) +
      3 * (S(4, 4) + S(5, 5) + S(6, 6)));
  const bHill = (bVoigt + bReuss) / 2;
  const gHill = (gVoigt + gReuss) / 2;
  return {
    bVoigt,
    bReuss,
    bHill,
    gVoigt,
    gReuss,
    gHill,
    eHill: youngModulus(bHill, gHill),
    nuHill: poissonRatio(bHill, gHill),
    aU: (5 * gVoigt) / gReuss + bVoigt / bReuss - 6,
  };
}

/** Full analysis of a stiffness matrix in Voigt order, GPa. */
export function analyseElastic(cIn: readonly (readonly number[])[], cls?: BornClass): ElasticAnalysis {
  const stiffnessGPa = symmetrize(cIn);
  const complianceInvGPa = invert6(stiffnessGPa);
  return {
    stiffnessGPa,
    ...(complianceInvGPa ? { complianceInvGPa, moduli: vrhModuli(stiffnessGPa, complianceInvGPa) } : {}),
    stability: stability(stiffnessGPa, cls),
  };
}

export interface SoundAndDebye {
  /** Longitudinal velocity v_l = sqrt((B + 4G/3) / rho), m/s. */
  vLongitudinal: number;
  /** Transverse velocity v_t = sqrt(G / rho), m/s. */
  vTransverse: number;
  /** Mean velocity v_m = [(2 / v_t^3 + 1 / v_l^3) / 3]^(-1/3), m/s. */
  vMean: number;
  /** Debye temperature, K. */
  debyeK: number;
}

/**
 * Sound velocities and the Debye temperature (Anderson, S-078; formulas as in S-042), from the Hill averages.
 * theta_D = (h / k_B) [3 n N_A rho / (4 pi M)]^(1/3) v_m, written with the atom number density N/V, which is the same
 * quantity (n atoms per formula unit, N_A rho / M formula units per volume). Undefined when G <= 0 or B + 4G/3 <= 0.
 * @param densityGcm3 mass density from the structure (g/cm^3)
 * @param atomsPerA3 number of atoms per cubic angstrom (atoms in the cell / cell volume)
 */
export function soundAndDebye(
  bGPa: number,
  gGPa: number,
  densityGcm3: number,
  atomsPerA3: number,
): SoundAndDebye | undefined {
  const rho = densityGcm3 * 1000; // kg/m^3
  const mL = (bGPa + (4 * gGPa) / 3) * 1e9;
  const mT = gGPa * 1e9;
  if (!(mL > 0 && mT > 0 && rho > 0 && atomsPerA3 > 0)) return undefined;
  const vLongitudinal = Math.sqrt(mL / rho);
  const vTransverse = Math.sqrt(mT / rho);
  const vMean = ((2 / vTransverse ** 3 + 1 / vLongitudinal ** 3) / 3) ** (-1 / 3);
  const nPerM3 = atomsPerA3 * 1e30;
  const debyeK = (PLANCK_J_S / BOLTZMANN_J_K) * ((3 * nPerM3) / (4 * Math.PI)) ** (1 / 3) * vMean;
  return { vLongitudinal, vTransverse, vMean, debyeK };
}

/** Thresholds of the empirical indicators, each with its source. All are rules of thumb (Heuristic). */
export const INDICATOR_RULES = {
  /** Pugh: B/G above 1.75 reads as ductile (S-073, conventional reading of Pugh's data; S-042). */
  pughBG: { value: 1.75, source: 'S-073' },
  /** Poisson ratio above 0.26 reads as ductile (S-075, inferred later from Frantsevich's tables; S-042). */
  poisson: { value: 0.26, source: 'S-075' },
  /** Cauchy pressure C12 - C44: positive metallic and ductile, negative directional bonding (S-079; S-042). */
  cauchy: { value: 0, source: 'S-079' },
  /** Zener ratio 2 C44 / (C11 - C12): 1 is isotropic (S-042; cubic A^U = (6/5)(sqrt(A) - 1/sqrt(A))^2, S-077). */
  zener: { value: 1, source: 'S-042' },
  /** Chen Vickers hardness 2 (k^2 G)^0.585 - 3, k = G/B, G in GPa (S-074). Not applicable when negative. */
  chen: { source: 'S-074' },
} as const;

export interface Indicators {
  heuristic: true;
  /** B/G (Hill) and its reading. */
  pugh: { bOverG: number; reading: 'ductile' | 'brittle'; source: string };
  poisson: { nu: number; reading: 'ductile' | 'brittle'; source: string };
  /** C12 - C44, GPa; cubic only (builder's choice, D-090: other classes have several Cauchy relations). */
  cauchy?: { valueGPa: number; reading: 'metallic' | 'directional'; source: string };
  /** 2 C44 / (C11 - C12); cubic only. */
  zener?: { a: number; source: string };
  /** Chen hardness in GPa, or not applicable when the model gives a negative value (soft solids). */
  chenHardness:
    | { applicable: true; hvGPa: number; source: string }
    | { applicable: false; hvGPa: number; source: string };
}

/**
 * The empirical indicators of S-042, all Heuristic. `cubic` enables the Zener ratio (cubic in S-042) and the
 * C12 - C44 Cauchy pressure (cubic only by D-090).
 */
export function indicators(cm: Matrix6, m: Moduli, cubic: boolean): Indicators {
  const bOverG = m.bHill / m.gHill;
  const k = m.gHill / m.bHill;
  const hv = 2 * (k * k * m.gHill) ** 0.585 - 3;
  const R = INDICATOR_RULES;
  const cauchy = c(cm, 1, 2) - c(cm, 4, 4);
  return {
    heuristic: true,
    pugh: { bOverG, reading: bOverG > R.pughBG.value ? 'ductile' : 'brittle', source: R.pughBG.source },
    poisson: {
      nu: m.nuHill,
      reading: m.nuHill > R.poisson.value ? 'ductile' : 'brittle',
      source: R.poisson.source,
    },
    ...(cubic
      ? {
          cauchy: {
            valueGPa: cauchy,
            reading: cauchy > 0 ? ('metallic' as const) : ('directional' as const),
            source: R.cauchy.source,
          },
          zener: { a: (2 * c(cm, 4, 4)) / (c(cm, 1, 1) - c(cm, 1, 2)), source: R.zener.source },
        }
      : {}),
    chenHardness:
      Number.isFinite(hv) && hv >= 0
        ? { applicable: true, hvGPa: hv, source: R.chen.source }
        : { applicable: false, hvGPa: hv, source: R.chen.source },
  };
}

/** Default tolerance for the B_Hill vs B0 (EOS) cross-check: S-042 says "within a few percent"; 5 % is D-090. */
export const BULK_CROSSCHECK_TOLERANCE = 0.05;

export interface BulkCrossCheck {
  heuristic: true;
  bHillGPa: number;
  b0GPa: number;
  /** (B_Hill - B0) / B0. */
  relativeDifference: number;
  agrees: boolean;
  message: string;
}

/**
 * Compare B_Hill from Cij with B0 from the equation-of-state fit (M13.6). S-042: they should agree within a few
 * percent; a large difference points to an unconverged ENCUT or k-mesh, or residual stress. Heuristic.
 */
export function crossCheckBulk(
  bHillGPa: number,
  b0GPa: number,
  tolerance = BULK_CROSSCHECK_TOLERANCE,
): BulkCrossCheck {
  const relativeDifference = (bHillGPa - b0GPa) / b0GPa;
  const agrees = Math.abs(relativeDifference) <= tolerance;
  const pct = (100 * relativeDifference).toFixed(1);
  return {
    heuristic: true,
    bHillGPa,
    b0GPa,
    relativeDifference,
    agrees,
    message: agrees
      ? `B_Hill from Cij and B0 from the E(V) fit agree (${pct} %).`
      : `B_Hill from Cij and B0 from the E(V) fit differ by ${pct} %, more than ${(100 * tolerance).toFixed(0)} %. Check ENCUT and the k-mesh (both runs), and that the cell was relaxed at the elastic run's settings (residual pressure near zero).`,
  };
}

/** Sound velocities and Debye temperature for a structure (density and atom count from the POSCAR). */
export function soundAndDebyeForStructure(
  bGPa: number,
  gGPa: number,
  s: Structure,
): SoundAndDebye | undefined {
  return soundAndDebye(bGPa, gGPa, densityGcm3(s), s.species.length / Math.abs(cellVolume(s.lattice)));
}

/** The cross-check straight from an analysis and an M13.6 equation-of-state fit. */
export function crossCheckWithEos(m: Moduli, fit: Pick<EosFit, 'b0GPa'>, tolerance?: number): BulkCrossCheck {
  return crossCheckBulk(m.bHill, fit.b0GPa, tolerance);
}
