import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePoscar } from '../../../lib/crystal/poscar';
import { buildOutputs } from '../../../lib/magnetism/export';
import {
  DEFAULT_CONVENTION,
  shellCoefficients,
  type HeisenbergConvention,
} from '../../../lib/magnetism/heisenberg';
import { BOLTZMANN_EV_K } from '../../../lib/physics/constants';
import { analyseAll, readRunFile } from './analyseModel';
import { buildNamed, EXAMPLE_POSCAR } from './magneticModel';

const gold = (n: string) => readFileSync(`tests/reference/vasp-outputs/${n}`, 'utf8');
const expected = JSON.parse(gold('expected.json')) as {
  OSZICAR_relax_spin: { ionic_steps: { F: number; E0: number; mag: number }[] };
  OUTCAR_mag_spd: { magnetization: { tot: number }[]; total_mag: number };
};

describe('readRunFile on the golden files', () => {
  it('reads F, E0 and mag of the last OSZICAR step', () => {
    const r = readRunFile('OSZICAR', gold('OSZICAR_relax_spin'));
    const last = expected.OSZICAR_relax_spin.ionic_steps.at(-1)!;
    expect(r.kind).toBe('OSZICAR');
    expect(r.energy.F!.value).toBeCloseTo(last.F, 9);
    expect(r.energy.E0!.value).toBeCloseTo(last.E0, 9);
    expect(r.mag!.value).toBeCloseTo(last.mag, 9);
    expect(r.energy.F!.source).toMatch(/^OSZICAR, line \d+, F$/);
  });
  it('reads the final per-site moments and the cell moment from OUTCAR', () => {
    const r = readRunFile('OUTCAR', gold('OUTCAR_mag_spd'));
    expect(r.kind).toBe('OUTCAR');
    expect(r.sites).toEqual(expected.OUTCAR_mag_spd.magnetization.map((s) => s.tot));
    expect(r.mag!.value).toBeCloseTo(expected.OUTCAR_mag_spd.total_mag, 9);
  });
  it('says when a file is neither', () => {
    expect(readRunFile('notes.txt', 'hello').kind).toBe('unknown');
  });
});

describe('analyseAll', () => {
  const cell = parsePoscar(EXAMPLE_POSCAR).structure;
  const b = buildNamed(cell, ['FM', 'A', 'C', 'G'], 'G', 'auto', ['Mn'], true);
  const outs = buildOutputs(b.batch, { magnitudes: { Mn: 4 } });
  it('ranks typed energies per magnetic ion relative to FM and fits J with the convention attached', () => {
    // Energies made from J1 = 3 meV in the 'plus' convention (J > 0 antiferromagnetic), so G is lowest.
    const PLUS: HeisenbergConvention = { ...DEFAULT_CONVENTION, sign: 'plus' };
    const states = Object.fromEntries(
      outs.map((o) => {
        const c = shellCoefficients(o.config, 1, PLUS);
        const e = (-10 + c.perIon[0]! * 0.003) * c.nMagnetic;
        return [o.folder, { reads: [], typed: String(e) }];
      }),
    );
    const r = analyseAll(outs, states, 'F', 1, PLUS);
    expect(r.ranking.referenceIsFm).toBe(true);
    expect(r.ranking.rows[0]!.label).toBe('G');
    expect(r.ranking.rows.find((x) => x.label === 'FM')!.relative).toBe(0);
    expect(r.fit!.j![0]).toBeCloseTo(0.003, 9);
    expect(r.fit!.conventionText).toMatch(/antiferromagnetic/);
    expect(r.curie).toBeUndefined();
    expect(r.curieNote).toMatch(/not the lowest/);
    expect(r.runs.every((x) => x.energy!.source === 'typed by you')).toBe(true);
  });
  it('gives the Heuristic mean-field T_C when FM is lowest (default convention, J1 = 3 meV ferromagnetic)', () => {
    const states = Object.fromEntries(
      outs.map((o) => {
        const c = shellCoefficients(o.config, 1, DEFAULT_CONVENTION);
        return [o.folder, { reads: [], typed: String((-10 + c.perIon[0]! * 0.003) * c.nMagnetic) }];
      }),
    );
    const r = analyseAll(outs, states, 'F', 1, DEFAULT_CONVENTION);
    expect(r.ranking.rows[0]!.label).toBe('FM');
    const fm = outs.find((o) => o.config.kind === 'FM')!;
    const z = shellCoefficients(fm.config, 1, { ...DEFAULT_CONVENTION, pairs: 'twice' }).perIon[0]!; // -z
    expect(r.curie!.kelvin).toBeCloseTo((-z * 0.003) / 3 / BOLTZMANN_EV_K, 6); // k_B T_C = z J / 3
  });
  it('flags a file with the wrong number of sites against the intended MAGMOM', () => {
    const r = analyseAll(
      outs,
      { FM: { reads: [readRunFile('OUTCAR', gold('OUTCAR_mag_spd'))], typed: '' } },
      'F',
      1,
      DEFAULT_CONVENTION,
    );
    const fm = r.runs.find((x) => x.folder === 'FM')!;
    expect(fm.pattern!.kept).toBe(false);
    expect(fm.pattern!.warnings[0]).toMatch(/do not belong/);
  });
});
