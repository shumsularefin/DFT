import { useMemo, useState } from 'react';
import Badge from '../../ui/Badge';
import { RECIPES, buildPlanZip, buildStepIncar, type Recipe } from '../../../lib/planner/plan';
import { energyPerFormulaUnit, neutralFormationEnergy, surfaceEnergy } from '../../../lib/physics/surface';
import { readStructure } from '../../../lib/crystal/io';
import type { Structure } from '../../../lib/crystal/types';
import { takeHandoff } from '../../../lib/handoff';

function downloadBytes(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PlannerTool() {
  const [goalId, setGoalId] = useState<string>(RECIPES[0]!.id);
  const [enmax, setEnmax] = useState<number>(400);
  const [structure, setStructure] = useState<Structure | null>(() => {
    if (typeof window === 'undefined') return null;
    const h = takeHandoff(['structure']);
    return h && h.kind === 'structure' ? h.structure : null;
  });
  const [structLabel, setStructLabel] = useState<string>(
    structure
      ? `${structure.comment} (${structure.species.length} sites)`
      : 'None loaded (optional POSCAR/CIF)',
  );

  // Small calculator state
  const [eSlab, setESlab] = useState(-90);
  const [eBulk, setEBulk] = useState(-10);
  const [nUnits, setNUnits] = useState(10);
  const [areaA2, setAreaA2] = useState(50);

  const [eComp, setEComp] = useState(-14);
  const [nA, setNA] = useState(1);
  const [muA, setMuA] = useState(-4);
  const [nB, setNB] = useState(1);
  const [muB, setMuB] = useState(-6);

  const [eTotalFu, setETotalFu] = useState(-42.8);
  const [zFu, setZFu] = useState(4);

  const recipe: Recipe = useMemo(() => RECIPES.find((r) => r.id === goalId) ?? RECIPES[0]!, [goalId]);

  const surfRes = useMemo(() => {
    try {
      return surfaceEnergy(eSlab, eBulk, nUnits, areaA2);
    } catch {
      return null;
    }
  }, [eSlab, eBulk, nUnits, areaA2]);

  const formRes = useMemo(
    () =>
      neutralFormationEnergy(eComp, [
        { symbol: 'A', count: nA, refEnergyPerAtomEv: muA },
        { symbol: 'B', count: nB, refEnergyPerAtomEv: muB },
      ]),
    [eComp, nA, muA, nB, muB],
  );

  const fuRes = useMemo(() => {
    try {
      return energyPerFormulaUnit(eTotalFu, zFu);
    } catch {
      return null;
    }
  }, [eTotalFu, zFu]);

  async function onUpload(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const res = readStructure(file.name, text);
      setStructure(res.structure);
      setStructLabel(`${file.name} (${res.structure.species.length} sites)`);
    } catch {
      setStructLabel(`Could not parse ${file.name}`);
    }
  }

  return (
    <div
      style={{ display: 'grid', gap: 'var(--space-5)', minWidth: 0, maxWidth: '100%' }}
      data-tool-id="research-planner"
    >
      <div
        role="note"
        style={{
          padding: 'var(--space-3)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          background: 'var(--surface)',
        }}
      >
        <strong>Starting protocol, not a guarantee:</strong> Every step below is traced to a registered source
        in <a href="/references/">References</a>. This planner does not choose exchange-correlation
        functionals or Hubbard U values for you; review{' '}
        <a href="/handbook/05-practical-choices/functionals/">Functionals</a> and{' '}
        <a href="/handbook/05-practical-choices/dft-plus-u/">DFT+U</a> before running production jobs.
      </div>

      <section
        style={{
          display: 'grid',
          gap: 'var(--space-3)',
          padding: 'var(--space-4)',
          minWidth: 0,
          maxWidth: '100%',
          overflowX: 'auto',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          background: 'var(--surface)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'end' }}>
          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span>Research goal</span>
            <select
              style={{ maxWidth: '100%' }}
              value={goalId}
              onChange={(e) => setGoalId(e.target.value)}
              style={{
                padding: '0.45rem 0.65rem',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg)',
                color: 'var(--text)',
              }}
            >
              {RECIPES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span>Max POTCAR ENMAX (eV)</span>
            <input
              type="number"
              min={150}
              max={1000}
              step={10}
              value={enmax}
              onChange={(e) => setEnmax(Math.max(150, Number(e.target.value) || 400))}
              style={{
                width: '7rem',
                padding: '0.45rem 0.65rem',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg)',
                color: 'var(--text)',
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span>Optional POSCAR / CIF</span>
            <input
              type="file"
              accept=".vasp,.poscar,.cif,text/plain"
              onChange={(e) => void onUpload(e.target.files?.[0])}
            />
          </label>

          <button
            type="button"
            onClick={() => downloadBytes(buildPlanZip(recipe, structure, enmax), `${recipe.id}-plan.zip`)}
            style={{
              padding: '0.5rem 0.9rem',
              border: '1px solid var(--border-strong)',
              borderRadius: 'var(--radius)',
              background: 'var(--accent)',
              color: 'var(--accent-contrast)',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Download workflow zip (PLAN.md + INCARs)
          </button>
        </div>

        <p style={{ margin: 0, fontSize: 'var(--step--1)', color: 'var(--text-muted)' }}>
          Structure: {structLabel} | Sources: {recipe.sources.join(', ')}
        </p>
        <p style={{ margin: 0 }}>{recipe.summary}</p>
      </section>

      <ol style={{ display: 'grid', gap: 'var(--space-3)', paddingLeft: '1.25rem', margin: 0 }}>
        {recipe.steps.map((step) => {
          const incar = buildStepIncar(step, enmax);
          return (
            <li
              key={step.id}
              style={{
                padding: 'var(--space-3)',
                border: '1px solid var(--border-strong)',
                borderRadius: 'var(--radius)',
                background: 'var(--surface)',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)', alignItems: 'center' }}>
                <strong>{step.title}</strong>
                <Badge variant="verified" />
                <span style={{ fontSize: 'var(--step--1)', color: 'var(--text-muted)' }}>
                  Preset: <code>{step.preset}</code> | Sources: {step.sources.join(', ')}
                </span>
              </div>
              {step.carries.length > 0 && (
                <p style={{ margin: '0.35rem 0 0', fontSize: 'var(--step--1)' }}>
                  <strong>Carries forward:</strong> {step.carries.join(', ')}
                </p>
              )}
              <details style={{ marginTop: '0.5rem' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                  Why this step, values, checks, pitfalls, and starter INCAR
                </summary>
                <div
                  style={{ display: 'grid', gap: '0.5rem', marginTop: '0.5rem', fontSize: 'var(--step--1)' }}
                >
                  <p style={{ margin: 0 }}>
                    <strong>Why this step:</strong> {step.whyStep}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>Why these values:</strong> {step.whyValues}
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong>What happens if you skip it:</strong> {step.ifSkipped}
                  </p>
                  <div>
                    <strong>Checks:</strong>
                    <ul style={{ margin: '0.25rem 0 0' }}>
                      {step.checks.map((c, i) => (
                        <li key={i}>{c}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Methods section checklist:</strong>
                    <ul style={{ margin: '0.25rem 0 0' }}>
                      {step.report.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  {step.pitfalls.length > 0 && (
                    <p style={{ margin: 0 }}>
                      <strong>Pitfalls:</strong>{' '}
                      {step.pitfalls.map((p, i) => (
                        <span key={p}>
                          {i > 0 ? ', ' : ''}
                          <a href={`/errors/?q=${encodeURIComponent(p)}`}>{p}</a>
                        </span>
                      ))}
                    </p>
                  )}
                  <pre
                    style={{
                      margin: 0,
                      padding: '0.65rem',
                      background: 'var(--bg)',
                      border: '1px solid var(--border-strong)',
                      borderRadius: 'var(--radius)',
                      overflowX: 'auto',
                    }}
                  >
                    {incar.text}
                  </pre>
                </div>
              </details>
            </li>
          );
        })}
      </ol>

      <section
        style={{
          display: 'grid',
          gap: 'var(--space-3)',
          padding: 'var(--space-4)',
          minWidth: 0,
          maxWidth: '100%',
          overflowX: 'auto',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius)',
          background: 'var(--surface)',
        }}
      >
        <h2 style={{ margin: 0, fontSize: 'var(--step-1)' }}>
          Recipe calculators <Badge variant="computed" />
        </h2>
        <div
          style={{
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          }}
        >
          <div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: 'var(--step-0)' }}>
              Symmetric slab surface energy (S-065)
            </h3>
            <div style={{ display: 'grid', gap: '0.35rem', fontSize: 'var(--step--1)' }}>
              <label>
                E_slab (eV):{' '}
                <input
                  type="number"
                  step="0.1"
                  value={eSlab}
                  onChange={(e) => setESlab(Number(e.target.value))}
                  style={{ width: '6rem' }}
                />
              </label>
              <label>
                E_bulk / unit (eV):{' '}
                <input
                  type="number"
                  step="0.1"
                  value={eBulk}
                  onChange={(e) => setEBulk(Number(e.target.value))}
                  style={{ width: '6rem' }}
                />
              </label>
              <label>
                N bulk units:{' '}
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={nUnits}
                  onChange={(e) => setNUnits(Number(e.target.value))}
                  style={{ width: '5rem' }}
                />
              </label>
              <label>
                Area A (A^2):{' '}
                <input
                  type="number"
                  min={0.1}
                  step="0.5"
                  value={areaA2}
                  onChange={(e) => setAreaA2(Number(e.target.value))}
                  style={{ width: '6rem' }}
                />
              </label>
              {surfRes && (
                <p style={{ margin: '0.25rem 0 0', fontFamily: 'var(--font-mono)' }}>
                  gamma = {surfRes.gammaEvPerA2.toFixed(4)} eV/A^2 ={' '}
                  <strong>{surfRes.gammaJPerM2.toFixed(4)} J/m^2</strong>
                </p>
              )}
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: 'var(--step-0)' }}>
              Neutral formation energy (S-042)
            </h3>
            <div style={{ display: 'grid', gap: '0.35rem', fontSize: 'var(--step--1)' }}>
              <label>
                E_compound (eV):{' '}
                <input
                  type="number"
                  step="0.1"
                  value={eComp}
                  onChange={(e) => setEComp(Number(e.target.value))}
                  style={{ width: '6rem' }}
                />
              </label>
              <label>
                n_A / mu_A (eV):{' '}
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={nA}
                  onChange={(e) => setNA(Number(e.target.value))}
                  style={{ width: '3.5rem' }}
                />{' '}
                <input
                  type="number"
                  step="0.1"
                  value={muA}
                  onChange={(e) => setMuA(Number(e.target.value))}
                  style={{ width: '5rem' }}
                />
              </label>
              <label>
                n_B / mu_B (eV):{' '}
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={nB}
                  onChange={(e) => setNB(Number(e.target.value))}
                  style={{ width: '3.5rem' }}
                />{' '}
                <input
                  type="number"
                  step="0.1"
                  value={muB}
                  onChange={(e) => setMuB(Number(e.target.value))}
                  style={{ width: '5rem' }}
                />
              </label>
              <p style={{ margin: '0.25rem 0 0', fontFamily: 'var(--font-mono)' }}>
                E_f = {formRes.totalEv.toFixed(4)} eV (<strong>{formRes.perAtomEv.toFixed(4)} eV/atom</strong>
                )
              </p>
            </div>
          </div>

          <div>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: 'var(--step-0)' }}>
              Energy per formula unit (S-042)
            </h3>
            <div style={{ display: 'grid', gap: '0.35rem', fontSize: 'var(--step--1)' }}>
              <label>
                E_total (eV):{' '}
                <input
                  type="number"
                  step="0.1"
                  value={eTotalFu}
                  onChange={(e) => setETotalFu(Number(e.target.value))}
                  style={{ width: '6rem' }}
                />
              </label>
              <label>
                Z (formula units):{' '}
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={zFu}
                  onChange={(e) => setZFu(Number(e.target.value))}
                  style={{ width: '5rem' }}
                />
              </label>
              {fuRes !== null && (
                <p style={{ margin: '0.25rem 0 0', fontFamily: 'var(--font-mono)' }}>
                  E / Z = <strong>{fuRes.toFixed(4)} eV/f.u.</strong>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
