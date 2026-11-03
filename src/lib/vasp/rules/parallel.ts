// V013, V033: parallelization tags.
// @source S-042
import { fixRemove, fixSet } from './helpers';
import type { Rule } from './types';

export const parallelRules: Rule[] = [
  {
    id: 'V013',
    title: 'NCORE set in a run that cannot use band parallelization',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:dictionary#NCORE',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (!v.has('NCORE')) return [];
      const ib = v.num('IBRION');
      const clash =
        (ib !== undefined && ib >= 6 && ib <= 8) || v.bool('LEPSILON') === true || v.bool('LELF') === true;
      if (!clash) return [];
      return [
        {
          why: 'Elastic constants (IBRION = 6), IBRION 7 and 8, LEPSILON and LELF do not support NCORE. Comment it out (the handbook INCARs do) or the run can fail.',
          fix: fixRemove('Remove NCORE', 'NCORE'),
        },
      ];
    },
  },
  {
    id: 'V033',
    title: 'KPAR does not divide the number of cores',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:dictionary#KPAR',
    vasp: 'all versions',
    check: (ctx, v) => {
      const kpar = v.num('KPAR');
      if (kpar === undefined || !ctx.cores || kpar < 1) return [];
      if (ctx.cores % kpar === 0) return [];
      return [
        {
          why: `KPAR = ${kpar} does not divide ${ctx.cores} cores, so some cores sit idle. Choose a KPAR that divides the core count.`,
          fix: fixSet('Set KPAR = 1', 'KPAR', '1'),
        },
      ];
    },
  },
];
