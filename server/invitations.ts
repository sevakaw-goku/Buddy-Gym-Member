import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import type { Auth, DecodedIdToken } from 'firebase-admin/auth';
import type {
  Firestore,
  Transaction,
  DocumentData,
} from 'firebase-admin/firestore';
export type Role = 'admin' | 'trainer';
export type Actor = { uid: string; email: string; verified: boolean };
export type Mailer = {
  ready(): void;
  send(to: string, name: string, link: string, key: string): Promise<void>;
};
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (status: number, code: string, message: string): never => {
  throw new ApiError(status, code, message);
};
export const normalizeEmail = (value: unknown) => {
  if (
    typeof value !== 'string' ||
    value.length > 200 ||
    !/^\S+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    return fail(
      400,
      'invalid-input',
      'Bitte eine gültige E-Mail-Adresse eingeben.',
    );
  return value.trim().toLowerCase();
};
const hash = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const id = (value: unknown) =>
  typeof value === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value)
    ? value
    : fail(400, 'invalid-input', 'Ungültige Eintrags-ID.');
const role = (value: unknown): Role =>
  value === 'admin' || value === 'trainer'
    ? value
    : fail(400, 'invalid-input', 'Ungültige Rolle.');
const name = (value: unknown) =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.trim().length <= 100
    ? value.trim()
    : fail(
        400,
        'invalid-input',
        'Bitte einen Namen mit höchstens 100 Zeichen eingeben.',
      );
function parseToken(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(value)
  )
    return fail(
      410,
      'invalid-invitation',
      'Diese Einladung ist ungültig, abgelaufen oder wurde widerrufen.',
    );
  return { id: value.split('.')[0], hash: hash(value) };
}
export class InvitationService {
  private db: Firestore;
  private auth: Auth;
  private mail: Mailer;
  private origin: string;
  private now: () => number;
  constructor(
    db: Firestore,
    auth: Auth,
    mail: Mailer,
    origin: string,
    now: () => number = Date.now,
  ) {
    this.db = db;
    this.auth = auth;
    this.mail = mail;
    this.origin = origin;
    this.now = now;
  }
  async actor(bearer: string): Promise<Actor> {
    let token: DecodedIdToken;
    try {
      token = await this.auth.verifyIdToken(bearer, true);
    } catch {
      return fail(401, 'unauthenticated', 'Bitte erneut anmelden.');
    }
    const user = await this.auth.getUser(token.uid);
    if (user.disabled || !user.email)
      return fail(403, 'forbidden', 'Dieses Konto hat keinen Zugriff.');
    return {
      uid: user.uid,
      email: normalizeEmail(user.email),
      verified: token.email_verified === true && user.emailVerified,
    };
  }
  private async administrator(tx: Transaction, actor: Actor) {
    if (!actor.verified)
      return fail(
        403,
        'forbidden',
        'Nur bestätigte aktive Administratoren dürfen diese Aktion ausführen.',
      );
    const grant = await tx.get(this.db.doc(`users/${actor.uid}`));
    if (
      !grant.exists ||
      grant.data()?.active !== true ||
      grant.data()?.role !== 'admin'
    )
      return fail(
        403,
        'forbidden',
        'Nur aktive Administratoren dürfen diese Aktion ausführen.',
      );
    return grant.data()!;
  }
  private async limit(tx: Transaction, actor: Actor) {
    const ref = this.db.doc(`invitationLimits/${actor.uid}`),
      s = await tx.get(ref),
      v = s.data();
    const now = this.now();
    const count = v && now - v.window < 600000 ? v.count : 0;
    if (count >= 10)
      return fail(
        429,
        'rate-limited',
        'Zu viele Einladungsaktionen. Bitte in zehn Minuten erneut versuchen.',
      );
    return () =>
      tx.set(ref, { window: count ? v!.window : now, count: count + 1 });
  }
  private checkInvite(
    inv: DocumentData | undefined,
    secret: DocumentData | undefined,
    tokenHash: string,
  ) {
    if (
      !inv ||
      !secret ||
      inv.status !== 'pending' ||
      typeof inv.expiresAt !== 'number' ||
      !Number.isFinite(inv.expiresAt) ||
      inv.expiresAt <= this.now() ||
      typeof secret.hash !== 'string' ||
      secret.hash.length !== tokenHash.length ||
      !timingSafeEqual(Buffer.from(secret.hash), Buffer.from(tokenHash))
    )
      return fail(
        410,
        'invalid-invitation',
        'Diese Einladung ist ungültig, abgelaufen oder wurde widerrufen. Bitte eine neue Einladung anfordern.',
      );
  }
  async preview(token: unknown) {
    const t = parseToken(token);
    const [record, secret] = await Promise.all([
      this.db.doc(`invitations/${t.id}`).get(),
      this.db.doc(`invitationTokens/${t.id}`).get(),
    ]);
    this.checkInvite(record.data(), secret.data(), t.hash);
    const inv = record.data()!;
    return {
      name: inv.name,
      email: inv.email,
      role: inv.role,
      expiresAt: inv.expiresAt,
    };
  }
  async invite(actor: Actor, input: Record<string, unknown>) {
    await this.db.runTransaction((tx) => this.administrator(tx, actor));
    // No Firestore changes until a mail provider has been deliberately enabled.
    this.mail.ready();
    const email = normalizeEmail(input.email),
      displayName = name(input.name),
      requestedRole = role(input.role);
    // Read only: existing Authentication accounts and passwords are never changed.
    const existing = await this.auth.getUserByEmail(email).catch((e) => {
      if (e.code === 'auth/user-not-found') return null;
      throw e;
    });
    const matches = await this.db.collection('trainers').get();
    const same = matches.docs.filter(
      (d) =>
        String(d.data().email).trim().toLowerCase() === email ||
        Boolean(existing && d.data().uid === existing.uid),
    );
    if (same.length > 1 || same.some((d) => d.id !== input.trainerId))
      return fail(
        409,
        'existing-trainer',
        'Für diese E-Mail besteht bereits ein Trainerprofil. Bitte dessen Einladung oder Verwaltung verwenden.',
      );
    const trainerId = input.trainerId ? id(input.trainerId) : randomUUID(),
      invitationId = randomUUID(),
      token = `${invitationId}.${randomBytes(32).toString('base64url')}`;
    const expiresAt = this.now() + 72 * 60 * 60 * 1000;
    await this.db.runTransaction(async (tx) => {
      await this.administrator(tx, actor);
      const writeLimit = await this.limit(tx, actor);
      const trainerRef = this.db.doc(`trainers/${trainerId}`),
        trainer = await tx.get(trainerRef);
      const emailRef = this.db.doc(`trainerEmails/${hash(email)}`),
        emailRecord = await tx.get(emailRef);
      const existingGrant = existing
        ? await tx.get(this.db.doc(`users/${existing.uid}`))
        : null;
      const oldInvite = trainer.data()?.invitationId
        ? await tx.get(
            this.db.doc(`invitations/${trainer.data()!.invitationId}`),
          )
        : null;
      if (existing?.disabled || existingGrant?.exists || trainer.data()?.uid)
        return fail(
          409,
          'existing-account',
          'Das bestehende Konto wird nicht verändert. Bitte das bereits verknüpfte Trainerprofil verwenden.',
        );
      if (emailRecord.exists && emailRecord.data()?.trainerId !== trainerId)
        return fail(
          409,
          'existing-trainer',
          'Diese E-Mail ist bereits einem Trainerprofil zugeordnet.',
        );
      if (
        input.trainerId &&
        (!trainer.exists || trainer.data()?.revision !== input.revision)
      )
        return fail(
          409,
          'conflict',
          'Das Trainerprofil wurde inzwischen geändert. Bitte neu laden.',
        );
      if (
        trainer.exists &&
        String(trainer.data()?.email).trim().toLowerCase() !== email
      )
        return fail(
          409,
          'identity-locked',
          'Die bestehende E-Mail-Adresse bleibt erhalten.',
        );
      if (oldInvite?.data()?.status === 'pending')
        return fail(
          409,
          'already-invited',
          'Bitte die bestehende Einladung erneut senden oder zuerst widerrufen.',
        );
      writeLimit();
      tx.set(trainerRef, {
        ...(trainer.data() ?? {}),
        id: trainerId,
        name: displayName,
        email,
        role: requestedRole,
        uid: '',
        active: false,
        invitationId,
        invitationState: 'invited',
        revision: (trainer.data()?.revision ?? 0) + 1,
      });
      tx.set(emailRef, { trainerId });
      tx.create(this.db.doc(`invitations/${invitationId}`), {
        trainerId,
        name: displayName,
        email,
        role: requestedRole,
        status: 'pending',
        createdBy: actor.uid,
        createdAt: this.now(),
        expiresAt,
        generation: 1,
        delivery: 'pending',
      });
      tx.create(this.db.doc(`invitationTokens/${invitationId}`), {
        hash: hash(token),
      });
    });
    await this.deliver(invitationId, 1, email, displayName, token);
    return { invitationId };
  }
  private async deliver(
    invitationId: string,
    generation: number,
    email: string,
    displayName: string,
    token: string,
  ) {
    let delivery = 'sent';
    try {
      await this.mail.send(
        email,
        displayName,
        `${this.origin}/#invite=${encodeURIComponent(token)}`,
        `${invitationId}-${generation}`,
      );
    } catch {
      delivery = 'failed';
    }
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.doc(`invitations/${invitationId}`),
        inv = await tx.get(ref);
      if (inv.data()?.generation === generation) tx.update(ref, { delivery });
    });
    if (delivery === 'failed')
      return fail(
        502,
        'delivery-failed',
        'Die Einladung wurde angelegt, die E-Mail konnte jedoch nicht bestätigt versendet werden. Bitte erneut senden.',
      );
  }
  async resend(actor: Actor, invitationId: unknown) {
    this.mail.ready();
    const inviteId = id(invitationId),
      token = `${inviteId}.${randomBytes(32).toString('base64url')}`;
    const inv = await this.db.runTransaction(async (tx) => {
      await this.administrator(tx, actor);
      const writeLimit = await this.limit(tx, actor);
      const ref = this.db.doc(`invitations/${inviteId}`),
        record = await tx.get(ref),
        v = record.data();
      if (!v || v.status !== 'pending')
        return fail(
          409,
          'not-pending',
          'Diese Einladung ist nicht mehr ausstehend.',
        );
      const trainer = await tx.get(this.db.doc(`trainers/${v.trainerId}`));
      if (trainer.data()?.uid || trainer.data()?.invitationId !== inviteId)
        return fail(409, 'conflict', 'Das Trainerprofil hat sich geändert.');
      writeLimit();
      const next: DocumentData = {
        ...v,
        expiresAt: this.now() + 72 * 60 * 60 * 1000,
        generation: v.generation + 1,
        createdBy: actor.uid,
        delivery: 'pending',
      };
      tx.set(ref, next);
      tx.set(this.db.doc(`invitationTokens/${inviteId}`), {
        hash: hash(token),
      });
      return next;
    });
    await this.deliver(inviteId, inv.generation, inv.email, inv.name, token);
    return { ok: true };
  }
  async revoke(actor: Actor, invitationId: unknown) {
    const inviteId = id(invitationId);
    await this.db.runTransaction(async (tx) => {
      await this.administrator(tx, actor);
      const ref = this.db.doc(`invitations/${inviteId}`),
        record = await tx.get(ref),
        v = record.data();
      if (!v || v.status !== 'pending')
        return fail(
          409,
          'not-pending',
          'Diese Einladung ist nicht mehr ausstehend.',
        );
      const trainerRef = this.db.doc(`trainers/${v.trainerId}`),
        trainer = await tx.get(trainerRef);
      tx.update(ref, { status: 'revoked' });
      tx.delete(this.db.doc(`invitationTokens/${inviteId}`));
      if (trainer.data()?.invitationId === inviteId && !trainer.data()?.uid)
        tx.update(trainerRef, {
          active: false,
          invitationState: 'revoked',
          revision: trainer.data()!.revision + 1,
        });
    });
    return { ok: true };
  }
  async accept(actor: Actor, token: unknown) {
    if (!actor.verified)
      return fail(
        403,
        'email-unverified',
        'Bitte zuerst die E-Mail-Adresse bestätigen und dich erneut anmelden.',
      );
    const t = parseToken(token);
    await this.db.runTransaction(async (tx) => {
      const ref = this.db.doc(`invitations/${t.id}`),
        record = await tx.get(ref),
        secret = await tx.get(this.db.doc(`invitationTokens/${t.id}`)),
        inv = record.data();
      this.checkInvite(inv, secret.data(), t.hash);
      if (inv!.email !== actor.email)
        return fail(
          403,
          'wrong-account',
          'Bitte mit genau der eingeladenen E-Mail-Adresse anmelden.',
        );
      const trainerRef = this.db.doc(`trainers/${inv!.trainerId}`),
        trainer = await tx.get(trainerRef),
        grantRef = this.db.doc(`users/${actor.uid}`),
        grant = await tx.get(grantRef),
        inviter = await tx.get(this.db.doc(`users/${inv!.createdBy}`));
      if (inviter.data()?.active !== true || inviter.data()?.role !== 'admin')
        return fail(
          403,
          'inviter-inactive',
          'Bitte einen aktiven Administrator um eine neue Einladung bitten.',
        );
      if (
        grant.exists ||
        !trainer.exists ||
        trainer.data()?.uid ||
        trainer.data()?.invitationId !== t.id ||
        trainer.data()?.role !== inv!.role ||
        trainer.data()?.email !== inv!.email
      )
        return fail(
          409,
          'existing-account',
          'Das Konto oder Trainerprofil wurde bereits verknüpft. Bestehende Rechte werden nicht überschrieben.',
        );
      tx.update(trainerRef, {
        uid: actor.uid,
        active: true,
        invitationState: 'accepted',
        revision: trainer.data()!.revision + 1,
      });
      tx.create(grantRef, {
        trainerId: inv!.trainerId,
        active: true,
        role: inv!.role,
      });
      tx.update(ref, {
        status: 'accepted',
        acceptedBy: actor.uid,
        acceptedAt: this.now(),
      });
      tx.delete(this.db.doc(`invitationTokens/${t.id}`));
    });
    return { ok: true };
  }
  async updateTrainer(actor: Actor, input: Record<string, unknown>) {
    const trainerId = id(input.id),
      displayName = name(input.name),
      requestedRole = role(input.role);
    if (typeof input.active !== 'boolean' || !Number.isInteger(input.revision))
      return fail(400, 'invalid-input', 'Ungültiger Trainerstatus.');
    const email = normalizeEmail(input.email);
    await this.db.runTransaction(async (tx) => {
      await this.administrator(tx, actor);
      const ref = this.db.doc(`trainers/${trainerId}`),
        snapshot = await tx.get(ref),
        trainer = snapshot.data();
      if (!trainer || trainer.revision !== input.revision)
        return fail(
          409,
          'conflict',
          'Das Trainerprofil wurde inzwischen geändert. Bitte neu öffnen.',
        );
      if (
        trainer.email.trim().toLowerCase() !== email ||
        trainer.uid !== input.uid
      )
        return fail(
          409,
          'identity-locked',
          'E-Mail und Kontoverknüpfung können hier nicht verändert werden.',
        );
      if (
        trainer.uid === actor.uid &&
        (requestedRole !== trainer.role || input.active !== trainer.active)
      )
        return fail(
          403,
          'self-change',
          'Die eigene Rolle oder Freigabe kann hier nicht verändert werden.',
        );
      if (trainer.invitationState === 'invited')
        return fail(
          409,
          'pending-invitation',
          'Bitte die ausstehende Einladung zuerst widerrufen.',
        );
      const grant = trainer.uid
        ? await tx.get(this.db.doc(`users/${trainer.uid}`))
        : null;
      if (
        trainer.uid &&
        (!grant?.exists || grant.data()?.trainerId !== trainerId)
      )
        return fail(
          409,
          'conflict',
          'Die Kontoverknüpfung ist nicht konsistent. Bitte administrativ prüfen.',
        );
      if (!trainer.uid && input.active)
        return fail(
          409,
          'invite-required',
          'Bitte diesen Trainer zuerst einladen.',
        );
      tx.update(ref, {
        name: displayName,
        role: requestedRole,
        active: input.active,
        revision: trainer.revision + 1,
      });
      if (trainer.uid)
        tx.update(this.db.doc(`users/${trainer.uid}`), {
          role: requestedRole,
          active: input.active,
        });
    });
    return { ok: true };
  }
}
