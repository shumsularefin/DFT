// OUTCAR parser. Pure, tolerant: a missing optional item is simply absent, unknown formats produce warnings.
// @source S-019, S-041 (Field Handbook OUTCAR grep list), S-042, D-015
// Line formats are from the documentation and hand-written fixtures; not yet validated on real output (Q-008).
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
  ediffYes: /aborting loop because EDIFF is reached/,
  ediffNo: /aborting loop EDIFF was not reached/,
};

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
