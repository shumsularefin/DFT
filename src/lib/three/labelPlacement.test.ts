import { describe, expect, it } from 'vitest';
import { placeLabels, type LabelBox } from './labelPlacement';

const rect = (b: LabelBox, o: { dx: number; dy: number }) => ({
  l: b.x + o.dx - b.w / 2,
  r: b.x + o.dx + b.w / 2,
  t: b.y + o.dy - b.h / 2,
  b: b.y + o.dy + b.h / 2,
});
const overlap = (p: ReturnType<typeof rect>, q: ReturnType<typeof rect>) =>
  Math.min(p.r, q.r) > Math.max(p.l, q.l) && Math.min(p.b, q.b) > Math.max(p.t, q.t);

describe('placeLabels', () => {
  const bounds = { w: 400, h: 300 };
  it('a lone label goes above right of its anchor', () => {
    const [o] = placeLabels([{ x: 200, y: 150, w: 20, h: 10 }], bounds);
    expect(o).toEqual({ dx: 18, dy: -13 });
  });
  it('two labels at the same anchor do not overlap', () => {
    const boxes: LabelBox[] = [
      { x: 200, y: 150, w: 30, h: 14 },
      { x: 200, y: 150, w: 30, h: 14 },
    ];
    const o = placeLabels(boxes, bounds);
    expect(overlap(rect(boxes[0]!, o[0]!), rect(boxes[1]!, o[1]!))).toBe(false);
  });
  it('twelve labels packed on one spot are all placed, and the first keeps its preferred spot', () => {
    const boxes: LabelBox[] = Array.from({ length: 12 }, () => ({ x: 200, y: 150, w: 24, h: 12 }));
    const o = placeLabels(boxes, bounds);
    expect(o).toHaveLength(12);
    expect(o[0]).toEqual({ dx: 20, dy: -14 });
  });
  it('keeps a label inside the view next to an edge', () => {
    const b: LabelBox = { x: 395, y: 5, w: 30, h: 14 };
    const [o] = placeLabels([b], bounds);
    const r = rect(b, o!);
    expect(r.l).toBeGreaterThanOrEqual(0);
    expect(r.r).toBeLessThanOrEqual(400);
    expect(r.t).toBeGreaterThanOrEqual(0);
    expect(r.b).toBeLessThanOrEqual(300);
  });
  it('is deterministic', () => {
    const boxes: LabelBox[] = [
      { x: 10, y: 10, w: 20, h: 10 },
      { x: 12, y: 12, w: 20, h: 10 },
    ];
    expect(placeLabels(boxes, bounds)).toEqual(placeLabels(boxes, bounds));
  });
});
