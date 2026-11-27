// V034, V035: slab settings the Material Builder checked before D-108 moved its INCAR and KPOINTS steps here.
// @source S-041, S-042, S-066
import { setTag } from './helpers';
import type { Rule } from './types';

export const slabRules: Rule[] = [
  {
    id: 'V034',
    title: 'Slab with more than one k-point along the third axis',
    severity: 'warn',
    source: ['S-041', 'S-042'],
    handbook: 'field:t-slab',
    vasp: 'all versions',
    check: (ctx) => {
      if (ctx.systemType !== 'slab') return [];
      const k = ctx.kpoints;
      if (!k || k.kind !== 'mesh' || k.mesh[2] <= 1) return [];
      return [
        {
          why: `This slab has ${k.mesh[2]} k-points along the third lattice vector. A slab needs one k-point along the surface normal, because the vacuum makes that direction non-periodic. Use N1 x N2 x 1.`,
          whyDetail:
            'The check assumes the vacuum lies along the third lattice vector, as the site builds slabs. If your vacuum is along another axis, put the 1 there instead.',
        },
      ];
    },
  },
  {
    id: 'V035',
    title: 'Slab without a dipole correction',
    severity: 'info',
    source: ['S-042', 'S-066'],
    handbook: 'workflow:dictionary#LDIPOL',
    vasp: 'all versions',
    check: (ctx, v) => {
      if (ctx.systemType !== 'slab' || v.bool('LDIPOL') === true) return [];
      return [
        {
          why: 'An asymmetric slab or a slab with an adsorbate has a dipole across the vacuum. The dipole correction (LDIPOL = .TRUE., IDIPOL = 3 along z) removes the artificial field it causes. A symmetric slab does not need it.',
          fix: {
            label: 'Add LDIPOL = .TRUE. and IDIPOL = 3',
            apply: (incar) => setTag(setTag(incar, 'LDIPOL', '.TRUE.'), 'IDIPOL', '3'),
          },
        },
      ];
    },
  },
];
