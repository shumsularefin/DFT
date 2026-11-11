import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Lazy3D, { type SceneModule } from '../../labs/Lazy3D';
import SolidFallback, { type FlatPoint } from '../../labs/SolidFallback';
import { analyzeResultToPath } from '../../labs/bzPath';
import Slider from '../../ui/Slider';
import Toggle from '../../ui/Toggle';
import {
  BRAVAIS,
  bravaisInfo,
  buildBravais,
  type BravaisId,
  type ParamKey,
} from '../../../lib/crystal/bravais';
import { brillouinZone } from '../../../lib/crystal/brillouin';
import { meshPoints, qToCartesian } from '../../../lib/crystal/kmesh';
import { readStructure } from '../../../lib/crystal/io';
import {
  hpkotPath,
  pointLabelDisplay,
  setyawanPath,
  type KPathAny,
  type KPathConvention,
} from '../../../lib/crystal/kpath';
import { writePoscar } from '../../../lib/crystal/poscar';
import { describeStandardization } from '../../../lib/crystal/standardize';
import { SymmetryClient } from '../../../lib/crystal/symmetry-client';
import type { SymmetryResult } from '../../../lib/crystal/symmetry';
import type { Structure } from '../../../lib/crystal/types';
import { takeHandoff } from '../../../lib/handoff';
import {
  MAX_POINTS,
  MIN_POINTS,
  ROUTE_NOTES,
  buildPathTable,
  pathPoints,
  writeKpathIn,
  writeKpoints,
  writeKpointsOpt,
  writePathCsv,
  writePathJson,
  type Spacing,
} from '../../../lib/vasp/kpathExport';
import { prefersReducedMotion } from '../../../lib/three/capabilities';
import { BZ_COLORS } from '../../../lib/three/bzColors';
import type { BzScene } from '../../../lib/three/BzScene';
import type { SceneController } from '../../../lib/three/SceneController';
import { downloadBlob } from '../input-builder/hooks';
import './kpath.css';

const MAX_BYTES = 25 * 1024 * 1024;
const load = (): Promise<SceneModule> => import('../../../lib/three/BzScene');
const isBz = (c: SceneController | null): c is BzScene => !!c && typeof (c as BzScene).setZone === 'function';

const FIELD_NAMES: Record<ParamKey, string> = {
  a: 'a (Å)',
  b: 'b (Å)',
  c: 'c (Å)',
  alpha: 'α (degrees)',
  beta: 'β (degrees)',
  gamma: 'γ (degrees)',
};

type Result = { hpkot?: KPathAny; sc?: KPathAny; hpkotError?: string; scError?: string };

/** The research k-path tool: cell in, path table and VASP files out. Everything runs in this page. */
export default function KPathTool() {
  const [bravaisId, setBravaisId] = useState<BravaisId>('cF');
  const [params, setParams] = useState<Record<string, string>>({ a: '3.61' });
  const [text, setText] = useState('');
  const [source, setSource] = useState<'bravais' | 'file'>('bravais');
  const [fileError, setFileError] = useState('');
  const [fileNotes, setFileNotes] = useState<string[]>([]);
  const [handoffLabel, setHandoffLabel] = useState('');
  const [handoffStructure, setHandoffStructure] = useState<Structure | null>(null);

  const [sym, setSym] = useState<SymmetryResult | null>(null);
  const [paths, setPaths] = useState<Result>({});
  const [busy, setBusy] = useState(false);
  const [engineError, setEngineError] = useState('');

  const [convention, setConvention] = useState<KPathConvention>('HPKOT');
  const [mode, setMode] = useState<'count' | 'density'>('count');
  const [count, setCount] = useState(40);
  const [density, setDensity] = useState(30);
  const [overrides, setOverrides] = useState<Record<number, number>>({});

  const [scene, setScene] = useState<BzScene | null>(null);
  const [axes, setAxes] = useState(false);
  const [showMesh, setShowMesh] = useState(false);
  const [mesh, setMesh] = useState(6);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [preview, setPreview] = useState<'kpoints' | 'kpath' | 'opt' | 'csv' | 'json' | 'poscar'>('kpoints');
  const client = useRef<SymmetryClient | null>(null);
  useEffect(() => () => client.current?.dispose(), []);
  useEffect(() => setReduced(prefersReducedMotion()), []);

  // hand-off from the Builder or the Input Builder
  useEffect(() => {
    const h = takeHandoff(['structure']);
    if (h && h.kind === 'structure') {
      setHandoffStructure(h.structure);
      setHandoffLabel(h.label ?? `the ${h.from} tool`);
      setSource('file');
    }
  }, []);

  // the structure the page works on
  const bravais = useMemo(() => {
    const nums: Record<string, number> = {};
    for (const k of bravaisInfo(bravaisId).fields)
      nums[k] = params[k] === undefined || params[k] === '' ? NaN : Number(params[k]);
    return buildBravais(bravaisId, nums);
  }, [bravaisId, params]);

  const fileStructure = useMemo<Structure | null>(() => {
    if (handoffStructure && text.trim() === '') return handoffStructure;
    return null;
  }, [handoffStructure, text]);

  const [parsed, setParsed] = useState<Structure | null>(null);
  useEffect(() => {
    if (text.trim() === '') {
      setParsed(null);
      setFileError('');
      setFileNotes([]);
      return;
    }
    try {
      const r = readStructure('pasted.txt', text);
      setParsed(r.structure);
      setFileNotes(r.warnings);
      setFileError('');
    } catch (e) {
      setParsed(null);
      setFileNotes([]);
      setFileError(e instanceof Error ? e.message : String(e));
    }
  }, [text]);

  const input: Structure | null =
    source === 'bravais' ? (bravais.structure ?? null) : (parsed ?? fileStructure);

  // symmetry analysis whenever the input changes
  useEffect(() => {
    let live = true;
    setSym(null);
    setPaths({});
    setEngineError('');
    setProgress(0);
    setPlaying(false);
    setOverrides({});
    if (!input) return;
    setBusy(true);
    client.current ??= new SymmetryClient();
    client.current
      .analyze(input, { symprec: 1e-4, setting: 'Spglib' })
      .then((r) => {
        if (!live) return;
        const out: Result = {};
        try {
          out.hpkot = hpkotPath(r);
        } catch (e) {
          out.hpkotError = e instanceof Error ? e.message : String(e);
        }
        try {
          out.sc = setyawanPath(r);
        } catch (e) {
          out.scError = e instanceof Error ? e.message : String(e);
        }
        setSym(r);
        setPaths(out);
      })
      .catch((e: unknown) => live && setEngineError(e instanceof Error ? e.message : String(e)))
      .finally(() => live && setBusy(false));
    return () => {
      live = false;
    };
  }, [input]);

  const current = convention === 'HPKOT' ? paths.hpkot : paths.sc;
  const currentError = convention === 'HPKOT' ? paths.hpkotError : paths.scError;
  const spacing: Spacing =
    mode === 'count' ? { mode: 'count', n: count } : { mode: 'density', perInvA: density };
  const table = useMemo(
    () => (current ? buildPathTable(current, spacing, overrides) : null),
    [current, mode, count, density, overrides],
  );
  const header = useMemo(
    () =>
      current && 'bravaisLatticeExtended' in current
        ? { spacegroup: current.spacegroupInternational, lattice: current.bravaisLatticeExtended }
        : current && 'variant' in current
          ? { spacegroup: current.spacegroupInternational, lattice: current.variant }
          : { spacegroup: '', lattice: '' },
    [current],
  );
  const picture = useMemo(
    () => (current ? analyzeResultToPath(current as never, convention, pointLabelDisplay) : null),
    [current, convention],
  );
  const std = useMemo(() => (input && sym ? describeStandardization(input, sym) : null), [input, sym]);
  const recip = picture ? picture.recip : null;
  const zone = useMemo(() => (recip ? brillouinZone(recip) : null), [recip]);
  const pts = useMemo(() => (table ? pathPoints(table) : []), [table]);

  const meshCart = useMemo(() => {
    if (!showMesh || !recip) return null;
    const p = meshPoints([mesh, mesh, mesh], 'gamma');
    const out = new Float64Array(p.coords.length);
    for (let i = 0; i < p.count; i++)
      out.set(qToCartesian([p.coords[3 * i]!, p.coords[3 * i + 1]!, p.coords[3 * i + 2]!], recip), 3 * i);
    return out;
  }, [showMesh, mesh, recip]);

  const onController = useCallback((c: SceneController | null) => setScene(isBz(c) ? c : null), []);
  useEffect(() => {
    if (!scene || !zone || !recip || !picture) return;
    scene.setZone(zone, recip);
    scene.setPoints(picture.points);
    scene.setPath(picture.segments);
  }, [scene, zone, recip, picture]);
  useEffect(() => scene?.setAxes(axes), [scene, axes]);
  useEffect(() => scene?.setMesh(meshCart), [scene, meshCart]);
  const markerIndex = pts.length ? Math.min(pts.length - 1, Math.round(progress * (pts.length - 1))) : 0;
  const marker = pts[markerIndex];
  useEffect(() => scene?.setMarker(marker ? marker.cart : null), [scene, marker]);

  // animation: only when the user presses Play and motion is allowed
  useEffect(() => {
    if (!playing || reduced || pts.length < 2) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let done = false;
      setProgress((p) => {
        const n = p + dt / 8;
        if (n >= 1) {
          done = true;
          return 1;
        }
        return n;
      });
      if (done) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reduced, pts.length]);

  const files = useMemo(() => {
    if (!table || !sym) return null;
    return {
      kpoints: { name: 'KPOINTS', text: writeKpoints(table, header), type: 'application/octet-stream' },
      kpath: { name: 'KPATH.in', text: writeKpathIn(table, header), type: 'application/octet-stream' },
      opt: { name: 'KPOINTS_OPT', text: writeKpointsOpt(table, header), type: 'application/octet-stream' },
      csv: { name: 'kpath_points.csv', text: writePathCsv(table), type: 'text/csv' },
      json: { name: 'kpath_points.json', text: writePathJson(table, header), type: 'application/json' },
      poscar: {
        name: 'POSCAR_primitive',
        text: writePoscar(sym.primStdCell, { comment: `Standardized primitive cell, ${header.spacegroup}` })
          .text,
        type: 'application/octet-stream',
      },
    };
  }, [table, sym, header]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setFileError('This file is larger than 25 MB, which is more than this tool accepts.');
      return;
    }
    setText(await f.text());
    setSource('file');
  };

  const setParam = (k: string, v: string) => setParams((p) => ({ ...p, [k]: v }));
  const pickBravais = (id: BravaisId) => {
    setBravaisId(id);
    const d = bravaisInfo(id).defaults;
    setParams(Object.fromEntries(Object.entries(d).map(([k, v]) => [k, String(v)])));
  };

  const fields = bravaisInfo(bravaisId).fields;
  const flat: FlatPoint[] = zone
    ? [
        { at: [0, 0, 0], label: 'Γ', color: BZ_COLORS.gamma },
        ...(picture?.points ?? []).map((p) => ({ at: p.k, label: p.label, color: BZ_COLORS.points })),
      ]
    : [];

  return (
    <div className="kp">
      <section aria-labelledby="kp-in" className="kp-card">
        <h2 id="kp-in">1. Your cell</h2>
        <fieldset className="kp-fieldset">
          <legend>Where does the cell come from?</legend>
          <label className="kp-radio">
            <input
              type="radio"
              name="kp-source"
              checked={source === 'bravais'}
              onChange={() => setSource('bravais')}
            />
            A Bravais lattice and its parameters
          </label>
          <label className="kp-radio">
            <input
              type="radio"
              name="kp-source"
              checked={source === 'file'}
              onChange={() => setSource('file')}
            />
            A POSCAR or CIF file
          </label>
        </fieldset>

        {source === 'bravais' ? (
          <div>
            <p>
              Pick the lattice type and its lengths and angles. Only the lattice is described, so the symmetry
              used is the lattice symmetry. Use a file when your crystal has lower symmetry than its lattice.
            </p>
            <div className="kp-row">
              <div className="kp-field">
                <label htmlFor="kp-bravais">Bravais lattice</label>
                <select
                  id="kp-bravais"
                  value={bravaisId}
                  onChange={(e) => pickBravais(e.target.value as BravaisId)}
                >
                  {BRAVAIS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>
              {fields.map((k) => (
                <div className="kp-field" key={k}>
                  <label htmlFor={`kp-p-${k}`}>{FIELD_NAMES[k]}</label>
                  <input
                    id={`kp-p-${k}`}
                    type="number"
                    inputMode="decimal"
                    step="any"
                    value={params[k] ?? ''}
                    onChange={(e) => setParam(k, e.target.value)}
                    aria-invalid={bravais.errors[k] ? true : undefined}
                    aria-describedby={bravais.errors[k] ? `kp-e-${k}` : undefined}
                  />
                  {bravais.errors[k] && (
                    <span id={`kp-e-${k}`} role="alert" className="kp-error">
                      {bravais.errors[k]}
                    </span>
                  )}
                </div>
              ))}
            </div>
            {bravais.errors.cell && (
              <p role="alert" className="kp-error">
                {bravais.errors.cell}
              </p>
            )}
          </div>
        ) : (
          <div
            className="kp-drop"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
          >
            {handoffLabel && text.trim() === '' && (
              <p className="kp-note" role="status">
                A structure arrived from {handoffLabel}. Paste or choose a file to replace it.
              </p>
            )}
            <label htmlFor="kp-text">POSCAR or CIF text</label>
            <textarea
              id="kp-text"
              rows={9}
              spellCheck={false}
              value={text}
              onChange={(e) => setText(e.target.value)}
              aria-invalid={fileError ? true : undefined}
              aria-describedby={fileError ? 'kp-file-err' : undefined}
            />
            <label htmlFor="kp-file">
              Or drop or choose a file (read in this page, never uploaded, up to 25 MB)
            </label>
            <input id="kp-file" type="file" onChange={(e) => void onFile(e.target.files?.[0])} />
            {fileError && text.trim() !== '' && (
              <p id="kp-file-err" role="alert" className="kp-error">
                {fileError}
              </p>
            )}
            {fileError && text.trim() === '' && (
              <p role="alert" className="kp-error">
                {fileError}
              </p>
            )}
            {fileNotes.map((n) => (
              <p key={n} className="kp-note">
                {n}
              </p>
            ))}
          </div>
        )}
        {busy && <p role="status">Finding the symmetry of your cell...</p>}
        {engineError && (
          <p role="alert" className="kp-error">
            {engineError}
          </p>
        )}
      </section>

      {std && sym && (
        <section aria-labelledby="kp-std" className="kp-card">
          <h2 id="kp-std">2. What happened to your cell</h2>
          <p aria-live="polite">
            <strong>
              {std.changed ? std.headline : 'Your cell is already the standardized primitive cell.'}
            </strong>
          </p>
          {std.changed && (
            <ul>
              {std.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
          <p>
            Space group {sym.hmSymbol} (number {sym.number}), Pearson symbol {sym.pearson}. The k-path below
            is for the standardized primitive cell, so use that cell as your POSCAR for the band run.
          </p>
        </section>
      )}

      {sym && (
        <section aria-labelledby="kp-conv" className="kp-card">
          <h2 id="kp-conv">3. Path convention</h2>
          <fieldset className="kp-fieldset">
            <legend>Which convention?</legend>
            <label className="kp-radio">
              <input
                type="radio"
                name="kp-conv"
                checked={convention === 'HPKOT'}
                onChange={() => setConvention('HPKOT')}
              />
              HPKOT (default; used by SeeK-path and VASPKIT 303)
            </label>
            <label className="kp-radio">
              <input
                type="radio"
                name="kp-conv"
                checked={convention === 'Setyawan-Curtarolo'}
                onChange={() => setConvention('Setyawan-Curtarolo')}
              />
              Setyawan-Curtarolo (used by pymatgen and the Materials Project)
            </label>
          </fieldset>
          <p>
            The two conventions disagree because they choose different standard cells and different lists of
            high-symmetry lines. Both give a valid band structure, but the points sit in different places in
            the reciprocal cell, so the path must be used with the cell it was made for. To compare with the
            Materials Project, use Setyawan-Curtarolo. The file VASPKIT option 303 writes follows HPKOT as far
            as the author has stated; that has not been checked against a real VASPKIT run yet (open question
            Q-013).
          </p>
          {currentError && (
            <p role="alert" className="kp-error">
              {currentError}
            </p>
          )}
          {current?.warnings.map((w) => (
            <p key={w} className="kp-note">
              {w}
            </p>
          ))}
        </section>
      )}

      {table && picture && (
        <section aria-labelledby="kp-table" className="kp-card">
          <h2 id="kp-table">4. Path table</h2>
          <fieldset className="kp-fieldset">
            <legend>How many points?</legend>
            <label className="kp-radio">
              <input
                type="radio"
                name="kp-mode"
                checked={mode === 'count'}
                onChange={() => setMode('count')}
              />
              The same number of points on every segment
            </label>
            <label className="kp-radio">
              <input
                type="radio"
                name="kp-mode"
                checked={mode === 'density'}
                onChange={() => setMode('density')}
              />
              A density in points per 1/Å (longer segments get more points)
            </label>
          </fieldset>
          {mode === 'count' ? (
            <Slider label="Points per segment" min={MIN_POINTS} max={200} value={count} onChange={setCount} />
          ) : (
            <Slider label="Points per 1/Å" min={5} max={200} value={density} onChange={setDensity} />
          )}
          <div className="kp-tablewrap">
            <table className="kp-table">
              <caption>
                Segments of the {picture.name} path. Lengths are in 1/Å and include the factor 2π.
              </caption>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">From</th>
                  <th scope="col">To</th>
                  <th scope="col">Length (1/Å)</th>
                  <th scope="col">Points</th>
                  <th scope="col">Spacing (1/Å)</th>
                </tr>
              </thead>
              <tbody>
                {table.segments.map((s) => (
                  <tr key={s.index}>
                    <td>{s.index + 1}</td>
                    <td>{pointLabelDisplay(convention, s.from)}</td>
                    <td>
                      {pointLabelDisplay(convention, s.to)}
                      {!table.segments[s.index + 1]?.continuous && s.index + 1 < table.segments.length && (
                        <span className="kp-jump"> (jump after)</span>
                      )}
                    </td>
                    <td>{s.length.toFixed(4)}</td>
                    <td>
                      <input
                        type="number"
                        min={MIN_POINTS}
                        max={MAX_POINTS}
                        aria-label={`Points on segment ${s.index + 1}, ${pointLabelDisplay(convention, s.from)} to ${pointLabelDisplay(convention, s.to)}`}
                        value={s.points}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setOverrides((o) => {
                            const n = { ...o };
                            if (!Number.isFinite(v) || e.target.value === '') delete n[s.index];
                            else n[s.index] = v;
                            return n;
                          });
                        }}
                      />
                      {s.overridden && <span className="kp-jump"> (set by hand)</span>}
                    </td>
                    <td>{s.spacing.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" colSpan={3}>
                    Total
                  </th>
                  <td>{table.totalLength.toFixed(4)}</td>
                  <td>{table.totalPoints}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          {table.countsDiffer && (
            <p className="kp-note" role="note">
              VASP line mode takes one number of points for the whole file, so the KPOINTS files use the
              largest count ({table.lineModeCount} per segment). The table, the animation and the CSV and JSON
              lists use the counts shown above.
            </p>
          )}
          {Object.keys(overrides).length > 0 && (
            <button type="button" onClick={() => setOverrides({})}>
              Clear hand-set counts
            </button>
          )}
        </section>
      )}

      {zone && (
        <section aria-labelledby="kp-3d" className="kp-card">
          <h2 id="kp-3d">5. The path in the Brillouin zone</h2>
          <p className="kp-note">
            Illustrative: the marker only shows the order of the points; it does not show an electron moving.
          </p>
          <div className="kp-row">
            <Toggle label="Show the x, y, z axes" checked={axes} onChange={setAxes} />
            <Toggle label="Show a Gamma-centred k-mesh" checked={showMesh} onChange={setShowMesh} />
          </div>
          {showMesh && <Slider label="Mesh divisions" min={1} max={12} value={mesh} onChange={setMesh} />}
          <Slider
            label="Position along the path"
            min={0}
            max={1000}
            value={Math.round(progress * 1000)}
            onChange={(v) => {
              setPlaying(false);
              setProgress(v / 1000);
            }}
          />
          <div className="kp-row">
            {reduced ? (
              <p className="kp-note">
                Your system asks for reduced motion, so there is no automatic animation. Use the slider to
                move the marker.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (progress >= 1) setProgress(0);
                  setPlaying((p) => !p);
                }}
                aria-pressed={playing}
              >
                {playing ? 'Pause' : 'Play'} the marker along the path
              </button>
            )}
          </div>
          <p aria-live="polite" className="kp-readout">
            {marker
              ? `Marker at point ${markerIndex + 1} of ${pts.length}, segment ${marker.segment + 1}, ${marker.distance.toFixed(3)} 1/Å along the path.`
              : ''}
          </p>
          <Lazy3D
            load={load}
            onController={onController}
            posterText="This view uses WebGL. It loads only when you ask for it. A flat view works without it."
            fallback={
              <SolidFallback
                solid={zone}
                points={flat}
                segments={picture?.segments ?? []}
                label="Flat view of the first Brillouin zone and the path"
              />
            }
          />
          {!scene && (
            <SolidFallback
              solid={zone}
              points={flat}
              segments={picture?.segments ?? []}
              label="Flat view of the first Brillouin zone and the path"
            />
          )}
        </section>
      )}

      {files && table && (
        <section aria-labelledby="kp-out" className="kp-card">
          <h2 id="kp-out">6. Files</h2>
          <div className="kp-row">
            {(Object.entries(files) as [keyof typeof files, (typeof files)[keyof typeof files]][]).map(
              ([k, f]) => (
                <button key={k} type="button" onClick={() => downloadBlob(f.name, f.text, f.type)}>
                  Download {f.name}
                </button>
              ),
            )}
          </div>
          <div className="kp-field">
            <label htmlFor="kp-prev">Preview</label>
            <select
              id="kp-prev"
              value={preview}
              onChange={(e) => setPreview(e.target.value as typeof preview)}
            >
              {(Object.entries(files) as [keyof typeof files, (typeof files)[keyof typeof files]][]).map(
                ([k, f]) => (
                  <option key={k} value={k}>
                    {f.name}
                  </option>
                ),
              )}
            </select>
          </div>
          <pre className="kp-pre" tabIndex={0} aria-label={`Preview of ${files[preview].name}`}>
            {files[preview].text.split('\n').slice(0, 60).join('\n')}
          </pre>
          <h3>Which file for which run</h3>
          <p>{ROUTE_NOTES.cell}</p>
          <p>{ROUTE_NOTES.routeA}</p>
          <p>{ROUTE_NOTES.routeB}</p>
          <p className="kp-note">
            KPATH.in here holds the same points as KPOINTS, written in the layout the VASPKIT documentation
            shows (labels without the ! mark), so VASPKIT can read the labels back for its band plots.
          </p>
          <p>
            Next, plotting the bands you get from this run is covered in the band-structure chapter (planned,
            not written yet).
          </p>
        </section>
      )}
    </div>
  );
}
