// OSZICAR parser. Pure, tolerant: unrecognised lines produce warnings, never exceptions.
// @source S-019 (VASP wiki: OSZICAR), S-041 (Field Handbook OSZICAR entry), S-042
import { NUM_SRC, numbersIn, toNum } from './num';

export interface ElectronicStep {
  /** 1-based line in the file. */
  line: number;
  /** Algorithm label as printed: DAV, RMM, CGA ... */
  solver: string;
  n: number;
  e: number;
  dE: number;
  dEps: number;
  ncg: number;
  rms: number;
  /** Charge-density residual; absent in the first steps of a run. */
  rmsC?: number;
}

export interface IonicStep {
  line: number;
  /** Ionic step number as printed. */
  step: number;
  /** Free energy F (TOTEN). */
  f: number;
  /** Energy extrapolated to sigma -> 0. */
  e0: number;
  /** Change since the previous ionic step; absent in MD lines. */
  dE?: number;
  /** Total magnetization (first component for non-collinear). */
  mag?: number;
  /** MD only: temperature, total energy, kinetic energy, SP, SK. */
  t?: number;
  e?: number;
  ek?: number;
  sp?: number;
  sk?: number;
  /** Electronic steps taken since the previous ionic line. */
  nElectronic: number;
}

export interface OszicarResult {
  electronic: ElectronicStep[];
  ionic: IonicStep[];
  isMD: boolean;
  warnings: string[];
}

const ELEC = new RegExp(String.raw`^\s*([A-Za-z]{2,4}):\s+(\d+)\s*(.*)$`);
const IONIC_START = /^\s*(\d+)\s+(?:T|F)\s*=/;
const PAIR = new RegExp(String.raw`(d E|[A-Za-z][A-Za-z0-9]*)\s*=\s*(${NUM_SRC})`, 'g');

/** Parse OSZICAR text (VASP 5.4 and 6.x; spin-polarized or not; relaxation or MD). */
export function parseOszicar(text: string): OszicarResult {
  const electronic: ElectronicStep[] = [];
  const ionic: IonicStep[] = [];
  const warnings: string[] = [];
  let pending = 0;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const ln = i + 1;
    if (raw.trim() === '' || /^\s*N\s+E\s+dE/.test(raw)) continue;
    const el = ELEC.exec(raw);
    if (el && !IONIC_START.test(raw)) {
      const v = numbersIn(el[3]!);
      if (v.length < 5) {
        warnings.push(`line ${ln}: electronic step has ${v.length} numbers, expected 5 or 6`);
        continue;
      }
      electronic.push({
        line: ln,
        solver: el[1]!.toUpperCase(),
        n: Number(el[2]),
        e: v[0]!,
        dE: v[1]!,
        dEps: v[2]!,
        ncg: v[3]!,
        rms: v[4]!,
        ...(v[5] !== undefined ? { rmsC: v[5] } : {}),
      });
      pending++;
      continue;
    }
    if (IONIC_START.test(raw)) {
      const step = Number(/^\s*(\d+)/.exec(raw)![1]);
      const kv = new Map<string, number>();
      let first: string | undefined;
      for (const m of raw.matchAll(PAIR)) {
        const key = m[1]!.replace(/\s+/g, '');
        if (!kv.has(key)) kv.set(key, toNum(m[2]!));
        if (key === 'mag' && first === undefined) first = m[2];
      }
      const f = kv.get('F');
      const e0 = kv.get('E0');
      if (f === undefined || e0 === undefined) {
        warnings.push(`line ${ln}: ionic line without F and E0 was skipped`);
        continue;
      }
      const opt = (k: string, name: keyof IonicStep) => (kv.has(k) ? { [name]: kv.get(k)! } : {});
      ionic.push({
        line: ln,
        step,
        f,
        e0,
        ...opt('dE', 'dE'),
        ...opt('mag', 'mag'),
        ...opt('T', 't'),
        ...opt('E', 'e'),
        ...opt('EK', 'ek'),
        ...opt('SP', 'sp'),
        ...opt('SK', 'sk'),
        nElectronic: pending,
      });
      pending = 0;
      continue;
    }
    warnings.push(`line ${ln}: not recognised as an OSZICAR line: "${raw.trim().slice(0, 60)}"`);
  }
  const isMD = ionic.some((s) => s.t !== undefined);
  if (isMD)
    warnings.push('This is a molecular dynamics run (T= lines). Convergence checks do not apply to MD.');
  if (ionic.length === 0 && electronic.length === 0) warnings.push('No OSZICAR lines were found.');
  if (pending > 0 && ionic.length > 0)
    warnings.push(`${pending} electronic step(s) after the last ionic line (run still going or cut off).`);
  return { electronic, ionic, isMD, warnings };
}
