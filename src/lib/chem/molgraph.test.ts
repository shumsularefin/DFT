import { beforeAll, describe, expect, it } from 'vitest';
import {
  checkGraph,
  depictSvg,
  expandHydrogens,
  graphToSmiles,
  layout2d,
  parseMolecule,
  toMolblock,
  toSmiles,
  type MolGraph,
  type RdkitApi,
} from './molgraph';
import { writeMolBlock, writeXyz } from './molexport';
import { loadRdkitNode } from './rdkit-node';

let rd: RdkitApi;
beforeAll(async () => {
  rd = await loadRdkitNode();
});

const parsed = (text: string): MolGraph => {
  const r = parseMolecule(rd, text);
  if (!r.ok) throw new Error(r.issues.map((i) => i.why).join('; '));
  return r.graph;
};

describe('graph model and RDKit conversion (S-035)', () => {
  it('loads the pinned RDKit build', () => {
    expect(rd.version()).toBe('2026.09.1');
  });
  it('SMILES in: atoms, charges, hydrogen counts and aromatic bonds', () => {
    const benzene = parsed('c1ccccc1');
    expect(benzene.atoms).toHaveLength(6);
    expect(benzene.atoms.every((a) => a.el === 'C' && a.hCount === 1 && a.charge === 0)).toBe(true);
    expect(benzene.bonds.every((b) => b.order === 'aromatic')).toBe(true);
    const nh4 = parsed('[NH4+]');
    expect(nh4.atoms).toEqual([{ el: 'N', charge: 1, hCount: 4 }]);
    const co2 = parsed('O=C=O');
    expect(co2.bonds.map((b) => b.order)).toEqual([2, 2]);
    expect(parsed('C#N').bonds[0]!.order).toBe(3);
  });
  it('graph to SMILES writes every atom in brackets and round-trips through RDKit', () => {
    for (const smi of [
      'CCO',
      'c1ccccc1',
      'O=C=O',
      'C1CC1C(=O)[O-]',
      '[NH4+].[Cl-]',
      'c1ccc2ccccc2c1',
      'CC#N',
    ]) {
      const g = parsed(smi);
      const { smiles, order } = graphToSmiles(g);
      expect(smiles).toMatch(/^\[/);
      expect([...order].sort((a, b) => a - b)).toEqual(g.atoms.map((_, i) => i));
      expect(toSmiles(rd, g)).toBe(parseMolecule(rd, smi).ok && rd.get_mol(smi)!.get_smiles());
    }
  });
  it('MOL block out and back in gives the same molecule; the 3D writer too', () => {
    const g = parsed('OC(=O)c1ccccc1');
    const { molblock } = toMolblock(rd, g);
    expect(molblock).toMatch(/V2000/);
    expect(toSmiles(rd, parsed(molblock))).toBe(toSmiles(rd, g));
    const h = expandHydrogens(g);
    const pos = h.atoms.map((_, i) => [i, 0.5 * i, 0] as [number, number, number]);
    const mol3d = writeMolBlock(h, pos);
    // Read back with the hydrogens removed (MinimalLib keeps them from a MOL block by default), so both sides are the hydrogen-suppressed canonical SMILES.
    expect(rd.get_mol(mol3d, JSON.stringify({ removeHs: true }))!.get_smiles()).toBe(
      rd.get_mol('OC(=O)c1ccccc1')!.get_smiles(),
    );
    const charged = expandHydrogens(parsed('[NH4+]'));
    const block = writeMolBlock(
      charged,
      charged.atoms.map(() => [0, 0, 0]),
    );
    expect(block).toMatch(/M {2}CHG {2}1 {3}1 {3}1/);
    expect(
      writeXyz(
        ['O', 'H'],
        [
          [0, 0, 0],
          [0.96, 0, 0],
        ],
        'w',
      ).split('\n'),
    ).toEqual(['2', 'w', 'O 0.00000000 0.00000000 0.00000000', 'H 0.96000000 0.00000000 0.00000000', '']);
  });
  it('checkGraph keeps the graph atom order', () => {
    const g: MolGraph = {
      atoms: [
        { el: 'O', charge: 0, hCount: 1 },
        { el: 'C', charge: 0, hCount: 2 },
        { el: 'C', charge: 0, hCount: 3 },
      ],
      bonds: [
        { a: 2, b: 1, order: 1 },
        { a: 1, b: 0, order: 1 },
      ],
    };
    const r = checkGraph(rd, g);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.graph.atoms.map((a) => a.el)).toEqual(['O', 'C', 'C']);
  });
});

describe('sanitization as B012 issues', () => {
  it('carbon with five single bonds is rejected, with the offending atom and an explanation', () => {
    const g: MolGraph = {
      atoms: [
        { el: 'C', charge: 0, hCount: 0 },
        ...Array.from({ length: 5 }, () => ({ el: 'C', charge: 0, hCount: 3 })),
      ],
      bonds: [1, 2, 3, 4, 5].map((k) => ({ a: k, b: 0, order: 1 as const })),
    };
    const r = checkGraph(rd, g);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues).toHaveLength(1);
    const i = r.issues[0]!;
    expect(i.code).toBe('B012');
    expect(i.severity).toBe('error');
    expect(i.atoms).toEqual([0]);
    expect(i.why).toMatch(/neutral carbon has four/);
    expect(i.why).toMatch(/RDKit says/);
    expect(String(i.data?.suggestion)).toMatch(/Remove a bond/);
  });
  it('the same error from SMILES text keeps the unsanitized graph for display', () => {
    const r = parseMolecule(rd, 'C(C)(C)(C)(C)C');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.issues[0]!.atoms).toEqual([0]);
    expect(r.graph?.atoms).toHaveLength(6);
  });
  it('an aromatic ring that cannot be kekulized and a syntax error are explained', () => {
    const k = parseMolecule(rd, 'c1cccc1');
    expect(k.ok).toBe(false);
    if (!k.ok) expect(k.issues[0]!.title).toMatch(/alternating/);
    const s = parseMolecule(rd, 'C((');
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.issues[0]!.code).toBe('B012');
    expect(() => graphToSmiles({ atoms: [{ el: 'Xx', charge: 0, hCount: 0 }], bonds: [] })).toThrow(
      RangeError,
    );
  });
});

describe('2D layout and SVG', () => {
  it('CoordGen gives coordinates for every atom and an SVG', () => {
    const g = parsed('CC(=O)Oc1ccccc1C(=O)O');
    const r = layout2d(rd, g);
    expect(r.method).toBe('CoordGen');
    expect(r.graph.coords2d).toHaveLength(g.atoms.length);
    expect(r.graph.coords2d!.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    const svg = depictSvg(rd, g, 240, 160);
    expect(svg).toMatch(/^<\?xml|^<svg/);
    expect(svg).toMatch(/<\/svg>/);
  });
});
