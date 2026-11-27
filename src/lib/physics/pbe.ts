// Semilocal exchange-correlation in closed form for the spin-unpolarised electron gas: the LDA correlation of Perdew and
// Wang (PW92) and the PBE and PBEsol gradient corrections, written as the enhancement factor F_xc(r_s, s) over the
// exchange energy per electron of the uniform gas. Pure. Hartree atomic units inside; F_xc is dimensionless.
// @source S-146 (Perdew-Wang 1992: eps_c(r_s) = -2A (1 + alpha1 r_s) ln[1 + 1 / (2A (beta1 r_s^1/2 + beta2 r_s + beta3 r_s^3/2 + beta4 r_s^2))],
//   zeta = 0 parameters A = 0.031091, alpha1 = 0.21370, beta1..4 = 7.5957, 3.5876, 1.6382, 0.49294)
// @source S-013 (PBE 1996: F_x(s) = 1 + kappa - kappa / (1 + mu s^2 / kappa), kappa = 0.804, mu = beta pi^2 / 3;
//   H = gamma ln[1 + (beta / gamma) t^2 (1 + A t^2) / (1 + A t^2 + A^2 t^4)], A = (beta / gamma) / (exp(-eps_c / gamma) - 1),
//   beta = 0.066725, gamma = (1 - ln 2) / pi^2, t = |grad n| / (2 k_s n), k_s = sqrt(4 k_F / pi))
// @source S-147 (PBEsol 2008: the same forms with mu = 10/81 and beta = 0.046)
// Definitions: r_s = (3 / (4 pi n))^(1/3), k_F = (3 pi^2 n)^(1/3) = (9 pi / 4)^(1/3) / r_s, s = |grad n| / (2 k_F n),
// so t^2 = s^2 pi k_F / 4. eps_x^unif = -3 k_F / (4 pi). F_xc = (eps_x^unif F_x + eps_c + H) / eps_x^unif.

export const PW92 = { A: 0.031091, alpha1: 0.2137, beta: [7.5957, 3.5876, 1.6382, 0.49294] } as const;

/** PBE gradient-expansion coefficient of correlation. */
export const BETA_PBE = 0.06672455060314922;
/** gamma = (1 - ln 2) / pi^2. */
export const GAMMA_PBE = (1 - Math.LN2) / (Math.PI * Math.PI);
/** PBE exchange: kappa and mu = beta pi^2 / 3. */
export const KAPPA = 0.804;
export const MU_PBE = (BETA_PBE * Math.PI * Math.PI) / 3;
/** PBEsol restores the gradient expansion of exchange: mu = 10/81, and refits beta. */
export const MU_PBESOL = 10 / 81;
export const BETA_PBESOL = 0.046;

export const XC_FORMS = [
  { id: 'lda', label: 'LDA (density only)' },
  { id: 'pbe-x', label: 'PBE exchange only' },
  { id: 'pbe', label: 'PBE exchange and correlation' },
  { id: 'pbesol', label: 'PBEsol exchange and correlation' },
] as const;
export type XcForm = (typeof XC_FORMS)[number]['id'];

/** k_F in 1/bohr for a Wigner-Seitz radius r_s in bohr. */
export const fermiWavevector = (rs: number): number => Math.cbrt((9 * Math.PI) / 4) / rs;

/** Electron density in 1/bohr^3 from r_s. */
export const densityFromRs = (rs: number): number => 3 / (4 * Math.PI * rs ** 3);

/** Exchange energy per electron of the uniform gas, in hartree. */
export const exchangeUniform = (rs: number): number => (-3 * fermiWavevector(rs)) / (4 * Math.PI);

/** PW92 correlation energy per electron of the unpolarised uniform gas, in hartree. */
export function correlationPW92(rs: number): number {
  if (!(rs > 0)) throw new RangeError('r_s must be positive');
  const { A, alpha1, beta } = PW92;
  const sq = Math.sqrt(rs);
  const den = 2 * A * (beta[0] * sq + beta[1] * rs + beta[2] * rs * sq + beta[3] * rs * rs);
  return -2 * A * (1 + alpha1 * rs) * Math.log1p(1 / den);
}

/** Exchange enhancement factor F_x(s) of the PBE form, with mu chosen by the functional. */
export const exchangeEnhancement = (s: number, mu = MU_PBE, kappa = KAPPA): number =>
  1 + kappa - kappa / (1 + (mu * s * s) / kappa);

/** t^2 from r_s and s (spin unpolarised, phi = 1). */
export const tSquared = (rs: number, s: number): number => (s * s * Math.PI * fermiWavevector(rs)) / 4;

/** PBE gradient correction H(r_s, t) to the correlation energy per electron, in hartree (zero for t = 0). */
export function correlationGradient(rs: number, s: number, beta = BETA_PBE): number {
  const g = GAMMA_PBE;
  const ec = correlationPW92(rs);
  const t2 = tSquared(rs, s);
  const A = beta / g / Math.expm1(-ec / g);
  const At2 = A * t2;
  return g * Math.log1p(((beta / g) * t2 * (1 + At2)) / (1 + At2 + At2 * At2));
}

/** The exchange and correlation pieces at (r_s, s), in hartree per electron, for one of the forms. */
export function xcParts(form: XcForm, rs: number, s: number): { ex: number; ec: number; fx: number } {
  const ex0 = exchangeUniform(rs);
  const ec0 = correlationPW92(rs);
  switch (form) {
    case 'lda':
      return { ex: ex0, ec: ec0, fx: 1 };
    case 'pbe-x': {
      const fx = exchangeEnhancement(s, MU_PBE);
      return { ex: ex0 * fx, ec: 0, fx };
    }
    case 'pbe': {
      const fx = exchangeEnhancement(s, MU_PBE);
      return { ex: ex0 * fx, ec: ec0 + correlationGradient(rs, s, BETA_PBE), fx };
    }
    case 'pbesol': {
      const fx = exchangeEnhancement(s, MU_PBESOL);
      return { ex: ex0 * fx, ec: ec0 + correlationGradient(rs, s, BETA_PBESOL), fx };
    }
  }
}

/** Enhancement factor F_xc = eps_xc / eps_x^unif (dimensionless). PBE exchange only gives F_x. */
export function enhancement(form: XcForm, rs: number, s: number): number {
  const p = xcParts(form, rs, s);
  return (p.ex + p.ec) / exchangeUniform(rs);
}
