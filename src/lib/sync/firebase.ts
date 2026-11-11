// The real sync backend (M6.5). Loaded with a dynamic import only after the person chooses to sync, so
// Firebase never ships in a page's initial JavaScript. Firestore lite: no listeners, no offline cache;
// this device's storage stays the source of truth.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore/lite';
import type { FirebaseConfig } from './config';
import type { SyncBackend } from './engine';

let app: FirebaseApp | null = null;
let auth: Auth;
let db: Firestore;

export function init(config: FirebaseConfig, emulators = false): void {
  if (app) return;
  app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  if (emulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
  }
}

/** Resolves with the signed-in user, or null, once Firebase has restored any previous session. */
export const currentUser = (): Promise<User | null> =>
  new Promise((resolve) => {
    const stop = onAuthStateChanged(auth, (u) => {
      stop();
      resolve(u);
    });
  });

export async function signIn(): Promise<User> {
  return (await signInWithPopup(auth, new GoogleAuthProvider())).user;
}

export const signOut = (): Promise<void> => fbSignOut(auth);

export function backendFor(uid: string): SyncBackend {
  const ref = doc(db, 'users', uid, 'state', 'main');
  return {
    async load() {
      const snap = await getDoc(ref);
      const p = snap.exists() ? snap.data().payload : null;
      return typeof p === 'string' ? p : null;
    },
    async save(payload) {
      await setDoc(ref, { v: 1, payload, updatedAt: serverTimestamp() });
    },
    async remove() {
      await deleteDoc(ref);
    },
  };
}
