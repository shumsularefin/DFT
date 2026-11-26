// Quick-reference tables (M15.9).
// @source S-042 (Workflow Handbook: "Units, conversions and quick formulas", "Where to read it", "Pre-submit checklist")
// @source S-041 (Field Handbook: QUICK table "Where do I find ...")
// @source S-031 (CODATA, through units.ts and constants.ts): every number here is computed, none is typed.
import { BOLTZMANN_EV_K } from '../physics/constants';
import {
  CM1_TO_MEV,
  EV_PER_A3_TO_GPA,
  EV_PER_ATOM_TO_KJ_MOL,
  EV_PER_A_TO_NN,
  HARTREE_TO_EV,
  KBAR_TO_GPA,
  RY_TO_EV,
  THZ_TO_CM1,
  THZ_TO_MEV,
} from '../physics/units';

export interface UnitTarget {
  value: number;
  unit: string;
}
export interface UnitRow {
  from: string;
  to: UnitTarget[];
}

/** The S-042 units table, in its order. Values come from units.ts and constants.ts. */
export const UNIT_ROWS: readonly UnitRow[] = [
  { from: '1 kBar (OUTCAR stress, Cij)', to: [{ value: KBAR_TO_GPA, unit: 'GPa' }] },
  { from: '1 eV/Å³', to: [{ value: EV_PER_A3_TO_GPA, unit: 'GPa' }] },
  {
    from: '1 THz',
    to: [
      { value: THZ_TO_CM1, unit: 'cm⁻¹' },
      { value: THZ_TO_MEV, unit: 'meV' },
    ],
  },
  { from: '1 cm⁻¹', to: [{ value: CM1_TO_MEV, unit: 'meV' }] },
  { from: '1 Ry', to: [{ value: RY_TO_EV, unit: 'eV' }] },
  { from: '1 Hartree', to: [{ value: HARTREE_TO_EV, unit: 'eV' }] },
  { from: '1 eV/atom', to: [{ value: EV_PER_ATOM_TO_KJ_MOL, unit: 'kJ/mol per atom' }] },
  { from: '1 eV/Å', to: [{ value: EV_PER_A_TO_NN, unit: 'nN' }] },
  { from: 'Boltzmann constant kB', to: [{ value: BOLTZMANN_EV_K, unit: 'eV/K' }] },
];

/** Six significant figures, in plain or scientific notation. */
export function formatValue(v: number): string {
  if (v !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6)) {
    const [m, e] = v.toExponential(5).split('e');
    return `${Number(m)} × 10^${Number(e)}`;
  }
  return String(Number(v.toPrecision(6)));
}

/**
 * VASPKIT k-mesh resolution r (in units of 2π/Å) to the VASP KSPACING tag (1/Å, which includes 2π): KSPACING = 2π r (S-042).
 */
export function kspacingFromVaspkitResolution(r: number): number {
  if (!(r > 0) || !Number.isFinite(r)) throw new RangeError('resolution must be positive');
  return 2 * Math.PI * r;
}

/** Resolutions S-042 lists for VASPKIT 102 (low 0.06 to 0.04, medium 0.04 to 0.03, fine 0.02 to 0.01). */
export const VASPKIT_RESOLUTIONS = [0.06, 0.04, 0.03, 0.02, 0.01] as const;

export interface ReadRow {
  quantity: string;
  /** File and the line to grep for, as the handbooks print it. */
  where: string;
  /** Which handbook lists it. */
  sources: ('S-041' | 'S-042')[];
  /** The site's reader: function and result field. */
  parser?: { fn: string; field: string; file: string };
  /** A page on the site that uses that reader. */
  link?: { href: string; label: string };
}

const REVIEW = { href: '/tools/review/', label: 'Calculation review' };

/** The S-041 QUICK table (14 rows) merged with the S-042 "Where to read it" table (9 rows); 17 rows after merging. */
export const READ_ROWS: readonly ReadRow[] = [
  {
    quantity: 'Did the relaxation converge?',
    where: 'OUTCAR: "reached required accuracy"',
    sources: ['S-041'],
    parser: { fn: 'parseOutcar', field: 'reachedRequiredAccuracy', file: 'src/lib/vasp/outcar.ts' },
    link: REVIEW,
  },
  {
    quantity: 'Total energy',
    where: 'OSZICAR last line (F, E0); OUTCAR "TOTEN" and "energy  without entropy"',
    sources: ['S-041', 'S-042'],
    parser: { fn: 'parseOszicar', field: 'ionic', file: 'src/lib/vasp/oszicar.ts' },
    link: REVIEW,
  },
  {
    quantity: 'Fermi level',
    where: 'OUTCAR "E-fermi" of the SCF run; DOSCAR line 6',
    sources: ['S-041', 'S-042'],
    parser: { fn: 'parseOutcar', field: 'efermi', file: 'src/lib/vasp/outcar.ts' },
    link: { href: '/handbook/09-analysis/density-of-states/', label: 'DOSCAR viewer' },
  },
  {
    quantity: 'Band gap',
    where: 'EIGENVAL or vasprun.xml (VBM, CBM)',
    sources: ['S-041'],
    parser: { fn: 'computeBandGap', field: 'gapEv', file: 'src/lib/vasp/eigenval.ts' },
    link: { href: '/handbook/09-analysis/band-structures/', label: 'Band-structure viewer' },
  },
  {
    quantity: 'Forces on atoms',
    where: 'OUTCAR "TOTAL-FORCE" block',
    sources: ['S-041', 'S-042'],
    parser: { fn: 'parseOutcar', field: 'forces', file: 'src/lib/vasp/outcar.ts' },
    link: REVIEW,
  },
  {
    quantity: 'Stress and pressure',
    where: 'OUTCAR "in kB", "external pressure"',
    sources: ['S-041', 'S-042'],
    parser: { fn: 'parseOutcar', field: 'pressure', file: 'src/lib/vasp/outcar.ts' },
    link: REVIEW,
  },
  {
    quantity: 'Magnetic moments',
    where: 'OSZICAR "mag=" (total); OUTCAR "magnetization (x)" (per site)',
    sources: ['S-041', 'S-042'],
    parser: { fn: 'parseOutcar', field: 'siteMagnetization', file: 'src/lib/vasp/outcar.ts' },
    link: { href: '/tools/magnetic/', label: 'Magnetic configuration tool' },
  },
  {
    quantity: 'Volume',
    where: 'OUTCAR "volume of cell"',
    sources: ['S-042'],
    parser: { fn: 'parseOutcar', field: 'volume', file: 'src/lib/vasp/outcar.ts' },
    link: { href: '/tools/eos/', label: 'Equation-of-state fit' },
  },
  {
    quantity: 'Symmetry VASP found',
    where: 'OUTCAR space and point group; k-point count in IBZKPT',
    sources: ['S-041'],
  },
  {
    quantity: 'Relaxed structure',
    where: 'CONTCAR',
    sources: ['S-041'],
    parser: { fn: 'parsePoscar', field: 'structure', file: 'src/lib/crystal/poscar.ts' },
    link: REVIEW,
  },
  {
    quantity: 'Trajectory',
    where: 'XDATCAR',
    sources: ['S-041'],
    parser: { fn: 'parseXdatcar', field: 'frames', file: 'src/lib/vasp/xdatcar.ts' },
    link: { href: '/handbook/09-analysis/relaxations/', label: 'Relaxation trajectory viewer' },
  },
  {
    quantity: 'Charge density',
    where: 'CHGCAR (restart and analysis), CHG (viewing)',
    sources: ['S-041'],
    parser: { fn: 'parseChgcar', field: 'totalRaw', file: 'src/lib/vasp/chgcar.ts' },
    link: { href: '/handbook/09-analysis/charge-density/', label: 'Charge-density viewer' },
  },
  {
    quantity: 'Electrons and bands',
    where: 'EIGENVAL header; OUTCAR "NELECT", "NBANDS="',
    sources: ['S-041', 'S-042'],
    parser: { fn: 'parseEigenval', field: 'nelect', file: 'src/lib/vasp/eigenval.ts' },
    link: { href: '/handbook/09-analysis/band-structures/', label: 'Band-structure viewer' },
  },
  {
    quantity: 'Elastic tensor',
    where: 'OUTCAR "TOTAL ELASTIC MODULI"',
    sources: ['S-042'],
    parser: { fn: 'parseOutcar', field: 'elastic', file: 'src/lib/vasp/outcar.ts' },
    link: { href: '/handbook/12-properties/elastic-constants/', label: 'Elastic constants topic' },
  },
  {
    quantity: 'ε∞ and Born charges Z*',
    where: 'OUTCAR "MACROSCOPIC STATIC DIELECTRIC", "BORN EFFECTIVE CHARGES"',
    sources: ['S-042'],
    parser: { fn: 'parseOutcar', field: 'born', file: 'src/lib/vasp/outcar.ts' },
    link: { href: '/handbook/12-properties/dielectric-tensor/', label: 'Dielectric tensor topic' },
  },
  {
    quantity: 'Run time',
    where: 'OUTCAR "Elapsed time"',
    sources: ['S-041'],
    parser: { fn: 'parseOutcar', field: 'elapsedSec', file: 'src/lib/vasp/outcar.ts' },
    link: REVIEW,
  },
  {
    quantity: 'Why it crashed',
    where: 'Standard output first, then the OSZICAR and OUTCAR tails',
    sources: ['S-041'],
    link: { href: '/errors/', label: 'Error finder' },
  },
];

export interface CheckItem {
  text: string;
  /** Validator rule ids (src/lib/vasp/rules/) that check this line in the Input Builder. */
  rules?: string[];
}
export interface ChecklistRow {
  calculation: string;
  must: CheckItem[];
  mustNot: CheckItem[];
}

/** The S-042 pre-submit checklist, row for row (S-042 prints 11 rows). */
export const CHECKLIST: readonly ChecklistRow[] = [
  {
    calculation: 'Relax',
    must: [
      { text: 'ENCUT 1.3 × ENMAX', rules: ['V009'] },
      { text: 'ISIF = 3, IBRION = 2, NSW > 0', rules: ['V010'] },
      { text: 'EDIFFG = −0.005 or −0.001', rules: ['V014'] },
      { text: 'ISPIN, MAGMOM', rules: ['V001', 'V003'] },
    ],
    mustNot: [{ text: 'LREAL = Auto on tiny cells' }],
  },
  {
    calculation: 'SCF',
    must: [
      { text: 'Same folder, cp CONTCAR POSCAR, ISTART = 1, NSW = 0' },
      { text: 'LCHARG = .TRUE., LORBIT = 11, tight EDIFF' },
    ],
    mustNot: [
      { text: 'ICHARG = 11', rules: ['V025'] },
      { text: 'Leftover IBRION = 2 or ISIF from the relaxation' },
    ],
  },
  {
    calculation: 'DOS',
    must: [{ text: 'From the SCF: LORBIT = 11, NEDOS ≥ 2000; VASPKIT 111 or 113' }],
    mustNot: [{ text: 'Reading the gap off the DOS (use VASPKIT 911)' }],
  },
  {
    calculation: 'Bands',
    must: [
      { text: 'SCF without ICHARG = 11 on a uniform mesh' },
      { text: 'KPATH.in (303) through KPOINTS_OPT or a run reading that CHGCAR; ISMEAR = 0' },
    ],
    mustNot: [{ text: 'An SCF run directly on the line-mode KPATH', rules: ['V026'] }],
  },
  {
    calculation: 'Optics',
    must: [
      {
        text: 'LOPTICS, NBANDS about 3 × default (a multiple of the cores), CSHIFT, NEDOS, dense k',
        rules: ['V022'],
      },
    ],
    mustNot: [{ text: 'Default NBANDS; a coarse mesh', rules: ['V022'] }],
  },
  {
    calculation: 'Elastic',
    must: [
      { text: 'IBRION = 6, ISIF = 3', rules: ['V011'] },
      { text: 'ENCUT = 620, NFREE, POTIM = 0.015, EDIFF ≤ 1E-7, relaxed at the same ENCUT', rules: ['V009'] },
    ],
    mustNot: [{ text: 'NCORE (comment it out)', rules: ['V013'] }, { text: 'Residual stress' }],
  },
  {
    calculation: 'Phonon',
    must: [
      { text: 'EDIFF 1E-8, relax with EDIFFG −0.001', rules: ['V014'] },
      { text: 'Supercell ≥ 10 Å, ADDGRID' },
    ],
    mustNot: [
      { text: 'LREAL = Auto', rules: ['V024'] },
      { text: 'Leftover NSW or IBRION in displacement runs' },
    ],
  },
  {
    calculation: 'Dielectric / Z*',
    must: [{ text: 'LEPSILON, IBRION = 8, an insulator, dense k' }],
    mustNot: [
      { text: 'NCORE or NPAR', rules: ['V013'] },
      { text: 'A metallic state' },
      { text: 'A hybrid functional', rules: ['V021'] },
    ],
  },
  {
    calculation: 'Bader',
    must: [{ text: 'LAECHG, LCHARG, a fine FFT grid' }],
    mustNot: [{ text: 'Analysing CHGCAR without the AECCAR reference' }],
  },
  {
    calculation: 'DFT+U',
    must: [
      { text: 'LDAUL, LDAUU, LDAUJ per species in POSCAR order', rules: ['V016'] },
      { text: 'LMAXMIX = 4 or 6', rules: ['V018'] },
      { text: 'The same U everywhere' },
    ],
    mustNot: [{ text: 'Comparing energies across different U' }],
  },
  {
    calculation: 'Hybrid',
    must: [
      { text: 'PBE WAVECAR start' },
      { text: 'ALGO = Damped or All', rules: ['V028'] },
      { text: 'Zero-weight band path' },
    ],
    mustNot: [{ text: 'ICHARG = 11 band runs', rules: ['V025'] }],
  },
];
