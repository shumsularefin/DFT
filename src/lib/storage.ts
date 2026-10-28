// Versioned, namespaced, failure-tolerant wrapper around localStorage.
// Every call swallows storage errors (private windows, blocked site data) and falls back.
const PREFIX = 'dft:';
const VERSION = 1;

type Envelope<T> = { v: number; data: T };

function store(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function getJSON<T>(key: string, fallback: T): T {
  try {
    const raw = store()?.getItem(PREFIX + key);
    if (raw == null) return fallback;
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env !== 'object' || env.v !== VERSION || !('data' in env)) return fallback;
    return env.data;
  } catch {
    return fallback;
  }
}

export function setJSON<T>(key: string, value: T): boolean {
  try {
    const s = store();
    if (!s) return false;
    s.setItem(PREFIX + key, JSON.stringify({ v: VERSION, data: value } satisfies Envelope<T>));
    return true;
  } catch {
    return false;
  }
}

export function remove(key: string): void {
  try {
    store()?.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}
