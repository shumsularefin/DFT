// "Show me" for an INCAR tag (M12.5): a picture of what the tag changes, behind a disclosure so nothing loads until asked.
// The mappings and plot code load on first open; the picture and its text alternative follow the value.
import { useEffect, useState } from 'react';
import type { Level } from '../../../lib/levels';
import type { Structure } from '../../../lib/crystal/types';
import type { TagFigure } from '../../../lib/vasp/tagVisual';
import { TAGS_WITH_VISUAL } from '../../../lib/vasp/tagVisualTags';
import QuestionFigure from '../../practice/QuestionFigure';
import '../../practice/practice.css';

interface Props {
  tag: string;
  /** The value of the tag in the INCAR being edited; empty shows the example value of the tag. */
  value?: string;
  level: Level;
  structure?: Structure | null | undefined;
  incar?: Readonly<Record<string, string>> | undefined;
}

export default function TagVisual({ tag, value = '', level, structure, incar }: Props) {
  const [open, setOpen] = useState(false);
  const [fig, setFig] = useState<TagFigure | null | undefined>(undefined);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void import('../../../lib/vasp/tagVisual').then((m) => {
      if (live) setFig(m.visualFor(tag, value, { structure, incar }));
    });
    return () => {
      live = false;
    };
  }, [open, tag, value, structure, incar]);
  if (!TAGS_WITH_VISUAL.includes(tag)) return null;
  return (
    <details
      className="tv"
      data-testid="tag-visual"
      onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}
    >
      <summary>Show me</summary>
      {open && fig === undefined && <p className="ib-small">Loading the picture.</p>}
      {open && fig === null && (
        <p className="ib-small" role="status">
          There is no picture for {tag} = {value || 'this value'}: the handbook data does not describe that
          value.
        </p>
      )}
      {open && fig && (
        <div aria-live="polite">
          <QuestionFigure key={`${tag}-${value}`} figure={{ ...fig, caption: fig.captions[level] }} />
        </div>
      )}
    </details>
  );
}
