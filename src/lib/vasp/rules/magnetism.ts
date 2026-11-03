// V001 to V003: MAGMOM and ISPIN.
// @source S-041, S-042
import { numberOfAtoms } from '../../crystal/structure';
import { arrayLength, fixSet, hasD, hasF, isNoncollinear } from './helpers';
import type { Rule } from './types';

export const magnetismRules: Rule[] = [
  {
    id: 'V001',
    title: 'MAGMOM has the wrong number of values',
    severity: 'error',
    source: ['S-041', 'S-042'],
    handbook: 'workflow:dictionary#MAGMOM',
    vasp: 'all versions',
    check: (ctx, v) => {
      if (!ctx.structure) return [];
      const n = arrayLength(v, 'MAGMOM');
      if (n === undefined) return [];
      const atoms = numberOfAtoms(ctx.structure);
      const want = isNoncollinear(v) ? 3 * atoms : atoms;
      if (n === want) return [];
      return [
        {
          why: `MAGMOM gives ${n} value${n === 1 ? '' : 's'} but this run needs ${want}: one ${isNoncollinear(v) ? 'x, y, z triple' : 'number'} per atom, in POSCAR order. A wrong count shifts moments onto the wrong atoms or stops the run.`,
          whyDetail:
            'Repeats such as 4*3.0 count as four values. For spin-orbit or non-collinear runs each atom needs three values.',
        },
      ];
    },
  },
  {
    id: 'V002',
    title: 'MAGMOM is set but spin polarization is off',
    severity: 'warn',
    source: ['S-041'],
    handbook: 'field:ispin',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (!v.has('MAGMOM') || isNoncollinear(v)) return [];
      if ((v.num('ISPIN') ?? 1) === 2) return [];
      return [
        {
          why: 'MAGMOM only matters in a spin-polarized run. With ISPIN = 1 (the default) the starting moments are ignored.',
          fix: fixSet('Set ISPIN = 2', 'ISPIN', '2'),
        },
      ];
    },
  },
  {
    id: 'V003',
    title: 'Spin-polarized run on d or f elements without MAGMOM',
    severity: 'warn',
    source: ['S-041'],
    handbook: 'field:t-moment',
    vasp: 'all versions',
    check: (ctx, v) => {
      if (v.num('ISPIN') !== 2 || v.has('MAGMOM')) return [];
      if (!hasD(ctx) && !hasF(ctx)) return [];
      return [
        {
          why: 'With ISPIN = 2 and no MAGMOM, VASP starts every atom with a small default moment. For d and f elements that start can collapse to zero, so you get a non-magnetic answer by accident.',
          whyDetail:
            'Set MAGMOM with one starting moment per atom, in POSCAR order, for example 4*5.0 8*0.6.',
        },
      ];
    },
  },
];
