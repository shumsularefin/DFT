// V022, V032: number of bands.
// @source S-042
import { speciesCounts } from '../../crystal/structure';
import { expandRepeats } from '../incar';
import { isNoncollinear } from './helpers';
import type { Hit, Rule } from './types';

export const bandRules: Rule[] = [
  {
    id: 'V022',
    title: 'Optical run is not set up for good spectra',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:protocol#step-5',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (v.bool('LOPTICS') !== true) return [];
      const problems: string[] = [];
      if (!v.has('NBANDS'))
        problems.push('NBANDS is not set (optics needs about 2 to 3 times the default number of bands)');
      if ((v.num('EDIFF') ?? 1e-4) > 1e-6) problems.push('EDIFF is looser than 1E-6');
      if ((v.num('NEDOS') ?? 301) < 2000) problems.push('NEDOS is below 2000');
      if (problems.length === 0) return [];
      return [
        {
          why: `Optical spectra need empty bands, a tight SCF and a fine energy grid: ${problems.join('; ')}.`,
        },
      ];
    },
  },
  {
    id: 'V032',
    title: 'NBANDS is too small for the electrons',
    severity: 'error',
    source: ['S-042'],
    handbook: 'workflow:dictionary#NBANDS',
    vasp: 'all versions',
    check: (ctx, v) => {
      const nb = v.num('NBANDS');
      if (nb === undefined || !ctx.structure || !ctx.zvalBySpecies) return [];
      let nelect = 0;
      for (const { symbol, count } of speciesCounts(ctx.structure)) {
        const z = ctx.zvalBySpecies[symbol];
        if (z === undefined) return [];
        nelect += z * count;
      }
      const out: Hit[] = [];
      const nc = isNoncollinear(v);
      const minOcc = nc ? nelect : Math.ceil(nelect / 2);
      if (nb < minOcc) {
        out.push({
          why: `${nelect} valence electrons need at least ${minOcc} bands, but NBANDS = ${nb}. Some occupied states have no room.`,
        });
        return out;
      }
      if (v.num('ISPIN') === 2 && !nc && v.has('MAGMOM')) {
        let sum: number;
        try {
          sum = expandRepeats(v.raw('MAGMOM')!).reduce((a, b) => a + b, 0);
        } catch {
          return out;
        }
        const need = Math.ceil((nelect + Math.abs(sum)) / 2);
        if (nb < need)
          out.push({
            severity: 'warn',
            why: `With a total starting moment of ${sum}, the majority-spin channel needs about ${need} bands, but NBANDS = ${nb}.`,
          });
      }
      return out;
    },
  },
];
