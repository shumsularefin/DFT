// Cost-of-exactness curves for the Module 1 lab. Relative cost only: no timings, no prefactors.
// @source S-048 (Szabo and Ostlund: formal scaling of Hartree-Fock, MP2, coupled cluster)
// @source S-049 (Martin: cost of density functional calculations)
// The formal exponents are textbook results for the asymptotic limit and are recorded in the register as
// cited-from-memory (page-level check pending, Q-022). Curves marked "qualitative" show a shape only.

export type MethodId = 'force-field' | 'dft' | 'hf' | 'mp2' | 'ccsd' | 'ccsdt' | 'fci';

export interface Method {
  id: MethodId;
  label: string;
  /** Short name drawn at the end of the curve. */
  short: string;
  /** 'formal': cost proportional to size to a stated power. 'qualitative': shape only, no number is claimed. */
  kind: 'formal' | 'qualitative';
  /** Formal exponent p in cost ~ N^p. Null for qualitative curves. */
  exponent: number | null;
  /** One-line plain-language description of the growth. */
  growth: string;
  sources: string[];
}

export const METHODS: readonly Method[] = [
  {
    id: 'force-field',
    label: 'Force field (classical model)',
    short: 'FF',
    kind: 'qualitative',
    exponent: null,
    growth: 'roughly in step with the size (qualitative)',
    sources: [],
  },
  {
    id: 'dft',
    label: 'DFT (Kohn-Sham)',
    short: 'DFT',
    kind: 'formal',
    exponent: 3,
    growth: 'size to the power 3',
    sources: ['S-049'],
  },
  {
    id: 'hf',
    label: 'Hartree-Fock',
    short: 'HF',
    kind: 'formal',
    exponent: 4,
    growth: 'size to the power 4',
    sources: ['S-048'],
  },
  {
    id: 'mp2',
    label: 'MP2',
    short: 'MP2',
    kind: 'formal',
    exponent: 5,
    growth: 'size to the power 5',
    sources: ['S-048'],
  },
  {
    id: 'ccsd',
    label: 'Coupled cluster CCSD',
    short: 'CCSD',
    kind: 'formal',
    exponent: 6,
    growth: 'size to the power 6',
    sources: ['S-048'],
  },
  {
    id: 'ccsdt',
    label: 'Coupled cluster CCSD(T)',
    short: 'CCSD(T)',
    kind: 'formal',
    exponent: 7,
    growth: 'size to the power 7',
    sources: ['S-048'],
  },
  {
    id: 'fci',
    label: 'Exact solution (full configuration interaction)',
    short: 'Exact',
    kind: 'qualitative',
    exponent: null,
    growth: 'exponentially with the size (qualitative)',
    sources: [],
  },
];

/** Size range of the lab: from 1 to 100 times the smallest system shown. */
export const SIZE_MIN = 1;
export const SIZE_MAX = 100;

/** Decades per unit of size for the qualitative exponential curve. Shape only; chosen for legibility. */
export const FCI_DISPLAY_RATE = 0.2;

export function methodById(id: MethodId): Method {
  const m = METHODS.find((x) => x.id === id);
  if (!m) throw new Error(`unknown method ${id}`);
  return m;
}

/**
 * log10 of the cost relative to the cost at size 1, for a system `size` times larger than the smallest.
 * Formal methods: p * log10(size). Force field: log10(size). Exact: exponential shape, FCI_DISPLAY_RATE * (size - 1).
 * Working in logarithms avoids overflow. Sizes below 1 are clamped to 1.
 */
export function log10RelativeCost(id: MethodId, size: number): number {
  const s = Number.isFinite(size) ? Math.max(SIZE_MIN, size) : SIZE_MIN;
  const m = methodById(id);
  if (m.kind === 'formal') return (m.exponent as number) * Math.log10(s);
  if (id === 'force-field') return Math.log10(s);
  return FCI_DISPLAY_RATE * (s - 1);
}

/** Factor by which the cost grows when the size doubles, or null if the curve is qualitative. */
export function doublingFactor(id: MethodId): number | null {
  const m = methodById(id);
  return m.kind === 'formal' ? 2 ** (m.exponent as number) : null;
}

/** Slider value (log10 of the size multiple, 0 to 2) to size multiple. */
export const sizeFromSlider = (v: number): number => 10 ** v;
