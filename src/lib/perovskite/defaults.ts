/**
 * Choosing sensible defaults when a user picks an element, and keeping a chosen occupant consistent with the
 * Shannon table. Defaults only pre-fill a visible choice; nothing is silently substituted in a result.
 */
import { oxidationInfo } from '../chem/oxidation';
import type { Composition } from './checks';
import type { Occupant } from './sites';
import { coordinations, geometries, oxidationStates, spins } from './shannon';
import type { Policy } from './urlState';

export type SiteKey = 'A' | 'B' | 'X';

export const DEFAULT_CN: Record<SiteKey, number> = { A: 12, B: 6, X: 6 };
const LN = new Set([
  'La',
  'Ce',
  'Pr',
  'Nd',
  'Pm',
  'Sm',
  'Eu',
  'Gd',
  'Tb',
  'Dy',
  'Ho',
  'Er',
  'Tm',
  'Yb',
  'Lu',
]);
export const isLanthanide = (el: string): boolean => LN.has(el);

/** States offered for a site: cations (positive) for A and B, anions (negative) for X. */
export const statesFor = (site: SiteKey, el: string): number[] =>
  oxidationStates(el).filter((o) => (site === 'X' ? o < 0 : o > 0));

/** Elements with at least one Shannon entry of the right sign for the site. */
export const hasStates = (site: SiteKey, el: string): boolean => statesFor(site, el).length > 0;

/** The most frequent state in the ICSD counts (D-058), else the first tabulated. */
export function defaultOxidation(site: SiteKey, el: string): number | undefined {
  const states = statesFor(site, el);
  return [...states].sort((a, b) => oxidationInfo(el, b).share - oxidationInfo(el, a).share)[0];
}

/** Make an occupant consistent: valid oxidation state, coordination, spin and geometry for the table. */
export function normalizeOccupant(site: SiteKey, o: Occupant, policy: Policy): Occupant {
  const states = statesFor(site, o.el);
  const ox = states.includes(o.ox) ? o.ox : (defaultOxidation(site, o.el) ?? o.ox);
  let cn = o.cn;
  if (site === 'A' && isLanthanide(o.el)) {
    cn = policy;
  } else {
    const cns = coordinations(o.el, ox);
    if (!cns.includes(cn)) cn = cns.includes(DEFAULT_CN[site]) ? DEFAULT_CN[site] : (cns[0] ?? cn);
  }
  const spin = o.spin && spins(o.el, ox, cn).includes(o.spin) ? o.spin : undefined;
  const geometry = o.geometry && geometries(o.el, ox, cn).includes(o.geometry) ? o.geometry : undefined;
  return {
    el: o.el,
    ox,
    cn,
    fraction: o.fraction,
    ...(spin ? { spin } : {}),
    ...(geometry ? { geometry } : {}),
  };
}

export function newOccupant(site: SiteKey, el: string, fraction: number, policy: Policy): Occupant {
  const ox = defaultOxidation(site, el) ?? (site === 'X' ? -1 : 1);
  return normalizeOccupant(site, { el, ox, cn: DEFAULT_CN[site], fraction }, policy);
}

/** Lanthanides at the A site take their coordination number from the visible policy (D-028). */
export function applyPolicy(c: Composition, policy: Policy): Composition {
  return { ...c, A: c.A.map((o) => (isLanthanide(o.el) ? { ...o, cn: policy } : o)) };
}

export const DEFAULT_COMPOSITION: Composition = {
  A: [{ el: 'Sr', ox: 2, cn: 12, fraction: 1 }],
  B: [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }],
  X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
};
