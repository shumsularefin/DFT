// A small SVG line and marker plotter with the slice of the Plotly.newPlot API that DFT Studio uses.
// It replaces the 3.5 MB Plotly bundle, which the site CSP ('self' only) could not load from a CDN.

interface Axis {
  title?: string | { text?: string };
  range?: [number, number];
  showticklabels?: boolean;
}
interface Trace {
  x: number[];
  y: number[];
  mode?: string;
  name?: string;
  line?: { width?: number; color?: string; dash?: string };
  showlegend?: boolean;
}
interface Shape {
  type?: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  yref?: string;
  xref?: string;
  line?: { width?: number; color?: string; dash?: string };
}
interface Layout {
  title?: string | { text?: string };
  xaxis?: Axis;
  yaxis?: Axis;
  shapes?: Shape[];
  paper_bgcolor?: string;
  font?: { color?: string; family?: string };
  showlegend?: boolean;
}

const PALETTE = ['#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];
const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const text = (t: Axis['title'] | Layout['title']) => (typeof t === 'string' ? t : (t?.text ?? ''));

/** "Nice" tick values between lo and hi (about n of them). */
export function niceTicks(lo: number, hi: number, n = 6): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step)
    out.push(Number(v.toPrecision(12)));
  return out;
}

function extent(vals: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of vals) {
    if (!Number.isFinite(v)) continue;
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 1, hi + 1];
  const pad = (hi - lo) * 0.04;
  return [lo - pad, hi + pad];
}

const fmt = (v: number) =>
  Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(1) : String(v);

export function renderPlot(traces: Trace[], layout: Layout, width: number, height: number): string {
  const fg = layout.font?.color || '#4b5563';
  const bg = layout.paper_bgcolor || 'transparent';
  const title = text(layout.title);
  const m = { t: title ? 30 : 12, r: 14, b: 44, l: 58 };
  const named = traces.filter((t) => t.name && t.showlegend !== false);
  const legendRows = layout.showlegend === false || traces.length < 2 ? 0 : Math.ceil(named.length / 3);
  m.b += legendRows * 16;
  const W = Math.max(width, 200);
  const H = Math.max(height, 160);
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const xr = layout.xaxis?.range ?? extent(traces.flatMap((t) => t.x));
  const yr = layout.yaxis?.range ?? extent(traces.flatMap((t) => t.y));
  const X = (v: number) => m.l + ((v - xr[0]) / (xr[1] - xr[0] || 1)) * pw;
  const Y = (v: number) => m.t + ph - ((v - yr[0]) / (yr[1] - yr[0] || 1)) * ph;
  const grid = 'rgba(128,128,128,0.22)';
  const parts: string[] = [];
  parts.push(`<rect width="${W}" height="${H}" fill="${bg}"/>`);
  if (title)
    parts.push(
      `<text x="${W / 2}" y="18" text-anchor="middle" font-size="12" font-weight="600">${esc(title)}</text>`,
    );
  for (const v of niceTicks(yr[0], yr[1])) {
    const y = Y(v);
    parts.push(`<line x1="${m.l}" x2="${m.l + pw}" y1="${y}" y2="${y}" stroke="${grid}"/>`);
    if (layout.yaxis?.showticklabels !== false)
      parts.push(`<text x="${m.l - 5}" y="${y + 3.5}" text-anchor="end" font-size="10">${fmt(v)}</text>`);
  }
  for (const v of niceTicks(xr[0], xr[1])) {
    const x = X(v);
    parts.push(`<line x1="${x}" x2="${x}" y1="${m.t}" y2="${m.t + ph}" stroke="${grid}"/>`);
    if (layout.xaxis?.showticklabels !== false)
      parts.push(`<text x="${x}" y="${m.t + ph + 14}" text-anchor="middle" font-size="10">${fmt(v)}</text>`);
  }
  parts.push(`<rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" stroke="${grid}"/>`);
  const xt = text(layout.xaxis?.title);
  const yt = text(layout.yaxis?.title);
  if (xt)
    parts.push(
      `<text x="${m.l + pw / 2}" y="${m.t + ph + 32}" text-anchor="middle" font-size="11">${esc(xt)}</text>`,
    );
  if (yt)
    parts.push(
      `<text transform="translate(14 ${m.t + ph / 2}) rotate(-90)" text-anchor="middle" font-size="11">${esc(yt)}</text>`,
    );
  const dash = (d?: string) =>
    d === 'dot' ? ' stroke-dasharray="2 3"' : d === 'dash' ? ' stroke-dasharray="6 4"' : '';
  for (const s of layout.shapes ?? []) {
    const y0 = s.yref === 'paper' ? m.t + ph - s.y0 * ph : Y(s.y0);
    const y1 = s.yref === 'paper' ? m.t + ph - s.y1 * ph : Y(s.y1);
    const x0 = s.xref === 'paper' ? m.l + s.x0 * pw : X(s.x0);
    const x1 = s.xref === 'paper' ? m.l + s.x1 * pw : X(s.x1);
    parts.push(
      `<line x1="${x0}" x2="${x1}" y1="${y0}" y2="${y1}" stroke="${s.line?.color ?? grid}" stroke-width="${s.line?.width ?? 1}"${dash(s.line?.dash)}/>`,
    );
  }
  const clip = `mp${Math.random().toString(36).slice(2, 8)}`;
  parts.push(`<clipPath id="${clip}"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath>`);
  const series: string[] = [];
  traces.forEach((t, i) => {
    const color = t.line?.color ?? PALETTE[i % PALETTE.length]!;
    const mode = t.mode ?? 'lines';
    const pts: string[] = [];
    for (let k = 0; k < Math.min(t.x.length, t.y.length); k++) {
      const xv = t.x[k]!;
      const yv = t.y[k]!;
      if (Number.isFinite(xv) && Number.isFinite(yv)) pts.push(`${X(xv).toFixed(1)},${Y(yv).toFixed(1)}`);
    }
    if (mode.includes('lines') && pts.length > 1)
      series.push(
        `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="${t.line?.width ?? 1.6}"${dash(t.line?.dash)}/>`,
      );
    if (mode.includes('markers'))
      for (const p of pts) {
        const [cx, cy] = p.split(',');
        series.push(`<circle cx="${cx}" cy="${cy}" r="3" fill="${color}"/>`);
      }
  });
  parts.push(`<g clip-path="url(#${clip})">${series.join('')}</g>`);
  if (legendRows) {
    named.forEach((t, i) => {
      const color = t.line?.color ?? PALETTE[traces.indexOf(t) % PALETTE.length]!;
      const lx = m.l + (i % 3) * (pw / 3);
      const ly = H - legendRows * 16 + Math.floor(i / 3) * 16 + 4;
      parts.push(`<rect x="${lx}" y="${ly}" width="12" height="3" fill="${color}"/>`);
      parts.push(`<text x="${lx + 16}" y="${ly + 4}" font-size="10">${esc(t.name!)}</text>`);
    });
  }
  const label = [title, yt && `${yt} against ${xt}`].filter(Boolean).join(': ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" height="100%" role="img" aria-label="${esc(label || 'Plot')}" fill="${fg}" style="font-family:inherit">${parts.join('')}</svg>`;
}

export const MiniPlotly = {
  newPlot(div: string | HTMLElement, traces: Trace[], layout: Layout = {}): void {
    const el = typeof div === 'string' ? document.getElementById(div) : div;
    if (!el) return;
    const draw = () => {
      el.innerHTML = renderPlot(traces, layout, el.clientWidth || 600, el.clientHeight || 300);
    };
    draw();
    if (typeof ResizeObserver !== 'undefined') {
      const prev = (el as HTMLElement & { _mpRo?: ResizeObserver })._mpRo;
      prev?.disconnect();
      const ro = new ResizeObserver(() => draw());
      ro.observe(el);
      (el as HTMLElement & { _mpRo?: ResizeObserver })._mpRo = ro;
    }
  },
};
