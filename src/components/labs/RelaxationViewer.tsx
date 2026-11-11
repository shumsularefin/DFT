import { useCallback, useEffect, useMemo, useState } from 'react';
import LabShell from './LabShell';
import Lazy3D, { type SceneModule } from './Lazy3D';
import SolidFallback, { type FlatPoint } from './SolidFallback';
import DropFile, { ParseStatus } from './DropFile';
import { readFileText, useParser } from './useParser';
import Slider from '../ui/Slider';
import type { SceneController } from '../../lib/three/SceneController';
import type { CellScene } from '../../lib/three/CellScene';
import { speciesColors } from '../../lib/three/palette';
import { parallelepiped } from '../../lib/three/solid';
import { writePoscar } from '../../lib/crystal/poscar';
import type { Structure, Vec3 } from '../../lib/crystal/types';
import { detectKind, readOutput } from '../../lib/vasp/outputReader';
import type { RelaxStep } from '../../lib/vasp/relaxSteps';
import type { XdatcarResult } from '../../lib/vasp/xdatcar';
import { fmt, niceTicks } from '../../lib/vasp/ticks';
import './AnalysisViewers.css';

const load = (): Promise<SceneModule> => import('../../lib/three/CellScene');
const isCell = (c: SceneController | null): c is CellScene =>
  !!c && typeof (c as CellScene).setStructure === 'function';
const outline = () =>
  typeof document === 'undefined' ? '#222222' : getComputedStyle(document.body).color || '#222222';
const EDIFFG_DEFAULT = -0.02;

function frameStructure(x: XdatcarResult, i: number): Structure {
  return { lattice: x.lattices[i]!, species: x.species, frac: x.frames[i]! };
}

/** Lab "relaxation-viewer": walk through the steps of a relaxation (XDATCAR) next to energy and force per step. */
export default function RelaxationViewer({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const parser = useParser();
  const [xdat, setXdat] = useState<XdatcarResult | null>(null);
  const [xName, setXName] = useState('');
  const [steps, setSteps] = useState<RelaxStep[]>([]);
  const [sName, setSName] = useState('');
  const [msg, setMsg] = useState('');
  const [frame, setFrame] = useState(1);
  const [ediffg, setEdiffg] = useState(String(EDIFFG_DEFAULT));
  const [scene, setScene] = useState<CellScene | null>(null);

  const onX = async (f: File) => {
    setMsg('');
    const r = await readFileText(f);
    if ('error' in r) return setMsg(r.error);
    const res = await parser.run({ kind: 'xdatcar', text: r.text });
    if (res) {
      setXdat(res);
      setXName(f.name);
      setFrame(res.frames.length);
    }
  };
  const onEnergy = async (f: File) => {
    setMsg('');
    const r = await readFileText(f);
    if ('error' in r) return setMsg(r.error);
    const kind = detectKind(r.text);
    if (kind === 'OUTCAR') {
      const res = await parser.run({ kind: 'outcar-steps', text: r.text });
      if (res) {
        setSteps(res);
        setSName(f.name);
      }
    } else if (kind === 'OSZICAR') {
      const rep = readOutput(r.text);
      setSteps(rep.ionic.map((s) => ({ step: s.step, energy: s.energy })));
      setSName(f.name);
    } else setMsg('This does not look like an OSZICAR or an OUTCAR.');
  };

  const n = xdat?.frames.length ?? 0;
  const cur = Math.min(Math.max(frame, 1), Math.max(n, 1));
  const structure = useMemo(() => (xdat ? frameStructure(xdat, cur - 1) : null), [xdat, cur]);

  const onController = useCallback((c: SceneController | null) => setScene(isCell(c) ? c : null), []);
  useEffect(() => {
    if (scene && structure) scene.setStructure(structure, { outline: outline() });
  }, [scene, structure]);

  const flat = useMemo(() => {
    if (!structure) return null;
    const colors = speciesColors(structure.species);
    const L = structure.lattice;
    const pts: FlatPoint[] = structure.frac.map((f, i) => ({
      at: [
        f[0] * L[0][0] + f[1] * L[1][0] + f[2] * L[2][0],
        f[0] * L[0][1] + f[1] * L[1][1] + f[2] * L[2][1],
        f[0] * L[0][2] + f[1] * L[1][2] + f[2] * L[2][2],
      ] as Vec3,
      color: colors.get(structure.species[i]!) ?? '#777777',
    }));
    return { pts, solid: parallelepiped(L) };
  }, [structure]);

  const download = () => {
    if (!structure) return;
    const text = writePoscar(structure, { comment: `step ${cur} of ${xName}`, decimals: 10 }).text;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = cur === n ? 'POSCAR_final' : `POSCAR_step${cur}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tol = Number(ediffg);
  const forceTol = Number.isFinite(tol) && tol < 0 ? -tol : null;
  const last = steps.at(-1);
  const verdict =
    forceTol !== null && last?.maxForce !== undefined
      ? last.maxForce < forceTol
        ? `Largest force ${fmt(last.maxForce)} eV/A is below ${fmt(forceTol)}: the force criterion is met.`
        : `Largest force ${fmt(last.maxForce)} eV/A is above ${fmt(forceTol)}: not relaxed by this criterion.`
      : '';

  const W = 480;
  const H = 150;
  const plot = (vals: (number | undefined)[], label: string, unit: string, color: string, ref?: number) => {
    const pts = vals
      .map((v, i) => ({ v, i }))
      .filter((p): p is { v: number; i: number } => p.v !== undefined);
    if (pts.length < 1) return null;
    let lo = Math.min(...pts.map((p) => p.v), ...(ref !== undefined ? [ref] : []));
    let hi = Math.max(...pts.map((p) => p.v), ...(ref !== undefined ? [ref] : []));
    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }
    const x = (i: number) => 52 + (i / Math.max(vals.length - 1, 1)) * (W - 64);
    const y = (v: number) => 12 + ((hi - v) / (hi - lo)) * (H - 36);
    const ticks = niceTicks(lo, hi, 3);
    return (
      <figure className="lp-fig" key={label}>
        <figcaption>
          {label} ({unit})
        </figcaption>
        <svg
          className="av-plot"
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`${label} for each ionic step`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line className="av-grid" x1={52} x2={W - 12} y1={y(t)} y2={y(t)} />
              <text x={48} y={y(t) + 4} textAnchor="end">
                {fmt(t, 4)}
              </text>
            </g>
          ))}
          <line className="av-axis" x1={52} x2={W - 12} y1={H - 24} y2={H - 24} />
          <text x={W / 2} y={H - 6} textAnchor="middle">
            ionic step
          </text>
          {ref !== undefined && (
            <line
              x1={52}
              x2={W - 12}
              y1={y(ref)}
              y2={y(ref)}
              stroke="var(--text-muted)"
              strokeDasharray="5 4"
            />
          )}
          <polyline
            fill="none"
            stroke={color}
            strokeWidth="2"
            points={pts.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')}
          />
          {pts.map((p) => (
            <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={p.i === cur - 1 ? 5 : 2.5} fill={color} />
          ))}
        </svg>
      </figure>
    );
  };

  const readouts = [
    { label: 'Frames in XDATCAR', value: n || 'none yet' },
    ...(n ? [{ label: 'Showing step', value: `${cur} of ${n}` }] : []),
    ...(steps[cur - 1]?.energy !== undefined
      ? [{ label: 'Energy at this step', value: fmt(steps[cur - 1]!.energy!, 8), unit: 'eV' }]
      : []),
    ...(steps[cur - 1]?.maxForce !== undefined
      ? [{ label: 'Largest force at this step', value: fmt(steps[cur - 1]!.maxForce!), unit: 'eV/A' }]
      : []),
  ];

  return (
    <LabShell
      title="Relaxation viewer"
      goal="Open the XDATCAR of a relaxation, step through the structures, and compare with the energy and largest force of each step."
      badge="computed"
      headingLevel={headingLevel}
      controls={
        <>
          <DropFile what="XDATCAR" onFile={onX} disabled={parser.busy} loaded={xName} />
          <DropFile
            what="OSZICAR or OUTCAR"
            optional
            onFile={onEnergy}
            disabled={parser.busy}
            loaded={sName}
          />
          <p className="av-note">
            OSZICAR gives the energy of each step. OUTCAR gives the energy and the largest force.
          </p>
          <ParseStatus busy={parser.busy} progress={parser.progress} error={parser.error || msg} />
          {n > 0 && (
            <>
              <Slider label="Ionic step" min={1} max={Math.max(n, 2)} value={cur} onChange={setFrame} />
              <div className="av-row">
                <button type="button" className="btn" onClick={() => setFrame(Math.max(1, cur - 1))}>
                  Previous step
                </button>
                <button type="button" className="btn" onClick={() => setFrame(Math.min(n, cur + 1))}>
                  Next step
                </button>
                <button type="button" className="btn" onClick={download}>
                  Download this step as POSCAR
                </button>
              </div>
              <label className="or-num">
                EDIFFG of the run (negative means a force criterion, eV/A)
                <input
                  type="number"
                  step="0.01"
                  value={ediffg}
                  onChange={(e) => setEdiffg(e.currentTarget.value)}
                />
              </label>
            </>
          )}
        </>
      }
      readouts={readouts}
      onReset={() => {
        setXdat(null);
        setXName('');
        setSteps([]);
        setSName('');
        setMsg('');
        setEdiffg(String(EDIFFG_DEFAULT));
        parser.setError('');
      }}
      notice="A good relaxation shows the energy falling and flattening while the largest force drops below the criterion you set with EDIFFG. Watch which atoms move: a few tenths of an angstrom is common, a whole atom jumping to a new place means the structure changed, not that it relaxed."
      description={
        n
          ? `Step ${cur} of ${n} from ${xName}. ${steps.length ? `${steps.length} energy entries read from ${sName}. ` : ''}${verdict}`
          : 'No XDATCAR loaded yet.'
      }
    >
      {!n && (
        <p className="av-empty">
          Open the XDATCAR of your relaxation to start. This viewer ships with no example calculation: the
          picture below your own files would only be real if it came from your own run.
        </p>
      )}
      {n > 0 && flat && (
        <>
          <Lazy3D
            load={load}
            onController={onController}
            posterText="This view uses WebGL. It loads only when you ask for it. A flat view with rotation sliders works without it."
            fallback={
              <SolidFallback
                solid={flat.solid}
                points={flat.pts}
                label="Flat view of the structure at this step"
              />
            }
          />
          {!scene && (
            <SolidFallback
              solid={flat.solid}
              points={flat.pts}
              label="Flat view of the structure at this step"
            />
          )}
          {steps.length > 0 && steps.length !== n && (
            <p className="av-note">
              The energy file has {steps.length} steps and the XDATCAR has {n} frames; they are matched by
              step number, so check that they come from the same run.
            </p>
          )}
          {plot(
            steps.map((s) => s.energy),
            'Energy',
            'eV',
            '#0072B2',
          )}
          {plot(
            steps.map((s) => s.maxForce),
            'Largest force',
            'eV/A',
            '#D55E00',
            forceTol ?? undefined,
          )}
          {verdict && <p role="status">{verdict}</p>}
        </>
      )}
    </LabShell>
  );
}
