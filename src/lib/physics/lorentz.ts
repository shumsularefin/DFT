// Lorentz-oscillator dielectric function (M16.11), the textbook model of an optical absorption band (Fox chapter 2,
// S-082): eps(E) = eps_inf + sum_j f_j / (E0_j^2 - E^2 - i gamma_j E), energies in eV, f_j (eV^2) the oscillator
// strength (the square of the plasma energy of that oscillator), gamma_j the broadening (full width at half maximum
// of eps2 for a narrow band). Real and imaginary parts:
//   eps1 = eps_inf + sum f (E0^2 - E^2) / ((E0^2 - E^2)^2 + gamma^2 E^2),   eps2 = sum f gamma E / (same).
// It obeys the f-sum rule  integral_0^inf E eps2(E) dE = (pi / 2) sum_j f_j  for any gamma (tested).
// @source S-082
export interface Oscillator {
  /** Resonance energy E0, eV. */
  e0: number;
  /** Oscillator strength f = Ep^2, eV^2. */
  f: number;
  /** Broadening gamma, eV. */
  gamma: number;
}

/** [eps1, eps2] of a sum of Lorentz oscillators at photon energy e (eV). */
export function lorentzEps(e: number, oscillators: readonly Oscillator[], epsInf = 1): [number, number] {
  let e1 = epsInf;
  let e2 = 0;
  for (const o of oscillators) {
    const d = o.e0 * o.e0 - e * e;
    const den = d * d + o.gamma * o.gamma * e * e;
    e1 += (o.f * d) / den;
    e2 += (o.f * o.gamma * e) / den;
  }
  return [e1, e2];
}
