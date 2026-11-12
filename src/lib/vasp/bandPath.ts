// x axis of a band plot: distance along the k-path and the labelled high-symmetry points.
// Distance is the running sum of |dk| in 1/Angstrom (with the factor 2 pi) when the reciprocal lattice is known, else in
// reciprocal-lattice units (not to scale). At the start of a new line-mode segment the distance does not advance, so a
// jump in the path shows as a joint, not as a long line. Labels come from a line-mode KPOINTS file (or KPOINTS_OPT) whose
// points-per-segment and segments match the number of k-points in the EIGENVAL.
// @source S-019 (VASP wiki: KPOINTS line mode, EIGENVAL), S-042
import { reciprocalLattice } from '../crystal/lattice';
import { vecMat } from '../crystal/linalg';
import type { Mat3, Vec3 } from '../crystal/types';
import type { LineSegment } from './kpoints';

export interface BandAxis {
  x: number[];
  ticks: { x: number; label: string }[];
  /** True when x is in 1/Angstrom. */
  toScale: boolean;
  warnings: string[];
}

const same = (a: Vec3, b: Vec3) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-6);
const pretty = (l: string) => (/^(gamma|g|\\gamma)$/i.test(l.trim()) ? 'Γ' : l.trim().replace(/^\\/, ''));

export function bandAxis(
  kpoints: readonly Vec3[],
  opts: { lattice?: Mat3; line?: { pointsPerSegment: number; segments: readonly LineSegment[] } } = {},
): BandAxis {
  const warnings: string[] = [];
  const B = opts.lattice ? reciprocalLattice(opts.lattice) : null;
  const cart = (k: Vec3): Vec3 => (B ? vecMat(k, B) : k);
  const line = opts.line;
  const nSeg = line?.segments.length ?? 0;
  const perSeg = line?.pointsPerSegment ?? 0;
  const matches = !!line && perSeg * nSeg === kpoints.length;
  if (line && !matches)
    warnings.push(
      `The KPOINTS file describes ${perSeg} x ${nSeg} = ${perSeg * nSeg} points but the EIGENVAL has ${kpoints.length}; labels are not drawn.`,
    );
  const x: number[] = [];
  let acc = 0;
  for (let i = 0; i < kpoints.length; i++) {
    if (i > 0 && !(matches && i % perSeg === 0)) {
      const a = cart(kpoints[i - 1]!);
      const b = cart(kpoints[i]!);
      acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    x.push(acc);
  }
  const ticks: BandAxis['ticks'] = [];
  if (matches && line) {
    line.segments.forEach((s, j) => {
      const start = j * perSeg;
      const end = start + perSeg - 1;
      const prev = line.segments[j - 1];
      if (!prev || !same(prev.to, s.from)) {
        const lab = s.fromLabel ? pretty(s.fromLabel) : '';
        if (prev && prev.toLabel && ticks.length) {
          // a jump: merge the two labels at one joint, as in "X|U"
          const t = ticks[ticks.length - 1]!;
          t.label = `${t.label}|${lab}`;
        } else ticks.push({ x: x[start]!, label: lab });
      }
      ticks.push({ x: x[end]!, label: s.toLabel ? pretty(s.toLabel) : '' });
    });
  }
  return { x, ticks, toScale: !!B, warnings };
}
