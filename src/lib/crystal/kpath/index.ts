// One entry point for both k-path conventions (D-048). HPKOT is the default (D-047); Setyawan-Curtarolo is the pymatgen / Materials Project one.
import { analyzeWith, type MoyoApi } from '../symmetry';
import type { Structure } from '../types';
import { hpkotPath, labelDisplay, type KPathResult } from './hpkot';
import { scLabelDisplay, setyawanPath, type SetyawanResult } from './setyawan';

export type KPathConvention = 'HPKOT' | 'Setyawan-Curtarolo';
export type KPathAny = KPathResult | SetyawanResult;

export function kpathFor(
  api: MoyoApi,
  s: Structure,
  opts: { convention?: 'HPKOT'; symprec?: number; withTimeReversal?: boolean },
): KPathResult;
export function kpathFor(
  api: MoyoApi,
  s: Structure,
  opts: { convention: 'Setyawan-Curtarolo'; symprec?: number },
): SetyawanResult;
export function kpathFor(
  api: MoyoApi,
  s: Structure,
  opts: { convention?: KPathConvention; symprec?: number; withTimeReversal?: boolean } = {},
): KPathAny {
  const sym = analyzeWith(api, s, { symprec: opts.symprec ?? 1e-4, setting: 'Spglib' });
  if (opts.convention === 'Setyawan-Curtarolo') return setyawanPath(sym);
  return hpkotPath(
    sym,
    opts.withTimeReversal === undefined ? {} : { withTimeReversal: opts.withTimeReversal },
  );
}

/** Display form of a point label in either convention. */
export function pointLabelDisplay(convention: KPathConvention, label: string): string {
  return convention === 'HPKOT' ? labelDisplay(label) : scLabelDisplay(label);
}

export { hpkotPath, setyawanPath };
