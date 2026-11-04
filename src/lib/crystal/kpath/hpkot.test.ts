import { beforeAll, describe, expect, it } from 'vitest';
import kp from '../../../../tests/reference/kpaths.json';
import { symbolOf } from '../elements';
import { latticeParameters } from '../lattice';
import { dot } from '../linalg';
import { loadMoyoNode } from '../moyo-node';
import { analyzeWith, type MoyoApi } from '../symmetry';
import type { Mat3, Structure } from '../types';
import { hpkotPath, labelDisplay, primitiveMatrices } from './hpkot';

interface Golden {
  input: { lattice_rows: Mat3; frac_coords: [number, number, number][]; atomic_numbers: number[] };
  hpkot: {
    bravais_lattice_extended: string;
    spacegroup_number: number;
    path: [string, string][];
    point_coords: Record<string, number[]>;
    primitive_lattice_rows: Mat3;
    primitive_positions: number[][];
    primitive_types: number[];
    conv_lattice_rows: Mat3;
    reciprocal_primitive_lattice_rows_with_2pi: Mat3;
  };
}
const S = kp.structures as unknown as Record<string, Golden>;
const gram = (m: Mat3) => m.map((a) => m.map((b) => dot(a, b)));

let api: MoyoApi;
beforeAll(async () => {
  api = await loadMoyoNode();
});

const toStructure = (g: Golden): Structure => ({
  lattice: g.input.lattice_rows,
  species: g.input.atomic_numbers.map((z) => symbolOf(z)!),
  frac: g.input.frac_coords,
});

describe('HPKOT against the SeeK-path 2.2.2 golden file (39 structures)', () => {
  for (const name of Object.keys(S)) {
    it(name, () => {
      const g = S[name]!.hpkot;
      const r = hpkotPath(analyzeWith(api, toStructure(S[name]!), { symprec: 1e-3, setting: 'Spglib' }));
      expect(r.spacegroupNumber).toBe(g.spacegroup_number);
      expect(r.bravaisLatticeExtended).toBe(g.bravais_lattice_extended);
      expect(r.path).toEqual(g.path);
      expect(Object.keys(r.pointCoords).sort()).toEqual(Object.keys(g.point_coords).sort());
      // primitive cell: same metric tensor
      const gp = gram(r.primitiveLattice);
      const gg = gram(g.primitive_lattice_rows);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(gp[i]![j]!).toBeCloseTo(gg[i]![j]!, 5);
      expect(r.primitiveFrac.length).toBe(g.primitive_positions.length);
      // reciprocal basis metric too, so coordinates are in the same basis
      const gr = gram(r.reciprocalPrimitive);
      const gb = gram(g.reciprocal_primitive_lattice_rows_with_2pi);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) expect(gr[i]![j]!).toBeCloseTo(gb[i]![j]!, 5);
      for (const [label, c] of Object.entries(g.point_coords)) {
        const t = r.pointCoords[label]!;
        for (let i = 0; i < 3; i++) expect(t[i]!, `${label}[${i}]`).toBeCloseTo(c[i]!, 6);
      }
    });
  }
  it('exercises all 29 extended Bravais variants', () => {
    const seen = new Set(Object.values(S).map((g) => g.hpkot.bravais_lattice_extended));
    expect([...seen].sort()).toEqual(kp._meta.coverage.hpkot_extended_bravais);
  });
});

describe('details', () => {
  const sym = (name: string) => analyzeWith(api, toStructure(S[name]!), { symprec: 1e-3, setting: 'Spglib' });
  it('fcc Cu path is Gamma-X-U | K-Gamma-L-W-X', () => {
    const r = hpkotPath(sym('fcc_Cu'));
    expect(r.path.map(([a, b]) => `${a}-${b}`).join(' ')).toBe('GAMMA-X X-U K-GAMMA GAMMA-L L-W W-X');
    expect(r.warnings).toEqual([]);
  });
  it('requires the Spglib setting', () => {
    const s = analyzeWith(api, toStructure(S['fcc_Cu']!), { symprec: 1e-3 });
    expect(() => hpkotPath(s)).toThrow(RangeError);
  });
  it('adds the -k path without time reversal for a group with no inversion', () => {
    const r = hpkotPath(sym('v_cF1_F23'), { withTimeReversal: false });
    expect(r.hasInversion).toBe(false);
    expect(r.augmentedPath).toBe(true);
    expect(r.pointCoords["X'"]).toEqual(r.pointCoords['X']!.map((x) => -x + 0));
    expect(r.pointCoords["GAMMA'"]).toBeUndefined();
    const plain = hpkotPath(sym('v_cF1_F23'));
    expect(plain.augmentedPath).toBe(false);
    expect(r.path.length).toBe(2 * plain.path.length);
  });
  it('does not augment when the group has inversion', () => {
    const r = hpkotPath(sym('fcc_Cu'), { withTimeReversal: false });
    expect(r.augmentedPath).toBe(false);
  });
  it('reports an edge case when a is almost c in a body-centred tetragonal cell', () => {
    const s: Structure = {
      lattice: [
        [3, 0, 0],
        [0, 3, 0],
        [0, 0, 3 + 1e-8],
      ],
      species: ['Fe', 'Fe'],
      frac: [
        [0, 0, 0],
        [0.5, 0.5, 0.5],
      ],
    };
    const r = hpkotPath(analyzeWith(api, s, { symprec: 1e-10, setting: 'Spglib' }));
    expect(r.bravaisLattice).toBe('tI');
    expect(r.warnings).toContain('tI lattice, but a almost equal to c');
    expect(r.bravaisLatticeExtended).toBe('tI2');
  });
  it('primitive matrices are inverse of each other with integer inverse', () => {
    for (const b of ['cP', 'cF', 'cI', 'hR', 'oC', 'oA', 'mC', 'aP']) {
      const { P, invP } = primitiveMatrices(b);
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
          let s = 0;
          for (let k = 0; k < 3; k++) s += P[i]![k]! * invP[k]![j]!;
          expect(s).toBeCloseTo(i === j ? 1 : 0, 12);
        }
    }
  });
  it('primitive cell has the volume of the conventional cell divided by the centring multiplicity', () => {
    const r = hpkotPath(sym('fcc_Cu'));
    const p = latticeParameters(r.primitiveLattice);
    expect(p.a).toBeCloseTo(3.61 / Math.SQRT2, 6);
  });
});

describe('labelDisplay', () => {
  it('maps Greek names and subscripts', () => {
    expect(labelDisplay('GAMMA')).toBe('Γ');
    expect(labelDisplay('DELTA_0')).toBe('Δ₀');
    expect(labelDisplay('SIGMA_0')).toBe('Σ₀');
    expect(labelDisplay('X_1')).toBe('X₁');
    expect(labelDisplay("X'")).toBe("X'");
    expect(labelDisplay('Y_12')).toBe('Y₁₂');
  });
});
