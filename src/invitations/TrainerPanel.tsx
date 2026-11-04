import { useEffect, useState, type FormEvent } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { configured, db } from '../firebase';
import type { Data, Trainer } from '../model';
import { invitationRequest } from './client';
type Invitation = {
  id: string;
  trainerId: string;
  status: string;
  expiresAt: number;
  delivery: string;
};
export function InviteForm({
  trainer,
  onDone,
  onBusyChange,
}: {
  trainer?: Trainer;
  onDone: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    onBusyChange(true);
    setError('');
    try {
      await invitationRequest('invite', {
        name: f.get('name'),
        email: f.get('email'),
        role: f.get('role'),
        ...(trainer
          ? { trainerId: trainer.id, revision: trainer.revision }
          : {}),
      });
      onDone();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Einladung fehlgeschlagen.',
      );
      setBusy(false);
    } finally {
      onBusyChange(false);
    }
  }
  return (
    <form onSubmit={submit}>
      {error && (
        <div role="alert" className="notice error">
          {error}
        </div>
      )}
      <fieldset disabled={busy} className="editor-fields">
        <label>
          Name des Trainers
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={trainer?.name}
          />
        </label>
        <label>
          E-Mail-Adresse
          <input
            name="email"
            type="email"
            required
            maxLength={200}
            defaultValue={trainer?.email}
            readOnly={Boolean(trainer)}
          />
        </label>
        <label>
          Rolle
          <select
            aria-label="Rolle"
            name="role"
            defaultValue={trainer?.role ?? 'trainer'}
          >
            <option value="trainer">Trainer</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
      </fieldset>
      <p className="form-note">
        Die persönliche Einladung ist 72 Stunden gültig. Bestehende Konten und
        Passwörter bleiben unverändert. Ohne eingerichteten E-Mail-Dienst
        erfolgt kein Versand.
      </p>
      <div className="modal-actions">
        <button className="primary" disabled={busy}>
          {busy ? 'Wird gesendet …' : 'Einladung senden'}
        </button>
      </div>
    </form>
  );
}
export function TrainerPanel({
  data,
  admin,
  uid,
  busy,
  onEdit,
  onToggle,
  onInvite,
  onAction,
}: {
  data: Data;
  admin: boolean;
  uid: string;
  busy: boolean;
  onEdit: (t: Trainer) => void;
  onToggle: (t: Trainer) => void;
  onInvite: (t: Trainer) => void;
  onAction: (fn: () => Promise<void>, message: string) => Promise<void>;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (!configured || !admin) return;
    return onSnapshot(
      collection(db!, 'invitations'),
      (snapshot) =>
        setInvitations(
          snapshot.docs.map((d) => ({ ...d.data(), id: d.id }) as Invitation),
        ),
      () =>
        setError(
          'Einladungsübersicht nicht verfügbar. Bitte die veröffentlichten Sicherheitsregeln prüfen.',
        ),
    );
  }, [admin]);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Dein Trainerteam</h2>
          <p>
            {admin
              ? configured
                ? 'Trainer per E-Mail einladen und Kontorechte sicher verwalten.'
                : 'Lokaler Testmodus: E-Mail-Einladungen benötigen Firebase und die Vercel-Serverfunktion.'
              : 'Trainerzuordnungen und Rollen werden durch Administratoren verwaltet.'}
          </p>
        </div>
      </div>
      {error && (
        <div role="alert" className="notice error">
          {error}
        </div>
      )}
      {data.trainers.length ? (
        data.trainers.map((t) => {
          const pending = t.invitationState === 'invited',
            inv = invitations.find((i) => i.id === t.invitationId),
            status = pending
              ? 'Eingeladen'
              : t.active
                ? 'Aktiv'
                : 'Deaktiviert';
          return (
            <div
              className={`member-row trainer-row ${t.active ? '' : 'inactive'}`}
              key={t.id}
            >
              <span className="avatar">
                {t.name
                  .split(' ')
                  .map((s) => s[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div className="member-name">
                <strong>
                  {t.name} · {t.role === 'admin' ? 'Administrator' : 'Trainer'}
                  {!t.active && !pending ? ' · Inaktiv' : ''}
                </strong>
                <span>{t.email}</span>
                <span className="trainer-status">
                  {status}
                  {pending && inv && inv.expiresAt <= Date.now()
                    ? ' · Link abgelaufen'
                    : ''}
                  {pending && inv?.delivery === 'failed'
                    ? ' · Versand fehlgeschlagen'
                    : ''}
                </span>
                <span>
                  {data.trainings
                    .filter((p) => p.trainerIds.includes(t.id))
                    .map((p) => `${p.start} ${p.name}`)
                    .join(' · ') || 'Noch keinem Training zugeordnet'}
                </span>
              </div>
              {admin && (
                <div className="row-actions">
                  {pending ? (
                    <>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void onAction(async () => {
                            await invitationRequest('resend', {
                              invitationId: t.invitationId,
                            });
                          }, 'Einladung erneut versendet. Der alte Link ist ungültig.')
                        }
                      >
                        Erneut senden
                      </button>
                      <button
                        className="text-button danger"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Einladung widerrufen? Der Link wird sofort ungültig.',
                            )
                          )
                            void onAction(async () => {
                              await invitationRequest('revoke', {
                                invitationId: t.invitationId,
                              });
                            }, 'Einladung widerrufen.');
                        }}
                      >
                        Widerrufen
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="text-button" onClick={() => onEdit(t)}>
                        Bearbeiten
                      </button>
                      {configured && !t.uid ? (
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => onInvite(t)}
                        >
                          Einladen
                        </button>
                      ) : (
                        <button
                          className="text-button"
                          disabled={busy || Boolean(uid && uid === t.uid)}
                          onClick={() => onToggle(t)}
                        >
                          {t.active ? 'Deaktivieren' : 'Aktivieren'}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })
      ) : (
        <div className="empty">Noch keine Trainer erfasst.</div>
      )}
    </section>
  );
}
