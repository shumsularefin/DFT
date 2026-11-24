// Transparent Green/Yellow/Red feasibility engine and compute-time bucket estimator for Screening Studio (M9.3).
// @source S-019 (PAW table Q-010), S-042 (Field Handbook PBE caveats and workflows)
import elementsData from '../../data/elements.json';
import { parseIncar, type IncarEntry } from '../vasp/incar';
import type { MaterialRow } from './query';

export type Verdict = 'green' | 'yellow' | 'red';
export type RuntimeBucket = 'minutes' | 'hours' | 'days' | 'weeks';

export interface FeasibilityRuleResult {
  readonly id: string;
  readonly label: string;
  readonly verdict: Verdict | 'unknown';
  readonly reason: string;
  readonly heuristic: true;
  readonly source: string;
}

export interface ComputeEstimate {
  readonly bucket: RuntimeBucket;
  readonly cores: number;
  readonly estimatedCoreHours: number;
  readonly formula: string;
  readonly heuristic: true;
}

export interface FeasibilityReport {
  readonly overall: Verdict;
  readonly rules: readonly FeasibilityRuleResult[];
  readonly estimate: ComputeEstimate;
}

const SYMBOL_TO_Z = new Map<string, number>(
  (elementsData.elements as { symbol: string; Z: number }[]).map((e) => [e.symbol, e.Z]),
);

const F_BLOCK_SYMBOLS = new Set([
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
  'Ac',
  'Th',
  'Pa',
  'U',
  'Np',
  'Pu',
  'Am',
  'Cm',
  'Bk',
  'Cf',
  'Es',
  'Fm',
  'Md',
  'No',
  'Lr',
]);

const RANK: Record<Verdict, number> = { green: 0, yellow: 1, red: 2 };
const worst = (a: Verdict, b: Verdict): Verdict => (RANK[b] > RANK[a] ? b : a);

export function estimateComputeBucket(mat: MaterialRow, cores = 16): ComputeEstimate {
  const safeCores = Math.max(1, Math.round(cores));
  // Heuristic scaling: ~ O(N_atoms^2.5) * spinFactor * metalFactor / cores
  const spinFactor = mat.is_magnetic ? 2.0 : 1.0;
  const metalFactor = mat.is_metal ? 1.5 : 1.0;
  const baseCoreHours = 0.02 * Math.pow(Math.max(1, mat.nsites), 2.5) * spinFactor * metalFactor * 5;
  const wallHours = baseCoreHours / safeCores;
  const bucket: RuntimeBucket =
    wallHours < 1 ? 'minutes' : wallHours < 24 ? 'hours' : wallHours < 168 ? 'days' : 'weeks';
  return {
    bucket,
    cores: safeCores,
    estimatedCoreHours: baseCoreHours,
    formula:
      'coreHours ~ 0.02 * nsites^2.5 * spinFactor * metalFactor * 5_steps; wallHours = coreHours / cores',
    heuristic: true,
  };
}

export function evaluateFeasibility(
  mat: MaterialRow,
  options: { cores?: number; recommendedPawTable?: ReadonlySet<string> | null } = {},
): FeasibilityReport {
  const rules: FeasibilityRuleResult[] = [];
  let overall: Verdict = 'green';

  // 1. Cell size
  const sizeVerdict: Verdict = mat.nsites <= 10 ? 'green' : mat.nsites <= 30 ? 'yellow' : 'red';
  overall = worst(overall, sizeVerdict);
  rules.push({
    id: 'F-SIZE',
    label: 'Primitive cell size',
    verdict: sizeVerdict,
    reason:
      sizeVerdict === 'green'
        ? `${mat.nsites} atoms in the cell (<= 10): fast for a first VASP project.`
        : sizeVerdict === 'yellow'
          ? `${mat.nsites} atoms in the cell (11 to 30): moderate cost; converge carefully.`
          : `${mat.nsites} atoms in the cell (> 30): steep O(N^3) plane-wave cost for a starter run.`,
    heuristic: true,
    source: 'S-042',
  });

  // 2. f-electron elements
  const fEls = mat.elements.filter((el) => F_BLOCK_SYMBOLS.has(el));
  const fVerdict: Verdict = fEls.length > 0 ? 'yellow' : 'green';
  overall = worst(overall, fVerdict);
  rules.push({
    id: 'F-FBLOCK',
    label: 'f-electron elements',
    verdict: fVerdict,
    reason:
      fEls.length > 0
        ? `Contains ${fEls.join(', ')}: may need DFT+U, careful spin seeding, and longer SCF (module 5).`
        : 'No lanthanide (Ce to Lu) or actinide f-electron elements.',
    heuristic: true,
    source: 'S-042',
  });

  // 3. Magnetism
  const magVerdict: Verdict =
    mat.is_magnetic || mat.ordering === 'AFM' || mat.ordering === 'FiM' ? 'yellow' : 'green';
  overall = worst(overall, magVerdict);
  rules.push({
    id: 'F-MAG',
    label: 'Magnetism and ordering',
    verdict: magVerdict,
    reason:
      mat.ordering === 'AFM' || mat.ordering === 'FiM'
        ? `Magnetic (${mat.ordering}): requires ISPIN = 2 and a commensurate supercell/MAGMOM pattern (module 5).`
        : mat.is_magnetic
          ? 'Spin-polarized (ISPIN = 2): roughly doubles memory and runtime; verify final moments.'
          : 'Non-magnetic in the dataset.',
    heuristic: true,
    source: 'S-042',
  });

  // 4. Metallicity
  const metalVerdict: Verdict = mat.is_metal ? 'yellow' : 'green';
  overall = worst(overall, metalVerdict);
  rules.push({
    id: 'F-METAL',
    label: 'Electronic character',
    verdict: metalVerdict,
    reason: mat.is_metal
      ? 'Metallic: needs a denser k-point mesh and Methfessel-Paxton smearing checks.'
      : 'Non-metallic (gap > 0 at PBE level): Gaussian or tetrahedron smearing works cleanly.',
    heuristic: true,
    source: 'S-042',
  });

  // 5. Heavy elements (Z > 54)
  const heavy = mat.elements.filter((el) => (SYMBOL_TO_Z.get(el) ?? 0) > 54);
  const heavyVerdict: Verdict = heavy.length > 0 ? 'yellow' : 'green';
  overall = worst(overall, heavyVerdict);
  rules.push({
    id: 'F-HEAVY',
    label: 'Heavy elements (Z > 54)',
    verdict: heavyVerdict,
    reason:
      heavy.length > 0
        ? `Contains heavy element(s) ${heavy.join(', ')} (Z > 54): spin-orbit coupling (LSORBIT) may matter.`
        : 'All elements have Z <= 54.',
    heuristic: true,
    source: 'S-042',
  });

  // 6. PAW potential table (Q-010)
  if (!options.recommendedPawTable) {
    rules.push({
      id: 'F-PAW',
      label: 'Recommended PAW potential',
      verdict: 'unknown',
      reason: 'unknown, check your POTCAR library (recommended PAW table not bundled, Q-010).',
      heuristic: true,
      source: 'S-019',
    });
  } else {
    const missing = mat.elements.filter((el) => !options.recommendedPawTable!.has(el));
    const pawVerdict: Verdict = missing.length > 0 ? 'red' : 'green';
    overall = worst(overall, pawVerdict);
    rules.push({
      id: 'F-PAW',
      label: 'Recommended PAW potential',
      verdict: pawVerdict,
      reason:
        missing.length > 0
          ? `No recommended PAW listed for ${missing.join(', ')}.`
          : 'All elements have a recommended PAW potential in the supplied table.',
      heuristic: true,
      source: 'S-019',
    });
  }

  return {
    overall,
    rules,
    estimate: estimateComputeBucket(mat, options.cores ?? 16),
  };
}

export interface StarterStep {
  readonly id: string;
  readonly title: string;
  readonly incarText: string;
  readonly incarEntries: readonly IncarEntry[];
  readonly note: string;
}

/** Generate validator-clean starter INCAR steps for a material following the author's protocol (S-042). */
export function buildStarterProjectSteps(mat: MaterialRow, encutEv = 520): StarterStep[] {
  const spinLines = mat.is_magnetic ? ['ISPIN = 2', 'LORBIT = 11'] : ['ISPIN = 1'];
  const ismear = mat.is_metal ? 'ISMEAR = 1' : 'ISMEAR = 0';
  const sigma = mat.is_metal ? 'SIGMA = 0.2' : 'SIGMA = 0.05';

  const make = (id: string, title: string, lines: string[], note: string): StarterStep => {
    const incarText = lines.join('\n') + '\n';
    return { id, title, incarText, incarEntries: parseIncar(incarText).entries, note };
  };

  return [
    make(
      'relax',
      '1. Full structural relaxation (ISIF = 3)',
      [
        `SYSTEM = ${mat.formula_pretty} relax`,
        `ENCUT = ${encutEv}`,
        'PREC = Accurate',
        'EDIFF = 1E-6',
        'EDIFFG = -0.02',
        'IBRION = 2',
        'ISIF = 3',
        'NSW = 60',
        ismear,
        sigma,
        'KSPACING = 0.25',
        ...spinLines,
      ],
      'Check ENCUT >= 1.3 * max(ENMAX) from your POTCAR before running ISIF = 3.',
    ),
    make(
      'scf',
      '2. Static SCF and DOS on CONTCAR',
      [
        `SYSTEM = ${mat.formula_pretty} scf`,
        `ENCUT = ${encutEv}`,
        'PREC = Accurate',
        'EDIFF = 1E-6',
        'IBRION = -1',
        'NSW = 0',
        ismear,
        sigma,
        'KSPACING = 0.20',
        'LCHARG = .TRUE.',
        'LORBIT = 11',
        ...spinLines.filter((l) => !l.startsWith('LORBIT')),
      ],
      'Copy CONTCAR from step 1 to POSCAR. Keep CHGCAR for step 3.',
    ),
    make(
      'bands',
      '3. Non-self-consistent band structure (ICHARG = 11)',
      [
        `SYSTEM = ${mat.formula_pretty} bands`,
        `ENCUT = ${encutEv}`,
        'PREC = Accurate',
        'EDIFF = 1E-6',
        'IBRION = -1',
        'NSW = 0',
        'ICHARG = 11',
        'ISMEAR = 0',
        'SIGMA = 0.05',
        'LWAVE = .FALSE.',
        'LCHARG = .FALSE.',
        'LORBIT = 11',
        ...spinLines.filter((l) => !l.startsWith('LORBIT')),
      ],
      'Use a line-mode KPOINTS file from /tools/kpath/ and copy CHGCAR from step 2.',
    ),
  ];
}
