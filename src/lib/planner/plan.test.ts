import { describe, expect, it } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { RECIPES, buildPlanZip, buildStepIncar } from './plan';
import { parseIncar } from '../vasp/incar';
import { validate } from '../vasp/validate';

describe('research planner (M14.2)', () => {
  it('includes all 11 planned research goals', () => {
    const ids = RECIPES.map((r) => r.id);
    expect(ids).toEqual([
      'lattice-constant',
      'relaxed-structure',
      'band-structure',
      'dos-pdos',
      'magnetic-ground-state',
      'surface-energy',
      'vacancy-formation',
      'formation-energy',
      'elastic-constants',
      'phonons-at-gamma',
      'optics',
    ]);
  });

  it('produces M3.4 validator-clean INCARs for every step of every recipe', () => {
    for (const recipe of RECIPES) {
      for (const step of recipe.steps) {
        const { text } = buildStepIncar(step, 400);
        const parsed = parseIncar(text);
        const findings = validate({
          incar: parsed.entries,
        });
        const errors = findings.filter((f) => f.severity === 'error');
        expect(errors, `${recipe.id}/${step.id} had errors: ${JSON.stringify(errors)}`).toHaveLength(0);
      }
    }
  });

  it('packs a valid zip with PLAN.md, run_all.sh, and per-step folders', () => {
    const recipe = RECIPES.find((r) => r.id === 'relaxed-structure')!;
    const bytes = buildPlanZip(recipe, null, 400);
    const unzipped = unzipSync(bytes);
    expect(Object.keys(unzipped)).toContain('PLAN.md');
    expect(Object.keys(unzipped)).toContain('run_all.sh');
    expect(Object.keys(unzipped)).toContain('01-relax/INCAR');
    expect(Object.keys(unzipped)).toContain('02-static/INCAR');
    expect(strFromU8(unzipped['run_all.sh']!)).toContain('cp "01-relax/CONTCAR" "02-static/POSCAR"');
  });
});
