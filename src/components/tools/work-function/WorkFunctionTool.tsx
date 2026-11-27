import { useState, type ChangeEvent } from 'react';
import Badge from '../../ui/Badge';
import '../../../styles/tools.css';
import MiniPlot from '../../labs/MiniPlot';
import Slider from '../../ui/Slider';
import { parseLocpot, type LocpotResult } from '../../../lib/vasp/locpot';
import { parseOutcar } from '../../../lib/vasp/outcar';
import { parseChgcar, type ChgcarResult } from '../../../lib/vasp/chgcar';
import {
  chargeDensityDifference,
  macroscopicAverage,
  planarAverage,
  workFunctionFromLocpot,
} from '../../../lib/physics/volumetric';

export default function WorkFunctionTool() {
  const [locpot, setLocpot] = useState<LocpotResult | null>(null);
  const [eFermi, setEFermi] = useState<string>('0');
  const [axis, setAxis] = useState<0 | 1 | 2>(2);
  const [macroWindow, setMacroWindow] = useState(1);
  const [err, setErr] = useState<string | null>(null);

  // Charge-density difference state (AB - A - B)
  const [chgAB, setChgAB] = useState<ChgcarResult | null>(null);
  const [chgA, setChgA] = useState<ChgcarResult | null>(null);
  const [chgB, setChgB] = useState<ChgcarResult | null>(null);

  async function onLocpotFile(e: ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const files = Array.from(e.target.files ?? []);
    for (const f of files) {
      const text = await f.text();
      try {
        if (/OUTCAR/i.test(f.name) || /E-fermi\s*:/i.test(text)) {
          const out = parseOutcar(text);
          if (out.efermi) setEFermi(out.efermi.value.toFixed(4));
        } else {
          setLocpot(parseLocpot(text));
        }
      } catch (ex) {
        setErr(ex instanceof Error ? ex.message : String(ex));
      }
    }
  }

  async function onChg(setter: (v: ChgcarResult | null) => void, e: ChangeEvent<HTMLInputElement>) {
    setErr(null);
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      setter(parseChgcar(await f.text()));
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  const planar = locpot ? planarAverage(locpot.potentialEv, locpot.grid, axis) : null;
  const macro = planar && macroWindow > 1 ? macroscopicAverage(planar, macroWindow) : null;
  const efNum = Number(eFermi);
  const wf = planar && Number.isFinite(efNum) ? workFunctionFromLocpot(planar, efNum) : null;

  const diffRes =
    chgAB && chgA
      ? chargeDensityDifference(
          { lattice: chgAB.structure.lattice, grid: chgAB.grid, values: chgAB.totalRaw },
          { lattice: chgA.structure.lattice, grid: chgA.grid, values: chgA.totalRaw },
          chgB ? { lattice: chgB.structure.lattice, grid: chgB.grid, values: chgB.totalRaw } : undefined,
        )
      : null;
  const diffPlanar = diffRes && diffRes.ok && chgAB ? planarAverage(diffRes.values, chgAB.grid, axis) : null;

  const tile = (k: string, v: number | undefined, sub: string) => (
    <div className="tile">
      <div className="k">{k}</div>
      <div className={`v${v === undefined ? ' is-empty' : ''}`}>{v === undefined ? 'n/a' : v.toFixed(4)}</div>
      <div className="tile-sub">{sub}</div>
    </div>
  );

  return (
    <div className="wf">
      <header className="page-h tool-head">
        <div>
          <h1>Work function and charge-density difference</h1>
          <p>
            Analyse your own <code>LOCPOT</code> and <code>CHGCAR</code> files locally in the browser: compute
            planar and macroscopic averages, check for a flat vacuum plateau, obtain the work function{' '}
            <code>Phi = V_vacuum - E_F</code>, and compute charge-density differences on matched grids.
          </p>
        </div>
      </header>
      <div className="split left">
        <div className="card tool-inputs">
          <h2 className="card-h">Inputs</h2>
          <section aria-labelledby="wf-in-locpot">
            <h3 id="wf-in-locpot">LOCPOT</h3>
            <p>
              Drop your own <code>LOCPOT</code> (and optional <code>OUTCAR</code> to read <code>E-fermi</code>{' '}
              automatically). <code>LOCPOT</code> values are in eV and are not divided by cell volume (S-043).
            </p>
            <div className="wf-fields">
              <label>
                LOCPOT / OUTCAR: <input type="file" multiple onChange={onLocpotFile} />
              </label>
              <label>
                Fermi energy E_F (eV):{' '}
                <input type="number" step="0.01" value={eFermi} onChange={(e) => setEFermi(e.target.value)} />
              </label>
              <label>
                Axis:{' '}
                <select value={axis} onChange={(e) => setAxis(Number(e.target.value) as 0 | 1 | 2)}>
                  <option value={0}>a (x)</option>
                  <option value={1}>b (y)</option>
                  <option value={2}>c (z, slab normal)</option>
                </select>
              </label>
              {planar && wf && (
                <Slider
                  label="Macroscopic average window (grid slices, 1 = off)"
                  min={1}
                  max={Math.max(1, Math.min(40, Math.floor(planar.length / 2)))}
                  step={1}
                  value={macroWindow}
                  onChange={setMacroWindow}
                />
              )}
            </div>
          </section>
          <section aria-labelledby="wf-in-chg">
            <h3 id="wf-in-chg">CHGCAR</h3>
            <p>
              Drop two or three <code>CHGCAR</code> files computed in the exact same cell and FFT grid to
              inspect planar-averaged charge redistribution. Incompatible cells or grids are refused.
            </p>
            <div className="wf-fields">
              <label>
                CHGCAR (AB): <input type="file" onChange={(e) => onChg(setChgAB, e)} />
              </label>
              <label>
                CHGCAR (A): <input type="file" onChange={(e) => onChg(setChgA, e)} />
              </label>
              <label>
                CHGCAR (B, optional): <input type="file" onChange={(e) => onChg(setChgB, e)} />
              </label>
            </div>
          </section>
          {(err || wf?.warning || (diffRes && !diffRes.ok)) && (
            <div className="notice wf-notice">
              {err && <p role="alert">{err}</p>}
              {wf?.warning && <p role="alert">{wf.warning}</p>}
              {diffRes && !diffRes.ok && <p role="alert">{diffRes.reason}</p>}
            </div>
          )}
        </div>

        <div className="stack tool-results">
          <div className="grid g3 tool-tiles">
            {tile('Vacuum level', planar && wf ? wf.vacuumLevelEv : undefined, 'V_vacuum, eV')}
            {tile('Fermi energy', planar && wf ? wf.eFermiEv : undefined, 'E_F, eV')}
            {tile('Work function', planar && wf ? wf.workFunctionEv : undefined, 'Phi = V_vacuum - E_F, eV')}
          </div>

          <section className="card tool-card" aria-labelledby="wf-planar">
            <h2 id="wf-planar" className="card-h">
              <Badge variant="computed" /> Planar average and work function (LOCPOT)
            </h2>
            {planar && wf ? (
              <>
                <p className="wf-line">
                  V_vacuum = {wf.vacuumLevelEv.toFixed(4)} eV | E_F = {wf.eFermiEv.toFixed(4)} eV | Work
                  function Phi = {wf.workFunctionEv.toFixed(4)} eV
                </p>
                <MiniPlot
                  title="Planar-averaged electrostatic potential"
                  xLabel="Grid slice along chosen axis"
                  yLabel="Potential (eV)"
                  xMin={0}
                  xMax={planar.length - 1}
                  yMin={Math.min(...planar)}
                  yMax={Math.max(...planar) + 0.1}
                  hlines={[wf.vacuumLevelEv, wf.eFermiEv]}
                  curves={[
                    { xs: planar.map((_, i) => i), ys: planar, label: 'planar average', color: '#0072B2' },
                    ...(macro
                      ? [
                          {
                            xs: macro.map((_, i) => i),
                            ys: macro,
                            label: 'macroscopic average',
                            color: '#D55E00',
                            dash: '6 3',
                          },
                        ]
                      : []),
                  ]}
                />
              </>
            ) : (
              <p className="ph">Choose a LOCPOT in the Inputs card to see the planar average.</p>
            )}
          </section>

          <section className="card tool-card" aria-labelledby="wf-diff">
            <h2 id="wf-diff" className="card-h">
              <Badge variant="computed" /> Charge-density difference (CHGCAR_AB - CHGCAR_A - CHGCAR_B)
            </h2>
            {diffPlanar ? (
              <MiniPlot
                title="Planar-averaged charge-density difference (raw rho*V)"
                xLabel="Grid slice"
                yLabel="Delta (rho * V)"
                xMin={0}
                xMax={diffPlanar.length - 1}
                yMin={Math.min(-1e-6, ...diffPlanar)}
                yMax={Math.max(1e-6, ...diffPlanar)}
                hlines={[0]}
                curves={[
                  { xs: diffPlanar.map((_, i) => i), ys: diffPlanar, label: 'Delta rho', color: '#0072B2' },
                ]}
              />
            ) : (
              <p className="ph">
                Choose CHGCAR (AB) and CHGCAR (A) in the Inputs card to see the difference.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
