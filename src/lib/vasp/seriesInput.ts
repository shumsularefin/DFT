// Turn dropped OSZICAR/OUTCAR files and pasted CSV into editable series rows. Pure.
// @source S-042 (convergence series), D-015 (default quantity)
import { parseSeriesCsv } from './csv';
import type { EnergyQuantity, SeriesPoint } from './convergence';
import { parseSeriesLabel, type SeriesKind } from './kseries';
import { parseOszicar } from './oszicar';
import { parseOutcar } from './outcar';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export interface SeriesRow {
  id: number;
  /** Setting as typed (ENCUT in eV, resolution, or mesh size). */
  x: string;
  /** Manually typed total energy in eV. */
  energy: string;
  /** Energies read from a file, by quantity. They win over `energy` when present. */
  energies?: Partial<Record<EnergyQuantity, number>>;
  natoms: string;
  pressure: string;
  label: string;
}

export interface Ingest {
  rows: Omit<SeriesRow, 'id'>[];
  kind?: SeriesKind;
  warnings: string[];
}

const empty = (label: string): Omit<SeriesRow, 'id'> => ({
  x: '',
  energy: '',
  natoms: '',
  pressure: '',
  label,
});

/** One file. The label comes from the path (folder or file name). OUTCAR is told apart by its header lines. */
export function rowFromFile(
  name: string,
  text: string,
): { row?: Omit<SeriesRow, 'id'>; kind?: SeriesKind; warning?: string } {
  const sl = parseSeriesLabel(name);
  const row = empty(name);
  if (sl) row.x = String(sl.x);
  const isOutcar = /free\s+energy\s+TOTEN|NIONS\s*=/.test(text);
  if (isOutcar) {
    const o = parseOutcar(text);
    const last = [...o.ionic]
      .reverse()
      .find((s) => s.energySigma0 !== undefined || s.freeEnergyTOTEN !== undefined);
    if (!last) return { warning: `${name}: no energies found in this OUTCAR.` };
    const energies: Partial<Record<EnergyQuantity, number>> = {};
    if (last.freeEnergyTOTEN !== undefined) energies.freeEnergyTOTEN = last.freeEnergyTOTEN;
    if (last.energyWithoutEntropy !== undefined) energies.energyWithoutEntropy = last.energyWithoutEntropy;
    if (last.energySigma0 !== undefined) energies.energySigma0 = last.energySigma0;
    row.energies = energies;
    if (o.nions) row.natoms = String(o.nions.value);
    const p = o.pressure.at(-1);
    if (p) row.pressure = String(p.pressureKb);
    return {
      row,
      ...(sl ? { kind: sl.kind } : {}),
      ...(sl
        ? {}
        : {
            warning: `${name}: the file name does not say the setting (use names like encut_450); type x in the table.`,
          }),
    };
  }
  const z = parseOszicar(text);
  const last = z.ionic.at(-1);
  if (!last) return { warning: `${name}: no ionic step found; is this an OSZICAR or OUTCAR?` };
  row.energies = { freeEnergyTOTEN: last.f, energySigma0: last.e0 };
  return {
    row,
    ...(sl ? { kind: sl.kind } : {}),
    ...(sl
      ? {}
      : {
          warning: `${name}: the file name does not say the setting (use names like encut_450); type x in the table.`,
        }),
  };
}

export function ingestFiles(files: readonly { name: string; text: string }[]): Ingest {
  const rows: Omit<SeriesRow, 'id'>[] = [];
  const warnings: string[] = [];
  const kinds = new Set<SeriesKind>();
  for (const f of files) {
    if (f.text.length > MAX_FILE_BYTES) {
      warnings.push(`${f.name}: larger than 25 MB, skipped.`);
      continue;
    }
    const r = rowFromFile(f.name, f.text);
    if (r.warning) warnings.push(r.warning);
    if (r.row) rows.push(r.row);
    if (r.kind) kinds.add(r.kind);
  }
  return { rows, ...(kinds.size === 1 ? { kind: [...kinds][0]! } : {}), warnings };
}

export function ingestCsv(text: string): Ingest {
  const c = parseSeriesCsv(text);
  const kinds = new Set(c.rows.map((r) => (r.label ? parseSeriesLabel(r.label)?.kind : undefined)));
  const kind = kinds.size === 1 ? [...kinds][0] : undefined;
  return {
    rows: c.rows.map((r) => ({
      x: String(r.x),
      energy: String(r.energy),
      natoms: r.natoms !== undefined ? String(r.natoms) : '',
      pressure: r.pressure !== undefined ? String(r.pressure) : '',
      label: r.label ?? '',
    })),
    ...(kind ? { kind } : {}),
    warnings: c.warnings,
  };
}

const num = (s: string): number | undefined => {
  const v = Number(s);
  return s.trim() !== '' && Number.isFinite(v) ? v : undefined;
};

/** Rows to analysable points. Rows without a usable x or energy are dropped and named in `skipped`. */
export function pointsFromRows(
  rows: readonly SeriesRow[],
  quantity: EnergyQuantity,
  defaultNatoms?: number,
): { points: SeriesPoint[]; skipped: number[] } {
  const points: SeriesPoint[] = [];
  const skipped: number[] = [];
  rows.forEach((r, i) => {
    const x = num(r.x);
    const energy = r.energies ? r.energies[quantity] : num(r.energy);
    if (x === undefined || energy === undefined) {
      skipped.push(i + 1);
      return;
    }
    const natoms = num(r.natoms) ?? defaultNatoms;
    const pressure = num(r.pressure);
    points.push({
      x,
      energy,
      ...(natoms && natoms > 0 ? { natoms } : {}),
      ...(pressure !== undefined ? { pressure } : {}),
      ...(r.label ? { label: r.label } : {}),
    });
  });
  return { points, skipped };
}
