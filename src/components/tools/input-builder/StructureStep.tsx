import { useRef } from 'react';
import { latticeParameters, cellVolume, guessCellType } from '../../../lib/crystal/lattice';
import { reducedFormula, speciesCounts } from '../../../lib/crystal/structure';
import { takeHandoff } from '../../../lib/handoff';
import { MAX_POSCAR_BYTES, useBuilder } from './store';
import { useEffect } from 'react';

export default function StructureStep() {
  const { poscarText, structure, parseError, parseWarnings, loadPoscar, setStructure } = useBuilder();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = takeHandoff(['structure']);
    if (h && h.kind === 'structure') setStructure(h.structure, h.label);
  }, [setStructure]);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > MAX_POSCAR_BYTES) {
      useBuilder.setState({
        parseError: 'This file is larger than 25 MB, which is more than the builder accepts.',
        structure: null,
      });
      return;
    }
    loadPoscar(await f.text());
  };

  const lp = structure ? latticeParameters(structure.lattice) : null;
  const f = (x: number, d = 4) => x.toFixed(d);
  return (
    <section aria-labelledby="ib-s1">
      <h2 id="ib-s1">1. Structure</h2>
      <p>
        Paste a POSCAR or CONTCAR, or choose a file. It is read in this page and never uploaded. Files up to
        25 MB are accepted.
      </p>
      <div
        className="ib-drop"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFile(e.dataTransfer.files[0]);
        }}
      >
        <label htmlFor="ib-poscar">POSCAR text</label>
        <textarea
          id="ib-poscar"
          rows={10}
          spellCheck={false}
          value={poscarText}
          onChange={(e) => loadPoscar(e.target.value)}
          aria-describedby={parseError ? 'ib-poscar-err' : undefined}
          aria-invalid={parseError ? true : undefined}
        />
        <label htmlFor="ib-file">Or choose a POSCAR / CONTCAR file</label>
        <input id="ib-file" ref={fileRef} type="file" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {parseError && poscarText.trim() !== '' && (
        <p id="ib-poscar-err" role="alert" className="ib-error">
          {parseError}
        </p>
      )}
      {parseWarnings.map((w) => (
        <p key={w} className="ib-note">
          {w}
        </p>
      ))}
      {structure && lp && (
        <div aria-live="polite">
          <h3>What was read</h3>
          <dl className="ib-facts">
            <dt>Formula</dt>
            <dd>{reducedFormula(structure)}</dd>
            <dt>Atoms</dt>
            <dd>{structure.species.length}</dd>
            <dt>Volume</dt>
            <dd>{f(cellVolume(structure.lattice), 3)} &Aring;&sup3;</dd>
            <dt>Lattice</dt>
            <dd>
              a = {f(lp.a)}, b = {f(lp.b)}, c = {f(lp.c)} &Aring;; &alpha; = {f(lp.alpha, 2)}&deg;, &beta; ={' '}
              {f(lp.beta, 2)}&deg;, &gamma; = {f(lp.gamma, 2)}&deg;
            </dd>
            <dt>Cell shape</dt>
            <dd>
              {guessCellType(structure.lattice)} (the shape of this cell as written, not the full crystal
              symmetry)
            </dd>
          </dl>
          <p className="ib-warn" role="note">
            <strong>POSCAR order is the order for MAGMOM and LDAU values.</strong> Species in order:{' '}
            {speciesCounts(structure)
              .map((s) => `${s.symbol} (${s.count})`)
              .join(', ')}
            .
          </p>
        </div>
      )}
    </section>
  );
}
