import tagsFile from '../../../data/vasp-tags.json';
import type { Level } from '../../../lib/levels';

export interface TagInfo {
  name: string;
  group: string;
  type: string;
  default: string;
  typical: string;
  vaspVersion: string;
  summary: { beginner: string; intermediate: string; pro?: string };
  why: string;
  breaks: string;
  related: string[];
  sources: string[];
  corrections?: { was: string; now: string }[];
  notes: string;
}
export const TAGS = tagsFile.tags as unknown as TagInfo[];
export const tagByName = (n: string): TagInfo | undefined => TAGS.find((t) => t.name === n);
export const GROUPS = [...new Set(TAGS.map((t) => t.group))].sort();

function summaryAt(t: TagInfo, level: Level): string {
  if (level === 'pro') return [t.summary.intermediate, t.summary.pro].filter(Boolean).join(' ');
  if (level === 'intermediate') return t.summary.intermediate;
  return t.summary.beginner;
}

/** Plain-language card for one INCAR tag at the current reading level. */
export default function TagCard({
  name,
  level,
  onSelect,
}: {
  name: string | null;
  level: Level;
  onSelect: (n: string) => void;
}) {
  const t = name ? tagByName(name) : undefined;
  if (!name)
    return (
      <aside className="ib-card" aria-label="Tag explanation">
        <p>
          Choose a tag with its Explain button to read what it does, why it has that value, and what breaks.
        </p>
      </aside>
    );
  if (!t)
    return (
      <aside className="ib-card" aria-label="Tag explanation">
        <h3>{name}</h3>
        <p>
          This tag is not in the handbook database, so there is no explanation here. Check the VASP wiki
          before you rely on it.
        </p>
      </aside>
    );
  return (
    <aside className="ib-card" aria-label={`Explanation of ${t.name}`}>
      <h3>{t.name}</h3>
      <p>{summaryAt(t, level)}</p>
      <dl>
        <dt>Why this value</dt>
        <dd>{t.why}</dd>
        <dt>Default</dt>
        <dd>{t.default}</dd>
        <dt>Typical</dt>
        <dd>{t.typical}</dd>
        <dt>What breaks</dt>
        <dd>{t.breaks}</dd>
        {t.corrections?.map((c, i) => (
          <div key={i}>
            <dt>Corrected in the handbook</dt>
            <dd>{c.now}</dd>
          </div>
        ))}
        {t.related.length > 0 && (
          <>
            <dt>Related tags</dt>
            <dd>
              {t.related.map((r) => (
                <button key={r} type="button" className="ib-chip" onClick={() => onSelect(r)}>
                  {r}
                </button>
              ))}
            </dd>
          </>
        )}
      </dl>
      <p className="ib-small">
        Handbook page: coming soon. Sources: {t.sources.join(', ')}. VASP version: {t.vaspVersion}. {t.notes}
      </p>
    </aside>
  );
}
