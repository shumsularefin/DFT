/**
 * Firebase web configuration read from PUBLIC_FIREBASE_* build variables (D-026).
 * Firebase web config is public by design, but it is injected at build time and never written into the
 * repository. With any value missing the sync feature is hidden and the site works unchanged.
 */
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

type Env = Record<string, unknown>;

export function readConfig(env: Env): FirebaseConfig | null {
  const get = (k: string) => {
    const v = env[`PUBLIC_FIREBASE_${k}`];
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : '';
  };
  const apiKey = get('API_KEY');
  const authDomain = get('AUTH_DOMAIN');
  const projectId = get('PROJECT_ID');
  const appId = get('APP_ID');
  if (!apiKey || !authDomain || !projectId || !appId) return null;
  return { apiKey, authDomain, projectId, appId };
}
