// V019 to V021, V027, V028, V030: functionals and non-standard builds.
// @source S-042
import { fixRemove, fixSet } from './helpers';
import type { Rule } from './types';

export const functionalRules: Rule[] = [
  {
    id: 'V019',
    title: 'METAGGA without LASPH = .TRUE.',
    severity: 'error',
    source: ['S-042'],
    handbook: 'workflow:dictionary#METAGGA',
    vasp: 'all versions',
    check: (_ctx, v) => {
      const m = v.word('METAGGA');
      if (m === undefined || m === 'NONE' || v.bool('LASPH') === true) return [];
      return [
        {
          why: 'Meta-GGA functionals need the non-spherical terms inside the atoms, so LASPH = .TRUE. is required.',
          fix: fixSet('Set LASPH = .TRUE.', 'LASPH', '.TRUE.'),
        },
      ];
    },
  },
  {
    id: 'V020',
    title: 'METAGGA together with a GGA tag',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:dictionary#METAGGA',
    vasp: 'all versions',
    check: (_ctx, v) => {
      const m = v.word('METAGGA');
      if (m === undefined || m === 'NONE' || !v.has('GGA')) return [];
      return [
        {
          why: 'The METAGGA tag already chooses the functional. Remove the GGA tag so the two do not conflict.',
          fix: fixRemove('Remove GGA', 'GGA'),
        },
      ];
    },
  },
  {
    id: 'V021',
    title: 'LEPSILON together with a hybrid functional',
    severity: 'error',
    source: ['S-042'],
    handbook: 'workflow:dictionary#LEPSILON',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (v.bool('LEPSILON') !== true || v.bool('LHFCALC') !== true) return [];
      return [
        {
          why: 'The perturbation-theory route (LEPSILON) does not work with hybrid functionals. Use IBRION = 6 with LCALCEPS = .TRUE. instead.',
          fix: fixRemove('Remove LEPSILON', 'LEPSILON'),
        },
      ];
    },
  },
  {
    id: 'V027',
    title: 'Hybrid parameters are not HSE06 or PBE0',
    severity: 'info',
    source: ['S-042'],
    handbook: 'workflow:dictionary#HFSCREEN',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (v.bool('LHFCALC') !== true) return [];
      const a = v.num('AEXX');
      const s = v.num('HFSCREEN');
      const aOff = a !== undefined && a !== 0.25;
      const sOff = s !== undefined && s !== 0 && s !== 0.2;
      if (!aOff && !sOff) return [];
      return [
        {
          why: 'The standard hybrids are HSE06 (AEXX = 0.25, HFSCREEN = 0.2) and PBE0 (AEXX = 0.25, HFSCREEN = 0). Other values are a tuned functional, so say so when you report results.',
        },
      ];
    },
  },
  {
    id: 'V028',
    title: 'Hybrid functional with ALGO Normal or Fast',
    severity: 'info',
    source: ['S-042'],
    handbook: 'workflow:dictionary#ALGO',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (v.bool('LHFCALC') !== true) return [];
      const a = v.word('ALGO') ?? 'NORMAL';
      if (a !== 'NORMAL' && a !== 'FAST' && a !== 'N' && a !== 'F') return [];
      return [
        {
          why: 'Hybrid runs converge more reliably with ALGO = All or Damped. The handbook HSE06 INCAR uses Damped.',
          fix: fixSet('Set ALGO = Damped', 'ALGO', 'Damped'),
        },
      ];
    },
  },
  {
    id: 'V030',
    title: 'Spin-orbit coupling needs the non-collinear executable',
    severity: 'info',
    source: ['S-042'],
    handbook: 'workflow:dictionary#LSORBIT',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (v.bool('LSORBIT') !== true) return [];
      return [
        {
          why: 'LSORBIT = .TRUE. only works with the non-collinear build of VASP (vasp_ncl), and MAGMOM then needs three values per atom.',
        },
      ];
    },
  },
];
