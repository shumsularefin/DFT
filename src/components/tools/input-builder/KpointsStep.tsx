import { reciprocalLengths, kpointCount } from '../../../lib/vasp/kpoints';
import type { RoundingRule } from '../../../lib/vasp/kpoints';
import { sendHandoff } from '../../../lib/handoff';
import { centeringOf, kpointsOf, useBuilder, type KpMode } from './store';

export default function KpointsStep() {
  const s = useBuilder();
  const kp = kpointsOf(s);
  const rec = centeringOf(s);
  const set = (v: number) => {
    s.set('spacing', v);
    if (useBuilder.getState().kpMode === 'kspacing') s.setEntry('KSPACING', String(v));
  };
  return (
    <section aria-labelledby="ib-s5">
      <h2 id="ib-s5">5. K-points</h2>
      {!s.structure && <p className="ib-error">Add a structure in step 1 to see a mesh.</p>}
      <fieldset className="ib-fieldset">
        <legend>How should VASP get its k-points?</legend>
        {(
          [
            ['gamma', 'Gamma-centred mesh (KPOINTS file)'],
            ['monkhorst-pack', 'Monkhorst-Pack mesh (KPOINTS file)'],
            ['kspacing', 'KSPACING in the INCAR (no KPOINTS file)'],
            ['line', 'Line mode for a band path (placeholder)'],
          ] as [KpMode, string][]
        ).map(([m, label]) => (
          <label key={m} className="ib-radio">
            <input type="radio" name="kpmode" checked={s.kpMode === m} onChange={() => s.setKpMode(m)} />
            {label}
          </label>
        ))}
      </fieldset>
      {s.kpMode === 'line' ? (
        <p className="ib-note">
          Line-mode paths come from the <a href="/tools/kpath/">k-path tool</a>. No KPOINTS file is written
          here.{' '}
          {s.structure && (
            <button
              type="button"
              onClick={() => {
                if (s.structure)
                  sendHandoff(
                    { v: 1, kind: 'structure', from: 'input-builder', structure: s.structure },
                    '/tools/kpath/',
                  );
              }}
            >
              Open this structure in the k-path tool
            </button>
          )}
        </p>
      ) : (
        <>
          <div className="ib-field">
            <label htmlFor="ib-spacing">Target spacing (1/&Aring;, KSPACING): {s.spacing.toFixed(2)}</label>
            <input
              id="ib-spacing"
              type="range"
              min={0.1}
              max={0.6}
              step={0.01}
              value={s.spacing}
              onChange={(e) => set(Number(e.target.value))}
            />
            <p className="ib-small">
              Smaller spacing means a denser mesh. Resolution (VASPKIT, in 2&pi;/&Aring;) is the spacing
              divided by 2&pi; = {(s.spacing / (2 * Math.PI)).toFixed(4)}.
            </p>
          </div>
          <div className="ib-field">
            <label htmlFor="ib-rule">Rounding rule</label>
            <select
              id="ib-rule"
              value={s.rule}
              onChange={(e) => s.set('rule', e.target.value as RoundingRule)}
            >
              <option value="ceil">ceil (default)</option>
              <option value="round">round</option>
              <option value="plus0.999">floor(x + 0.999)</option>
            </select>
          </div>
          <p className="ib-warn" role="note">
            The rule VASP uses to turn KSPACING into a mesh is not yet confirmed (Q-004). This tool uses{' '}
            <strong>{kp.rule}</strong>. Check the mesh VASP prints in OUTCAR.
          </p>
          {kp.mesh && s.structure && (
            <div role="status" aria-live="polite" data-testid="mesh-readout">
              <p>
                Mesh: <strong>{kp.mesh.join(' x ')}</strong>, {kpointCount(kp.mesh)} points before symmetry
                reduction. Reciprocal lengths:{' '}
                {reciprocalLengths(s.structure.lattice)
                  .map((x) => x.toFixed(3))
                  .join(', ')}{' '}
                1/&Aring;.
              </p>
            </div>
          )}
          {rec && (
            <p>
              Centring advice:{' '}
              <strong>{rec.centering === 'gamma' ? 'Gamma-centred' : 'either centring'}</strong>. {rec.reason}
            </p>
          )}
          {kp.text && (
            <>
              <h3>KPOINTS</h3>
              <pre className="ib-pre" tabIndex={0} aria-label="KPOINTS file">
                {kp.text}
              </pre>
            </>
          )}
        </>
      )}
    </section>
  );
}
