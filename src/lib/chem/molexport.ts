// Export a 3D molecule (M10.3): plain XYZ, a V2000 MOL block with 3D coordinates, and a molecule in a cubic box
// for VASP. The box keeps at least `vacuumA` of empty space between the molecule and each periodic image.
// @source S-035 S-041
import { writePoscar } from '../crystal/poscar';
import type { Structure, Vec3 } from '../crystal/types';
import type { MolGraph } from './molgraph';

/** Default vacuum between a molecule and its periodic images, angstrom. A convention (D-070). */
export const DEFAULT_MOLECULE_VACUUM = 10;

const f = (x: number, d: number): string => {
  const t = x.toFixed(d);
  return Number(t) === 0 ? (0).toFixed(d) : t;
};

/** Plain XYZ: count line, comment line, then "El x y z" in angstrom. */
export function writeXyz(
  species: readonly string[],
  positions: readonly Vec3[],
  comment = 'molecule',
): string {
  const lines = [String(species.length), comment.replace(/[\r\n]+/g, ' ')];
  species.forEach((el, i) => lines.push(`${el} ${positions[i]!.map((x) => f(x, 8)).join(' ')}`));
  return lines.join('\n') + '\n';
}

const pad = (s: string | number, w: number): string => String(s).padStart(w);

/** V2000 MOL block with 3D coordinates. Aromatic bonds are written as type 4; charges as "M  CHG" lines. */
export function writeMolBlock(g: MolGraph, positions: readonly Vec3[], title = 'molecule'): string {
  if (g.atoms.length > 999 || g.bonds.length > 999)
    throw new RangeError('V2000 MOL blocks hold at most 999 atoms and bonds.');
  if (g.atoms.some((a) => a.hCount > 0))
    throw new RangeError('Expand the hydrogens first: every atom needs coordinates.');
  const out = [
    title.replace(/[\r\n]+/g, ' ').slice(0, 80),
    '  DFT-Handbook      3D',
    '',
    `${pad(g.atoms.length, 3)}${pad(g.bonds.length, 3)}  0  0  0  0  0  0  0  0999 V2000`,
  ];
  g.atoms.forEach((a, i) => {
    const p = positions[i]!;
    out.push(
      `${p.map((x) => pad(f(x, 4), 10)).join('')} ${a.el.padEnd(3)} 0  0  0  0  0  0  0  0  0  0  0  0`,
    );
  });
  for (const b of g.bonds) {
    const t = b.order === 'aromatic' ? 4 : b.order;
    out.push(`${pad(b.a + 1, 3)}${pad(b.b + 1, 3)}${pad(t, 3)}  0`);
  }
  const charged = g.atoms.map((a, i) => ({ i, q: a.charge })).filter((x) => x.q !== 0);
  for (let k = 0; k < charged.length; k += 8) {
    const chunk = charged.slice(k, k + 8);
    out.push(`M  CHG${pad(chunk.length, 3)}${chunk.map((c) => `${pad(c.i + 1, 4)}${pad(c.q, 4)}`).join('')}`);
  }
  out.push('M  END');
  return out.join('\n') + '\n';
}

export interface BoxOptions {
  /** Empty space between the molecule and each periodic image, angstrom (default 10). */
  vacuumA?: number;
  coordinates?: 'direct' | 'cartesian';
  comment?: string;
}
export interface BoxResult {
  structure: Structure;
  /** Cube edge, angstrom. */
  edge: number;
  poscar: string;
  notes: string[];
}

/** Put the molecule at the centre of a cube whose edge is its largest extent plus the vacuum. */
export function moleculeInBox(
  species: readonly string[],
  positions: readonly Vec3[],
  opts: BoxOptions = {},
): BoxResult {
  if (!species.length || species.length !== positions.length)
    throw new RangeError('Give one position per atom.');
  const vac = opts.vacuumA ?? DEFAULT_MOLECULE_VACUUM;
  if (!(vac > 0)) throw new RangeError('The vacuum must be positive.');
  const lo = [0, 1, 2].map((d) => Math.min(...positions.map((p) => p[d]!)));
  const hi = [0, 1, 2].map((d) => Math.max(...positions.map((p) => p[d]!)));
  const extent = Math.max(...[0, 1, 2].map((d) => hi[d]! - lo[d]!));
  const edge = extent + vac;
  const mid = [0, 1, 2].map((d) => (lo[d]! + hi[d]!) / 2);
  const structure: Structure = {
    lattice: [
      [edge, 0, 0],
      [0, edge, 0],
      [0, 0, edge],
    ],
    species: [...species],
    frac: positions.map((p) => [0, 1, 2].map((d) => (p[d]! - mid[d]!) / edge + 0.5) as unknown as Vec3),
    comment: opts.comment ?? 'molecule in a box',
  };
  const poscar = writePoscar(structure, { coordinates: opts.coordinates ?? 'direct' }).text;
  return {
    structure,
    edge,
    poscar,
    notes: [
      `Cubic box of ${edge.toFixed(3)} angstrom: the molecule's largest extent plus ${vac} angstrom of vacuum, so every periodic image is at least ${vac} angstrom away (a convention; check that the energy no longer changes with a larger box).`,
      'Use Gamma-only k-points (a 1 x 1 x 1 Gamma-centred mesh, or the vasp_gam build): an isolated molecule has no band dispersion.',
      'Keep ISIF = 2 for a molecule: ISIF = 3 would let the box shrink and the vacuum collapse (rule V023).',
    ],
  };
}
