import { describe, expect, it } from 'vitest';
import { band, layout, NODE_H, NODE_W } from './mapLayout';

describe('mastery map layout', () => {
  const nodes = [
    { id: 'a', label: 'A', module: 1, prerequisites: [] },
    { id: 'b', label: 'B', module: 1, prerequisites: ['a'] },
    { id: 'c', label: 'C', module: 2, prerequisites: ['b'] },
  ];
  it('puts modules in columns and keeps nodes from overlapping', () => {
    const l = layout(nodes);
    const [a, b, c] = l.nodes;
    expect(a!.x).toBe(b!.x);
    expect(b!.y).toBeGreaterThanOrEqual(a!.y + NODE_H);
    expect(c!.x).toBeGreaterThanOrEqual(a!.x + NODE_W);
    expect(l.edges).toHaveLength(2);
    expect(l.width).toBeGreaterThan(c!.x + NODE_W - 1);
  });
  it('bands', () => {
    expect([band(undefined), band(0.5), band(0.95)]).toEqual(['new', 'learning', 'mastered']);
  });
});
