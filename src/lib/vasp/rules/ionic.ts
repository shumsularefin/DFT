// V010 to V012, V014, V015, V023: ionic steps, convergence criteria and cell changes.
// @source S-041, S-042
import { fixSet, fmt } from './helpers';
import type { Rule } from './types';

export const ionicRules: Rule[] = [
  {
    id: 'V010',
    title: 'Ionic steps requested but IBRION is not set',
    severity: 'error',
    source: ['S-041'],
    handbook: 'field:t-md',
    vasp: 'all versions',
    check: (_ctx, v) => {
      // The handbook default is "-1 if NSW <= 1, else 0 (MD!)", so only NSW > 1 falls into molecular dynamics (Q-029).
      if ((v.num('NSW') ?? 0) <= 1 || v.has('IBRION')) return [];
      return [
        {
          why: `NSW = ${v.num('NSW')} but IBRION is missing. VASP then runs molecular dynamics, and the atoms fly around at a temperature instead of relaxing. Set IBRION = 2 for a relaxation.`,
          fix: fixSet('Set IBRION = 2', 'IBRION', '2'),
        },
      ];
    },
  },
  {
    id: 'V011',
    title: 'Elastic constants (IBRION = 6) without ISIF = 3',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:protocol#step-4',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (v.num('IBRION') !== 6 || (v.num('ISIF') ?? 2) >= 3) return [];
      return [
        {
          why: 'The elastic tensor needs the stress, so IBRION = 6 must be run with ISIF = 3.',
          fix: fixSet('Set ISIF = 3', 'ISIF', '3'),
        },
      ];
    },
  },
  {
    id: 'V012',
    title: 'Finite-difference run with NSW other than 1',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:dictionary#NSW',
    vasp: 'all versions',
    check: (_ctx, v) => {
      const ib = v.num('IBRION');
      if (ib === undefined || ib < 5 || ib > 8) return [];
      const nsw = v.num('NSW') ?? 0;
      if (nsw === 1) return [];
      return [
        {
          why: `IBRION = ${ib} does all its displacements inside one ionic step, so NSW should be 1 (it is ${nsw}${v.has('NSW') ? '' : ', the default'}).`,
          fix: fixSet('Set NSW = 1', 'NSW', '1'),
        },
      ];
    },
  },
  {
    id: 'V014',
    title: 'Force criterion of 0.001 or smaller with a loose EDIFF',
    severity: 'warn',
    source: ['S-041', 'S-042'],
    handbook: 'workflow:incar#relaxation',
    vasp: 'all versions',
    check: (_ctx, v) => {
      const g = v.num('EDIFFG');
      if (g === undefined || g >= 0 || Math.abs(g) > 0.001) return [];
      const e = v.num('EDIFF') ?? 1e-4;
      if (e <= 1e-7) return [];
      return [
        {
          why: `To converge forces below ${Math.abs(g)} eV/A the electronic loop must be tight. The handbook uses EDIFF between 1E-7 and 1E-8 here. Yours is ${v.has('EDIFF') ? e : '1E-4 (the default)'}, so the forces will be noisy and the relaxation may never finish.`,
          fix: fixSet('Set EDIFF = 1E-7', 'EDIFF', '1E-7'),
        },
      ];
    },
  },
  {
    id: 'V015',
    title: 'EDIFFG is an energy criterion and EDIFF is not small enough',
    severity: 'warn',
    source: ['S-041'],
    handbook: 'workflow:dictionary#EDIFFG',
    vasp: 'all versions',
    check: (_ctx, v) => {
      const g = v.num('EDIFFG');
      if (g === undefined || g <= 0) return [];
      const e = v.num('EDIFF') ?? 1e-4;
      if (e <= 0.1 * g * (1 + 1e-9)) return [];
      const target = fmt(0.1 * g);
      return [
        {
          why: `A positive EDIFFG stops on energy change, and EDIFF should be at least 10 times smaller than it (here at most ${target}).`,
          fix: fixSet(`Set EDIFF = ${target}`, 'EDIFF', target),
        },
      ];
    },
  },
  {
    id: 'V023',
    title: 'Cell relaxation (ISIF = 3) on a slab or molecule',
    severity: 'error',
    source: ['S-041', 'S-042'],
    handbook: 'field:t-slab',
    vasp: 'all versions',
    check: (ctx, v) => {
      if (v.num('ISIF') !== 3) return [];
      if (ctx.systemType !== 'slab' && ctx.systemType !== 'molecule') return [];
      return [
        {
          why: `ISIF = 3 lets the cell change, and the vacuum of a ${ctx.systemType} will collapse. Use ISIF = 2 so only the atoms move.`,
          fix: fixSet('Set ISIF = 2', 'ISIF', '2'),
        },
      ];
    },
  },
];
