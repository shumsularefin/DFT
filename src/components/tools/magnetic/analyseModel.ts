// Analyse tab model (M13.3): read the user's OSZICAR or OUTCAR per configuration, then rank, check patterns and fit.
// Pure; every number carries the file and line it came from.
import {
  patternKept,
  rankEnergies,
  totalMomentCheck,
  type EnergyInput,
  type MomentCheck,
  type PatternResult,
  type Ranking,
} from '../../../lib/magnetism/analysis';
import {
  fitExchange,
  meanFieldCurie,
  sameShells,
  shellCoefficients,
  type FitResult,
  type HeisenbergConvention,
  type MeanFieldCurie,
} from '../../../lib/magnetism/heisenberg';
import type { ConfigOutput } from '../../../lib/magnetism/export';
import { parseOszicar } from '../../../lib/vasp/oszicar';
import { parseOutcar } from '../../../lib/vasp/outcar';

export type EnergyKind = 'F' | 'E0';

export interface Sourced {
  value: number;
  source: string;
}

export interface RunRead {
  name: string;
  kind: 'OSZICAR' | 'OUTCAR' | 'unknown';
  energy: { F?: Sourced; E0?: Sourced };
  mag?: Sourced;
  /** Final per-site "tot" moments, OUTCAR ion order. */
  sites?: number[];
  sitesSource?: string;
  warnings: string[];
}

/** Read one dropped file: OUTCAR when it looks like one, otherwise OSZICAR. */
export function readRunFile(name: string, text: string): RunRead {
  const looksOutcar = /magnetization \(x\)|free\s+energy\s+TOTEN|vasp\.\d/.test(text);
  if (looksOutcar) {
    const o = parseOutcar(text);
    const last = [...o.ionic]
      .reverse()
      .find((s) => s.freeEnergyTOTEN !== undefined || s.energySigma0 !== undefined);
    const r: RunRead = { name, kind: 'OUTCAR', energy: {}, warnings: [] };
    if (last?.freeEnergyTOTEN !== undefined)
      r.energy.F = { value: last.freeEnergyTOTEN, source: `${name}, line ${last.line}, TOTEN` };
    const s0 = [...o.ionic].reverse().find((s) => s.energySigma0 !== undefined);
    if (s0?.energySigma0 !== undefined)
      r.energy.E0 = { value: s0.energySigma0, source: `${name}, energy(sigma->0) of the last block` };
    if (o.magnetization)
      r.mag = { value: o.magnetization.value, source: `${name}, line ${o.magnetization.line}` };
    if (o.siteMagnetization) {
      r.sites = o.siteMagnetization.sites.map((s) => s.tot);
      r.sitesSource = `${name}, magnetization (x) table at line ${o.siteMagnetization.line}`;
    } else r.warnings.push(`${name}: no per-site magnetization table (set LORBIT = 11 to get one).`);
    if (!o.reachedRequiredAccuracy && o.ionic.length > 1)
      r.warnings.push(`${name}: no "reached required accuracy" line; the relaxation may not have finished.`);
    return r;
  }
  const z = parseOszicar(text);
  const last = z.ionic.at(-1);
  if (!last) return { name, kind: 'unknown', energy: {}, warnings: [`${name}: not an OSZICAR or OUTCAR.`] };
  return {
    name,
    kind: 'OSZICAR',
    energy: {
      F: { value: last.f, source: `${name}, line ${last.line}, F` },
      E0: { value: last.e0, source: `${name}, line ${last.line}, E0` },
    },
    ...(last.mag !== undefined
      ? { mag: { value: last.mag, source: `${name}, line ${last.line}, mag` } }
      : {}),
    warnings: z.warnings.map((w) => `${name}: ${w}`),
  };
}

export interface RunState {
  reads: RunRead[];
  /** Typed energy, eV per cell; overrides the files when not empty. */
  typed: string;
}

export interface RunAnalysis {
  label: string;
  folder: string;
  energy?: Sourced;
  pattern?: PatternResult;
  moment?: MomentCheck;
  momentSource?: string;
  sitesSource?: string;
  species: readonly string[];
  warnings: string[];
}

export function analyseRun(out: ConfigOutput, st: RunState | undefined, kind: EnergyKind): RunAnalysis {
  const reads = st?.reads ?? [];
  const warnings = reads.flatMap((r) => r.warnings);
  let energy: Sourced | undefined;
  const typed = st?.typed.trim() ?? '';
  if (typed !== '') {
    const v = Number(typed);
    if (Number.isFinite(v)) energy = { value: v, source: 'typed by you' };
    else warnings.push(`"${typed}" is not a number.`);
  } else energy = reads.map((r) => r.energy[kind]).find(Boolean);
  const withSites = reads.find((r) => r.sites);
  const withMag = reads.find((r) => r.mag);
  const res: RunAnalysis = {
    label: out.config.label,
    folder: out.folder,
    species: out.result.structure.species,
    warnings,
  };
  if (energy) res.energy = energy;
  if (withSites?.sites) {
    res.pattern = patternKept(out.result.values, withSites.sites);
    res.sitesSource = withSites.sitesSource!;
    if (withMag?.mag) {
      res.moment = totalMomentCheck(withSites.sites, withMag.mag.value);
      res.momentSource = withMag.mag.source;
    }
  }
  return res;
}

export interface AnalyseResult {
  runs: RunAnalysis[];
  ranking: Ranking;
  fit?: FitResult;
  shells?: number[];
  fitWarnings: string[];
  /** Classical mean-field T_C (Heuristic), only when FM is the lowest configuration and the fit is ferromagnetic. */
  curie?: MeanFieldCurie;
  /** Why no T_C is given, when a fit exists. */
  curieNote?: string;
}

/** Rank, and fit J for nShells shells when at least one energy is present. The ranking uses config labels. */
export function analyseAll(
  outs: readonly ConfigOutput[],
  states: Readonly<Record<string, RunState>>,
  kind: EnergyKind,
  nShells: number,
  conv: HeisenbergConvention,
): AnalyseResult {
  const runs = outs.map((o) => analyseRun(o, states[o.folder], kind));
  const inputs: EnergyInput[] = [];
  const pts = [];
  const fitWarnings: string[] = [];
  let shells: number[] | undefined;
  for (let i = 0; i < outs.length; i++) {
    const r = runs[i]!;
    if (!r.energy) continue;
    const o = outs[i]!;
    const n = o.config.magneticSites.length;
    inputs.push({ label: o.folder, energy: r.energy.value, nMagnetic: n, source: r.energy.source });
    const c = shellCoefficients(o.config, nShells, conv);
    if (!shells) shells = c.shells;
    else if (!sameShells(shells, c.shells))
      fitWarnings.push(`${o.folder}: its neighbour shells differ from the first configuration's.`);
    pts.push({ label: o.folder, energyPerIon: r.energy.value / n, coefficients: c.perIon });
  }
  const ranking = rankEnergies(inputs, 'FM');
  const out: AnalyseResult = { runs, ranking, fitWarnings };
  if (shells) out.shells = shells;
  if (pts.length && !fitWarnings.length) out.fit = fitExchange(pts, conv);
  if (out.fit?.j) {
    const fm = outs.find((o, i) => o.config.kind === 'FM' && runs[i]!.energy);
    if (!fm) out.curieNote = 'No T_C estimate: it needs an FM configuration with an energy.';
    else if (ranking.rows[0]?.label !== fm.folder)
      out.curieNote =
        'No T_C estimate: FM is not the lowest configuration, and the mean-field Curie formula applies to a ferromagnetic ground state only.';
    else {
      const tc = meanFieldCurie(out.fit, shellCoefficients(fm.config, nShells, conv).perIon);
      if (tc) out.curie = tc;
      else out.curieNote = 'No T_C estimate: in the fitted model FM is not below the paramagnetic energy E0.';
    }
  }
  return out;
}
