import { useEffect, useMemo, useState } from 'react';
import Badge from '../../ui/Badge';
import type { MpManifest } from '../../../lib/mp/schema';
import { materializeRow, type MaterialRow, type MpIndex } from '../../../lib/mp/query';
import { buildStarterProjectSteps, evaluateFeasibility } from '../../../lib/mp/feasibility';
import { RECOMMENDED_PAW_ELEMENTS } from '../../../lib/mp/pawTable';
import './studio.css';

export default function ProjectCardTool() {
  const [manifest, setManifest] = useState<MpManifest | null>(null);
  const [row, setRow] = useState<MaterialRow | null>(null);
  const [encut, setEncut] = useState(520);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const id = typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '';
        let base = '/data/mp/sample/';
        try {
          const curRes = await fetch('/data/mp/current.json');
          if (curRes.ok) {
            const cur = (await curRes.json()) as { manifest?: string };
            if (cur.manifest) base = `/data/mp/${cur.manifest.replace(/manifest\.json$/, '')}`;
          }
        } catch {
          // sample fallback
        }
        const [mRes, iRes] = await Promise.all([fetch(`${base}manifest.json`), fetch(`${base}index.json`)]);
        if (!mRes.ok || !iRes.ok) throw new Error('Dataset not available.');
        const [mData, iData] = (await Promise.all([mRes.json(), iRes.json()])) as [MpManifest, MpIndex];
        const pos = id ? iData.columns.material_id.indexOf(id) : 0;
        const hit = pos >= 0 ? pos : 0;
        if (!cancelled) {
          setManifest(mData);
          setRow(materializeRow(iData, hit));
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const report = useMemo(
    () => (row ? evaluateFeasibility(row, { recommendedPawTable: RECOMMENDED_PAW_ELEMENTS }) : null),
    [row],
  );
  const steps = useMemo(() => (row ? buildStarterProjectSteps(row, encut) : []), [row, encut]);

  return (
    <div className="st-root" data-tool-id="studio-project">
      {err && <p role="alert">{err}</p>}
      {manifest?.synthetic && (
        <div className="st-banner" role="status">
          <strong>Synthetic demo data:</strong> {manifest.attribution}
        </div>
      )}

      {row && report && (
        <>
          <section className="st-card">
            <h2>
              {row.formula_pretty} (<code>{row.material_id}</code>) : Feasibility:{' '}
              <strong>{report.overall.toUpperCase()}</strong> <Badge variant="heuristic" />
            </h2>
            <p>
              Space group {row.spacegroup.symbol} ({row.spacegroup.crystalSystem}), {row.nsites} atoms/cell,
              relative compute cost: <strong>{report.estimate.text}</strong>.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
              <label className="st-field">
                <span>ENCUT (eV, set &gt;= 1.3 x ENMAX)</span>
                <input
                  type="number"
                  min={250}
                  max={1000}
                  step={20}
                  value={encut}
                  onChange={(e) => setEncut(Math.max(250, Number(e.target.value) || 520))}
                />
              </label>
            </div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--step--1)' }}>
              Cost heuristic: {report.estimate.formula}
            </p>
            <ul>
              {report.rules.map((r) => (
                <li key={r.id}>
                  <strong>
                    [{r.verdict.toUpperCase()}] {r.label}:
                  </strong>{' '}
                  {r.reason} ({r.source})
                </li>
              ))}
            </ul>
          </section>

          <section className="st-card">
            <h2>Sanity-check reference values (with PBE caveats)</h2>
            <p>
              Dataset volume: {row.volume.toFixed(2)} A^3 | PBE band gap: {row.band_gap.toFixed(3)} eV |
              E_hull: {row.energy_above_hull.toFixed(4)} eV/atom.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 'var(--step--1)' }}>
              Caveat (S-042): standard PBE typically overestimates experimental lattice constants by 1 to 2 %
              and underestimates band gaps significantly.
            </p>
          </section>

          <section className="st-card">
            <h2>Starter VASP workflow (author protocol)</h2>
            {steps.map((s) => (
              <details key={s.id} open={s.id === 'relax'} style={{ marginBottom: 'var(--space-3)' }}>
                <summary>
                  <strong>{s.title}</strong>
                </summary>
                <p>{s.note}</p>
                <pre style={{ padding: 'var(--space-3)', background: 'var(--bg)', overflowX: 'auto' }}>
                  <code>{s.incarText}</code>
                </pre>
              </details>
            ))}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
              <a
                className="st-btn"
                href="/tools/input-builder/"
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                Customize in Input Builder
              </a>
              <a
                className="st-btn"
                href="/tools/kpath/"
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                Generate k-path
              </a>
              <a className="st-btn" href="/studio/" style={{ display: 'inline-flex', alignItems: 'center' }}>
                Back to Screening Studio
              </a>
            </div>
          </section>
        </>
      )}

      {manifest && (
        <footer className="st-footer">
          <strong>Data attribution (S-024):</strong> {manifest.attribution} | Dataset version:{' '}
          <code>{manifest.dbVersion}</code>.
        </footer>
      )}
    </div>
  );
}
