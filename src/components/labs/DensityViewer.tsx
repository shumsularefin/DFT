import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LabShell from './LabShell';
import Lazy3D, { type SceneModule } from './Lazy3D';
import DropFile, { ParseStatus } from './DropFile';
import { readFileText, useParser } from './useParser';
import Slider from '../ui/Slider';
import type { SceneController } from '../../lib/three/SceneController';
import type { IsoScene } from '../../lib/three/IsoScene';
import type { ChgcarResult } from '../../lib/vasp/chgcar';
import { electronCount, maxDensity } from '../../lib/vasp/chgcar';
import { diverging, sequential, sliceGrid, type Axis } from '../../lib/vasp/gridSlice';
import { fmt } from '../../lib/vasp/ticks';
import type { Mesh } from '../../lib/physics/marchingCubes';
import './AnalysisViewers.css';

const load = (): Promise<SceneModule> => import('../../lib/three/IsoScene');
const isIso = (c: SceneController | null): c is IsoScene =>
  !!c && typeof (c as IsoScene).setSurfaces === 'function';
const MAX_TRIANGLES = 3_000_000;
const POS = '#009E73';
const NEG = '#D55E00';

type Field = 'total' | 'magnetization';

/** Lab "density-viewer": isosurface and cross-section of a CHGCAR, total density or magnetization. */
export default function DensityViewer({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const parser = useParser();
  const [chg, setChg] = useState<ChgcarResult | null>(null);
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [field, setField] = useState<Field>('total');
  const [frac, setFrac] = useState(20); // iso level, percent of the maximum
  const [axis, setAxis] = useState<Axis>(2);
  const [pos, setPos] = useState(0);
  const [meshes, setMeshes] = useState<{ mesh: Mesh; color: string }[]>([]);
  const [meshBusy, setMeshBusy] = useState(false);
  const [scene, setScene] = useState<IsoScene | null>(null);
  const ticket = useRef(0);
  const canvas = useRef<HTMLCanvasElement>(null);

  const onFile = async (f: File) => {
    setMsg('');
    const r = await readFileText(f);
    if ('error' in r) return setMsg(r.error);
    const res = await parser.run({ kind: 'chgcar', text: r.text });
    if (res) {
      setChg(res);
      setName(f.name);
      setField('total');
      setPos(0);
    }
  };

  // physical values: rho in e/A^3 (raw rho*V divided by the cell volume)
  const values = useMemo(() => {
    if (!chg) return null;
    const src = field === 'magnetization' && chg.magnetization ? chg.magnetization : chg.data;
    const out = new Float64Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = src[i]! / chg.volume;
    return out;
  }, [chg, field]);
  const vmax = useMemo(() => {
    if (!values) return 0;
    let m = 0;
    for (let i = 0; i < values.length; i++) m = Math.max(m, Math.abs(values[i]!));
    return m;
  }, [values]);
  const iso = (vmax * frac) / 100;

  const lattice = chg?.structure.lattice;
  useEffect(() => {
    if (!chg || !values || !(iso > 0)) {
      setMeshes([]);
      return;
    }
    const mine = ++ticket.current;
    setMeshBusy(true);
    const t = setTimeout(async () => {
      const lat = chg.structure.lattice;
      const signed = field === 'magnetization';
      const jobs = [{ sign: 1, color: POS }, ...(signed ? [{ sign: -1, color: NEG }] : [])];
      try {
        const out: { mesh: Mesh; color: string }[] = [];
        for (const j of jobs) {
          const v = j.sign === 1 ? values : values.map((x) => -x);
          const mesh = await parser.run({
            kind: 'mesh',
            values: v,
            dims: chg.grid,
            iso,
            lattice: lat as never,
            periodic: true,
          });
          if (mine !== ticket.current) return;
          if (mesh) out.push({ mesh, color: j.color });
        }
        if (mine === ticket.current) setMeshes(out);
      } finally {
        if (mine === ticket.current) setMeshBusy(false);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [chg, values, iso, field]);

  const triangles = meshes.reduce((a, m) => a + m.mesh.indices.length / 3, 0);
  const tooBig = triangles > MAX_TRIANGLES;

  const onController = useCallback((c: SceneController | null) => setScene(isIso(c) ? c : null), []);
  useEffect(() => {
    if (scene && lattice && !tooBig)
      scene.setSurfaces(
        meshes.map((m) => ({ positions: m.mesh.positions, indices: m.mesh.indices, color: m.color })),
        lattice,
      );
  }, [scene, lattice, meshes, tooBig]);

  // cross-section
  const nAxis = chg ? chg.grid[axis] : 1;
  const idx = Math.min(pos, nAxis - 1);
  const slice = useMemo(
    () => (values && chg ? sliceGrid(values, chg.grid, axis, idx) : null),
    [values, chg, axis, idx],
  );
  useEffect(() => {
    const c = canvas.current;
    if (!c || !slice) return;
    c.width = slice.width;
    c.height = slice.height;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const img = ctx.createImageData(slice.width, slice.height);
    for (let j = 0; j < slice.height; j++)
      for (let i = 0; i < slice.width; i++) {
        const v = slice.data[i + slice.width * j]!;
        const rgb =
          field === 'magnetization'
            ? diverging(vmax > 0 ? v / vmax : 0)
            : sequential(vmax > 0 ? v / vmax : 0);
        const o = 4 * (i + slice.width * (slice.height - 1 - j)); // row 0 at the bottom
        img.data[o] = rgb[0];
        img.data[o + 1] = rgb[1];
        img.data[o + 2] = rgb[2];
        img.data[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
  }, [slice, vmax, field]);

  const n = chg ? electronCount(chg.data) : 0;
  const mint = chg?.magnetization ? electronCount(chg.magnetization) : null;
  const axisName = ['a', 'b', 'c'][axis]!;
  const inPlane = [
    ['b', 'c'],
    ['a', 'c'],
    ['a', 'b'],
  ][axis]!;

  return (
    <LabShell
      title="Charge density viewer"
      goal="Open a CHGCAR, draw an isosurface at a level you choose, and look at a cross-section of the density or magnetization."
      badge="computed"
      headingLevel={headingLevel}
      controls={
        <>
          <DropFile what="CHGCAR, CHG or PARCHG" onFile={onFile} disabled={parser.busy} loaded={name} />
          <p className="av-note">Large grids take a few seconds. The file is read in a background thread.</p>
          <ParseStatus
            busy={parser.busy && !meshBusy}
            progress={parser.progress}
            error={parser.error || msg}
          />
          {chg && (
            <>
              {chg.magnetization && (
                <fieldset className="lp-radios">
                  <legend>Show</legend>
                  {(['total', 'magnetization'] as const).map((f) => (
                    <label key={f} className="lp-radio">
                      <input
                        type="radio"
                        name="dv-field"
                        checked={field === f}
                        onChange={() => setField(f)}
                      />
                      {f === 'total' ? 'Total density' : 'Magnetization'}
                    </label>
                  ))}
                </fieldset>
              )}
              <Slider
                label={
                  field === 'total'
                    ? 'Isosurface level (percent of the maximum)'
                    : 'Isosurface level (percent of the largest magnitude)'
                }
                min={1}
                max={99}
                value={frac}
                unit="%"
                onChange={setFrac}
              />
              <fieldset className="lp-radios">
                <legend>Cross-section perpendicular to</legend>
                {([0, 1, 2] as const).map((a) => (
                  <label key={a} className="lp-radio">
                    <input
                      type="radio"
                      name="dv-axis"
                      checked={axis === a}
                      onChange={() => {
                        setAxis(a);
                        setPos(0);
                      }}
                    />
                    {['a', 'b', 'c'][a]}
                  </label>
                ))}
              </fieldset>
              <Slider
                label={`Position along ${axisName} (grid plane)`}
                min={0}
                max={Math.max(nAxis - 1, 1)}
                value={idx}
                onChange={setPos}
              />
            </>
          )}
        </>
      }
      readouts={
        chg
          ? [
              { label: 'Grid', value: chg.grid.join(' x ') },
              { label: 'Cell volume', value: fmt(chg.volume, 6), unit: 'A^3' },
              { label: 'Electrons (sum / N grid)', value: fmt(n, 6) },
              { label: 'Maximum density', value: fmt(maxDensity(chg), 5), unit: 'e/A^3' },
              ...(mint !== null
                ? [{ label: 'Integrated magnetization', value: fmt(mint, 5), unit: 'mu_B' }]
                : []),
              { label: 'Isosurface level', value: fmt(iso, 4), unit: 'e/A^3' },
              { label: 'Triangles', value: meshBusy ? 'working' : triangles.toLocaleString('en') },
            ]
          : []
      }
      onReset={() => {
        setChg(null);
        setName('');
        setMeshes([]);
        setFrac(20);
        setPos(0);
        setField('total');
        setMsg('');
        parser.setError('');
      }}
      notice="The density is large near the nuclei and small in the bonds, so the level you choose decides what you see: a high level shows only the cores, a low level a blob that joins neighbouring atoms. Neither is 'the' bond. Compare the integrated electron count with the electrons you expect, which includes only the valence electrons of the pseudopotentials."
      description={
        chg
          ? `${field === 'total' ? 'Total charge density' : 'Magnetization'} from ${name} on a ${chg.grid.join(' by ')} grid. The isosurface is drawn at ${fmt(iso, 4)} electrons per cubic angstrom, ${frac} percent of the maximum, with ${triangles} triangles. The cross-section is the grid plane ${idx + 1} of ${nAxis} perpendicular to ${axisName}, spanned by ${inPlane.join(' and ')}.`
          : 'No CHGCAR loaded yet.'
      }
    >
      {!chg && (
        <p className="av-empty">
          Open a CHGCAR, CHG or PARCHG to start. This viewer ships with no example: every surface here comes
          from a file you open.
        </p>
      )}
      {chg && (
        <>
          {tooBig && (
            <p role="alert" className="av-error">
              This level gives {triangles.toLocaleString('en')} triangles, too many to draw smoothly. Raise
              the level.
            </p>
          )}
          <Lazy3D
            load={load}
            onController={onController}
            posterText="This view uses WebGL. It loads only when you ask for it. The cross-section below works without it."
            fallback={
              <p className="av-note">3D is not available in this browser. Use the cross-section below.</p>
            }
          />
          <figure className="lp-fig">
            <figcaption>
              Cross-section at grid plane {idx + 1} of {nAxis}, perpendicular to {axisName} (horizontal{' '}
              {inPlane[0]}, vertical {inPlane[1]})
            </figcaption>
            <canvas
              ref={canvas}
              className="av-canvas"
              role="img"
              aria-label={`Cross-section of the ${field} perpendicular to ${axisName}, plane ${idx + 1} of ${nAxis}. Range ${fmt(slice?.min ?? 0, 3)} to ${fmt(slice?.max ?? 0, 3)} electrons per cubic angstrom.`}
            />
            <p className="lp-legend">
              {field === 'total'
                ? `Dark is low, bright is high; the colour scale runs from 0 to ${fmt(vmax, 4)} e/A^3.`
                : `Blue is negative, orange is positive, white is zero; the scale is plus and minus ${fmt(vmax, 4)} e/A^3.`}{' '}
              Drawn in grid coordinates; for a cell that is not rectangular it is not to scale.
            </p>
          </figure>
          {chg.warnings.map((w) => (
            <p key={w} className="av-note">
              {w}
            </p>
          ))}
        </>
      )}
    </LabShell>
  );
}
