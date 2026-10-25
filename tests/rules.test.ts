import { readFileSync } from 'node:fs';
import { after, before, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
} from 'firebase/firestore';
let env: RulesTestEnvironment;
const training = {
  id: 'session',
  name: 'Kickboxing',
  day: 0,
  start: '18:30',
  end: '19:30',
  active: true,
  trainerIds: [],
  revision: 1,
};
const attendance = {
  id: 'session_2026-10-26',
  trainingId: 'session',
  date: '2026-10-26',
  memberIds: [],
  trainingName: 'Kickboxing',
  start: '18:30',
  end: '19:30',
  revision: 1,
};
const member = {
  id: 'test-member',
  name: 'Test Member',
  email: 'test@example.com',
  joined: '2026-10-25',
  revision: 1,
};
before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-buddy-gym',
    firestore: {
      host: '127.0.0.1',
      port: 8085,
      rules: readFileSync('firestore.rules', 'utf8'),
    },
  });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    for (const [id, role, active] of [
      ['admin', 'admin', true],
      ['trainer', 'trainer', true],
      ['inactive', 'trainer', false],
    ] as const)
      await setDoc(doc(db, 'users', id), { role, active, trainerId: id });
    await setDoc(doc(db, 'trainings', 'session'), training);
  });
});
after(async () => {
  await env?.cleanup();
});
const db = (uid: string, verified = true) =>
  env.authenticatedContext(uid, { email_verified: verified }).firestore();
test('anonymous, unverified, unapproved and inactive users cannot read personal data', async () => {
  for (const context of [
    env.unauthenticatedContext().firestore(),
    db('unknown'),
    db('inactive'),
    db('trainer', false),
  ])
    await assertFails(getDocs(collection(context, 'members')));
});
test('trainer can read/write shared participant and incident data but cannot administer', async () => {
  const client = db('trainer');
  await assertSucceeds(setDoc(doc(client, 'members', member.id), member));
  await assertSucceeds(getDocs(collection(client, 'members')));
  await assertFails(
    setDoc(doc(client, 'trainings', 'forbidden'), {
      ...training,
      id: 'forbidden',
    }),
  );
  await assertFails(
    setDoc(doc(client, 'users', 'trainer'), {
      active: true,
      role: 'admin',
      trainerId: 'trainer',
    }),
  );
  await assertFails(
    setDoc(doc(client, 'trainers', 'evil'), {
      id: 'evil',
      name: 'Evil',
      email: 'test@example.com',
      uid: 'trainer',
      role: 'admin',
      active: true,
      revision: 1,
    }),
  );
});
test('attendance identity, immutable history and optimistic concurrency are enforced', async () => {
  const client = db('trainer');
  await assertSucceeds(
    setDoc(doc(client, 'attendance', attendance.id), attendance),
  );
  await assertSucceeds(
    updateDoc(doc(client, 'attendance', attendance.id), {
      memberIds: ['test-member'],
      revision: 2,
    }),
  );
  await assertFails(
    updateDoc(doc(client, 'attendance', attendance.id), {
      memberIds: [],
      revision: 2,
    }),
  );
  await assertFails(
    updateDoc(doc(client, 'attendance', attendance.id), {
      trainingId: 'different',
      revision: 3,
    }),
  );
  await assertFails(
    updateDoc(doc(client, 'attendance', attendance.id), {
      trainingName: 'Forged',
      revision: 3,
    }),
  );
  await assertFails(setDoc(doc(client, 'attendance', 'wrong-id'), attendance));
  await assertFails(
    setDoc(doc(client, 'attendance', 'missing_2026-10-26'), {
      ...attendance,
      id: 'missing_2026-10-26',
      trainingId: 'missing',
    }),
  );
  await assertSucceeds(deleteDoc(doc(db('admin'), 'trainings', 'session')));
  await assertSucceeds(
    updateDoc(doc(client, 'attendance', attendance.id), {
      memberIds: [],
      revision: 3,
    }),
  );
});
test('admin grants are atomic, cannot self-demote and inactive revocation blocks access immediately', async () => {
  const admin = db('admin');
  const batch = writeBatch(admin);
  batch.set(doc(admin, 'trainers', 'coach'), {
    id: 'coach',
    name: 'Test Coach',
    email: 'test@example.com',
    role: 'trainer',
    uid: 'coach-login',
    active: true,
    revision: 1,
  });
  batch.set(doc(admin, 'users', 'coach-login'), {
    trainerId: 'coach',
    role: 'trainer',
    active: true,
  });
  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(db('coach-login'), 'members', member.id)));
  await assertFails(
    updateDoc(doc(admin, 'users', 'admin'), { role: 'trainer' }),
  );
  await assertFails(
    setDoc(doc(admin, 'users', 'unlinked'), {
      trainerId: 'missing',
      role: 'admin',
      active: true,
    }),
  );
  const revoke = writeBatch(admin);
  revoke.update(doc(admin, 'trainers', 'coach'), {
    active: false,
    revision: 2,
  });
  revoke.update(doc(admin, 'users', 'coach-login'), { active: false });
  await assertSucceeds(revoke.commit());
  await assertFails(getDoc(doc(db('coach-login'), 'members', member.id)));
});
test('schema rejects malformed writes and unknown collections', async () => {
  await assertFails(
    setDoc(doc(db('trainer'), 'members', 'bad'), {
      ...member,
      id: 'bad',
      revision: 1,
      unexpected: 'field',
    }),
  );
  await assertFails(
    setDoc(doc(db('trainer'), 'members', 'invalid'), {
      ...member,
      id: 'invalid',
      name: '',
      revision: 1,
    }),
  );
  await assertFails(setDoc(doc(db('admin'), 'secrets', 'x'), { value: 'x' }));
});
