// V008, V009, V024, V031: cutoff and real-space projection.
// @source S-041, S-042
import { close, fixSet, fmt } from './helpers';
import type { Rule } from './types';

const finiteDiff = (v: { num: (n: string) => number | undefined }) => {
  const ib = v.num('IBRION');
  return ib !== undefined && ib >= 5 && ib <= 8;
};

export const accuracyRules: Rule[] = [
  {
    id: 'V008',
    title: 'ENCUT is below ENMAX',
    severity: 'warn',
    source: ['S-041'],
    handbook: 'field:encut',
    vasp: 'all versions',
    check: (ctx, v) => {
      const enmax = ctx.enmaxEv;
      const encut = v.num('ENCUT');
      if (enmax === undefined || encut === undefined || encut >= enmax) return [];
      return [
        {
          why: `ENCUT = ${encut} eV is below the POTCAR's ENMAX (${enmax} eV). The basis is smaller than the pseudopotential was made for, so results are not reliable.`,
          fix: fixSet(`Set ENCUT = ${fmt(enmax)}`, 'ENCUT', fmt(enmax)),
        },
      ];
    },
  },
  {
    id: 'V009',
    title: 'ENCUT below 1.3 x ENMAX for a cell relaxation or elastic run',
    severity: 'warn',
    source: ['S-041', 'S-042'],
    handbook: 'field:t-pulay',
    vasp: 'all versions',
    check: (ctx, v) => {
      const enmax = ctx.enmaxEv;
      if (enmax === undefined) return [];
      const cellRelax = (v.num('ISIF') ?? 2) >= 3 || v.num('IBRION') === 6;
      if (!cellRelax) return [];
      const need = 1.3 * enmax;
      const encut = v.num('ENCUT') ?? enmax; // the default is ENMAX
      if (encut >= need || close(encut, need)) return [];
      const target = fmt(Math.round(need * 100) / 100);
      return [
        {
          why: `Stress converges more slowly than energy. With ENCUT = ${fmt(encut)} eV the cell can shrink or drift (Pulay stress). Use at least 1.3 x ENMAX = ${target} eV.`,
          fix: fixSet(`Set ENCUT = ${target}`, 'ENCUT', target),
        },
      ];
    },
  },
  {
    id: 'V024',
    title: 'Real-space projection in a phonon, elastic or dielectric run',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:dictionary#LREAL',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (!finiteDiff(v) && v.bool('LEPSILON') !== true) return [];
      if (v.has('LREAL') && v.bool('LREAL') !== false) {
        return [
          {
            why: `LREAL = ${v.raw('LREAL')} adds small errors in forces. Phonons, elastic constants and dielectric runs need LREAL = .FALSE.`,
            fix: fixSet('Set LREAL = .FALSE.', 'LREAL', '.FALSE.'),
          },
        ];
      }
      return [];
    },
  },
  {
    id: 'V031',
    title: 'LREAL = .FALSE. on a large cell',
    severity: 'info',
    source: ['S-041', 'S-042'],
    handbook: 'field:t-slow',
    vasp: 'all versions',
    check: (ctx, v) => {
      if (!ctx.structure || ctx.structure.species.length <= 20) return [];
      if (finiteDiff(v) || v.bool('LEPSILON') === true) return [];
      if (v.has('LREAL') && v.bool('LREAL') !== false) return [];
      return [
        {
          why: `With ${ctx.structure.species.length} atoms, LREAL = Auto is much faster than the default .FALSE. and usually accurate enough for relaxations. Switch back to .FALSE. for the final energy.`,
          fix: fixSet('Set LREAL = Auto', 'LREAL', 'Auto'),
        },
      ];
    },
  },
];
