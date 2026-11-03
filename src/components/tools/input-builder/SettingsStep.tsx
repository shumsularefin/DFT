import { useMemo, useState } from 'react';
import { speciesOrder } from '../../../lib/vasp/builder';
import { GROUPS, TAGS, tagByName } from './TagCard';
import { useBuilder } from './store';

export default function SettingsStep() {
  const s = useBuilder();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [toAdd, setToAdd] = useState('');

  const rows = useMemo(
    () =>
      s.entries.filter((e) => {
        const t = tagByName(e.name);
        if (group && t?.group !== group) return false;
        return query.trim() === '' || e.name.toLowerCase().includes(query.trim().toLowerCase());
      }),
    [s.entries, query, group],
  );
  const missing = TAGS.filter((t) => !s.entries.some((e) => e.name === t.name));
  const order = s.structure ? speciesOrder(s.structure) : [];
  const hasMag = s.entries.some((e) => e.name === 'MAGMOM');
  const hasLdau = s.entries.some((e) => e.name === 'LDAUL');

  return (
    <section aria-labelledby="ib-s3">
      <h2 id="ib-s3">3. Settings</h2>
      <p>
        Edit the INCAR below. Values in angle brackets, such as{' '}
        <code>&lt;1.3 x largest ENMAX in your POTCAR&gt;</code>, are placeholders you must replace.
      </p>
      <div className="ib-row">
        <div className="ib-field">
          <label htmlFor="ib-search">Search tags</label>
          <input id="ib-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="ib-field">
          <label htmlFor="ib-group">Group</label>
          <select id="ib-group" value={group} onChange={(e) => setGroup(e.target.value)}>
            <option value="">All groups</option>
            {GROUPS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>
      </div>
      <table className="ib-table">
        <caption className="sr-only">INCAR tags and values</caption>
        <thead>
          <tr>
            <th scope="col">Tag</th>
            <th scope="col">Value</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.name}>
              <th scope="row">{e.name}</th>
              <td>
                <input
                  aria-label={`Value of ${e.name}`}
                  value={e.value}
                  onChange={(ev) => s.setEntry(e.name, ev.target.value)}
                  onFocus={() => s.set('selectedTag', e.name)}
                  className={/^</.test(e.value.trim()) ? 'ib-placeholder' : undefined}
                />
              </td>
              <td className="ib-actions">
                <button
                  type="button"
                  onClick={() => s.set('selectedTag', e.name)}
                  aria-label={`Explain ${e.name}`}
                >
                  Explain
                </button>
                <button type="button" onClick={() => s.removeTag(e.name)} aria-label={`Remove ${e.name}`}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <p>No tags match.</p>}
      <div className="ib-row">
        <div className="ib-field">
          <label htmlFor="ib-add">Add a tag from the database</label>
          <select id="ib-add" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
            <option value="">Choose a tag</option>
            {missing.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          disabled={!toAdd}
          onClick={() => {
            s.setEntry(toAdd, '<enter a value>');
            s.set('selectedTag', toAdd);
            setToAdd('');
          }}
        >
          Add tag
        </button>
        <button type="button" onClick={s.resetToPreset}>
          Reset to preset
        </button>
      </div>

      {s.structure && hasMag && (
        <fieldset className="ib-fieldset">
          <legend>MAGMOM helper: one starting moment per species</legend>
          <p className="ib-small">Species order is the POSCAR order: {order.join(', ')}.</p>
          {order.map((sp) => (
            <div className="ib-field" key={sp}>
              <label htmlFor={`ib-mag-${sp}`}>Moment for {sp} (Bohr magnetons)</label>
              <input
                id={`ib-mag-${sp}`}
                inputMode="decimal"
                value={s.magmom[sp] ?? ''}
                onChange={(e) => s.set('magmom', { ...s.magmom, [sp]: e.target.value })}
              />
            </div>
          ))}
          <MagmomPreview />
        </fieldset>
      )}
      {s.structure && hasLdau && (
        <fieldset className="ib-fieldset">
          <legend>DFT+U helper: one row per species</legend>
          <p className="ib-small">
            LDAUL: 2 for d, 3 for f, -1 for none. U and J are in eV. One value per species in POSCAR order:{' '}
            {order.join(', ')}.
          </p>
          {order.map((sp) => {
            const row = s.ldau[sp] ?? { l: '', u: '', j: '' };
            const upd = (k: 'l' | 'u' | 'j', v: string) =>
              s.set('ldau', { ...s.ldau, [sp]: { ...row, [k]: v } });
            return (
              <div className="ib-row" key={sp}>
                <div className="ib-field">
                  <label htmlFor={`ib-l-${sp}`}>LDAUL for {sp}</label>
                  <input
                    id={`ib-l-${sp}`}
                    inputMode="numeric"
                    value={row.l}
                    onChange={(e) => upd('l', e.target.value)}
                  />
                </div>
                <div className="ib-field">
                  <label htmlFor={`ib-u-${sp}`}>U for {sp}</label>
                  <input
                    id={`ib-u-${sp}`}
                    inputMode="decimal"
                    value={row.u}
                    onChange={(e) => upd('u', e.target.value)}
                  />
                </div>
                <div className="ib-field">
                  <label htmlFor={`ib-j-${sp}`}>J for {sp}</label>
                  <input
                    id={`ib-j-${sp}`}
                    inputMode="decimal"
                    value={row.j}
                    onChange={(e) => upd('j', e.target.value)}
                  />
                </div>
              </div>
            );
          })}
          <button type="button" onClick={s.applyLdau}>
            Write LDAUL, LDAUU and LDAUJ
          </button>
        </fieldset>
      )}
    </section>
  );
}

function MagmomPreview() {
  const { structure, magmom, applyMagmom } = useBuilder();
  const text = useMemo(() => {
    if (!structure) return null;
    const vals = structure.species.map((sp) => magmom[sp]?.trim());
    if (vals.some((v) => !v)) return null;
    const out: string[] = [];
    for (let i = 0; i < vals.length;) {
      let j = i;
      while (j < vals.length && vals[j] === vals[i]) j++;
      out.push(j - i > 1 ? `${j - i}*${vals[i]}` : vals[i]!);
      i = j;
    }
    return out.join(' ');
  }, [structure, magmom]);
  return (
    <p>
      {text ? (
        <>
          <code>MAGMOM = {text}</code> ({structure?.species.length} values, one per atom){' '}
        </>
      ) : (
        'Fill every species to see the MAGMOM line. '
      )}
      <button type="button" disabled={!text} onClick={applyMagmom}>
        Write MAGMOM
      </button>
    </p>
  );
}
