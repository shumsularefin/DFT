/**
 * Security rules tests (M6.5). They need the Firestore emulator, so they are not part of `npm test`.
 * Run: npm run test:rules   (needs Java; the emulator is started by `firebase emulators:exec`).
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

let env: RulesTestEnvironment;
const learner = JSON.stringify({ version: 1, concepts: {}, questions: {} });
const good = () => ({ version: 1, learner, updatedAt: serverTimestamp() });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-dft-rules',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(async () => env.cleanup());
beforeEach(async () => env.clearFirestore());

const owner = () => env.authenticatedContext('alice').firestore();
const ref = (db: ReturnType<typeof owner>, uid = 'alice') => doc(db, 'users', uid, 'state', 'main');

describe('firestore.rules', () => {
  it('the owner can create, read, update and delete their document', async () => {
    const db = owner();
    await assertSucceeds(setDoc(ref(db), good()));
    await assertSucceeds(getDoc(ref(db)));
    await assertSucceeds(setDoc(ref(db), good()));
    await assertSucceeds(deleteDoc(ref(db)));
  });

  it('another signed-in user cannot read, write or delete it', async () => {
    await assertSucceeds(setDoc(ref(owner()), good()));
    const bob = env.authenticatedContext('bob').firestore();
    await assertFails(getDoc(ref(bob, 'alice')));
    await assertFails(setDoc(ref(bob, 'alice'), good()));
    await assertFails(deleteDoc(ref(bob, 'alice')));
  });

  it('a signed-out visitor cannot read or write', async () => {
    await assertSucceeds(setDoc(ref(owner()), good()));
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(ref(anon)));
    await assertFails(setDoc(ref(anon), good()));
  });

  it('rejects an oversized payload', async () => {
    const big = 'x'.repeat(900_001);
    await assertFails(setDoc(ref(owner()), { ...good(), learner: big }));
    await assertSucceeds(setDoc(ref(owner()), { ...good(), learner: 'x'.repeat(900_000) }));
  });

  it('rejects an unknown field and a missing field', async () => {
    await assertFails(setDoc(ref(owner()), { ...good(), extra: 1 }));
    await assertFails(setDoc(ref(owner()), { version: 1, learner }));
  });

  it('rejects a wrong version, a non-string payload and a client-chosen timestamp', async () => {
    await assertFails(setDoc(ref(owner()), { ...good(), version: 2 }));
    await assertFails(setDoc(ref(owner()), { ...good(), learner: { a: 1 } }));
    await assertFails(setDoc(ref(owner()), { ...good(), updatedAt: Timestamp.fromMillis(0) }));
  });

  it('denies every other path, even for a signed-in user', async () => {
    const db = owner();
    await assertFails(setDoc(doc(db, 'users', 'alice', 'state', 'other'), good()));
    await assertFails(setDoc(doc(db, 'users', 'alice'), good()));
    await assertFails(setDoc(doc(db, 'public', 'x'), { a: 1 }));
  });
});
