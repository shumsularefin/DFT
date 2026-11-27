// Element colours and two-tone bonds for scenes that place real atoms by hand instead of through `crystalLayers` (D-122).
// Not a scene module: the name must not start with "m" (the scene glob is ./m*.ts).
import { covalentRadius } from '../../crystal/covalent';
import { elementColor, VESTA_SIZES } from '../../three/vestaStyle';
import type { Color, LinesLayer, Vec3 } from '../types';

/** The element colour of a symbol or a label that starts with one ("Fe", "Fe 1", "Fe_up"), as a layer colour. */
export const elementTone = (symbol: string): Color => elementColor(symbol) as Color;

/** Drawing radius of an atom of an element: covalent radius x the shared atom scale. */
export const elementRadius = (symbol: string): number =>
  covalentRadius(symbol).radius * VESTA_SIZES.atomScale;

/** One bond between two atoms: the two end points and the element of the atom at each end. */
export interface ElementBond {
  a: Vec3;
  b: Vec3;
  ea: string;
  eb: string;
}

/**
 * Two-tone bonds as in `crystalLayers` and the Studio viewer: each half of a bond in the colour of the atom at its end,
 * one tube layer per element, all in `group`. The first layer carries `name` (the Layers menu reads it).
 */
export function twoToneBonds(bonds: readonly ElementBond[], group = 'bonds', name = 'Bonds'): LinesLayer[] {
  const halves = new Map<string, [Vec3, Vec3][]>();
  const take = (el: string, p: Vec3, q: Vec3) => {
    const c = elementColor(el);
    if (!halves.has(c)) halves.set(c, []);
    halves.get(c)!.push([p, q]);
  };
  for (const { a, b, ea, eb } of bonds) {
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    take(ea, a, mid);
    take(eb, mid, b);
  }
  const out: LinesLayer[] = [];
  for (const [color, segments] of halves) {
    const l: LinesLayer = {
      kind: 'lines',
      group,
      segments,
      color: color as Color,
      tube: VESTA_SIZES.bondRadius,
    };
    if (!out.length) l.name = name;
    out.push(l);
  }
  return out;
}
