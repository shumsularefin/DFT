import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../crystal/types';
import {
  FRAGMENTS,
  attachFragment,
  fragmentGeometry,
  fragmentOf,
  measure,
  moveAtoms,
  pruneOrders,
  removeAtom,
  setBondOrder,
  setDistance,
  standaloneFragment,
  usedValence,
  type EditMol,
} from './editor3d';
import { fillHydrogens, neighbours, orderKey, radiusOf } from './sketch3d';

const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const count = (s: string[], el: string) => s.filter((e) => e === el).length;
const methane = (): EditMol => {
  const h = fillHydrogens(['C'], [[0, 0, 0]]);
  return { species: ['C', ...h.map(() => 'H')], positions: [[0, 0, 0], ...h], orders: new Map() };
};
/** No two atoms closer than 0.8 times the sum of their covalent radii. */
const noClash = (m: EditMol) => {
  for (let i = 0; i < m.species.length; i++)
    for (let j = i + 1; j < m.species.length; j++)
      expect(dist(m.positions[i]!, m.positions[j]!)).toBeGreaterThan(
        0.8 * (radiusOf(m.species[i]!) + radiusOf(m.species[j]!)),
      );
};

describe('templates', () => {
  it('every template builds, its attach atom has one open valence, and none clashes', () => {
    for (const f of FRAGMENTS) {
      const g = fragmentGeometry(f.id);
      expect(g.species.length, f.id).toBeGreaterThan(0);
      const s = standaloneFragment(f.id);
      expect(s.species.length, f.id).toBe(g.species.length + 1);
      noClash(s);
    }
  });

  it('the benzene template on its own is C6H6 with aromatic ring bonds', () => {
    const s = standaloneFragment('benzene');
    expect(count(s.species, 'C')).toBe(6);
    expect(count(s.species, 'H')).toBe(6);
    expect([...s.orders.values()].every((o) => o === 1.5)).toBe(true);
    expect(s.orders.size).toBe(6);
  });
});

describe('attachFragment', () => {
  it('a methyl on methane replaces one hydrogen and gives ethane, C2H6', () => {
    const { mol, attach } = attachFragment(methane(), 0, 'ch3');
    expect(count(mol.species, 'C')).toBe(2);
    expect(count(mol.species, 'H')).toBe(6);
    expect(dist(mol.positions[0]!, mol.positions[attach]!)).toBeCloseTo(2 * radiusOf('C'), 6);
    noClash(mol);
  });

  it('picking a hydrogen puts the group in its place', () => {
    const m = methane();
    const { mol } = attachFragment(m, 1, 'oh');
    expect(count(mol.species, 'H')).toBe(4);
    expect(count(mol.species, 'O')).toBe(1);
    const o = mol.species.indexOf('O');
    expect(dist(mol.positions[0]!, mol.positions[o]!)).toBeCloseTo(radiusOf('C') + radiusOf('O'), 6);
  });

  it('a benzene ring on methane gives toluene, C7H8, with a flat ring and its orders shifted', () => {
    const { mol, attach } = attachFragment(methane(), 0, 'benzene');
    expect(count(mol.species, 'C')).toBe(7);
    expect(count(mol.species, 'H')).toBe(8);
    expect(mol.orders.size).toBe(6);
    for (const k of mol.orders.keys()) {
      const [a, b] = k.split('-').map(Number) as [number, number];
      expect(a).toBeGreaterThanOrEqual(attach);
      expect(neighbours(mol.species, mol.positions, a)).toContain(b);
    }
    noClash(mol);
    // The ring carbon that bonds to the methyl keeps a trigonal (in-plane) bond: about 120 degrees.
    const nb = neighbours(mol.species, mol.positions, attach).filter((j) => j !== 0);
    const u = mol.positions[0]!.map((x, i) => x - mol.positions[attach]![i]!) as unknown as Vec3;
    const v = mol.positions[nb[0]!]!.map((x, i) => x - mol.positions[attach]![i]!) as unknown as Vec3;
    const ang =
      (Math.acos((u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) / (Math.hypot(...u) * Math.hypot(...v))) * 180) /
      Math.PI;
    expect(ang).toBeGreaterThan(110);
    expect(ang).toBeLessThan(130);
  });
});

describe('bond orders and hydrogens', () => {
  it('a C=O double bond leaves two hydrogens on the carbon (formaldehyde)', () => {
    const species = ['C', 'O'];
    const positions: Vec3[] = [
      [0, 0, 0],
      [radiusOf('C') + radiusOf('O'), 0, 0],
    ];
    const m = setBondOrder({ species, positions, orders: new Map() }, 0, 1, 2);
    expect(m.orders.get(orderKey(0, 1))).toBe(2);
    expect(usedValence(m, 0)).toBe(2);
    const h = fillHydrogens(species, positions, m.orders);
    expect(h).toHaveLength(2);
    // Without the order, single bonds are assumed: three on carbon and one on oxygen.
    expect(fillHydrogens(species, positions)).toHaveLength(4);
  });

  it('refuses an order for atoms that are not bonded, and setting 1 clears it', () => {
    const m = methane();
    expect(() => setBondOrder(m, 1, 2, 2)).toThrow(RangeError);
    const d = setBondOrder(m, 0, 1, 2);
    expect(setBondOrder(d, 0, 1, 1).orders.size).toBe(0);
  });

  it('removing an atom shifts the order keys, and pruning drops broken bonds', () => {
    const m: EditMol = { ...methane(), orders: new Map([[orderKey(0, 4), 2]]) };
    expect([...removeAtom(m, 2).orders.keys()]).toEqual(['0-3']);
    expect(removeAtom(m, 4).orders.size).toBe(0);
    const far = { ...m, positions: m.positions.map((p, i) => (i === 4 ? ([9, 9, 9] as Vec3) : p)) };
    expect(pruneOrders(far).size).toBe(0);
  });
});

describe('moving and measuring', () => {
  it('setDistance moves the far side of a bond, not the near side', () => {
    const e = attachFragment(methane(), 0, 'ch3').mol;
    const c2 = e.species.lastIndexOf('C');
    const next = setDistance(e.positions, e.species, 0, c2, 1.8);
    expect(dist(next[0]!, next[c2]!)).toBeCloseTo(1.8, 9);
    // The methyl's hydrogens moved with it, the first carbon's did not.
    const side = fragmentOf(e.species, e.positions, c2, [0, c2]);
    expect(side).toHaveLength(4);
    for (const k of side)
      if (k !== c2) expect(dist(next[k]!, next[c2]!)).toBeCloseTo(dist(e.positions[k]!, e.positions[c2]!), 9);
    expect(next[1]).toEqual(e.positions[1]);
  });

  it('moveAtoms shifts only the chosen atoms', () => {
    const p: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
    ];
    expect(moveAtoms(p, [1], [0, 0, 2])).toEqual([
      [0, 0, 0],
      [1, 0, 2],
    ]);
  });

  it('measures a distance, a right angle and a 90 degree dihedral', () => {
    const p: Vec3[] = [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [0, 1, 1],
    ];
    expect(measure(p, [0, 1])!.value).toBeCloseTo(1, 9);
    expect(measure(p, [0, 1, 2])!.value).toBeCloseTo(90, 9);
    expect(Math.abs(measure(p, [0, 1, 2, 3])!.value)).toBeCloseTo(90, 9);
    expect(measure(p, [0])).toBeNull();
  });
});
