import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Scene from '../../scene/Scene';
import Badge from '../../ui/Badge';
import { readStructure } from '../../../lib/crystal/io';
import { diagonalSupercell } from '../../../lib/crystal/supercell';
import { SymmetryClient } from '../../../lib/crystal/symmetry-client';
import type { Structure } from '../../../lib/crystal/types';
import { sendHandoff, takeHandoff } from '../../../lib/handoff';
import {
  buildFiles,
  buildOutputs,
  checkLdau,
  type ConfigOutput,
  type LdauSpec,
  whyThisCell,
} from '../../../lib/magnetism/export';
import { STARTING_MOMENT_GUIDANCE } from '../../../lib/magnetism/magmom';
import {
  bondStatistics,
  configurationFromClass,
  customOrdering,
  enumerateCollinear,
  isTrulyAntiferro,
  NAMED_LABEL,
  type MagneticConfiguration,
  type NamedKind,
} from '../../../lib/magnetism/orderings';
import { MagneticError, selectMagneticSites } from '../../../lib/magnetism/sublattice';
import {
  totalBytes,
  treeLines,
  zipProjectAsync,
  zipProject,
  ZIP_WORKER_THRESHOLD,
} from '../../../lib/vasp/series';
import { copyText, downloadBlob } from '../input-builder/hooks';
import {
  BATCH_DEFAULT,
  EXAMPLE_POSCAR,
  NAMED,
  buildNamed,
  sceneFor,
  suggestedElements,
  type Axis,
} from './magneticModel';
import './magnetic.css';

const AnalysePanel = lazy(() => import('./AnalysePanel'));

const MAX_BYTES = 25 * 1024 * 1024;
type BuildTab = NamedKind | 'custom' | 'enumerate';
type Tab = BuildTab | 'analyse';
const TABS: { id: Tab; label: string }[] = [
  { id: 'FM', label: 'FM' },
  { id: 'A', label: 'A-type' },
  { id: 'C', label: 'C-type' },
  { id: 'G', label: 'G-type' },
  { id: 'RS2', label: 'Rock-salt II' },
  { id: 'custom', label: 'Custom' },
  { id: 'enumerate', label: 'Enumerate' },
  { id: 'analyse', label: 'Analyse' },
];
const num = (t: string | undefined): number => (t === undefined || t.trim() === '' ? NaN : Number(t));

/** The magnetic configuration tool (M13.2): cell in, collinear orderings and VASP files out. All in this page. */
export default function MagneticTool() {
  const [text, setText] = useState('');
  const [structure, setStructure] = useState<Structure | null>(null);
  const [fileError, setFileError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isExample, setIsExample] = useState(false);
  const [elements, setElements] = useState<string[]>([]);
  const [mags, setMags] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<Tab>('G');
  // The Analyse tab works on the set from the last build tab (named batch, custom or enumerated).
  const [lastBuild, setLastBuild] = useState<BuildTab>('G');
  useEffect(() => {
    if (tab !== 'analyse') setLastBuild(tab);
  }, [tab]);
  const bt: BuildTab = tab === 'analyse' ? lastBuild : tab;
  const [axis, setAxis] = useState<Axis>('auto');
  const [common, setCommon] = useState(true);
  const [batch, setBatch] = useState<NamedKind[]>([...BATCH_DEFAULT]);
  const [poly, setPoly] = useState(false);
  const [cells, setCells] = useState(false);
  const [ldauOn, setLdauOn] = useState(false);
  const [ldau, setLdau] = useState<Record<string, { l: string; u: string; j: string }>>({});
  const [split, setSplit] = useState(false);
  const [signs, setSigns] = useState<number[]>([]);
  const [siteMags, setSiteMags] = useState<string[]>([]);
  const [sel, setSel] = useState(0);
  const [dims, setDims] = useState<[number, number, number]>([1, 1, 1]);
  const [classes, setClasses] = useState<MagneticConfiguration[] | null>(null);
  const [enumMsg, setEnumMsg] = useState('');
  const [enumBusy, setEnumBusy] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const [status, setStatus] = useState('');
  const client = useRef<SymmetryClient | null>(null);
  useEffect(() => () => client.current?.dispose(), []);

  // hand-off from the Material Builder or another tool
  useEffect(() => {
    const h = takeHandoff(['structure']);
    if (h && h.kind === 'structure') {
      setStructure(h.structure);
      setStatus(`Loaded a structure from the ${h.from} tool.`);
    }
  }, []);

  // read pasted or loaded text
  useEffect(() => {
    if (text.trim() === '') return;
    try {
      const r = readStructure('pasted.txt', text);
      setStructure(r.structure);
      setWarnings(r.warnings);
      setFileError('');
    } catch (e) {
      setStructure(null);
      setWarnings([]);
      setFileError(e instanceof Error ? e.message : String(e));
    }
  }, [text]);

  // reset things that depend on the cell
  useEffect(() => {
    if (!structure) return;
    const sug = suggestedElements(structure);
    setElements(sug.length ? sug : []);
    setSigns(structure.species.map(() => 0));
    setSiteMags(structure.species.map(() => ''));
    setSel(0);
    setClasses(null);
    setChosen([]);
    setEnumMsg('');
  }, [structure]);

  const allElements = useMemo(() => (structure ? [...new Set(structure.species)] : []), [structure]);
  const magnitudes = useMemo(() => {
    const out: Record<string, number> = {};
    for (const el of elements) {
      const v = num(mags[el]);
      if (v > 0) out[el] = v;
    }
    return out;
  }, [elements, mags]);
  const missing = elements.filter((e) => !((magnitudes[e] ?? 0) > 0));

  const named = bt !== 'custom' && bt !== 'enumerate';
  const built = useMemo(
    () =>
      structure && elements.length
        ? buildNamed(structure, batch, named ? (bt as NamedKind) : null, axis, elements, common)
        : { batch: [], det: 1 },
    [structure, elements, batch, bt, named, axis, common],
  );

  const customConfig = useMemo<MagneticConfiguration | null>(() => {
    if (!structure || signs.length !== structure.species.length) return null;
    try {
      const m = siteMags.map((t) => (t.trim() === '' ? NaN : Number(t)));
      const withMag = structure.species.map((el, j) => (m[j]! > 0 ? m[j]! : (magnitudes[el] ?? NaN)));
      const ok = signs.every((s, j) => s === 0 || withMag[j]! > 0);
      return customOrdering(
        structure,
        signs,
        ok ? withMag.map((x, j) => (signs[j] === 0 ? 0 : x)) : undefined,
      );
    } catch {
      return null;
    }
  }, [structure, signs, siteMags, magnitudes]);

  const active: MagneticConfiguration | null =
    bt === 'custom'
      ? customConfig
      : bt === 'enumerate'
        ? (classes?.find((_, i) => chosen[0] === i) ?? classes?.[0] ?? null)
        : (built.current ?? null);

  const exportSet: MagneticConfiguration[] =
    bt === 'custom'
      ? customConfig && customConfig.magneticSites.length
        ? [customConfig]
        : []
      : bt === 'enumerate'
        ? (classes ?? []).filter((_, i) => chosen.includes(i))
        : built.batch;

  const ldauSpec = useMemo<LdauSpec | undefined>(() => {
    if (!ldauOn) return undefined;
    const out: Record<string, { l: number; u: number; j: number }> = {};
    for (const el of elements) {
      const v = ldau[el];
      if (v) out[el] = { l: num(v.l), u: num(v.u), j: num(v.j) };
    }
    return out;
  }, [ldauOn, ldau, elements]);
  const ldauProblems = ldauSpec ? checkLdau(ldauSpec) : [];
  const ldauMissing = ldauOn && elements.some((e) => !ldau[e] || ldau[e]!.u === '' || ldau[e]!.l === '');

  const outputs = useMemo<{ list: ConfigOutput[]; error: string }>(() => {
    if (!exportSet.length) return { list: [], error: '' };
    const needs = exportSet.some((c) => !c.magnitudes) && missing.length > 0;
    if (needs) return { list: [], error: `Enter a starting moment for ${missing.join(', ')} to get MAGMOM.` };
    if (ldauMissing || ldauProblems.length)
      return { list: [], error: ldauProblems[0] ?? 'Fill in the DFT+U values or switch DFT+U off.' };
    try {
      return {
        list: buildOutputs(exportSet, {
          magnitudes,
          splitSpecies: split,
          ...(ldauSpec ? { ldau: ldauSpec } : {}),
        }),
        error: '',
      };
    } catch (e) {
      return { list: [], error: e instanceof MagneticError || e instanceof Error ? e.message : String(e) };
    }
  }, [exportSet, magnitudes, missing, split, ldauSpec, ldauMissing, ldauProblems]);

  const activeOut = outputs.list.find((o) => o.config === active) ?? outputs.list[0];
  const files = useMemo(
    () =>
      outputs.list.length
        ? buildFiles(outputs.list, { magnitudes, separateCells: !common && bt !== 'custom' })
        : [],
    [outputs.list, magnitudes, common, bt],
  );

  const spec = useMemo(
    () =>
      active
        ? sceneFor(active, magnitudes, {
            polyhedra: poly,
            repeat: cells,
            ...(tab === 'custom' ? { selected: sel } : {}),
          })
        : null,
    [active, magnitudes, poly, cells, tab, sel],
  );

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setFileError('This file is larger than 25 MB, which is more than this tool accepts.');
      return;
    }
    setIsExample(false);
    setText(await f.text());
  };

  const download = async (name: string, list: ConfigOutput[]) => {
    const sub = buildFiles(list, { magnitudes, separateCells: !common && bt !== 'custom' });
    try {
      const zipped = totalBytes(sub) > ZIP_WORKER_THRESHOLD ? await zipProjectAsync(sub) : zipProject(sub);
      downloadBlob(name, zipped as BlobPart, 'application/zip');
      setStatus(`Downloaded ${name}.`);
    } catch {
      setStatus('The zip could not be made in this browser.');
    }
  };

  const runEnumerate = async () => {
    if (!structure) return;
    setEnumBusy(true);
    setEnumMsg('');
    setClasses(null);
    try {
      const cell = dims.some((d) => d > 1) ? diagonalSupercell(structure, ...dims) : structure;
      const sites = selectMagneticSites(cell, elements);
      client.current ??= new SymmetryClient();
      const sym = await client.current.analyze(cell, { symprec: 1e-4, setting: 'Spglib' });
      const cls = enumerateCollinear(cell, sites, sym.operations);
      const cfgs = cls.map((c, i) => configurationFromClass(cell, sites, c, i));
      setClasses(cfgs);
      setChosen(cfgs.map((_, i) => i));
      setEnumMsg(
        `${cls.length} distinct arrangement${cls.length === 1 ? '' : 's'} of ${sites.length} magnetic sites in ${cell.species.length} atoms, grouped by the symmetry of your cell.`,
      );
    } catch (e) {
      setEnumMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setEnumBusy(false);
    }
  };

  const onTabKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = TABS[(i + d + TABS.length) % TABS.length]!;
    setTab(next.id);
    document.getElementById(`mg-tab-${next.id}`)?.focus();
  };

  const onSiteKey = (e: React.KeyboardEvent, j: number) => {
    if (!structure) return;
    const set = (v: number) => {
      e.preventDefault();
      setSigns((s) => s.map((x, k) => (k === j ? v : x)));
    };
    const k = e.key.toLowerCase();
    if (k === 'u') set(1);
    else if (k === 'd') set(-1);
    else if (k === '0') set(0);
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = structure.species.length;
      const to = (j + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      setSel(to);
      document.getElementById(`mg-site-${to}`)?.focus();
    }
  };

  const { nn, af } = useMemo(() => {
    if (!active || active.magneticSites.length === 0) return { nn: undefined, af: null as boolean | null };
    try {
      const st = bondStatistics(active);
      return {
        nn: st.sites[0]?.shells[0],
        af: Object.keys(magnitudes).length ? isTrulyAntiferro(active, magnitudes) : null,
      };
    } catch {
      return { nn: undefined, af: null as boolean | null };
    }
  }, [active, magnitudes]);
  const cur = active ?? null;
  const upN = cur ? cur.signs.filter((x) => x > 0).length : 0;
  const downN = cur ? cur.signs.filter((x) => x < 0).length : 0;
  const net = activeOut?.net;

  return (
    <div className="mg">
      <section aria-labelledby="mg-in" className="mg-card mg-left">
        <h2 id="mg-in">1. Your cell</h2>
        <div className="mg-drop">
          <label htmlFor="mg-text">Paste a POSCAR or CIF, or choose a file</label>
          <textarea
            id="mg-text"
            rows={6}
            spellCheck={false}
            value={text}
            onChange={(e) => {
              setIsExample(false);
              setText(e.target.value);
            }}
          />
          <div className="mg-row">
            <label className="mg-file">
              <span>Choose a file</span>
              <input type="file" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            <button
              type="button"
              onClick={() => {
                setIsExample(true);
                setText(EXAMPLE_POSCAR);
              }}
            >
              Try an example cell
            </button>
          </div>
          <p className="mg-note">Files are read in this page and never uploaded.</p>
        </div>
        {isExample && (
          <p className="mg-banner" role="note">
            <Badge variant="illustrative" /> Example cell with illustrative geometry. It is not a result for a
            real material.
          </p>
        )}
        {fileError && (
          <p className="mg-error" role="alert">
            {fileError}
          </p>
        )}
        {warnings.map((w) => (
          <p key={w} className="mg-note">
            {w}
          </p>
        ))}
        {structure && (
          <>
            <h2 id="mg-opt">2. Magnetic sites and moments</h2>
            <fieldset className="mg-fieldset">
              <legend>Which elements carry a moment?</legend>
              {allElements.map((el) => (
                <label key={el} className="mg-check">
                  <input
                    type="checkbox"
                    checked={elements.includes(el)}
                    onChange={(e) =>
                      setElements((cur) => (e.target.checked ? [...cur, el] : cur.filter((x) => x !== el)))
                    }
                  />
                  {el}
                </label>
              ))}
            </fieldset>
            {elements.length === 0 && (
              <p className="mg-note">
                No transition-metal element was found. Tick the element you want to order.
              </p>
            )}
            {elements.map((el) => (
              <div key={el} className="mg-field">
                <label htmlFor={`mg-mag-${el}`}>Starting moment for {el} (μB)</label>
                <input
                  id={`mg-mag-${el}`}
                  inputMode="decimal"
                  value={mags[el] ?? ''}
                  onChange={(e) => setMags((m) => ({ ...m, [el]: e.target.value }))}
                  aria-invalid={mags[el] !== undefined && mags[el] !== '' && !(num(mags[el]) > 0)}
                />
              </div>
            ))}
            <details className="mg-details">
              <summary>How large should the starting moment be?</summary>
              <ul>
                {STARTING_MOMENT_GUIDANCE.map((g) => (
                  <li key={g.source}>
                    {g.text} <span className="mg-src">({g.source})</span>
                  </li>
                ))}
              </ul>
              <p>
                The tool does not fill a number in for you. Type the value you want. The starting moments only
                seed the calculation: check the final moments in OUTCAR.
              </p>
            </details>
            <h2 id="mg-cell">3. Cell policy</h2>
            <label className="mg-check">
              <input type="checkbox" checked={!common} onChange={(e) => setCommon(!e.target.checked)} />
              Smallest cell per ordering
            </label>
            <p className="mg-note">
              {common
                ? 'One cell for all orderings (default): every file has the same lattice and atom order, so energies are comparable.'
                : 'Each ordering uses its own smallest cell. The k-meshes then need separate convergence.'}
            </p>
            <label className="mg-check">
              <input type="checkbox" checked={split} onChange={(e) => setSplit(e.target.checked)} />
              Write up and down sites as separate species (Mn1, Mn2)
            </label>
            <fieldset className="mg-fieldset">
              <legend>DFT+U (optional)</legend>
              <label className="mg-check">
                <input type="checkbox" checked={ldauOn} onChange={(e) => setLdauOn(e.target.checked)} />
                Add a DFT+U block
              </label>
              {ldauOn &&
                elements.map((el) => (
                  <div key={el} className="mg-row">
                    {(['l', 'u', 'j'] as const).map((k) => (
                      <div key={k} className="mg-field">
                        <label htmlFor={`mg-ldau-${el}-${k}`}>
                          {el} {k === 'l' ? 'channel (2 = d, 3 = f)' : `${k.toUpperCase()} (eV)`}
                        </label>
                        <input
                          id={`mg-ldau-${el}-${k}`}
                          inputMode="decimal"
                          value={ldau[el]?.[k] ?? ''}
                          onChange={(e) =>
                            setLdau((d) => ({
                              ...d,
                              [el]: { l: '', u: '', j: '', ...d[el], [k]: e.target.value },
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                ))}
              {ldauOn && <p className="mg-note">Type your own values. None is suggested here.</p>}
            </fieldset>
          </>
        )}
      </section>

      <section aria-labelledby="mg-view" className="mg-card mg-centre">
        <h2 id="mg-view">Ordering</h2>
        <div role="tablist" aria-label="Ordering" className="mg-tabs">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              id={`mg-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              tabIndex={tab === t.id ? 0 : -1}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-labelledby={`mg-tab-${tab}`} className="mg-panel">
          {!structure && <p>Give a cell on the left to see the ordering.</p>}
          {structure && named && tab !== 'analyse' && (
            <>
              <p className="mg-note">
                {NAMED_LABEL[tab as NamedKind]}. <a href="/handbook/">Why orderings differ (handbook)</a>.
              </p>
              <label className="mg-check">
                <input
                  type="checkbox"
                  checked={batch.includes(tab as NamedKind)}
                  onChange={(e) =>
                    setBatch((b) =>
                      e.target.checked
                        ? NAMED.filter((k) => k === tab || b.includes(k))
                        : b.filter((k) => k !== tab),
                    )
                  }
                />
                Include {TABS.find((t) => t.id === tab)!.label} in "Download all"
              </label>
              {(tab === 'A' || tab === 'C') && (
                <div className="mg-field">
                  <label htmlFor="mg-axis">{tab === 'A' ? 'Stacking axis' : 'Chain axis'}</label>
                  <select
                    id="mg-axis"
                    value={String(axis)}
                    onChange={(e) =>
                      setAxis(e.target.value === 'auto' ? 'auto' : (Number(e.target.value) as Axis))
                    }
                  >
                    <option value="auto">Automatic (the unique or longest direction)</option>
                    <option value="0">First grid axis</option>
                    <option value="1">Second grid axis</option>
                    <option value="2">Third grid axis</option>
                  </select>
                  {active?.axis && <p className="mg-note">{active.axis.reason}</p>}
                </div>
              )}
              {built.error && (
                <p className="mg-error" role="alert">
                  {built.error}
                </p>
              )}
            </>
          )}
          {structure && tab === 'custom' && (
            <>
              <p className="mg-note">
                Select a site, then press <kbd>U</kbd> for up, <kbd>D</kbd> for down or <kbd>0</kbd> for no
                moment. Arrow keys move between sites.
              </p>
              <table className="mg-table">
                <caption>Sites of your cell</caption>
                <thead>
                  <tr>
                    <th scope="col">Site</th>
                    <th scope="col">Element</th>
                    <th scope="col">Spin</th>
                    <th scope="col">Moment (μB)</th>
                  </tr>
                </thead>
                <tbody>
                  {structure.species.map((el, j) => (
                    <tr key={j} className={sel === j ? 'is-sel' : undefined}>
                      <th scope="row">
                        <button
                          id={`mg-site-${j}`}
                          type="button"
                          className="mg-site"
                          aria-pressed={sel === j}
                          aria-label={`Site ${j + 1}, ${el}, spin ${signs[j] === 1 ? 'up' : signs[j] === -1 ? 'down' : 'none'}`}
                          onClick={() => setSel(j)}
                          onFocus={() => setSel(j)}
                          onKeyDown={(e) => onSiteKey(e, j)}
                        >
                          {j + 1}
                        </button>
                      </th>
                      <td>{el}</td>
                      <td>
                        <select
                          aria-label={`Spin of site ${j + 1}`}
                          value={String(signs[j] ?? 0)}
                          onChange={(e) =>
                            setSigns((s) => s.map((x, k) => (k === j ? Number(e.target.value) : x)))
                          }
                        >
                          <option value="1">Up (+)</option>
                          <option value="-1">Down (−)</option>
                          <option value="0">None (0)</option>
                        </select>
                      </td>
                      <td>
                        <input
                          aria-label={`Moment of site ${j + 1} in μB (blank uses the element value)`}
                          inputMode="decimal"
                          value={siteMags[j] ?? ''}
                          onChange={(e) =>
                            setSiteMags((m) => m.map((x, k) => (k === j ? e.target.value : x)))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {structure && tab === 'enumerate' && (
            <>
              <p className="mg-note">
                List every distinct up and down arrangement of the magnetic sites, grouped by your cell's
                symmetry. This finds candidates; it does not say which one is lowest in energy.
              </p>
              <div className="mg-row">
                {([0, 1, 2] as const).map((i) => (
                  <div key={i} className="mg-field">
                    <label htmlFor={`mg-dim-${i}`}>Repeat along {'abc'[i]}</label>
                    <select
                      id={`mg-dim-${i}`}
                      value={dims[i]}
                      onChange={(e) =>
                        setDims(
                          (d) =>
                            d.map((x, k) => (k === i ? Number(e.target.value) : x)) as [
                              number,
                              number,
                              number,
                            ],
                        )
                      }
                    >
                      {[1, 2, 3].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => void runEnumerate()}
                  disabled={enumBusy || !elements.length}
                >
                  {enumBusy ? 'Working...' : 'Enumerate'}
                </button>
              </div>
              <p role="status">{enumMsg}</p>
              {classes && (
                <ul className="mg-classes">
                  {classes.map((c, i) => (
                    <li key={i}>
                      <label className="mg-check">
                        <input
                          type="checkbox"
                          checked={chosen.includes(i)}
                          onChange={(e) =>
                            setChosen((x) =>
                              e.target.checked ? [...x, i].sort((a, b) => a - b) : x.filter((y) => y !== i),
                            )
                          }
                        />
                        {c.label}: {c.signs.filter((s) => s > 0).length} up,{' '}
                        {c.signs.filter((s) => s < 0).length} down. {c.notes[0]}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
          {structure && tab === 'analyse' && (
            <>
              <p className="mg-note">
                Analysing the {outputs.list.length} configuration(s) from the{' '}
                {TABS.find((x) => x.id === lastBuild)!.label} tab
                {named ? ' ("Download all" set)' : ''}. Their MAGMOM is the intended pattern.
              </p>
              {outputs.list.length === 0 ? (
                <p className="mg-note">{outputs.error || 'Build some configurations first.'}</p>
              ) : (
                <Suspense fallback={<p>Loading the analysis...</p>}>
                  <AnalysePanel outputs={outputs.list} />
                </Suspense>
              )}
            </>
          )}
          {spec && tab !== 'analyse' && (
            <>
              <div className="mg-toggles">
                <label className="mg-check">
                  <input type="checkbox" checked={poly} onChange={(e) => setPoly(e.target.checked)} />
                  Show coordination polyhedra
                </label>
                <label className="mg-check">
                  <input type="checkbox" checked={cells} onChange={(e) => setCells(e.target.checked)} />
                  Show neighbouring cells (2×2×2)
                </label>
              </div>
              <Scene key={`${tab}-${active?.structure.species.length}`} spec={spec} />
              {poly && <p className="mg-note">Polyhedra use a distance cutoff of 2.6 Å (Heuristic).</p>}
              {active && structure && (
                <p className="mg-note">
                  <strong>Why this cell:</strong> {whyThisCell(active, built.det, common, batch.length)}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <section aria-labelledby="mg-out" className="mg-card mg-right">
        <h2 id="mg-out">Output</h2>
        {!active && <p>Nothing to show yet.</p>}
        {active && (
          <div className="mg-transcript" role="region" aria-label="What was computed" tabIndex={0}>
            <p>
              <Badge variant="computed" /> {active.label}
            </p>
            <p>
              Cell: {active.structure.species.length} atoms (
              {active.matrix.map((r) => r.join(' ')).join(' / ')}).
            </p>
            <p>
              Magnetic sites: {active.magneticSites.length} ({upN} up, {downN} down).
            </p>
            {nn && (
              <p>
                Nearest neighbours of the first magnetic site: {nn.parallel} parallel, {nn.antiparallel}{' '}
                antiparallel.
              </p>
            )}
            {net !== undefined && <p>Net moment per cell: {net.toFixed(2)} μB.</p>}
            {af !== null && (
              <p>
                {af
                  ? 'This is a true antiferromagnet in this cell.'
                  : 'This is not a compensated antiferromagnet.'}
              </p>
            )}
            {active.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        )}
        {outputs.error && (
          <p className="mg-note" role="status">
            {outputs.error}
          </p>
        )}
        {activeOut && (
          <>
            <h3>MAGMOM</h3>
            <pre className="mg-pre" data-testid="magmom">
              {activeOut.result.magmom}
            </pre>
            {activeOut.issues.length === 0 ? (
              <p className="mg-note">The checks for MAGMOM and ISPIN found no problems.</p>
            ) : (
              <ul className="mg-issues">
                {activeOut.issues.map((i) => (
                  <li key={i.rule}>
                    {i.rule} {i.severity}: {i.title}
                  </li>
                ))}
              </ul>
            )}
            <h3>INCAR lines</h3>
            <pre className="mg-pre">{activeOut.incarText}</pre>
            <div className="mg-row">
              <button type="button" onClick={() => downloadBlob('POSCAR', activeOut.result.poscar)}>
                Download POSCAR
              </button>
              <button type="button" onClick={() => downloadBlob('INCAR', activeOut.incarText)}>
                Download INCAR
              </button>
              <button
                type="button"
                onClick={async () =>
                  setStatus((await copyText(activeOut.incarText)) ? 'INCAR copied.' : 'Copy failed.')
                }
              >
                Copy INCAR
              </button>
            </div>
            <h3>All {outputs.list.length} in one zip</h3>
            <pre className="mg-pre" aria-label="Zip contents">
              {treeLines(files).join('\n')}
            </pre>
            <div className="mg-row">
              <button
                type="button"
                onClick={() => void download('magnetic-configurations.zip', outputs.list)}
              >
                Download all
              </button>
              {structure && (
                <button
                  type="button"
                  onClick={() =>
                    sendHandoff(
                      {
                        v: 1,
                        kind: 'structure',
                        from: 'magnetic',
                        structure: activeOut.result.structure,
                        label: activeOut.config.label,
                        magmom: activeOut.result.magmom,
                      },
                      '/tools/input-builder/',
                    )
                  }
                >
                  Open in the input builder (with MAGMOM)
                </button>
              )}
              {structure && (
                <button
                  type="button"
                  onClick={() =>
                    sendHandoff(
                      {
                        v: 1,
                        kind: 'structure',
                        from: 'magnetic',
                        structure: activeOut.result.structure,
                        label: activeOut.config.label,
                      },
                      '/tools/kpath/',
                    )
                  }
                >
                  Open in the k-path tool
                </button>
              )}
              {structure && (
                <button
                  type="button"
                  onClick={() =>
                    sendHandoff(
                      {
                        v: 1,
                        kind: 'structure',
                        from: 'magnetic',
                        structure: activeOut.result.structure,
                        label: activeOut.config.label,
                        magmom: activeOut.result.magmom,
                      },
                      '/dft-studio/',
                    )
                  }
                >
                  Open in DFT Studio (3D spins)
                </button>
              )}
            </div>
          </>
        )}
        <ul className="mg-caveats">
          <li>The starting moments only seed the calculation. Check the final moments in OUTCAR.</li>
          <li>VASP may find a different ground state than the pattern you started from.</li>
          <li>POTCAR files are never generated or included.</li>
        </ul>
        <p role="status" className="mg-note">
          {status}
        </p>
      </section>
    </div>
  );
}
