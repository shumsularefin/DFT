import { useId, type ReactNode } from 'react';
import Badge from '../ui/Badge';
import type { BadgeVariant } from '../../lib/badges';
import './LabShell.css';

export interface Readout {
  label: string;
  value: string | number;
  unit?: string;
}

interface Props {
  title: string;
  /** One sentence: what the reader can do here. */
  goal: string;
  badge: Extract<BadgeVariant, 'illustrative' | 'toy-model' | 'computed'>;
  /** Controls area (sliders, toggles). */
  controls?: ReactNode;
  /** The view: a plot, a canvas, a Lazy3D. */
  children: ReactNode;
  readouts?: Readout[];
  /** "What to notice" text. */
  notice: string;
  /** A text description of what the view shows, for readers who cannot see it. */
  description: string;
  onReset?: () => void;
  state?: 'ready' | 'loading' | 'error';
  errorMessage?: string;
  headingLevel?: 2 | 3;
}

/** Frame for every interactive lab: same layout, honest badge, text description, reset, and error states. */
export default function LabShell({
  title,
  goal,
  badge,
  controls,
  children,
  readouts = [],
  notice,
  description,
  onReset,
  state = 'ready',
  errorMessage = 'This lab could not start. Reload the page to try again.',
  headingLevel = 2,
}: Props) {
  const id = useId();
  const Heading = `h${headingLevel}` as 'h2' | 'h3';
  return (
    <section className="lab" aria-labelledby={`${id}-title`}>
      <header className="lab-head">
        <Heading id={`${id}-title`} className="lab-title">
          {title}
        </Heading>
        <Badge variant={badge} />
      </header>
      <p className="lab-goal">{goal}</p>
      {state === 'error' ? (
        <p className="lab-error" role="alert">
          {errorMessage}
        </p>
      ) : state === 'loading' ? (
        <p className="lab-loading" role="status">
          Loading...
        </p>
      ) : (
        <div className="lab-body">
          {controls && (
            <div className="lab-controls" role="group" aria-label="Controls">
              {controls}
            </div>
          )}
          <div className="lab-view" role="group" aria-label={`${title} view`} aria-describedby={`${id}-desc`}>
            {children}
          </div>
          {readouts.length > 0 && (
            <dl className="lab-readouts" aria-live="polite">
              {readouts.map((r) => (
                <div key={r.label} className="lab-readout">
                  <dt>{r.label}</dt>
                  <dd>
                    {r.value}
                    {r.unit ? ` ${r.unit}` : ''}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {onReset && (
            <p>
              <button type="button" className="btn" onClick={onReset}>
                Reset
              </button>
            </p>
          )}
        </div>
      )}
      <p id={`${id}-desc`} className="lab-description">
        <strong>Text description. </strong>
        {description}
      </p>
      <aside className="lab-notice" aria-label="What to notice">
        <p className="lab-notice-title">What to notice</p>
        <p>{notice}</p>
      </aside>
    </section>
  );
}
