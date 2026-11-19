import { useMemo, useState } from 'react';
import Badge from '../../ui/Badge';
import type { ConfigOutput } from '../../../lib/magnetism/export';
import {
  DEFAULT_CONVENTION,
  describeConvention,
  validateConvention,
  type HeisenbergConvention,
} from '../../../lib/magnetism/heisenberg';
import { analyseAll, readRunFile, type EnergyKind, type RunRead, type RunState } from './analyseModel';

const MAX_BYTES = 25 * 1024 * 1024;
const meV = (x: number) => (x * 1000).toFixed(2);
const VERDICT: Record<string, string> = {
  kept: 'kept',
  flipped: 'flipped sign',
  collapsed: 'collapsed to zero',
  shrunk: 'shrank below the fraction',
  appeared: 'moment appeared',
  'not-checked': 'not checked',
};

export default function AnalysePanel({ outputs }: { outputs: ConfigOutput[] }) {
  const [states, setStates] = useState<Record<string, RunState>>({});
  const [kind, setKind] = useState<EnergyKind>('F');
  const [nShells, setNShells] = useState(1);
  const [conv, setConv] = useState<HeisenbergConvention>(DEFAULT_CONVENTION);
  const [sText, setSText] = useState('2.5');
  const [msg, setMsg] = useState('');

  const convError = validateConvention(conv);
  const res = useMemo(
    () => (convError ? null : analyseAll(outputs, states, kind, nShells, conv)),
    [outputs, states, kind, nShells, conv, convError],
  );
  const set = (folder: string, f: (s: RunState) => RunState) =>
    setStates((x) => ({ ...x, [folder]: f(x[folder] ?? { reads: [], typed: '' }) }));

  const onFiles = async (folder: string, list: FileList | null) => {
    if (!list?.length) return;
    const reads: RunRead[] = [];
    for (const f of Array.from(list)) {
      if (f.size > MAX_BYTES) {
        setMsg(`${f.name} is larger than 25 MB, which is more than this tool accepts.`);
        continue;
      }
      reads.push(readRunFile(f.name, await f.text()));
    }
    set(folder, (s) => ({ ...s, reads }));
    setMsg(
      `Read ${reads.map((r) => `${r.name} (${r.kind})`).join(', ')} for ${folder}. Nothing was uploaded.`,
    );
  };
  const maxAbs = Math.max(1e-12, ...(res?.ranking.rows.map((r) => Math.abs(r.relative)) ?? [0]));

  return (
    <div className="mg-analyse">
      <p>
        Run the configurations, then give each one its OSZICAR or OUTCAR (both is best: OUTCAR with LORBIT =
        11 has the per-site moments), or type its total energy. Files are read in your browser and never
        uploaded.
      </p>
      <div className="mg-field">
        <label htmlFor="mg-ekind">Energy to compare</label>
        <select id="mg-ekind" value={kind} onChange={(e) => setKind(e.target.value as EnergyKind)}>
          <option value="F">F (free energy, TOTEN)</option>
          <option value="E0">E0 (sigma to 0)</option>
        </select>
      </div>
      <table className="mg-table" aria-label="Energies per configuration">
        <thead>
          <tr>
            <th scope="col">Configuration</th>
            <th scope="col">Files</th>
            <th scope="col">or energy (eV per cell)</th>
            <th scope="col">Used</th>
          </tr>
        </thead>
        <tbody>
          {outputs.map((o, i) => {
            const run = res?.runs[i];
            return (
              <tr key={o.folder}>
                <th scope="row">{o.folder}</th>
                <td>
                  <input
                    type="file"
                    multiple
                    aria-label={`OSZICAR or OUTCAR for ${o.folder}`}
                    onChange={(e) => void onFiles(o.folder, e.target.files)}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`Total energy of ${o.folder}, eV per cell`}
                    value={states[o.folder]?.typed ?? ''}
                    onChange={(e) => set(o.folder, (s) => ({ ...s, typed: e.target.value }))}
                  />
                </td>
                <td className="mg-src">
                  {run?.energy ? `${run.energy.value} eV (${run.energy.source})` : 'none yet'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p role="status" className="mg-note">
        {msg}
      </p>
      {res?.runs
        .flatMap((r) => r.warnings)
        .map((w) => (
          <p key={w} className="mg-note">
            {w}
          </p>
        ))}

      {res && res.ranking.rows.length > 0 && (
        <>
          <h3>Ranking</h3>
          <p className="mg-note">
            <Badge variant="computed" /> Energy per magnetic ion relative to {res.ranking.reference}, from
            your numbers only. Compare only runs with the same settings (ENCUT, k-points, U, smearing).
          </p>
          <table
            className="mg-table"
            data-testid="mg-ranking"
            tabIndex={0}
            aria-label="Ranking of configurations"
          >
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Configuration</th>
                <th scope="col">Magnetic ions</th>
                <th scope="col">eV per magnetic ion</th>
                <th scope="col">ΔE, meV per magnetic ion</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {res.ranking.rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.rank}</td>
                  <th scope="row">{r.label}</th>
                  <td>{r.nMagnetic}</td>
                  <td>{r.perIon.toFixed(6)}</td>
                  <td>{meV(r.relative)}</td>
                  <td className="mg-src">{r.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <svg
            className="mg-bars"
            role="img"
            aria-label={`Bar chart of energy relative to ${res.ranking.reference}: ${res.ranking.rows.map((r) => `${r.label} ${meV(r.relative)} meV`).join(', ')}`}
            viewBox={`0 0 320 ${res.ranking.rows.length * 28 + 4}`}
          >
            <line x1="160" x2="160" y1="0" y2={res.ranking.rows.length * 28 + 4} className="mg-axis" />
            {res.ranking.rows.map((r, i) => {
              const w = (Math.abs(r.relative) / maxAbs) * 110;
              const x = r.relative < 0 ? 160 - w : 160;
              return (
                <g key={r.label} transform={`translate(0 ${i * 28 + 4})`}>
                  <text x="4" y="15" className="mg-bar-label">
                    {r.label}
                  </text>
                  <rect x={x} y="2" width={Math.max(w, 1)} height="18" className="mg-bar" />
                  <text x={r.relative < 0 ? 166 : 154} y="15" textAnchor={r.relative < 0 ? 'start' : 'end'}>
                    {meV(r.relative)}
                  </text>
                </g>
              );
            })}
          </svg>
          {res.ranking.warnings.map((w) => (
            <p key={w} className="mg-note">
              {w}
            </p>
          ))}
        </>
      )}

      {res?.runs.some((r) => r.pattern) && <h3>Final moments</h3>}
      {res?.runs.map(
        (r) =>
          r.pattern && (
            <section key={r.folder} aria-label={`Final moments of ${r.folder}`}>
              <h4>
                {r.folder}: {r.pattern.kept ? 'pattern kept' : 'pattern NOT kept'}{' '}
                <Badge variant="heuristic" />
              </h4>
              <p className="mg-note">
                {r.pattern.rule} From {r.sitesSource}.
              </p>
              {r.pattern.warnings.map((w) => (
                <p key={w} className="mg-error">
                  {w}
                </p>
              ))}
              {r.pattern.sites.length > 0 && (
                <table
                  className="mg-table"
                  data-testid={`mg-sites-${r.folder}`}
                  tabIndex={0}
                  aria-label={`Per-site moments of ${r.folder}`}
                >
                  <thead>
                    <tr>
                      <th scope="col">Ion</th>
                      <th scope="col">Element</th>
                      <th scope="col">MAGMOM (start)</th>
                      <th scope="col">Final, μB</th>
                      <th scope="col">Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.pattern.sites
                      .filter((s) => s.intended !== 0 || s.verdict !== 'not-checked')
                      .map((s) => (
                        <tr key={s.ion}>
                          <td>{s.ion}</td>
                          <td>{r.species[s.ion - 1]}</td>
                          <td>{s.intended}</td>
                          <td>{s.final.toFixed(3)}</td>
                          <td>{VERDICT[s.verdict]}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
              {r.moment && (
                <p className="mg-note">
                  Sum of site moments {r.moment.siteSum.toFixed(3)} μB, cell moment {r.moment.mag.toFixed(3)}{' '}
                  μB ({r.momentSource}): {r.moment.consistent ? 'consistent' : 'large gap, check the run'}.{' '}
                  {r.moment.note}
                </p>
              )}
            </section>
          ),
      )}

      <h3>Exchange constants (optional)</h3>
      <fieldset className="mg-fieldset" aria-describedby="mg-conv-text">
        <legend>Hamiltonian convention</legend>
        <div className="mg-row">
          <div className="mg-field">
            <label htmlFor="mg-conv-sign">Sign</label>
            <select
              id="mg-conv-sign"
              value={conv.sign}
              onChange={(e) => setConv((c) => ({ ...c, sign: e.target.value as 'plus' | 'minus' }))}
            >
              <option value="plus">H = +J S.S (J &gt; 0 antiferromagnetic)</option>
              <option value="minus">H = -J S.S (J &gt; 0 ferromagnetic)</option>
            </select>
          </div>
          <div className="mg-field">
            <label htmlFor="mg-conv-pairs">Pairs</label>
            <select
              id="mg-conv-pairs"
              value={conv.pairs}
              onChange={(e) => setConv((c) => ({ ...c, pairs: e.target.value as 'once' | 'twice' }))}
            >
              <option value="once">each pair counted once</option>
              <option value="twice">each pair counted twice</option>
            </select>
          </div>
          <div className="mg-field">
            <label htmlFor="mg-conv-spin">Spins</label>
            <select
              id="mg-conv-spin"
              value={conv.spin.kind}
              onChange={(e) =>
                setConv((c) => ({
                  ...c,
                  spin: e.target.value === 'unit' ? { kind: 'unit' } : { kind: 'S', s: Number(sText) },
                }))
              }
            >
              <option value="unit">unit spins</option>
              <option value="S">spin length S</option>
            </select>
          </div>
          {conv.spin.kind === 'S' && (
            <div className="mg-field">
              <label htmlFor="mg-conv-s">S</label>
              <input
                id="mg-conv-s"
                inputMode="decimal"
                value={sText}
                onChange={(e) => {
                  setSText(e.target.value);
                  setConv((c) => ({ ...c, spin: { kind: 'S', s: Number(e.target.value) } }));
                }}
              />
            </div>
          )}
          <div className="mg-field">
            <label htmlFor="mg-shells">Neighbour shells to fit</label>
            <select id="mg-shells" value={nShells} onChange={(e) => setNShells(Number(e.target.value))}>
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p id="mg-conv-text" className="mg-pre" data-testid="mg-convention">
          {convError ?? describeConvention(conv)}
        </p>
        <p className="mg-note">
          No default has been agreed yet (open question Q-042): check which convention the paper you compare
          with uses. Published J values differ by factors of 2 and S^2 for this reason alone.
        </p>
      </fieldset>
      {res?.fitWarnings.map((w) => (
        <p key={w} className="mg-error">
          {w}
        </p>
      ))}
      {res?.fit && (
        <div data-testid="mg-fit">
          {res.fit.warnings.map((w) => (
            <p key={w} className="mg-error" role="alert">
              {w}
            </p>
          ))}
          {res.fit.j && (
            <>
              <table className="mg-table" tabIndex={0}>
                <caption>
                  <Badge variant="computed" /> Least-squares fit to your energies. Convention:{' '}
                  {res.fit.conventionText}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Shell</th>
                    <th scope="col">Distance, Å</th>
                    <th scope="col">J, meV</th>
                  </tr>
                </thead>
                <tbody>
                  {res.fit.j.map((j, n) => (
                    <tr key={n}>
                      <th scope="row">J{n + 1}</th>
                      <td>{res.shells?.[n]?.toFixed(3)}</td>
                      <td>{meV(j)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mg-note">
                Residual RMS {meV(res.fit.rms!)} meV per magnetic ion; condition number{' '}
                {res.fit.condition.toPrecision(3)};{' '}
                {res.fit.determination === 'over' ? 'over-determined' : 'exactly determined'} (
                {res.ranking.rows.length} configurations, {res.fit.j.length + 1} unknowns).
              </p>
            </>
          )}
        </div>
      )}
      <p className="mg-note">
        No Néel or Curie temperature is estimated here: mean-field estimates need a cited formula and have
        large known errors (Q-042).
      </p>
    </div>
  );
}
