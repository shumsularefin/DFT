// Charge-neutral oxidation-state assignments (rule B005), in the spirit of SMACT's screening (S-023):
// candidate states are those with a non-zero ICSD 2024 count (S-051), the total must be zero, and every
// anion must be more electronegative (Pauling, S-034) than every cation. The method is reimplemented here.
// Ranking convention (D-064): fewest known-rare states, then fewest mixed-valence elements, then the highest
// product of shares (each state weighted by the fraction of the element's atoms that carry it).
import { COMMON_SHARE, oxidationShares } from './oxidation';
import { paulingX } from './elements';
import { THRESHOLDS } from './rules';

export interface StatePart {
  ox: number;
  /** Atoms of this element (in the formula unit given) carrying this state. */
  count: number;
  share: number;
  rare: boolean;
}
export interface ElementAssignment {
  el: string;
  parts: StatePart[];
}
export interface Assignment {
  elements: ElementAssignment[];
  rareCount: number;
  mixedCount: number;
  /** Sum of log(share), weighted by atom fraction per element. */
  logScore: number;
}

interface Option {
  parts: StatePart[];
  charge: number;
  rare: number;
  mixed: number;
  log: number;
}

const better = (
  a: { rare: number; mixed: number; log: number },
  b: { rare: number; mixed: number; log: number },
) => (a.rare !== b.rare ? a.rare < b.rare : a.mixed !== b.mixed ? a.mixed < b.mixed : a.log > b.log + 1e-12);

function optionsFor(el: string, n: number, sign: 1 | -1, commonOnly: boolean): Option[] {
  const states = oxidationShares(el).filter(
    (r) => r.count > 0 && Math.sign(r.ox) === sign && (!commonOnly || r.share >= COMMON_SHARE),
  );
  const part = (s: (typeof states)[number], k: number): StatePart => ({
    ox: s.ox,
    count: k,
    share: s.share,
    rare: s.share < COMMON_SHARE,
  });
  const out: Option[] = [];
  for (const s of states)
    out.push({
      parts: [part(s, n)],
      charge: s.ox * n,
      rare: s.share < COMMON_SHARE ? 1 : 0,
      mixed: 0,
      log: Math.log(s.share),
    });
  if (THRESHOLDS.maxStatesPerElement >= 2)
    for (let a = 0; a < states.length; a++)
      for (let b = a + 1; b < states.length; b++)
        for (let k = 1; k < n; k++) {
          const sa = states[a]!;
          const sb = states[b]!;
          out.push({
            parts: [part(sa, k), part(sb, n - k)],
            charge: sa.ox * k + sb.ox * (n - k),
            rare: (sa.share < COMMON_SHARE ? 1 : 0) + (sb.share < COMMON_SHARE ? 1 : 0),
            mixed: 1,
            log: (k / n) * Math.log(sa.share) + ((n - k) / n) * Math.log(sb.share),
          });
        }
  return out;
}

export type ChargeOutcome =
  | { kind: 'assigned'; best: Assignment }
  | { kind: 'none' }
  | { kind: 'no-electronegativity'; elements: string[] };

/**
 * Best charge-neutral assignment for a composition (counts per element, e.g. the reduced formula).
 * `commonOnly` restricts candidates to states with share >= 0.10 (D-061).
 */
export function searchCharges(
  composition: { el: string; count: number }[],
  commonOnly = false,
): ChargeOutcome {
  const missing = composition.filter((c) => paulingX(c.el) === null).map((c) => c.el);
  if (missing.length) return { kind: 'no-electronegativity', elements: missing };
  const sorted = [...composition].sort((a, b) => paulingX(a.el)! - paulingX(b.el)!);
  let best: Assignment | undefined;
  // Cations are the k least electronegative elements; the cut must fall between two different values.
  for (let k = 1; k < sorted.length; k++) {
    if (!(paulingX(sorted[k - 1]!.el)! < paulingX(sorted[k]!.el)!)) continue;
    // Dynamic programming over the running charge, keeping the best partial assignment for each total.
    let dp = new Map<number, { rare: number; mixed: number; log: number; picks: Option[] }>([
      [0, { rare: 0, mixed: 0, log: 0, picks: [] }],
    ]);
    sorted.forEach((c, idx) => {
      const opts = optionsFor(c.el, c.count, idx < k ? 1 : -1, commonOnly);
      const next = new Map<number, { rare: number; mixed: number; log: number; picks: Option[] }>();
      for (const [q, st] of dp)
        for (const o of opts) {
          const cand = {
            rare: st.rare + o.rare,
            mixed: st.mixed + o.mixed,
            log: st.log + o.log,
            picks: [...st.picks, o],
          };
          const cur = next.get(q + o.charge);
          if (!cur || better(cand, cur)) next.set(q + o.charge, cand);
        }
      dp = next;
    });
    const zero = dp.get(0);
    if (
      zero &&
      (!best ||
        better(
          { rare: zero.rare, mixed: zero.mixed, log: zero.log },
          { rare: best.rareCount, mixed: best.mixedCount, log: best.logScore },
        ))
    )
      best = {
        elements: sorted.map((c, i) => ({ el: c.el, parts: zero.picks[i]!.parts })),
        rareCount: zero.rare,
        mixedCount: zero.mixed,
        logScore: zero.log,
      };
  }
  return best ? { kind: 'assigned', best } : { kind: 'none' };
}

/** "Nd3+ Cu3+ O2-", with mixed valence as "Fe2+ x1, Fe3+ x2". */
export function formatAssignment(a: Assignment): string {
  const ion = (el: string, ox: number) =>
    `${el}${Math.abs(ox) === 1 ? '' : Math.abs(ox)}${ox > 0 ? '+' : '-'}`;
  return a.elements
    .map((e) =>
      e.parts.length === 1
        ? ion(e.el, e.parts[0]!.ox)
        : [...e.parts]
            .sort((x, y) => x.ox - y.ox)
            .map((p) => `${ion(e.el, p.ox)} x${p.count}`)
            .join(', '),
    )
    .join(' ');
}
