import { useMemo, useRef, useState } from 'react';
import Chart, { type Series } from './Chart';
import { type Composition, type Evaluation } from '../../../lib/perovskite/checks';
import {
  FAMILY,
  familySweep,
  mixedSweep,
  sweepCsv,
  tMuMap,
  tauModel,
  type SweepRow,
} from '../../../lib/perovskite/plots';
import { TARGETS, chemicalSystem, compositionHandoff } from '../../../lib/perovskite/handoff';
import { BARTEL_THRESHOLD, TAU_CONFIRMATION } from '../../../lib/perovskite/factors';
import type { Policy } from '../../../lib/perovskite/urlState';
import { svgToPng, svgToString } from '../convergence/exportSvg';
import { copyText, downloadBlob } from '../input-builder/hooks';

type View = 'map' | 'tau' | 'family' | 'mixed';
const VIEWS: [View, string][] = [
  ['map', 'Map of t and mu'],
  ['tau', 'Tau view'],
  ['family', 'Family trend'],
  ['mixed', 'Mixed-site sweep'],
];
const n3 = (v: number | null | undefined) => (v === null || v === undefined ? 'no value' : v.toFixed(4));

interface Props {
  composition: Composition;
  effective: Composition;
  evaluation: Evaluation;
  policy: Policy;
}

export default function Explorer({ composition, effective, evaluation, policy }: Props) {
  const [view, setView] = useState<View>('map');
  const [note, setNote] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const mixedSite = (['A', 'B'] as const).find((s) => composition[s].length === 2) ?? null;

  const family = useMemo(() => familySweep(effective.B, effective.X, policy), [effective, policy]);
  const mixed = useMemo(() => (mixedSite ? mixedSweep(effective, mixedSite) : []), [effective, mixedSite]);

  const rows: SweepRow[] = view === 'family' ? family : view === 'mixed' ? mixed : [];
  const xName = view === 'family' ? 'A element' : `x (${mixedSite ?? ''} site)`;

  const svgs = () => [...(box.current?.querySelectorAll<SVGSVGElement>('svg.tfp-svg') ?? [])];
  const bg = () => getComputedStyle(document.body).backgroundColor || '#fff';
  const exportSvgs = async (kind: 'svg' | 'png') => {
    const list = svgs();
    for (const [i, s] of list.entries()) {
      const name = `tolerance-${view}${list.length > 1 ? `-${i + 1}` : ''}.${kind}`;
      const text = svgToString(s, bg());
      if (kind === 'svg') downloadBlob(name, text, 'image/svg+xml');
      else downloadBlob(name, await svgToPng(text, 640, 360, 2), 'image/png');
    }
    setNote(`Saved ${list.length} ${kind.toUpperCase()} file${list.length === 1 ? '' : 's'}.`);
  };
  const exportCsv = () => {
    downloadBlob(`tolerance-${view}.csv`, sweepCsv(rows, xName), 'text/csv');
    setNote('Saved the sweep as CSV. Gaps are left empty with the reason in the status column.');
  };

  const send = async (id: 'builder' | 'studio' | 'input-builder') => {
    const sys = chemicalSystem(composition);
    if (id === 'input-builder') {
      const ok = await copyText(
        `Perovskite ${sys}: composition from the tolerance-factor explorer. Set ENCUT, k-points and spin yourself.`,
      );
      setNote(ok ? 'Copied a note for the Input Builder. It does not read hand-offs yet.' : 'Copy failed.');
      return;
    }
    const h = compositionHandoff(composition, sys);
    const target = TARGETS.find((t) => t.id === id)!;
    const payload =
      id === 'studio'
        ? JSON.stringify({ chemicalSystem: sys, handoff: h }, null, 2)
        : JSON.stringify(h, null, 2);
    const ok = await copyText(payload);
    setNote(
      `${target.name} is not built yet, so nothing was opened. The validated payload${id === 'studio' ? ` (chemical system ${sys})` : ''} ${ok ? 'is on your clipboard' : 'could not be copied'}.`,
    );
  };

  return (
    <section className="tf-results" aria-labelledby="tfp-h" data-testid="explorer">
      <h2 id="tfp-h">Plots and sweeps</h2>
      <div className="tfp-tabs" role="group" aria-label="Choose a plot">
        {VIEWS.map(([v, label]) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
            {label}
          </button>
        ))}
      </div>
      <div ref={box}>
        {view === 'map' && (
          <MapView composition={composition} evaluation={evaluation} mixedSite={mixedSite} mixed={mixed} />
        )}
        {view === 'tau' && <TauView evaluation={evaluation} />}
        {view === 'family' && (
          <>
            <p className="tf-small">
              Sweeps the A site over La to Lu and Y, all as 3+, with the B and X sites above and A-site
              coordination CN {policy} (the policy selector). Where Shannon has no radius for that CN the
              point is a gap marked with a cross; nothing is interpolated. Pm and Y are tabulated at fewer
              coordinations than the rest.
            </p>
            <SweepCharts rows={family} xTickText={FAMILY} xLabel="A-site element (3+)" />
          </>
        )}
        {view === 'mixed' &&
          (mixedSite ? (
            <>
              <p className="tf-small">
                Sweeps x from 0 (pure {composition[mixedSite][0]!.el}) to 1 (pure{' '}
                {composition[mixedSite][1]!.el}) on the {mixedSite} site by linear mixing, a stated convention
                (Q-016).
              </p>
              <SweepCharts
                rows={mixed}
                xLabel={`x, fraction of ${composition[mixedSite][1]!.el} on the ${mixedSite} site`}
              />
            </>
          ) : (
            <p className="tf-small" data-testid="mixed-empty">
              Make the A or B site mixed (use "Add a second element" above) to sweep x.
            </p>
          ))}
      </div>

      <div className="tfp-actions" role="group" aria-label="Export">
        <button type="button" onClick={() => exportSvgs('svg')}>
          Download SVG
        </button>
        <button type="button" onClick={() => exportSvgs('png')}>
          Download PNG
        </button>
        <button type="button" onClick={exportCsv} disabled={rows.length === 0}>
          Download sweep CSV
        </button>
      </div>
      <h3>Send this composition on</h3>
      <div className="tfp-actions" role="group" aria-label="Hand-offs">
        <button type="button" onClick={() => send('builder')}>
          Material Builder
        </button>
        <button type="button" onClick={() => send('studio')}>
          Screening Studio
        </button>
        <button type="button" onClick={() => send('input-builder')}>
          Input Builder (note)
        </button>
      </div>
      <p role="status" className="tf-small" data-testid="explorer-note">
        {note}
      </p>
    </section>
  );
}

function MapView({
  composition,
  evaluation,
  mixedSite,
  mixed,
}: {
  composition: Composition;
  evaluation: Evaluation;
  mixedSite: 'A' | 'B' | null;
  mixed: SweepRow[];
}) {
  const point = evaluation.ok ? { t: evaluation.t, mu: evaluation.mu } : null;
  const line = mixed.flatMap((r) => (r.ok ? [{ t: r.t, mu: r.mu, label: r.label }] : []));
  const m = tMuMap(point, line);
  const series: Series[] = line.length
    ? [
        {
          name: `Mixing path (${mixedSite} site)`,
          cls: 's2',
          points: m.line.map((p) => ({ x: p.x, y: p.y })),
        },
      ]
    : [];
  void composition;
  return (
    <>
      <Chart
        title="Map of the Goldschmidt tolerance factor t against the octahedral factor mu"
        description={`Horizontal dashed lines mark mu = 0.414 and mu = 0.732, the geometric limits for a stable octahedron. The shaded band marks t from 0.825 to 1.059, the optimal bounds of a decision tree on 576 known ABX3 solids. ${
          point
            ? `This composition sits at t = ${point.t.toFixed(3)}, mu = ${point.mu.toFixed(3)}.`
            : 'No composition can be plotted yet.'
        }`}
        xLabel="Goldschmidt tolerance factor t (dimensionless)"
        yLabel="Octahedral factor mu (dimensionless)"
        xDomain={m.xDomain}
        yDomain={m.yDomain}
        hLines={m.refLines.map((l) => ({ value: l.value, label: l.label }))}
        vBands={m.bands.map((b) => ({ lo: b.lo, hi: b.hi, label: b.label }))}
        series={series}
        marker={m.point}
        table={{
          head: ['Point', 't', 'mu'],
          rows: [
            ...(m.point ? [['This composition', n3(m.point.x), n3(m.point.y)]] : []),
            ...m.line.map((p) => [p.label, n3(p.x), n3(p.y)]),
          ],
        }}
      />
      <p className="tf-small" data-testid="map-caveat">
        Heuristic. The band is the t range a decision tree chose on 576 experimental ABX3 compounds (74 %
        accurate, S-003), and the mu lines are the geometric limits for an octahedron of anions around B
        (S-022). Landing inside is not a guarantee: compounds in the band can still form edge- or face-sharing
        octahedra instead.
      </p>
    </>
  );
}

function TauView({ evaluation }: { evaluation: Evaluation }) {
  if (!evaluation.ok)
    return <p className="tf-small">Fix the composition above to see the tau view: {evaluation.reason}</p>;
  const rB = evaluation.sites.B.radius;
  const rX = evaluation.sites.X.radius;
  const nA = Math.round(evaluation.sites.A.oxidation);
  const m = tauModel(rX / rB, [1, 2, 3], { rAoverRB: evaluation.sites.A.radius / rB, nA });
  const series: Series[] = m.curves.map((c, i) => ({
    name: `nA = ${c.nA}`,
    cls: (['s1', 's2', 's3'] as const)[i]!,
    points: c.points.map((p) => ({ x: p.x, y: p.y })),
  }));
  return (
    <>
      <Chart
        title="Bartel tau against rA/rB"
        description={`Three curves for A-site oxidation state 1, 2 and 3 at rX/rB = ${(rX / rB).toFixed(3)}. A dashed line marks tau = ${BARTEL_THRESHOLD}; below it a perovskite is predicted. ${m.pointNote}`}
        xLabel="rA / rB (dimensionless)"
        yLabel="tau (dimensionless)"
        xDomain={m.xDomain}
        yDomain={m.yDomain}
        series={series}
        hLines={[{ value: BARTEL_THRESHOLD, label: `tau = ${BARTEL_THRESHOLD}` }]}
        marker={m.point ? { ...m.point, label: 'This composition' } : null}
        table={{
          head: ['rA/rB', ...m.curves.map((c) => `tau, nA = ${c.nA}`)],
          rows: m.curves[0]!.points.filter((_, i) => i % 8 === 0).map((p, i) => [
            p.x.toFixed(2),
            ...m.curves.map((c) => n3(c.points[i * 8]!.y)),
          ]),
        }}
      />
      <p className="tf-small" data-testid="tau-note">
        {m.pointNote} Confirmation: {TAU_CONFIRMATION.basis}.
      </p>
    </>
  );
}

function SweepCharts({
  rows,
  xTickText,
  xLabel,
}: {
  rows: SweepRow[];
  xTickText?: readonly string[];
  xLabel: string;
}) {
  const gapNote = (r: SweepRow) => (r.ok ? undefined : r.reason);
  const mk = (pick: (r: Extract<SweepRow, { ok: true }>) => number | null): Series['points'] =>
    rows.map((r) => ({
      x: r.x,
      y: r.ok ? pick(r) : null,
      note: gapNote(r) ?? (r.ok && pick(r) === null ? r.tauReason : undefined),
    }));
  const last = Math.max(1, rows.length - 1);
  const xDomain: [number, number] = xTickText ? [-0.5, last + 0.5] : [0, 1];
  const table = {
    head: ['Label', 'rA (angstrom)', 't', 'mu', 'tau', 'Status'],
    rows: rows.map((r) =>
      r.ok
        ? [r.label, r.rA.toFixed(3), n3(r.t), n3(r.mu), n3(r.tau), r.tauReason ?? 'ok']
        : [r.label, '', '', '', '', r.reason],
    ),
  };
  const gaps = rows.filter((r) => !r.ok).length;
  return (
    <>
      <Chart
        title="t and mu along the sweep"
        description={`t and mu for ${rows.length} compositions. ${gaps} have no value because a Shannon radius is missing.`}
        xLabel={xLabel}
        yLabel="t and mu (dimensionless)"
        xDomain={xDomain}
        yDomain={[0, 1.2]}
        xTickText={xTickText}
        series={[
          { name: 't', cls: 's1', points: mk((r) => r.t) },
          { name: 'mu', cls: 's2', points: mk((r) => r.mu) },
        ]}
        hLines={[]}
        table={table}
      />
      <Chart
        title="tau along the sweep"
        description={`Bartel tau for the same ${rows.length} compositions. A dashed line marks ${BARTEL_THRESHOLD}.`}
        xLabel={xLabel}
        yLabel="tau (dimensionless)"
        xDomain={xDomain}
        yDomain={[0, 10]}
        xTickText={xTickText}
        series={[{ name: 'tau', cls: 's3', points: mk((r) => r.tau) }]}
        hLines={[{ value: BARTEL_THRESHOLD, label: `tau = ${BARTEL_THRESHOLD}` }]}
        table={table}
      />
      <p className="tf-small" data-testid="gap-count">
        {gaps} of {rows.length} points are gaps (no Shannon radius for that choice). Hover or read the table
        for each reason.
      </p>
    </>
  );
}
