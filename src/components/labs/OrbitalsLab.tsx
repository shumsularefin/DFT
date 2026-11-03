import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LabShell from './LabShell';
import Lazy3D, { type SceneModule } from './Lazy3D';
import RadialPlot from './RadialPlot';
import Toggle from '../ui/Toggle';
import { BOHR_RADIUS_ANGSTROM } from '../../lib/physics/constants';
import {
  energyEV,
  listOrbitals,
  mostProbableRadius,
  radialNodeCount,
  radialNodeRadii,
} from '../../lib/physics/hydrogen';
import { OrbitalSampler } from '../../lib/physics/orbital-sampler';
import type { SceneController } from '../../lib/three/SceneController';
import type { OrbitalScene } from '../../lib/three/OrbitalScene';

const load = (): Promise<SceneModule> => import('../../lib/three/OrbitalScene');
const ORBITALS = listOrbitals(4);
const DEFAULT_LABEL = '2p_z';
const SEED = 20261029;

const isOrbitalScene = (c: SceneController | null): c is OrbitalScene =>
  !!c && typeof (c as OrbitalScene).setCloud === 'function';

/** Lab "orbitals": point clouds of one-electron (hydrogen-like) orbitals, sampled in a Web Worker. */
export default function OrbitalsLab() {
  const [label, setLabel] = useState(DEFAULT_LABEL);
  const [dense, setDense] = useState(false);
  const [nodesOn, setNodesOn] = useState(false);
  const [scene, setScene] = useState<OrbitalScene | null>(null);
  const [status, setStatus] = useState<'idle' | 'sampling' | 'ready'>('idle');
  const orb = ORBITALS.find((o) => o.label === label) ?? ORBITALS[0]!;
  const info = useMemo(
    () => ({
      energy: energyEV(orb.n),
      rp: mostProbableRadius(orb.n, orb.l),
      nodes: radialNodeCount(orb.n, orb.l),
      radii: radialNodeRadii(orb.n, orb.l),
    }),
    [orb.n, orb.l],
  );
  const onController = useCallback((c: SceneController | null) => {
    setScene(isOrbitalScene(c) ? c : null);
    if (!c) setStatus('idle');
  }, []);

  const sampler = useRef<OrbitalSampler | null>(null);
  useEffect(() => {
    if (!scene) return;
    const s = new OrbitalSampler();
    sampler.current = s;
    return () => {
      s.dispose();
      sampler.current = null;
    };
  }, [scene]);

  useEffect(() => {
    const s = sampler.current;
    if (!scene || !s) return;
    let cancelled = false;
    setStatus('sampling');
    void s
      .request({ n: orb.n, l: orb.l, m: orb.m, count: dense ? 50_000 : 30_000, seed: SEED })
      .then((cloud) => {
        if (cancelled || !cloud) return;
        scene.setCloud(cloud.positions, cloud.signs, cloud.extent);
        scene.setNodes(info.radii);
        scene.showNodes(nodesOn);
        setStatus('ready');
      });
    return () => {
      cancelled = true;
    };
    // nodesOn is applied by its own effect below
  }, [scene, orb.n, orb.l, orb.m, dense, info.radii]);

  useEffect(() => {
    scene?.showNodes(nodesOn);
  }, [scene, nodesOn]);

  const reset = () => {
    setLabel(DEFAULT_LABEL);
    setDense(false);
    setNodesOn(false);
  };

  const radiusText = `${info.rp.toFixed(2)} a0 (${(info.rp * BOHR_RADIUS_ANGSTROM).toFixed(2)} Å)`;
  return (
    <LabShell
      title="Hydrogen orbitals"
      goal="Pick an orbital and turn it around: each dot is one place the electron could be found."
      badge="computed"
      headingLevel={3}
      controls={
        <>
          <div className="orbitals-select">
            <label htmlFor="orbital-select" className="slider-label">
              Orbital
            </label>
            <select
              id="orbital-select"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="orbitals-select-input"
            >
              {[1, 2, 3, 4].map((n) => (
                <optgroup key={n} label={`n = ${n}`}>
                  {ORBITALS.filter((o) => o.n === n).map((o) => (
                    <option key={o.label} value={o.label}>
                      {o.label.replace('_', ' ')}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <Toggle label="Show radial nodes" checked={nodesOn} onChange={setNodesOn} />
          <Toggle label="Denser cloud (50 000 points)" checked={dense} onChange={setDense} />
        </>
      }
      readouts={[
        { label: 'Orbital', value: orb.label.replace('_', ' ') },
        { label: 'Energy', value: energyEV(orb.n).toFixed(4), unit: 'eV' },
        { label: 'Most probable distance', value: radiusText },
        { label: 'Radial nodes', value: info.nodes },
        {
          label: 'Cloud',
          value: !scene ? 'not started' : status === 'sampling' ? 'sampling...' : 'ready',
        },
      ]}
      onReset={reset}
      notice="Orange and blue are the two signs of the wavefunction, not charges. Where they meet, the wavefunction is zero: those gaps are nodes. Count the lobes and the shells, then compare with the radial curve. Real atoms have many electrons. These are one-electron orbitals, a starting point and not a picture of any real atom."
      description={`A cloud of dots showing where one electron in a hydrogen-like atom is likely to be found, for the ${orb.label.replace('_', ' ')} orbital. The shape comes from the quantum numbers: ${orb.n === 1 ? 'a single sphere' : `${info.nodes} spherical radial node${info.nodes === 1 ? '' : 's'}`}${orb.l > 0 ? ` and ${orb.l} angular node${orb.l === 1 ? '' : 's'} (planes or cones where the cloud is empty)` : ''}. Orange dots mark places where the wavefunction is positive and blue dots where it is negative. Its energy is ${energyEV(orb.n).toFixed(4)} electron volts and the most probable distance from the nucleus is ${radiusText}. Without 3D support, the radial probability curve is shown instead. The vertical axis of the 3D view is the z axis.`}
    >
      <Lazy3D
        load={load}
        onController={onController}
        posterText="This view uses WebGL and a small sampling program. It loads only when you ask for it."
        fallback={<RadialPlot n={orb.n} l={orb.l} label={orb.label.replace('_', ' ')} />}
      />
      {scene && <RadialPlot n={orb.n} l={orb.l} label={orb.label.replace('_', ' ')} />}
    </LabShell>
  );
}
