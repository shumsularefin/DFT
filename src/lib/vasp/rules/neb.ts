// V036 to V041: nudged elastic band runs (D-110, Q-070).
// @source S-019 (VASP wiki, Nudged elastic bands and SPRING, read 2026-11-27)
// @source S-086 (VTST Tools, NEB and force-based optimizers pages, read 2026-11-27)
// @source S-088 (Sheppard, Terrell, Henkelman 2008: NEB needs force-based optimisers)
import { fixSet, setTag } from './helpers';
import type { IncarView, Rule } from './types';

/** A NEB run: IMAGES set to one or more. */
const imagesOf = (v: IncarView): number | undefined => {
  const n = v.num('IMAGES');
  return n !== undefined && Number.isInteger(n) && n >= 1 ? n : undefined;
};
const usesVtstOptimiser = (v: IncarView) => (v.num('IOPT') ?? 0) > 0;

export const nebRules: Rule[] = [
  {
    id: 'V036',
    title: 'NEB with the conjugate-gradient optimiser (IBRION = 2)',
    severity: 'warn',
    source: ['S-019'],
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (imagesOf(v) === undefined || v.num('IBRION') !== 2) return [];
      return [
        {
          why: 'For an elastic band the conjugate-gradient algorithm usually fails to converge. The VASP wiki recommends IBRION = 1 (RMM-DIIS) or IBRION = 3 (quick-min).',
          fix: fixSet('Set IBRION = 1', 'IBRION', '1'),
        },
      ];
    },
  },
  {
    id: 'V037',
    title: 'IOPT without IBRION = 3 and POTIM = 0',
    severity: 'error',
    source: ['S-086'],
    vasp: 'VASP built with VTST',
    check: (_ctx, v) => {
      if (!usesVtstOptimiser(v)) return [];
      if (v.num('IBRION') === 3 && v.num('POTIM') === 0) return [];
      return [
        {
          why: `IOPT = ${v.num('IOPT')} picks a VTST optimiser, but VASP's own optimiser stays on unless IBRION = 3 and POTIM = 0. The two then fight over the ions.`,
          fix: {
            label: 'Set IBRION = 3 and POTIM = 0',
            apply: (incar) => setTag(setTag(incar, 'IBRION', '3'), 'POTIM', '0'),
          },
        },
      ];
    },
  },
  {
    id: 'V038',
    title: 'NEB with an energy criterion instead of a force criterion',
    severity: 'warn',
    source: ['S-086', 'S-088'],
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (imagesOf(v) === undefined) return [];
      const g = v.num('EDIFFG');
      if (g !== undefined && g < 0) return [];
      return [
        {
          why: `${g === undefined ? 'EDIFFG is not set, so VASP stops on an energy change' : `EDIFFG = ${g} stops on an energy change`}. The forces on an elastic band are not the gradient of one energy, so stop on the force instead: EDIFFG = -0.01 to -0.05 eV per angstrom.`,
          fix: fixSet('Set EDIFFG = -0.01', 'EDIFFG', '-0.01'),
          ...(usesVtstOptimiser(v) ? { severity: 'error' as const } : {}),
        },
      ];
    },
  },
  {
    id: 'V039',
    title: 'Core count is not a multiple of IMAGES',
    severity: 'error',
    source: ['S-019'],
    vasp: 'all versions',
    check: (ctx, v) => {
      const n = imagesOf(v);
      if (n === undefined || !ctx.cores || ctx.cores % n === 0) return [];
      return [
        {
          why: `VASP splits the ${ctx.cores} cores evenly over the ${n} images, so the core count must be a multiple of IMAGES. Change the job size or the number of images.`,
        },
      ];
    },
  },
  {
    id: 'V040',
    title: 'NEB that changes the cell',
    severity: 'warn',
    source: ['S-019', 'S-086'],
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (imagesOf(v) === undefined || (v.num('ISIF') ?? 2) <= 2 || v.bool('LNEBCELL') === true) return [];
      return [
        {
          why: `ISIF = ${v.num('ISIF')} lets the cell change, but NEB in VASP keeps the cell fixed and cannot follow a structural transition. Use ISIF = 2 (the solid-state NEB of the VTST code, LNEBCELL, is the exception).`,
          fix: fixSet('Set ISIF = 2', 'ISIF', '2'),
        },
      ];
    },
  },
  {
    id: 'V041',
    title: 'LCLIMB or IOPT needs VASP built with the VTST code',
    severity: 'info',
    source: ['S-086'],
    vasp: 'VASP built with VTST',
    check: (_ctx, v) => {
      if (!v.has('LCLIMB') && !v.has('IOPT')) return [];
      return [
        {
          why: 'The climbing image (LCLIMB) and the IOPT optimisers come from the VTST code, not from standard VASP. A VASP built without VTST ignores them and runs a plain NEB.',
        },
      ];
    },
  },
];
