// Post-flight calculation review checks on OSZICAR, OUTCAR, POSCAR and CONTCAR.
// Never claims a calculation is "correct"; only reports named checks as pass, warn, fail or not-checked.
// @source S-019, S-041, S-042, S-065
import { cellVolume } from '../crystal/lattice';
import type { ReviewIntake } from './intake';
import { runPreflightChecks, type ReviewCheck } from './preflight';

function getTagNumber(intake: ReviewIntake, key: string): number | undefined {
  const item = intake.incar?.entries.find((e) => e.name.toUpperCase() === key.toUpperCase());
  if (!item) return undefined;
  const n = Number(item.value.trim());
  return Number.isFinite(n) ? n : undefined;
}

export function runPostflightChecks(intake: ReviewIntake): ReviewCheck[] {
  const checks: ReviewCheck[] = [];
  const { outcar, oszicar } = intake;

  if (!outcar && !oszicar) {
    checks.push({
      id: 'POST-OUTPUT',
      phase: 'postflight',
      title: 'Output file presence',
      status: 'not-checked',
      kind: 'computed',
      reason: 'No OUTCAR or OSZICAR was provided, so post-flight checks were skipped.',
      source: 'S-041',
    });
    return checks;
  }

  // 1. Reached required accuracy (OUTCAR)
  if (outcar) {
    const nsw = getTagNumber(intake, 'NSW') ?? 0;
    const isRelax = nsw > 0 || outcar.ionic.length > 1;
    if (isRelax) {
      checks.push({
        id: 'POST-ACC',
        phase: 'postflight',
        title: 'Ionic relaxation accuracy',
        status: outcar.reachedRequiredAccuracy ? 'pass' : 'fail',
        kind: 'computed',
        reason: outcar.reachedRequiredAccuracy
          ? 'OUTCAR reports "reached required accuracy" for ionic relaxation.'
          : 'OUTCAR does not report "reached required accuracy". Ionic relaxation may have stopped at NSW.',
        source: 'S-041',
        ...(outcar.reachedRequiredAccuracy ? {} : { fix: 'Copy CONTCAR to POSCAR and continue relaxation.' }),
      });
    }

    // 2. Final max force vs EDIFFG
    const ediffg = getTagNumber(intake, 'EDIFFG');
    if (outcar.forces && ediffg !== undefined && ediffg < 0) {
      const limit = Math.abs(ediffg);
      const ok = outcar.forces.maxForce <= limit;
      checks.push({
        id: 'POST-FORCE',
        phase: 'postflight',
        title: 'Final maximum force versus |EDIFFG|',
        status: ok ? 'pass' : 'fail',
        kind: 'computed',
        reason: `Max force is ${outcar.forces.maxForce.toFixed(4)} eV/A against threshold ${limit.toFixed(4)} eV/A.`,
        source: 'S-041',
        ...(ok ? {} : { fix: 'Continue ionic relaxation from CONTCAR until forces fall below |EDIFFG|.' }),
      });
    }

    // 3. Electronic loops hitting NELM
    if (outcar.electronicLoops.length > 0) {
      const missed = outcar.electronicLoops.filter((l) => !l.reached).length;
      checks.push({
        id: 'POST-NELM',
        phase: 'postflight',
        title: 'Electronic convergence (EDIFF reached)',
        status: missed === 0 ? 'pass' : 'fail',
        kind: 'computed',
        reason:
          missed === 0
            ? `All ${outcar.electronicLoops.length} electronic loop(s) reached EDIFF.`
            : `${missed} of ${outcar.electronicLoops.length} electronic loop(s) hit NELM without reaching EDIFF.`,
        source: 'S-042',
        ...(missed === 0
          ? {}
          : { fix: 'Inspect SCF mixing (ALGO = All or Normal, AMIX/BMIX) and raise NELM; see /errors/.' }),
      });
    }

    // 4. Entropy term per atom vs 1 meV/atom (S-042)
    const lastIonic = outcar.ionic.at(-1);
    const nions = outcar.nions?.value ?? intake.poscar?.species.length;
    if (
      lastIonic &&
      lastIonic.freeEnergyTOTEN !== undefined &&
      lastIonic.energyWithoutEntropy !== undefined &&
      nions &&
      nions > 0
    ) {
      const entropyMeVPerAtom =
        (Math.abs(lastIonic.freeEnergyTOTEN - lastIonic.energyWithoutEntropy) / nions) * 1000;
      const ok = entropyMeVPerAtom < 1.0;
      checks.push({
        id: 'POST-ENTROPY',
        phase: 'postflight',
        title: 'Smearing entropy per atom (< 1 meV/atom)',
        status: ok ? 'pass' : 'warn',
        kind: 'heuristic',
        reason: `|T*S| / atom = ${entropyMeVPerAtom.toFixed(3)} meV/atom (handbook rule of thumb: keep below 1.0 meV/atom).`,
        source: 'S-042',
        ...(ok ? {} : { fix: 'Reduce SIGMA (for example 0.05 eV) and re-run.' }),
      });
    }

    // 5. Pulay stress check
    const lastPressure = outcar.pressure.at(-1);
    if (lastPressure && Math.abs(lastPressure.pulayKb) > 1.0) {
      checks.push({
        id: 'POST-PULAY',
        phase: 'postflight',
        title: 'Pulay stress magnitude',
        status: 'warn',
        kind: 'heuristic',
        reason: `OUTCAR reports Pulay stress ${lastPressure.pulayKb.toFixed(2)} kB (external pressure ${lastPressure.pressureKb.toFixed(2)} kB).`,
        source: 'S-042',
        fix: 'Verify ENCUT >= 1.3 x ENMAX or use fixed-volume EOS fitting (/tools/eos/).',
      });
    }
  }

  // 6. OSZICAR summary check
  if (oszicar && oszicar.ionic.length > 0) {
    const last = oszicar.ionic.at(-1)!;
    const nelm = getTagNumber(intake, 'NELM') ?? 60;
    const hitNelm = oszicar.ionic.some((s) => s.nElectronic >= nelm);
    checks.push({
      id: 'POST-OSZICAR',
      phase: 'postflight',
      title: 'OSZICAR ionic and electronic steps',
      status: hitNelm ? 'warn' : 'pass',
      kind: 'computed',
      reason: `Parsed ${oszicar.ionic.length} ionic step(s); final E0 = ${last.e0.toFixed(6)} eV${last.mag !== undefined ? `, mag = ${last.mag.toFixed(4)} mu_B` : ''}.${hitNelm ? ` At least one step reached ${nelm} electronic iterations.` : ''}`,
      source: 'S-041',
    });
  }

  // 7. Volume change POSCAR vs CONTCAR
  if (intake.poscar && intake.contcar) {
    const v0 = Math.abs(cellVolume(intake.poscar.lattice));
    const v1 = Math.abs(cellVolume(intake.contcar.lattice));
    if (v0 > 0) {
      const pct = ((v1 - v0) / v0) * 100;
      const large = Math.abs(pct) > 10;
      checks.push({
        id: 'POST-VOL',
        phase: 'postflight',
        title: 'Volume change (POSCAR to CONTCAR)',
        status: large ? 'warn' : 'pass',
        kind: 'computed',
        reason: `Cell volume changed from ${v0.toFixed(2)} to ${v1.toFixed(2)} A^3 (${pct >= 0 ? '+' : ''}${pct.toFixed(2)} %).`,
        source: 'S-042',
        ...(large
          ? { fix: 'A >10 % volume change alters the plane-wave basis; re-run relaxation from CONTCAR.' }
          : {}),
      });
    }
  }

  return checks;
}

export interface ReviewReport {
  readonly files: ReviewIntake['files'];
  readonly potcarHeaders: ReviewIntake['potcarHeaders'];
  readonly preflight: readonly ReviewCheck[];
  readonly postflight: readonly ReviewCheck[];
  readonly warnings: readonly string[];
}

export function reviewCalculation(intake: ReviewIntake): ReviewReport {
  return {
    files: intake.files,
    potcarHeaders: intake.potcarHeaders,
    preflight: runPreflightChecks(intake),
    postflight: runPostflightChecks(intake),
    warnings: intake.warnings,
  };
}

export function reviewToMarkdown(report: ReviewReport): string {
  const lines: string[] = [
    '# VASP Calculation Review',
    '',
    'This report lists named pre-flight and post-flight checks run locally on the supplied files. Passing these checks does not prove a calculation is physically correct.',
    '',
    '## Files recognised',
    ...report.files.map((f) => `- \`${f.name}\` -> ${f.kind}`),
    '',
  ];
  if (report.potcarHeaders.length > 0) {
    lines.push('## POTCAR header metadata (body discarded)');
    for (const h of report.potcarHeaders) {
      lines.push(
        `- ${h.titel}${h.enmax !== undefined ? `, ENMAX = ${h.enmax} eV` : ''}${h.zval !== undefined ? `, ZVAL = ${h.zval}` : ''}`,
      );
    }
    lines.push('');
  }
  for (const [heading, list] of [
    ['Pre-flight checks', report.preflight],
    ['Post-flight checks', report.postflight],
  ] as const) {
    lines.push(`## ${heading}`);
    for (const c of list) {
      lines.push(
        `- **[${c.status.toUpperCase()}]** (${c.kind}, ${c.source}) **${c.title}**: ${c.reason}${c.fix ? ` Fix: ${c.fix}` : ''}`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
