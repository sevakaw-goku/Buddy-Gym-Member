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
  trainerIds: ['trainer'],
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
test('browser clients including administrators cannot write grants, trainer identities or invitations', async () => {
  const admin = db('admin');
  for (const [path, data] of [
    ['users/forged', { trainerId: 'trainer', role: 'admin', active: true }],
    [
      'trainers/forged',
      {
        id: 'forged',
        name: 'Forged',
        email: 'x@example.com',
        uid: 'trainer',
        active: true,
        role: 'admin',
        revision: 1,
      },
    ],
    ['invitations/forged', { status: 'pending', role: 'admin' }],
    ['invitationTokens/forged', { hash: 'secret' }],
  ] as const)
    await assertFails(setDoc(doc(admin, path), data));
  await assertFails(getDocs(collection(db('trainer'), 'invitations')));
  await assertFails(getDocs(collection(admin, 'invitationTokens')));
});
test('trainer can edit only assigned sessions, cannot reassign or create administrator rights', async () => {
  await env.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'trainings', 'assigned'), {
      ...training,
      id: 'assigned',
    });
    await setDoc(doc(context.firestore(), 'trainings', 'unassigned'), {
      ...training,
      id: 'unassigned',
      trainerIds: [],
    });
  });
  const trainer = db('trainer');
  await assertSucceeds(
    updateDoc(doc(trainer, 'trainings', 'assigned'), {
      name: 'Updated assigned',
      revision: 2,
    }),
  );
  await assertFails(
    updateDoc(doc(trainer, 'trainings', 'unassigned'), {
      name: 'Stolen',
      revision: 2,
    }),
  );
  await assertFails(
    updateDoc(doc(trainer, 'trainings', 'assigned'), {
      trainerIds: ['someone-else'],
      revision: 3,
    }),
  );
  await assertFails(
    setDoc(doc(trainer, 'attendance', 'unassigned_2026-10-26'), {
      ...attendance,
      id: 'unassigned_2026-10-26',
      trainingId: 'unassigned',
    }),
  );
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'users', 'trainer'), {
      active: false,
    });
  });
  await assertFails(getDocs(collection(trainer, 'members')));
  await env.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), 'users', 'trainer'), {
      active: true,
    });
  });
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
