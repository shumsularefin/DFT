/**
 * The real backend: Firebase Auth (Google popup) and Firestore lite. Loaded only after the user chooses
 * to sync, through a dynamic import from controller.ts. Document: users/{uid}/state/main with exactly
 * { version, learner (JSON text), updatedAt (server timestamp) }, checked by firestore.rules.
 * @source Firebase JS SDK documentation (S-069); the document shape is an engineering choice (D-083).
 */
import { initializeApp, getApps } from 'firebase/app';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { deleteDoc, doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore/lite';
import type { Backend } from './engine';
import type { FirebaseConfig } from './config';

export const DOC_VERSION = 1;

export function createFirebaseBackend(config: FirebaseConfig): Backend {
  const app = getApps()[0] ?? initializeApp(config);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const ref = (uid: string) => doc(db, 'users', uid, 'state', 'main');

  return {
    async signIn() {
      const r = await signInWithPopup(auth, new GoogleAuthProvider());
      return r.user.uid;
    },
    resume() {
      return new Promise((resolve, reject) => {
        const off = onAuthStateChanged(
          auth,
          (u) => {
            off();
            resolve(u ? u.uid : null);
          },
          (e) => {
            off();
            reject(e);
          },
        );
      });
    },
    async signOut() {
      await signOut(auth);
    },
    async load(uid) {
      const snap = await getDoc(ref(uid));
      if (!snap.exists()) return null;
      const d = snap.data() as { learner?: unknown };
      return typeof d.learner === 'string' ? d.learner : '{}';
    },
    async save(uid, learnerJson) {
      await setDoc(ref(uid), { version: DOC_VERSION, learner: learnerJson, updatedAt: serverTimestamp() });
    },
    async remove(uid) {
      await deleteDoc(ref(uid));
    },
  };
}
