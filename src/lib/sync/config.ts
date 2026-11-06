// Firebase web config from PUBLIC_FIREBASE_* build variables (D-026). These are public identifiers, not
// secrets, but they are never written into the source. Missing values hide the sync feature entirely.
export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
}

export function readConfig(env: Record<string, string | undefined>): FirebaseConfig | null {
  const c = {
    apiKey: env.PUBLIC_FIREBASE_API_KEY ?? '',
    authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: env.PUBLIC_FIREBASE_PROJECT_ID ?? '',
    appId: env.PUBLIC_FIREBASE_APP_ID ?? '',
  };
  return Object.values(c).every((v) => v.trim() !== '') ? c : null;
}

export const firebaseConfig: FirebaseConfig | null = readConfig(
  import.meta.env as Record<string, string | undefined>,
);
