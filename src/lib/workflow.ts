// Helpers for the Workflow section (/workflow/, D-110). Pure functions so they can be tested in Node.
// The INCARs shown on the workflow pages are not typed into the pages: they are written from the Input
// Builder presets (src/data/incar-presets.json), which hold the Workflow Handbook's INCARs tag for tag.
// @source S-042 (Workflow Handbook: the INCAR of every calculation and the pre-submit checklist)
import presetsFile from '../data/incar-presets.json';
import type { Preset, PresetVariant } from './vasp/builder';
import { writeIncar } from './vasp/incar';
import { CHECKLIST, type ChecklistRow } from './reference/tables';

const PRESETS = presetsFile.presets as Preset[];

/** The lanes of the Workflow Handbook's workflow map, in the order it runs them. */
export const WORKFLOW_GROUPS = ['Geometry', 'Electronic', 'Lattice and response', 'Beyond PBE'] as const;
export type WorkflowGroup = (typeof WORKFLOW_GROUPS)[number];

/** The preset and variant, or an error naming what is missing (a typo in a page must fail the build). */
export function presetVariant(
  presetId: string,
  variantId?: string,
): { preset: Preset; variant: PresetVariant } {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) throw new Error(`workflow: no Input Builder preset "${presetId}"`);
  const variant = variantId ? preset.variants.find((v) => v.id === variantId) : preset.variants[0];
  if (!variant) throw new Error(`workflow: preset "${presetId}" has no variant "${variantId}"`);
  return { preset, variant };
}

/**
 * The preset's INCAR with the handbook's example values (ENCUT = 520, MAGMOM = 2*5.0 4*0.6, ...) and its
 * comments. The Input Builder shows placeholders instead; the workflow pages show the worked example and
 * say which values to replace.
 */
export function exampleIncar(presetId: string, variantId?: string): string {
  const { variant } = presetVariant(presetId, variantId);
  return writeIncar(
    variant.entries.map((e) => ({
      name: e.name,
      value: e.value,
      ...(e.comment ? { comment: e.comment } : {}),
    })),
  );
}

/** Tags whose example value has to be replaced for your own system (the preset marks them with a placeholder). */
export function valuesToReplace(presetId: string, variantId?: string): string[] {
  return presetVariant(presetId, variantId)
    .variant.entries.filter((e) => e.placeholder)
    .map((e) => e.name);
}

/** Link that opens the Input Builder on this preset and variant (read by InputBuilder.tsx). */
export function inputBuilderHref(presetId: string, variantId?: string): string {
  const { preset, variant } = presetVariant(presetId, variantId);
  return `/tools/input-builder/?preset=${encodeURIComponent(preset.id)}&variant=${encodeURIComponent(variant.id)}`;
}

/** One row of the pre-submit checklist by its calculation name ("Relax", "SCF", ...). */
export function checklistRow(calculation: string): ChecklistRow {
  const row = CHECKLIST.find((r) => r.calculation === calculation);
  if (!row) throw new Error(`workflow: no checklist row "${calculation}"`);
  return row;
}

export interface StepRef {
  id: string;
  title: string;
  /** One of WORKFLOW_GROUPS (the content schema enforces it). */
  group: string;
  order: number;
}

/** Steps sorted by group, then order, then id. */
export function orderSteps<T extends StepRef>(steps: readonly T[]): T[] {
  const g = (s: StepRef) => (WORKFLOW_GROUPS as readonly string[]).indexOf(s.group);
  return [...steps].sort((a, b) => g(a) - g(b) || a.order - b.order || a.id.localeCompare(b.id));
}

/** Previous and next step in the ordered list. */
export function stepNeighbors<T extends StepRef>(
  ordered: readonly T[],
  id: string,
): { prev: T | null; next: T | null } {
  const i = ordered.findIndex((s) => s.id === id);
  if (i < 0) return { prev: null, next: null };
  return { prev: ordered[i - 1] ?? null, next: ordered[i + 1] ?? null };
}
