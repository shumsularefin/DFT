// Input Builder state (zustand) and pure selectors. No logic lives in the components: they call these.
import { create } from 'zustand';
import presetsFile from '../../../data/incar-presets.json';
import { parsePoscar } from '../../../lib/crystal/poscar';
import { ParseError } from '../../../lib/crystal/errors';
import type { Structure } from '../../../lib/crystal/types';
import {
  entriesFromPreset,
  ldauFromSpecies,
  magmomFromSpecies,
  removeEntry,
  suggestEncut,
  unfilled,
  upsert,
  decodeShare,
  encodeShare,
  SHARE_STRUCTURE_LIMIT,
  type LdauRow,
  type Preset,
  type ShareState,
} from '../../../lib/vasp/builder';
import { DEFAULT_JOB, type JobOptions } from '../../../lib/vasp/jobscript';
import type { IncarEntry } from '../../../lib/vasp/incar';
import {
  meshFromKspacing,
  parseKpoints,
  recommendCentering,
  writeMeshKpoints,
  type ParsedKpoints,
  type RoundingRule,
} from '../../../lib/vasp/kpoints';
import { validate, type Issue, type SystemType, type VaspVersion } from '../../../lib/vasp/validate';

export const PRESETS = presetsFile.presets as Preset[];
export const MAX_POSCAR_BYTES = 25 * 1024 * 1024;
export type KpMode = ShareState['kpMode'];
export const STEPS = ['Structure', 'Task', 'Settings', 'Check', 'K-points', 'Job script'] as const;

export interface BuilderState {
  step: number;
  poscarText: string;
  structure: Structure | null;
  parseError: string | null;
  parseWarnings: string[];
  presetId: string;
  variantId: string;
  systemType: SystemType;
  enmax: string;
  relaxEncut: string;
  zval: Record<string, string>;
  version: VaspVersion;
  entries: IncarEntry[];
  magmom: Record<string, string>;
  ldau: Record<string, LdauRow>;
  kpMode: KpMode;
  spacing: number;
  rule: RoundingRule;
  job: JobOptions;
  ack: boolean;
  selectedTag: string | null;
}

export interface BuilderActions {
  setStep: (n: number) => void;
  loadPoscar: (text: string) => void;
  setStructure: (s: Structure, label?: string) => void;
  choosePreset: (presetId: string, variantId?: string) => void;
  resetToPreset: () => void;
  set: <K extends keyof BuilderState>(k: K, v: BuilderState[K]) => void;
  setEntry: (name: string, value: string) => void;
  removeTag: (name: string) => void;
  setEntries: (e: IncarEntry[]) => void;
  applyMagmom: () => void;
  applyLdau: () => void;
  setKpMode: (m: KpMode) => void;
  applyShare: (fragment: string) => boolean;
}

const initial = (): BuilderState => ({
  step: 0,
  poscarText: '',
  structure: null,
  parseError: null,
  parseWarnings: [],
  presetId: 'relax',
  variantId: 'default',
  systemType: 'unknown',
  enmax: '',
  relaxEncut: '',
  zval: {},
  version: '6.4',
  entries: entriesFromPreset(
    PRESETS.find((p) => p.id === 'relax')!,
    'default',
  ),
  magmom: {},
  ldau: {},
  kpMode: 'gamma',
  spacing: 0.3,
  rule: 'ceil',
  job: DEFAULT_JOB,
  ack: false,
  selectedTag: null,
});

export const presetOf = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[0]!;
const numOf = (s: string): number | undefined => {
  const x = Number(s);
  return s.trim() !== '' && Number.isFinite(x) && x > 0 ? x : undefined;
};

export const useBuilder = create<BuilderState & BuilderActions>((set, get) => {
  const presetEntries = (presetId: string, variantId: string, s = get()) =>
    entriesFromPreset(presetOf(presetId), variantId, {
      ...(numOf(s.enmax) !== undefined ? { enmax: numOf(s.enmax)! } : {}),
      ...(numOf(s.relaxEncut) !== undefined ? { relaxEncut: numOf(s.relaxEncut)! } : {}),
    });
  return {
    ...initial(),
    setStep: (n) => set({ step: Math.max(0, Math.min(STEPS.length - 1, n)) }),
    loadPoscar: (text) => {
      if (text.length > MAX_POSCAR_BYTES) {
        set({
          parseError: 'This file is larger than 25 MB, which is more than the builder accepts.',
          structure: null,
        });
        return;
      }
      try {
        const r = parsePoscar(text);
        set({
          poscarText: text,
          structure: r.structure,
          parseError: null,
          parseWarnings: r.warnings,
          magmom: {},
          ldau: {},
        });
      } catch (e) {
        const msg =
          e instanceof ParseError
            ? `${e.message}${e.line ? ` (line ${e.line})` : ''}`
            : 'This text is not a POSCAR.';
        set({ poscarText: text, structure: null, parseError: msg, parseWarnings: [] });
      }
    },
    setStructure: (s) => set({ structure: s, parseError: null, parseWarnings: [], magmom: {}, ldau: {} }),
    choosePreset: (presetId, variantId) => {
      const p = presetOf(presetId);
      const v = variantId ?? p.variants[0]!.id;
      set({ presetId: p.id, variantId: v, entries: presetEntries(p.id, v), ack: false });
    },
    resetToPreset: () => {
      const s = get();
      set({ entries: presetEntries(s.presetId, s.variantId), ack: false });
    },
    set: (k, v) => set({ [k]: v } as Pick<BuilderState, typeof k>),
    setEntry: (name, value) => set((s) => ({ entries: upsert(s.entries, name, value), ack: false })),
    removeTag: (name) => set((s) => ({ entries: removeEntry(s.entries, name), ack: false })),
    setEntries: (e) => set({ entries: e, ack: false }),
    applyMagmom: () => {
      const { structure, magmom } = get();
      const v = structure ? magmomFromSpecies(structure, magmom) : null;
      if (v) set((s) => ({ entries: upsert(s.entries, 'MAGMOM', v), ack: false }));
    },
    applyLdau: () => {
      const { structure, ldau } = get();
      const v = structure ? ldauFromSpecies(structure, ldau) : null;
      if (!v) return;
      set((s) => ({
        entries: upsert(upsert(upsert(s.entries, 'LDAUL', v.LDAUL), 'LDAUU', v.LDAUU), 'LDAUJ', v.LDAUJ),
        ack: false,
      }));
    },
    setKpMode: (m) =>
      set((s) => {
        let entries = s.entries;
        if (m === 'kspacing') entries = upsert(entries, 'KSPACING', String(s.spacing));
        else entries = removeEntry(entries, 'KSPACING');
        return { kpMode: m, entries, ack: false };
      }),
    applyShare: (fragment) => {
      const d = decodeShare(fragment);
      if (!d || !PRESETS.some((p) => p.id === d.preset)) return false;
      const p = presetOf(d.preset);
      set({
        presetId: p.id,
        variantId: p.variants.some((v) => v.id === d.variant) ? d.variant : p.variants[0]!.id,
        systemType: d.systemType,
        enmax: d.enmax !== undefined ? String(d.enmax) : '',
        version: d.version ?? '6.4',
        entries: d.entries.map(([name, value]) => ({ name, value })),
        kpMode: d.kpMode,
        spacing: d.spacing,
        ack: false,
      });
      if (d.poscar) get().loadPoscar(d.poscar);
      return true;
    },
  };
});

// ---- selectors (pure functions of the state) --------------------------------------------------------------------

export const encutSuggestion = (s: BuilderState) => {
  const enmax = numOf(s.enmax);
  return enmax ? suggestEncut(s.presetId, enmax, numOf(s.relaxEncut)) : null;
};

export function kpointsOf(s: BuilderState): {
  text: string | null;
  parsed: ParsedKpoints | null;
  mesh: readonly [number, number, number] | null;
  rule: RoundingRule;
} {
  if (s.kpMode === 'line') {
    return {
      text: null,
      parsed: { kind: 'line', coords: 'reciprocal', pointsPerSegment: 0, segments: [], comment: '' },
      mesh: null,
      rule: s.rule,
    };
  }
  if (!s.structure) return { text: null, parsed: null, mesh: null, rule: s.rule };
  const r = meshFromKspacing(s.structure.lattice, s.spacing, s.rule);
  if (s.kpMode === 'kspacing') return { text: null, parsed: null, mesh: r.mesh, rule: r.rule };
  const text = writeMeshKpoints(
    r.mesh,
    s.kpMode,
    [0, 0, 0],
    `Mesh from KSPACING ${s.spacing} (rule ${r.rule})`,
  );
  return { text, parsed: parseKpoints(text), mesh: r.mesh, rule: r.rule };
}

export const centeringOf = (s: BuilderState) => (s.structure ? recommendCentering(s.structure) : null);

export function issuesOf(s: BuilderState): Issue[] {
  const kp = kpointsOf(s);
  const zval: Record<string, number> = {};
  for (const [k, v] of Object.entries(s.zval)) if (numOf(v) !== undefined) zval[k] = numOf(v)!;
  const cores = s.job.nodes * s.job.tasksPerNode;
  return validate({
    incar: s.entries,
    ...(kp.parsed ? { kpoints: kp.parsed } : {}),
    ...(s.structure ? { structure: s.structure } : {}),
    ...(numOf(s.enmax) !== undefined ? { enmaxEv: numOf(s.enmax)! } : {}),
    ...(Object.keys(zval).length ? { zvalBySpecies: zval } : {}),
    systemType: s.systemType,
    ...(cores > 0 ? { cores } : {}),
    vaspVersion: s.version,
    ...(s.presetId === 'band' && s.variantId === 'route-a' && s.kpMode === 'line'
      ? { kpointsIsOpt: true }
      : {}),
  });
}

export const countsOf = (issues: readonly Issue[]) => ({
  error: issues.filter((i) => i.severity === 'error').length,
  warn: issues.filter((i) => i.severity === 'warn').length,
  info: issues.filter((i) => i.severity === 'info').length,
});

/** True when the download is allowed: no errors and no unfilled placeholders, or the user accepted the risk. */
export function canDownload(s: BuilderState, issues: readonly Issue[]): boolean {
  const blocked = countsOf(issues).error > 0 || unfilled(s.entries).length > 0 || !s.structure;
  return !blocked || (s.ack && !!s.structure);
}

export function shareOf(s: BuilderState): string {
  return encodeShare({
    preset: s.presetId,
    variant: s.variantId,
    systemType: s.systemType,
    ...(numOf(s.enmax) !== undefined ? { enmax: numOf(s.enmax)! } : {}),
    version: s.version,
    entries: s.entries.map((e) => [e.name, e.value]),
    kpMode: s.kpMode,
    spacing: s.spacing,
    ...(s.poscarText && s.poscarText.length <= SHARE_STRUCTURE_LIMIT ? { poscar: s.poscarText } : {}),
  });
}
