// V025, V026, V029: starting density, k-point files and mesh symmetry.
// @source S-042
import { meshSymmetryRisk } from '../kpoints';
import { fixSet } from './helpers';
import type { Rule } from './types';

const atLeast63 = (v?: string) => v === '6.3' || v === '6.4';

export const restartRules: Rule[] = [
  {
    id: 'V025',
    title: 'ICHARG = 11 reads a fixed density: check it matches',
    severity: 'info',
    source: ['S-042'],
    handbook: 'workflow:protocol#istart-icharg',
    vasp: 'all versions',
    check: (_ctx, v) => {
      if (v.num('ICHARG') !== 11) return [];
      return [
        {
          why: 'The CHGCAR you read must come from an SCF run with the same ENCUT, ISPIN, MAGMOM, LMAXMIX, functional, LDAU settings and cell as this run. If any differs, the bands are wrong without any error message.',
        },
      ];
    },
  },
  {
    id: 'V026',
    title: 'Line-mode KPOINTS in a self-consistent run',
    severity: 'error',
    source: ['S-042'],
    handbook: 'workflow:protocol#step-3',
    vasp: 'KPOINTS_OPT needs 6.3 or newer',
    check: (ctx, v) => {
      if (ctx.kpoints?.kind !== 'line') return [];
      if ((v.num('ICHARG') ?? 2) >= 10) return [];
      if (ctx.kpointsIsOpt === true && atLeast63(ctx.vaspVersion)) return [];
      return [
        {
          why: 'A band path cannot be used to build the density. Either read the density from an SCF run with ICHARG = 11 (route B), or on VASP 6.3 or newer give the path as KPOINTS_OPT in the SCF run (route A).',
          fix: fixSet('Set ICHARG = 11', 'ICHARG', '11'),
        },
      ];
    },
  },
  {
    id: 'V029',
    title: 'Even Monkhorst-Pack mesh on a hexagonal or fcc cell',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:tables#kpoints-centering',
    vasp: 'all versions',
    check: (ctx) => {
      const k = ctx.kpoints;
      if (k?.kind !== 'mesh' || !ctx.structure || k.centering !== 'monkhorst-pack') return [];
      const risky = k.mesh.some((n) => meshSymmetryRisk(ctx.structure!.lattice, 'monkhorst-pack', n));
      if (!risky) return [];
      return [
        {
          why: 'An even Monkhorst-Pack mesh on this cell breaks the lattice symmetry, which gives uneven sampling. Use a Gamma-centred mesh or an odd mesh.',
        },
      ];
    },
  },
];
