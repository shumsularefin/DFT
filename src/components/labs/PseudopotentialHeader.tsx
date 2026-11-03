import { POTCAR_FIELDS } from '../../lib/vasp/annotate';
import './FileExplorer.css';

/** What the header of a POTCAR dataset contains. Structure only: no values and no dataset text. */
export default function PseudopotentialHeader() {
  return (
    <section className="fx-panel fx-potcar" aria-labelledby="potcar-panel-h">
      <h3 id="potcar-panel-h">Inside a POTCAR header (structure only)</h3>
      <p>
        A POTCAR is a licensed file, so this site never shows or hosts one. Its header lists these fields, in
        plain text, before the numerical data. You can read them on your own copy with <code>grep</code>.
      </p>
      <dl>
        {POTCAR_FIELDS.map((f) => (
          <div key={f.name}>
            <dt>{f.name}</dt>
            <dd>{f.meaning}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
