// Pre-flight calculation review checks built on the M3.4 validator and handbook rules.
// @source S-019, S-041, S-042, S-065
import { validate, type ValidateContext } from '../vasp/validate';
import type { ReviewIntake } from './intake';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'not-checked';
export type CheckKind = 'rule' | 'heuristic' | 'computed';

export interface ReviewCheck {
  readonly id: string;
  readonly phase: 'preflight' | 'postflight';
  readonly title: string;
  readonly status: CheckStatus;
  readonly kind: CheckKind;
  readonly reason: string;
  readonly source: string;
  readonly fix?: string;
}

function getTagNumber(intake: ReviewIntake, key: string): number | undefined {
  const item = intake.incar?.entries.find((e) => e.name.toUpperCase() === key.toUpperCase());
  if (!item) return undefined;
  const n = Number(item.value.trim());
  return Number.isFinite(n) ? n : undefined;
}

function getTagString(intake: ReviewIntake, key: string): string | undefined {
  return intake.incar?.entries.find((e) => e.name.toUpperCase() === key.toUpperCase())?.value.trim();
}

export function runPreflightChecks(intake: ReviewIntake): ReviewCheck[] {
  const checks: ReviewCheck[] = [];

  if (!intake.incar) {
    checks.push({
      id: 'PF-INCAR',
      phase: 'preflight',
      title: 'INCAR presence',
      status: 'not-checked',
      kind: 'rule',
      reason: 'No INCAR file was provided, so input-tag checks were skipped.',
      source: 'S-041',
    });
    return checks;
  }

  // Run M3.4 validator
  const enmaxValues = intake.potcarHeaders.map((h) => h.enmax).filter((v): v is number => v !== undefined);
  const maxEnmax = enmaxValues.length > 0 ? Math.max(...enmaxValues) : undefined;

  const ctx: ValidateContext = {
    incar: intake.incar.entries,
    ...(intake.poscar ? { structure: intake.poscar } : {}),
    ...(maxEnmax !== undefined ? { enmaxEv: maxEnmax } : {}),
  };
  const issues = validate(ctx);

  if (issues.length === 0) {
    checks.push({
      id: 'PF-RULES',
      phase: 'preflight',
      title: 'INCAR rule engine (M3.4)',
      status: 'pass',
      kind: 'rule',
      reason: 'No rule errors or warnings were triggered across the provided INCAR tags.',
      source: 'S-042',
    });
  } else {
    for (const iss of issues) {
      checks.push({
        id: `PF-${iss.rule}`,
        phase: 'preflight',
        title: `${iss.rule}: ${iss.title}`,
        status: iss.severity === 'error' ? 'fail' : 'warn',
        kind: 'rule',
        reason: iss.why,
        source: Array.isArray(iss.source) ? iss.source.join(', ') : String(iss.source),
        ...(iss.fix ? { fix: iss.fix.label } : {}),
      });
    }
  }

  // ENCUT vs 1.3 * max(ENMAX)
  const encut = getTagNumber(intake, 'ENCUT');
  if (encut !== undefined && maxEnmax !== undefined) {
    const target = 1.3 * maxEnmax;
    const isif = getTagNumber(intake, 'ISIF');
    const ok = encut >= target - 1e-6;
    checks.push({
      id: 'PF-ENMAX',
      phase: 'preflight',
      title: 'ENCUT versus 1.3 x ENMAX',
      status: ok ? 'pass' : isif === 3 ? 'fail' : 'warn',
      kind: 'heuristic',
      reason: ok
        ? `ENCUT (${encut} eV) meets or exceeds 1.3 x max(ENMAX) (${target.toFixed(1)} eV).`
        : `ENCUT (${encut} eV) is below 1.3 x max(ENMAX) (${target.toFixed(1)} eV); stress and cell volume (especially ISIF = 3) are sensitive to Pulay stress.`,
      source: 'S-042',
      ...(ok ? {} : { fix: `Raise ENCUT to at least ${Math.ceil(target / 10) * 10} eV.` }),
    });
  } else {
    checks.push({
      id: 'PF-ENMAX',
      phase: 'preflight',
      title: 'ENCUT versus 1.3 x ENMAX',
      status: 'not-checked',
      kind: 'heuristic',
      reason: 'Needs both ENCUT in INCAR and ENMAX from POTCAR headers (or OUTCAR) to compare.',
      source: 'S-042',
    });
  }

  // KPOINTS centring check
  if (intake.kpointsText) {
    const lines = intake.kpointsText.split(/\r?\n/).map((l) => l.trim());
    const scheme = (lines[2] ?? '').toLowerCase();
    const isMp = scheme.startsWith('m');
    checks.push({
      id: 'PF-KPOINTS',
      phase: 'preflight',
      title: 'KPOINTS grid centring',
      status: isMp ? 'warn' : 'pass',
      kind: 'heuristic',
      reason: isMp
        ? 'Monkhorst-Pack scheme detected; Gamma-centred grids are safer for hexagonal and trigonal lattices (Q-017).'
        : 'Gamma-centred or explicit k-point scheme detected.',
      source: 'S-019',
      ...(isMp ? { fix: 'Use Gamma on line 3 of KPOINTS unless you specifically need a shifted mesh.' } : {}),
    });
  } else if (!getTagString(intake, 'KSPACING')) {
    checks.push({
      id: 'PF-KPOINTS',
      phase: 'preflight',
      title: 'KPOINTS or KSPACING presence',
      status: 'warn',
      kind: 'rule',
      reason: 'Neither KPOINTS file nor KSPACING tag was found in the dropped inputs.',
      source: 'S-041',
      fix: 'Provide a KPOINTS file or set KSPACING in INCAR.',
    });
  }

  return checks;
}
