import { unfilled } from '../../../lib/vasp/builder';
import type { Issue, Severity, VaspVersion } from '../../../lib/vasp/validate';
import { countsOf, issuesOf, useBuilder } from './store';
import { useMemo } from 'react';

const LABEL: Record<Severity, string> = { error: 'Errors', warn: 'Warnings', info: 'Notes' };

export default function CheckStep() {
  const s = useBuilder();
  const issues = useMemo(() => issuesOf(s), [s]);
  const counts = countsOf(issues);
  const open = unfilled(s.entries);
  const summary = `${counts.error} error${counts.error === 1 ? '' : 's'}, ${counts.warn} warning${counts.warn === 1 ? '' : 's'}, ${counts.info} note${counts.info === 1 ? '' : 's'}${open.length ? `, ${open.length} unfilled value${open.length === 1 ? '' : 's'}` : ''}`;
  const blocked = counts.error > 0 || open.length > 0 || !s.structure;

  return (
    <section aria-labelledby="ib-s4">
      <h2 id="ib-s4">4. Check</h2>
      <div className="ib-field">
        <label htmlFor="ib-version">VASP version</label>
        <select
          id="ib-version"
          value={s.version}
          onChange={(e) => s.set('version', e.target.value as VaspVersion)}
        >
          <option value="5.4">5.4</option>
          <option value="6.3">6.3</option>
          <option value="6.4">6.4</option>
        </select>
      </div>
      <p className="ib-small">The checks include the k-point mesh from step 5 with its current setting.</p>
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="ib-summary"
        data-testid="issue-summary"
      >
        {summary}
      </div>
      {!s.structure && <p className="ib-error">No structure yet. Add one in step 1.</p>}
      {open.length > 0 && (
        <div className="ib-issue ib-issue-error">
          <h3>Unfilled values</h3>
          <p>
            These values are still placeholders: {open.map((e) => e.name).join(', ')}. Replace them in step 3
            before you run VASP.
          </p>
        </div>
      )}
      {(['error', 'warn', 'info'] as const).map((sev) => {
        const list = issues.filter((i) => i.severity === sev);
        if (list.length === 0) return null;
        return (
          <div key={sev}>
            <h3>{LABEL[sev]}</h3>
            <ul className="ib-issues">
              {list.map((i, k) => (
                <IssueItem key={`${i.rule}-${k}`} issue={i} />
              ))}
            </ul>
          </div>
        );
      })}
      {blocked && (
        <label className="ib-ack">
          <input type="checkbox" checked={s.ack} onChange={(e) => s.set('ack', e.target.checked)} />I
          understand the errors or unfilled values above and still want to download
        </label>
      )}
    </section>
  );
}

function IssueItem({ issue }: { issue: Issue }) {
  const { entries, setEntries } = useBuilder();
  return (
    <li className={`ib-issue ib-issue-${issue.severity}`}>
      <p>
        <strong>
          {issue.rule}: {issue.title}
        </strong>
      </p>
      <p>{issue.why}</p>
      {issue.whyDetail && (
        <details>
          <summary>More detail</summary>
          <p>{issue.whyDetail}</p>
        </details>
      )}
      <p className="ib-small">
        Sources:{' '}
        {issue.source.map((id, i) => (
          <span key={id}>
            {i > 0 && ', '}
            <a href={`/references/#${id}`}>{id}</a>
          </span>
        ))}
        {issue.handbook ? `; handbook: ${issue.handbook}` : ''}; VASP: {issue.vasp}
      </p>
      {issue.fix && (
        <button type="button" onClick={() => setEntries(issue.fix!.apply(entries))}>
          {issue.fix.label}
        </button>
      )}
    </li>
  );
}
