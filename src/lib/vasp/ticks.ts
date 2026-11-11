// Round-number axis ticks (a drawing helper, not physics).
export function niceTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max === min) return [min];
  const raw = (max - min) / Math.max(1, target);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step - 1e-9) * step; v <= max + step * 1e-9; v += step)
    out.push(Math.abs(v) < step * 1e-9 ? 0 : Number(v.toPrecision(12)));
  return out;
}

export const fmt = (v: number, digits = 3): string =>
  Number.isFinite(v)
    ? Math.abs(v) >= 1e4 || (v !== 0 && Math.abs(v) < 1e-3)
      ? v.toExponential(2)
      : String(Number(v.toPrecision(digits)))
    : 'n/a';
