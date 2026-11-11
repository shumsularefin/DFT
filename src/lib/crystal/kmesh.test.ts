import { describe, expect, it } from 'vitest';
import bz from '../../../tests/reference/bz_geometry.json';
import ref from '../../../tests/reference/pw_kmesh_reference.json';
import {
  irreducibleCount,
  meshIsSymmetric,
  meshPoints,
  meshSymmetryReport,
  type MeshDivisions,
} from './kmesh';
import { latticePointGroup } from './pointgroup';
import { monkhorstPackCoords, gammaCoords } from '../vasp/kpoints';
import type { Mat3 } from './types';

const L = (id: keyof typeof bz.lattices): Mat3 => bz.lattices[id].direct_lattice_rows as unknown as Mat3;
const cube = (n: number): MeshDivisions => [n, n, n];

describe('mesh points', () => {
  it('Monkhorst-Pack and Gamma coordinates agree with the library helpers (as sets)', () => {
    for (const n of [1, 2, 3, 4, 5, 6]) {
      const mp = meshPoints([n, 1, 1], 'monkhorst-pack');
      const g = meshPoints([n, 1, 1], 'gamma');
      const xs = (m: typeof mp) =>
        [...new Set(Array.from({ length: m.count }, (_, i) => m.coords[3 * i]!))].sort((a, b) => a - b);
      const sorted = (a: number[]) => [...a].sort((x, y) => x - y);
      // odd n: the shifted and unshifted sets coincide; even n: MP is the half-step set
      const close = (a: number[], b: number[]) => {
        expect(a).toHaveLength(b.length);
        a.forEach((v, idx) => expect(v).toBeCloseTo(b[idx]!, 12));
      };
      close(xs(mp), sorted(n % 2 ? gammaCoords(n) : monkhorstPackCoords(n)));
      close(xs(g), sorted(gammaCoords(n)));
    }
  });
  it('rejects bad divisions', () => {
    expect(() => meshPoints([0, 1, 1], 'gamma')).toThrow(RangeError);
  });
});

describe('irreducible counts equal spglib (golden, fcc Cu primitive)', () => {
  const g = latticePointGroup(L('fcc_primitive'));
  for (const r of ref.irreducible_counts_spglib) {
    const n = r.mesh as unknown as MeshDivisions;
    it(`Gamma-centred ${n[0]}`, () => {
      expect(irreducibleCount(n, 'gamma', g).irreducible).toBe(r.gamma_centred_irreducible);
    });
    it(`shifted (even n = Monkhorst-Pack) ${n[0]}`, () => {
      expect(irreducibleCount(n, 'monkhorst-pack', g).irreducible).toBe(r.shifted_irreducible);
    });
  }
  it('weights sum to one and the class sizes sum to the total', () => {
    const r = irreducibleCount(cube(6), 'gamma', g);
    expect(r.representatives.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 12);
    expect(r.representatives.reduce((s, x) => s + x.size, 0)).toBe(216);
  });
  it('without symmetry nothing reduces; time reversal alone halves roughly', () => {
    const none = irreducibleCount(
      cube(4),
      'gamma',
      [
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
      ],
      { timeReversal: false },
    );
    expect(none.irreducible).toBe(64);
    const tr = irreducibleCount(
      cube(4),
      'gamma',
      [
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
      ],
      { timeReversal: true },
    );
    expect(tr.irreducible).toBe(36);
  });
});

describe('meshIsSymmetric equals the golden mesh_point_group_symmetry (S-007, S-019)', () => {
  const lat: Record<string, Mat3> = {
    'hcp_Mg_P6_3/mmc': L('hex_ideal'),
    fcc_Cu_primitive: L('fcc_primitive'),
    bcc_Fe_primitive: L('bcc_primitive'),
    'sc_a4.0': L('sc'),
  };
  const groups = Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, latticePointGroup(v)]));
  for (const r of ref.mesh_point_group_symmetry)
    it(`${r.system} n=${r.n}`, () => {
      const g = groups[r.system]!;
      expect(meshIsSymmetric(cube(r.n), 'gamma', g)).toBe(r.gamma_centred_symmetric);
      expect(meshIsSymmetric(cube(r.n), 'monkhorst-pack', g)).toBe(r.monkhorst_pack_symmetric);
    });
  it('the report names the reason for an even MP mesh on a hexagonal lattice', () => {
    const rep = meshSymmetryReport(cube(4), 'monkhorst-pack', groups['hcp_Mg_P6_3/mmc']!);
    expect(rep.symmetric).toBe(false);
    expect(rep.failing).toBeGreaterThan(0);
    expect(rep.reason).toContain('shifted off Gamma');
    expect(rep.reason).toContain('VASP wiki');
  });
});
