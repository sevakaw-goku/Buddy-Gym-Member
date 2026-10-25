import { initializeApp } from 'firebase/app';
import { getAuth, inMemoryPersistence, setPersistence } from 'firebase/auth';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';
const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};
const supplied = Object.values(config).some(Boolean);
export const configured = Object.values(config).every(Boolean);
export const configurationError =
  supplied && !configured
    ? 'Firebase-Konfiguration unvollständig. Bitte alle vier Vercel-Umgebungsvariablen eintragen.'
    : '';
const app = configured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
// No persistent personal data or credentials on shared trainer devices.
export const authReady = auth
  ? setPersistence(auth, inMemoryPersistence)
  : Promise.resolve();
export const db = app
  ? initializeFirestore(app, { localCache: memoryLocalCache() })
  : null;
