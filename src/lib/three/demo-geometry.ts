// Plain geometry for the framework demo. No three.js here, so the 2D fallback can import it without pulling 3D code in.
import type { Vec3 } from './project';

export const DEMO_POINTS: Vec3[] = [];
for (const x of [-1, 0, 1])
  for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) DEMO_POINTS.push([x, y, z]);

/** The twelve edges of a cube with half-width `h`. */
export function cubeEdges(h: number): [Vec3, Vec3][] {
  const c: Vec3[] = [];
  for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) c.push([x, y, z]);
  const edges: [Vec3, Vec3][] = [];
  for (let i = 0; i < 8; i++)
    for (let j = i + 1; j < 8; j++) {
      const d = c[i]!.filter((v, k) => v !== c[j]![k]).length;
      if (d === 1) edges.push([c[i]!, c[j]!]);
    }
  return edges;
}
