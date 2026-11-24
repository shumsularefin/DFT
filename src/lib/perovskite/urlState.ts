// URL fragment encoding and lanthanide A-site coordination policy helpers for /tools/tolerance-factor/.
// @source S-001 (Shannon 1976), S-003 (Bartel 2019), D-028 (rare-earth CN policy).
import { coordinations, oxidationStates, spins, type Geometry, type RadiusKind, type Spin } from './shannon';
import type { Occupant } from './sites';

export type LnCnPolicy = 'cn12' | 'cn9' | 'cn8' | 'highest';

export const LANTHANIDE_A_SYMBOLS = new Set([
  'La',
  'Ce',
  'Pr',
  'Nd',
  'Pm',
  'Sm',
  'Eu',
  'Gd',
  'Tb',
  'Dy',
  'Ho',
  'Er',
  'Tm',
  'Yb',
  'Lu',
  'Y',
]);

export function hasLanthanide(occupants: readonly Occupant[]): boolean {
  return occupants.some((o) => LANTHANIDE_A_SYMBOLS.has(o.el));
}

/** Resolve the A-site coordination number for an Ln/Y ion under a chosen policy (D-028). */
export function resolveLnCn(el: string, ox: number, policy: LnCnPolicy): number {
  if (policy === 'cn12') return 12;
  if (policy === 'cn9') return 9;
  if (policy === 'cn8') return 8;
  const avail = coordinations(el, ox)
    .filter((c) => c.geometry === null)
    .map((c) => c.cn);
  if (avail.length === 0) return 12;
  const le12 = avail.filter((c) => c <= 12);
  return le12.length > 0 ? Math.max(...le12) : Math.max(...avail);
}

/** Build a sensible default Occupant when a user picks a new element on site A, B, or X. */
export function defaultOccupant(
  el: string,
  site: 'A' | 'B' | 'X',
  fraction = 1,
  lnPolicy: LnCnPolicy = 'cn12',
): Occupant {
  const oxList = oxidationStates(el);
  let ox = site === 'X' ? -2 : site === 'A' ? 2 : 4;
  if (oxList.length > 0 && !oxList.includes(ox)) {
    const preferred = site === 'X' ? oxList.filter((o) => o < 0) : oxList.filter((o) => o > 0);
    ox = preferred[0] ?? oxList[0]!;
  }
  const targetCn = site === 'A' ? (LANTHANIDE_A_SYMBOLS.has(el) ? resolveLnCn(el, ox, lnPolicy) : 12) : 6;
  const cnList = coordinations(el, ox);
  const hasTarget = cnList.some((c) => c.cn === targetCn && c.geometry === null);
  const cn =
    site === 'A' && LANTHANIDE_A_SYMBOLS.has(el) && lnPolicy === 'cn12'
      ? 12
      : hasTarget
        ? targetCn
        : (cnList.find((c) => c.geometry === null)?.cn ?? cnList[0]?.cn ?? targetCn);
  const geometry: Geometry | null = cnList.some((c) => c.cn === cn && c.geometry === null)
    ? null
    : (cnList.find((c) => c.cn === cn)?.geometry ?? null);
  const spList = spins(el, ox, cn, geometry).filter((s): s is Spin => s !== null);
  const out: Occupant = { el, ox, cn, fraction };
  if (geometry) out.geometry = geometry;
  if (spList.length > 0) out.spin = spList[0]!;
  return out;
}

export interface CompositionState {
  A: Occupant[];
  B: Occupant[];
  X: Occupant[];
  kind: RadiusKind;
  lnPolicy: LnCnPolicy;
}

function encodeSite(occs: readonly Occupant[]): string {
  return occs.map((o) => [o.el, o.ox, o.cn, o.spin ?? '', o.geometry ?? '', o.fraction].join(':')).join(',');
}

function decodeSite(raw: string | null): Occupant[] | null {
  if (!raw) return null;
  const parts = raw.split(',').filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  const out: Occupant[] = [];
  for (const p of parts) {
    const [el, oxS, cnS, spS, geoS, frS] = p.split(':');
    const ox = Number(oxS);
    const cn = Number(cnS);
    const fraction = Number(frS ?? '1');
    if (!el || !Number.isFinite(ox) || !Number.isFinite(cn) || !Number.isFinite(fraction)) return null;
    const occ: Occupant = { el, ox, cn, fraction };
    if (spS === 'HS' || spS === 'LS') occ.spin = spS;
    if (geoS === 'SQ' || geoS === 'PY') occ.geometry = geoS;
    out.push(occ);
  }
  return out;
}

export function encodeCompositionHash(state: CompositionState): string {
  const params = new URLSearchParams();
  params.set('a', encodeSite(state.A));
  params.set('b', encodeSite(state.B));
  params.set('x', encodeSite(state.X));
  if (state.kind !== 'ionic') params.set('k', state.kind);
  if (state.lnPolicy !== 'cn12') params.set('ln', state.lnPolicy);
  return `#${params.toString()}`;
}

export function decodeCompositionHash(hash: string): CompositionState | null {
  const clean = hash.replace(/^#/, '');
  if (!clean) return null;
  const params = new URLSearchParams(clean);
  const A = decodeSite(params.get('a'));
  const B = decodeSite(params.get('b'));
  const X = decodeSite(params.get('x'));
  if (!A || !B || !X) return null;
  const k = params.get('k');
  const kind: RadiusKind = k === 'crystal' ? 'crystal' : 'ionic';
  const ln = params.get('ln');
  const lnPolicy: LnCnPolicy = ln === 'cn9' || ln === 'cn8' || ln === 'highest' ? ln : 'cn12';
  return { A, B, X, kind, lnPolicy };
}
