// Edges of the parallelepiped spanned by three vectors and centred on the origin, in scene coordinates (x, z, -y).
import type { Mat3 } from '../crystal/types';

export type ScenePoint = [number, number, number];
/** Physics (x, y, z) to scene (x, z, -y): z points up, handedness kept. */
export const toScene = (x: number, y: number, z: number): ScenePoint => [x, z, -y];

export function cellEdges(cell: Mat3): [ScenePoint, ScenePoint][] {
  const corners: ScenePoint[] = [];
  for (const a of [-0.5, 0.5])
    for (const b of [-0.5, 0.5])
      for (const c of [-0.5, 0.5])
        corners.push(
          toScene(
            a * cell[0][0] + b * cell[1][0] + c * cell[2][0],
            a * cell[0][1] + b * cell[1][1] + c * cell[2][1],
            a * cell[0][2] + b * cell[1][2] + c * cell[2][2],
          ),
        );
  // corner index = 4a + 2b + c; edges join corners that differ in one bit
  const pairs: [ScenePoint, ScenePoint][] = [];
  for (let i = 0; i < 8; i++)
    for (const bit of [1, 2, 4]) if (!(i & bit)) pairs.push([corners[i]!, corners[i | bit]!]);
  return pairs;
}
