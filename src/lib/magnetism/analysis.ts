// Ground-state analysis of magnetic configurations (M13.3): energies per magnetic ion relative to FM, ranking,
// a heuristic "pattern kept" check on the final per-site moments, and a total-moment consistency check.
// Every number comes from the user's files or typed values; the thresholds are heuristics (D-085).
// @source S-065 (LORBIT = 11 writes per-site moments; MAGMOM only seeds them), S-034 (OUTCAR table layout)

export interface EnergyInput {
  label: string;
  /** Total energy of the cell that was run, eV (OSZICAR F or E0, OUTCAR TOTEN, or typed). */
  energy: number;
  /** Magnetic sites in that cell. */
  nMagnetic: number;
  /** Where the number came from, for example "OSZICAR (FM), last F". */
  source: string;
}

export interface RankedEnergy extends EnergyInput {
  /** eV per magnetic ion. */
  perIon: number;
  /** eV per magnetic ion, relative to the reference (FM when present). */
  relative: number;
  /** 1 = lowest energy. */
  rank: number;
}

export interface Ranking {
  reference: string;
  referenceIsFm: boolean;
  rows: RankedEnergy[];
  warnings: string[];
}

/** Energies per magnetic ion relative to FM (or to the lowest when no FM is given), sorted lowest first. */
export function rankEnergies(inputs: readonly EnergyInput[], reference = 'FM'): Ranking {
  const warnings: string[] = [];
  const ok = inputs.filter((x) => Number.isFinite(x.energy) && x.nMagnetic > 0);
  if (ok.length < inputs.length)
    warnings.push('Configurations without a finite energy or magnetic sites were left out.');
  const per = ok.map((x) => ({ ...x, perIon: x.energy / x.nMagnetic }));
  const ref = per.find((x) => x.label === reference);
  if (!ref && per.length)
    warnings.push(`No ${reference} energy was given, so energies are relative to the lowest one.`);
  const e0 = ref ? ref.perIon : Math.min(...per.map((x) => x.perIon));
  const rows = per
    .map((x) => ({ ...x, relative: x.perIon - e0, rank: 0 }))
    .sort((a, b) => a.perIon - b.perIon)
    .map((x, i) => ({ ...x, rank: i + 1 }));
  if (rows.length > 1 && Math.abs(rows[1]!.perIon - rows[0]!.perIon) < 1e-3)
    warnings.push(
      'The two lowest configurations are within 1 meV per magnetic ion: the order may not survive tighter settings.',
    );
  return {
    reference: ref ? reference : (rows[0]?.label ?? reference),
    referenceIsFm: Boolean(ref),
    rows,
    warnings,
  };
}

export interface PatternOptions {
  /** A final moment below this size counts as zero, mu_B. Default 0.1. */
  tol?: number;
  /** A final moment smaller than this fraction of the intended starting size counts as collapsed. Default 0.5. */
  fraction?: number;
}

export type SiteVerdict = 'kept' | 'flipped' | 'collapsed' | 'shrunk' | 'appeared' | 'not-checked';

export interface SitePattern {
  /** 1-based ion number, POSCAR order. */
  ion: number;
  intended: number;
  final: number;
  verdict: SiteVerdict;
}

export interface PatternResult {
  heuristic: true;
  kept: boolean;
  sites: SitePattern[];
  /** The rule in words, shown with the result. */
  rule: string;
  warnings: string[];
}

/**
 * Heuristic: did the calculation keep its intended collinear pattern? A site with a starting moment keeps it when the
 * final moment has the same sign and at least `fraction` of the starting size. A site that started at zero is flagged
 * when it ends with a moment above both `tol` and `fraction` of the largest starting size.
 * Both arrays are in POSCAR order (MAGMOM order, which is also the OUTCAR ion order).
 */
export function patternKept(
  intended: readonly number[],
  finalMoments: readonly number[],
  opts: PatternOptions = {},
): PatternResult {
  const tol = opts.tol ?? 0.1;
  const fraction = opts.fraction ?? 0.5;
  const rule = `Heuristic: same sign as MAGMOM and at least ${fraction * 100}% of its size; |m| < ${tol} mu_B counts as zero.`;
  if (intended.length !== finalMoments.length)
    return {
      heuristic: true,
      kept: false,
      sites: [],
      rule,
      warnings: [
        `MAGMOM has ${intended.length} values but the file has ${finalMoments.length} sites: the files do not belong to this configuration.`,
      ],
    };
  const big = Math.max(0, ...intended.map(Math.abs));
  const sites = intended.map((m0, i): SitePattern => {
    const m = finalMoments[i]!;
    let verdict: SiteVerdict;
    if (m0 === 0) verdict = Math.abs(m) >= Math.max(tol, fraction * big) ? 'appeared' : 'not-checked';
    else if (Math.abs(m) < tol) verdict = 'collapsed';
    else if (Math.sign(m) !== Math.sign(m0)) verdict = 'flipped';
    else if (Math.abs(m) < fraction * Math.abs(m0)) verdict = 'shrunk';
    else verdict = 'kept';
    return { ion: i + 1, intended: m0, final: m, verdict };
  });
  return {
    heuristic: true,
    kept: sites.every((s) => s.verdict === 'kept' || s.verdict === 'not-checked'),
    sites,
    rule,
    warnings: [],
  };
}

export interface MomentCheck {
  heuristic: true;
  siteSum: number;
  mag: number;
  difference: number;
  consistent: boolean;
  note: string;
}

/**
 * Compare the sum of the per-site "tot" moments with the cell moment (OSZICAR mag, or the OUTCAR electron-count line).
 * They differ by the interstitial moment outside the projection spheres, so only a large gap is flagged.
 */
export function totalMomentCheck(siteTot: readonly number[], mag: number, tol = 0.5): MomentCheck {
  const siteSum = siteTot.reduce((a, b) => a + b, 0);
  const difference = mag - siteSum;
  return {
    heuristic: true,
    siteSum,
    mag,
    difference,
    consistent: Math.abs(difference) <= tol,
    note: `Heuristic: the site moments are integrated inside spheres and miss the interstitial part, so a gap up to ${tol} mu_B per cell is accepted.`,
  };
}
