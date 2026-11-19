import { useEffect, useState } from 'react';
import type { Figure } from '../../lib/visual/resolve';

type Figures = Record<string, Figure | null>;
let pending: Promise<Figures> | null = null;

async function load(tries = 3): Promise<Figures> {
  try {
    const r = await fetch('/data/figures.v1.json');
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as Figures;
  } catch (e) {
    if (tries <= 1) throw e;
    await new Promise((res) => setTimeout(res, 400));
    return load(tries - 1);
  }
}

/** Fetches the build-time figure file once, after the page is open. Null until it arrives (or if it cannot be fetched). */
export function useFigures(): Figures | null {
  const [figs, setFigs] = useState<Figures | null>(null);
  useEffect(() => {
    let live = true;
    pending ??= load();
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
