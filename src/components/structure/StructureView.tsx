// StructureView (M12.6): one component that shows any Structure. SVG first, 3D on demand (the Scene island), a site table
// as the keyboard path, a measure mode (distance, angle, dihedral) and a text summary. Wherever a POSCAR appears, use this.
import { useMemo, useState } from 'react';
import Scene from '../scene/Scene';
import { latticeParameters, cellVolume } from '../../lib/crystal/lattice';
import { angle, coordination, dihedral, distance } from '../../lib/crystal/measure';
import { reducedFormula } from '../../lib/crystal/structure';
import type { Structure } from '../../lib/crystal/types';
import type { SceneSpec } from '../../lib/scene/spec';
import { expandRepeats } from '../../lib/vasp/incar';
import './structure.css';

interface Props {
  structure: Structure;
  /** Short name used in labels, for example "your POSCAR". */
  label?: string;
  /** A MAGMOM value (one number per atom, in POSCAR order); draws spin arrows when its length matches. */
  magmom?: string | undefined;
  /** Controlled selection (a site index) and its setter, for views linked to another panel. */
  selected?: number | null;
  onSelect?: (site: number | null) => void;
  /** Stable id used for element ids; defaults to "sv". */
  id?: string;
}

const MAX_ROWS = 400;
const f = (x: number, d = 4) => x.toFixed(d);

export default function StructureView({
  structure: s,
  label = 'the structure',
  magmom,
  selected,
  onSelect,
  id = 'sv',
}: Props) {
  const [inner, setInner] = useState<number | null>(null);
  const [measure, setMeasure] = useState(false);
  const [picks, setPicks] = useState<number[]>([]);
  const sel = selected !== undefined ? selected : inner;
  const select = (i: number | null) => {
    setInner(i);
    onSelect?.(i);
  };

  const lp = useMemo(() => latticeParameters(s.lattice), [s]);
  const formula = useMemo(() => reducedFormula(s), [s]);
  const spins = useMemo(() => {
    if (!magmom) return undefined;
    try {
      const v = expandRepeats(magmom);
      return v.length === s.species.length && v.some((x) => x !== 0) ? v : undefined;
    } catch {
      return undefined;
    }
  }, [magmom, s]);

  const highlight = measure ? picks : sel !== null ? [sel] : [];
  const spec = useMemo<SceneSpec>(
    () => ({
      id: `structure-${id}`,
      badge: 'computed',
      alt: `${formula}, ${s.species.length} atoms. Cell a = ${f(lp.a, 3)}, b = ${f(lp.b, 3)}, c = ${f(lp.c, 3)} Angstrom.${spins ? ' Arrows show the MAGMOM moments.' : ''}`,
      caption: `Geometry of ${label}, drawn from the file as read. Bonds use a covalent-radius rule (Heuristic).`,
      structure: s,
      show: { atoms: true, bonds: true, cell: true, labels: false },
      ...(spins ? { spins } : {}),
      ...(highlight.length ? { highlight } : {}),
      camera: 'iso',
    }),
    [s, id, formula, lp, label, spins, picks, sel, measure],
  );

  const choose = (i: number) => {
    if (!measure) {
      select(sel === i ? null : i);
      return;
    }
    setPicks((p) =>
      p.includes(i) ? p.filter((x) => x !== i) : p.length >= 4 ? [...p.slice(1), i] : [...p, i],
    );
  };

  const readout = useMemo(() => {
    const p = picks;
    const n = (i: number) => `${s.species[i]}${i + 1}`;
    if (p.length === 2)
      return `Distance ${n(p[0]!)} to ${n(p[1]!)}: ${f(distance(s, p[0]!, p[1]!))} Å (nearest periodic image).`;
    if (p.length === 3)
      return `Angle ${n(p[0]!)}-${n(p[1]!)}-${n(p[2]!)}: ${f(angle(s, p[0]!, p[1]!, p[2]!), 2)} degrees at ${n(p[1]!)}.`;
    if (p.length === 4)
      return `Dihedral ${p.map(n).join('-')}: ${f(dihedral(s, p[0]!, p[1]!, p[2]!, p[3]!), 2)} degrees.`;
    if (p.length === 1)
      return `Picked ${n(p[0]!)}. Pick a second site for a distance, a third for an angle, a fourth for a dihedral.`;
    return 'Pick two sites for a distance, three for an angle, four for a dihedral.';
  }, [picks, s]);

  const coord = !measure && sel !== null ? coordination(s, sel) : null;
  const rows = s.species.slice(0, MAX_ROWS);

  return (
    <div className="sv" data-structure-view>
      <p className="sv-summary" data-testid={`${id}-summary`}>
        <strong>{formula}</strong>, {s.species.length} atom{s.species.length === 1 ? '' : 's'}. a ={' '}
        {f(lp.a, 3)}, b = {f(lp.b, 3)}, c = {f(lp.c, 3)} Å; α = {f(lp.alpha, 2)}°, β = {f(lp.beta, 2)}°, γ ={' '}
        {f(lp.gamma, 2)}°; volume {f(cellVolume(s.lattice), 2)} Å³.
      </p>
      <Scene spec={spec} />
      <div className="sv-controls">
        <label className="sv-check">
          <input
            type="checkbox"
            checked={measure}
            onChange={(e) => {
              setMeasure(e.target.checked);
              setPicks([]);
            }}
          />
          Measure mode
        </label>
        {measure && (
          <button type="button" onClick={() => setPicks([])}>
            Clear picks
          </button>
        )}
      </div>
      <p className="sv-readout" role="status" data-testid={`${id}-readout`}>
        {measure
          ? readout
          : coord
            ? `${s.species[sel!]}${sel! + 1}: ${coord.count} neighbour${coord.count === 1 ? '' : 's'} by the bond rule${coord.count ? `, nearest ${f(coord.distances[0]!)} Å` : ''} (Heuristic).`
            : sel !== null
              ? ''
              : 'Select a site in the table to highlight it.'}
      </p>
      <div className="sv-table-wrap" role="region" aria-label={`Sites of ${label}`} tabIndex={0}>
        <table className="sv-table">
          <caption>
            Sites ({s.species.length}).{' '}
            {measure
              ? 'Press a site button to pick it for measuring.'
              : 'Press a site button to highlight it.'}
          </caption>
          <thead>
            <tr>
              <th scope="col">Site</th>
              <th scope="col">Element</th>
              <th scope="col">x</th>
              <th scope="col">y</th>
              <th scope="col">z</th>
              {spins && <th scope="col">MAGMOM</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((el, i) => {
              const on = measure ? picks.includes(i) : sel === i;
              return (
                <tr key={i} className={on ? 'is-sel' : undefined}>
                  <th scope="row">
                    <button
                      type="button"
                      id={`${id}-site-${i}`}
                      aria-pressed={on}
                      aria-label={`Site ${i + 1}, ${el}`}
                      onClick={() => choose(i)}
                    >
                      {i + 1}
                    </button>
                  </th>
                  <td>{el}</td>
                  {s.frac[i]!.map((x, k) => (
                    <td key={k}>{f(x, 5)}</td>
                  ))}
                  {spins && <td>{spins[i]}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {s.species.length > MAX_ROWS && <p className="sv-note">Showing the first {MAX_ROWS} sites.</p>}
      </div>
    </div>
  );
}
