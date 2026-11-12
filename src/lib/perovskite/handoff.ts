/** Hand-off payloads from the tolerance explorer (validated by `validateHandoff`, ARCHITECTURE section 5). */
import { takeHandoff, validateHandoff, type Handoff, type SiteSpec, type KV } from '../handoff';
import type { Composition } from './checks';
import type { Occupant } from './sites';

const site = (occ: readonly Occupant[]): SiteSpec => ({
  occupants: occ.map((o) => ({
    symbol: o.el,
    oxidation: o.ox,
    cn: o.cn,
    fraction: o.fraction,
    ...(o.spin ? { spin: o.spin } : {}),
  })),
});

/** The composition kind, read by the Material Builder (composition) and the Screening Studio (system filter). */
export function compositionHandoff(c: Composition, label?: string): Handoff {
  const h: Handoff = {
    v: 1,
    kind: 'composition',
    from: 'tolerance-factor',
    a: site(c.A),
    b: site(c.B),
    x: site(c.X),
    ...(label ? { label } : {}),
  };
  const checked = validateHandoff(JSON.parse(JSON.stringify(h)));
  if (!checked) throw new Error('hand-off payload failed validation');
  return checked;
}

/** Chemical system in the form a Studio filter uses, for example "Sr-Ti-O" (A, B, then X, each element once). */
export function chemicalSystem(c: Composition): string {
  const seen: string[] = [];
  for (const k of ['A', 'B', 'X'] as const) for (const o of c[k]) if (!seen.includes(o.el)) seen.push(o.el);
  return seen.join('-');
}

/** Tools that can receive a composition. `built: false` means there is no page to open yet. */
export const TARGETS = [
  { id: 'builder', name: 'Material Builder', url: '/tools/builder/', built: false },
  { id: 'studio', name: 'Screening Studio', url: '/tools/studio/', built: false },
] as const;

export { takeHandoff };
export type { KV };
