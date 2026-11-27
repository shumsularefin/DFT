// V034, V035: slab settings the Material Builder checked before D-108 moved its INCAR and KPOINTS steps here.
// V042, V043: selective dynamics (D-110, Q-071).
// @source S-041, S-042, S-066
// @source S-019 (VASP wiki POSCAR, oldid 37632: the T/F flags decide which coordinates may change during a
//   relaxation or MD; IBRION, oldid 37190: IBRION = -1, the default for NSW = 0, does not move the ions)
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
  {
    id: 'V042',
    title: 'Selective-dynamics flags that cannot take effect',
    severity: 'info',
    source: ['S-019'],
    vasp: 'all versions',
    check: (ctx, v) => {
      const sel = ctx.structure?.selective;
      if (!sel || sel.length === 0) return [];
      const nsw = v.num('NSW') ?? 0;
      if (nsw <= 0 || v.num('IBRION') === -1)
        return [
          {
            why: `The POSCAR fixes coordinates with Selective dynamics, but ${nsw <= 0 ? `NSW = ${nsw}${v.has('NSW') ? '' : ' (the default)'}` : 'IBRION = -1'} means the ions never move, so the T and F flags change nothing. They only act in a relaxation or molecular dynamics.`,
          },
        ];
      if (sel.every((f) => !f[0] && !f[1] && !f[2]))
        return [
          {
            severity: 'warn',
            why: 'Every coordinate in the POSCAR is flagged F, so the relaxation has nothing to move and stops at the starting structure. Mark the atoms that should relax with T.',
          },
        ];
      return [];
    },
  },
  {
    id: 'V043',
    title: 'Slab relaxation with every atom free',
    severity: 'info',
    source: ['S-042', 'S-019'],
    vasp: 'all versions',
    check: (ctx, v) => {
      if (ctx.systemType !== 'slab' || !ctx.structure) return [];
      const ib = v.num('IBRION');
      if ((v.num('NSW') ?? 0) <= 0 || ib === undefined || ib < 1 || ib > 3) return [];
      const sel = ctx.structure.selective;
      if (sel && sel.some((f) => !f[0] || !f[1] || !f[2])) return [];
      return [
        {
          why: 'Every atom of this slab may move. The handbook fixes the bottom layers of a slab with Selective dynamics (F F F) and relaxes the rest. Leave every atom free only if that is what you intend.',
          whyDetail:
            'Add the line "Selective dynamics" after the atom counts in POSCAR and three T or F flags after each position: T may move, F stays put. The flags refer to direct coordinates. Keep ISIF = 2 so the cell and the vacuum do not change.',
        },
      ];
    },
  },
];
