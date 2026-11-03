import { useEffect, useState } from 'react';
import type { Level } from '../../../lib/levels';
import { normalizeLevel } from '../../../lib/levels';

/** Current reading level, following the site level switch (data-level on <html>). */
export function useLevel(): Level {
  const [level, setLevel] = useState<Level>('beginner');
  useEffect(() => {
    const read = () => setLevel(normalizeLevel(document.documentElement.dataset.level));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-level'] });
    return () => mo.disconnect();
  }, []);
  return level;
}

/** Copy text; falls back to a hidden textarea where the async clipboard is blocked. Returns success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('aria-hidden', 'true');
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function downloadBlob(name: string, data: BlobPart, type = 'text/plain'): void {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
