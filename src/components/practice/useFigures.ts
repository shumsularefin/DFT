import { useEffect, useState } from 'react';
import type { Figure } from '../../lib/visual/resolve';

type Figures = Record<string, Figure | null>;
let pending: Promise<Figures> | null = null;

/** Fetches the build-time figure file once, after the page is open. Null until it arrives (or if it cannot be fetched). */
export function useFigures(): Figures | null {
  const [figs, setFigs] = useState<Figures | null>(null);
  useEffect(() => {
    let live = true;
    pending ??= fetch('/data/figures.v1.json').then((r) => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json() as Promise<Figures>;
    });
    pending
      .then((f) => live && setFigs(f))
      .catch(() => {
        pending = null;
      });
    return () => {
      live = false;
    };
  }, []);
  return figs;
}
