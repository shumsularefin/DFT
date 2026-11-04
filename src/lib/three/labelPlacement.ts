// Label placement for the 3D views (M5.5): puts each label next to its anchor point without overlapping labels already placed.
// Pure screen-space geometry, no physics. Anchors are in pixels, y down.
export interface LabelBox {
  /** Anchor point (the thing the label names) in pixels. */
  x: number;
  y: number;
  /** Label size in pixels. */
  w: number;
  h: number;
}
export interface LabelOffset {
  dx: number;
  dy: number;
}

const overlapArea = (
  a: { cx: number; cy: number; w: number; h: number },
  b: { cx: number; cy: number; w: number; h: number },
): number => {
  const ox = Math.min(a.cx + a.w / 2, b.cx + b.w / 2) - Math.max(a.cx - a.w / 2, b.cx - b.w / 2);
  const oy = Math.min(a.cy + a.h / 2, b.cy + b.h / 2) - Math.max(a.cy - a.h / 2, b.cy - b.h / 2);
  return ox > 0 && oy > 0 ? ox * oy : 0;
};

/**
 * Greedy placement in the given order (earlier labels win). For each label the candidates are tried in a fixed order:
 * above right, below right, above left, below left, right, left, above, below. The first with no overlap that stays
 * inside `bounds` is used; if none is free, the one with the least overlap. Returns the offset of the label centre
 * from its anchor, so the result is the same for the same input.
 */
export function placeLabels(
  boxes: readonly LabelBox[],
  bounds: { w: number; h: number },
  gap = 8,
): LabelOffset[] {
  const placed: { cx: number; cy: number; w: number; h: number }[] = [];
  const out: LabelOffset[] = [];
  for (const b of boxes) {
    const hx = b.w / 2 + gap;
    const hy = b.h / 2 + gap;
    const candidates: LabelOffset[] = [
      { dx: hx, dy: -hy },
      { dx: hx, dy: hy },
      { dx: -hx, dy: -hy },
      { dx: -hx, dy: hy },
      { dx: hx, dy: 0 },
      { dx: -hx, dy: 0 },
      { dx: 0, dy: -hy },
      { dx: 0, dy: hy },
    ];
    let best = candidates[0]!;
    let bestScore = Infinity;
    for (const c of candidates) {
      const box = { cx: b.x + c.dx, cy: b.y + c.dy, w: b.w, h: b.h };
      let score = 0;
      for (const p of placed) score += overlapArea(box, p);
      // leaving the view costs more than any overlap of equal area
      const outside =
        Math.max(0, box.w / 2 - box.cx) +
        Math.max(0, box.cx + box.w / 2 - bounds.w) +
        Math.max(0, box.h / 2 - box.cy) +
        Math.max(0, box.cy + box.h / 2 - bounds.h);
      score += outside * Math.max(box.w, box.h);
      if (score < bestScore) {
        bestScore = score;
        best = c;
        if (score === 0) break;
      }
    }
    placed.push({ cx: b.x + best.dx, cy: b.y + best.dy, w: b.w, h: b.h });
    out.push(best);
  }
  return out;
}
