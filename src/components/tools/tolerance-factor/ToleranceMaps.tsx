import { useMemo, useRef, useState } from 'react';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import {
  buildCompositionHandoff,
  familySweep,
  MAP_BOUNDS,
  mixedSiteSweep,
  sweepToCsv,
  tauCurves,
} from '../../../lib/perovskite/maps';
import type { Evaluation } from '../../../lib/perovskite/checks';
import type { RadiusKind } from '../../../lib/perovskite/shannon';
import type { Occupant } from '../../../lib/perovskite/sites';
import type { LnCnPolicy } from '../../../lib/perovskite/urlState';
import { sendHandoff } from '../../../lib/handoff';

interface ToleranceMapsProps {
  A: Occupant[];
  B: Occupant[];
  X: Occupant[];
  kind: RadiusKind;
  lnPolicy: LnCnPolicy;
  evalRes: Evaluation;
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ToleranceMaps({ A, B, X, kind, lnPolicy, evalRes }: ToleranceMapsProps) {
  const [tab, setTab] = useState<'tmu' | 'tau' | 'family'>('tmu');
  const [sweepPolicy, setSweepPolicy] = useState<LnCnPolicy>(lnPolicy);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const f = evalRes.factors;
  const mixedLine = useMemo(() => {
    if (A.length > 1) return mixedSiteSweep(A, B, X, 'A', kind, 20);
    if (B.length > 1) return mixedSiteSweep(A, B, X, 'B', kind, 20);
    return [];
  }, [A, B, X, kind]);

  const familyRows = useMemo(() => familySweep(B, X, sweepPolicy, kind), [B, X, sweepPolicy, kind]);

  const tCurves = useMemo(() => (f ? tauCurves(f.rX / f.rB) : tauCurves(1.4 / 0.605)), [f]);

  // Dimensions for SVG plots
  const W = 540;
  const H = 300;
  const pad = { l: 54, r: 20, t: 20, b: 44 };

  const muScale = scaleLinear()
    .domain([0.2, 1.0])
    .range([pad.l, W - pad.r]);
  const tScale = scaleLinear()
    .domain([0.6, 1.2])
    .range([H - pad.b, pad.t]);

  const ratioScale = scaleLinear()
    .domain([1.1, 3.5])
    .range([pad.l, W - pad.r]);
  const tauScale = scaleLinear()
    .domain([-2, 12])
    .range([H - pad.b, pad.t]);

  const famX = scaleLinear()
    .domain([0, Math.max(1, familyRows.length - 1)])
    .range([pad.l, W - pad.r]);
  const famY = scaleLinear()
    .domain([0.7, 1.15])
    .range([H - pad.b, pad.t]);

  const mixPath = useMemo(() => {
    if (mixedLine.length < 2) return null;
    return line<{ mu: number; t: number }>()
      .x((d) => muScale(d.mu))
      .y((d) => tScale(d.t))(mixedLine);
  }, [mixedLine]);

  function exportSvg() {
    if (!svgRef.current) return;
    const xml = new XMLSerializer().serializeToString(svgRef.current);
    downloadBlob(xml, `tolerance-${tab}.svg`, 'image/svg+xml');
  }

  function exportCsv() {
    downloadBlob(sweepToCsv(familyRows), `ln-family-sweep-${sweepPolicy}.csv`, 'text/csv');
  }

  function handleHandoff(targetUrl: string) {
    const label = `${A.map((o) => o.el).join('/')}${B.map((o) => o.el).join('/')}${X.map((o) => o.el).join('/')}3`;
    const payload = buildCompositionHandoff(A, B, X, label);
    sendHandoff(payload, targetUrl);
  }

  return (
    <section className="tf-site" aria-label="Stability maps and family sweep">
      <div className="tf-site-head">
        <h2>Maps, family trend and exports</h2>
        <div className="tf-actions" role="tablist" aria-label="Plot view">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'tmu'}
            className="tf-preset-btn"
            onClick={() => setTab('tmu')}
          >
            t vs mu map
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'tau'}
            className="tf-preset-btn"
            onClick={() => setTab('tau')}
          >
            Bartel tau view
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'family'}
            className="tf-preset-btn"
            onClick={() => setTab('family')}
          >
            Lanthanide sweep
          </button>
        </div>
      </div>

      {tab === 'tmu' && (
        <div>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label="Goldschmidt t versus octahedral factor mu stability map"
          >
            <rect
              x={muScale(MAP_BOUNDS.muMinLine)}
              y={tScale(1.0)}
              width={muScale(MAP_BOUNDS.muMaxLine) - muScale(MAP_BOUNDS.muMinLine)}
              height={tScale(0.8) - tScale(1.0)}
              fill="currentColor"
              opacity={0.08}
            />
            <line
              x1={muScale(MAP_BOUNDS.muMinLine)}
              x2={muScale(MAP_BOUNDS.muMinLine)}
              y1={pad.t}
              y2={H - pad.b}
              stroke="#0072B2"
              strokeDasharray="5 3"
            />
            <line
              x1={muScale(MAP_BOUNDS.muMaxLine)}
              x2={muScale(MAP_BOUNDS.muMaxLine)}
              y1={pad.t}
              y2={H - pad.b}
              stroke="#0072B2"
              strokeDasharray="5 3"
            />
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={tScale(0.8)}
              y2={tScale(0.8)}
              stroke="#D55E00"
              strokeDasharray="3 3"
            />
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={tScale(1.0)}
              y2={tScale(1.0)}
              stroke="#D55E00"
              strokeDasharray="3 3"
            />
            <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="currentColor" />
            <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="currentColor" />
            <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="currentColor">
              Octahedral factor mu = rB / rX (dimensionless)
            </text>
            <text
              x={16}
              y={H / 2}
              textAnchor="middle"
              fontSize="12"
              fill="currentColor"
              transform={`rotate(-90 16 ${H / 2})`}
            >
              Goldschmidt t (dimensionless)
            </text>
            <text x={muScale(MAP_BOUNDS.muMinLine) + 4} y={pad.t + 12} fontSize="10" fill="#0072B2">
              mu=0.414 (S-022)
            </text>
            <text x={muScale(MAP_BOUNDS.muMaxLine) + 4} y={pad.t + 12} fontSize="10" fill="#0072B2">
              mu=0.732 (S-022)
            </text>
            {mixPath && <path d={mixPath} fill="none" stroke="#009E73" strokeWidth="2.5" />}
            {f && (
              <circle
                cx={muScale(Math.max(0.2, Math.min(1.0, f.mu)))}
                cy={tScale(Math.max(0.6, Math.min(1.2, f.t)))}
                r={6}
                fill="#D55E00"
              />
            )}
          </svg>
          <p className="tf-source-line">
            Dashed vertical lines: octahedral stability limits sqrt(2) - 1 = 0.414 and sqrt(3) - 1 = 0.732
            (S-022). Shaded box: rule-of-thumb t band 0.8 to 1.0 (Q-005).
          </p>
        </div>
      )}

      {tab === 'tau' && (
        <div>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label="Bartel tau versus rA/rB for nA = 1, 2, 3"
          >
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={tauScale(MAP_BOUNDS.tauThreshold)}
              y2={tauScale(MAP_BOUNDS.tauThreshold)}
              stroke="#D55E00"
              strokeDasharray="5 3"
            />
            <text
              x={W - pad.r - 4}
              y={tauScale(MAP_BOUNDS.tauThreshold) - 5}
              textAnchor="end"
              fontSize="11"
              fill="#D55E00"
            >
              tau = 4.18 threshold (S-003)
            </text>
            <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="currentColor" />
            <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="currentColor" />
            {tCurves.map((c, idx) => {
              const colors = ['#0072B2', '#009E73', '#CC79A7'];
              const d = line<{ ratio: number; tau: number }>()
                .x((p) => ratioScale(p.ratio))
                .y((p) => tauScale(p.tau))(c.points);
              return <g key={c.nA}>{d && <path d={d} fill="none" stroke={colors[idx]} strokeWidth="2" />}</g>;
            })}
            {f && f.tau.ok && (
              <circle
                cx={ratioScale(Math.max(1.1, Math.min(3.5, f.rA / f.rB)))}
                cy={tauScale(Math.max(-2, Math.min(12, f.tau.value)))}
                r={6}
                fill="#D55E00"
              />
            )}
            <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="12" fill="currentColor">
              Cation radius ratio rA / rB (dimensionless)
            </text>
            <text
              x={16}
              y={H / 2}
              textAnchor="middle"
              fontSize="12"
              fill="currentColor"
              transform={`rotate(-90 16 ${H / 2})`}
            >
              Bartel tau (dimensionless)
            </text>
          </svg>
          <p className="tf-source-line">
            Curves show nA = 1 (blue), nA = 2 (green), nA = 3 (purple) at the current rX/rB ratio. Below 4.18
            predicts perovskite (S-003).
          </p>
        </div>
      )}

      {tab === 'family' && (
        <div>
          <div className="tf-row" style={{ marginBottom: 'var(--space-2)' }}>
            <label className="tf-field">
              <span>Sweep coordination policy</span>
              <select
                aria-label="Sweep coordination policy"
                value={sweepPolicy}
                onChange={(e) => setSweepPolicy(e.target.value as LnCnPolicy)}
              >
                <option value="cn12">Strict CN XII (missing entries shown as gaps)</option>
                <option value="cn9">Uniform CN IX</option>
                <option value="cn8">Uniform CN VIII</option>
                <option value="highest">Highest listed CN up to XII</option>
              </select>
            </label>
          </div>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            role="img"
            aria-label="Goldschmidt t across lanthanide A-site ions La to Lu and Y"
          >
            <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="currentColor" />
            <line x1={pad.l} x2={pad.l} y1={pad.t} y2={H - pad.b} stroke="currentColor" />
            {familyRows.map((row, idx) => (
              <g key={row.el}>
                <text x={famX(idx)} y={H - pad.b + 16} textAnchor="middle" fontSize="10" fill="currentColor">
                  {row.el}
                </text>
                {row.ok && row.t !== undefined ? (
                  <circle cx={famX(idx)} cy={famY(row.t)} r={4.5} fill="#0072B2" />
                ) : (
                  <text x={famX(idx)} y={H - pad.b - 6} textAnchor="middle" fontSize="10" fill="#D55E00">
                    x
                  </text>
                )}
              </g>
            ))}
            <text
              x={16}
              y={H / 2}
              textAnchor="middle"
              fontSize="12"
              fill="currentColor"
              transform={`rotate(-90 16 ${H / 2})`}
            >
              Goldschmidt t
            </text>
          </svg>
          <details>
            <summary>
              Lanthanide sweep data table ({familyRows.filter((r) => r.ok).length} / 16 plotted)
            </summary>
            <table style={{ width: '100%', fontSize: 'var(--step--1)', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th>A ion</th>
                  <th>CN</th>
                  <th>rA (A)</th>
                  <th>t</th>
                  <th>mu</th>
                  <th>tau</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {familyRows.map((r) => (
                  <tr key={r.el}>
                    <td>{r.el}3+</td>
                    <td>{r.cn}</td>
                    <td>{r.rA !== undefined ? r.rA.toFixed(3) : 'missing'}</td>
                    <td>{r.t !== undefined ? r.t.toFixed(4) : 'missing'}</td>
                    <td>{r.mu !== undefined ? r.mu.toFixed(4) : 'missing'}</td>
                    <td>{r.tau !== undefined ? r.tau.toFixed(4) : 'missing'}</td>
                    <td>{r.reason ?? 'ok'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}

      <div className="tf-actions">
        <button type="button" className="tf-preset-btn" onClick={exportSvg}>
          Export SVG
        </button>
        <button type="button" className="tf-preset-btn" onClick={exportCsv}>
          Export family sweep CSV
        </button>
        <button
          type="button"
          className="tf-preset-btn"
          onClick={() => handleHandoff('/tools/input-builder/')}
        >
          Prepare VASP inputs
        </button>
      </div>
    </section>
  );
}
