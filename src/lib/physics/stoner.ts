/**
 * Constant-DOS Stoner toy model for itinerant ferromagnetism.
 *
 * Derivation (Blundell, Magnetism in Condensed Matter, @source S-059):
 * Consider a flat electronic band with constant density of states N (states / eV per spin)
 * over an energy window [-W/2, +W/2] around the Fermi level, with half-filling so the
 * maximum possible spin imbalance is m_max = N * W (in units of mu_B).
 * Shifting delta_n = m / 2 electrons from the down-spin band to the up-spin band moves them
 * across an energy shift delta_E = delta_n / N = m / (2 N).
 * The kinetic energy cost is:
 *   Delta E_kin(m) = (1/2) * delta_n * delta_E = m^2 / (4 N)
 * The mean-field Stoner exchange energy gain is:
 *   Delta E_xc(m) = -(1/4) * I * m^2
 * Total quadratic energy change:
 *   Delta E_2(m) = (1 / (4 N)) * (1 - I * N) * m^2
 * Therefore a non-zero magnetization lowers the energy if and only if the Stoner criterion holds:
 *   I * N > 1
 *
 * To give a smooth finite equilibrium magnetization in the toy plot when I * N > 1 without
 * jumping discontinuously to full saturation, we include a minimal positive quartic
 * band-curvature term c4 * m^4 (with c4 > 0, chosen so m saturates smoothly toward m_max).
 * Because c4 > 0, the sign of the quadratic term (1 - I * N) still governs the exact onset:
 *   - For I * N <= 1: unique minimum at m* = 0 (non-magnetic).
 *   - For I * N > 1: symmetric minima at m* = +/- sqrt((I * N - 1) / (8 * N * c4)) (clamped to m_max),
 *     with Delta E(m*) < 0.
 *
 * @source S-059
 */

export interface StonerParams {
  /** Density of states at the Fermi level per spin, N(E_F), in states/eV. */
  readonly dosPerSpin: number;
  /** Stoner exchange parameter I, in eV. */
  readonly stonerI: number;
  /** Maximum moment cap (band saturation) in mu_B. Default 2.0. */
  readonly maxMoment?: number;
}

export interface StonerResult {
  readonly productIN: number;
  readonly isMagnetic: boolean;
  /** Equilibrium magnetization m* >= 0 in mu_B. */
  readonly equilibriumMoment: number;
  /** Exchange splitting Delta_xc = I * m* in eV. */
  readonly splittingEv: number;
  /** Energy difference Delta E(m*) = E(m*) - E(0) in eV (<= 0). */
  readonly energyGainEv: number;
  /** Kinetic energy cost at m* in eV (>= 0). */
  readonly kineticCostEv: number;
  /** Exchange energy gain at m* in eV (<= 0). */
  readonly exchangeGainEv: number;
}

const DEFAULT_MAX_MOMENT = 2.0;

function quarticCoeff(dosPerSpin: number, maxMoment: number): number {
  // Keeps m* = 0 for I*N <= 1 and scales smoothly inside [0, maxMoment] for I*N > 1.
  return 1 / (4 * dosPerSpin * maxMoment * maxMoment);
}

/**
 * Energy change Delta E(m) = E(m) - E(0) in eV for a given moment m (mu_B).
 * @source S-059
 */
export function stonerEnergy(params: StonerParams, moment: number): number {
  const { dosPerSpin, stonerI } = params;
  const maxM = params.maxMoment ?? DEFAULT_MAX_MOMENT;
  const m2 = moment * moment;
  const quad = ((1 - stonerI * dosPerSpin) / (4 * dosPerSpin)) * m2;
  const quart = quarticCoeff(dosPerSpin, maxM) * m2 * m2;
  return quad + quart;
}

/**
 * Solve the constant-DOS Stoner toy model for its equilibrium magnetization.
 * @source S-059
 */
export function solveStoner(params: StonerParams): StonerResult {
  const { dosPerSpin, stonerI } = params;
  const maxM = params.maxMoment ?? DEFAULT_MAX_MOMENT;
  const productIN = stonerI * dosPerSpin;
  if (productIN <= 1) {
    return {
      productIN,
      isMagnetic: false,
      equilibriumMoment: 0,
      splittingEv: 0,
      energyGainEv: 0,
      kineticCostEv: 0,
      exchangeGainEv: 0,
    };
  }
  const c4 = quarticCoeff(dosPerSpin, maxM);
  const rawM = Math.sqrt((productIN - 1) / (8 * dosPerSpin * c4));
  const equilibriumMoment = Math.min(rawM, maxM);
  const m2 = equilibriumMoment * equilibriumMoment;
  const kineticCostEv = m2 / (4 * dosPerSpin) + c4 * m2 * m2;
  const exchangeGainEv = -(stonerI * m2) / 4;
  return {
    productIN,
    isMagnetic: true,
    equilibriumMoment,
    splittingEv: stonerI * equilibriumMoment,
    energyGainEv: kineticCostEv + exchangeGainEv,
    kineticCostEv,
    exchangeGainEv,
  };
}

export interface StonerDosPoint {
  readonly energyEv: number;
  readonly up: number;
  readonly down: number;
}

/**
 * Generate mirrored spin-up (+N) and spin-down (-N) toy rectangular DOS curves
 * shifted by +/- (I * m*) / 2 around E_F = 0.
 * @source S-059
 */
export function stonerDosCurves(params: StonerParams, halfWidthEv = 2.0): StonerDosPoint[] {
  const res = solveStoner(params);
  const shift = res.splittingEv / 2;
  const eMin = -halfWidthEv - 1.5;
  const eMax = halfWidthEv + 1.5;
  const steps = 120;
  const pts: StonerDosPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const e = eMin + ((eMax - eMin) * i) / steps;
    const inUp = e >= -halfWidthEv - shift && e <= halfWidthEv - shift;
    const inDown = e >= -halfWidthEv + shift && e <= halfWidthEv + shift;
    pts.push({
      energyEv: e,
      up: inUp ? params.dosPerSpin : 0,
      down: inDown ? -params.dosPerSpin : 0,
    });
  }
  return pts;
}
