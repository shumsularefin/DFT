// Local calculation folder / zip intake and file recognition for /tools/review/.
// POTCAR safety: only TITEL, ENMAX and ZVAL header metadata are extracted; raw POTCAR text is never kept.
// @source S-019, S-041, S-042
import { parseIncar, type IncarParse } from '../vasp/incar';
import { parsePoscar } from '../crystal/poscar';
import type { Structure } from '../crystal/types';
import { parseOszicar, type OszicarResult } from '../vasp/oszicar';
import { parseOutcar, type OutcarResult } from '../vasp/outcar';

export type VaspFileKind =
  'INCAR' | 'POSCAR' | 'CONTCAR' | 'KPOINTS' | 'OSZICAR' | 'OUTCAR' | 'POTCAR' | 'UNKNOWN';

export interface PotcarSpeciesHeader {
  readonly titel: string;
  readonly enmax?: number;
  readonly zval?: number;
}

export interface ReviewIntake {
  readonly files: readonly { readonly name: string; readonly kind: VaspFileKind }[];
  readonly incar?: IncarParse;
  readonly poscar?: Structure;
  readonly contcar?: Structure;
  readonly kpointsText?: string;
  readonly oszicar?: OszicarResult;
  readonly outcar?: OutcarResult;
  /** Extracted POTCAR metadata only (TITEL, ENMAX, ZVAL). Full text is never stored. */
  readonly potcarHeaders: readonly PotcarSpeciesHeader[];
  readonly warnings: readonly string[];
}

export interface RawInputFile {
  readonly name: string;
  readonly text: string;
}

/** Extract only TITEL, ENMAX and ZVAL from POTCAR text without retaining any pseudopotential data. */
export function parsePotcarHeadersOnly(text: string): PotcarSpeciesHeader[] {
  const headers: PotcarSpeciesHeader[] = [];
  let current: { titel: string; enmax?: number; zval?: number } | null = null;
  for (const line of text.split(/\r?\n/)) {
    const titelM = /^\s*TITEL\s*=\s*(.+)$/.exec(line);
    if (titelM) {
      if (current) headers.push(current);
      current = { titel: titelM[1]!.trim() };
      continue;
    }
    if (!current) continue;
    const enmaxM = /ENMAX\s*=\s*([0-9.+eE-]+)/.exec(line);
    if (enmaxM && current.enmax === undefined) {
      const v = Number(enmaxM[1]);
      if (Number.isFinite(v)) current.enmax = v;
    }
    const zvalM = /ZVAL\s*=\s*([0-9.+eE-]+)/.exec(line);
    if (zvalM && current.zval === undefined) {
      const v = Number(zvalM[1]);
      if (Number.isFinite(v)) current.zval = v;
    }
  }
  if (current) headers.push(current);
  return headers;
}

/** Identify VASP file type by filename first, falling back to content signatures for misnamed files. */
export function detectVaspFileKind(name: string, text: string): VaspFileKind {
  const base = name.split(/[\\/]/).pop()?.toUpperCase() ?? '';
  if (base === 'INCAR' || base.startsWith('INCAR.') || base.endsWith('.INCAR')) return 'INCAR';
  if (base === 'CONTCAR' || base.startsWith('CONTCAR.')) return 'CONTCAR';
  if (base === 'POSCAR' || base.startsWith('POSCAR.') || base.endsWith('.VASP')) return 'POSCAR';
  if (base === 'KPOINTS' || base.startsWith('KPOINTS.')) return 'KPOINTS';
  if (base === 'OSZICAR' || base.startsWith('OSZICAR.')) return 'OSZICAR';
  if (base === 'OUTCAR' || base.startsWith('OUTCAR.')) return 'OUTCAR';
  if (base === 'POTCAR' || base.startsWith('POTCAR.')) return 'POTCAR';

  // Content-based fallback for misnamed files
  if (/VRHFIN\s*=/.test(text) && /LEXCH\s*=/.test(text)) return 'POTCAR';
  if (/free\s+energy\s+TOTEN\s*=/.test(text) || /TOTAL-FORCE\s*\(eV\/Angst\)/.test(text)) return 'OUTCAR';
  if (/^\s*\d+\s+F\s*=\s*[-+0-9.Ee]+\s+E0\s*=/m.test(text) || /^\s*(DAV|RMM|CGA):\s+\d+/m.test(text))
    return 'OSZICAR';
  if (/^\s*(Gamma|Monkhorst-Pack|Line-mode)/im.test(text.split(/\r?\n/).slice(0, 5).join('\n')))
    return 'KPOINTS';
  if (/^\s*(ENCUT|ISMEAR|IBRION|ISPIN|EDIFF|PREC|NSW)\s*=/im.test(text)) return 'INCAR';
  if (/^\s*(Direct|Cartesian)\s*$/im.test(text)) return 'POSCAR';
  return 'UNKNOWN';
}

export function ingestCalculationFiles(rawFiles: readonly RawInputFile[]): ReviewIntake {
  const files: { name: string; kind: VaspFileKind }[] = [];
  const warnings: string[] = [];
  let incar: IncarParse | undefined;
  let poscar: Structure | undefined;
  let contcar: Structure | undefined;
  let kpointsText: string | undefined;
  let oszicar: OszicarResult | undefined;
  let outcar: OutcarResult | undefined;
  const potcarHeaders: PotcarSpeciesHeader[] = [];

  for (const rf of rawFiles) {
    const kind = detectVaspFileKind(rf.name, rf.text);
    files.push({ name: rf.name, kind });
    try {
      if (kind === 'INCAR') incar = parseIncar(rf.text);
      else if (kind === 'POSCAR') poscar = parsePoscar(rf.text).structure;
      else if (kind === 'CONTCAR') contcar = parsePoscar(rf.text).structure;
      else if (kind === 'KPOINTS') kpointsText = rf.text;
      else if (kind === 'OSZICAR') oszicar = parseOszicar(rf.text);
      else if (kind === 'OUTCAR') outcar = parseOutcar(rf.text);
      else if (kind === 'POTCAR') potcarHeaders.push(...parsePotcarHeadersOnly(rf.text));
    } catch (err) {
      warnings.push(`${rf.name} (${kind}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return {
    files,
    ...(incar ? { incar } : {}),
    ...(poscar ? { poscar } : {}),
    ...(contcar ? { contcar } : {}),
    ...(kpointsText ? { kpointsText } : {}),
    ...(oszicar ? { oszicar } : {}),
    ...(outcar ? { outcar } : {}),
    potcarHeaders,
    warnings,
  };
}
