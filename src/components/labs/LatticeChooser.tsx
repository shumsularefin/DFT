import { useId, useState } from 'react';
import { parsePoscar } from '../../lib/crystal/poscar';
import type { Mat3 } from '../../lib/crystal/types';
import { CELLS } from './cells';

interface Props {
  cellId: string;
  custom: Mat3 | null;
  onChange: (cellId: string, custom: Mat3 | null) => void;
}

/** Cell chooser shared by the labs: four standard cells, or the lattice of a pasted POSCAR (parsed in the browser). */
export default function LatticeChooser({ cellId, custom, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const apply = () => {
    try {
      onChange('custom', parsePoscar(text).structure.lattice);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this POSCAR.');
    }
  };
  return (
    <>
      <div className="orbitals-select">
        <label htmlFor={`${id}-cell`} className="slider-label">
          Cell
        </label>
        <select
          id={`${id}-cell`}
          value={cellId}
          onChange={(e) => onChange(e.target.value, custom)}
          className="orbitals-select-input"
        >
          {Object.entries(CELLS).map(([k, c]) => (
            <option key={k} value={k}>
              {c.label}
            </option>
          ))}
          {custom && <option value="custom">Your POSCAR</option>}
        </select>
      </div>
      <details>
        <summary>Use your own POSCAR cell</summary>
        <div className="cv-field">
          <label htmlFor={`${id}-poscar`}>
            Paste a POSCAR (only the lattice is used, nothing is uploaded)
          </label>
          <textarea id={`${id}-poscar`} rows={8} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button type="button" onClick={apply}>
          Use this cell
        </button>
        {error && (
          <p className="cv-note" role="alert">
            {error}
          </p>
        )}
      </details>
    </>
  );
}

/** The lattice of the chosen cell. */
export const latticeOf = (cellId: string, custom: Mat3 | null): Mat3 =>
  cellId === 'custom' && custom ? custom : CELLS[cellId === 'custom' ? 'fcc' : cellId]!.lattice;
