// Helpers shared by the rule files. Pure.
// @source S-042 (which elements count as d or f systems follows the dictionary entries for LMAXMIX and MAGMOM)
import type { IncarEntry } from '../incar';
import { expandRepeats, parseLogical } from '../incar';
import { speciesCounts } from '../../crystal/structure';
import type { Fix, IncarView, ValidateContext } from './types';

export function makeView(incar: readonly IncarEntry[]): IncarView {
  const raw = (n: string): string | undefined => {
    for (let i = incar.length - 1; i >= 0; i--) if (incar[i]!.name === n) return incar[i]!.value;
    return undefined;
  };
  const first = (n: string) => raw(n)?.trim().split(/\s+/)[0];
  return {
    has: (n) => raw(n) !== undefined,
    raw,
    num: (n) => {
      const t = first(n);
      if (t === undefined) return undefined;
      const x = Number(t.replace(/[dD]/, 'e'));
      return Number.isFinite(x) ? x : undefined;
    },
    bool: (n) => {
      const r = raw(n);
      if (r === undefined) return undefined;
      return parseLogical(r) ?? undefined;
    },
    word: (n) => first(n)?.toUpperCase(),
  };
}

export const setTag = (incar: readonly IncarEntry[], name: string, value: string): IncarEntry[] => {
  const out = incar.map((e) => ({ ...e }));
  for (let i = out.length - 1; i >= 0; i--)
    if (out[i]!.name === name) {
      out[i] = { ...out[i]!, value };
      return out;
    }
  out.push({ name, value });
  return out;
};

export const removeTag = (incar: readonly IncarEntry[], name: string): IncarEntry[] =>
  incar.filter((e) => e.name !== name).map((e) => ({ ...e }));

export const fixSet = (label: string, name: string, value: string): Fix => ({
  label,
  apply: (incar) => setTag(incar, name, value),
});
export const fixRemove = (label: string, name: string): Fix => ({
  label,
  apply: (incar) => removeTag(incar, name),
});

/** d-block elements (Sc to Zn, Y to Cd, Hf to Hg, Rf to Cn). */
const D = new Set(
  'Sc Ti V Cr Mn Fe Co Ni Cu Zn Y Zr Nb Mo Tc Ru Rh Pd Ag Cd Hf Ta W Re Os Ir Pt Au Hg Rf Db Sg Bh Hs Mt Ds Rg Cn'.split(
    ' ',
  ),
);
/** f-block elements (La to Yb and Ac to No; Lu and Lr are counted as d-block neighbours of the f series, so included as f). */
const F = new Set(
  'La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr'.split(' '),
);
export const isD = (el: string): boolean => D.has(el);
export const isF = (el: string): boolean => F.has(el);

export function hasD(ctx: ValidateContext): boolean {
  return !!ctx.structure && ctx.structure.species.some(isD);
}
export function hasF(ctx: ValidateContext): boolean {
  return !!ctx.structure && ctx.structure.species.some(isF);
}
export const nSpecies = (ctx: ValidateContext): number | undefined =>
  ctx.structure ? speciesCounts(ctx.structure).length : undefined;

export const isNoncollinear = (v: IncarView): boolean =>
  v.bool('LSORBIT') === true || v.bool('LNONCOLLINEAR') === true;

/** Number of values in an array tag, or undefined when absent or not numeric. */
export function arrayLength(v: IncarView, name: string): number | undefined {
  const r = v.raw(name);
  if (r === undefined) return undefined;
  try {
    return expandRepeats(r).length;
  } catch {
    return undefined;
  }
}

/** Full k-point count when it can be known without symmetry reduction. */
export function kpointTotal(ctx: ValidateContext): number | undefined {
  const k = ctx.kpoints;
  if (!k) return undefined;
  if (k.kind === 'mesh') return k.mesh[0] * k.mesh[1] * k.mesh[2];
  if (k.kind === 'explicit') return k.points.length;
  return undefined;
}

export const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
export const fmt = (x: number): string => String(Number(x.toPrecision(10)));
