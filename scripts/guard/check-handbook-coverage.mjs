#!/usr/bin/env node
// Warn-only (M15.9): lists the sections of the author's two handbooks (S-041, S-042) and reports any
// section that no page on the site covers. A section counts as covered when the map below names at least
// one site file for it and that file exists. Always exits 0; read the output.
// Usage: node scripts/guard/check-handbook-coverage.mjs
import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const H = 'src/content/handbook/';

/** Section id in the source -> site files that cover it. */
const COVERAGE = {
  // S-041, VASP Field Handbook (sections are built by section("id", "title", ...) calls)
  'S-041#quick': ['src/pages/reference/where-to-read.astro'],
  'S-041#workflow': [`${H}07-running/the-workflow.mdx`],
  'S-041#outputs': [`${H}06-vasp-files/output-files.mdx`, `${H}07-running/reading-oszicar-and-outcar.mdx`],
  'S-041#inputs': [`${H}06-vasp-files/incar.mdx`, `${H}06-vasp-files/poscar.mdx`, `${H}06-vasp-files/kpoints.mdx`],
  'S-041#tags': ['src/pages/builder/index.astro', 'src/data/vasp-tags.json'],
  'S-041#trouble': [`${H}08-convergence-and-errors/scf-trouble.mdx`, 'src/pages/errors.astro'],
  'S-041#recipes': ['src/data/recipes.json', 'src/pages/tools/planner.astro'],
  // The corrections are folded into the tag data, overriding the originals (D-018, D-036).
  'S-041#corrections': ['src/data/vasp-tags.json'],
  // S-042, VASP Workflow Handbook (<section id="...">)
  'S-042#map': [`${H}07-running/the-workflow.mdx`],
  'S-042#yours': [`${H}07-running/the-workflow.mdx`],
  'S-042#files': [`${H}06-vasp-files/output-files.mdx`],
  'S-042#restart': [`${H}07-running/restarts-istart-icharg.mdx`],
  'S-042#vaspkit': [`${H}07-running/vaspkit-in-practice.mdx`],
  'S-042#dict': ['src/data/vasp-tags.json', 'src/pages/builder/index.astro'],
  'S-042#converge': [`${H}08-convergence-and-errors/encut-convergence.mdx`, `${H}08-convergence-and-errors/kpoint-convergence.mdx`],
  'S-042#relax': [`${H}09-analysis/relaxations.mdx`, `${H}08-convergence-and-errors/relaxation-trouble.mdx`],
  'S-042#scf': [`${H}07-running/the-workflow.mdx`],
  'S-042#dos': [`${H}09-analysis/density-of-states.mdx`],
  'S-042#band': [`${H}09-analysis/band-structures.mdx`],
  'S-042#optics': [`${H}12-properties/optical-properties.mdx`],
  'S-042#elastic': [`${H}12-properties/elastic-constants.mdx`],
  'S-042#eos': [`${H}12-properties/equation-of-state.mdx`, 'src/pages/tools/eos.astro'],
  'S-042#phonon': [`${H}12-properties/phonons.mdx`],
  'S-042#bec': [`${H}12-properties/dielectric-tensor.mdx`],
  'S-042#bader': [`${H}12-properties/bader-charges.mdx`],
  'S-042#magnetic': [`${H}05-practical-choices/finding-the-magnetic-ground-state.mdx`, 'src/pages/tools/magnetic.astro'],
  'S-042#dftu': [`${H}05-practical-choices/dft-plus-u.mdx`],
  'S-042#metagga': [`${H}05-practical-choices/functionals.mdx`],
  'S-042#hybrid': [`${H}05-practical-choices/functionals.mdx`],
  'S-042#more': [`${H}12-properties/other-calculations.mdx`],
  'S-042#trouble': [`${H}08-convergence-and-errors/scf-trouble.mdx`, `${H}08-convergence-and-errors/relaxation-trouble.mdx`],
  'S-042#errors': [`${H}08-convergence-and-errors/common-errors.mdx`, 'src/pages/errors.astro'],
  'S-042#units': ['src/pages/reference/units.astro'],
  'S-042#checklist': ['src/pages/reference/checklist.astro'],
};

export function sourceSections() {
  const field = readFileSync(resolve(root, 'docs/source-material/VASP_Field_Handbook.html'), 'utf8');
  const work = readFileSync(resolve(root, 'docs/source-material/VASP_Workflow_Handbook.html'), 'utf8');
  const out = [];
  for (const m of field.matchAll(/section\("([a-z0-9-]+)","([^"]+)"/g)) out.push({ key: `S-041#${m[1]}`, title: m[2] });
  for (const m of work.matchAll(/<section id="([a-z0-9-]+)"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/g))
    out.push({ key: `S-042#${m[1]}`, title: m[2].replace(/<[^>]+>/g, '').trim() });
  return out;
}

export function checkCoverage() {
  const sections = sourceSections();
  const uncovered = [];
  for (const s of sections) {
    const files = COVERAGE[s.key] ?? [];
    const present = files.filter((f) => existsSync(resolve(root, f)));
    if (present.length === 0) uncovered.push(`${s.key} "${s.title}"${files.length ? ` (mapped files missing: ${files.join(', ')})` : ''}`);
  }
  const keys = new Set(sections.map((s) => s.key));
  const stale = Object.keys(COVERAGE).filter((k) => !keys.has(k));
  return { sections: sections.length, uncovered, stale };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const { sections, uncovered, stale } = checkCoverage();
  console.log(`handbook coverage: ${sections} sections in S-041 and S-042, ${uncovered.length} uncovered`);
  for (const u of uncovered) console.log(`  WARN uncovered: ${u}`);
  for (const k of stale) console.log(`  WARN map entry with no source section: ${k}`);
}
