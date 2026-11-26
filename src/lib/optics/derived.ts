// Optical quantities derived from the complex dielectric function eps = eps1 + i eps2 (M15.5).
// @source S-042 (Workflow Handbook, Optical properties, "Quantities derived by 711": |eps|, n, k, alpha, R, L, sigma;
//   "Metals lack the intraband Drude term in LOPTICS"; "Anisotropy: report xx, yy, zz separately or state that you
//   averaged"), S-082 (textbook form of the same relations), S-031 (hbar, c, eps0)
import {
  ELEMENTARY_CHARGE_C,
  HBAR_J_S,
  SPEED_OF_LIGHT_M_S,
  VACUUM_PERMITTIVITY_F_M,
} from '../physics/constants';

export interface OpticalPoint {
  absEps: number;
  /** Refractive index n. */
  n: number;
  /** Extinction coefficient k. */
  k: number;
  /** Absorption coefficient alpha = 2 omega k / c, in 1/cm. */
  alphaPerCm: number;
  /** Normal-incidence reflectivity. */
  reflectivity: number;
  /** Energy-loss function eps2 / (eps1^2 + eps2^2). */
  loss: number;
  /** Real part of the optical conductivity, omega eps0 eps2, in S/m. */
  sigmaSPerM: number;
}

/** omega in rad/s for a photon energy in eV: E e / hbar. */
export function angularFrequency(energyEv: number): number {
  return (energyEv * ELEMENTARY_CHARGE_C) / HBAR_J_S;
}

export function opticalPoint(energyEv: number, eps1: number, eps2: number): OpticalPoint {
  const absEps = Math.hypot(eps1, eps2);
  const n = Math.sqrt((absEps + eps1) / 2);
  // max(0, ...) guards round-off when eps2 is 0 and eps1 > 0 (k is exactly 0 there).
  const k = Math.sqrt(Math.max(0, (absEps - eps1) / 2));
  const omega = angularFrequency(energyEv);
  const denom = eps1 * eps1 + eps2 * eps2;
  return {
    absEps,
    n,
    k,
    alphaPerCm: (2 * omega * k) / SPEED_OF_LIGHT_M_S / 100,
    reflectivity: ((n - 1) ** 2 + k * k) / ((n + 1) ** 2 + k * k),
    loss: denom > 0 ? eps2 / denom : 0,
    sigmaSPerM: omega * VACUUM_PERMITTIVITY_F_M * eps2,
  };
}

export type DiagonalComponent = 'xx' | 'yy' | 'zz';
export type OpticsSeriesName = DiagonalComponent | 'average';

export interface DielectricSeries {
  energiesEv: readonly number[];
  /** Per component, same length as energiesEv. Only xx, yy, zz are used here. */
  eps1: Readonly<Record<DiagonalComponent, readonly number[]>>;
  eps2: Readonly<Record<DiagonalComponent, readonly number[]>>;
}

export interface OpticsResult {
  energiesEv: readonly number[];
  series: Record<OpticsSeriesName, OpticalPoint[]>;
  /** How "average" is formed, to state next to any averaged number (S-042). */
  averageRule: string;
  /** Shown next to the result; includes the Drude caveat for metals (S-042). */
  notes: string[];
}

export const AVERAGE_RULE =
  'average: eps1 and eps2 are averaged over xx, yy and zz first, then n, k, alpha, R, L and sigma are derived from that average.';
export const DRUDE_NOTE =
  'Metal: LOPTICS has no intraband (Drude) term, so the low-energy part of these spectra is incomplete (S-042).';

/** All derived quantities per diagonal component and for the averaged dielectric function. */
export function deriveOptics(data: DielectricSeries, options: { isMetal?: boolean } = {}): OpticsResult {
  const comps: DiagonalComponent[] = ['xx', 'yy', 'zz'];
  const e = data.energiesEv;
  const series = {} as Record<OpticsSeriesName, OpticalPoint[]>;
  for (const c of comps) series[c] = e.map((en, i) => opticalPoint(en, data.eps1[c][i]!, data.eps2[c][i]!));
  series.average = e.map((en, i) => {
    const a1 = comps.reduce((s, c) => s + data.eps1[c][i]!, 0) / 3;
    const a2 = comps.reduce((s, c) => s + data.eps2[c][i]!, 0) / 3;
    return opticalPoint(en, a1, a2);
  });
  const notes = [
    'Anisotropic crystals: report xx, yy and zz separately, or state that you averaged (S-042).',
  ];
  if (options.isMetal) notes.unshift(DRUDE_NOTE);
  return { energiesEv: e, series, averageRule: AVERAGE_RULE, notes };
}
