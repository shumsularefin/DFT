#!/usr/bin/env node
// Guard: validates src/data/recipes.json against docs/SCIENCE_SOURCES.md,
// src/data/incar-presets.json, and src/data/errors.json (M14.2).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
function parseRegistryIds(md) {
  const ids = new Set();
  for (const m of md.matchAll(/^\|\s*(S-\d{3})\s*\|/gm)) ids.add(m[1]);
  return ids;
}

export function checkRecipes(root = process.cwd()) {
  const problems = [];
  const recipesPath = resolve(root, 'src/data/recipes.json');
  const presetsPath = resolve(root, 'src/data/incar-presets.json');
  const errorsPath = resolve(root, 'src/data/errors.json');
  const sourcesPath = resolve(root, 'docs/SCIENCE_SOURCES.md');

  let data;
  try {
    data = JSON.parse(readFileSync(recipesPath, 'utf8'));
  } catch (e) {
    return { name: 'recipes', ok: false, problems: [`cannot parse recipes.json: ${e.message}`] };
  }

  const presetIds = new Set(
    JSON.parse(readFileSync(presetsPath, 'utf8')).presets.map((p) => p.id),
  );
  const errorIds = new Set(
    JSON.parse(readFileSync(errorsPath, 'utf8')).entries.map((e) => e.id),
  );
  const sourceIds = parseRegistryIds(readFileSync(sourcesPath, 'utf8'));

  if (!Array.isArray(data.recipes) || data.recipes.length === 0) {
    problems.push('recipes.json must contain a non-empty recipes array');
  }

  for (const r of data.recipes ?? []) {
    if (!Array.isArray(r.sources) || r.sources.length === 0) {
      problems.push(`recipe "${r.id}" has no sources`);
    } else {
      for (const s of r.sources) {
        if (!sourceIds.has(s)) problems.push(`recipe "${r.id}" references unregistered source ${s}`);
      }
    }
    if (!Array.isArray(r.steps) || r.steps.length === 0) {
      problems.push(`recipe "${r.id}" has no steps`);
      continue;
    }
    for (const step of r.steps) {
      if (!Array.isArray(step.sources) || step.sources.length === 0) {
        problems.push(`recipe "${r.id}" step "${step.id}" has no sources`);
      } else {
        for (const s of step.sources) {
          if (!sourceIds.has(s)) {
            problems.push(`recipe "${r.id}" step "${step.id}" references unregistered source ${s}`);
          }
        }
      }
      if (!presetIds.has(step.preset)) {
        problems.push(`recipe "${r.id}" step "${step.id}" references unknown preset "${step.preset}"`);
      }
      for (const p of step.pitfalls ?? []) {
        if (!errorIds.has(p)) {
          problems.push(`recipe "${r.id}" step "${step.id}" references unknown pitfall "${p}"`);
        }
      }
    }
  }

  return { name: 'recipes', ok: problems.length === 0, problems };
}

export default checkRecipes;
