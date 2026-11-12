// Per-ionic-step energy and largest force from an OUTCAR (every "TOTAL-FORCE" block and every "free energy TOTEN").
// VASP prints the forces of a step before that step's energy block, so the i-th force block is paired with the i-th
// energy. If the counts differ (a run cut off), the extra entries are kept without a partner.
// @source S-019, S-041
export interface RelaxStep {
  step: number;
  /** Free energy TOTEN, eV. */
  energy?: number;
  /** Largest force magnitude over atoms, eV/Angstrom. */
  maxForce?: number;
}

const TOTEN = /free\s+energy\s+TOTEN\s*=\s*(-?\d+\.?\d*(?:[eEdD][-+]?\d+)?)\s*eV/;
const FORCES = /TOTAL-FORCE\s*\(eV\/Angst\)/;

export function outcarSteps(text: string): RelaxStep[] {
  const lines = text.split(/\r?\n/);
  const energies: number[] = [];
  const forces: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i]!;
    let m: RegExpExecArray | null;
    if (s.includes('TOTEN') && (m = TOTEN.exec(s))) energies.push(Number(m[1]!.replace(/[dD]/, 'e')));
    else if (s.includes('TOTAL-FORCE') && FORCES.test(s)) {
      let max = 0;
      for (let j = i + 2; j < lines.length; j++) {
        const t = lines[j]!.trim();
        if (t === '' || /^-+$/.test(t)) break;
        const v = t.split(/\s+/).map(Number);
        if (v.length >= 6 && v.every(Number.isFinite)) max = Math.max(max, Math.hypot(v[3]!, v[4]!, v[5]!));
      }
      forces.push(max);
    }
  }
  const n = Math.max(energies.length, forces.length);
  const out: RelaxStep[] = [];
  for (let k = 0; k < n; k++) {
    const e = energies[k];
    const f = forces[k];
    out.push({
      step: k + 1,
      ...(e !== undefined ? { energy: e } : {}),
      ...(f !== undefined ? { maxForce: f } : {}),
    });
  }
  return out;
}
