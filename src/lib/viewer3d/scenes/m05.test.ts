// Physics of the module 5 scenes against golden files and closed forms.
import { describe, expect, it } from 'vitest';
import kp from '../../../../tests/reference/kpaths.json';
import pwref from '../../../../tests/reference/pw_kmesh_reference.json';
import { reciprocalLattice } from '../../crystal/lattice';
import { dudarevEnergy, dudarevPotential } from '../../physics/dftu';
import { allElectronLike, pseudo } from '../../physics/paw';
import { enhancement } from '../../physics/pbe';
import { cutoffRadius } from '../../physics/planewaves';
import { occupation } from '../../physics/smearing';
import { norm, sub, type Vec3 } from '../math';
import { withDefaults, type MeshLayer, type SceneFrame } from '../types';
import {
  DFTU,
  LATTICES,
  PAW,
  SMEAR,
  XC,
  halfHeightRadius,
  meshDivisions,
  meshFor,
  occupationWidth,
  scenes,
  sharpestBump,
} from './m05';

const build = (id: string, over: Record<string, number | string | boolean> = {}): SceneFrame => {
  const d = scenes[id]!;
  return d.build(withDefaults(d, over));
};
const readout = (f: SceneFrame, label: string) => f.readouts!.find((r) => r.label === label)!.value;
const mesh = (f: SceneFrame, group: string): MeshLayer =>
  f.layers.find((l) => l.kind === 'mesh' && l.group === group) as MeshLayer;
const verts = (m: MeshLayer): Vec3[] => {
  const out: Vec3[] = [];
  for (let i = 0; i < m.positions.length; i += 3)
    out.push([m.positions[i]!, m.positions[i + 1]!, m.positions[i + 2]!]);
  return out;
};

interface GoldenSC {
  setyawan_curtarolo: {
    point_coords: Record<string, number[]>;
    primitive_lattice_rows: number[][];
    path: string[][];
  };
}
const golden = kp.structures as unknown as Record<string, GoldenSC>;

// @source S-005, S-034 (pymatgen golden k-paths), S-032 (spglib golden irreducible counts), S-007
describe('m05-kmesh: zone, path and mesh', () => {
  const pairs: [string, string][] = [
    ['sc', 'sc_Po_like'],
    ['fcc', 'fcc_Cu'],
    ['bcc', 'bcc_Fe'],
    ['hcp', 'hcp_Mg'],
  ];
  it.each(pairs)(
    '%s: primitive cell, points and path equal the Setyawan-Curtarolo golden file',
    (id, name) => {
      const c = LATTICES.find((l) => l.id === id)!;
      const g = golden[name]!.setyawan_curtarolo;
      c.lattice.forEach((row, i) =>
        row.forEach((x, k) => expect(x).toBeCloseTo(g.primitive_lattice_rows[i]![k]!, 6)),
      );
      const gl = (l: string) => (l === '\\Gamma' ? 'Γ' : l);
      expect(Object.keys(c.points).sort()).toEqual(Object.keys(g.point_coords).map(gl).sort());
      for (const [l, q] of Object.entries(g.point_coords))
        c.points[gl(l)]!.forEach((x, k) => expect(x).toBeCloseTo(q[k]!, 8));
      expect(c.path).toEqual(g.path.map((s) => s.map(gl)));
    },
  );

  it('irreducible counts of the fcc Cu scene equal the spglib golden counts', () => {
    for (const r of pwref.irreducible_counts_spglib) {
      const n = r.mesh[0]!;
      if (n > 8) continue;
      const gam = build('m05-kmesh', { lattice: 'fcc', n, centering: 'gamma' });
      const mp = build('m05-kmesh', { lattice: 'fcc', n, centering: 'monkhorst-pack' });
      expect(readout(gam, 'Irreducible')).toBe(String(r.gamma_centred_irreducible));
      expect(readout(mp, 'Irreducible')).toBe(String(r.shifted_irreducible));
      expect(readout(mp, 'k-points')).toBe(String(n ** 3));
    }
  });

  it('every mesh point is folded into the first zone (closer to Gamma than to any other G)', () => {
    for (const c of LATTICES)
      for (const cen of ['gamma', 'monkhorst-pack'] as const) {
        const res = meshFor(c, 5, cen);
        const rec = reciprocalLattice(c.lattice);
        const Gs: Vec3[] = [];
        for (let i = -2; i <= 2; i++)
          for (let j = -2; j <= 2; j++)
            for (let k = -2; k <= 2; k++)
              if (i || j || k)
                Gs.push([0, 1, 2].map((a) => i * rec[0][a]! + j * rec[1][a]! + k * rec[2][a]!) as Vec3);
        for (const p of res.points)
          for (const G of Gs) expect(norm(p)).toBeLessThanOrEqual(norm(sub(p, G)) + 1e-9);
        expect(res.points).toHaveLength(res.divisions.reduce((a, b) => a * b, 1));
        expect(res.representatives.reduce((s, r) => s + r.size, 0)).toBe(res.total);
      }
  });

  it('hcp: divisions follow |b_i| and the golden symmetry flags (even Monkhorst-Pack breaks it, Gamma keeps it)', () => {
    const hcp = LATTICES.find((l) => l.id === 'hcp')!;
    const rec = reciprocalLattice(hcp.lattice).map((r) => [r[0], r[1], r[2]] as Vec3);
    expect(meshDivisions(rec, 6)).toEqual([6, 6, 3]);
    for (const g of pwref.mesh_point_group_symmetry.filter((x) => x.system.startsWith('hcp'))) {
      expect(meshFor(hcp, g.n, 'gamma').symmetric).toBe(g.gamma_centred_symmetric);
      if (g.n % 2 === 0)
        expect(meshFor(hcp, g.n, 'monkhorst-pack').symmetric).toBe(g.monkhorst_pack_symmetric);
    }
  });
});

// @source S-049, S-031 (plane-wave counts: tests/reference/pw_kmesh_reference.json), S-036
describe('m05-encut: cutoff sphere', () => {
  const fccGolden = pwref.plane_wave_counts.filter(
    (r) => r.cell === 'fcc_Cu_a3.61_primitive' && r.encut_eV <= 400,
  );
  it('the count readout and the balls equal the golden plane-wave counts of fcc Cu', () => {
    expect(fccGolden.length).toBeGreaterThanOrEqual(4);
    for (const r of fccGolden) {
      const f = build('m05-encut', { encut: r.encut_eV, cell: 'fcc' });
      expect(readout(f, 'Plane waves')).toBe(String(r.n_pw_exact));
      const inside = f.layers.find((l) => l.kind === 'atoms' && l.group === 'inside');
      expect(inside && inside.kind === 'atoms' ? inside.positions.length : -1).toBe(r.n_pw_exact);
    }
  });
  it('the sphere radius is the cutoff radius and every ball lies inside it', () => {
    const f = build('m05-encut', { encut: 300 });
    const r = Math.max(...verts(mesh(f, 'sphere')).map(norm));
    expect(r).toBeCloseTo(cutoffRadius(300), 6);
    const inside = f.layers.find((l) => l.kind === 'atoms' && l.group === 'inside')!;
    if (inside.kind === 'atoms')
      for (const g of inside.positions) expect(norm(g)).toBeLessThanOrEqual(r * (1 + 1e-9));
  });
  it('the real-space bump peaks at 1 on the atom and narrows as 2.5 / k_c (a band-limited delta, 3 j1(x)/x = 1/2)', () => {
    const fcc = LATTICES.find((l) => l.id === 'fcc')!;
    const n = 24;
    const f = sharpestBump(fcc, 300, n);
    const c = n / 2;
    expect(f[c + n * (c + n * c)]).toBeCloseTo(1, 10);
    for (const x of f) expect(x).toBeLessThanOrEqual(1 + 1e-9);
    // the continuum ball of radius k_c transforms to 3 (sin x - x cos x) / x^3, half height at x = 2.4995
    for (const id of ['fcc', 'sc'] as const) {
      const c2 = LATTICES.find((l) => l.id === id)!;
      expect(halfHeightRadius(c2, 400) * cutoffRadius(400)).toBeCloseTo(2.5, 0);
    }
    expect(halfHeightRadius(fcc, 400)).toBeLessThan(halfHeightRadius(fcc, 150));
  });
});

// @source S-015, S-016 (smearing closed forms)
describe('m05-smearing: occupation surface', () => {
  it('surface heights are the closed-form occupations', () => {
    for (const scheme of ['fermi', 'gaussian', 'mp1', 'cold']) {
      const m = mesh(build('m05-smearing', { scheme }), 'surface');
      for (const [X, Y, Z] of verts(m).filter((_, i) => i % 97 === 0)) {
        const e = X / SMEAR.xScale;
        const s = Y / SMEAR.yScale;
        expect(Z).toBeCloseTo(SMEAR.zOcc * occupation(scheme as 'fermi', e / s), 9);
      }
    }
  });
  it('the 0.9 to 0.1 width is 2 ln 9 sigma for Fermi-Dirac and scales with sigma', () => {
    expect(occupationWidth('fermi')).toBeCloseTo(2 * Math.log(9), 6);
    const a = build('m05-smearing', { scheme: 'fermi', sigma: 0.1 });
    const b = build('m05-smearing', { scheme: 'fermi', sigma: 0.2 });
    expect(Number.parseFloat(readout(b, '0.9 to 0.1 width'))).toBeCloseTo(
      2 * Number.parseFloat(readout(a, '0.9 to 0.1 width')),
      2,
    );
  });
  it('Methfessel-Paxton leaves 0 to 1, Fermi-Dirac and Gaussian do not', () => {
    expect(build('m05-smearing', { scheme: 'mp1' }).describe).toMatch(/leaves 0 to 1/);
    expect(build('m05-smearing', { scheme: 'fermi' }).describe).not.toMatch(/leaves 0 to 1/);
    expect(build('m05-smearing', { scheme: 'gaussian' }).describe).not.toMatch(/leaves 0 to 1/);
  });
});

describe('m05-paw: revolved radial functions', () => {
  it('heights are the schematic functions and the two agree outside r_c', () => {
    const rc = 1.7;
    const f = build('m05-paw', { rc, show: 'both' });
    for (const [x, y, z] of verts(mesh(f, 'all-electron')).filter((_, i) => i % 53 === 0))
      expect(z).toBeCloseTo(PAW.z * allElectronLike(Math.hypot(x, y), rc), 9);
    for (const [x, y, z] of verts(mesh(f, 'pseudo')).filter((_, i) => i % 53 === 0))
      expect(z).toBeCloseTo(PAW.z * pseudo(Math.hypot(x, y)), 9);
    expect(readout(f, 'Difference outside r_c')).toBe('0.000000');
    expect(readout(f, 'Nodes (pseudo)')).toBe('0');
    expect(Number(readout(f, 'Nodes inside r_c (all-electron)'))).toBeGreaterThanOrEqual(2);
  });
});

// @source S-014 (Dudarev)
describe('m05-dftu: penalty surface', () => {
  it('heights are (U_eff / 2) n (1 - n), zero at n = 0 and 1', () => {
    const m = mesh(build('m05-dftu'), 'surface');
    for (const [X, U, Z] of verts(m).filter((_, i) => i % 31 === 0))
      expect(Z).toBeCloseTo(DFTU.zEnergy * dudarevEnergy(U, X / DFTU.xScale), 9);
    expect(readout(build('m05-dftu', { n: 1 }), 'E_U')).toBe('0.000 eV');
  });
  it('U_eff = U - J and the level shifts open a gap of U_eff', () => {
    const f = build('m05-dftu', { u: 5, j: 1, quantity: 'potential' });
    expect(readout(f, 'U_eff')).toBe('4.0 eV');
    expect(dudarevPotential(4, 0) - dudarevPotential(4, 1)).toBeCloseTo(4, 12);
    expect(f.describe).toMatch(/gap of 4\.00 eV/);
  });
});

// @source S-013, S-146, S-147
describe('m05-functional: enhancement factor surface', () => {
  it('heights are F_xc(r_s, s) from pbe.ts and the readout matches', () => {
    for (const form of ['lda', 'pbe', 'pbesol'] as const) {
      const f = build('m05-functional', { form, rs: 3, s: 1.5 });
      for (const [X, rs, Z] of verts(mesh(f, 'surface')).filter((_, i) => i % 41 === 0))
        expect(Z).toBeCloseTo((enhancement(form, rs, X / XC.xScale) - 1) * XC.zScale, 9);
      expect(readout(f, 'F_xc')).toBe(enhancement(form, 3, 1.5).toFixed(3));
    }
  });
});

// @source S-148
describe('m05-vdw: dispersion landscape', () => {
  it('no correction gives a flat zero landscape; D2 is attractive everywhere', () => {
    const none = build('m05-vdw', { correction: 'none' });
    expect(readout(none, 'E_disp')).toBe('0.0 meV/atom');
    const d2 = build('m05-vdw');
    expect(Number.parseFloat(readout(d2, 'E_disp'))).toBeLessThan(0);
    expect(readout(d2, 'Stacking')).toBe('AB');
  });
  it('the readout is the bilayer sum at that geometry', async () => {
    const { bilayerEnergy, BOND } = await import('../../physics/dispersion');
    const f = build('m05-vdw', { spacing: 3.1, slide: 0.5 });
    expect(readout(f, 'E_disp')).toBe(`${(1000 * bilayerEnergy(3.1, 0.5 * BOND)).toFixed(1)} meV/atom`);
  });
});
