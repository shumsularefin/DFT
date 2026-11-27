import { useMemo, useState } from 'react';
import { speciesOrder } from '../../../lib/vasp/builder';
import { MP_MAGMOM_NOTES, MP_U_NOTES, mpLdau, mpMagmom } from '../../../lib/vasp/mpDefaults';
import { GROUPS, TAGS, tagByName } from './TagCard';
import { useBuilder } from './store';

export default function SettingsStep() {
  const s = useBuilder();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('');
  const [toAdd, setToAdd] = useState('');
  const [custom, setCustom] = useState('');
  const customName = custom.trim().toUpperCase();
  const customOk = /^[A-Z][A-Z0-9_]{0,31}$/.test(customName) && !s.entries.some((e) => e.name === customName);

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
      <div className="ib-row">
        <div className="ib-field">
          <label htmlFor="ib-custom">Or type a tag the database does not list</label>
          <input
            id="ib-custom"
            value={custom}
            spellCheck={false}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="TAG"
          />
        </div>
        <button
          type="button"
          disabled={!customOk}
          onClick={() => {
            s.setEntry(customName, '<enter a value>');
            s.set('selectedTag', customName);
            setCustom('');
          }}
        >
          Add this tag
        </button>
      </div>
      <p className="ib-small">
        A tag that is not in the database has no explanation or rule check here. Look it up in the VASP wiki
        before you run.
      </p>

      {s.structure && hasMag && (
        <fieldset className="ib-fieldset">
          <legend>MAGMOM helper: one starting moment per species</legend>
          <p className="ib-small">Species order is the POSCAR order: {order.join(', ')}.</p>
          <p>
            <button
              type="button"
              onClick={() => {
                const m = mpMagmom(order);
                s.set('magmom', Object.fromEntries(order.map((sp) => [sp, m[sp]!.toFixed(1)])));
              }}
            >
              Fill Materials Project starting moments
            </button>
          </p>
          <SuggestionNotes notes={MP_MAGMOM_NOTES} />
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
          <MpLdauButton order={order} />
          <SuggestionNotes notes={MP_U_NOTES} />
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

/** Fills the rows with the Materials Project values when O or F is present; says why not otherwise (D-111). */
function MpLdauButton({ order }: { order: string[] }) {
  const s = useBuilder();
  const mp = mpLdau(order);
  const [msg, setMsg] = useState('');
  return (
    <>
      <p>
        <button
          type="button"
          onClick={() => {
            if (!mp.applies) {
              setMsg(
                'The Materials Project uses +U only in oxides and fluorides; this structure has neither O nor F, so no value was filled.',
              );
              return;
            }
            s.set('ldau', mp.rows);
            setMsg(
              mp.withU.length
                ? `Filled U for ${mp.withU.join(', ')}; the other species get LDAUL = -1 and U = 0. Press Write to put them in the INCAR.`
                : 'No species here is in the Materials Project U table (Co, Cr, Fe, Mn, Mo, Ni, V, W), so every U is 0.',
            );
          }}
        >
          Fill Materials Project U values
        </button>
      </p>
      {msg && (
        <p className="ib-small" role="status">
          {msg}
        </p>
      )}
    </>
  );
}

function SuggestionNotes({ notes }: { notes: readonly { text: string; source: string }[] }) {
  return (
    <details>
      <summary>Where these values come from</summary>
      <ul className="ib-small">
        {notes.map((n) => (
          <li key={n.text}>
            {n.text} ({n.source})
          </li>
        ))}
      </ul>
    </details>
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
