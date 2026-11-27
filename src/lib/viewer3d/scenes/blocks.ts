// Shared solid blocks for the module 6 and 7 scenes (file blocks, cores, runs). Not a scene module: the registry only
// loads files named mXX.ts, so this helper is bundled into the chunks that import it.
import type { Color, MeshLayer, Vec3 } from '../types';

/** Axis-aligned boxes as one triangle mesh (file blocks, cores). */
export function boxMesh(
  boxes: { c: Vec3; s: Vec3 }[],
  o: { group: string; name?: string; color: Color; opacity?: number },
): MeshLayer {
  const positions: number[] = [];
  const indices: number[] = [];
  const F = [
    [0, 2, 1, 0, 3, 2],
    [4, 5, 6, 4, 6, 7],
    [0, 1, 5, 0, 5, 4],
    [2, 3, 7, 2, 7, 6],
    [1, 2, 6, 1, 6, 5],
    [0, 4, 7, 0, 7, 3],
  ].flat();
  for (const { c, s } of boxes) {
    const base = positions.length / 3;
    for (const [dx, dy, dz] of [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ] as const)
      positions.push(c[0] + (dx * s[0]) / 2, c[1] + (dy * s[1]) / 2, c[2] + (dz * s[2]) / 2);
    for (const i of F) indices.push(base + i);
  }
  const layer: MeshLayer = { kind: 'mesh', group: o.group, positions, indices, color: o.color, edges: true };
  if (o.name) layer.name = o.name;
  if (o.opacity !== undefined) layer.opacity = o.opacity;
  return layer;
}
