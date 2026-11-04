import { createServer } from 'node:http';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { InvitationService, type Mailer } from '../../server/invitations.ts';
import { invitationHandler, type Response } from '../../server/http.ts';
if (
  process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8085' ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9099'
)
  throw new Error('Local demo emulators required');
const app = initializeApp({ projectId: 'demo-buddy-gym' }),
  auth = getAuth(app),
  db = getFirestore(app),
  inbox: { to: string; link: string }[] = [];
await auth.createUser({
  uid: 'browser-admin',
  email: 'browser-admin@example.com',
  password: 'BrowserAdminTest!123',
  emailVerified: true,
});
await db
  .doc('users/browser-admin')
  .set({ trainerId: 'browser-admin', active: true, role: 'admin' });
await db.doc('trainers/browser-admin').set({
  id: 'browser-admin',
  name: 'Browser Test Admin',
  email: 'browser-admin@example.com',
  uid: 'browser-admin',
  active: true,
  role: 'admin',
  revision: 1,
});
const mail: Mailer = {
  ready() {},
  async send(to, _name, link) {
    inbox.push({ to, link });
  },
};
const service = new InvitationService(db, auth, mail, 'http://127.0.0.1:4174');
const handler = invitationHandler(
  () => service,
  () => 'http://127.0.0.1:4174',
);
createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/health') {
    res.end('{}');
    return;
  }
  if (req.url === '/inbox') {
    res.end(JSON.stringify(inbox));
    return;
  }
  if (req.url !== '/api/invitations') {
    res.statusCode = 404;
    res.end('{}');
    return;
  }
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10000) {
      res.statusCode = 413;
      res.end('{}');
      return;
    }
  }
  const response: Response = {
    setHeader: (n, v) => {
      res.setHeader(n, v);
    },
    status(code) {
      res.statusCode = code;
      return this;
    },
    json(value) {
      res.end(JSON.stringify(value));
    },
  };
  try {
    await handler(
      { method: req.method, headers: req.headers, body: JSON.parse(body) },
      response,
    );
  } catch {
    res.statusCode = 400;
    res.end('{}');
  }
}).listen(4175, '127.0.0.1');
