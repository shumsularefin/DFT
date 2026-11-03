// V004 to V007: ISMEAR and SIGMA.
// @source S-041, S-042
import { fixSet, kpointTotal } from './helpers';
import type { Rule } from './types';

export const smearingRules: Rule[] = [
  {
    id: 'V004',
    title: 'Tetrahedron method with fewer than 4 k-points',
    severity: 'error',
    source: ['S-041'],
    handbook: 'field:t-tetra',
    vasp: 'all versions',
    check: (ctx, v) => {
      if (v.num('ISMEAR') !== -5) return [];
      const n = kpointTotal(ctx);
      if (n === undefined || n >= 4) return [];
      return [
        {
          why: `ISMEAR = -5 (tetrahedron) needs at least 4 k-points, and this KPOINTS gives ${n}. VASP stops with "Tetrahedron method fails for NKPT<4".`,
          whyDetail:
            'The count here is the full mesh before symmetry reduction, so a mesh just at the limit may still fail.',
          fix: fixSet('Use Gaussian smearing (ISMEAR = 0)', 'ISMEAR', '0'),
        },
      ];
    },
  },
  {
    id: 'V005',
    title: 'Tetrahedron method with ion movement on a metal',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:dictionary#ISMEAR',
    vasp: 'all versions',
    check: (ctx, v) => {
      if (v.num('ISMEAR') !== -5 || (v.num('NSW') ?? 0) <= 0) return [];
      const t = ctx.systemType ?? 'unknown';
      if (t !== 'metal' && t !== 'unknown') return [];
      return [
        {
          why: 'ISMEAR = -5 gives inaccurate forces for metals, so it is not a good choice for a relaxation. Use it for a static run or a DOS.',
          fix: fixSet('Use Methfessel-Paxton smearing (ISMEAR = 1)', 'ISMEAR', '1'),
        },
      ];
    },
  },
  {
    id: 'V006',
    title: 'Methfessel-Paxton smearing on a semiconductor or insulator',
    severity: 'warn',
    source: ['S-042'],
    handbook: 'workflow:protocol#step-2',
    vasp: 'all versions',
    check: (ctx, v) => {
      if (ctx.systemType !== 'semiconductor' && ctx.systemType !== 'insulator') return [];
      const s = v.num('ISMEAR');
      if (s !== undefined && s < 1) return [];
      return [
        {
          why: `${s === undefined ? 'ISMEAR is not set and the VASP default is 1' : 'ISMEAR = ' + s}. Methfessel-Paxton smearing is meant for metals; on a semiconductor it can give wrong energies. Use ISMEAR = 0 with a small SIGMA.`,
          fix: fixSet('Set ISMEAR = 0', 'ISMEAR', '0'),
        },
      ];
    },
  },
  {
    id: 'V007',
    title: 'SIGMA too wide for a semiconductor or insulator',
    severity: 'warn',
    source: ['S-041', 'S-042'],
    handbook: 'field:t-entropy',
    vasp: 'all versions',
    check: (ctx, v) => {
      if (ctx.systemType !== 'semiconductor' && ctx.systemType !== 'insulator') return [];
      if (v.num('ISMEAR') !== 0) return [];
      const sigma = v.num('SIGMA') ?? 0.2; // the handbooks state the default as ISMEAR = 1, SIGMA = 0.2
      if (sigma <= 0.1) return [];
      return [
        {
          why: `SIGMA = ${sigma}${v.has('SIGMA') ? '' : ' (the default)'} spreads the electrons too widely for a gapped material. It blurs the gap and adds an entropy error. Use 0.05 or smaller.`,
          fix: fixSet('Set SIGMA = 0.05', 'SIGMA', '0.05'),
        },
      ];
    },
  },
];
