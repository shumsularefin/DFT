import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LabShell from './LabShell';
import Lazy3D, { type SceneModule } from './Lazy3D';
import LatticeChooser, { latticeOf } from './LatticeChooser';
import SolidFallback, { type FlatPoint } from './SolidFallback';
import Toggle from '../ui/Toggle';
import Slider from '../ui/Slider';
import { brillouinZone } from '../../lib/crystal/brillouin';
import { reciprocalLattice } from '../../lib/crystal/lattice';
import { meshPoints, qToCartesian } from '../../lib/crystal/kmesh';
import { SymmetryClient } from '../../lib/crystal/symmetry-client';
import { hpkotPath, pointLabelDisplay, setyawanPath, type KPathConvention } from '../../lib/crystal/kpath';
import { analyzeResultToPath, type PathPicture } from './bzPath';
import { BZ_COLORS } from '../../lib/three/bzColors';
import type { BzScene } from '../../lib/three/BzScene';
import type { SceneController } from '../../lib/three/SceneController';
import type { Mat3, Structure, Vec3 } from '../../lib/crystal/types';

const load = (): Promise<SceneModule> => import('../../lib/three/BzScene');
const isBz = (c: SceneController | null): c is BzScene => !!c && typeof (c as BzScene).setZone === 'function';

/** Brillouin zone and k-path viewer. The zone is instant; the path needs the symmetry engine, which loads on request. */
export default function BrillouinLab({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const [cellId, setCellId] = useState('fcc');
  const [custom, setCustom] = useState<Mat3 | null>(null);
  const [axes, setAxes] = useState(false);
  const [showMesh, setShowMesh] = useState(false);
  const [mesh, setMesh] = useState(6);
  const [convention, setConvention] = useState<KPathConvention>('HPKOT');
  const [path, setPath] = useState<PathPicture | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [scene, setScene] = useState<BzScene | null>(null);
  const client = useRef<SymmetryClient | null>(null);
  useEffect(() => () => client.current?.dispose(), []);

  const lattice = latticeOf(cellId, custom);
  // The zone belongs to the cell the path was computed in once a path exists.
  const recip = path ? path.recip : reciprocalLattice(lattice);
  const zone = useMemo(() => brillouinZone(recip), [recip]);
  const meshCart = useMemo(() => {
    if (!showMesh) return null;
    const p = meshPoints([mesh, mesh, mesh], 'gamma');
    const out = new Float64Array(p.coords.length);
    for (let i = 0; i < p.count; i++) {
      const c = qToCartesian(
        [p.coords[3 * i]!, p.coords[3 * i + 1]!, p.coords[3 * i + 2]!],
        recip as unknown as [Vec3, Vec3, Vec3],
      );
      out.set(c, 3 * i);
    }
    return out;
  }, [showMesh, mesh, recip]);

  const onController = useCallback((c: SceneController | null) => setScene(isBz(c) ? c : null), []);

  // push state into the live scene
  useEffect(() => {
    if (!scene) return;
    scene.setZone(zone, recip);
    scene.setPoints(path?.points ?? []);
    scene.setPath(path?.segments ?? []);
  }, [scene, zone, recip, path]);
  useEffect(() => scene?.setAxes(axes), [scene, axes]);
  useEffect(() => scene?.setMesh(meshCart), [scene, meshCart]);

  const resetPath = () => setPath(null);

  async function computePath() {
    setBusy(true);
    setError('');
    try {
      const s: Structure = {
        lattice,
        frac: [[0, 0, 0]],
        species: ['H'],
      };
      client.current ??= new SymmetryClient();
      const sym = await client.current.analyze(s, { symprec: 1e-4, setting: 'Spglib' });
      const r = convention === 'HPKOT' ? hpkotPath(sym) : setyawanPath(sym);
      setPath(analyzeResultToPath(r, convention, pointLabelDisplay));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const flatPoints: FlatPoint[] = [
    { at: [0, 0, 0], label: 'Γ', color: BZ_COLORS.gamma },
    ...(path?.points ?? []).map((p) => ({ at: p.k, label: p.label, color: BZ_COLORS.points })),
  ];
  const reset = () => {
    setCellId('fcc');
    setCustom(null);
    setAxes(false);
    setShowMesh(false);
    setPath(null);
    setError('');
    scene?.resetView();
  };

  return (
    <LabShell
      title="Brillouin zone viewer"
      goal="See the first Brillouin zone of a lattice, the reciprocal vectors, and the path through it that band-structure calculations follow."
      badge="computed"
      headingLevel={headingLevel}
      controls={
        <>
          <LatticeChooser
            cellId={cellId}
            custom={custom}
            onChange={(id, c) => {
              setCellId(id);
              setCustom(c);
              resetPath();
            }}
          />
          <div className="orbitals-select">
            <label htmlFor="bz-conv" className="slider-label">
              Path convention
            </label>
            <select
              id="bz-conv"
              className="orbitals-select-input"
              value={convention}
              onChange={(e) => {
                setConvention(e.target.value as KPathConvention);
                resetPath();
              }}
            >
              <option value="HPKOT">HPKOT (seekpath, default)</option>
              <option value="Setyawan-Curtarolo">Setyawan-Curtarolo (pymatgen)</option>
            </select>
          </div>
          <div className="cv-actions">
            <button type="button" onClick={() => void computePath()} disabled={busy}>
              {busy ? 'Working...' : 'Compute k-path'}
            </button>
          </div>
          <Toggle label="Show the x, y, z axes" checked={axes} onChange={setAxes} />
          <Toggle label="Show a Gamma-centred k-mesh" checked={showMesh} onChange={setShowMesh} />
          {showMesh && <Slider label="Mesh divisions" min={1} max={12} value={mesh} onChange={setMesh} />}
          {scene && (
            <div className="cv-actions" role="group" aria-label="Preset views">
              <button type="button" onClick={() => scene.viewAlongReciprocal(0)}>
                Along b₁
              </button>
              <button type="button" onClick={() => scene.viewAlongReciprocal(1)}>
                Along b₂
              </button>
              <button type="button" onClick={() => scene.viewAlongReciprocal(2)}>
                Along b₃
              </button>
              <button type="button" onClick={() => scene.viewAlongPathStart()} disabled={!scene.hasPath}>
                Along the path start
              </button>
            </div>
          )}
        </>
      }
      readouts={[
        { label: 'Zone vertices', value: zone.vertices.length },
        { label: 'Zone edges', value: zone.edges.length },
        { label: 'Zone faces', value: zone.faces.length },
        { label: 'Zone volume', value: `${zone.volume.toFixed(4)} Å⁻³` },
        { label: 'k-path', value: path ? path.text.join(' | ') : 'not computed yet' },
      ]}
      onReset={reset}
      notice="The zone is the set of points closer to Γ than to any other reciprocal lattice point. The k-path is computed for the standardized primitive cell of your lattice (with one atom per site, so only the lattice symmetry is used), and the zone shown with it is that cell's zone, which can be rotated against the cell you chose. Drag to orbit, scroll or pinch to zoom, arrow keys rotate, + and - zoom, R resets."
      description={`The first Brillouin zone of the chosen lattice has ${zone.vertices.length} vertices, ${zone.edges.length} edges and ${zone.faces.length} faces. ${path ? `The ${path.name} k-path visits ${path.text.join(', ')}.` : 'No k-path has been computed yet.'}`}
    >
      {error && (
        <p role="alert" className="cv-note">
          {error}
        </p>
      )}
      {path?.warnings.map((w) => (
        <p key={w} className="cv-note">
          {w}
        </p>
      ))}
      <Lazy3D
        load={load}
        onController={onController}
        posterText="This view uses WebGL. It loads only when you ask for it. A flat view with rotation sliders works without it."
        fallback={
          <SolidFallback
            solid={zone}
            points={flatPoints}
            segments={path?.segments ?? []}
            label="Flat view of the first Brillouin zone"
          />
        }
      />
      {!scene && (
        <SolidFallback
          solid={zone}
          points={flatPoints}
          segments={path?.segments ?? []}
          label="Flat view of the first Brillouin zone"
        />
      )}
    </LabShell>
  );
}
