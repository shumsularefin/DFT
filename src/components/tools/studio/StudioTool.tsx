import { useEffect, useMemo, useState } from 'react';
import Badge from '../../ui/Badge';
import type { CrystalSystem, MpManifest } from '../../../lib/mp/schema';
import {
  filterRowIndices,
  looksLikePerovskite,
  materializeRow,
  materialsToCsv,
  type MaterialRow,
  type MpIndex,
  type SortKey,
} from '../../../lib/mp/query';
import './studio.css';

export default function StudioTool() {
  const [manifest, setManifest] = useState<MpManifest | null>(null);
  const [index, setIndex] = useState<MpIndex | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [text, setText] = useState('');
  const [includeEl, setIncludeEl] = useState('');
  const [maxEhull, setMaxEhull] = useState('');
  const [maxSites, setMaxSites] = useState('');
  const [onlyStable, setOnlyStable] = useState(false);
  const [onlyMagnetic, setOnlyMagnetic] = useState(false);
  const [crystalSystem, setCrystalSystem] = useState<CrystalSystem | ''>('');
  const [sortBy, setSortBy] = useState<SortKey>('energy_above_hull');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        let base = '/data/mp/sample/';
        try {
          const curRes = await fetch('/data/mp/current.json');
          if (curRes.ok) {
            const cur = (await curRes.json()) as { manifest?: string };
            if (cur.manifest) {
              const dir = cur.manifest.replace(/manifest\.json$/, '');
              base = `/data/mp/${dir}`;
            }
          }
        } catch {
          // Fall back to sample dataset when current.json is not present
        }
        const [mRes, iRes] = await Promise.all([fetch(`${base}manifest.json`), fetch(`${base}index.json`)]);
        if (!mRes.ok || !iRes.ok) {
          throw new Error('Screening Studio dataset is not available yet (offline or not deployed).');
        }
        const [mData, iData] = (await Promise.all([mRes.json(), iRes.json()])) as [MpManifest, MpIndex];
        if (!cancelled) {
          setManifest(mData);
          setIndex(iData);
        }
      } catch (err) {
        if (!cancelled) setLoadErr(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const matchedIndices = useMemo(() => {
    if (!index) return [];
    const els = includeEl
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    return filterRowIndices(index, {
      text,
      includeElements: els,
      maxEhull: maxEhull.trim() === '' ? null : Number(maxEhull),
      maxSites: maxSites.trim() === '' ? null : Number(maxSites),
      onlyStable,
      onlyMagnetic,
      crystalSystem,
      sortBy,
    });
  }, [index, text, includeEl, maxEhull, maxSites, onlyStable, onlyMagnetic, crystalSystem, sortBy]);

  const visibleRows: MaterialRow[] = useMemo(() => {
    if (!index) return [];
    return matchedIndices.slice(0, 100).map((i) => materializeRow(index, i));
  }, [index, matchedIndices]);

  const selectedRow = useMemo(() => {
    if (!selectedId || !index) return null;
    const pos = index.columns.material_id.indexOf(selectedId);
    return pos >= 0 ? materializeRow(index, pos) : null;
  }, [selectedId, index]);

  function exportCsv() {
    if (!index || !manifest) return;
    const rows = matchedIndices.slice(0, 5000).map((i) => materializeRow(index, i));
    const blob = new Blob([materialsToCsv(rows, manifest.attribution)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screening-studio-${manifest.dbVersion}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="st-root" data-tool-id="studio">
      {loadErr && <p role="alert">{loadErr}</p>}

      {manifest?.synthetic && (
        <div className="st-banner" role="status">
          <strong>Synthetic demo data:</strong> {manifest.attribution}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
        <button
          type="button"
          className="st-btn"
          onClick={() => {
            setMaxSites('10');
            setOnlyStable(true);
            setIncludeEl('');
          }}
        >
          Preset: Beginner-friendly (&lt;= 10 sites, stable)
        </button>
        <button
          type="button"
          className="st-btn"
          onClick={() => {
            setIncludeEl('O');
            setOnlyStable(true);
            setMaxSites('');
          }}
        >
          Preset: Stable oxides
        </button>
        <button
          type="button"
          className="st-btn"
          onClick={() => {
            setOnlyMagnetic(true);
            setIncludeEl('');
            setOnlyStable(false);
          }}
        >
          Preset: Magnetic candidates
        </button>
        <button
          type="button"
          className="st-btn"
          onClick={() => {
            setText('');
            setIncludeEl('');
            setMaxEhull('');
            setMaxSites('');
            setOnlyStable(false);
            setOnlyMagnetic(false);
            setCrystalSystem('');
          }}
        >
          Clear filters
        </button>
      </div>

      <div className="st-filters" role="region" aria-label="Material filters">
        <label className="st-field">
          <span>Formula or ID</span>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. SrTiO3 or mp-..." />
        </label>
        <label className="st-field">
          <span>Must contain elements</span>
          <input
            value={includeEl}
            onChange={(e) => setIncludeEl(e.target.value)}
            placeholder="e.g. Sr, Ti, O"
          />
        </label>
        <label className="st-field">
          <span>Max E_hull (eV/atom)</span>
          <input type="number" step="0.01" value={maxEhull} onChange={(e) => setMaxEhull(e.target.value)} />
        </label>
        <label className="st-field">
          <span>Max sites</span>
          <input type="number" step="1" value={maxSites} onChange={(e) => setMaxSites(e.target.value)} />
        </label>
        <label className="st-field">
          <span>Crystal system</span>
          <select
            value={crystalSystem}
            onChange={(e) => setCrystalSystem(e.target.value as CrystalSystem | '')}
          >
            <option value="">Any</option>
            <option value="Cubic">Cubic</option>
            <option value="Tetragonal">Tetragonal</option>
            <option value="Orthorhombic">Orthorhombic</option>
            <option value="Hexagonal">Hexagonal</option>
            <option value="Trigonal">Trigonal</option>
            <option value="Monoclinic">Monoclinic</option>
            <option value="Triclinic">Triclinic</option>
          </select>
        </label>
        <label className="st-field">
          <span>Sort by</span>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortKey)}>
            <option value="energy_above_hull">Energy above hull</option>
            <option value="band_gap">Band gap</option>
            <option value="nsites">Sites</option>
            <option value="density">Density</option>
            <option value="formula_pretty">Formula</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input type="checkbox" checked={onlyStable} onChange={(e) => setOnlyStable(e.target.checked)} />
          On hull (stable)
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input type="checkbox" checked={onlyMagnetic} onChange={(e) => setOnlyMagnetic(e.target.checked)} />
          Magnetic only
        </label>
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <span>
          Showing {visibleRows.length} of {matchedIndices.length} matching material(s)
          {index ? ` (${index.count} total in dataset)` : ''}
        </span>
        <button type="button" className="st-btn" onClick={exportCsv} disabled={matchedIndices.length === 0}>
          Export selection CSV
        </button>
      </div>

      <div className="st-table-wrap">
        <table className="st-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Formula</th>
              <th>Space group</th>
              <th>Sites</th>
              <th>E_hull (eV/at)</th>
              <th>Gap (eV, PBE)</th>
              <th>Mag</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r) => (
              <tr key={r.material_id}>
                <td>
                  <code>{r.material_id}</code>
                </td>
                <td>
                  <strong>{r.formula_pretty}</strong>
                </td>
                <td>
                  {r.spacegroup.symbol} ({r.spacegroup.crystalSystem})
                </td>
                <td>{r.nsites}</td>
                <td>{r.energy_above_hull.toFixed(3)}</td>
                <td>{r.band_gap.toFixed(2)}</td>
                <td>{r.is_magnetic ? (r.ordering ?? 'Mag') : 'NM'}</td>
                <td>
                  <button type="button" className="st-btn" onClick={() => setSelectedId(r.material_id)}>
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedRow && (
        <section className="st-card" aria-label={`Details for ${selectedRow.formula_pretty}`}>
          <h2>
            {selectedRow.formula_pretty} (<code>{selectedRow.material_id}</code>){' '}
            {selectedRow.is_stable && <Badge variant="verified" />}
          </h2>
          <p>
            Space group: <strong>{selectedRow.spacegroup.symbol}</strong> (
            {selectedRow.spacegroup.crystalSystem}), {selectedRow.nsites} sites, volume{' '}
            {selectedRow.volume.toFixed(2)} A^3, density {selectedRow.density.toFixed(2)} g/cm^3.
          </p>
          <p>
            E_hull: {selectedRow.energy_above_hull.toFixed(4)} eV/atom | Band gap:{' '}
            {selectedRow.band_gap.toFixed(3)} eV (PBE-level caveat: standard PBE underestimates experimental
            gaps and overestimates lattice constants by 1 to 2 %, S-042).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <a
              className="st-btn"
              href={`/studio/project/#${selectedRow.material_id}`}
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              Feasibility &amp; First-Project Card
            </a>
            {looksLikePerovskite(selectedRow.formula_pretty, selectedRow.nsites) && (
              <a
                className="st-btn"
                href="/tools/tolerance-factor/"
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                Check perovskite tolerance factors
              </a>
            )}
            <a
              className="st-btn"
              href="/tools/input-builder/"
              style={{ display: 'inline-flex', alignItems: 'center' }}
            >
              Open Input Builder
            </a>
          </div>
        </section>
      )}

      <details>
        <summary>Why there is no ML column yet</summary>
        <p style={{ fontSize: 'var(--step--1)', color: 'var(--text-muted)' }}>
          The index schema reserves an optional <code>ml_e_above_hull</code> field (currently null and
          hidden). No machine-learning model is trained or served on Spark hosting, and showing an unvalidated
          ML prediction would break this site's honesty rules.
        </p>
      </details>

      {manifest && (
        <footer className="st-footer">
          <strong>Data attribution (S-024):</strong> {manifest.attribution} | Dataset version:{' '}
          <code>{manifest.dbVersion}</code> | Generated: {manifest.generated} | Licence: {manifest.licence}.
        </footer>
      )}
    </div>
  );
}
