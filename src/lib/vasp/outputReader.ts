// Output reader for the "output-reader" lab (M7.3): turns a parsed OSZICAR or OUTCAR into plain-language line notes
// and health checks. Pure; built on the M4.1 parsers. Thresholds are the author's rules of thumb (S-042) and VASP
// defaults (S-019), and are labelled as such in the UI.
// @source S-019 (NELM default 60, EDIFFG sign convention), S-041 (OSZICAR and OUTCAR entries), S-042 (T*S below
// about 1 meV per atom; a step that used NELM steps did not converge)
import { parseOszicar, type OszicarResult } from './oszicar';
import { parseOutcar, type OutcarResult } from './outcar';

export type Health = 'ok' | 'warn' | 'bad' | 'info';

export interface LineNote {
  line: number;
  text: string;
  health: Health;
}

export interface Check {
  label: string;
  value: string;
  health: Health;
  why: string;
}

export interface OutputReport {
  kind: 'OSZICAR' | 'OUTCAR' | 'unknown';
  notes: LineNote[];
  checks: Check[];
  /** For plots: one entry per ionic step (OSZICAR: F and electronic steps; OUTCAR: TOTEN). */
  ionic: { step: number; energy: number; nElectronic?: number; mag?: number }[];
  /** Electronic |dE| per step of the whole run, for the convergence plot (OSZICAR only). */
  electronic: number[];
  oszicar?: OszicarResult;
  outcar?: OutcarResult;
}

export interface ReaderOptions {
  /** Maximum electronic steps (VASP default 60). */
  nelm?: number;
  /** Ionic stop criterion; negative = force in eV/Angstrom. */
  ediffg?: number;
  /** Number of atoms, used for per-atom checks when the file does not say. */
  atoms?: number;
}

export const DEFAULT_NELM = 60;

export function detectKind(text: string): OutputReport['kind'] {
  if (/^\s*(DAV|RMM|CGA|CG|EDDAV|DIA):\s+\d+/m.test(text) || /^\s*\d+\s+F\s*=/m.test(text)) {
    // OUTCAR also contains "F=" in places; it always has typical OUTCAR markers
    if (/TOTEN|NIONS|POSITION\s+TOTAL-FORCE/.test(text)) return 'OUTCAR';
    return 'OSZICAR';
  }
  if (/TOTEN|NIONS|TOTAL-FORCE|vasp\.\d/.test(text)) return 'OUTCAR';
  return 'unknown';
}

const fmt = (x: number, d = 4) => (Math.abs(x) >= 1e-3 || x === 0 ? x.toFixed(d) : x.toExponential(2));

function readOszicar(text: string, o: ReaderOptions): OutputReport {
  const r = parseOszicar(text);
  const nelm = o.nelm ?? DEFAULT_NELM;
  const notes: LineNote[] = [];
  const checks: Check[] = [];
  for (const e of r.electronic) {
    notes.push({
      line: e.line,
      health: 'info',
      text: `Electronic step ${e.n} (${e.solver}): free energy ${fmt(e.e)} eV, change dE = ${e.dE.toExponential(2)} eV since the previous step.`,
    });
  }
  for (const s of r.ionic) {
    const hitNelm = s.nElectronic >= nelm;
    notes.push({
      line: s.line,
      health: hitNelm ? 'bad' : 'ok',
      text:
        `Ionic step ${s.step}: F = ${fmt(s.f)} eV (free energy), E0 = ${fmt(s.e0)} eV (sigma -> 0)` +
        (s.dE !== undefined ? `, change ${s.dE.toExponential(2)} eV` : '') +
        (s.mag !== undefined ? `, total moment ${s.mag} Bohr magnetons` : '') +
        `; ${s.nElectronic} electronic steps${hitNelm ? `, which is NELM (${nelm}): this step did not converge` : ''}.`,
    });
  }
  const capped = r.ionic.filter((s) => s.nElectronic >= nelm).length;
  checks.push({
    label: 'Ionic steps',
    value: String(r.ionic.length),
    health: r.ionic.length ? 'info' : 'warn',
    why: r.ionic.length
      ? 'One summary line per ionic step.'
      : 'No ionic summary line yet: the run may still be in its first step.',
  });
  checks.push({
    label: 'Steps that hit NELM',
    value: `${capped} (NELM = ${nelm})`,
    health: capped ? 'bad' : 'ok',
    why: capped
      ? 'A step that used NELM electronic steps did not converge; its forces are unreliable. Fix the mixing first.'
      : 'Every ionic step converged electronically before NELM.',
  });
  const last = r.ionic.at(-1);
  if (last?.mag !== undefined)
    checks.push({
      label: 'Total magnetic moment',
      value: `${last.mag} Bohr magnetons`,
      health: 'info',
      why: 'From mag= on the last ionic line.',
    });
  if (r.ionic.length >= 2) {
    const d = Math.abs(r.ionic.at(-1)!.f - r.ionic.at(-2)!.f);
    checks.push({
      label: 'Energy change of the last ionic step',
      value: `${d.toExponential(2)} eV`,
      health: 'info',
      why: 'Small and steady changes mean the relaxation is settling.',
    });
  }
  return {
    kind: 'OSZICAR',
    notes: notes.sort((a, b) => a.line - b.line),
    checks,
    ionic: r.ionic.map((s) => ({ step: s.step, energy: s.f, nElectronic: s.nElectronic, mag: s.mag })),
    electronic: r.electronic.map((e) => Math.abs(e.dE)),
    oszicar: r,
  };
}

function readOutcar(text: string, o: ReaderOptions): OutputReport {
  const r = parseOutcar(text);
  const notes: LineNote[] = [];
  const checks: Check[] = [];
  const atoms = r.nions?.value ?? o.atoms;
  if (r.version)
    checks.push({
      label: 'VASP version',
      value: r.version,
      health: 'info',
      why: 'From the first line of OUTCAR.',
    });
  if (r.nions) notes.push({ line: r.nions.line, health: 'info', text: `${r.nions.value} atoms (NIONS).` });
  if (r.encut)
    notes.push({
      line: r.encut.line,
      health: 'info',
      text: `ENCUT actually used: ${r.encut.value} eV. Check it is the value you intended.`,
    });
  r.enmax.forEach((e, i) =>
    notes.push({
      line: e.line,
      health: 'info',
      text: `ENMAX of POTCAR ${i + 1}: ${e.value} eV. ENCUT should be at least 1.3 times the largest for relaxations.`,
    }),
  );
  if (r.encut && r.enmax.length) {
    const ratio = r.encut.value / Math.max(...r.enmax.map((e) => e.value));
    checks.push({
      label: 'ENCUT / largest ENMAX',
      value: ratio.toFixed(2),
      health: ratio >= 1.3 - 1e-9 ? 'ok' : 'warn',
      why: 'The protocol uses 1.3 x ENMAX so that the stress converges (Pulay stress). Heuristic.',
    });
  }
  if (r.nkpts)
    notes.push({
      line: r.nkpts.line,
      health: 'info',
      text: `${r.nkpts.value} irreducible k-points and ${r.nbands?.value ?? '?'} bands.`,
    });
  for (const l of r.electronicLoops)
    notes.push({
      line: l.line,
      health: l.reached ? 'ok' : 'bad',
      text: l.reached
        ? 'This electronic loop reached EDIFF.'
        : 'This electronic loop stopped at NELM without reaching EDIFF.',
    });
  const notReached = r.electronicLoops.filter((l) => !l.reached).length;
  checks.push({
    label: 'Electronic loops that missed EDIFF',
    value: `${notReached} of ${r.electronicLoops.length}`,
    health: notReached ? 'bad' : 'ok',
    why: notReached
      ? 'Forces and energies from those steps are unreliable.'
      : 'Every electronic loop converged.',
  });
  r.ionic.forEach((s, i) => {
    if (s.freeEnergyTOTEN !== undefined)
      notes.push({
        line: s.line,
        health: 'info',
        text: `Ionic step ${i + 1}: free energy TOTEN = ${fmt(s.freeEnergyTOTEN)} eV.`,
      });
  });
  const lastE = [...r.ionic]
    .reverse()
    .find((s) => s.energyWithoutEntropy !== undefined && s.freeEnergyTOTEN !== undefined);
  if (lastE && atoms) {
    const ts = Math.abs(lastE.energyWithoutEntropy! - lastE.freeEnergyTOTEN!);
    const perAtom = (ts / atoms) * 1000;
    checks.push({
      label: 'Entropy term T*S per atom',
      value: `${perAtom.toFixed(3)} meV`,
      health: perAtom < 1 ? 'ok' : 'warn',
      why: 'Difference between the energy without entropy and TOTEN, per atom. The rule of thumb is below about 1 meV per atom; otherwise reduce SIGMA. Heuristic.',
    });
  }
  for (const p of r.pressure)
    notes.push({
      line: p.line,
      health: 'info',
      text: `External pressure ${p.pressureKb} kB (Pulay stress ${p.pulayKb} kB). Near zero after a converged cell relaxation.`,
    });
  if (r.forces) {
    const lim = o.ediffg !== undefined && o.ediffg < 0 ? Math.abs(o.ediffg) : undefined;
    notes.push({
      line: r.forces.line,
      health: lim === undefined ? 'info' : r.forces.maxForce <= lim ? 'ok' : 'warn',
      text: `Forces on each atom (eV/Angstrom). The largest is ${r.forces.maxForce.toFixed(4)}.`,
    });
    checks.push({
      label: 'Largest force',
      value: `${r.forces.maxForce.toFixed(4)} eV/Angstrom`,
      health: lim === undefined ? 'info' : r.forces.maxForce <= lim ? 'ok' : 'warn',
      why:
        lim === undefined
          ? 'Enter a negative EDIFFG to compare: a relaxation stops when every force is below |EDIFFG|.'
          : `Compared with |EDIFFG| = ${lim} eV/Angstrom.`,
    });
  }
  if (r.magnetization) {
    notes.push({
      line: r.magnetization.line,
      health: 'info',
      text: `Total magnetization ${r.magnetization.value} Bohr magnetons.`,
    });
    checks.push({
      label: 'Total magnetization',
      value: `${r.magnetization.value} Bohr magnetons`,
      health: 'info',
      why: 'From the last "number of electron ... magnetization" line.',
    });
  }
  if (r.efermi)
    notes.push({
      line: r.efermi.line,
      health: 'info',
      text: `Fermi energy ${r.efermi.value} eV: subtract it from DOS and band energies.`,
    });
  if (r.reachedRequiredAccuracyLine)
    notes.push({
      line: r.reachedRequiredAccuracyLine,
      health: 'ok',
      text: 'The relaxation met EDIFFG and stopped normally.',
    });
  checks.push({
    label: '"reached required accuracy"',
    value: r.reachedRequiredAccuracy ? 'present' : 'missing',
    health: r.reachedRequiredAccuracy ? 'ok' : 'warn',
    why: r.reachedRequiredAccuracy
      ? 'The relaxation converged.'
      : 'Missing in a relaxation means it stopped at NSW or was killed. Not expected in a static run.',
  });
  if (r.elapsedSec)
    notes.push({
      line: r.elapsedSec.line,
      health: 'ok',
      text: `Run finished normally after ${r.elapsedSec.value} s.`,
    });
  checks.push({
    label: 'Finished normally',
    value: r.elapsedSec ? 'yes' : 'no "Elapsed time" line',
    health: r.elapsedSec ? 'ok' : 'warn',
    why: r.elapsedSec
      ? 'VASP writes the timing at the very end.'
      : 'The run may still be going, or it crashed or was killed.',
  });
  return {
    kind: 'OUTCAR',
    notes: notes.sort((a, b) => a.line - b.line),
    checks,
    ionic: r.ionic.flatMap((s, i) =>
      s.freeEnergyTOTEN !== undefined ? [{ step: i + 1, energy: s.freeEnergyTOTEN }] : [],
    ),
    electronic: [],
    outcar: r,
  };
}

/** Read an OSZICAR or OUTCAR (detected from the text). */
export function readOutput(text: string, o: ReaderOptions = {}): OutputReport {
  const kind = detectKind(text);
  if (kind === 'OSZICAR') return readOszicar(text, o);
  if (kind === 'OUTCAR') return readOutcar(text, o);
  return { kind, notes: [], checks: [], ionic: [], electronic: [] };
}
