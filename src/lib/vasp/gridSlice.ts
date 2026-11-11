// Cross-section of a periodic grid (index ix + nx * (iy + ny * iz)) at fixed index along one axis, in grid coordinates,
// and colour maps for it. For a non-orthogonal cell the picture is in grid (fractional) coordinates, not to scale.
export type Axis = 0 | 1 | 2;

export interface Slice {
  width: number;
  height: number;
  /** Row-major, row 0 is the lowest index of the second in-plane axis. */
  data: Float64Array;
  min: number;
  max: number;
}

/** In-plane axes for a slice perpendicular to `axis`: [horizontal, vertical]. */
export const planeAxes = (axis: Axis): [Axis, Axis] => (axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]);

export function sliceGrid(
  values: ArrayLike<number>,
  dims: readonly [number, number, number],
  axis: Axis,
  index: number,
): Slice {
  const [nx, ny] = dims;
  const [h, v] = planeAxes(axis);
  const width = dims[h];
  const height = dims[v];
  const idx = Math.max(0, Math.min(dims[axis] - 1, Math.round(index)));
  const data = new Float64Array(width * height);
  let min = Infinity;
  let max = -Infinity;
  for (let j = 0; j < height; j++)
    for (let i = 0; i < width; i++) {
      const c: [number, number, number] = [0, 0, 0];
      c[axis] = idx;
      c[h] = i;
      c[v] = j;
      const val = values[c[0] + nx * (c[1] + ny * c[2])]!;
      data[i + width * j] = val;
      if (val < min) min = val;
      if (val > max) max = val;
    }
  return { width, height, data, min, max };
}

const lerp = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const STOPS: [number, number, number][] = [
  [68, 1, 84],
  [59, 82, 139],
  [33, 145, 140],
  [94, 201, 98],
  [253, 231, 37],
];
/** Sequential map (dark purple to yellow, Viridis anchor colours) for t in [0, 1]. */
export function sequential(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const a = STOPS[i]!;
  const b = STOPS[i + 1]!;
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f)];
}
/** Diverging blue-white-orange map for t in [-1, 1] (zero is white). */
export function diverging(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(-1, t));
  const end: [number, number, number] = x >= 0 ? [213, 94, 0] : [0, 114, 178];
  const a = Math.abs(x);
  return [lerp(255, end[0], a), lerp(255, end[1], a), lerp(255, end[2], a)];
}
