import { useEffect, useMemo, useRef, useState } from 'react';
import PeriodicTable from '../../ui/PeriodicTable';
import { cellOf } from '../../../lib/chem/periodic';
import { oxidationInfo } from '../../../lib/chem/oxidation';
import { evaluateCompound, type Check, type Composition } from '../../../lib/perovskite/checks';
import {
  DEFAULT_COMPOSITION,
  applyPolicy,
  hasStates,
  isLanthanide,
  newOccupant,
  normalizeOccupant,
  statesFor,
  type SiteKey,
} from '../../../lib/perovskite/defaults';
import { FORMULAS, explainMu, explainT, explainTau } from '../../../lib/perovskite/explain';
import { BARTEL_THRESHOLD } from '../../../lib/perovskite/factors';
import { geometryName, romanCn, sourceLine, spinName } from '../../../lib/perovskite/format';
import { coordinations, geometries, spins, type Geometry, type Spin } from '../../../lib/perovskite/shannon';
import { mixSite, type Occupant } from '../../../lib/perovskite/sites';
import { decodeState, encodeState, type Policy } from '../../../lib/perovskite/urlState';
import { copyText, useLevel } from '../input-builder/hooks';
import './tolerance.css';

const TITLES: Record<SiteKey, string> = {
  A: 'A site (the large cation)',
  B: 'B site (the small cation)',
  X: 'X site (the anion)',
};
const SEVERITY_WORD = { error: 'Error', warning: 'Warning', info: 'Note' } as const;

const SECOND = { A: ['Sr', 'Ba'], B: ['Zr', 'Ti'] } as const;

type Picker = { site: SiteKey; index: number } | null;

function oxLabel(el: string, ox: number): string {
  const info = oxidationInfo(el, ox);
  const sign = ox > 0 ? `+${ox}` : `${ox}`;
  const tag =
    info.class === 'common'
      ? 'common'
      : info.class === 'known-rare'
        ? 'rare in ICSD counts'
        : 'no ICSD entries';
  return `${sign} (${tag})`;
}

export default function ToleranceTool() {
  const level = useLevel();
  const [comp, setComp] = useState<Composition>(DEFAULT_COMPOSITION);
  const [policy, setPolicy] = useState<Policy>(12);
  const [picker, setPicker] = useState<Picker>(null);
  const [amount, setAmount] = useState<Record<'A' | 'B', string>>({ A: '0.5', B: '0.5' });
  const [copied, setCopied] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  // Read a shared link on load and when the fragment is changed by hand; a malformed fragment is ignored.
  useEffect(() => {
    const read = () => {
      const s = decodeState(window.location.hash);
      if (!s) return;
      setComp(s.composition);
      setPolicy(s.policy);
      const next = { A: '0.5', B: '0.5' };
      for (const k of ['A', 'B'] as const) {
        const second = s.composition[k][1];
        if (second) next[k] = String(second.fraction);
      }
      setAmount(next);
    };
    read();
    setHydrated(true);
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const effective = useMemo(() => applyPolicy(comp, policy), [comp, policy]);
  const evaluation = useMemo(() => evaluateCompound(effective), [effective]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.history.replaceState(null, '', `#${encodeState({ composition: comp, policy })}`);
    } catch {
      /* a blocked history API only loses the shareable fragment */
    }
  }, [comp, policy, hydrated]);

  const setOccupant = (site: SiteKey, index: number, patch: Partial<Occupant>) =>
    setComp((c) => ({
      ...c,
      [site]: c[site].map((o, i) => (i === index ? normalizeOccupant(site, { ...o, ...patch }, policy) : o)),
    }));

  const setSecond = (site: 'A' | 'B', on: boolean) => {
    setComp((c) => {
      const first = c[site][0]!;
      if (!on) return { ...c, [site]: [{ ...first, fraction: 1 }] };
      const x = Number(amount[site]);
      const f = x > 0 && x < 1 ? x : 0.5;
      const second = newOccupant(site, SECOND[site][first.el === SECOND[site][0] ? 1 : 0]!, f, policy);
      return { ...c, [site]: [{ ...first, fraction: 1 - f }, second] };
    });
  };

  const setAmountText = (site: 'A' | 'B', text: string) => {
    setAmount((a) => ({ ...a, [site]: text }));
    const x = Number(text);
    setComp((c) => {
      const [first, second] = c[site];
      if (!first || !second) return c;
      const valid = text.trim() !== '' && x > 0 && x < 1;
      return {
        ...c,
        [site]: [
          { ...first, fraction: valid ? 1 - x : 0 },
          { ...second, fraction: valid ? x : 0 },
        ],
      };
    });
  };

  const pick = (symbol: string) => {
    if (!picker) return;
    const { site, index } = picker;
    setComp((c) => ({
      ...c,
      [site]: c[site].map((o, i) => (i === index ? newOccupant(site, symbol, o.fraction, policy) : o)),
    }));
    setPicker(null);
    setTimeout(() => buttons.current.get(`${site}${index}`)?.focus(), 0);
  };

  const hasLnA = comp.A.some((o) => isLanthanide(o.el));

  const copy = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${encodeState({ composition: comp, policy })}`;
    setCopied(
      (await copyText(url)) ? 'Link copied.' : 'Could not copy. The address bar already holds the link.',
    );
  };

  return (
    <div className="tf">
      <p className="tf-note">
        Radii are Shannon (1976) effective ionic radii. Every number below comes from a table entry you can
        see.
      </p>

      <div className="tf-sites">
        {(['A', 'B', 'X'] as const).map((site) => {
          const mixed = mixSite(effective[site]);
          return (
            <section key={site} className="tf-site" aria-labelledby={`tf-h-${site}`}>
              <h2 id={`tf-h-${site}`}>{TITLES[site]}</h2>
              {comp[site].map((o, i) => (
                <OccupantRow
                  key={i}
                  site={site}
                  index={i}
                  occ={o}
                  eff={effective[site][i]!}
                  policy={policy}
                  buttonRef={(el) => {
                    if (el) buttons.current.set(`${site}${i}`, el);
                    else buttons.current.delete(`${site}${i}`);
                  }}
                  onChoose={() => setPicker({ site, index: i })}
                  onChange={(patch) => setOccupant(site, i, patch)}
                  amount={i === 1 && site !== 'X' ? amount[site] : undefined}
                  onAmount={(t) => site !== 'X' && setAmountText(site, t)}
                  onRemove={i === 1 && site !== 'X' ? () => setSecond(site, false) : undefined}
                />
              ))}
              {site !== 'X' && comp[site].length === 1 && (
                <button type="button" className="tf-btn" onClick={() => setSecond(site, true)}>
                  Add second occupant to the {site} site
                </button>
              )}
              <div className="tf-radius" data-testid={`radius-${site}`}>
                {mixed.ok ? (
                  <>
                    <p>
                      <strong>
                        Radius used: {mixed.radius.toFixed(4)} Angstrom
                        {mixed.parts.length > 1 ? ' (linear mixing convention)' : ''}
                      </strong>
                    </p>
                    <ul>
                      {mixed.parts.map((p, i) => (
                        <li key={i}>
                          {mixed.parts.length > 1 ? `${p.occupant.fraction} x ` : ''}
                          {sourceLine(p.entry)}
                        </li>
                      ))}
                    </ul>
                    {mixed.parts.length > 1 && (
                      <p className="tf-small">
                        Linear mixing is a convention: the radius and the oxidation state are the
                        occupancy-weighted means. It is not a result from the tolerance-factor papers (Q-016).
                      </p>
                    )}
                  </>
                ) : (
                  <p className="tf-problem">
                    <strong>No radius yet.</strong> {mixed.reason}
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {hasLnA && (
        <div className="tf-policy">
          <label htmlFor="tf-policy">A-site coordination policy for lanthanides</label>
          <select id="tf-policy" value={policy} onChange={(e) => setPolicy(Number(e.target.value) as Policy)}>
            <option value={12}>CN 12 where Shannon lists it, otherwise no radius</option>
            <option value={9}>CN 9 for every lanthanide</option>
            <option value={8}>CN 8 for every lanthanide</option>
          </select>
          <p className="tf-small">
            Shannon lists coordination 12 for Ln3+ only for La, Ce, Nd and Sm, while CN 9 and CN 8 exist for
            all of La to Lu. Nothing is extrapolated: pick a policy and the radius comes from that table row
            (D-028).
          </p>
        </div>
      )}

      {picker && (
        <div
          className="tf-picker"
          role="region"
          aria-label={`Element picker for the ${picker.site} site`}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            const { site, index } = picker;
            setPicker(null);
            setTimeout(() => buttons.current.get(`${site}${index}`)?.focus(), 0);
          }}
        >
          <div className="tf-picker-head">
            <h3>Pick an element for the {picker.site} site</h3>
            <button
              type="button"
              className="tf-btn"
              onClick={() => {
                const { site, index } = picker;
                setPicker(null);
                setTimeout(() => buttons.current.get(`${site}${index}`)?.focus(), 0);
              }}
            >
              Cancel
            </button>
          </div>
          <PeriodicTable
            label={`Periodic table for the ${picker.site} site`}
            selected={comp[picker.site][picker.index]?.el ?? null}
            onSelect={pick}
            isDisabled={(s) => !hasStates(picker.site, s)}
            autoFocus
          />
          <p className="tf-small">
            Struck-through elements have no {picker.site === 'X' ? 'anion' : 'cation'} entry in the Shannon
            table.
          </p>
        </div>
      )}

      <Results evaluation={evaluation} level={level} onCopy={copy} copied={copied} />
    </div>
  );
}

interface RowProps {
  site: SiteKey;
  index: number;
  occ: Occupant;
  eff: Occupant;
  policy: Policy;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onChoose: () => void;
  onChange: (patch: Partial<Occupant>) => void;
  amount?: string;
  onAmount: (text: string) => void;
  onRemove?: () => void;
}

function OccupantRow({
  site,
  index,
  occ,
  eff,
  buttonRef,
  onChoose,
  onChange,
  amount,
  onAmount,
  onRemove,
}: RowProps) {
  const id = `tf-${site}${index}`;
  const lnPolicy = site === 'A' && isLanthanide(occ.el);
  const cns = coordinations(eff.el, eff.ox);
  const spinOptions = spins(eff.el, eff.ox, eff.cn).filter((s): s is 'HS' | 'LS' => s !== null);
  const geoms = geometries(eff.el, eff.ox, eff.cn);
  const name = cellOf(occ.el)?.name ?? occ.el;
  const order = index === 0 ? (site === 'X' ? '' : 'first ') : 'second ';
  const who = `${site} site ${order}occupant`.replace('  ', ' ');
  return (
    <div className="tf-occ">
      <div className="tf-row">
        <button type="button" className="tf-btn tf-el" ref={buttonRef} onClick={onChoose}>
          <span className="sr-only">Element, {who}: </span>
          <b>{occ.el}</b> {name}
          <span className="sr-only">. Change element</span>
        </button>
        <div className="tf-field">
          <label htmlFor={`${id}-ox`}>Oxidation state, {who}</label>
          <select id={`${id}-ox`} value={occ.ox} onChange={(e) => onChange({ ox: Number(e.target.value) })}>
            {statesFor(site, occ.el).map((o) => (
              <option key={o} value={o}>
                {oxLabel(occ.el, o)}
              </option>
            ))}
          </select>
        </div>
        <div className="tf-field">
          <label htmlFor={`${id}-cn`}>Coordination number, {who}</label>
          <select
            id={`${id}-cn`}
            value={eff.cn}
            disabled={lnPolicy}
            onChange={(e) => onChange({ cn: Number(e.target.value) })}
          >
            {(cns.includes(eff.cn) ? cns : [eff.cn, ...cns]).map((c) => (
              <option key={c} value={c}>
                {c} ({romanCn(c)})
              </option>
            ))}
          </select>
          {lnPolicy && <span className="tf-small">Set by the lanthanide policy below.</span>}
        </div>
        {spinOptions.length > 1 && (
          <div className="tf-field">
            <label htmlFor={`${id}-spin`}>Spin state, {who}</label>
            <select
              id={`${id}-spin`}
              value={occ.spin ?? ''}
              onChange={(e) => onChange({ spin: (e.target.value || undefined) as Spin | undefined })}
            >
              <option value="">Choose a spin state</option>
              {spinOptions.map((s) => (
                <option key={s} value={s}>
                  {spinName(s)}
                </option>
              ))}
            </select>
          </div>
        )}
        {geoms.length > 1 && (
          <div className="tf-field">
            <label htmlFor={`${id}-geo`}>Geometry, {who}</label>
            <select
              id={`${id}-geo`}
              value={occ.geometry ?? ''}
              onChange={(e) => onChange({ geometry: (e.target.value || undefined) as Geometry | undefined })}
            >
              {geoms.map((g) => (
                <option key={g ?? 'std'} value={g ?? ''}>
                  {geometryName(g)}
                </option>
              ))}
            </select>
          </div>
        )}
        {amount !== undefined && (
          <div className="tf-field">
            <label htmlFor={`${id}-amt`}>Amount of the second occupant (between 0 and 1)</label>
            <input
              id={`${id}-amt`}
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => onAmount(e.target.value)}
            />
          </div>
        )}
        {onRemove && (
          <button type="button" className="tf-btn" onClick={onRemove}>
            Remove second occupant
          </button>
        )}
      </div>
    </div>
  );
}

function Results({
  evaluation,
  level,
  onCopy,
  copied,
}: {
  evaluation: ReturnType<typeof evaluateCompound>;
  level: ReturnType<typeof useLevel>;
  onCopy: () => void;
  copied: string;
}) {
  const checks: Check[] = evaluation.checks;
  return (
    <section className="tf-results" aria-labelledby="tf-results-h">
      <h2 id="tf-results-h">Results</h2>
      {evaluation.ok ? (
        <>
          <p className="sr-only" role="status">
            {`t ${evaluation.t.toFixed(4)}, mu ${evaluation.mu.toFixed(4)}${evaluation.tau.ok ? `, tau ${evaluation.tau.value.toFixed(3)}` : ', tau undefined'}`}
          </p>
          <div className="tf-cards">
            <article className="tf-card" data-testid="card-t">
              <h3>Goldschmidt tolerance factor t</h3>
              <p className="tf-value" data-testid="value-t">
                {evaluation.t.toFixed(4)}
              </p>
              <p className="tf-tag">Heuristic</p>
              <p>{explainT(evaluation.t, level)}</p>
              <details>
                <summary>Formula and inputs</summary>
                <p>
                  <code>{FORMULAS.t}</code>
                </p>
                <p>
                  rA = {evaluation.sites.A.radius.toFixed(4)}, rB = {evaluation.sites.B.radius.toFixed(4)}, rX
                  = {evaluation.sites.X.radius.toFixed(4)} Angstrom.
                </p>
              </details>
            </article>
            <article className="tf-card" data-testid="card-mu">
              <h3>Octahedral factor mu</h3>
              <p className="tf-value" data-testid="value-mu">
                {evaluation.mu.toFixed(4)}
              </p>
              <p className="tf-tag">Heuristic</p>
              <p>{explainMu(evaluation.mu, level)}</p>
              <details>
                <summary>Formula and inputs</summary>
                <p>
                  <code>{FORMULAS.mu}</code>
                </p>
                <p>
                  rB = {evaluation.sites.B.radius.toFixed(4)}, rX = {evaluation.sites.X.radius.toFixed(4)}{' '}
                  Angstrom.
                </p>
              </details>
            </article>
            <article className="tf-card" data-testid="card-tau">
              <h3>Bartel tolerance factor tau</h3>
              {evaluation.tau.ok ? (
                <>
                  <p className="tf-value" data-testid="value-tau">
                    {evaluation.tau.value.toFixed(3)}
                  </p>
                  <p className="tf-tag">Prediction, threshold {BARTEL_THRESHOLD}</p>
                  <p>{explainTau(evaluation.tau.value, evaluation.tau.predictsPerovskite, level)}</p>
                </>
              ) : (
                <>
                  <p className="tf-value" data-testid="value-tau">
                    undefined
                  </p>
                  <p>{evaluation.tau.reason}</p>
                </>
              )}
              <details>
                <summary>Formula and inputs</summary>
                <p>
                  <code>{FORMULAS.tau}</code>
                </p>
                <p>
                  nA = {evaluation.sites.A.oxidation}, rA = {evaluation.sites.A.radius.toFixed(4)}, rB ={' '}
                  {evaluation.sites.B.radius.toFixed(4)}, rX = {evaluation.sites.X.radius.toFixed(4)}{' '}
                  Angstrom.
                </p>
                {evaluation.tau.ok && <p className="tf-small">{evaluation.tau.confirmation}.</p>}
              </details>
            </article>
          </div>
        </>
      ) : (
        <div className="tf-problem" data-testid="result-missing">
          <p>
            <strong>No factors computed.</strong> {evaluation.reason}
          </p>
          {(() => {
            const failed = evaluation.sites[evaluation.site];
            return failed && !failed.ok && failed.available && failed.available.length > 0 ? (
              <details>
                <summary>Table entries that do exist for this ion</summary>
                <ul>
                  {failed.available.slice(0, 40).map((e, i) => (
                    <li key={i}>{sourceLine(e)}</li>
                  ))}
                </ul>
              </details>
            ) : null;
          })()}
        </div>
      )}

      <h3>Checks and warnings</h3>
      {checks.length === 0 ? (
        <p>No warnings for this composition. That does not mean it is stable.</p>
      ) : (
        <ul className="tf-checks" data-testid="checks">
          {checks.map((c) => (
            <li key={c.id} data-severity={c.severity} data-check={c.id}>
              <strong>{SEVERITY_WORD[c.severity]}:</strong> {c.message}{' '}
              <span className="tf-small">(Rule of thumb{c.source ? `, ${c.source}` : ''})</span>
            </li>
          ))}
        </ul>
      )}

      <p className="tf-honesty">
        Tolerance factors are rules of thumb. They do not guarantee that a compound exists or is stable.
      </p>
      <div className="tf-row">
        <button type="button" className="tf-btn" onClick={onCopy}>
          Copy link to this composition
        </button>
        <span role="status">{copied}</span>
      </div>
    </section>
  );
}
