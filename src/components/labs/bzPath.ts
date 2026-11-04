// Turns a k-path result (either convention) into what the Brillouin zone picture needs: Cartesian points and segments.
import { qToCartesian } from '../../lib/crystal/kmesh';
import type { KPathConvention } from '../../lib/crystal/kpath';
import type { KPathResult } from '../../lib/crystal/kpath/hpkot';
import type { SetyawanResult } from '../../lib/crystal/kpath/setyawan';
import type { Mat3, Vec3 } from '../../lib/crystal/types';

export interface PathPicture {
  recip: Mat3;
  points: { label: string; k: Vec3 }[];
  segments: [Vec3, Vec3][];
  text: string[];
  warnings: string[];
  name: string;
}

export function analyzeResultToPath(
  r: KPathResult | SetyawanResult,
  convention: KPathConvention,
  display: (c: KPathConvention, label: string) => string,
): PathPicture {
  const b = r.reciprocalPrimitive;
  const cart = (label: string): Vec3 => qToCartesian(r.pointCoords[label] ?? [0, 0, 0], b);
  const used = new Set<string>();
  const segments: [Vec3, Vec3][] = [];
  for (const [a, c] of r.path) {
    used.add(a);
    used.add(c);
    segments.push([cart(a), cart(c)]);
  }
  const points = [...used]
    .filter((l) => display(convention, l) !== 'Γ')
    .map((l) => ({ label: display(convention, l), k: cart(l) }));
  const text = r.path.map(([a, c]) => `${display(convention, a)} to ${display(convention, c)}`);
  return {
    recip: b,
    points,
    segments,
    text,
    warnings: r.warnings,
    name: convention === 'HPKOT' ? 'HPKOT' : 'Setyawan-Curtarolo',
  };
}
