// Output reader (M7.3): explains every recognised line of an OSZICAR or OUTCAR and summarises convergence.
// Pure functions on top of the M4.1 parsers (parseOszicar, parseOutcar); never throws on odd input.
// Rules that are not VASP facts are marked `heuristic`. Line formats follow the handbooks (Q-008: not yet checked on real files).
// @source S-019 (VASP wiki: OSZICAR, OUTCAR, EDIFF, EDIFFG, NELM), S-041 (Field Handbook OSZICAR and OUTCAR entries), S-042
import { parseOszicar, type OszicarResult } from './oszicar';
import { parseOutcar, type OutcarResult } from './outcar';
import { toNum } from './num';

export type Health = 'ok' | 'watch' | 'problem' | 'info';
export type FileGuess = 'OSZICAR' | 'OUTCAR' | 'unknown';

export interface ReadNote {
  /** 1-based line of the file. */
  line: number;
  label: string;
  beginner: string;
  intermediate: string;
  health: Health;
  /** True when the health judgement is a rule of thumb and not a statement from the VASP documentation. */
  heuristic?: boolean;
}

export interface ReaderSettings {
  /** EDIFF in eV. VASP default 1E-4 (vasp-tags.json). */
  ediff: number;
  /** EDIFFG: negative = force criterion (eV/A), positive = energy criterion (eV), null = unknown. */
  ediffg: number | null;
  /** NELM, the electronic step limit. VASP default 60. */
  nelm: number;
}
export const DEFAULT_SETTINGS: ReaderSettings = { ediff: 1e-4, ediffg: null, nelm: 60 };

export type CheckState = 'ok' | 'watch' | 'problem' | 'unknown';
export interface Check {
  id: string;
  label: string;
  state: CheckState;
  text: string;
  heuristic?: boolean;
}

export interface ReaderSummary {
  ionicSteps: number;
  electronicPerIonic: number[];
  lastF?: number;
  lastE0?: number;
  lastDE?: number;
  /** Last total magnetic moment (Bohr magneton): OSZICAR mag= or the OUTCAR electron count line. */
  mag?: number;
  maxForce?: number;
  /** |TOTEN - energy without entropy| of the last ionic step, per atom (OUTCAR only), in eV. */
  entropyPerAtom?: number;
  nions?: number;
}

export interface ReaderResult {
  kind: FileGuess;
  notes: ReadNote[];
  summary: ReaderSummary;
  checks: Check[];
  warnings: string[];
}

export function guessKind(text: string): FileGuess {
  if (/^\s*(?:DAV|RMM|CG[A-Z]?|DIA|EDD|SDA|SD|BRMIX)\s*:\s+\d+/m.test(text)) return 'OSZICAR';
  if (/TOTEN|NIONS|free\s+energy|TOTAL-FORCE|vasp\.\d/.test(text)) return 'OUTCAR';
  return 'unknown';
}

const sci = (x: number, d = 2): string => (x === 0 ? '0' : x.toExponential(d));
const fix = (x: number, d = 4): string => x.toFixed(d);
const meV = (ev: number): string => `${(ev * 1000).toFixed(2)} meV`;

const SOLVER: Record<string, string> = {
  DAV: 'blocked Davidson',
  RMM: 'RMM-DIIS',
  CGA: 'conjugate gradient',
  CG: 'conjugate gradient',
};

function oszicarNotes(r: OszicarResult, s: ReaderSettings): { notes: ReadNote[]; checks: Check[] } {
  const notes: ReadNote[] = [];
  const checks: Check[] = [];
  // The last electronic step before each ionic line is the one that decided whether the loop converged.
  const lastOfBlock = new Set<number>();
  const perBlock: { count: number; last: number }[] = [];
  const ionicLines = r.ionic.map((i) => i.line);
  for (const el of r.electronic) {
    const b = ionicLines.findIndex((l) => l > el.line);
    const idx = b === -1 ? ionicLines.length : b;
    const blk = (perBlock[idx] ??= { count: 0, last: el.line });
    blk.count++;
    blk.last = el.line;
  }
  for (const b of perBlock) if (b) lastOfBlock.add(b.last);
  const blockCount = new Map<number, number>();
  for (const el of r.electronic) {
    const b = ionicLines.findIndex((l) => l > el.line);
    blockCount.set(el.line, perBlock[b === -1 ? ionicLines.length : b]?.count ?? 0);
  }

  for (const el of r.electronic) {
    const name = SOLVER[el.solver] ?? el.solver;
    const base: ReadNote = {
      line: el.line,
      label: `Electronic step ${el.n} (${el.solver})`,
      beginner: `One round of the self-consistency loop, solved with ${name}. E is the energy now, dE the change since the last round, d eps the change in the sum of the band energies.`,
      intermediate: `Columns: N, E (free energy), dE, d eps, ncg (H|psi> evaluations), rms (residual of the wavefunctions)${el.rmsC !== undefined ? ', rms(c) (charge-density residual)' : ''}. The loop stops when both |dE| and |d eps| fall below EDIFF.`,
      health: 'info',
    };
    if (lastOfBlock.has(el.line)) {
      const ok = Math.abs(el.dE) < s.ediff && Math.abs(el.dEps) < s.ediff;
      const total = blockCount.get(el.line) ?? 0;
      if (total >= s.nelm && !ok) {
        base.health = 'problem';
        base.beginner += ` This is the last step of its loop, and the loop used all ${s.nelm} allowed steps (NELM) without reaching EDIFF = ${sci(s.ediff, 0)}.`;
      } else if (ok) {
        base.health = 'ok';
        base.beginner += ` This is the last step of its loop: both changes are below EDIFF = ${sci(s.ediff, 0)}, so the loop converged.`;
      } else {
        base.health = 'watch';
        base.beginner += ` This is the last step of its loop, but a change is not below EDIFF = ${sci(s.ediff, 0)}. The loop ended for another reason (check NELM).`;
      }
    }
    notes.push(base);
  }

  r.ionic.forEach((io, k) => {
    const first = k === 0;
    const rose = !first && io.dE !== undefined && io.dE > 0;
    notes.push({
      line: io.line,
      label: `Ionic step ${io.step}`,
      beginner: `The summary of one geometry step. F is the free energy ${fix(io.f, 5)} eV, E0 is the energy extrapolated to zero smearing width ${fix(io.e0, 5)} eV${io.dE !== undefined ? `, and dE is the change since the previous ionic step (${sci(io.dE)} eV)` : ''}${io.mag !== undefined ? `. mag is the total magnetic moment, ${fix(io.mag)} Bohr magnetons` : ''}.`,
      intermediate: `${first ? 'The first ionic step has no earlier step to compare with, so VASP prints dE equal to F. ' : ''}${io.nElectronic} electronic step${io.nElectronic === 1 ? '' : 's'} came before this line.`,
      health: rose ? 'watch' : 'info',
      ...(rose ? { heuristic: true } : {}),
    });
    if (rose)
      notes[notes.length - 1]!.beginner +=
        ' The energy went up in this step. In a relaxation the energy usually falls, so look at the steps around it (rule of thumb).';
  });

  const last = r.ionic.at(-1);
  if (r.ionic.length)
    checks.push({
      id: 'ionic-steps',
      label: 'Ionic steps',
      state: 'ok',
      text: `${r.ionic.length} ionic step${r.ionic.length === 1 ? '' : 's'} found.`,
    });
  else
    checks.push({
      id: 'ionic-steps',
      label: 'Ionic steps',
      state: 'unknown',
      text: 'No ionic summary line (F= ... E0= ...) yet: the first electronic loop may still be running.',
    });
  const blocksOk = [...lastOfBlock].every((l) => {
    const el = r.electronic.find((e) => e.line === l)!;
    return Math.abs(el.dE) < s.ediff && Math.abs(el.dEps) < s.ediff;
  });
  if (r.electronic.length)
    checks.push({
      id: 'electronic',
      label: 'Electronic convergence',
      state: blocksOk ? 'ok' : 'watch',
      text: blocksOk
        ? `Every electronic loop ends with both changes below EDIFF = ${sci(s.ediff, 0)}.`
        : `At least one loop ends with a change at or above EDIFF = ${sci(s.ediff, 0)}.`,
    });
  if (last) {
    if (s.ediffg === null)
      checks.push({
        id: 'ionic-criterion',
        label: 'Ionic convergence',
        state: 'unknown',
        text: 'Enter EDIFFG to compare. OSZICAR has no forces: a force criterion (negative EDIFFG) needs the OUTCAR.',
      });
    else if (s.ediffg < 0)
      checks.push({
        id: 'ionic-criterion',
        label: 'Ionic convergence',
        state: 'unknown',
        text: `EDIFFG = ${s.ediffg} is a force criterion. OSZICAR has no forces, so open the OUTCAR to compare the largest force with ${Math.abs(s.ediffg)} eV/A.`,
      });
    else if (last.dE !== undefined && r.ionic.length > 1)
      checks.push({
        id: 'ionic-criterion',
        label: 'Ionic convergence',
        state: Math.abs(last.dE) < s.ediffg ? 'ok' : 'watch',
        text: `EDIFFG = ${s.ediffg} is an energy criterion. The last |dE| is ${sci(Math.abs(last.dE))} eV, ${Math.abs(last.dE) < s.ediffg ? 'below' : 'not below'} it.`,
      });
  }
  return { notes, checks };
}

function outcarNotes(
  r: OutcarResult,
  text: string,
  s: ReaderSettings,
): { notes: ReadNote[]; checks: Check[] } {
  const notes: ReadNote[] = [];
  const checks: Check[] = [];
  const nions = r.nions?.value;
  const info = (
    line: number,
    label: string,
    beginner: string,
    intermediate: string,
    health: Health = 'info',
  ) => notes.push({ line, label, beginner, intermediate, health });

  if (r.nions)
    info(
      r.nions.line,
      'Number of ions',
      `The cell holds ${r.nions.value} atoms. Energies per atom divide by this.`,
      'NIONS from the header block.',
    );
  if (r.encut)
    info(
      r.encut.line,
      'ENCUT',
      `The plane-wave cutoff VASP used: ${r.encut.value} eV. Compare it with ENMAX of your POTCARs (the handbook protocol uses 1.3 times the largest).`,
      'Printed in the parameter echo, so it is the value VASP really read.',
    );
  r.enmax.forEach((e, i) =>
    info(
      e.line,
      `ENMAX (species ${i + 1})`,
      `The recommended cutoff of one POTCAR dataset, ${e.value} eV. This line is a value copied from the POTCAR header, not POTCAR data.`,
      'One line per species, in POTCAR order.',
    ),
  );
  if (r.nkpts)
    info(
      r.nkpts.line,
      'k-points',
      `VASP used ${r.nkpts.value} irreducible k-points.`,
      'NKPTS is after symmetry reduction (compare IBZKPT).',
    );
  if (r.nbands)
    info(
      r.nbands.line,
      'Bands',
      `The calculation carries ${r.nbands.value} bands.`,
      'NBANDS; for optics it is raised to about two or three times the default (S-042).',
    );
  r.ionic.forEach((e, i) => {
    if (e.freeEnergyTOTEN !== undefined)
      info(
        e.line,
        `Energy block ${i + 1}: free energy TOTEN`,
        `The free energy of this ionic step, ${fix(e.freeEnergyTOTEN, 5)} eV. This is the number VASP minimises.`,
        'Includes the smearing entropy term. It is the F in OSZICAR.',
      );
    else if (e.energyWithoutEntropy !== undefined)
      info(
        e.line,
        `Energy block ${i + 1}`,
        'The energies of this ionic step.',
        'No TOTEN line was seen before it.',
      );
  });
  // the "energy without entropy" lines are separate lines
  const lines = text.split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/energy\s+without\s+entropy/.test(l) && !notes.some((n) => n.line === i + 1))
      info(
        i + 1,
        'Energy without entropy and sigma -> 0',
        'Two more energies: without the smearing entropy term, and extrapolated to zero smearing width. For semiconductors and insulators quote the sigma -> 0 value.',
        'The difference between TOTEN and "energy without entropy" is the entropy term.',
      );
  });
  r.pressure.forEach((p) =>
    info(
      p.line,
      'Pressure',
      `External pressure ${p.pressureKb} kB and Pulay stress ${p.pulayKb} kB. A large Pulay stress means the cutoff is too low for the cell shape to be trusted.`,
      'The Pulay stress comes from the incomplete plane-wave basis; raise ENCUT or restart the relaxation from CONTCAR (CONTCAR entry, S-041).',
    ),
  );
  if (r.forces)
    info(
      r.forces.line,
      'Forces (TOTAL-FORCE)',
      `The force on each atom, in eV per angstrom. The largest here is ${fix(r.forces.maxForce, 4)} eV/A.`,
      'Only the last block is analysed. The drift line below the table should be small.',
    );
  if (r.efermi)
    info(
      r.efermi.line,
      'Fermi level',
      `The Fermi energy, ${r.efermi.value} eV. Subtract it from DOS and band energies.`,
      'E-fermi from the last electronic loop.',
    );
  if (r.magnetization)
    info(
      r.magnetization.line,
      'Magnetization',
      `The total moment, ${r.magnetization.value} Bohr magnetons.`,
      'From the electron-count line. Site moments are in the "magnetization (x)" table when LORBIT is 10 or higher.',
    );
  for (const loop of r.electronicLoops)
    info(
      loop.line,
      loop.reached ? 'Electronic loop converged' : 'Electronic loop NOT converged',
      loop.reached
        ? 'The self-consistency loop stopped because the energy change fell below EDIFF.'
        : 'The loop ended without reaching EDIFF (it used all NELM steps). Energies and forces from this step are not reliable.',
      'VASP continues to the next ionic step anyway, so this line is easy to miss.',
      loop.reached ? 'ok' : 'problem',
    );
  if (r.reachedRequiredAccuracyLine)
    info(
      r.reachedRequiredAccuracyLine,
      'Reached required accuracy',
      'The relaxation stopped because it met its criterion (EDIFFG). This is the line to look for.',
      'Absent when the run stopped at NSW, was killed, or is not a relaxation.',
      'ok',
    );
  if (r.elapsedSec)
    info(
      r.elapsedSec.line,
      'Elapsed time',
      `Total wall time, ${r.elapsedSec.value} s. Its presence means the run reached the end of the program.`,
      'A run that was killed never prints it. The reason is usually in the job output, not here.',
      'ok',
    );

  // checks
  const last = r.ionic.at(-1);
  const eFinished = r.elapsedSec !== undefined;
  checks.push({
    id: 'finished',
    label: 'Run finished',
    state: eFinished ? 'ok' : 'unknown',
    text: eFinished
      ? 'The "Elapsed time" line is present, so the program reached its end.'
      : 'No "Elapsed time" line: the run may still be going, may have been killed, or this is an excerpt.',
  });
  const loops = r.electronicLoops;
  checks.push({
    id: 'electronic',
    label: 'Electronic convergence',
    state: loops.length === 0 ? 'unknown' : loops.every((l) => l.reached) ? 'ok' : 'problem',
    text:
      loops.length === 0
        ? 'No "aborting loop" lines found.'
        : loops.every((l) => l.reached)
          ? `All ${loops.length} electronic loops reached EDIFF.`
          : `${loops.filter((l) => !l.reached).length} of ${loops.length} electronic loops did not reach EDIFF.`,
  });
  const multi = r.ionic.length > 1;
  checks.push({
    id: 'accuracy',
    label: 'Reached required accuracy',
    state: r.reachedRequiredAccuracy ? 'ok' : multi ? (eFinished ? 'watch' : 'unknown') : 'unknown',
    text: r.reachedRequiredAccuracy
      ? 'The line "reached required accuracy" is present: the relaxation met its criterion.'
      : multi
        ? eFinished
          ? 'The line is missing although the run ended: it stopped at NSW or for another reason, so it did not meet EDIFFG.'
          : 'The line is missing and the run has not ended: it may still be going.'
        : 'Only one ionic step: a static run has no such line.',
  });
  if (r.forces) {
    if (s.ediffg !== null && s.ediffg < 0) {
      const ok = r.forces.maxForce < Math.abs(s.ediffg);
      checks.push({
        id: 'force',
        label: 'Largest force against EDIFFG',
        state: ok ? 'ok' : 'watch',
        text: `Largest force ${fix(r.forces.maxForce, 4)} eV/A, criterion ${Math.abs(s.ediffg)} eV/A: ${ok ? 'below' : 'not below'} it.`,
      });
    } else
      checks.push({
        id: 'force',
        label: 'Largest force against EDIFFG',
        state: 'unknown',
        text:
          s.ediffg === null
            ? `Largest force ${fix(r.forces.maxForce, 4)} eV/A. Enter EDIFFG to compare it (only a negative EDIFFG is a force criterion).`
            : `EDIFFG = ${s.ediffg} is an energy criterion, so the force is not what stops the run. Largest force ${fix(r.forces.maxForce, 4)} eV/A.`,
      });
  }
  if (last?.freeEnergyTOTEN !== undefined && last.energyWithoutEntropy !== undefined && nions) {
    const per = Math.abs(last.freeEnergyTOTEN - last.energyWithoutEntropy) / nions;
    checks.push({
      id: 'entropy',
      label: 'Entropy term per atom',
      state: per <= 1e-3 ? 'ok' : 'watch',
      heuristic: true,
      text: `|TOTEN minus energy without entropy| is ${meV(per)} per atom. The handbook's rule of thumb is to stay below about 1 meV per atom; above it, reduce SIGMA (heuristic).`,
    });
  } else
    checks.push({
      id: 'entropy',
      label: 'Entropy term per atom',
      state: 'unknown',
      text: 'Needs the TOTEN and "energy without entropy" lines and NIONS.',
    });
  checks.push({
    id: 'mag',
    label: 'Magnetization',
    state: r.magnetization ? 'ok' : 'unknown',
    text: r.magnetization
      ? `Total moment ${r.magnetization.value} Bohr magnetons.`
      : 'No magnetization value found (a non-spin-polarised run has none).',
  });
  return { notes, checks };
}

/** Read an OSZICAR or OUTCAR text. `kind` overrides the automatic guess. */
export function readOutput(
  text: string,
  settings: Partial<ReaderSettings> = {},
  kind?: FileGuess,
): ReaderResult {
  const k = kind ?? guessKind(text);
  const s: ReaderSettings = { ...DEFAULT_SETTINGS, ...settings };
  const empty: ReaderSummary = { ionicSteps: 0, electronicPerIonic: [] };
  if (k === 'OSZICAR') {
    const r = parseOszicar(text);
    const { notes, checks } = oszicarNotes(r, s);
    const last = r.ionic.at(-1);
    return {
      kind: k,
      notes: notes.sort((a, b) => a.line - b.line),
      checks,
      warnings: r.warnings,
      summary: {
        ionicSteps: r.ionic.length,
        electronicPerIonic: r.ionic.map((i) => i.nElectronic),
        ...(last ? { lastF: last.f, lastE0: last.e0 } : {}),
        ...(last?.dE !== undefined ? { lastDE: last.dE } : {}),
        ...(last?.mag !== undefined ? { mag: last.mag } : {}),
      },
    };
  }
  if (k === 'OUTCAR') {
    const r = parseOutcar(text);
    const { notes, checks } = outcarNotes(r, text, s);
    const last = r.ionic.at(-1);
    const per =
      last?.freeEnergyTOTEN !== undefined && last.energyWithoutEntropy !== undefined && r.nions
        ? Math.abs(last.freeEnergyTOTEN - last.energyWithoutEntropy) / r.nions.value
        : undefined;
    return {
      kind: k,
      notes: notes.sort((a, b) => a.line - b.line),
      checks,
      warnings: r.warnings,
      summary: {
        ionicSteps: r.ionic.length,
        electronicPerIonic: [],
        ...(last?.freeEnergyTOTEN !== undefined ? { lastF: last.freeEnergyTOTEN } : {}),
        ...(last?.energySigma0 !== undefined ? { lastE0: last.energySigma0 } : {}),
        ...(r.magnetization ? { mag: r.magnetization.value } : {}),
        ...(r.forces ? { maxForce: r.forces.maxForce } : {}),
        ...(per !== undefined ? { entropyPerAtom: per } : {}),
        ...(r.nions ? { nions: r.nions.value } : {}),
      },
    };
  }
  return {
    kind: 'unknown',
    notes: [],
    checks: [],
    summary: empty,
    warnings: ['This does not look like an OSZICAR or an OUTCAR. Paste the text or choose the file again.'],
  };
}

/** EDIFF, EDIFFG and NELM echoed in an OUTCAR parameter block, when present. Used to prefill the settings. */
export function echoedSettings(text: string): Partial<ReaderSettings> {
  const out: Partial<ReaderSettings> = {};
  const num = String.raw`([-+]?(?:\d+\.?\d*|\.\d+)(?:[EeDd][-+]?\d+)?)`;
  let m = new RegExp(String.raw`^\s*EDIFF\s*=\s*${num}`, 'm').exec(text);
  if (m) out.ediff = toNum(m[1]!);
  m = new RegExp(String.raw`^\s*EDIFFG\s*=\s*${num}`, 'm').exec(text);
  if (m) out.ediffg = toNum(m[1]!);
  m = /^\s*NELM\s*=\s*(\d+)/m.exec(text);
  if (m) out.nelm = Number(m[1]);
  return out;
}

/** Max lines shown line by line; a longer file is shown as the recognised lines only. */
export const MAX_SHOWN_LINES = 1500;

/** The text to show and the notes remapped to it. Short files are shown whole. */
export function excerptFor(
  text: string,
  notes: readonly ReadNote[],
): { text: string; notes: ReadNote[]; shortened: boolean; total: number } {
  const lines = text.replace(/\n$/, '').split(/\r?\n/);
  if (lines.length <= MAX_SHOWN_LINES)
    return { text, notes: [...notes], shortened: false, total: lines.length };
  const keep = [...new Set(notes.map((n) => n.line))].sort((a, b) => a - b);
  const at = new Map(keep.map((l, i) => [l, i + 1]));
  return {
    text: keep.map((l) => lines[l - 1] ?? '').join('\n'),
    notes: notes.map((n) => ({ ...n, line: at.get(n.line)! })),
    shortened: true,
    total: lines.length,
  };
}

const HEALTH_WORD: Record<Health, string> = {
  ok: 'looks healthy',
  watch: 'worth a look',
  problem: 'problem',
  info: '',
};
/** Label for the line explorer: the health is spelled out, never colour alone. */
export const noteLabel = (n: ReadNote): string =>
  n.health === 'info'
    ? n.label
    : `${n.label} (${HEALTH_WORD[n.health]}${n.heuristic ? ', rule of thumb' : ''})`;
