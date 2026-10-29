import { describe, expect, it } from 'vitest';
import { project } from './project';

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 12);

describe('project', () => {
  it('is the identity on x and y at zero angles', () => {
    const p = project([1, 2, 3], 0, 0);
    close(p.x, 1);
    close(p.y, 2);
    close(p.depth, 3);
  });
  it('a quarter turn of azimuth moves the x axis into depth', () => {
    const p = project([1, 0, 0], 90, 0);
    close(p.x, 0);
    close(p.y, 0);
    close(p.depth, -1);
  });
  it('a quarter turn of elevation moves the z axis onto the screen vertical', () => {
    const p = project([0, 0, 1], 0, 90);
    close(p.x, 0);
    close(p.y, -1);
    close(p.depth, 0);
  });
  it('preserves the length of a vector', () => {
    const p = project([1, 2, 3], 37, 21);
    close(Math.hypot(p.x, p.y, p.depth), Math.hypot(1, 2, 3));
  });
});

import { cubeEdges, DEMO_POINTS } from './demo-geometry';
describe('demo geometry', () => {
  it('a cube has 12 edges, each of length 2h, and the cluster has 27 points', () => {
    const edges = cubeEdges(1.5);
    expect(edges).toHaveLength(12);
    for (const [a, b] of edges) close(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), 3);
    expect(DEMO_POINTS).toHaveLength(27);
  });
});
