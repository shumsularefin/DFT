// Turn dropped OUTCAR / OSZICAR files and pasted CSV into editable E(V) rows for the equation-of-state tool. Pure.
// @source S-042 (E-V scan: volume from "volume of cell", energy from the last field of "energy  without entropy")
import { MAX_FILE_BYTES } from './seriesInput';
import { parseOszicar } from './oszicar';
import { parseOutcar } from './outcar';
import { EOS_FORMS, type EosFit, type EvPoint } from '../physics/eos';

export interface EosRow {
  id: number;
  label: string;
  /** Cubic angstrom, as typed or read. */
  volume: string;
  /** eV, energy(sigma->0). */
  energy: string;
  natoms: string;
}

export type EosRowIn = Omit<EosRow, 'id'>;

export interface EosIngest {
  rows: EosRowIn[];
  warnings: string[];
}

const folderOf = (path: string) => {
  const parts = path.split('/');
  return parts.length > 1 ? parts.slice(0, -1).join('/') : path;
};
const isOutcar = (text: string) => /free\s+energy\s+TOTEN|NIONS\s*=|volume of cell/.test(text);

/** One file. OUTCAR gives volume, energy and atom count; OSZICAR gives the energy only. */
export function eosRowFromFile(
  name: string,
  text: string,
): { row?: EosRowIn; warning?: string; outcar: boolean } {
  const label = folderOf(name);
  if (isOutcar(text)) {
    const o = parseOutcar(text);
    const last = [...o.ionic].reverse().find((s) => s.energySigma0 !== undefined);
    if (!last) return { warning: `${name}: no "energy(sigma->0)" line found in this OUTCAR.`, outcar: true };
    const row: EosRowIn = {
      label,
      volume: o.volume ? String(o.volume.value) : '',
      energy: String(last.energySigma0),
      natoms: o.nions ? String(o.nions.value) : '',
    };
    const warns: string[] = [];
    if (!o.volume) warns.push(`${name}: no "volume of cell" line; type the volume in the table.`);
    if (o.ionic.length > 1 && !o.reachedRequiredAccuracy)
      warns.push(
        `${name}: the relaxation did not report "reached required accuracy"; this point may not be converged.`,
      );
    return { row, ...(warns.length ? { warning: warns.join(' ') } : {}), outcar: true };
  }
  const z = parseOszicar(text);
  const last = z.ionic.at(-1);
  if (!last) return { warning: `${name}: no ionic step found; is this an OSZICAR or OUTCAR?`, outcar: false };
  return {
    row: { label, volume: '', energy: String(last.e0), natoms: '' },
    warning: `${name}: an OSZICAR has no cell volume; type it in the table or drop the OUTCAR instead.`,
    outcar: false,
  };
}

/** Many files. When one folder has both, the OUTCAR wins (it also has the volume). */
export function ingestEosFiles(files: readonly { name: string; text: string }[]): EosIngest {
  const byFolder = new Map<string, { row: EosRowIn; outcar: boolean; warning?: string }>();
  const warnings: string[] = [];
  for (const f of files) {
    if (f.text.length > MAX_FILE_BYTES) {
      warnings.push(`${f.name}: larger than 25 MB, skipped.`);
      continue;
    }
    const r = eosRowFromFile(f.name, f.text);
    if (!r.row) {
      if (r.warning) warnings.push(r.warning);
      continue;
    }
    const prev = byFolder.get(r.row.label);
    if (prev && prev.outcar && !r.outcar) continue;
    byFolder.set(r.row.label, { row: r.row, outcar: r.outcar, ...(r.warning ? { warning: r.warning } : {}) });
  }
  for (const v of byFolder.values()) if (v.warning) warnings.push(v.warning);
  const rows = [...byFolder.values()].map((v) => v.row);
  return { rows, warnings };
}

const COLS: Record<string, keyof EosRowIn> = {
  label: 'label',
  name: 'label',
  folder: 'label',
  v: 'volume',
  vol: 'volume',
  volume: 'volume',
  volumea3: 'volume',
  e: 'energy',
  e0: 'energy',
  energy: 'energy',
  esigma0: 'energy',
  energyev: 'energy',
  natoms: 'natoms',
  nions: 'natoms',
  atoms: 'natoms',
};

/**
 * CSV, tab or space separated. With a header, columns are found by name (the collect.sh header
 * label,volume_A3,E_sigma0,nions works). Without one, the columns are volume, energy and optionally the atom count.
 */
export function ingestEosCsv(text: string): EosIngest {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, '').trim())
    .filter(Boolean);
  const warnings: string[] = [];
  const rows: EosRowIn[] = [];
  if (!lines.length) return { rows, warnings: ['Nothing to read.'] };
  const split = (l: string) => l.split(/\s*[,;\t]\s*|\s+/).filter((c) => c !== '');
  const first = split(lines[0]!);
  const hasHeader = first.some((c) => !Number.isFinite(Number(c)));
  let map: (keyof EosRowIn | undefined)[] = ['volume', 'energy', 'natoms'];
  if (hasHeader) {
    map = first.map((h) => COLS[h.toLowerCase().replace(/[^a-z0-9]/g, '')]);
    if (!map.includes('volume') || !map.includes('energy'))
      return { rows, warnings: ['The header needs a volume column and an energy column.'] };
  }
  lines.slice(hasHeader ? 1 : 0).forEach((l, i) => {
    const cells = split(l);
    const row: EosRowIn = { label: '', volume: '', energy: '', natoms: '' };
    cells.forEach((c, k) => {
      const key = map[k];
      if (key) row[key] = c;
    });
    if (!row.label) row.label = `row ${i + 1}`;
    rows.push(row);
  });
  return { rows, warnings };
}

const num = (s: string): number | undefined => {
  const v = Number(s);
  return s.trim() !== '' && Number.isFinite(v) ? v : undefined;
};

/**
 * Rows to fit points. Rows without a positive volume or a finite energy are dropped and named in `skipped`.
 * `natoms` is returned only when every used row agrees on it.
 */
export function eosPointsFromRows(rows: readonly EosRow[]): {
  points: EvPoint[];
  skipped: number[];
  natoms?: number;
  natomsMismatch: boolean;
} {
  const points: EvPoint[] = [];
  const skipped: number[] = [];
  const nat = new Set<number>();
  rows.forEach((r, i) => {
    const volume = num(r.volume);
    const energy = num(r.energy);
    if (volume === undefined || volume <= 0 || energy === undefined) {
      skipped.push(i + 1);
      return;
    }
    const n = num(r.natoms);
    if (n !== undefined && n > 0) nat.add(n);
    points.push({ volume, energy, ...(r.label ? { label: r.label } : {}) });
  });
  return {
    points,
    skipped,
    ...(nat.size === 1 ? { natoms: [...nat][0]! } : {}),
    natomsMismatch: nat.size > 1,
  };
}

/** Fit result as CSV: parameter lines with units (commented), then one row per point. */
export function eosResultCsv(f: EosFit): string {
  const e = f.stderr;
  const pm = (v: number | undefined) => (v === undefined ? '' : ` +/- ${v.toPrecision(3)}`);
  return [
    `# ${EOS_FORMS[f.form]} fit, DFT Handbook equation-of-state tool`,
    `# E0 = ${f.params.e0.toFixed(6)}${pm(e?.e0)} eV`,
    `# V0 = ${f.params.v0.toFixed(5)}${pm(e?.v0)} A^3`,
    `# B0 = ${f.params.b0.toFixed(6)}${pm(e?.b0)} eV/A^3 = ${f.b0GPa.toFixed(3)}${e ? pm((e.b0 * f.b0GPa) / f.params.b0) : ''} GPa`,
    `# B0' = ${f.params.b1.toFixed(4)}${pm(e?.b1)} (dimensionless)`,
    `# RMS residual = ${(f.rmsResidual * 1000).toFixed(4)} meV per cell`,
    'label,volume_A3,energy_eV,fit_eV,residual_meV',
    ...f.points.map(
      (q) => `${q.label ?? ''},${q.volume},${q.energy},${q.fit.toFixed(8)},${(q.residual * 1000).toFixed(4)}`,
    ),
    '',
  ].join('\n');
}
