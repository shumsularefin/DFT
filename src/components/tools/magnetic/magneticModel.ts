// Pure model for the magnetic tool UI: builds configurations from the controls and turns one into a SceneSpec.
// Kept out of the component so it can be unit tested without a DOM.
import type { Structure } from '../../../lib/crystal/types';
import { MagneticError, selectMagneticSites } from '../../../lib/magnetism/sublattice';
import {
  commonSupercell,
  namedOrdering,
  type MagneticConfiguration,
  type NamedKind,
  type OrderingRequest,
} from '../../../lib/magnetism/orderings';
import { determinant } from '../../../lib/crystal/supercell';
import type { SceneSpec } from '../../../lib/scene/spec';

export const NAMED: readonly NamedKind[] = ['FM', 'A', 'C', 'G', 'RS2'];
export const BATCH_DEFAULT: readonly NamedKind[] = ['FM', 'A', 'C', 'G'];
export type Axis = 'auto' | 0 | 1 | 2;
const ANIONS = ['O', 'F', 'Cl', 'Br', 'S', 'Se', 'N'];

/** A short illustrative cubic perovskite for the "try an example" button. Not a claim about a real material. */
export const EXAMPLE_POSCAR = `SrMnO3-like cubic perovskite (illustrative geometry)
1.0
3.905 0.0 0.0
0.0 3.905 0.0
0.0 0.0 3.905
Sr Mn O
1 1 3
Direct
0.0 0.0 0.0
0.5 0.5 0.5
0.5 0.0 0.5
0.0 0.5 0.5
0.5 0.5 0.0
`;

export const request = (kind: NamedKind, axis: Axis): OrderingRequest =>
  (kind === 'A' || kind === 'C') && axis !== 'auto' ? { kind, axis } : { kind };

export interface Built {
  /** The configuration of the active tab, when it is a named ordering. */
  current?: MagneticConfiguration;
  /** Every configuration to export, in order. */
  batch: MagneticConfiguration[];
  det: number;
  error?: string;
}

/** Elements that could carry a moment, as a starting suggestion. */
export function suggestedElements(s: Structure): string[] {
  try {
    return [...new Set(selectMagneticSites(s).map((i) => s.species[i]!))];
  } catch {
    return [];
  }
}

const fail = (e: unknown): Built => ({
  batch: [],
  det: 1,
  error: e instanceof MagneticError || e instanceof Error ? e.message : String(e),
});

/** Named orderings: one common cell for all (default) or the smallest cell of each. */
export function buildNamed(
  s: Structure,
  kinds: readonly NamedKind[],
  current: NamedKind | null,
  axis: Axis,
  elements: readonly string[],
  common: boolean,
): Built {
  try {
    const all = [...new Set([...kinds, ...(current ? [current] : [])])];
    if (all.length === 0) return { batch: [], det: 1 };
    const opts = { elements };
    if (common) {
      const { matrix, configurations } = commonSupercell(
        s,
        all.map((k) => request(k, axis)),
        opts,
      );
      const by = new Map(all.map((k, i) => [k, configurations[i]!]));
      return {
        ...(current ? { current: by.get(current)! } : {}),
        batch: kinds.map((k) => by.get(k)!),
        det: determinant(matrix),
      };
    }
    const by = new Map(all.map((k) => [k, namedOrdering(s, request(k, axis) as never, opts)]));
    const cfgs = kinds.map((k) => by.get(k)!);
    const cur = current ? by.get(current)! : undefined;
    return { ...(cur ? { current: cur } : {}), batch: cfgs, det: cur ? determinant(cur.matrix) : 1 };
  } catch (e) {
    return fail(e);
  }
}

/** A SceneSpec for a configuration: arrows from signs times the magnitude entered (1 when none yet). */
export function sceneFor(
  c: MagneticConfiguration,
  magnitudes: Readonly<Record<string, number>>,
  opts: { polyhedra: boolean; repeat: boolean; selected?: number | null },
): SceneSpec {
  const s = c.structure;
  const spins = s.species.map((el, j) => {
    const m = c.magnitudes?.[j] ?? magnitudes[el];
    return c.signs[j]! * (m && m > 0 ? m : 1);
  });
  const centres = [...new Set(c.magneticSites.map((j) => s.species[j]!))];
  const ligands = ANIONS.filter((a) => s.species.includes(a) && !centres.includes(a));
  const up = c.signs.filter((x) => x > 0).length;
  const down = c.signs.filter((x) => x < 0).length;
  // draw the chain or stacking axis when it is parallel to a cell vector
  const vectors: NonNullable<SceneSpec['vectors']> = [];
  if (c.axis) {
    const v = c.axis.vector;
    s.lattice.forEach((row, i) => {
      const d = row[0] * v[0] + row[1] * v[1] + row[2] * v[2];
      const n = Math.hypot(...row) * Math.hypot(...v);
      if (n > 0 && Math.abs(d) / n > 0.99)
        vectors.push({ space: 'real', index: i as 0 | 1 | 2, label: 'axis' });
    });
  }
  return {
    id: `magnetic-${c.kind.toLowerCase()}`,
    badge: 'computed',
    alt: `${c.label}: ${s.species.length} atoms, ${up} magnetic site${up === 1 ? '' : 's'} up and ${down} down. Arrows point up for positive moments and down for negative ones.`,
    caption: `${c.label}. The geometry is computed from your cell. The arrow lengths show the starting moments you entered, or equal lengths until you enter them.`,
    structure: s,
    ...(opts.repeat ? { repeat: [2, 2, 2] as [number, number, number] } : {}),
    show: {
      atoms: true,
      bonds: false,
      cell: true,
      labels: false,
      ...(opts.polyhedra && ligands.length
        ? { polyhedra: { centre: centres, ligand: ligands, cutoffA: 2.6 } }
        : {}),
    },
    spins,
    ...(vectors.length ? { vectors } : {}),
    ...(opts.selected != null ? { highlight: [opts.selected] } : {}),
    camera: 'iso',
  };
}
