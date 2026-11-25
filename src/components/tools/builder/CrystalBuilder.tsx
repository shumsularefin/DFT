import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import PeriodicTable from '../../ui/PeriodicTable';
import StructureView from '../../structure/StructureView';
import { CRYSTAL_TEMPLATES } from './crystalTemplates';
import {
  createHistory,
  push,
  undo,
  redo,
  canUndo,
  canRedo,
  undoLabel,
  redoLabel,
  type History,
} from '../../../lib/history';
import { check, composition, exportGate, withOverrideComment } from '../../../lib/chem/validity';
import { gentleRelax, mergeDuplicates, supercellOp, wrap } from '../../../lib/crystal/ops';
import { defectSupercell, substitute, vacancy } from '../../../lib/crystal/defects';
import { readStructure } from '../../../lib/crystal/io';
import { writePoscar } from '../../../lib/crystal/poscar';
import { writeCif } from '../../../lib/crystal/cif';
import { cellVolume } from '../../../lib/crystal/lattice';
import { sendHandoff, takeHandoff } from '../../../lib/handoff';
import type { Structure, Vec3 } from '../../../lib/crystal/types';
import './builder.css';

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function CrystalBuilder() {
  const [hist, setHist] = useState<History<Structure>>(() =>
    createHistory(CRYSTAL_TEMPLATES[0]!.structure, 100, 'Rock salt (NaCl)'),
  );
  const [selectedEl, setSelectedEl] = useState('Na');
  const [showPalette, setShowPalette] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [newCoord, setNewCoord] = useState<[string, string, string]>(['0.25', '0.25', '0.25']);
  const [overrideReason, setOverrideReason] = useState('');
  const [statusMsg, setStatusMsg] = useState('');

  const structure = hist.present.state;

  useEffect(() => {
    const h = takeHandoff(['structure', 'composition']);
    if (!h) return;
    if (h.kind === 'structure') {
      setHist(createHistory(h.structure, 100, h.label ?? 'Imported hand-off'));
      setStatusMsg(`Loaded structure hand-off from ${h.from}.`);
    } else if (h.kind === 'composition') {
      const aSym = h.a.occupants[0]?.symbol ?? 'Sr';
      const bSym = h.b.occupants[0]?.symbol ?? 'Ti';
      const xSym = h.x.occupants[0]?.symbol ?? 'O';
      const perov: Structure = {
        ...CRYSTAL_TEMPLATES[1]!.structure,
        comment: `${aSym}${bSym}${xSym}3 from Tolerance Explorer`,
        species: [aSym, bSym, xSym, xSym, xSym],
      };
      setHist(createHistory(perov, 100, `${aSym}${bSym}${xSym}3`));
      setStatusMsg(`Built cubic perovskite template for ${aSym}${bSym}${xSym}3.`);
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setHist((h) => (e.shiftKey ? redo(h) : undo(h)));
      } else if (e.key === '?' && document.activeElement?.tagName !== 'INPUT') {
        setShowHelp((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const issues = useMemo(() => check(structure, 'crystal'), [structure]);
  const gate = useMemo(
    () => exportGate(issues, overrideReason.trim() ? { reason: overrideReason.trim() } : undefined),
    [issues, overrideReason],
  );
  const formula = useMemo(
    () =>
      composition(structure)
        .map((c) => `${c.el}${c.count === 1 ? '' : c.count}`)
        .join(''),
    [structure],
  );
  const vol = useMemo(() => Math.abs(cellVolume(structure.lattice)), [structure]);

  function commit(next: Structure, label: string) {
    setHist((h) => push(h, next, label));
    setStatusMsg(label);
  }

  function addAtom() {
    const fx = Number(newCoord[0]);
    const fy = Number(newCoord[1]);
    const fz = Number(newCoord[2]);
    if (!Number.isFinite(fx) || !Number.isFinite(fy) || !Number.isFinite(fz)) return;
    commit(
      {
        ...structure,
        species: [...structure.species, selectedEl],
        frac: [...structure.frac, [fx, fy, fz]],
      },
      `Add ${selectedEl} at (${fx}, ${fy}, ${fz})`,
    );
  }

  function updateAtomCoord(idx: number, axis: 0 | 1 | 2, val: number) {
    if (!Number.isFinite(val)) return;
    const nextFrac = structure.frac.map((f, i) => {
      if (i !== idx) return f;
      const copy: [number, number, number] = [f[0], f[1], f[2]];
      copy[axis] = val;
      return copy as Vec3;
    });
    commit({ ...structure, frac: nextFrac }, `Move site ${idx + 1}`);
  }

  async function onImportFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const parsed = readStructure(f.name, await f.text());
      commit(parsed.structure, `Import ${f.name}`);
    } catch (ex) {
      setStatusMsg(ex instanceof Error ? ex.message : String(ex));
    }
  }

  function handleExport(fmt: 'poscar' | 'cif') {
    if (!gate.allowed) return;
    const target = withOverrideComment(structure, gate);
    if (fmt === 'poscar') downloadText(writePoscar(target).text, `${formula || 'structure'}.POSCAR`);
    else downloadText(writeCif(target), `${formula || 'structure'}.cif`);
  }

  return (
    <div className="mb-root" data-tool-id="crystal-builder">
      <div className="mb-toolbar" role="toolbar" aria-label="Crystal editing operations">
        <label>
          Template:{' '}
          <select
            aria-label="Crystal template"
            onChange={(e) => {
              const t = CRYSTAL_TEMPLATES.find((x) => x.id === e.target.value);
              if (t) commit(t.structure, `Load ${t.label}`);
            }}
          >
            {CRYSTAL_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="mb-btn" disabled={!canUndo(hist)} onClick={() => setHist(undo)}>
          Undo{undoLabel(hist) ? ` (${undoLabel(hist)})` : ''}
        </button>
        <button type="button" className="mb-btn" disabled={!canRedo(hist)} onClick={() => setHist(redo)}>
          Redo{redoLabel(hist) ? ` (${redoLabel(hist)})` : ''}
        </button>
        <button
          type="button"
          className="mb-btn"
          onClick={() => commit(wrap(structure).structure, 'Wrap coordinates')}
        >
          Wrap
        </button>
        <button
          type="button"
          className="mb-btn"
          onClick={() => commit(mergeDuplicates(structure).structure, 'Merge duplicates')}
        >
          Merge duplicates
        </button>
        <button
          type="button"
          className="mb-btn"
          onClick={() => commit(gentleRelax(structure).structure, 'Gentle relax')}
        >
          Gentle relax
        </button>
        <button
          type="button"
          className="mb-btn"
          onClick={() =>
            commit(
              supercellOp(structure, [
                [2, 0, 0],
                [0, 2, 0],
                [0, 0, 2],
              ]).structure,
              '2x2x2 supercell',
            )
          }
        >
          2x2x2 supercell
        </button>
        <button
          type="button"
          className="mb-btn"
          onClick={() => commit(defectSupercell(structure, 10), 'Defect supercell (>= 10 A)')}
        >
          Defect supercell (&gt;= 10 A)
        </button>
        <label className="mb-btn" style={{ display: 'inline-flex', alignItems: 'center' }}>
          Import POSCAR/CIF
          <input
            type="file"
            onChange={onImportFile}
            style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
          />
        </label>
        <button type="button" className="mb-btn" onClick={() => setShowHelp((v) => !v)}>
          Shortcuts (?)
        </button>
      </div>

      {showHelp && (
        <div className="mb-panel" role="dialog" aria-label="Keyboard shortcuts">
          <strong>Keyboard shortcuts:</strong> <code>Ctrl+Z</code> Undo | <code>Ctrl+Shift+Z</code> Redo |{' '}
          <code>?</code> Toggle shortcuts help. Every operation is reachable by keyboard via the toolbar and
          site table.
        </div>
      )}

      {statusMsg && (
        <p role="status" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--step--1)' }}>
          {statusMsg}
        </p>
      )}

      <div className="mb-layout">
        <div className="mb-panel">
          <p style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 'var(--step--1)' }}>
            Summary: <strong>{formula}</strong> | {structure.species.length} atoms | Volume {vol.toFixed(2)}{' '}
            A^3 | {issues.length} validity issue(s)
          </p>
          <StructureView structure={structure} />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
            <button
              type="button"
              className="mb-btn"
              disabled={!gate.allowed}
              onClick={() => handleExport('poscar')}
            >
              Export POSCAR
            </button>
            <button
              type="button"
              className="mb-btn"
              disabled={!gate.allowed}
              onClick={() => handleExport('cif')}
            >
              Export CIF
            </button>
            <button
              type="button"
              className="mb-btn"
              onClick={() =>
                sendHandoff(
                  { v: 1, kind: 'structure', from: 'builder', structure, label: formula },
                  '/tools/input-builder/',
                )
              }
            >
              Send to Input Builder
            </button>
            <button
              type="button"
              className="mb-btn"
              onClick={() =>
                sendHandoff(
                  { v: 1, kind: 'structure', from: 'builder', structure, label: formula },
                  '/tools/kpath/',
                )
              }
            >
              Send to k-path tool
            </button>
            <button
              type="button"
              className="mb-btn"
              onClick={() =>
                sendHandoff(
                  { v: 1, kind: 'structure', from: 'builder', structure, label: formula },
                  '/tools/magnetic/',
                )
              }
            >
              Magnetic orderings
            </button>
          </div>
          {!gate.allowed && (
            <label style={{ fontSize: 'var(--step--1)' }}>
              Export blocked by error(s). Enter a reason to override:{' '}
              <input
                type="text"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Reason for overriding error"
              />
            </label>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <section className="mb-panel" aria-label="Validity panel">
            <h2 style={{ margin: 0, fontSize: 'var(--step-1)' }}>Validity ({issues.length})</h2>
            {issues.length === 0 ? (
              <p style={{ margin: 0 }}>No validity issues found (B001 to B012).</p>
            ) : (
              <ul className="mb-issues">
                {issues.map((iss, i) => (
                  <li key={`${iss.code}-${i}`} className={`mb-issue mb-issue-${iss.severity}`}>
                    <strong>
                      [{iss.code} {iss.severity.toUpperCase()}]
                    </strong>{' '}
                    {iss.title}: {iss.why}
                    {iss.fix && (
                      <div style={{ marginTop: '0.35rem' }}>
                        <button
                          type="button"
                          className="mb-btn"
                          onClick={() => commit(iss.fix!.apply(structure), iss.fix!.label)}
                        >
                          Fix: {iss.fix.label}
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mb-panel" aria-label="Add and edit sites">
            <h2 style={{ margin: 0, fontSize: 'var(--step-1)' }}>Sites ({structure.species.length})</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
              <button type="button" className="mb-btn" onClick={() => setShowPalette((v) => !v)}>
                Element: {selectedEl} (pick)
              </button>
              {(['x', 'y', 'z'] as const).map((axis, idx) => (
                <label key={axis} style={{ fontSize: 'var(--step--1)' }}>
                  {axis}:{' '}
                  <input
                    type="number"
                    step="0.05"
                    aria-label={`New atom fractional ${axis}`}
                    value={newCoord[idx]}
                    onChange={(e) => {
                      const next: [string, string, string] = [...newCoord];
                      next[idx] = e.target.value;
                      setNewCoord(next);
                    }}
                    style={{ width: '4.2rem' }}
                  />
                </label>
              ))}
              <button type="button" className="mb-btn" onClick={addAtom}>
                Add {selectedEl}
              </button>
            </div>

            {showPalette && (
              <PeriodicTable
                selected={selectedEl}
                label="Choose element to add or substitute"
                onSelect={(sym) => {
                  setSelectedEl(sym);
                  setShowPalette(false);
                }}
              />
            )}

            <div style={{ maxHeight: '18rem', overflowY: 'auto' }}>
              <table className="mb-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>El</th>
                    <th>x</th>
                    <th>y</th>
                    <th>z</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {structure.species.map((el, idx) => (
                    <tr key={`${el}-${idx}`}>
                      <td>{idx + 1}</td>
                      <td>
                        <strong>{el}</strong>
                      </td>
                      {([0, 1, 2] as const).map((ax) => (
                        <td key={ax}>
                          <input
                            type="number"
                            step="0.01"
                            aria-label={`Site ${idx + 1} ${el} fractional ${['x', 'y', 'z'][ax]}`}
                            value={Number(structure.frac[idx]![ax]!.toFixed(4))}
                            onChange={(e) => updateAtomCoord(idx, ax, Number(e.target.value))}
                          />
                        </td>
                      ))}
                      <td>
                        <button
                          type="button"
                          className="mb-btn"
                          onClick={() =>
                            commit(
                              substitute(structure, idx, selectedEl).structure,
                              `Sub site ${idx + 1} -> ${selectedEl}`,
                            )
                          }
                        >
                          Sub {selectedEl}
                        </button>{' '}
                        <button
                          type="button"
                          className="mb-btn"
                          disabled={structure.species.length <= 1}
                          onClick={() =>
                            commit(vacancy(structure, idx).structure, `Vacancy at site ${idx + 1}`)
                          }
                        >
                          Vacancy
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
