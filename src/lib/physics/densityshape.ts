// Smooth positive 1D density shapes for the density-as-a-map lab: a cubic spline through control heights in the
// logarithm of the density (so the density is positive everywhere), pinned to a tiny value at the two walls.
// This is an interpolation recipe for a lab input, not physics; the physics starts when the density is handed to
// potentialFromDensity.

export const CONTROL_X = [-4, -8 / 3, -4 / 3, 0, 4 / 3, 8 / 3, 4] as const;
const WALL_X = 6;
const WALL_VALUE = 1e-6;
const MIN_HEIGHT = 0.002;

/** Positive shape f(x) through (x_j, v_j), v_j in (0, 1]; zero-ish at |x| = 6. */
export function shapeFromHeights(heights: readonly number[]): (x: number) => number {
  const xs = [-WALL_X, ...CONTROL_X, WALL_X];
  const ys = [
    Math.log(WALL_VALUE),
    ...heights.map((v) => Math.log(Math.max(v, MIN_HEIGHT))),
    Math.log(WALL_VALUE),
  ];
  const m = xs.map((_, j) => {
    const a = Math.max(j - 1, 0);
    const b = Math.min(j + 1, xs.length - 1);
    return (ys[b]! - ys[a]!) / (xs[b]! - xs[a]!);
  });
  return (x) => {
    if (x <= xs[0]! || x >= xs[xs.length - 1]!) return WALL_VALUE;
    let j = 0;
    while (xs[j + 1]! < x) j++;
    const h = xs[j + 1]! - xs[j]!;
    const t = (x - xs[j]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const y =
      (2 * t3 - 3 * t2 + 1) * ys[j]! +
      (t3 - 2 * t2 + t) * h * m[j]! +
      (-2 * t3 + 3 * t2) * ys[j + 1]! +
      (t3 - t2) * h * m[j + 1]!;
    return Math.exp(y);
  };
}

export type PresetId = 'gaussian' | 'two-bumps' | 'lopsided';
export const PRESETS: { id: PresetId; label: string; f: (x: number) => number }[] = [
  { id: 'gaussian', label: 'One smooth bump', f: (x) => Math.exp(-(x * x) / 2.25) },
  {
    id: 'two-bumps',
    label: 'Two bumps',
    f: (x) => Math.exp(-((x - 2) ** 2) / 1.6) + Math.exp(-((x + 2) ** 2) / 1.6),
  },
  {
    id: 'lopsided',
    label: 'Lopsided',
    f: (x) => Math.exp(-((x + 1) ** 2) / 1.2) + 0.5 * Math.exp(-((x - 2) ** 2) / 2.4),
  },
];

/** Control heights (peak = 1) that make the spline follow a preset. */
export function presetHeights(id: PresetId): number[] {
  const f = PRESETS.find((p) => p.id === id)!.f;
  let peak = 0;
  for (let x = -6; x <= 6; x += 0.01) peak = Math.max(peak, f(x));
  return CONTROL_X.map((x) => Math.min(1, Math.max(MIN_HEIGHT, f(x) / peak)));
}
