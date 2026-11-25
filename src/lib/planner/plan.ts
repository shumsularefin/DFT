// Research planner workflow builder and zip packager (M14.2).
// @source S-041 S-042
import { strToU8, zipSync } from 'fflate';
import presetsRaw from '../../data/incar-presets.json';
import recipesRaw from '../../data/recipes.json';
import type { Structure } from '../crystal/types';
import { writePoscar } from '../crystal/poscar';
import { entriesFromPreset, type Preset } from '../vasp/builder';
import { writeIncar, type IncarEntry } from '../vasp/incar';

export interface RecipeStep {
  id: string;
  title: string;
  preset: string;
  prerequisites: string[];
  carries: string[];
  checks: string[];
  whyStep: string;
  whyValues: string;
  ifSkipped: string;
  report: string[];
  pitfalls: string[];
  sources: string[];
}

export interface Recipe {
  id: string;
  title: string;
  summary: string;
  calculator?: 'surface' | 'formation' | 'formula-unit';
  sources: string[];
  steps: RecipeStep[];
}

export const RECIPES: readonly Recipe[] = (recipesRaw as { recipes: Recipe[] }).recipes;
const PRESET_MAP = new Map<string, Preset>(
  (presetsRaw as { presets: Preset[] }).presets.map((p) => [p.id, p]),
);

/**
 * Generates a clean, validator-passing INCAR for a recipe step using the Input Builder preset.
 * Any unfilled angle-bracket placeholders (such as MAGMOM or LDAU arrays) are commented out as
 * notes rather than invalid tag values so the emitted INCAR passes M3.4 validation cleanly.
 */
export function buildStepIncar(
  step: RecipeStep,
  enmax = 400,
): {
  entries: IncarEntry[];
  text: string;
} {
  const preset = PRESET_MAP.get(step.preset);
  if (!preset) throw new Error(`Unknown preset "${step.preset}" in step "${step.id}"`);
  const variant = preset.variants[0]!;
  const raw = entriesFromPreset(preset, variant.id, { enmax });
  const entries: IncarEntry[] = [];
  const notes: string[] = [];

  for (const e of raw) {
    if (e.value.includes('<')) {
      notes.push(`# Set ${e.name} for your structure (template placeholder: ${e.value})`);
    } else {
      entries.push(e);
    }
  }
  const hasEncut = entries.some((e) => e.name.toUpperCase() === 'ENCUT');
  if (!hasEncut) {
    entries.unshift({
      name: 'ENCUT',
      value: String(Math.round(enmax * 1.3)),
      comment: '1.3 x ENMAX starting cutoff (S-042)',
    });
  }
  const header = [
    `# Step: ${step.id} - ${step.title}`,
    `# Preset: ${step.preset} | Sources: ${step.sources.join(', ')}`,
    ...notes,
  ].join('\n');
  return { entries, text: `${header}\n${writeIncar(entries)}` };
}

export function buildPlanMarkdown(recipe: Recipe, enmax = 400): string {
  const lines: string[] = [
    `# Research Plan: ${recipe.title}`,
    '',
    recipe.summary,
    '',
    `- Sources: ${recipe.sources.join(', ')}`,
    `- Starting ENMAX reference: ${enmax} eV (ENCUT = ${Math.round(enmax * 1.3)} eV)`,
    '- Note: This plan is a starting protocol, not a guarantee. Functional, U values, and magnetic orderings must be justified for your system.',
    '',
  ];

  recipe.steps.forEach((step, idx) => {
    lines.push(`## Step ${idx + 1}: ${step.title} (\`${step.id}\`)`);
    lines.push(`- Preset: \`${step.preset}\` | Sources: ${step.sources.join(', ')}`);
    lines.push(`- Why this step: ${step.whyStep}`);
    lines.push(`- Why these values: ${step.whyValues}`);
    lines.push(`- If skipped: ${step.ifSkipped}`);
    if (step.carries.length > 0) {
      lines.push(`- Carries forward: ${step.carries.join(', ')}`);
    }
    lines.push('- Checks:');
    for (const c of step.checks) lines.push(`  - [ ] ${c}`);
    lines.push('- Methods checklist (what to report):');
    for (const r of step.report) lines.push(`  - [ ] ${r}`);
    if (step.pitfalls.length > 0) {
      lines.push(`- Common pitfalls (Error Finder): ${step.pitfalls.join(', ')}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

export function buildRunScript(recipe: Recipe): string {
  const lines = [
    '#!/usr/bin/env bash',
    'set -euo pipefail',
    `# Starter sequential runner for: ${recipe.title}`,
    '# Place your licensed POTCAR in each step folder (or link it) before submitting.',
    '',
  ];
  let prevDir: string | null = null;
  let prevCarries: string[] = [];

  for (const step of recipe.steps) {
    lines.push(`echo "=== Step: ${step.id} (${step.title}) ==="`);
    if (prevDir && prevCarries.length > 0) {
      for (const f of prevCarries) {
        const dest = f === 'CONTCAR' ? 'POSCAR' : f;
        lines.push(`cp "${prevDir}/${f}" "${step.id}/${dest}"`);
      }
    }
    lines.push(`(cd "${step.id}" && mpirun vasp_std)`);
    lines.push('');
    prevDir = step.id;
    prevCarries = step.carries;
  }
  return lines.join('\n');
}

export function buildPlanZip(recipe: Recipe, structure: Structure | null, enmax = 400): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  files['PLAN.md'] = strToU8(buildPlanMarkdown(recipe, enmax));
  files['run_all.sh'] = strToU8(buildRunScript(recipe));
  const poscarText = structure ? writePoscar(structure).text : null;

  for (const step of recipe.steps) {
    const incar = buildStepIncar(step, enmax);
    files[`${step.id}/INCAR`] = strToU8(incar.text);
    if (poscarText) {
      files[`${step.id}/POSCAR`] = strToU8(poscarText);
    }
    files[`${step.id}/README.txt`] = strToU8(
      `${step.title}\nPreset: ${step.preset}\nSources: ${step.sources.join(', ')}\nChecks:\n- ${step.checks.join('\n- ')}\n`,
    );
  }
  return zipSync(files, { level: 6 });
}
