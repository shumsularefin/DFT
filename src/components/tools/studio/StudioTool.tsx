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
import '../../../styles/tools.css';
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
          throw new Error('Materials Screening dataset is not available yet (offline or not deployed).');
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

  const presets: { label: string; on: boolean; apply: () => void }[] = [
    {
      label: 'Beginner-friendly (<= 10 sites, stable)',
      on: maxSites === '10' && onlyStable && includeEl === '',
      apply: () => {
        setMaxSites('10');
        setOnlyStable(true);
        setIncludeEl('');
      },
    },
    {
      label: 'Stable oxides',
      on: includeEl === 'O' && onlyStable && maxSites === '',
      apply: () => {
        setIncludeEl('O');
        setOnlyStable(true);
        setMaxSites('');
      },
    },
    {
      label: 'Magnetic candidates',
      on: onlyMagnetic && includeEl === '' && !onlyStable,
      apply: () => {
        setOnlyMagnetic(true);
        setIncludeEl('');
        setOnlyStable(false);
      },
    },
  ];

  return (
    <div className="st-root" data-tool-id="studio">
      <header className="page-h tool-head">
        <div>
          <h1>Materials Screening</h1>
          <p>
            Filter candidate materials locally in your browser by chemistry, hull stability, band gap, cell
            size and magnetism, then open any entry&apos;s feasibility check and starter VASP project card.
          </p>
        </div>
      </header>

      {loadErr && (
        <p className="notice" role="alert">
          {loadErr}
        </p>
      )}

      {manifest?.synthetic && (
        <div className="notice st-banner" role="status">
          <strong>Synthetic demo data:</strong> {manifest.attribution}
        </div>
      )}

      <div className="row st-pills">
        {presets.map((p) => (
          <button key={p.label} type="button" className={`pill${p.on ? ' on' : ''}`} onClick={p.apply}>
            Preset: {p.label}
          </button>
        ))}
        <button
          type="button"
          className="pill"
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
        <span className="st-spacer" />
        <button type="button" className="btn" onClick={exportCsv} disabled={matchedIndices.length === 0}>
          <svg className="st-ico" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" />
          </svg>
          Export selection CSV
        </button>
      </div>

      <div className="card st-filters" role="region" aria-label="Material filters">
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
        <div className="st-checks">
          <label>
            <input type="checkbox" checked={onlyStable} onChange={(e) => setOnlyStable(e.target.checked)} />
            On hull (stable)
          </label>
          <label>
            <input
              type="checkbox"
              checked={onlyMagnetic}
              onChange={(e) => setOnlyMagnetic(e.target.checked)}
            />
            Magnetic only
          </label>
        </div>
      </div>

      <p className="st-count">
        Showing {visibleRows.length} of {matchedIndices.length} matching material(s)
        {index ? ` (${index.count} total in dataset)` : ''}
      </p>

      <div className="split st-split">
        <div className="card st-table-card">
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
                <tr
                  key={r.material_id}
                  className={r.material_id === selectedId ? 'on' : undefined}
                  onClick={() => setSelectedId(r.material_id)}
                >
                  <td>{r.material_id}</td>
                  <td className="st-formula">{r.formula_pretty}</td>
                  <td>
                    {r.spacegroup.symbol} ({r.spacegroup.crystalSystem})
                  </td>
                  <td>{r.nsites}</td>
                  <td>{r.energy_above_hull.toFixed(3)}</td>
                  <td>{r.band_gap.toFixed(2)}</td>
                  <td>{r.is_magnetic ? (r.ordering ?? 'Mag') : 'NM'}</td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost st-inspect"
                      aria-pressed={r.material_id === selectedId}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(r.material_id);
                      }}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {index && visibleRows.length === 0 && (
            <p className="ph st-empty">No material matches these filters.</p>
          )}
        </div>

        {selectedRow ? (
          <section className="card st-card" aria-label={`Details for ${selectedRow.formula_pretty}`}>
            <h2 className="card-h">
              {selectedRow.formula_pretty} <code>{selectedRow.material_id}</code>
            </h2>
            <div className="row st-badges">
              {selectedRow.is_stable && <Badge variant="verified" />}
              <span className="badge st-tag">{selectedRow.spacegroup.crystalSystem}</span>
              <span className="badge st-tag">
                {selectedRow.is_magnetic ? (selectedRow.ordering ?? 'Magnetic') : 'Non-magnetic'}
              </span>
              <span className="badge st-tag">PBE</span>
            </div>
            <dl className="grid g3 st-stats">
              <div>
                <dt>Space group</dt>
                <dd>{selectedRow.spacegroup.symbol}</dd>
              </div>
              <div>
                <dt>Sites</dt>
                <dd>{selectedRow.nsites}</dd>
              </div>
              <div>
                <dt>Volume (A^3)</dt>
                <dd>{selectedRow.volume.toFixed(2)}</dd>
              </div>
              <div>
                <dt>Density (g/cm^3)</dt>
                <dd>{selectedRow.density.toFixed(2)}</dd>
              </div>
              <div>
                <dt>E_hull (eV/atom)</dt>
                <dd>{selectedRow.energy_above_hull.toFixed(4)}</dd>
              </div>
              <div>
                <dt>Band gap (eV)</dt>
                <dd>{selectedRow.band_gap.toFixed(3)}</dd>
              </div>
            </dl>
            <p className="notice st-caveat">
              PBE-level caveat: standard PBE underestimates experimental gaps and overestimates lattice
              constants by 1 to 2 %, S-042.
            </p>
            <div className="stack st-actions">
              <a className="btn btn-primary" href={`/studio/project/#${selectedRow.material_id}`}>
                Feasibility &amp; First-Project Card
              </a>
              {looksLikePerovskite(selectedRow.formula_pretty, selectedRow.nsites) && (
                <a className="btn" href="/tools/tolerance-factor/">
                  Check perovskite tolerance factors
                </a>
              )}
              <a className="btn" href="/tools/input-builder/">
                Open Input Builder
              </a>
            </div>
          </section>
        ) : (
          <section className="card st-card" aria-label="Inspector">
            <h2 className="card-h">Inspector</h2>
            <p className="ph st-ph">Select a material in the table to see its details and starter project.</p>
          </section>
        )}
      </div>

      <details className="card st-details">
        <summary>Why there is no ML column yet</summary>
        <p>
          The index schema reserves an optional <code>ml_e_above_hull</code> field (currently null and
          hidden). No machine-learning model is trained or served on Spark hosting, and showing an unvalidated
          ML prediction would break this site&apos;s honesty rules.
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
