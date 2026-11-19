import { describe, expect, it } from 'vitest';
import { readConfig } from './config';

const full = {
  PUBLIC_FIREBASE_API_KEY: 'k',
  PUBLIC_FIREBASE_AUTH_DOMAIN: 'd.example',
  PUBLIC_FIREBASE_PROJECT_ID: 'p',
  PUBLIC_FIREBASE_APP_ID: 'a',
};

describe('sync config', () => {
  it('is null with no variables, so the feature stays hidden', () => {
    expect(readConfig({})).toBeNull();
  });
  it('is null when any one variable is missing or blank', () => {
    for (const k of Object.keys(full)) {
      expect(readConfig({ ...full, [k]: '' })).toBeNull();
      expect(readConfig({ ...full, [k]: '  ' })).toBeNull();
      const rest: Record<string, string> = { ...full };
      delete rest[k];
      expect(readConfig(rest)).toBeNull();
    }
  });
  it('reads the four values', () => {
    expect(readConfig(full)).toEqual({ apiKey: 'k', authDomain: 'd.example', projectId: 'p', appId: 'a' });
  });
});
