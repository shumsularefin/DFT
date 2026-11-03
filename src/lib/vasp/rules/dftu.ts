// V016 to V018: DFT+U and the mixer.
// @source S-042
import { arrayLength, fixSet, hasD, hasF, nSpecies } from './helpers';
import type { Rule } from './types';

export const dftuRules: Rule[] = [
  {
    id: 'V016',
    title: 'LDAUL, LDAUU or LDAUJ has the wrong number of values',
    severity: 'error',
    source: ['S-042'],
    handbook: 'workflow:dictionary#LDAUL',
    vasp: 'all versions',
    check: (ctx, v) => {
      const ns = nSpecies(ctx);
      if (ns === undefined) return [];
      const bad = ['LDAUL', 'LDAUU', 'LDAUJ'].filter((t) => {
        const n = arrayLength(v, t);
        return n !== undefined && n !== ns;
      });
      if (bad.length === 0) return [];
      return [
        {
          why: `${bad.join(', ')} must have one value per species (${ns} here), in POSCAR order. A missing or extra value silently shifts U onto the wrong element.`,
        },
      ];
    },
  },
  {
    id: 'V017',
    title: 'DFT+U without LASPH = .TRUE.',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:dictionary#LASPH',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (v.bool('LDAU') !== true || v.bool('LASPH') === true) return [];
      return [
        {
          why: 'DFT+U needs the non-spherical parts of the density inside the atoms. Set LASPH = .TRUE.',
          fix: fixSet('Set LASPH = .TRUE.', 'LASPH', '.TRUE.'),
        },
      ];
    },
  },
  {
    id: 'V018',
    title: 'LMAXMIX too low for DFT+U or a fixed-density run',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:dictionary#LMAXMIX',
    vasp: 'all versions',
    check: (ctx, v) => {
      if (v.bool('LDAU') !== true && v.num('ICHARG') !== 11) return [];
      const lm = v.num('LMAXMIX') ?? 2; // the dictionary states the default as 2
      const need = hasF(ctx) ? 6 : hasD(ctx) ? 4 : 0;
      if (need === 0 || lm >= need) return [];
      return [
        {
          why: `LMAXMIX = ${lm}${v.has('LMAXMIX') ? '' : ' (the default)'} drops the d${need === 6 ? ' and f' : ''} occupation details when the density is mixed or read. Use ${need} for this system.`,
          fix: fixSet(`Set LMAXMIX = ${need}`, 'LMAXMIX', String(need)),
        },
      ];
    },
  },
];
