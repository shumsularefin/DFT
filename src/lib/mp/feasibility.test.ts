import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildStarterProjectSteps, evaluateFeasibility } from './feasibility';
import { materializeRow, type MpIndex } from './query';
import { validate } from '../vasp/validate';

const sample = JSON.parse(readFileSync('public/data/mp/sample/index.json', 'utf8')) as MpIndex;

describe('M9.3 feasibility rules and starter project builder', () => {
  it('assigns green/yellow/red verdicts, picks the worst rule, and marks PAW unknown when table is absent', () => {
    // SrTiO3 in sample (5 sites, non-metal, non-magnetic, Z <= 54) -> green
    const srIdx = sample.columns.formula_pretty.indexOf('SrTiO3');
    const srtio3 = materializeRow(sample, srIdx);
    const rep = evaluateFeasibility(srtio3, { cores: 16 });
    expect(rep.overall).toBe('green');
    expect(rep.rules.find((r) => r.id === 'F-PAW')?.verdict).toBe('unknown');
    expect(rep.rules.find((r) => r.id === 'F-PAW')?.reason).toContain('unknown');

    // NdCuO3 (20 sites, Nd f-block + Z > 54, magnetic, metal) -> yellow
    const ndIdx = sample.columns.formula_pretty.indexOf('NdCuO3');
    const ndcuo3 = materializeRow(sample, ndIdx);
    const ndRep = evaluateFeasibility(ndcuo3, { cores: 16 });
    expect(ndRep.overall).toBe('yellow');
    expect(ndRep.rules.find((r) => r.id === 'F-FBLOCK')?.verdict).toBe('yellow');
    expect(ndRep.rules.find((r) => r.id === 'F-HEAVY')?.verdict).toBe('yellow');

    // Si12Ge (52 sites > 30) -> red
    const bigIdx = sample.columns.nsites.findIndex((n) => n > 30);
    const bigMat = materializeRow(sample, bigIdx);
    expect(evaluateFeasibility(bigMat).overall).toBe('red');
  });

  it('produces starter INCARs that pass the M3.4 validator with zero errors', () => {
    const srIdx = sample.columns.formula_pretty.indexOf('SrTiO3');
    const srtio3 = materializeRow(sample, srIdx);
    const steps = buildStarterProjectSteps(srtio3, 520);
    expect(steps.length).toBe(3);
    for (const step of steps) {
      const issues = validate({ incar: step.incarEntries });
      const errors = issues.filter((i) => i.severity === 'error');
      expect(errors, step.id).toEqual([]);
    }
  });
});
