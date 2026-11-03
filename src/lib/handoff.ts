// Tool hand-off through sessionStorage (ARCHITECTURE section 5). Payloads are validated on receipt.
import type { Mat3, Structure, Vec3 } from './crystal/types';

export type ToolId = 'tolerance-factor' | 'input-builder' | 'convergence' | 'kpath' | 'studio' | 'builder';
export const TOOL_IDS: readonly ToolId[] = [
  'tolerance-factor',
  'input-builder',
  'convergence',
  'kpath',
  'studio',
  'builder',
];

export interface SiteSpec {
  readonly occupants: readonly {
    symbol: string;
    oxidation: number;
    cn: number;
    spin?: 'HS' | 'LS';
    fraction: number;
  }[];
}

export type Handoff =
  | { v: 1; kind: 'structure'; from: ToolId; structure: Structure; label?: string }
  | { v: 1; kind: 'composition'; from: ToolId; a: SiteSpec; b: SiteSpec; x: SiteSpec; label?: string }
  | { v: 1; kind: 'molecule'; from: ToolId; xyz: string; smiles?: string };

export type HandoffKind = Handoff['kind'];
export const HANDOFF_KEY = 'dft:handoff';

/** The part of Storage we use, so tests need no DOM. */
export interface KV {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isVec3 = (x: unknown): x is Vec3 => Array.isArray(x) && x.length === 3 && x.every(isNum);

function isStructure(x: unknown): x is Structure {
  if (!isObj(x)) return false;
  const { lattice, species, frac, labels, selective, comment } = x;
  if (!Array.isArray(lattice) || lattice.length !== 3 || !lattice.every(isVec3)) return false;
  if (!Array.isArray(species) || !species.every(isStr)) return false;
  if (!Array.isArray(frac) || !frac.every(isVec3) || frac.length !== species.length) return false;
  if (
    labels !== undefined &&
    !(Array.isArray(labels) && labels.length === species.length && labels.every(isStr))
  )
    return false;
  if (
    selective !== undefined &&
    !(
      Array.isArray(selective) &&
      selective.length === species.length &&
      selective.every((f) => Array.isArray(f) && f.length === 3 && f.every((b) => typeof b === 'boolean'))
    )
  )
    return false;
  if (comment !== undefined && !isStr(comment)) return false;
  return true;
}

function isSite(x: unknown): x is SiteSpec {
  if (!isObj(x) || !Array.isArray(x.occupants)) return false;
  return x.occupants.every(
    (o) =>
      isObj(o) &&
      isStr(o.symbol) &&
      isNum(o.oxidation) &&
      isNum(o.cn) &&
      isNum(o.fraction) &&
      o.fraction >= 0 &&
      o.fraction <= 1 &&
      (o.spin === undefined || o.spin === 'HS' || o.spin === 'LS'),
  );
}

/** Runtime check of an unknown value. Returns the typed payload or null. */
export function validateHandoff(x: unknown): Handoff | null {
  if (!isObj(x) || x.v !== 1 || !isStr(x.from) || !(TOOL_IDS as readonly string[]).includes(x.from))
    return null;
  if (x.label !== undefined && !isStr(x.label)) return null;
  switch (x.kind) {
    case 'structure':
      return isStructure(x.structure) ? (x as unknown as Handoff) : null;
    case 'composition':
      return isSite(x.a) && isSite(x.b) && isSite(x.x) ? (x as unknown as Handoff) : null;
    case 'molecule':
      return isStr(x.xyz) && (x.smiles === undefined || isStr(x.smiles)) ? (x as unknown as Handoff) : null;
    default:
      return null;
  }
}

function defaultStore(): KV | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Store the payload. Returns false when storage is unavailable or full; the caller then does not navigate. */
export function stashHandoff(h: Handoff, store: KV | null = defaultStore()): boolean {
  if (!store) return false;
  try {
    store.setItem(HANDOFF_KEY, JSON.stringify(h));
    return true;
  } catch {
    return false;
  }
}

/** Store the payload and navigate to `toUrl`. */
export function sendHandoff(
  h: Handoff,
  toUrl: string,
  store: KV | null = defaultStore(),
  go?: (u: string) => void,
): boolean {
  if (!stashHandoff(h, store)) return false;
  (go ?? ((u: string) => window.location.assign(u)))(toUrl);
  return true;
}

/** Read and clear the payload once. Returns null when absent, malformed, or not one of `kinds`. Always clears. */
export function takeHandoff(
  kinds: readonly HandoffKind[],
  store: KV | null = defaultStore(),
): Handoff | null {
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(HANDOFF_KEY);
    store.removeItem(HANDOFF_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const h = validateHandoff(parsed);
  return h && kinds.includes(h.kind) ? h : null;
}

export type { Mat3 };
