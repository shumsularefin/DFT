// Firestore security rules (M6.5). Needs the Firestore emulator (Java):
//   npm run test:rules
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const good = () => ({ v: 1, payload: '{"version":1}', updatedAt: serverTimestamp() });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dft-handbook',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const mine = (uid = 'alice') => env.authenticatedContext(uid).firestore();
const ref = (db: ReturnType<typeof mine>, uid = 'alice') => doc(db, 'users', uid, 'state', 'main');

describe('firestore.rules', () => {
  it('the owner can write, read and delete their document', async () => {
    const db = mine();
    await assertSucceeds(setDoc(ref(db), good()));
    await assertSucceeds(getDoc(ref(db)));
    await assertSucceeds(deleteDoc(ref(db)));
  });
  it('another user cannot read or write it', async () => {
    await assertSucceeds(setDoc(ref(mine()), good()));
    const bob = mine('bob');
    await assertFails(getDoc(ref(bob, 'alice')));
    await assertFails(setDoc(ref(bob, 'alice'), good()));
    await assertFails(deleteDoc(ref(bob, 'alice')));
  });
  it('an unauthenticated visitor cannot read or write', async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(ref(anon)));
    await assertFails(setDoc(ref(anon), good()));
  });
  it('rejects an oversized payload', async () => {
    await assertFails(setDoc(ref(mine()), { ...good(), payload: 'x'.repeat(900_001) }));
    await assertSucceeds(setDoc(ref(mine()), { ...good(), payload: 'x'.repeat(900_000) }));
  });
  it('rejects unknown or missing fields and wrong types', async () => {
    await assertFails(setDoc(ref(mine()), { ...good(), extra: true }));
    await assertFails(setDoc(ref(mine()), { v: 1, payload: '{}' }));
    await assertFails(setDoc(ref(mine()), { ...good(), updatedAt: 'yesterday' }));
    await assertFails(setDoc(ref(mine()), { ...good(), v: 2 }));
    await assertFails(setDoc(ref(mine()), { ...good(), payload: { a: 1 } }));
  });
  it('denies every other path', async () => {
    await assertFails(setDoc(doc(mine(), 'users', 'alice'), { a: 1 }));
    await assertFails(setDoc(doc(mine(), 'other', 'x'), { a: 1 }));
  });
});
