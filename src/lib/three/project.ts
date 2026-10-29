// Orthographic projection used by the 2D fallback: rotate about the vertical axis (azimuth), then about the
// horizontal axis (elevation), and drop depth. Angles in degrees. Pure geometry, no physics.
export type Vec3 = [number, number, number];

export function project(
  [x, y, z]: Vec3,
  azimuthDeg: number,
  elevationDeg: number,
): { x: number; y: number; depth: number } {
  const a = (azimuthDeg * Math.PI) / 180;
  const e = (elevationDeg * Math.PI) / 180;
  const x1 = x * Math.cos(a) + z * Math.sin(a);
  const z1 = -x * Math.sin(a) + z * Math.cos(a);
  const y2 = y * Math.cos(e) - z1 * Math.sin(e);
  const z2 = y * Math.sin(e) + z1 * Math.cos(e);
  return { x: x1, y: y2, depth: z2 };
}
