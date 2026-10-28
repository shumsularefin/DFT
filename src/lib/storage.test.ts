import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getJSON, remove, setJSON } from './storage';

class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

const throwing = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
  removeItem() {
    throw new Error('blocked');
  },
};

function install(s: unknown) {
  Object.defineProperty(globalThis, 'localStorage', { value: s, configurable: true, writable: true });
}

describe('storage', () => {
  let mem: MemoryStorage;
  beforeEach(() => {
    mem = new MemoryStorage();
    install(mem);
  });
  afterEach(() => {
    // @ts-expect-error cleanup of the test fake
    delete globalThis.localStorage;
  });

  it('round-trips a value', () => {
    expect(setJSON('a', { x: [1, 2] })).toBe(true);
    expect(getJSON('a', null)).toEqual({ x: [1, 2] });
  });

  it('returns the fallback for a missing key', () => {
    expect(getJSON('missing', 42)).toBe(42);
  });

  it('returns the fallback on version mismatch', () => {
    mem.setItem('dft:a', JSON.stringify({ v: 999, data: 'old' }));
    expect(getJSON('a', 'fb')).toBe('fb');
  });

  it('returns the fallback on corrupt JSON', () => {
    mem.setItem('dft:a', '{not json');
    expect(getJSON('a', 'fb')).toBe('fb');
  });

  it('namespaces keys with dft:', () => {
    setJSON('k', 1);
    expect([...mem.map.keys()]).toEqual(['dft:k']);
    remove('k');
    expect(mem.map.size).toBe(0);
  });

  it('does not throw when storage throws', () => {
    install(throwing);
    expect(getJSON('a', 'fb')).toBe('fb');
    expect(setJSON('a', 1)).toBe(false);
    expect(() => remove('a')).not.toThrow();
  });
});
