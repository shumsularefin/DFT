// OUTCAR parser. Pure, tolerant: a missing optional item is simply absent, unknown formats produce warnings.
// @source S-019, S-041 (Field Handbook OUTCAR grep list), S-042, D-015, S-034 (pymatgen Outcar magnetization table)
// Line formats are from the documentation and hand-written fixtures; not yet validated on real output (Q-008).
import { KBAR_IN_GPA } from '../physics/constants';
import { NUM_SRC, toNum } from './num';

export interface Found<T> {
  value: T;
  /** 1-based line in the file. */
  line: number;
}

export interface IonicEnergy {
  line: number;
  freeEnergyTOTEN?: number;
  energyWithoutEntropy?: number;
  energySigma0?: number;
}

export interface ForcesBlock {
  line: number;
  forces: [number, number, number][];
  /** Largest force magnitude, eV/A. */
  maxForce: number;
  drift?: [number, number, number];
}

/** One row of the per-site "magnetization (x)" table (LORBIT = 10 or 11). Bohr magnetons. */
export interface SiteMagnetization {
  /** 1-based ion number as printed. */
  ion: number;
  /** Orbital columns in the order printed (s, p, d, and f when present). A missing column is simply absent. */
  values: Record<string, number>;
  /** The printed "tot" column, or the sum of the orbital columns when the file has no tot column. */
  tot: number;
}

export interface MagnetizationTable {
  /** Line of the "magnetization (x)" heading. */
  line: number;
  /** Orbital column names from the header, without "tot". */
  columns: string[];
  sites: SiteMagnetization[];
  /** The "tot" row at the foot of the table, by column (including "tot"), when printed. */
  total?: Record<string, number>;
}

/**
 * The last "TOTAL ELASTIC MODULI (kBar)" block of an IBRION = 6, ISIF >= 3 run (clamped-ion part plus the ionic
 * relaxation correction). @source S-042 (elastic chapter, "ordering trap"), S-034 (pymatgen Outcar.read_elastic_tensor
 * reads the same layout; the golden fixtures are read back by it).
 */
export interface ElasticModuli {
  /** Line of the "TOTAL ELASTIC MODULI" heading. */
  line: number;
  /** As printed: rows and columns in VASP order XX YY ZZ XY YZ ZX, kBar. */
  vaspOrderKbar: number[][];
  /** Reordered to Voigt 11 22 33 23 13 12 and converted to GPa. Not symmetrized. */
  voigtGPa: number[][];
  /** Largest |C_ij - C_ji| in GPa: VASP prints a nearly symmetric matrix; a large value means noise. */
  asymmetryGPa: number;
}

/** Voigt index (0-based) of each VASP position: XX YY ZZ XY YZ ZX = Voigt 1 2 3 6 4 5 (S-042). */
export const VASP_TO_VOIGT = [0, 1, 2, 5, 3, 4] as const;

/** Reorder a 6x6 matrix from VASP's XX YY ZZ XY YZ ZX order to Voigt order and scale it. */
export function vaspToVoigt(m: readonly (readonly number[])[], scale = 1): number[][] {
  const out = Array.from({ length: 6 }, () => new Array<number>(6).fill(0));
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) out[VASP_TO_VOIGT[i]!]![VASP_TO_VOIGT[j]!] = m[i]![j]! * scale;
  return out;
}

const ELASTIC_ROWS = ['XX', 'YY', 'ZZ', 'XY', 'YZ', 'ZX'];

/** Read one moduli block whose heading is line i. Undefined when the six rows are not all there. */
function readElastic(lines: string[], i: number): ElasticModuli | undefined {
  const head = lines[i + 1]?.trim().split(/\s+/) ?? [];
  if (head[0] !== 'Direction' || head.slice(1).join(' ') !== ELASTIC_ROWS.join(' ')) return undefined;
  const rows: number[][] = [];
  for (let j = i + 2; j < lines.length && rows.length < 6; j++) {
    const t = lines[j]!.trim();
    if (/^-+$/.test(t)) continue;
    const parts = t.split(/\s+/);
    if (parts[0] !== ELASTIC_ROWS[rows.length]) return undefined;
    const v = parts.slice(1).map(toNum);
    if (v.length !== 6 || !v.every(Number.isFinite)) return undefined;
    rows.push(v);
  }
  if (rows.length !== 6) return undefined;
  const voigtGPa = vaspToVoigt(rows, KBAR_IN_GPA);
  let asymmetryGPa = 0;
  for (let a = 0; a < 6; a++)
    for (let b = a + 1; b < 6; b++)
      asymmetryGPa = Math.max(asymmetryGPa, Math.abs(voigtGPa[a]![b]! - voigtGPa[b]![a]!));
  return { line: i + 1, vaspOrderKbar: rows, voigtGPa, asymmetryGPa };
}

/** A 3x3 tensor block such as MACROSCOPIC STATIC DIELECTRIC TENSOR; `line` is the 1-based heading line. */
export interface Tensor3Block {
  line: number;
  tensor: number[][];
}

/** BORN EFFECTIVE CHARGES: one 3x3 tensor per ion (rows: field direction, as VASP prints them), in e. */
export interface BornChargesBlock {
  line: number;
  charges: number[][][];
}

const NUM3 = /^\s*([-+0-9.Ee]+)\s+([-+0-9.Ee]+)\s+([-+0-9.Ee]+)\s*$/;

/** Three rows of three numbers after the heading at line i (dashed lines skipped). */
function readTensor3(lines: string[], i: number): Tensor3Block | undefined {
  const rows: number[][] = [];
  for (let j = i + 1; j < lines.length && rows.length < 3; j++) {
    const t = lines[j]!;
    if (/^\s*-+\s*$/.test(t)) continue;
    const m = NUM3.exec(t);
    if (!m) return undefined;
    const v = [m[1]!, m[2]!, m[3]!].map(toNum);
    if (!v.every(Number.isFinite)) return undefined;
    rows.push(v);
  }
  return rows.length === 3 ? { line: i + 1, tensor: rows } : undefined;
}

/** "ion N" followed by rows "1 x y z", "2 ...", "3 ..." until the closing dashed line. */
function readBorn(lines: string[], i: number): BornChargesBlock | undefined {
  const charges: number[][][] = [];
  let j = i + 1;
  if (/^\s*-+\s*$/.test(lines[j] ?? '')) j++;
  for (; j < lines.length; j++) {
    const t = lines[j]!;
    const ion = /^\s*ion\s+(\d+)\s*$/.exec(t);
    if (ion) {
      if (Number(ion[1]) !== charges.length + 1) return undefined;
      const z: number[][] = [];
      for (let r = 1; r <= 3; r++) {
        const m = /^\s*([1-3])\s+([-+0-9.Ee]+)\s+([-+0-9.Ee]+)\s+([-+0-9.Ee]+)\s*$/.exec(lines[j + r] ?? '');
        if (!m || Number(m[1]) !== r) return undefined;
        z.push([m[2]!, m[3]!, m[4]!].map(toNum));
      }
      charges.push(z);
      j += 3;
      continue;
    }
    if (/^\s*-+\s*$/.test(t)) break;
    return undefined;
  }
  return charges.length > 0 ? { line: i + 1, charges } : undefined;
}

/** One normal mode at Gamma from "Eigenvectors and eigenvalues of the dynamical matrix" (IBRION = 5 to 8). */
export interface PhononMode {
  index: number;
  /** True for an "f/i" line (imaginary frequency, a soft mode). */
  imaginary: boolean;
  /** The frequencies as printed (all positive; `imaginary` carries the sign). */
  thz: number;
  cm1: number;
  meV: number;
  line: number;
}

export interface PhononModesBlock {
  /** 1-based line of the "Eigenvectors and eigenvalues of the dynamical matrix" heading. */
  line: number;
  modes: PhononMode[];
}

// @source S-019 (VASP wiki "Phonons from finite differences", oldid 36045, gives the line layout):
//    1 f  =   14.329944 THz    90.037693 2PiTHz  477.995462 cm-1    59.263905 meV
// The wiki names 'f/i' for imaginary modes without printing such a line; ASE (read_vib_freq) treats 'f/i=' as
// one token, and this reader accepts any spacing around '='.
const MN = `(${NUM_SRC})`;
const MODE_LINE = new RegExp(
  String.raw`^\s*(\d+)\s+(f|f\/i)\s*=\s*${MN}\s+THz\s+${MN}\s+2PiTHz\s+${MN}\s+cm-1\s+${MN}\s+meV`,
);

/** Read the mode lines after a dynamical-matrix heading at line i, up to the next heading or 3 NIONS modes. */
function readModes(lines: string[], i: number, nions: number | undefined): PhononModesBlock | undefined {
  const modes: PhononMode[] = [];
  for (let j = i + 1; j < lines.length; j++) {
    const s = lines[j]!;
    if (/Eigenvectors/.test(s)) break;
    const m = MODE_LINE.exec(s);
    if (m) {
      modes.push({
        index: Number(m[1]),
        imaginary: m[2] === 'f/i',
        thz: toNum(m[3]!),
        cm1: toNum(m[5]!),
        meV: toNum(m[6]!),
        line: j + 1,
      });
      if (nions && modes.length === 3 * nions) break;
    }
  }
  return modes.length ? { line: i + 1, modes } : undefined;
}

export interface OutcarResult {
  /** VASP version string such as "6.3.2" when found. */
  version?: string;
  nions?: Found<number>;
  encut?: Found<number>;
  /** One per species, in POTCAR order. */
  enmax: Found<number>[];
  nkpts?: Found<number>;
  nbands?: Found<number>;
  /** One entry per ionic step that printed an energy block. */
  ionic: IonicEnergy[];
  pressure: { line: number; pressureKb: number; pulayKb: number }[];
  /** The last force block. */
  forces?: ForcesBlock;
  efermi?: Found<number>;
  reachedRequiredAccuracy: boolean;
  reachedRequiredAccuracyLine?: number;
  elapsedSec?: Found<number>;
  /** Last "magnetization" value in the electron count line. */
  magnetization?: Found<number>;
  /** The last per-site "magnetization (x)" table, which belongs to the final ionic step. */
  siteMagnetization?: MagnetizationTable;
  /** Last "volume of cell :" value, cubic angstrom (S-042 reads the E(V) volume from this line). */
  volume?: Found<number>;
  /** The last TOTAL ELASTIC MODULI block (IBRION = 6, ISIF >= 3), when present. */
  elastic?: ElasticModuli;
  /** epsilon_infinity: the last MACROSCOPIC STATIC DIELECTRIC TENSOR (including local field effects in DFT). */
  epsilonInf?: Tensor3Block;
  /** The last MACROSCOPIC STATIC DIELECTRIC TENSOR IONIC CONTRIBUTION (IBRION = 5 to 8 with LEPSILON). */
  epsilonIon?: Tensor3Block;
  /** The last BORN EFFECTIVE CHARGES block. */
  born?: BornChargesBlock;
  /** The last block of Gamma-point normal modes (IBRION = 5 to 8). */
  phonons?: PhononModesBlock;
  /** One per electronic loop: true when EDIFF was reached. */
  electronicLoops: { line: number; reached: boolean }[];
  warnings: string[];
}

const N = `(${NUM_SRC})`;
const R = {
  version: /vasp\.(\d+\.\d+\.\d+)/i,
  nions: /NIONS\s*=\s*(\d+)/,
  encut: new RegExp(String.raw`^\s*ENCUT\s*=\s*${N}\s*eV`),
  enmax: new RegExp(String.raw`^\s*ENMAX\s*=\s*${N}\s*;`),
  nkpts: /NKPTS\s*=\s*(\d+)/,
  nbands: /NBANDS\s*=\s*(\d+)/,
  toten: new RegExp(String.raw`free\s+energy\s+TOTEN\s*=\s*${N}\s*eV`),
  noEntropy: new RegExp(String.raw`energy\s+without\s+entropy\s*=\s*${N}\s+energy\(sigma->0\)\s*=\s*${N}`),
  pressure: new RegExp(String.raw`external\s+pressure\s*=\s*${N}\s*kB\s+Pullay\s+stress\s*=\s*${N}\s*kB`),
  forcesHead: /TOTAL-FORCE\s*\(eV\/Angst\)/,
  drift: new RegExp(String.raw`total drift:\s*${N}\s+${N}\s+${N}`),
  efermi: new RegExp(String.raw`E-fermi\s*:\s*${N}`),
  accuracy: /reached required accuracy/,
  elapsed: new RegExp(String.raw`Elapsed time \(sec\):\s*${N}`),
  magnet: new RegExp(String.raw`number of electron\s+${N}\s+magnetization\s+${N}`),
  volume: new RegExp(String.raw`volume of cell\s*:\s*${N}`),
  ediffYes: /aborting loop because EDIFF is reached/,
  ediffNo: /aborting loop EDIFF was not reached/,
};

/** Read one "magnetization (x)" table starting at its heading line i. Same layout pymatgen's Outcar reads (S-034). */
function readMagTable(lines: string[], i: number): MagnetizationTable | undefined {
  let h = i + 1;
  while (h < lines.length && h <= i + 4 && !lines[h]!.trim().startsWith('# of ion')) h++;
  const head = lines[h]?.trim();
  if (!head?.startsWith('# of ion')) return undefined;
  const names = head.slice('# of ion'.length).trim().split(/\s+/).filter(Boolean);
  const totAt = names.indexOf('tot');
  const columns = names.filter((n) => n !== 'tot');
  const sites: SiteMagnetization[] = [];
  let total: Record<string, number> | undefined;
  for (let j = h + 1; j < lines.length; j++) {
    const t = lines[j]!.trim();
    if (/^-+$/.test(t)) continue;
    if (t === '') break;
    const parts = t.split(/\s+/);
    if (parts[0] === 'tot') {
      const v = parts.slice(1).map(toNum);
      total = {};
      names.forEach((n, k) => {
        if (k < v.length && Number.isFinite(v[k]!)) total![n] = v[k]!;
      });
      break;
    }
    if (!/^\d+$/.test(parts[0]!)) break;
    const v = parts.slice(1).map(toNum);
    if (!v.length || !v.every(Number.isFinite)) break;
    const values: Record<string, number> = {};
    let tot: number | undefined;
    names.forEach((n, k) => {
      if (k >= v.length) return;
      if (k === totAt) tot = v[k]!;
      else values[n] = v[k]!;
    });
    sites.push({
      ion: Number(parts[0]),
      values,
      tot: tot ?? Object.values(values).reduce((a, b) => a + b, 0),
    });
  }
  return sites.length ? { line: i + 1, columns, sites, ...(total ? { total } : {}) } : undefined;
}

/** Parse OUTCAR text. Never throws; see `warnings` for what could not be read. */
export function parseOutcar(text: string): OutcarResult {
  const lines = text.split(/\r?\n/);
  const out: OutcarResult = {
    enmax: [],
    ionic: [],
    pressure: [],
    reachedRequiredAccuracy: false,
    electronicLoops: [],
    warnings: [],
  };
  let current: IonicEnergy | null = null;
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i]!;
    const ln = i + 1;
    let m: RegExpExecArray | null;
    if (!out.version && (m = R.version.exec(s))) out.version = m[1]!;
    if (!out.nions && (m = R.nions.exec(s))) out.nions = { value: Number(m[1]), line: ln };
    if (!out.encut && (m = R.encut.exec(s))) out.encut = { value: toNum(m[1]!), line: ln };
    if ((m = R.enmax.exec(s))) out.enmax.push({ value: toNum(m[1]!), line: ln });
    if (!out.nkpts && (m = R.nkpts.exec(s))) out.nkpts = { value: Number(m[1]), line: ln };
    if (!out.nbands && (m = R.nbands.exec(s))) out.nbands = { value: Number(m[1]), line: ln };
    if ((m = R.volume.exec(s))) out.volume = { value: toNum(m[1]!), line: ln };
    if ((m = R.toten.exec(s))) {
      current = { line: ln, freeEnergyTOTEN: toNum(m[1]!) };
      out.ionic.push(current);
    } else if ((m = R.noEntropy.exec(s))) {
      if (!current) {
        current = { line: ln };
        out.ionic.push(current);
      }
      current.energyWithoutEntropy = toNum(m[1]!);
      current.energySigma0 = toNum(m[2]!);
      current = null;
    }
    if ((m = R.pressure.exec(s)))
      out.pressure.push({ line: ln, pressureKb: toNum(m[1]!), pulayKb: toNum(m[2]!) });
    if (R.forcesHead.test(s)) {
      const forces: [number, number, number][] = [];
      let j = i + 2; // skip the dashed line
      for (; j < lines.length; j++) {
        const t = lines[j]!.trim();
        if (t === '' || /^-+$/.test(t)) break;
        const v = t.split(/\s+/).map(toNum);
        if (v.length >= 6 && v.every(Number.isFinite)) forces.push([v[3]!, v[4]!, v[5]!]);
      }
      const dm = R.drift.exec(lines[j + 1] ?? '');
      out.forces = {
        line: ln,
        forces,
        maxForce: forces.reduce((a, f) => Math.max(a, Math.hypot(f[0], f[1], f[2])), 0),
        ...(dm ? { drift: [toNum(dm[1]!), toNum(dm[2]!), toNum(dm[3]!)] as [number, number, number] } : {}),
      };
    }
    if ((m = R.efermi.exec(s))) out.efermi = { value: toNum(m[1]!), line: ln };
    if (R.accuracy.test(s)) {
      out.reachedRequiredAccuracy = true;
      out.reachedRequiredAccuracyLine = ln;
    }
    if ((m = R.elapsed.exec(s))) out.elapsedSec = { value: toNum(m[1]!), line: ln };
    if (s.trim() === 'magnetization (x)') {
      const tab = readMagTable(lines, i);
      if (tab) out.siteMagnetization = tab;
    }
    if (/^\s*TOTAL ELASTIC MODULI \(kBar\)/.test(s)) {
      const el = readElastic(lines, i);
      if (el) out.elastic = el;
      else
        out.warnings.push(
          `Line ${ln}: a TOTAL ELASTIC MODULI block was found but its six rows could not be read.`,
        );
    }
    if (/^\s*MACROSCOPIC STATIC DIELECTRIC TENSOR \(including local field effects in DFT\)/.test(s)) {
      const b = readTensor3(lines, i);
      if (b) out.epsilonInf = b;
      else
        out.warnings.push(
          `Line ${ln}: a dielectric tensor heading was found but its three rows could not be read.`,
        );
    }
    if (/^\s*MACROSCOPIC STATIC DIELECTRIC TENSOR IONIC CONTRIBUTION/.test(s)) {
      const b = readTensor3(lines, i);
      if (b) out.epsilonIon = b;
      else
        out.warnings.push(
          `Line ${ln}: an ionic dielectric tensor heading was found but its rows could not be read.`,
        );
    }
    if (/^\s*BORN EFFECTIVE CHARGES/.test(s)) {
      const b = readBorn(lines, i);
      if (b) out.born = b;
      else out.warnings.push(`Line ${ln}: a BORN EFFECTIVE CHARGES block was found but could not be read.`);
    }
    if (/^\s*Eigenvectors and eigenvalues of the dynamical matrix/.test(s)) {
      const b = readModes(lines, i, out.nions?.value);
      if (b) out.phonons = b;
      else
        out.warnings.push(
          `Line ${ln}: a dynamical-matrix heading was found but no mode lines could be read.`,
        );
    }
    if ((m = R.magnet.exec(s))) out.magnetization = { value: toNum(m[2]!), line: ln };
    if (R.ediffYes.test(s)) out.electronicLoops.push({ line: ln, reached: true });
    else if (R.ediffNo.test(s)) out.electronicLoops.push({ line: ln, reached: false });
  }
  if (!out.version)
    out.warnings.push('No VASP version line was found; the format was not checked against a known version.');
  if (!out.nions) out.warnings.push('NIONS was not found, so energies cannot be given per atom.');
  if (out.ionic.length === 0)
    out.warnings.push('No energy blocks were found (the run may not have finished its first step).');
  if (!out.elapsedSec)
    out.warnings.push('No "Elapsed time" line: the run may still be going or may have stopped early.');
  if (out.electronicLoops.some((l) => !l.reached))
    out.warnings.push(
      'At least one electronic loop ended without reaching EDIFF. Forces and energies from that step are unreliable.',
    );
  return out;
}
