import { useEffect, useMemo, useState } from 'react';
import Badge from '../../ui/Badge';
import PeriodicTable from '../../ui/PeriodicTable';
import {
  coordinations,
  coordinationLabel,
  getRadius,
  ionLabel,
  oxidationStates,
  SHANNON_ENTRIES,
  spins,
  type Geometry,
  type RadiusKind,
  type Spin,
} from '../../../lib/perovskite/shannon';
import type { Occupant } from '../../../lib/perovskite/sites';
import { evaluatePerovskite, type SiteName } from '../../../lib/perovskite/checks';
import { TAU_STATUS, TAU_THRESHOLD } from '../../../lib/perovskite/factors';
import {
  decodeCompositionHash,
  defaultOccupant,
  encodeCompositionHash,
  hasLanthanide,
  LANTHANIDE_A_SYMBOLS,
  resolveLnCn,
  type CompositionState,
  type LnCnPolicy,
} from '../../../lib/perovskite/urlState';
import ToleranceMaps from './ToleranceMaps';
import './tolerance-factor.css';

const SHANNON_ELEMENTS = new Set(SHANNON_ENTRIES.map((e) => e.el));

const PRESETS: { id: string; label: string; state: CompositionState }[] = [
  {
    id: 'srtio3',
    label: 'SrTiO3',
    state: {
      A: [{ el: 'Sr', ox: 2, cn: 12, fraction: 1 }],
      B: [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
      kind: 'ionic',
      lnPolicy: 'cn12',
    },
  },
  {
    id: 'ndcuo3',
    label: 'NdCuO3 (Cu3+ LS)',
    state: {
      A: [{ el: 'Nd', ox: 3, cn: 12, fraction: 1 }],
      B: [{ el: 'Cu', ox: 3, cn: 6, spin: 'LS', fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
      kind: 'ionic',
      lnPolicy: 'cn12',
    },
  },
  {
    id: 'batio3',
    label: 'BaTiO3',
    state: {
      A: [{ el: 'Ba', ox: 2, cn: 12, fraction: 1 }],
      B: [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
      kind: 'ionic',
      lnPolicy: 'cn12',
    },
  },
  {
    id: 'laalo3',
    label: 'LaAlO3',
    state: {
      A: [{ el: 'La', ox: 3, cn: 12, fraction: 1 }],
      B: [{ el: 'Al', ox: 3, cn: 6, fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
      kind: 'ionic',
      lnPolicy: 'cn12',
    },
  },
  {
    id: 'srba',
    label: 'Sr0.5Ba0.5TiO3',
    state: {
      A: [
        { el: 'Sr', ox: 2, cn: 12, fraction: 0.5 },
        { el: 'Ba', ox: 2, cn: 12, fraction: 0.5 },
      ],
      B: [{ el: 'Ti', ox: 4, cn: 6, fraction: 1 }],
      X: [{ el: 'O', ox: -2, cn: 6, fraction: 1 }],
      kind: 'ionic',
      lnPolicy: 'cn12',
    },
  },
];

function spinWord(s: Spin | null): string {
  if (s === 'HS') return ', high spin';
  if (s === 'LS') return ', low spin';
  return '';
}

function sourceLine(occ: Occupant, kind: RadiusKind): string {
  const q: Parameters<typeof getRadius>[0] = { el: occ.el, ox: occ.ox, cn: occ.cn, kind };
  if (occ.spin) q.spin = occ.spin;
  if (occ.geometry) q.geometry = occ.geometry;
  const r = getRadius(q);
  if (!r.ok) return r.message;
  const e = r.entry;
  return `Shannon 1976, ${ionLabel(e.el, occ.ox)}, CN ${coordinationLabel(e.cn, e.geometry)}${spinWord(e.spin)}, ${kind} radius ${r.value.toFixed(3)} A`;
}

export default function ToleranceFactorTool() {
  const [state, setState] = useState<CompositionState>(PRESETS[0]!.state);
  const [pickerTarget, setPickerTarget] = useState<{ site: SiteName; index: number } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const decoded = decodeCompositionHash(window.location.hash);
    if (decoded) setState(decoded);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextHash = encodeCompositionHash(state);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, '', nextHash);
    }
  }, [state]);

  const evalRes = useMemo(
    () => evaluatePerovskite({ A: state.A, B: state.B, X: state.X, kind: state.kind }),
    [state],
  );

  const showLnPolicy = hasLanthanide(state.A);

  function updateOccupant(site: SiteName, index: number, patch: Partial<Occupant>) {
    setState((prev) => {
      const list = prev[site].map((o, i) => {
        if (i !== index) return o;
        const next: Occupant = { ...o, ...patch };
        // If ox changed, ensure CN and spin stay valid
        if (patch.ox !== undefined && patch.ox !== o.ox) {
          const cns = coordinations(next.el, next.ox);
          if (!cns.some((c) => c.cn === next.cn && (c.geometry ?? null) === (next.geometry ?? null))) {
            const pick = cns.find((c) => c.geometry === null) ?? cns[0];
            if (pick) {
              next.cn = pick.cn;
              if (pick.geometry) next.geometry = pick.geometry;
              else delete next.geometry;
            }
          }
        }
        const spList = spins(next.el, next.ox, next.cn, next.geometry ?? null).filter(
          (s): s is Spin => s !== null,
        );
        if (spList.length === 0) {
          delete next.spin;
        } else if (!next.spin || !spList.includes(next.spin)) {
          next.spin = spList[0]!;
        }
        return next;
      });
      return { ...prev, [site]: list };
    });
  }

  function selectElement(site: SiteName, index: number, symbol: string) {
    setState((prev) => {
      const current = prev[site][index];
      const fresh = defaultOccupant(symbol, site, current?.fraction ?? 1, prev.lnPolicy);
      const list = prev[site].map((o, i) => (i === index ? fresh : o));
      return { ...prev, [site]: list };
    });
    setPickerTarget(null);
  }

  function toggleSecondOccupant(site: SiteName) {
    setState((prev) => {
      if (prev[site].length > 1) {
        const first = { ...prev[site][0]!, fraction: 1 };
        return { ...prev, [site]: [first] };
      }
      const fallbackEl = site === 'A' ? 'Ba' : site === 'B' ? 'Zr' : 'F';
      const first = { ...prev[site][0]!, fraction: 0.5 };
      const second = defaultOccupant(fallbackEl, site, 0.5, prev.lnPolicy);
      return { ...prev, [site]: [first, second] };
    });
  }

  function setSecondFraction(site: SiteName, frac0: number) {
    const clamped = Math.max(0.05, Math.min(0.95, Math.round(frac0 * 100) / 100));
    const f1 = Math.round((1 - clamped) * 100) / 100;
    setState((prev) => {
      if (prev[site].length < 2) return prev;
      return {
        ...prev,
        [site]: [
          { ...prev[site][0]!, fraction: clamped },
          { ...prev[site][1]!, fraction: f1 },
        ],
      };
    });
  }

  function applyLnPolicy(policy: LnCnPolicy) {
    setState((prev) => ({
      ...prev,
      lnPolicy: policy,
      A: prev.A.map((o) =>
        LANTHANIDE_A_SYMBOLS.has(o.el) ? { ...o, cn: resolveLnCn(o.el, o.ox, policy) } : o,
      ),
    }));
  }

  function swapAB() {
    setState((prev) => ({ ...prev, A: prev.B, B: prev.A }));
  }

  async function copyShareLink() {
    if (typeof window === 'undefined' || !navigator.clipboard) return;
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const f = evalRes.factors;

  return (
    <div className="tf-root" data-tool-id="tolerance-factor">
      <div className="tf-presets" role="group" aria-label="Example perovskite compositions">
        <span>Examples:</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="tf-preset-btn"
            onClick={() => {
              setState(p.state);
              setPickerTarget(null);
            }}
          >
            {p.label}
          </button>
        ))}
        <label className="tf-field" style={{ marginLeft: 'auto' }}>
          <span>Radius set</span>
          <select
            aria-label="Radius set"
            value={state.kind}
            onChange={(e) => setState((prev) => ({ ...prev, kind: e.target.value as RadiusKind }))}
          >
            <option value="ionic">Effective ionic (Shannon 1976)</option>
            <option value="crystal">Crystal (Shannon 1976)</option>
          </select>
        </label>
      </div>

      {showLnPolicy && (
        <div className="tf-policy" role="region" aria-label="Rare-earth A-site coordination policy">
          <strong>Rare-earth A-site CN policy (D-028):</strong>
          <span>
            Shannon lists CN 12 for only 4 of 15 lanthanides (La, Ce, Nd, Sm). Choose how Ln3+ / Y3+ A-site
            coordination is selected:
          </span>
          <label className="tf-field">
            <span className="sr-only">A-site coordination policy</span>
            <select
              aria-label="A-site coordination policy"
              value={state.lnPolicy}
              onChange={(e) => applyLnPolicy(e.target.value as LnCnPolicy)}
            >
              <option value="cn12">Strict CN XII (missing ions left blank)</option>
              <option value="cn9">Uniform CN IX (available for all Ln3+ and Y3+)</option>
              <option value="cn8">Uniform CN VIII (available for all Ln3+ and Y3+)</option>
              <option value="highest">Highest listed CN up to XII (Bartel rule)</option>
            </select>
          </label>
        </div>
      )}

      <div className="tf-sites">
        {(['A', 'B', 'X'] as const).map((site) => {
          const siteTitle =
            site === 'A'
              ? 'A site (large cation, default CN XII)'
              : site === 'B'
                ? 'B site (octahedral cation, default CN VI)'
                : 'X site (anion, default CN VI)';
          const occs = state[site];
          return (
            <section key={site} className="tf-site" aria-label={`${site} site`}>
              <div className="tf-site-head">
                <h2>{siteTitle}</h2>
                {site !== 'X' && (
                  <button type="button" className="tf-preset-btn" onClick={() => toggleSecondOccupant(site)}>
                    {occs.length > 1 ? 'Single occupant' : 'Add second occupant'}
                  </button>
                )}
              </div>

              {occs.map((occ, idx) => {
                const oxList = oxidationStates(occ.el);
                const cnList = coordinations(occ.el, occ.ox);
                const spList = spins(occ.el, occ.ox, occ.cn, occ.geometry ?? null).filter(
                  (s): s is Spin => s !== null,
                );
                const cnVal = `${occ.cn}:${occ.geometry ?? ''}`;
                const hasCnInList = cnList.some(
                  (c) => c.cn === occ.cn && (c.geometry ?? null) === (occ.geometry ?? null),
                );
                return (
                  <div key={`${site}-${idx}`} className="tf-occ">
                    <div className="tf-row">
                      <button
                        type="button"
                        className="tf-el-btn"
                        aria-label={`Pick element for ${site} site occupant ${idx + 1} (currently ${occ.el})`}
                        onClick={() =>
                          setPickerTarget((cur) =>
                            cur && cur.site === site && cur.index === idx ? null : { site, index: idx },
                          )
                        }
                      >
                        {occ.el}
                      </button>

                      <label className="tf-field">
                        <span>Oxidation</span>
                        <select
                          aria-label={`${site} occupant ${idx + 1} oxidation state`}
                          value={occ.ox}
                          onChange={(e) => updateOccupant(site, idx, { ox: Number(e.target.value) })}
                        >
                          {(oxList.includes(occ.ox) ? oxList : [...oxList, occ.ox].sort((a, b) => a - b)).map(
                            (ox) => (
                              <option key={ox} value={ox}>
                                {ox > 0 ? `+${ox}` : String(ox)}
                              </option>
                            ),
                          )}
                        </select>
                      </label>

                      <label className="tf-field">
                        <span>CN</span>
                        <select
                          aria-label={`${site} occupant ${idx + 1} coordination`}
                          value={cnVal}
                          onChange={(e) => {
                            const [cnS, geoS] = e.target.value.split(':');
                            const patch: Partial<Occupant> = { cn: Number(cnS) };
                            if (geoS === 'SQ' || geoS === 'PY') patch.geometry = geoS as Geometry;
                            else patch.geometry = null;
                            updateOccupant(site, idx, patch);
                          }}
                        >
                          {!hasCnInList && (
                            <option value={cnVal}>
                              {coordinationLabel(occ.cn, occ.geometry ?? null)} (not listed)
                            </option>
                          )}
                          {cnList.map((c) => {
                            const key = `${c.cn}:${c.geometry ?? ''}`;
                            return (
                              <option key={key} value={key}>
                                {coordinationLabel(c.cn, c.geometry)}
                              </option>
                            );
                          })}
                        </select>
                      </label>

                      {spList.length > 0 && (
                        <label className="tf-field">
                          <span>Spin</span>
                          <select
                            aria-label={`${site} occupant ${idx + 1} spin state`}
                            value={occ.spin ?? spList[0]}
                            onChange={(e) => updateOccupant(site, idx, { spin: e.target.value as Spin })}
                          >
                            {spList.map((sp) => (
                              <option key={sp} value={sp}>
                                {sp === 'HS' ? 'High spin (HS)' : 'Low spin (LS)'}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}

                      {occs.length > 1 && idx === 0 && (
                        <label className="tf-field">
                          <span>Fraction</span>
                          <input
                            type="number"
                            aria-label={`${site} occupant 1 fraction`}
                            min={0.05}
                            max={0.95}
                            step={0.05}
                            value={occ.fraction}
                            onChange={(e) => setSecondFraction(site, Number(e.target.value))}
                          />
                        </label>
                      )}
                      {occs.length > 1 && idx === 1 && (
                        <span className="tf-source-line">Fraction: {occ.fraction.toFixed(2)}</span>
                      )}
                    </div>

                    <p className="tf-source-line">{sourceLine(occ, state.kind)}</p>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {pickerTarget && (
        <PeriodicTable
          selected={state[pickerTarget.site][pickerTarget.index]?.el ?? null}
          highlighted={SHANNON_ELEMENTS}
          label={`Choose element for ${pickerTarget.site} site`}
          onSelect={(sym) => selectElement(pickerTarget.site, pickerTarget.index, sym)}
        />
      )}

      <section aria-label="Tolerance factor results">
        <div className="tf-results">
          <div className="tf-card" data-factor="t">
            <div>
              <Badge variant="heuristic" /> <strong>Goldschmidt t</strong>
            </div>
            <p className="tf-metric">{f ? f.t.toFixed(4) : 'Not available'}</p>
            <p>
              Measures how well the A cation fits the cavity between corner-sharing BX6 octahedra (near 1.0
              cubic, 0.8 to 1.0 tilted, above 1 hexagonal).
            </p>
            <details>
              <summary>Formula (S-002)</summary>
              <p className="tf-source-line">t = (rA + rX) / (sqrt(2) * (rB + rX))</p>
            </details>
          </div>

          <div className="tf-card" data-factor="mu">
            <div>
              <Badge variant="heuristic" /> <strong>Octahedral factor mu</strong>
            </div>
            <p className="tf-metric">{f ? f.mu.toFixed(4) : 'Not available'}</p>
            <p>
              Checks whether the B cation is large enough to sit stably inside a BX6 octahedron (radius-ratio
              window 0.414 to 0.732, S-022).
            </p>
            <details>
              <summary>Formula (S-022)</summary>
              <p className="tf-source-line">mu = rB / rX</p>
            </details>
          </div>

          <div className="tf-card" data-factor="tau">
            <div>
              <Badge variant="heuristic" /> <strong>Bartel tau</strong>
            </div>
            <p className="tf-metric">
              {f ? (f.tau.ok ? f.tau.value.toFixed(4) : 'Undefined') : 'Not available'}
            </p>
            <p>
              {f && f.tau.ok
                ? f.tau.predictsPerovskite
                  ? `Below ${TAU_THRESHOLD}: predicts perovskite formability (S-003).`
                  : `At or above ${TAU_THRESHOLD}: predicts non-perovskite (S-003).`
                : 'Requires valid radii with rA != rB.'}
            </p>
            <details>
              <summary>Formula (S-003)</summary>
              <p className="tf-source-line">tau = rX/rB - nA * (nA - (rA/rB) / ln(rA/rB))</p>
              <p className="tf-source-line">{TAU_STATUS.note}</p>
            </details>
          </div>
        </div>
      </section>

      <p className="tf-honesty">
        Tolerance factors are rules of thumb. They do not guarantee that a compound exists or is stable.
      </p>

      <div className="tf-actions">
        <button type="button" className="tf-preset-btn" onClick={copyShareLink}>
          {copied ? 'Link copied' : 'Copy shareable link'}
        </button>
        {evalRes.checks.some((c) => c.action === 'swap-a-b') && (
          <button type="button" className="tf-preset-btn" onClick={swapAB}>
            Swap A and B sites
          </button>
        )}
      </div>

      <ToleranceMaps
        A={state.A}
        B={state.B}
        X={state.X}
        kind={state.kind}
        lnPolicy={state.lnPolicy}
        evalRes={evalRes}
      />

      {evalRes.checks.length > 0 && (
        <section aria-label="Checks and warnings">
          <h2>Checks and warnings</h2>
          <ul className="tf-checks">
            {evalRes.checks.map((c, i) => (
              <li key={`${c.id}-${i}`} className={`tf-check tf-check-${c.level}`}>
                <strong>[{c.level.toUpperCase()}]</strong> {c.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
