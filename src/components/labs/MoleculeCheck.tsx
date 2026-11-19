import { useEffect, useRef, useState } from 'react';
import { RdkitClient } from '../../lib/chem/rdkit-client';
import type { MoleculeReport } from '../../lib/chem/molecule-service';
import { moleculeInBox, writeXyz } from '../../lib/chem/molexport';

const mono = { width: '100%', fontFamily: 'var(--font-mono, monospace)' } as const;

/** Check page for M10.3: RDKit (in a worker, loaded on the first press) reads a molecule; geom3d.ts gives a rough 3D geometry. */
export default function MoleculeCheck({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  const Sub = `h${headingLevel + 1}` as 'h3' | 'h4';
  const [text, setText] = useState('CCO');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<MoleculeReport | null>(null);
  const client = useRef<RdkitClient | null>(null);
  useEffect(() => () => client.current?.dispose(), []);

  async function run(op: 'check' | 'geometry') {
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      client.current ??= new RdkitClient();
      setOut(op === 'check' ? await client.current.check(text) : await client.current.geometry(text, 1));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const geo = out?.geometry;
  const box = geo ? moleculeInBox(geo.species, geo.positions, { comment: out?.smiles ?? 'molecule' }) : null;
  return (
    <section aria-labelledby="mol-h">
      <Heading id="mol-h">Molecule engine</Heading>
      <p>
        Type a SMILES string (for example CCO for ethanol, c1ccccc1 for benzene) or paste a MOL block.
        Everything runs in your browser.
      </p>
      <p>
        <label htmlFor="mol-text">SMILES or MOL block</label>
        <br />
        <textarea
          id="mol-text"
          rows={4}
          style={mono}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </p>
      <p>
        <button type="button" className="btn btn-primary" onClick={() => void run('check')} disabled={busy}>
          {busy ? 'Working...' : 'Check molecule'}
        </button>{' '}
        <button type="button" className="btn" onClick={() => void run('geometry')} disabled={busy}>
          Rough 3D geometry
        </button>
      </p>
      <div aria-live="polite">
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        {out && !out.ok ? (
          <div role="alert">
            {out.issues.map((i) => (
              <div key={i.code + i.title}>
                <p>
                  <strong>
                    {i.code}: {i.title}
                  </strong>
                </p>
                <p>{i.why}</p>
                {i.data?.suggestion ? <p>What to try: {String(i.data.suggestion)}</p> : null}
              </div>
            ))}
          </div>
        ) : null}
        {out?.ok ? (
          <div>
            <Sub>What RDKit read</Sub>
            <dl className="lab-readouts">
              <dt>Canonical SMILES</dt>
              <dd>{out.smiles}</dd>
              <dt>Heavy atoms</dt>
              <dd>{out.graph?.atoms.length}</dd>
              <dt>2D layout</dt>
              <dd>{out.layout}</dd>
            </dl>
            {out.svg ? (
              <img
                src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(out.svg)}`}
                width={320}
                height={220}
                style={{ maxWidth: '100%', height: 'auto', background: '#fff' }}
                alt={`2D drawing of ${out.smiles}`}
              />
            ) : null}
          </div>
        ) : null}
        {geo && box ? (
          <div>
            <Sub>Rough 3D geometry (Heuristic)</Sub>
            {geo.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
            <p>
              Lone pairs count as full electron domains in this model, so water comes out at the tetrahedral
              109.47 degrees; a real water molecule has a smaller angle. Relax the geometry with DFT before
              you trust it.
            </p>
            <dl className="lab-readouts">
              <dt>Atoms with hydrogens</dt>
              <dd>{geo.species.length}</dd>
              <dt>Optimizer</dt>
              <dd>
                {geo.converged ? 'converged' : 'not converged'} after {geo.iterations} steps
              </dd>
              <dt>Box edge</dt>
              <dd>{box.edge.toFixed(3)} Angstrom</dd>
            </dl>
            <p>
              <label htmlFor="mol-xyz">XYZ</label>
              <br />
              <textarea
                id="mol-xyz"
                rows={6}
                style={mono}
                readOnly
                value={writeXyz(geo.species, geo.positions, out?.smiles ?? '')}
              />
            </p>
            <p>
              <label htmlFor="mol-poscar">POSCAR (molecule in a box)</label>
              <br />
              <textarea id="mol-poscar" rows={8} style={mono} readOnly value={box.poscar} />
            </p>
            {box.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
