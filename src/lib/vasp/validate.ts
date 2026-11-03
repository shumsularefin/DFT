// INCAR validation engine. Pure functions, no DOM, no network.
// Every rule is sourced (S-xxx), explained at beginner level, and where possible comes with a pure one-click fix.
// @source S-019, S-041, S-042
import { makeView } from './rules/helpers';
import { ALL_RULES } from './rules';
import type { Issue, Rule, Severity, ValidateContext } from './rules/types';

export type { Issue, Rule, Severity, ValidateContext, Fix } from './rules/types';
export { ALL_RULES } from './rules';

const ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

/** Run every rule (or the given ones) and return issues sorted by severity, then rule id. Never throws on odd input. */
export function validate(ctx: ValidateContext, rules: readonly Rule[] = ALL_RULES): Issue[] {
  const view = makeView(ctx.incar);
  const out: Issue[] = [];
  for (const r of rules) {
    for (const h of r.check(ctx, view)) {
      out.push({
        rule: r.id,
        severity: h.severity ?? r.severity,
        title: r.title,
        why: h.why,
        ...(h.whyDetail ? { whyDetail: h.whyDetail } : {}),
        ...(h.fix ? { fix: h.fix } : {}),
        source: r.source,
        ...(r.handbook ? { handbook: r.handbook } : {}),
        vasp: r.vasp,
      });
    }
  }
  return out.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.rule.localeCompare(b.rule));
}

/** One-line text for logs and tests, for example `V010 error: Ionic steps requested but IBRION is not set`. */
export const formatIssue = (i: Issue): string => `${i.rule} ${i.severity}: ${i.title}`;

/** Apply a fix to an INCAR (pure). Returns the input unchanged when the issue has no fix. */
export function applyFix<T extends ValidateContext['incar']>(
  incar: T,
  issue: Issue,
): T | ValidateContext['incar'] {
  return issue.fix ? issue.fix.apply(incar) : incar;
}
