// A free Gaussian wave packet in one dimension: the closed-form solution of the time-dependent Schrodinger equation.
// @source S-047 (Griffiths and Schroeter: the free particle and the Gaussian wave packet, sections 2.4 and problem 2.21)
// @source S-031 (hbar, hbar^2/2m from CODATA 2018)
// Units: x in Angstrom, t in femtoseconds, energies in eV, k in 1/Angstrom.
//   psi(x, 0) = (2 pi s0^2)^(-1/4) exp(-(x - x0)^2 / (4 s0^2) + i k0 (x - x0))
//   psi(x, t) = (2 pi s0^2)^(-1/4) (1 + i t/tau)^(-1/2) exp(-u^2 / (4 s0^2 (1 + i t/tau)) + i k0 (x - x0 - v t / 2))
// with u = x - x0 - v t, v = hbar k0 / m (group velocity) and tau = 2 m s0^2 / hbar. The density stays Gaussian with
// width s(t) = s0 sqrt(1 + (t/tau)^2): the packet moves at v and spreads.
import { HBAR2_OVER_2M_EV_A2, PLANCK_EV_S } from './constants';
import { erf } from './tightbinding2d';

/** Reduced Planck constant in eV fs. */
export const HBAR_EV_FS = (PLANCK_EV_S / (2 * Math.PI)) * 1e15;
/** hbar / (2 m) in Angstrom^2 per fs: the spreading rate of a free packet. */
export const HBAR_OVER_2M_A2_FS = HBAR2_OVER_2M_EV_A2 / HBAR_EV_FS;

export interface Packet {
  /** Central wave number in 1/Angstrom (sign gives the direction). */
  k0: number;
  /** Initial width (standard deviation of the density) in Angstrom. */
  sigma0: number;
  /** Initial centre in Angstrom (default 0). */
  x0?: number;
}

/** Wave number of a free electron with kinetic energy E (eV): k = sqrt(E / (hbar^2/2m)), in 1/Angstrom. */
export const kFromEnergy = (energyEV: number): number =>
  Math.sqrt(Math.max(0, energyEV) / HBAR2_OVER_2M_EV_A2);
/** Kinetic energy hbar^2 k^2 / 2m in eV. */
export const energyFromK = (k: number): number => HBAR2_OVER_2M_EV_A2 * k * k;
/** de Broglie wavelength 2 pi / k in Angstrom. */
export const deBroglie = (k: number): number => (2 * Math.PI) / Math.abs(k);
/** Group velocity hbar k / m in Angstrom per fs. */
export const groupVelocity = (k: number): number => 2 * HBAR_OVER_2M_A2_FS * k;
/** Spreading time tau = 2 m s0^2 / hbar in fs: the width has grown by sqrt(2) at t = tau. */
export const spreadTime = (sigma0: number): number => (sigma0 * sigma0) / HBAR_OVER_2M_A2_FS;

/** Width s(t) = s0 sqrt(1 + (t/tau)^2) of the density in Angstrom. */
export function packetWidth(p: Packet, t: number): number {
  const r = t / spreadTime(p.sigma0);
  return p.sigma0 * Math.sqrt(1 + r * r);
}

/** Centre of the density at time t: x0 + v t. */
export const packetCentre = (p: Packet, t: number): number => (p.x0 ?? 0) + groupVelocity(p.k0) * t;

/** psi(x, t) as [real, imaginary], in Angstrom^(-1/2). */
export function packetPsi(p: Packet, x: number, t: number): [number, number] {
  const x0 = p.x0 ?? 0;
  const s2 = p.sigma0 * p.sigma0;
  const r = t / spreadTime(p.sigma0);
  const v = groupVelocity(p.k0);
  const u = x - x0 - v * t;
  const d = 1 + r * r;
  const q = (u * u) / (4 * s2);
  const re = -q / d;
  const im = (q * r) / d + p.k0 * (x - x0 - (v * t) / 2) - 0.5 * Math.atan(r);
  const amp = (2 * Math.PI * s2) ** -0.25 * d ** -0.25 * Math.exp(re);
  return [amp * Math.cos(im), amp * Math.sin(im)];
}

/** Probability density |psi(x, t)|^2 in 1/Angstrom, in closed form: a Gaussian of width s(t) centred at x0 + v t. */
export function packetDensity(p: Packet, x: number, t: number): number {
  const s = packetWidth(p, t);
  const u = x - packetCentre(p, t);
  return Math.exp(-(u * u) / (2 * s * s)) / (Math.sqrt(2 * Math.PI) * s);
}

/** Probability of finding the particle between a and b at time t (exact, through the error function, S-053). */
export function probabilityBetween(p: Packet, t: number, a: number, b: number): number {
  const s = packetWidth(p, t) * Math.SQRT2;
  const c = packetCentre(p, t);
  return 0.5 * (erf((b - c) / s) - erf((a - c) / s));
}
