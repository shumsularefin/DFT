// Pure logic for the Input Builder (no React, no DOM): presets to entries, ENCUT suggestion, MAGMOM and LDAU helpers,
// share links, file contents. The React side only calls these.
// @source S-041, S-042
import { speciesCounts } from '../crystal/structure';
import type { Structure } from '../crystal/types';
import { writePoscar } from '../crystal/poscar';
import { writeIncar, type IncarEntry } from './incar';
import { POTCAR_NOTE, jobScript, potcarCommand, submitCommand, type JobOptions } from './jobscript';
import type { SystemType, VaspVersion } from './validate';

export interface PresetEntry {
  name: string;
  value: string;
  comment?: string;
  placeholder?: string;
}
export interface PresetVariant {
  id: string;
  title: string;
  requires: string[];
  vaspMin?: string;
  note?: string;
  entries: PresetEntry[];
}
export interface Preset {
  id: string;
  title: string;
  summary: string;
  protocolStage: number | null;
  fragment: boolean;
  sources: string[];
  notes: string[];
  variants: PresetVariant[];
}

// ---- ENCUT ---------------------------------------------------------------------------------------------------

/** Presets whose own ENCUT is 1.3 x ENMAX (cell changes or stress are involved). */
const STRESS_PRESETS = new Set(['relax', 'elastic']);

export interface EncutSuggestion {
  value: number;
  reason: string;
}

/**
 * ENCUT suggestion (work order M3.5). Relaxation and elastic runs: 1.3 x ENMAX (Pulay stress). Every other task: the same
 * ENCUT as the relaxation it builds on, because the dictionary says to keep it identical in every calculation you compare;
 * `relaxEncut` is that value when known, otherwise the protocol's 1.3 x ENMAX. Never below ENMAX.
 */
export function suggestEncut(presetId: string, enmax: number, relaxEncut?: number): EncutSuggestion | null {
  if (!(enmax > 0) || !Number.isFinite(enmax)) return null;
  const round = (x: number) => Math.round(x * 100) / 100;
  if (STRESS_PRESETS.has(presetId))
    return {
      value: round(1.3 * enmax),
      reason: `1.3 x ENMAX (${enmax} eV): stress converges more slowly than energy, so relaxations and elastic runs need the margin.`,
    };
  if (relaxEncut !== undefined && relaxEncut >= enmax)
    return {
      value: relaxEncut,
      reason: `The same ENCUT as the relaxation this run builds on (${relaxEncut} eV). Keep it identical in every calculation you compare.`,
    };
  return {
    value: round(1.3 * enmax),
    reason: `Use the same ENCUT as your relaxation. The protocol relaxes with 1.3 x ENMAX = ${round(1.3 * enmax)} eV, so use that here, and never go below ENMAX (${enmax} eV).`,
  };
}

// ---- preset to entries -------------------------------------------------------------------------------------------

export interface PresetContext {
  enmax?: number;
  relaxEncut?: number;
}

/** Entries for a preset variant. An ENCUT placeholder is filled when ENMAX is known; other placeholders stay visible. */
export function entriesFromPreset(preset: Preset, variantId: string, ctx: PresetContext = {}): IncarEntry[] {
  const v = preset.variants.find((x) => x.id === variantId) ?? preset.variants[0]!;
  return v.entries.map((e) => {
    let value = e.placeholder ?? e.value;
    if (e.name === 'ENCUT' && e.placeholder && ctx.enmax) {
      const s = suggestEncut(preset.id, ctx.enmax, ctx.relaxEncut);
      if (s) value = String(s.value);
    }
    return { name: e.name, value, ...(e.comment ? { comment: e.comment } : {}) };
  });
}

/** Entries whose value is still an angle-bracket placeholder. They block the download. */
export const unfilled = (entries: readonly IncarEntry[]): IncarEntry[] =>
  entries.filter((e) => /^</.test(e.value.trim()) || e.value.includes('<'));

// ---- per-species helpers ---------------------------------------------------------------------------------------

export const speciesOrder = (s: Structure): string[] => speciesCounts(s).map((x) => x.symbol);

/** Collapse runs of equal tokens into VASP repeat form: ["5.0","5.0","0.6"] -> "2*5.0 0.6". */
export function compressRepeats(values: readonly string[]): string {
  const out: string[] = [];
  for (let i = 0; i < values.length;) {
    let j = i;
    while (j < values.length && values[j] === values[i]) j++;
    const n = j - i;
    out.push(n > 1 ? `${n}*${values[i]}` : values[i]!);
    i = j;
  }
  return out.join(' ');
}

/** One value per atom in POSCAR order from per-species values. Returns null while any species has no value. */
export function perAtomValues(s: Structure, perSpecies: Readonly<Record<string, string>>): string[] | null {
  const out: string[] = [];
  for (const sp of s.species) {
    const v = perSpecies[sp]?.trim();
    if (!v) return null;
    out.push(v);
  }
  return out;
}

/** MAGMOM text (compressed) from per-species moments, or null when incomplete. */
export function magmomFromSpecies(s: Structure, perSpecies: Readonly<Record<string, string>>): string | null {
  const v = perAtomValues(s, perSpecies);
  return v ? compressRepeats(v) : null;
}

export interface LdauRow {
  l: string;
  u: string;
  j: string;
}
/** LDAUL, LDAUU and LDAUJ values, one per species in POSCAR order; null while a row is incomplete. */
export function ldauFromSpecies(
  s: Structure,
  rows: Readonly<Record<string, LdauRow>>,
): { LDAUL: string; LDAUU: string; LDAUJ: string } | null {
  const order = speciesOrder(s);
  const pick = (f: keyof LdauRow) => order.map((sp) => rows[sp]?.[f]?.trim() ?? '');
  const l = pick('l'),
    u = pick('u'),
    j = pick('j');
  if ([...l, ...u, ...j].some((x) => x === '')) return null;
  return { LDAUL: l.join(' '), LDAUU: u.join(' '), LDAUJ: j.join(' ') };
}

// ---- entry editing (pure) --------------------------------------------------------------------------------------

export const upsert = (entries: readonly IncarEntry[], name: string, value: string): IncarEntry[] => {
  const i = entries.findIndex((e) => e.name === name);
  if (i < 0) return [...entries.map((e) => ({ ...e })), { name, value }];
  return entries.map((e, k) => (k === i ? { ...e, value } : { ...e }));
};
export const removeEntry = (entries: readonly IncarEntry[], name: string): IncarEntry[] =>
  entries.filter((e) => e.name !== name).map((e) => ({ ...e }));

// ---- share links -----------------------------------------------------------------------------------------------

export interface ShareState {
  preset: string;
  variant: string;
  systemType: SystemType;
  enmax?: number;
  version?: VaspVersion;
  /** Edited INCAR as name/value pairs (comments dropped). */
  entries: [string, string][];
  kpMode: 'gamma' | 'monkhorst-pack' | 'kspacing' | 'line';
  spacing: number;
  /** POSCAR text, only when it is at most SHARE_STRUCTURE_LIMIT characters. */
  poscar?: string;
}
export const SHARE_STRUCTURE_LIMIT = 2048;
const SYSTEMS: SystemType[] = ['metal', 'semiconductor', 'insulator', 'slab', 'molecule', 'unknown'];
const VERSIONS: VaspVersion[] = ['5.4', '6.3', '6.4'];
const KP_MODES = ['gamma', 'monkhorst-pack', 'kspacing', 'line'] as const;

function b64encode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64decode(t: string): string {
  const pad = t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4);
  const bin = atob(pad);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Fragment text (without the leading #). The structure is left out when it is longer than 2 KB. */
export function encodeShare(st: ShareState): string {
  const { poscar, ...rest } = st;
  const payload = poscar !== undefined && poscar.length <= SHARE_STRUCTURE_LIMIT ? st : rest;
  return 's=' + b64encode(JSON.stringify(payload));
}

const isStr = (x: unknown): x is string => typeof x === 'string';
/** Parse and validate a fragment. Returns null for anything malformed. */
export function decodeShare(fragment: string): ShareState | null {
  const m = /^#?s=([A-Za-z0-9_-]+)$/.exec(fragment);
  if (!m) return null;
  let o: unknown;
  try {
    o = JSON.parse(b64decode(m[1]!));
  } catch {
    return null;
  }
  if (typeof o !== 'object' || o === null) return null;
  const r = o as Record<string, unknown>;
  if (!isStr(r.preset) || !isStr(r.variant)) return null;
  if (!SYSTEMS.includes(r.systemType as SystemType)) return null;
  if (!KP_MODES.includes(r.kpMode as (typeof KP_MODES)[number])) return null;
  if (typeof r.spacing !== 'number' || !Number.isFinite(r.spacing)) return null;
  if (
    !Array.isArray(r.entries) ||
    !r.entries.every((e) => Array.isArray(e) && e.length === 2 && isStr(e[0]) && isStr(e[1]))
  )
    return null;
  if (r.enmax !== undefined && !(typeof r.enmax === 'number' && Number.isFinite(r.enmax))) return null;
  if (r.version !== undefined && !VERSIONS.includes(r.version as VaspVersion)) return null;
  if (r.poscar !== undefined && !(isStr(r.poscar) && r.poscar.length <= SHARE_STRUCTURE_LIMIT)) return null;
  return {
    preset: r.preset,
    variant: r.variant,
    systemType: r.systemType as SystemType,
    ...(r.enmax !== undefined ? { enmax: r.enmax as number } : {}),
    ...(r.version !== undefined ? { version: r.version as VaspVersion } : {}),
    entries: r.entries as [string, string][],
    kpMode: r.kpMode as ShareState['kpMode'],
    spacing: r.spacing,
    ...(r.poscar !== undefined ? { poscar: r.poscar } : {}),
  };
}

// ---- files -------------------------------------------------------------------------------------------------------

export interface BuildInput {
  structure: Structure;
  entries: readonly IncarEntry[];
  kpoints: string | null;
  job: JobOptions;
  presetTitle: string;
  vaspVersion?: VaspVersion;
}
export interface BuiltFile {
  name: string;
  text: string;
}

/** POTCAR directory names in POSCAR order: raw labels such as "Ti_pv" when present, else element symbols. */
export function potcarLabels(s: Structure): string[] {
  const out: string[] = [];
  s.species.forEach((sp, i) => {
    const l = s.labels?.[i] ?? sp;
    if (out[out.length - 1] !== l && !out.includes(l)) out.push(l);
  });
  return out;
}

export const GENERATOR_NOTE =
  'Generated by the DFT Handbook Input Builder. It writes inputs for VASP 5.4, 6.3 or 6.4; it does not guarantee they are right for your system. Check every value.';

export function readme(b: BuildInput, poscarReordered: boolean): string {
  const labels = potcarLabels(b.structure);
  const cmd = potcarCommand(labels);
  return [
    `Input files for: ${b.presetTitle}`,
    GENERATOR_NOTE,
    '',
    'Files',
    '  INCAR     settings',
    b.kpoints ? '  KPOINTS   k-point mesh' : '  (no KPOINTS file: the mesh comes from KSPACING in INCAR)',
    '  POSCAR    structure',
    '  job.sh    job script',
    '',
    'POTCAR (you must build it yourself)',
    `  ${POTCAR_NOTE}`,
    `  Species order in POSCAR: ${labels.join(' ')}`,
    cmd ? `  ${cmd}` : '',
    '  Set POTCAR_LIBRARY to your licensed POTCAR directory, and check the directory names match your library.',
    '  Then read ENMAX and ZVAL with:  grep -E "ENMAX|ZVAL" POTCAR',
    '',
    'Order matters',
    '  MAGMOM, LDAUL, LDAUU and LDAUJ values follow the species order in POSCAR.',
    poscarReordered
      ? '  The sites were regrouped by species when writing POSCAR; MAGMOM follows the NEW order.'
      : '',
    '',
    'Run',
    `  ${submitCommand(b.job.scheduler, 'job.sh')}`,
    '',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');
}

/** All files of the download. Never contains a file named POTCAR. */
export function buildFiles(b: BuildInput): BuiltFile[] {
  const pos = writePoscar(b.structure);
  const files: BuiltFile[] = [
    { name: 'INCAR', text: writeIncar(b.entries) },
    ...(b.kpoints ? [{ name: 'KPOINTS', text: b.kpoints }] : []),
    { name: 'POSCAR', text: pos.text },
    { name: 'job.sh', text: jobScript(b.job) },
    { name: 'README.txt', text: readme(b, pos.reordered) },
  ];
  return files;
}
