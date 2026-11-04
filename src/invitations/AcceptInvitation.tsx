import { useEffect, useState, type FormEvent } from 'react';
import {
  createUserWithEmailAndPassword,
  getIdToken,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, authReady, configured } from '../firebase';
import { invitationRequest } from './client';
type Preview = { name: string; email: string; role: string; expiresAt: number };
export default function AcceptInvitation({ token }: { token: string }) {
  const [preview, setPreview] = useState<Preview | null>(null),
    [user, setUser] = useState<User | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [existing, setExisting] = useState(false),
    [accepted, setAccepted] = useState(false),
    [verified, setVerified] = useState(false);
  useEffect(() => {
    if (!configured) {
      setError(
        'Die Firebase-Anmeldung ist in dieser Testversion noch nicht eingerichtet.',
      );
      return;
    }
    let alive = true;
    void invitationRequest('preview', { token }, false)
      .then((data) => {
        if (alive) setPreview(data as unknown as Preview);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    const stop = onAuthStateChanged(auth!, (current) => {
      setUser(current);
      setVerified(current?.emailVerified ?? false);
    });
    return () => {
      alive = false;
      stop();
    };
  }, [token]);
  async function run(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(
        code === 'auth/email-already-in-use'
          ? 'Für diese E-Mail besteht bereits ein Konto. Bitte «Bestehendes Konto» wählen.'
          : code?.startsWith('auth/')
            ? 'Die Anmeldung konnte nicht abgeschlossen werden. Bitte Passwort und E-Mail prüfen.'
            : e instanceof Error
              ? e.message
              : 'Bitte erneut versuchen.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function credentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password'));
    await run(async () => {
      await authReady;
      if (existing)
        await signInWithEmailAndPassword(auth!, preview!.email, password);
      else {
        await createUserWithEmailAndPassword(auth!, preview!.email, password);
        await verify();
      }
    });
  }
  async function verify() {
    await sendEmailVerification(auth!.currentUser!, {
      url: `${window.location.origin}/#invite=${encodeURIComponent(token)}`,
    });
    setNotice(
      'Bestätigungs-E-Mail gesendet. Öffne den Link in deinem Postfach und klicke danach hier auf «Bestätigung prüfen».',
    );
  }
  function leave() {
    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
  const same = user?.email?.toLowerCase() === preview?.email;
  return (
    <div className="login-screen">
      <section className="modal">
        <div className="eyebrow">BUDDY GYM · TRAINER-EINLADUNG</div>
        <h1>{accepted ? 'Willkommen im Team.' : 'Deine Einladung.'}</h1>
        {preview && !accepted && (
          <p className="login-copy">
            Hallo {preview.name}. Du bist als{' '}
            {preview.role === 'admin' ? 'Administrator' : 'Trainer'} eingeladen.
            <br />
            <strong>{preview.email}</strong>
            <br />
            Gültig bis {new Date(preview.expiresAt).toLocaleString('de-CH')}.
          </p>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="notice" role="status">
            {notice}
          </div>
        )}
        {accepted ? (
          <>
            <p className="login-copy">
              Deine Einladung wurde angenommen und dein bestätigtes Konto
              freigegeben.
            </p>
            <button className="primary" onClick={leave}>
              Zur Trainer-App
            </button>
          </>
        ) : preview ? (
          <>
            {!user ? (
              <>
                <div className="invitation-tabs">
                  <button
                    className={!existing ? 'primary' : 'secondary'}
                    disabled={busy}
                    onClick={() => setExisting(false)}
                  >
                    Neues Konto
                  </button>
                  <button
                    className={existing ? 'primary' : 'secondary'}
                    disabled={busy}
                    onClick={() => setExisting(true)}
                  >
                    Bestehendes Konto
                  </button>
                </div>
                <p className="form-note">
                  Ein vorhandenes Konto bleibt erhalten. Verwende dann dein
                  bisheriges Passwort.
                </p>
                <form onSubmit={credentials}>
                  <label>
                    E-Mail
                    <input
                      type="email"
                      value={preview.email}
                      readOnly
                      autoComplete="username"
                    />
                  </label>
                  <label>
                    {existing ? 'Passwort' : 'Eigenes Passwort festlegen'}
                    <input
                      name="password"
                      type="password"
                      required
                      minLength={existing ? 1 : 12}
                      maxLength={128}
                      autoComplete={
                        existing ? 'current-password' : 'new-password'
                      }
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    {existing
                      ? 'Anmelden'
                      : 'Konto erstellen und E-Mail bestätigen'}
                  </button>
                </form>
                {existing && (
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await sendPasswordResetEmail(auth!, preview.email);
                        setNotice(
                          'Falls ein Konto besteht, erhältst du eine E-Mail zum Zurücksetzen. Bestehende Konten werden nicht durch die Einladung verändert.',
                        );
                      })
                    }
                  >
                    Passwort vergessen?
                  </button>
                )}
              </>
            ) : !same ? (
              <>
                <p className="login-copy">
                  Du bist mit einem anderen Konto angemeldet. Bitte zuerst
                  abmelden und die eingeladene E-Mail verwenden.
                </p>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => void run(() => signOut(auth!))}
                >
                  Anderes Konto verwenden
                </button>
              </>
            ) : !verified ? (
              <>
                <p className="login-copy">
                  Bitte bestätige zuerst deine E-Mail-Adresse. Erst danach kann
                  die Einladung angenommen werden.
                </p>
                <div className="invitation-actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await reload(user);
                        await getIdToken(user, true);
                        setVerified(user.emailVerified);
                        if (!user.emailVerified)
                          setNotice(
                            'Die E-Mail ist noch nicht bestätigt. Bitte auch den Spamordner prüfen.',
                          );
                      })
                    }
                  >
                    Bestätigung prüfen
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void run(verify)}
                  >
                    Bestätigungslink senden
                  </button>
                </div>
              </>
            ) : (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await getIdToken(user, true);
                    await invitationRequest('accept', { token });
                    setNotice('');
                    setAccepted(true);
                  })
                }
              >
                Einladung annehmen
              </button>
            )}
            {user && same && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => void run(() => signOut(auth!))}
              >
                Abmelden
              </button>
            )}
          </>
        ) : !error ? (
          <p className="login-copy" role="status">
            Einladung wird geprüft …
          </p>
        ) : null}
        {!accepted && (
          <button className="text-button" onClick={leave}>
            Zur normalen Anmeldung
          </button>
        )}
        <p className="form-note">
          Ausschliesslich Testdaten verwenden. Der Link wird erst bei
          bestätigter Annahme einmalig verbraucht; das blosse Öffnen verbraucht
          ihn nicht.
        </p>
      </section>
    </div>
  );
}
