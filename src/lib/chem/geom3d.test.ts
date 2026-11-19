import { beforeAll, describe, expect, it } from 'vitest';
import type { Vec3 } from '../crystal/types';
import { GEOMETRY_LABEL, geometry3d, idealAngles, valenceElectrons } from './geom3d';
import { moleculeInBox } from './molexport';
import { expandHydrogens, layout2d, parseMolecule, type MolGraph, type RdkitApi } from './molgraph';
import { loadRdkitNode } from './rdkit-node';
import { parsePoscar } from '../crystal/poscar';

// Targets are the model's own definitions (work order): Cordero single-bond sums (S-021) and VSEPR ideal angles.
let rd: RdkitApi;
beforeAll(async () => {
  rd = await loadRdkitNode();
});

/** RDKit graph with explicit hydrogens and a CoordGen 2D layout: the input the Builder will pass. */
const start = (smi: string): MolGraph => {
  const r = parseMolecule(rd, smi);
  if (!r.ok) throw new Error('bad test molecule');
  return layout2d(rd, expandHydrogens(r.graph)).graph;
};
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const angle = (a: Vec3, c: Vec3, b: Vec3) => {
  const u = [a[0] - c[0], a[1] - c[1], a[2] - c[2]];
  const v = [b[0] - c[0], b[1] - c[1], b[2] - c[2]];
  const cos = (u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!) / (Math.hypot(...u) * Math.hypot(...v));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
};
/** Largest distance of any atom from the best plane (smallest eigenvector of the scatter, by power iteration). */
function planeDeviation(p: Vec3[]): number {
  const c = [0, 1, 2].map((d) => p.reduce((s, x) => s + x[d]!, 0) / p.length);
  const q = p.map((x) => x.map((v, d) => v - c[d]!));
  const S = [0, 1, 2].map((i) => [0, 1, 2].map((j) => q.reduce((s, x) => s + x[i]! * x[j]!, 0)));
  const tr = S[0]![0]! + S[1]![1]! + S[2]![2]! + 1;
  const M = S.map((r, i) => r.map((v, j) => (i === j ? tr : 0) - v)); // largest eigenvector of tr I - S
  let v = [0.3, 0.5, 0.8];
  for (let k = 0; k < 500; k++) {
    const w = M.map((r) => r[0]! * v[0]! + r[1]! * v[1]! + r[2]! * v[2]!);
    const n = Math.hypot(...w);
    v = w.map((x) => x / n);
  }
  return Math.max(...q.map((x) => Math.abs(x[0]! * v[0]! + x[1]! * v[1]! + x[2]! * v[2]!)));
}
const timed = (g: MolGraph) => {
  const t0 = performance.now();
  const r = geometry3d(g, { seed: 7 });
  return { r, ms: performance.now() - t0 };
};

describe('valence model', () => {
  it('valence electrons and steric numbers', () => {
    expect([
      valenceElectrons('H'),
      valenceElectrons('C'),
      valenceElectrons('N'),
      valenceElectrons('O'),
    ]).toEqual([1, 4, 5, 6]);
    expect(valenceElectrons('Fe')).toBeNull();
    const water = expandHydrogens({ atoms: [{ el: 'O', charge: 0, hCount: 2 }], bonds: [] });
    expect(idealAngles(water).steric[0]).toBe(4); // 2 bonds + 2 lone pairs
    const co2: MolGraph = {
      atoms: [
        { el: 'O', charge: 0, hCount: 0 },
        { el: 'C', charge: 0, hCount: 0 },
        { el: 'O', charge: 0, hCount: 0 },
      ],
      bonds: [
        { a: 0, b: 1, order: 2 },
        { a: 1, b: 2, order: 2 },
      ],
    };
    expect(idealAngles(co2).angle[1]).toBe(180);
  });
});

describe('rough 3D geometry (work order test set)', () => {
  const times: Record<string, number> = {};
  it('methane: C-H = 0.31 + 0.76 = 1.07 within 0.01, H-C-H = 109.47 within 1 degree', () => {
    const { r, ms } = timed(start('C'));
    times.methane = ms;
    const c = r.species.indexOf('C');
    const hs = r.species.map((e, i) => (e === 'H' ? i : -1)).filter((i) => i >= 0);
    expect(hs).toHaveLength(4);
    for (const h of hs) expect(Math.abs(dist(r.positions[c]!, r.positions[h]!) - 1.07)).toBeLessThan(0.01);
    for (let a = 0; a < 4; a++)
      for (let b = a + 1; b < 4; b++)
        expect(
          Math.abs(angle(r.positions[hs[a]!]!, r.positions[c]!, r.positions[hs[b]!]!) - 109.47),
        ).toBeLessThan(1);
    expect(r.converged).toBe(true);
    expect(r.notes[0]).toBe(GEOMETRY_LABEL);
  });
  it('CO2 is linear within 1 degree', () => {
    const { r, ms } = timed(start('O=C=O'));
    times.co2 = ms;
    const c = r.species.indexOf('C');
    const [o1, o2] = r.species.map((e, i) => (e === 'O' ? i : -1)).filter((i) => i >= 0);
    expect(Math.abs(angle(r.positions[o1!]!, r.positions[c]!, r.positions[o2!]!) - 180)).toBeLessThan(1);
    expect(r.notes.join(' ')).toMatch(/double and triple bonds come out too long/);
  });
  it('ethene is planar (every atom within 0.05 angstrom of one plane)', () => {
    const { r, ms } = timed(start('C=C'));
    times.ethene = ms;
    expect(r.positions).toHaveLength(6);
    expect(planeDeviation(r.positions)).toBeLessThan(0.05);
  });
  it('benzene (aromatic) has a planar ring', () => {
    const { r, ms } = timed(start('c1ccccc1'));
    times.benzene = ms;
    const ring = r.species.map((e, i) => (e === 'C' ? i : -1)).filter((i) => i >= 0);
    expect(planeDeviation(ring.map((i) => r.positions[i]!))).toBeLessThan(0.05);
  });
  it('water: H-O-H between 100 and 110 degrees (109.47 in this model; the experimental angle is smaller, Q-045)', () => {
    const { r, ms } = timed(start('O'));
    times.water = ms;
    const o = r.species.indexOf('O');
    const [h1, h2] = r.species.map((e, i) => (e === 'H' ? i : -1)).filter((i) => i >= 0);
    const a = angle(r.positions[h1!]!, r.positions[o]!, r.positions[h2!]!);
    expect(a).toBeGreaterThan(100);
    expect(a).toBeLessThan(110);
  });
  it('determinism: the same seed gives the same coordinates; another seed still converges', () => {
    const g = start('CCO');
    const a = geometry3d(g, { seed: 3 });
    const b = geometry3d(g, { seed: 3 });
    expect(b.positions).toEqual(a.positions);
    expect(geometry3d(g, { seed: 4 }).converged).toBe(true);
  });
  it('each test molecule converges in under 200 ms', () => {
    for (const smi of ['C', 'O=C=O', 'C=C', 'c1ccccc1', 'O']) {
      const { r, ms } = timed(start(smi));
      expect(r.converged, smi).toBe(true);
      expect(ms, smi).toBeLessThan(200);
    }
    expect(Object.keys(times)).toHaveLength(5);
  });
  it('drug-sized molecules (aspirin, caffeine, ibuprofen, carbazole) converge too, with planar aromatic rings', () => {
    for (const smi of [
      'CC(=O)Oc1ccccc1C(=O)O',
      'CN1C=NC2=C1C(=O)N(C(=O)N2C)C',
      'CC(C)Cc1ccc(cc1)C(C)C(=O)O',
      'c1ccc2c(c1)c1ccccc1[nH]2',
    ]) {
      const g = start(smi);
      const { r } = timed(g);
      expect(r.converged, smi).toBe(true);
      const arom = new Set<number>();
      for (const b of g.bonds) if (b.order === 'aromatic') arom.add(b.a).add(b.b);
      if (arom.size) expect(planeDeviation([...arom].map((i) => r.positions[i]!)), smi).toBeLessThan(0.05);
    }
  });
});

describe('molecule in a box for VASP', () => {
  it('cubic cell with at least 10 angstrom between images, Direct or Cartesian POSCAR, k-point and ISIF notes', () => {
    const r = geometry3d(start('c1ccccc1'), { seed: 1 });
    const box = moleculeInBox(r.species, r.positions);
    const L = box.structure.lattice;
    expect(L[0][0]).toBe(L[1][1]);
    expect(L[1][1]).toBe(L[2][2]);
    for (let d = 0; d < 3; d++) {
      const xs = box.structure.frac.map((f) => f[d]! * box.edge);
      expect(box.edge - (Math.max(...xs) - Math.min(...xs))).toBeGreaterThanOrEqual(10 - 1e-9);
    }
    expect(box.notes.join(' ')).toMatch(/Gamma/);
    expect(box.notes.join(' ')).toMatch(/ISIF = 2/);
    expect(box.notes.join(' ')).toMatch(/V023/);
    const back = parsePoscar(box.poscar).structure;
    expect(back.species).toHaveLength(12);
    const cart = moleculeInBox(r.species, r.positions, { coordinates: 'cartesian', vacuumA: 12 });
    expect(cart.poscar).toMatch(/\nCartesian\n/);
    const c2 = parsePoscar(cart.poscar).structure;
    expect(c2.lattice[0][0]).toBeCloseTo(cart.edge, 10);
    c2.frac.forEach((f, i) => f.forEach((x, d) => expect(x).toBeCloseTo(cart.structure.frac[i]![d]!, 10)));
  });
});
