import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import {
  InvitationService,
  ApiError,
  type Actor,
  type Mailer,
} from '../server/invitations.ts';
import { invitationHandler, type Response } from '../server/http.ts';
if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error(
    'Tests require local demo Firebase emulators. No real project is allowed.',
  );
const app = initializeApp({ projectId: 'demo-buddy-gym' }, 'invitation-tests'),
  db = getFirestore(app),
  auth = getAuth(app);
let clock = Date.now(),
  enabled = true,
  deliveryFails = false;
const inbox: { to: string; link: string }[] = [];
const mail: Mailer = {
  ready() {
    if (!enabled) throw new ApiError(503, 'mail-not-configured', 'disabled');
  },
  async send(to, _name, link) {
    if (deliveryFails) throw new Error('simulated provider outage');
    inbox.push({ to, link });
  },
};
const service = new InvitationService(
  db,
  auth,
  mail,
  'https://test.example',
  () => clock,
);
let admin: Actor;
const token = () => new URL(inbox.at(-1)!.link).hash.slice('#invite='.length);
const rejectCode = (code: string) => (error: unknown) =>
  error instanceof ApiError && error.code === code;
async function user(
  email = `test-${randomUUID()}@example.com`,
  verified = true,
) {
  const u = await auth.createUser({
    email,
    password: 'OriginalTestPassword!123',
    emailVerified: verified,
  });
  return { uid: u.uid, email, verified };
}
async function invitation(role = 'trainer') {
  const email = `invite-${randomUUID()}@example.com`;
  const result = await service.invite(admin, {
    name: 'Test Coach',
    email,
    role,
  });
  return { ...result, email, token: token() };
}
before(async () => {
  admin = await user();
  await db
    .doc(`users/${admin.uid}`)
    .set({ active: true, role: 'admin', trainerId: 'bootstrap-admin' });
  await db.doc('trainers/bootstrap-admin').set({
    id: 'bootstrap-admin',
    uid: admin.uid,
    name: 'Existing Admin',
    email: admin.email,
    role: 'admin',
    active: true,
    revision: 7,
  });
});
beforeEach(async () => {
  clock = Date.now();
  enabled = true;
  deliveryFails = false;
  inbox.length = 0;
  await db.doc(`invitationLimits/${admin.uid}`).delete();
});
after(async () => {
  await db.terminate();
  await deleteApp(app);
});
test('only verified active administrators can invite and server mail is opt-in', async () => {
  const trainer = await user();
  await db
    .doc(`users/${trainer.uid}`)
    .set({ active: true, role: 'trainer', trainerId: 'trainer' });
  await assert.rejects(
    service.invite(trainer, {
      name: 'X',
      email: 'x@example.com',
      role: 'admin',
    }),
    rejectCode('forbidden'),
  );
  await assert.rejects(
    service.invite(
      { ...admin, verified: false },
      { name: 'X', email: 'x@example.com', role: 'trainer' },
    ),
    rejectCode('forbidden'),
  );
  enabled = false;
  await assert.rejects(invitation(), rejectCode('mail-not-configured'));
  assert.equal(inbox.length, 0);
});
test('new account must verify the same email; concurrent acceptance is once-only and preserves existing admin/data', async () => {
  const inv = await invitation();
  const preview = await service.preview(inv.token);
  assert.equal(preview.email, inv.email);
  const invited = await user(inv.email, false);
  await assert.rejects(
    service.accept(invited, inv.token),
    rejectCode('email-unverified'),
  );
  await assert.rejects(
    service.accept(await user(), inv.token),
    rejectCode('wrong-account'),
  );
  await auth.updateUser(invited.uid, { emailVerified: true });
  invited.verified = true;
  const results = await Promise.allSettled([
    service.accept(invited, inv.token),
    service.accept(invited, inv.token),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    (await db.doc(`users/${invited.uid}`).get()).data()?.role,
    'trainer',
  );
  await assert.rejects(
    service.preview(inv.token),
    rejectCode('invalid-invitation'),
  );
  assert.equal(
    (await db.doc('trainers/bootstrap-admin').get()).data()?.revision,
    7,
  );
});
test('resend rotates the token, expiry and revocation invalidate every old link', async () => {
  const inv = await invitation();
  await service.resend(admin, inv.invitationId);
  const rotated = token();
  assert.notEqual(rotated, inv.token);
  await assert.rejects(
    service.preview(inv.token),
    rejectCode('invalid-invitation'),
  );
  clock += 73 * 3600000;
  await assert.rejects(
    service.preview(rotated),
    rejectCode('invalid-invitation'),
  );
  await service.resend(admin, inv.invitationId);
  await service.revoke(admin, inv.invitationId);
  await assert.rejects(
    service.preview(token()),
    rejectCode('invalid-invitation'),
  );
});
test('existing Authentication password is never replaced; existing grants cannot be overwritten', async () => {
  const existing = await user();
  const inv = await service.invite(admin, {
    name: 'Existing Test User',
    email: existing.email,
    role: 'admin',
  });
  await service.accept(existing, token());
  assert.equal(
    (await db.doc(`users/${existing.uid}`).get()).data()?.role,
    'admin',
  );
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: existing.email,
        password: 'OriginalTestPassword!123',
        returnSecureToken: true,
      }),
    },
  );
  assert.equal(response.status, 200);
  await assert.rejects(
    service.invite(admin, {
      name: 'Overwrite',
      email: existing.email,
      role: 'trainer',
    }),
    rejectCode('existing-trainer'),
  );
  assert.equal(
    (await db.doc(`invitations/${inv.invitationId}`).get()).data()?.status,
    'accepted',
  );
});
test('deactivation, reactivation, role management and self protection are enforced atomically', async () => {
  const inv = await invitation(),
    coach = await user(inv.email);
  await service.accept(coach, inv.token);
  const grant = (await db.doc(`users/${coach.uid}`).get()).data()!;
  const ref = db.doc(`trainers/${grant.trainerId}`);
  let profile = (await ref.get()).data()!;
  await service.updateTrainer(admin, { ...profile, active: false });
  assert.equal(
    (await db.doc(`users/${coach.uid}`).get()).data()?.active,
    false,
  );
  profile = (await ref.get()).data()!;
  await service.updateTrainer(admin, {
    ...profile,
    active: true,
    role: 'admin',
  });
  assert.equal(
    (await db.doc(`users/${coach.uid}`).get()).data()?.role,
    'admin',
  );
  await assert.rejects(
    service.updateTrainer(admin, {
      ...(await db.doc('trainers/bootstrap-admin').get()).data(),
      active: false,
    }),
    rejectCode('self-change'),
  );
  await assert.rejects(
    service.updateTrainer(admin, {
      ...profile,
      revision: profile.revision + 1,
      uid: 'forged',
    }),
    rejectCode('identity-locked'),
  );
});
test('mail failure is visible, retry is safe, duplicate concurrent invitations cannot replace a trainer', async () => {
  deliveryFails = true;
  const email = `failure-${randomUUID()}@example.com`;
  await assert.rejects(
    service.invite(admin, { name: 'Retry', email, role: 'trainer' }),
    rejectCode('delivery-failed'),
  );
  const docs = await db
    .collection('invitations')
    .where('email', '==', email)
    .get();
  assert.equal(docs.docs[0].data().delivery, 'failed');
  deliveryFails = false;
  await service.resend(admin, docs.docs[0].id);
  assert.equal(inbox.length, 1);
  const duplicate = `race-${randomUUID()}@example.com`;
  const results = await Promise.allSettled([
    service.invite(admin, { name: 'One', email: duplicate, role: 'trainer' }),
    service.invite(admin, { name: 'Two', email: duplicate, role: 'admin' }),
  ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
});
test('a deactivated inviter cannot leave usable pending administrator invitations', async () => {
  const temporary = await user();
  await db
    .doc(`users/${temporary.uid}`)
    .set({ active: true, role: 'admin', trainerId: 'temp' });
  const email = `pending-${randomUUID()}@example.com`;
  await service.invite(temporary, {
    name: 'Pending Admin',
    email,
    role: 'admin',
  });
  const secret = token();
  await db.doc(`users/${temporary.uid}`).update({ active: false });
  await assert.rejects(
    service.accept(await user(email), secret),
    rejectCode('inviter-inactive'),
  );
});
test('HTTP boundary rejects anonymous mutations, cross-origin and malformed requests', async () => {
  const handler = invitationHandler(
    () => service,
    () => 'https://test.example',
  );
  let status = 0,
    data: unknown;
  const response: Response = {
    setHeader() {},
    status(code) {
      status = code;
      return this;
    },
    json(value) {
      data = value;
    },
  };
  await handler(
    {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        'content-type': 'application/json',
      },
      body: { action: 'preview', token: 'invalid' },
    },
    response,
  );
  assert.equal(status, 403);
  await handler(
    {
      method: 'POST',
      headers: {
        origin: 'https://test.example',
        'content-type': 'application/json',
      },
      body: { action: 'invite' },
    },
    response,
  );
  assert.equal(status, 401);
  await handler({ method: 'GET', headers: {}, body: null }, response);
  assert.equal(status, 405);
  assert.ok(data);
});
test('server verifies the real Auth token and current email verification', async () => {
  const account = await user(undefined, false);
  const login = async () => {
    const r = await fetch(
      'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: account.email,
          password: 'OriginalTestPassword!123',
          returnSecureToken: true,
        }),
      },
    );
    return (await r.json()).idToken as string;
  };
  let actor = await service.actor(await login());
  assert.equal(actor.verified, false);
  await auth.updateUser(account.uid, { emailVerified: true });
  actor = await service.actor(await login());
  assert.equal(actor.verified, true);
  await auth.updateUser(account.uid, { disabled: true });
  await assert.rejects(service.actor(await login()));
});
