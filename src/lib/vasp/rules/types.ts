// Shared types for the INCAR validation engine. Pure, no DOM.
// @source S-019, S-041, S-042
import type { IncarEntry } from '../incar';
import type { ParsedKpoints } from '../kpoints';
import type { Structure } from '../../crystal/types';

export type Severity = 'error' | 'warn' | 'info';
export type SystemType = 'metal' | 'semiconductor' | 'insulator' | 'slab' | 'molecule' | 'unknown';
export type VaspVersion = '5.4' | '6.3' | '6.4';

/** Everything a rule may look at. ENMAX and ZVAL are typed by the user (the site never reads a POTCAR). */
export interface ValidateContext {
  incar: readonly IncarEntry[];
  kpoints?: ParsedKpoints;
  structure?: Structure;
  /** Largest ENMAX of the POTCARs, in eV (from `grep ENMAX POTCAR`). */
  enmaxEv?: number;
  /** Valence electrons per species (from `grep ZVAL POTCAR`). */
  zvalBySpecies?: Readonly<Record<string, number>>;
  systemType?: SystemType;
  cores?: number;
  vaspVersion?: VaspVersion;
  /** True when `kpoints` is the file given to VASP as KPOINTS_OPT (6.3 and newer), not as KPOINTS. */
  kpointsIsOpt?: boolean;
}

export interface Fix {
  label: string;
  /** Pure: returns a new INCAR, never changes its input. */
  apply: (incar: readonly IncarEntry[]) => IncarEntry[];
}

export interface Issue {
  rule: string;
  severity: Severity;
  title: string;
  /** Beginner-level explanation. */
  why: string;
  /** Optional deeper explanation. */
  whyDetail?: string;
  fix?: Fix;
  source: string[];
  /** Handbook entry the rule comes from, for example "field:t-moment". */
  handbook?: string;
  /** VASP versions the rule applies to. */
  vasp: string;
}

export interface Hit {
  why: string;
  whyDetail?: string;
  fix?: Fix;
  /** Overrides the rule's default severity (V032 reports an error and a warning). */
  severity?: Severity;
}

export interface Rule {
  id: string;
  title: string;
  severity: Severity;
  source: string[];
  handbook?: string;
  vasp: string;
  check: (ctx: ValidateContext, v: IncarView) => Hit[];
}

/** Read-only view of an INCAR with typed accessors. The last occurrence of a tag wins. */
export interface IncarView {
  has: (name: string) => boolean;
  raw: (name: string) => string | undefined;
  /** First token as a number (Fortran D exponents accepted), or undefined when absent or not numeric. */
  num: (name: string) => number | undefined;
  /** True/false for a Fortran logical, undefined when absent or not a logical. */
  bool: (name: string) => boolean | undefined;
  /** Upper-case first token, or undefined. */
  word: (name: string) => string | undefined;
}
