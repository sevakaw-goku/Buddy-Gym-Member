import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { ApiError, InvitationService, type Mailer } from './invitations.ts';
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function applicationOrigin() {
  const value = process.env.APP_ORIGIN;
  let parsed: URL;
  try {
    parsed = new URL(value!);
  } catch {
    throw new ApiError(
      503,
      'not-configured',
      'Die Einladungsfunktion ist noch nicht eingerichtet.',
    );
  }
  if (parsed.protocol !== 'https:' || parsed.origin !== value)
    throw new ApiError(
      503,
      'not-configured',
      'Die App-Adresse ist noch nicht korrekt eingerichtet.',
    );
  return value!;
}
export function service() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (
    !projectId ||
    !clientEmail ||
    !privateKey ||
    process.env.FIRESTORE_EMULATOR_HOST ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    (process.env.VITE_FIREBASE_PROJECT_ID &&
      process.env.VITE_FIREBASE_PROJECT_ID !== projectId)
  )
    throw new ApiError(
      503,
      'not-configured',
      'Die serverseitige Firebase-Verbindung ist noch nicht eingerichtet.',
    );
  const app =
    getApps().find((a) => a.name === 'invitations') ??
    initializeApp(
      {
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, '\n'),
        }),
      },
      'invitations',
    );
  const mail: Mailer = {
    ready() {
      if (
        process.env.INVITATIONS_ENABLED !== 'true' ||
        !process.env.RESEND_API_KEY ||
        !process.env.INVITATION_FROM
      )
        throw new ApiError(
          503,
          'mail-not-configured',
          'Der E-Mail-Versand ist noch nicht freigegeben oder eingerichtet.',
        );
    },
    async send(to, name, link, key) {
      this.ready();
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          from: process.env.INVITATION_FROM,
          to: [to],
          subject: 'Deine Einladung zu BUDDY GYM',
          text: `Hallo ${name}\n\nDu wurdest zu BUDDY GYM eingeladen. Diese Einladung ist 72 Stunden gültig und nur einmal verwendbar.\n\n${link}\n\nWenn du keine Einladung erwartet hast, kannst du diese Nachricht ignorieren.`,
          html: `<p>Hallo ${escape(name)}</p><p>Du wurdest zu BUDDY GYM eingeladen. Die Einladung ist 72 Stunden gültig und nur einmal verwendbar.</p><p><a href="${escape(link)}">Einladung öffnen</a></p><p>Wenn du keine Einladung erwartet hast, kannst du diese Nachricht ignorieren.</p>`,
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error('Mail delivery failed');
    },
  };
  return new InvitationService(
    getFirestore(app),
    getAuth(app),
    mail,
    applicationOrigin(),
  );
}
