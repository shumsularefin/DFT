import { useEffect, useRef, useState } from 'react';
import { readStructure } from '../../lib/crystal/io';
import { ParseError } from '../../lib/crystal/errors';
import { SymmetryClient } from '../../lib/crystal/symmetry-client';
import { describeStandardization, type StandardizationReport } from '../../lib/crystal/standardize';
import type { SymmetryResult } from '../../lib/crystal/symmetry';

const EXAMPLE = `data_Cu
_cell_length_a 3.61
_cell_length_b 3.61
_cell_length_c 3.61
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90
loop_
_symmetry_equiv_pos_as_xyz
'x, y, z'
'x, y+1/2, z+1/2'
'x+1/2, y, z+1/2'
'x+1/2, y+1/2, z'
loop_
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Cu 0 0 0
`;

const f = (x: number) => (Math.abs(x) < 5e-10 ? 0 : x).toFixed(4);

interface Outcome {
  result: SymmetryResult;
  report: StandardizationReport;
  warnings: string[];
}

/** Check page for M5.1: reads a POSCAR, CIF or XYZ text, runs the symmetry worker, and shows what standardizing changed. */
export default function SymmetryCheck({ headingLevel = 2 }: { headingLevel?: 2 | 3 }) {
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  const Sub = `h${headingLevel + 1}` as 'h3' | 'h4';
  const [text, setText] = useState(EXAMPLE);
  const [name, setName] = useState('example.cif');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [out, setOut] = useState<Outcome | null>(null);
  const client = useRef<SymmetryClient | null>(null);
  useEffect(() => () => client.current?.dispose(), []);

  async function run() {
    setBusy(true);
    setError(null);
    setOut(null);
    try {
      const read = readStructure(name, text);
      client.current ??= new SymmetryClient();
      const result = await client.current.analyze(read.structure, { symprec: 1e-3 });
      setOut({ result, report: describeStandardization(read.structure, result), warnings: read.warnings });
    } catch (e) {
      setError(e instanceof ParseError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setName(file.name);
    setText(await file.text());
    setOut(null);
    setError(null);
  }

  const r = out?.report;
  return (
    <section aria-labelledby="sym-h">
      <Heading id="sym-h">Symmetry and standardization</Heading>
      <p>
        The text below is an example structure (fcc copper written as a conventional cell with four atoms).
        Replace it with your own POSCAR, CIF or XYZ text, or choose a file. Files are read in your browser and
        are never uploaded.
      </p>
      <p>
        <label>
          File (POSCAR, CONTCAR, CIF, XYZ){' '}
          <input type="file" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
      </p>
      <p>
        <label htmlFor="sym-text">Structure text ({name})</label>
        <br />
        <textarea
          id="sym-text"
          rows={10}
          style={{ width: '100%', fontFamily: 'var(--font-mono, monospace)' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </p>
      <p>
        <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={busy}>
          {busy ? 'Working...' : 'Find symmetry'}
        </button>
      </p>
      <div aria-live="polite">
        {error ? (
          <p role="alert" className="error">
            {error}
          </p>
        ) : null}
        {out && r ? (
          <div>
            <Sub>What happened to your cell</Sub>
            <p>
              <strong>{r.headline}</strong>
            </p>
            {r.details.map((d) => (
              <p key={d}>{d}</p>
            ))}
            {out.warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
            <dl className="lab-readouts">
              <dt>Space group</dt>
              <dd>
                {out.result.hmSymbol} (number {out.result.number}), Hall number {out.result.hallNumber}
              </dd>
              <dt>Pearson symbol</dt>
              <dd>{out.result.pearson}</dd>
              <dt>Atoms per cell</dt>
              <dd>
                {r.atomsBefore} to {r.atomsAfter}
              </dd>
              <dt>Symmetry operations</dt>
              <dd>{out.result.operations.length}</dd>
              <dt>Wyckoff letters</dt>
              <dd>{out.result.wyckoffs.join(' ')}</dd>
            </dl>
            <Sub>For experts: transformation matrix</Sub>
            <p>
              Rows give the new lattice vectors as combinations of the old ones (a_new = M a_old). Origin
              shift: {r.originShift.map(f).join(', ')}.
            </p>
            <table aria-label="Transformation matrix from the input cell to the standardized primitive cell">
              <tbody>
                {r.matrix.map((row, i) => (
                  <tr key={i}>
                    {row.map((x, j) => (
                      <td key={j}>{f(x)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
