import { useDeferredValue, useId, useMemo, useState } from 'react';
import Slider from '../ui/Slider';
import Badge from '../ui/Badge';
import LogErrorPlot from './LogErrorPlot';
import { MESH_SIZES, METAL_EXACT, errorSeries, referenceEnergy } from '../../lib/physics/tightbinding2d';

const sci = (x: number) => (x < 1e-16 ? '< 1e-16' : x.toExponential(1));

/** Toy panel "metal-vs-insulator": error of the k-mesh sum for a 2D tight-binding band, with and without a gap. */
export default function MetalInsulatorPanel({ headingLevel = 4 }: { headingLevel?: 3 | 4 }) {
  const Heading = `h${headingLevel}` as 'h3' | 'h4';
  const [delta, setDelta] = useState(1);
  const [sigma, setSigma] = useState(0);
  const dDelta = useDeferredValue(delta);
  const dSigma = useDeferredValue(sigma);
  const id = useId();
  const data = useMemo(() => {
    const metal = errorSeries(MESH_SIZES, 0, dSigma, referenceEnergy(0, dSigma));
    const ins = errorSeries(MESH_SIZES, dDelta, dSigma, referenceEnergy(dDelta, dSigma));
    return { metal, ins };
  }, [dDelta, dSigma]);
  const last = (a: { error: number }[]) => a.at(-1)!.error;
  const description = `Error of the occupied-band energy on N by N meshes, N from 4 to 24. The metal (no gap) ends at about ${sci(last(data.metal))} and the insulator (gap parameter ${dDelta.toFixed(1)} t) at about ${sci(last(data.ins))}. The metal curve is bent and falls slowly; the insulator curve falls almost as a straight line on this log axis, which means exponential decay.`;
  return (
    <section aria-labelledby={`${id}-h`} className="metal-panel">
      <Heading id={`${id}-h`}>
        Why metals need denser meshes <Badge variant="toy-model" />
      </Heading>
      <p>
        A square lattice of atoms with one band, <code>E(k) = -2t (cos kx + cos ky)</code>. Half filling: the
        lowest states are full. With no gap (a metal) the line separating full from empty states, the Fermi
        surface, cuts through the zone, so a coarse mesh misses where it falls. Adding a staggered potential{' '}
        <code>+-Delta</code> opens a gap (an insulator): the sum is then over a smooth function and a coarse
        mesh is already good. This is a toy model, not a real material.
      </p>
      <p>
        Energy per site and spin: <code>e = -(1/2) mean over k of sqrt(Delta^2 + eps(k)^2)</code>, with{' '}
        <code>eps(k) = -2t (cos kx + cos ky)</code>. With Gaussian smearing the sum carries a weight{' '}
        <code>erf(E / (sqrt(2) sigma))</code>. For Delta = 0 and no smearing the exact value is{' '}
        <code>-8t/pi^2 = {METAL_EXACT.toFixed(6)} t</code>; otherwise the reference is a {600} by {600} mesh.
      </p>
      <div className="metal-controls">
        <Slider
          label="Gap parameter Delta (units of t)"
          min={0.1}
          max={2}
          step={0.1}
          value={delta}
          onChange={setDelta}
        />
        <Slider
          label="Smearing sigma (units of t)"
          min={0}
          max={0.5}
          step={0.05}
          value={sigma}
          onChange={setSigma}
        />
      </div>
      <LogErrorPlot
        title="Error of the occupied-band energy against mesh size"
        description={description}
        series={[
          { name: 'Metal', color: '#e8590c', shape: 'circle', points: data.metal },
          { name: 'Insulator', color: '#1971c2', shape: 'square', points: data.ins },
        ]}
      />
      <p role="status">
        At N = 24 the error is {sci(last(data.metal))} t for the metal and {sci(last(data.ins))} t for the
        insulator.
        {sigma > 0
          ? ' Smearing smooths the step at the Fermi surface, so the metal error falls faster, at the price of a slightly different energy (a smeared occupation is not the sharp one).'
          : ' Turn on smearing to see how a smoother occupation helps the metal.'}
      </p>
      <details>
        <summary>Show the numbers</summary>
        <table className="metal-table">
          <caption>Absolute error against the reference, in units of t</caption>
          <thead>
            <tr>
              <th scope="col">N</th>
              <th scope="col">Metal</th>
              <th scope="col">Insulator</th>
            </tr>
          </thead>
          <tbody>
            {data.metal.map((m, i) => (
              <tr key={m.n}>
                <th scope="row">{m.n}</th>
                <td>{sci(m.error)}</td>
                <td>{sci(data.ins[i]!.error)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
