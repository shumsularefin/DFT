import { PRESETS, encutSuggestion, presetOf, useBuilder } from './store';
import { speciesOrder } from '../../../lib/vasp/builder';
import type { SystemType } from '../../../lib/vasp/validate';

const SYSTEMS: SystemType[] = ['metal', 'semiconductor', 'insulator', 'slab', 'molecule', 'unknown'];

export default function TaskStep() {
  const s = useBuilder();
  const preset = presetOf(s.presetId);
  const variant = preset.variants.find((v) => v.id === s.variantId) ?? preset.variants[0]!;
  const sug = encutSuggestion(s);

  const setEnmax = (v: string) => {
    s.set('enmax', v);
    // fill an ENCUT that is still a placeholder
    const st = useBuilder.getState();
    const e = st.entries.find((x) => x.name === 'ENCUT');
    const sg = encutSuggestion(st);
    if (sg && e && e.value.trim().startsWith('<')) st.setEntry('ENCUT', String(sg.value));
  };

  return (
    <section aria-labelledby="ib-s2">
      <h2 id="ib-s2">2. Task</h2>
      <div className="ib-field">
        <label htmlFor="ib-preset">What do you want to calculate?</label>
        <select id="ib-preset" value={s.presetId} onChange={(e) => s.choosePreset(e.target.value)}>
          {PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </div>
      <p>{preset.summary}</p>
      {preset.variants.length > 1 && (
        <div className="ib-field">
          <label htmlFor="ib-variant">Variant</label>
          <select
            id="ib-variant"
            value={variant.id}
            onChange={(e) => s.choosePreset(preset.id, e.target.value)}
          >
            {preset.variants.map((v) => (
              <option key={v.id} value={v.id}>
                {v.title}
              </option>
            ))}
          </select>
        </div>
      )}
      {variant.requires.length > 0 && (
        <>
          <h3>Before you run it you need</h3>
          <ul>
            {variant.requires.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {variant.note && <p>{variant.note}</p>}
      {preset.notes.length > 0 && (
        <ul>
          {preset.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      {preset.fragment && (
        <p className="ib-note">
          This preset is a fragment to merge into a full INCAR. Start from a relaxation or static preset and
          add the tags in Settings.
        </p>
      )}
      <div className="ib-field">
        <label htmlFor="ib-system">What kind of system is it?</label>
        <select
          id="ib-system"
          value={s.systemType}
          onChange={(e) => s.set('systemType', e.target.value as SystemType)}
        >
          {SYSTEMS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <p className="ib-small">
          The checker uses this for smearing and cell-relaxation advice. Choose unknown if you are not sure.
        </p>
      </div>
      <div className="ib-field">
        <label htmlFor="ib-enmax">ENMAX in eV (largest value over your POTCARs)</label>
        <input
          id="ib-enmax"
          inputMode="decimal"
          value={s.enmax}
          onChange={(e) => setEnmax(e.target.value)}
          aria-describedby="ib-enmax-help"
        />
        <p id="ib-enmax-help" className="ib-small">
          Get it on your own machine with <code>grep ENMAX POTCAR</code>. This site never needs POTCAR
          content, so type only the number.
        </p>
      </div>
      {s.presetId !== 'relax' && s.presetId !== 'elastic' && (
        <div className="ib-field">
          <label htmlFor="ib-relaxencut">ENCUT you used in the relaxation (optional)</label>
          <input
            id="ib-relaxencut"
            inputMode="decimal"
            value={s.relaxEncut}
            onChange={(e) => s.set('relaxEncut', e.target.value)}
          />
        </div>
      )}
      {sug && (
        <p role="status" className="ib-note">
          Suggested ENCUT: <strong>{sug.value} eV</strong>. {sug.reason}{' '}
          <button type="button" onClick={() => s.setEntry('ENCUT', String(sug.value))}>
            Use {sug.value} eV
          </button>
        </p>
      )}
      {s.structure && (
        <details>
          <summary>Optional: valence electrons per species (ZVAL), for the NBANDS check</summary>
          <p className="ib-small">
            Read with <code>grep ZVAL POTCAR</code> on your machine. Leave blank to skip the check.
          </p>
          {speciesOrder(s.structure).map((sp) => (
            <div className="ib-field" key={sp}>
              <label htmlFor={`ib-zval-${sp}`}>ZVAL for {sp}</label>
              <input
                id={`ib-zval-${sp}`}
                inputMode="decimal"
                value={s.zval[sp] ?? ''}
                onChange={(e) => s.set('zval', { ...s.zval, [sp]: e.target.value })}
              />
            </div>
          ))}
        </details>
      )}
    </section>
  );
}
