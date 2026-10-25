import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
} from 'firebase/auth';
import {
  Activity,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { auth, authReady, configured, configurationError } from './firebase';
import {
  attendanceDraft,
  attendanceId,
  days,
  localDate,
  nextDate,
  readLegacy,
  weekday,
  type Access,
  type Attendance,
  type Collection,
  type Data,
  type Entity,
  type Incident,
  type Member,
  type Trainer,
  type Training,
} from './model';
import {
  deleteTraining,
  localKey,
  localSave,
  readLocal,
  saveRemote,
  seedSchedule,
  watchAccess,
  watchData,
} from './store';

type Page =
  | 'Übersicht'
  | 'Trainingsplan'
  | 'Teilnehmer'
  | 'Anwesenheit'
  | 'Trainer'
  | 'Statistiken'
  | 'Vorfälle'
  | 'Alte Browserdaten';
type Edit = {
  kind: 'members' | 'trainers' | 'trainings' | 'incidents';
  entity?: Entity;
};
const nav = [
  { name: 'Übersicht', icon: LayoutDashboard },
  { name: 'Trainingsplan', icon: CalendarDays },
  { name: 'Teilnehmer', icon: Users },
  { name: 'Anwesenheit', icon: ClipboardCheck },
  { name: 'Trainer', icon: Users },
  { name: 'Statistiken', icon: TrendingUp },
  { name: 'Vorfälle', icon: ShieldAlert },
] as const;
const formatDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('de-CH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
const initials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('');
const errorText = (error: unknown) => {
  const code = (error as { code?: string })?.code;
  if (code?.startsWith('auth/'))
    return code === 'auth/network-request-failed'
      ? 'Keine Verbindung zur Anmeldung. Bitte erneut versuchen.'
      : 'Anmeldung nicht möglich. Bitte Zugangsdaten, E-Mail-Bestätigung und Kontofreigabe prüfen.';
  if (code === 'permission-denied')
    return 'Keine Berechtigung. Bitte Anmeldung und Freigabe durch einen Administrator prüfen.';
  if (code === 'unavailable')
    return 'Verbindung unterbrochen. Änderungen wurden nicht gespeichert. Bitte erneut versuchen.';
  return error instanceof Error
    ? error.message
    : 'Die Aktion konnte nicht abgeschlossen werden.';
};
function download(name: string, value: string) {
  const url = URL.createObjectURL(
    new Blob([value], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <Dumbbell size={25} />
      </span>
      <span>
        BUDDY<span className="brand-light"> GYM</span>
        <small>TRAINER-APP</small>
      </span>
    </div>
  );
}
function Login({ message = '' }: { message?: string }) {
  const [notice, setNotice] = useState(message),
    [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const f = new FormData(event.currentTarget);
    try {
      await authReady;
      await signInWithEmailAndPassword(
        auth!,
        String(f.get('email')),
        String(f.get('password')),
      );
    } catch (e) {
      setNotice(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-screen">
      <div className="login-brand">
        <Brand />
      </div>
      <section className="modal">
        <h1>Dein Trainerbereich.</h1>
        <p className="login-copy">
          Melde dich mit deinem freigegebenen Trainerkonto an.
        </p>
        <div className="notice">
          Einrichtung und Anmeldeprüfung: ausschliesslich Testdaten verwenden.
        </div>
        {notice && (
          <p role="alert" className="notice">
            {notice}
          </p>
        )}
        <form onSubmit={submit}>
          <label>
            E-Mail
            <input name="email" autoComplete="username" type="email" required />
          </label>
          <label>
            Passwort
            <input
              name="password"
              autoComplete="current-password"
              type="password"
              required
            />
          </label>
          <button disabled={busy} className="primary">
            {busy ? 'Wird angemeldet …' : 'Anmelden'}
          </button>
          <button
            disabled={busy}
            className="text-button reset-password"
            type="button"
            onClick={async (e) => {
              const form = e.currentTarget.form!;
              const email = String(new FormData(form).get('email'));
              if (
                !email ||
                !form
                  .querySelector<HTMLInputElement>('[name=email]')!
                  .checkValidity()
              ) {
                setNotice('Bitte eine gültige E-Mail-Adresse eingeben.');
                return;
              }
              setBusy(true);
              try {
                await authReady;
                await sendPasswordResetEmail(auth!, email);
                setNotice(
                  'Falls ein Konto besteht, erhältst du eine E-Mail zum Zurücksetzen.',
                );
              } catch (err) {
                setNotice(errorText(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Passwort vergessen?
          </button>
        </form>
      </section>
    </div>
  );
}
export default function App() {
  const [data, setData] = useState<Data | null>(null),
    [access, setAccess] = useState<Access | null>(null),
    [uid, setUid] = useState(''),
    [status, setStatus] = useState(
      configured ? 'Anmeldung wird geprüft …' : '',
    ),
    [fatal, setFatal] = useState('');
  useEffect(() => {
    if (configurationError) {
      setFatal(configurationError);
      return;
    }
    if (!configured) {
      try {
        setData(readLocal());
        setAccess({ active: true, role: 'admin', trainerId: '' });
      } catch (e) {
        setFatal(errorText(e));
      }
      return;
    }
    let stopAccess = () => {},
      stopData = () => {},
      alive = true,
      generation = 0,
      currentGrant = '';
    const stopAuth = onAuthStateChanged(auth!, (user) => {
      generation++;
      currentGrant = '';
      stopAccess();
      stopData();
      setData(null);
      setAccess(null);
      setUid(user?.uid ?? '');
      setFatal('');
      if (!user) {
        setStatus('');
        return;
      }
      if (!user.emailVerified) {
        setStatus(
          'Bitte zuerst deine E-Mail-Adresse bestätigen und dich danach erneut anmelden.',
        );
        return;
      }
      setStatus('Kontofreigabe wird geprüft …');
      stopAccess = watchAccess(
        user.uid,
        (profile) => {
          // Reconnect metadata for an unchanged grant must not discard an open draft.
          const signature = JSON.stringify(profile);
          if (signature === currentGrant) return;
          currentGrant = signature;
          const version = ++generation;
          stopData();
          setData(null);
          setAccess(null);
          if (
            !profile?.active ||
            !['admin', 'trainer'].includes(profile.role)
          ) {
            setStatus(
              'Dein Konto ist noch nicht freigegeben oder wurde deaktiviert. Bitte kontaktiere einen Administrator.',
            );
            return;
          }
          setAccess(profile);
          setStatus('Gemeinsame Testdaten werden geladen …');
          const begin = async () => {
            try {
              if (profile.role === 'admin') await seedSchedule();
              if (!alive || version !== generation) return;
              stopData = watchData(
                (value) => {
                  if (alive && version === generation) {
                    setData(value);
                    setStatus('');
                  }
                },
                (e) => {
                  setData(null);
                  setFatal(errorText(e));
                },
              );
            } catch (e) {
              if (alive && version === generation) {
                setData(null);
                setFatal(errorText(e));
              }
            }
          };
          void begin();
        },
        (e) => {
          stopData();
          setData(null);
          setAccess(null);
          setFatal(errorText(e));
        },
      );
    });
    return () => {
      alive = false;
      generation++;
      stopAuth();
      stopAccess();
      stopData();
    };
  }, []);
  useEffect(() => {
    if (configured) return;
    const listener = (e: StorageEvent) => {
      if (e.key === localKey) {
        try {
          setData(readLocal());
        } catch (err) {
          setFatal(errorText(err));
        }
      }
    };
    window.addEventListener('storage', listener);
    return () => window.removeEventListener('storage', listener);
  }, []);
  if (fatal)
    return (
      <div className="login-screen">
        <section className="modal">
          <h1>Zugriff pausiert</h1>
          <p role="alert" className="login-copy">
            {fatal}
          </p>
          <button
            className="secondary"
            onClick={() => window.location.reload()}
          >
            Erneut prüfen
          </button>
          {configured && (
            <button className="text-button" onClick={() => signOut(auth!)}>
              Abmelden
            </button>
          )}
          {!configured && (
            <button
              className="text-button"
              onClick={() =>
                download(
                  'buddy-gym-test-backup.json',
                  localStorage.getItem(localKey) ?? '{}',
                )
              }
            >
              Lokale Sicherung herunterladen
            </button>
          )}
        </section>
      </div>
    );
  if (configured && !uid && !status) return <Login />;
  if (!data || !access)
    return (
      <div className="login-screen">
        <section className="modal">
          <h1>BUDDY GYM</h1>
          <p role="status" className="login-copy">
            {status || 'Wird geladen …'}
          </p>
          {uid && (
            <>
              <button className="secondary" onClick={() => signOut(auth!)}>
                Abmelden
              </button>
              {auth?.currentUser && !auth.currentUser.emailVerified && (
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      await sendEmailVerification(auth!.currentUser!);
                      setStatus(
                        'Bestätigungslink gesendet. Bitte E-Mail öffnen, danach abmelden und erneut anmelden.',
                      );
                    } catch (e) {
                      setStatus(errorText(e));
                    }
                  }}
                >
                  E-Mail-Bestätigungslink senden
                </button>
              )}
            </>
          )}
        </section>
      </div>
    );
  return (
    <Workspace
      key={uid || 'local-test'}
      data={data}
      setData={setData}
      access={access}
      uid={uid}
    />
  );
}
function Workspace({
  data,
  setData,
  access,
  uid,
}: {
  data: Data;
  setData: (d: Data) => void;
  access: Access;
  uid: string;
}) {
  const [page, setPage] = useState<Page>('Übersicht'),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(''),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [edit, setEdit] = useState<Edit | null>(null),
    [busy, setBusy] = useState(false);
  const [date, setDate] = useState(localDate()),
    [trainingId, setTrainingId] = useState(''),
    [selection, setSelection] = useState<string[]>([]),
    [baseline, setBaseline] = useState<Attendance | undefined>(),
    [dirty, setDirty] = useState(false);
  const [legacyRaw] = useState(() => {
    try {
      return localStorage.getItem('buddy-gym-v1');
    } catch {
      return null;
    }
  });
  const legacy = readLegacy(legacyRaw);
  const admin = access.role === 'admin',
    today = localDate();
  const training = data.trainings.find((t) => t.id === trainingId);
  const saved = data.attendance.find(
    (a) => a.id === attendanceId(trainingId, date),
  );
  useEffect(() => {
    setSelection(saved?.memberIds ?? []);
    setBaseline(saved);
    setDirty(false);
  }, [trainingId, date]);
  useEffect(() => {
    if (!dirty) {
      setSelection(saved?.memberIds ?? []);
      setBaseline(saved);
    }
  }, [saved?.revision, dirty]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function canLeave() {
    return (
      !dirty ||
      window.confirm(
        'Die Anwesenheitsauswahl ist noch nicht gespeichert. Änderungen verwerfen?',
      )
    );
  }
  function navigate(next: Page) {
    if (!canLeave()) return;
    setDirty(false);
    setPage(next);
    setMenu(false);
    setSearch('');
    setError('');
  }
  function choose(id: string, day: string) {
    if (!canLeave()) return;
    setDirty(false);
    setTrainingId(id);
    setDate(day);
    setPage('Anwesenheit');
    setSearch('');
  }
  async function save(key: Collection, entity: Entity) {
    if (configured) await saveRemote(key, entity);
    else setData(localSave(readLocal(), key, entity));
  }
  async function action(
    fn: () => Promise<void>,
    message = 'Änderungen gespeichert.',
  ) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      setNotice(message);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveAttendance() {
    if (!training && !saved) return;
    await action(async () => {
      const source = training ?? {
        id: saved!.trainingId,
        day: weekday(date),
        name: saved!.trainingName,
        start: saved!.start,
        end: saved!.end,
        active: false,
        trainerIds: [],
        revision: 0,
      };
      const record = attendanceDraft(source, date, selection, baseline);
      await save('attendance', record);
      setDirty(false);
    }, 'Anwesenheit für dieses Training gespeichert.');
  }
  const filtered = data.members
    .filter((m) =>
      `${m.name} ${m.email}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const todayCount = data.attendance
    .filter((a) => a.date === today)
    .reduce((sum, a) => sum + a.memberIds.length, 0);
  const totalAttendance = data.attendance.reduce(
    (sum, a) => sum + a.memberIds.length,
    0,
  );
  const openIncidents = data.incidents.filter((i) => !i.resolved).length;
  function memberRows(members: Member[], attendance = false) {
    return members.map((m, i) => (
      <div className="member-row" key={m.id}>
        <span className={`avatar color-${i % 4}`}>{initials(m.name)}</span>
        <div className="member-name">
          <strong>{m.name}</strong>
          <span>{m.email || 'Keine E-Mail hinterlegt'}</span>
        </div>
        {attendance ? (
          <label className="attendance-check">
            <input
              type="checkbox"
              checked={selection.includes(m.id)}
              disabled={busy}
              onChange={() => {
                setSelection((ids) =>
                  ids.includes(m.id)
                    ? ids.filter((id) => id !== m.id)
                    : [...ids, m.id],
                );
                setDirty(true);
              }}
            />
            <span>Anwesend</span>
          </label>
        ) : (
          <button
            className="text-button"
            onClick={() => setEdit({ kind: 'members', entity: m })}
          >
            Bearbeiten <ChevronRight size={15} />
          </button>
        )}
      </div>
    ));
  }
  const activeTrainings = data.trainings
    .filter((t) => t.active)
    .sort(
      (a, b) =>
        a.day - b.day ||
        a.start.localeCompare(b.start) ||
        a.name.localeCompare(b.name),
    );
  const trainerNames = (ids: string[]) =>
    ids
      .map((id) => {
        const t = data.trainers.find((t) => t.id === id);
        return t
          ? `${t.name}${t.active ? '' : ' (inaktiv)'}`
          : 'Ehemaliger Trainer';
      })
      .join(', ') || 'Noch kein Trainer zugewiesen';
  const descriptions: Record<Page, string> = {
    Übersicht: 'Dein Team. Dein Training. Gemeinsam stärker.',
    Trainingsplan:
      'Wöchentlich wiederkehrende Einheiten – parallel und einzeln verwaltet.',
    Teilnehmer: 'Eine zentrale Teilnehmerliste für alle Trainings.',
    Anwesenheit:
      'Training und Datum wählen, Teilnehmer markieren und speichern.',
    Trainer: 'Trainer, Rollen und Trainingszuordnungen verwalten.',
    Statistiken: 'Auswertung der tatsächlich gespeicherten Trainingseinheiten.',
    Vorfälle: 'Vorfälle dokumentieren und gemeinsam bearbeiten.',
    'Alte Browserdaten':
      'Alte Einträge bleiben erhalten. Übernimm nur selbst erfasste Testdaten.',
  };
  const createKind =
    page === 'Trainingsplan'
      ? 'trainings'
      : page === 'Trainer'
        ? 'trainers'
        : page === 'Vorfälle'
          ? 'incidents'
          : 'members';
  return (
    <div className="app-shell">
      <aside className={menu ? 'sidebar visible' : 'sidebar'}>
        <Brand />
        <div className="workspace-label">DEIN WORKSPACE</div>
        <nav aria-label="Hauptnavigation">
          {nav.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={page === name ? 'nav-item active' : 'nav-item'}
              onClick={() => navigate(name)}
            >
              <Icon size={19} />
              {name}
              {name === 'Vorfälle' && openIncidents > 0 && (
                <span className="nav-count">{openIncidents}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge">
            <span />
            {configured ? 'Gemeinsame Testdaten' : 'Lokaler Testmodus'}
          </div>
          <div className="profile">
            <div className="avatar trainer">BG</div>
            <div>
              <strong>{admin ? 'Administrator' : 'Trainer'}</strong>
              <small>BUDDY GYM</small>
            </div>
          </div>
          {configured && (
            <button
              className="text-button"
              onClick={() => {
                if (canLeave()) void signOut(auth!);
              }}
            >
              Abmelden
            </button>
          )}
        </div>
      </aside>
      {menu && (
        <button
          className="menu-backdrop"
          aria-label="Menü schliessen"
          onClick={() => setMenu(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            onClick={() => setMenu(!menu)}
            aria-label="Menü öffnen"
            aria-expanded={menu}
          >
            <Menu size={22} />
          </button>
          <span>
            Workspace <ChevronRight size={14} />
            <strong>{page}</strong>
          </span>
          <span className="demo-tag">NUR TESTDATEN</span>
        </header>
        <main>
          <div className="notice test-banner">
            {configured
              ? 'Gemeinsamer Testbetrieb mit Firebase.'
              : 'Lokaler Testmodus – keine Synchronisierung zwischen Geräten.'}{' '}
            Bis zur abgeschlossenen Anmelde- und Sicherheitsprüfung
            ausschliesslich Testdaten verwenden.
          </div>
          <div className="page-heading">
            <div>
              <div className="eyebrow">LET’S MAKE IT COUNT</div>
              <h1>{page === 'Übersicht' ? 'Alles im Blick.' : page}</h1>
              <p>{descriptions[page]}</p>
            </div>
            {[
              'Übersicht',
              'Teilnehmer',
              'Trainingsplan',
              'Trainer',
              'Vorfälle',
            ].includes(page) &&
              (!['Trainingsplan', 'Trainer'].includes(page) || admin) && (
                <button
                  className="primary"
                  onClick={() => setEdit({ kind: createKind })}
                >
                  <Plus size={18} />
                  {createKind === 'trainings'
                    ? 'Training hinzufügen'
                    : createKind === 'trainers'
                      ? 'Trainer hinzufügen'
                      : createKind === 'incidents'
                        ? 'Vorfall melden'
                        : 'Teilnehmer hinzufügen'}
                </button>
              )}
          </div>
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                className="icon-button"
                aria-label="Hinweis schliessen"
                onClick={() => setNotice('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button
                className="icon-button"
                aria-label="Fehler schliessen"
                onClick={() => setError('')}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {legacyRaw && (
            <div className="notice legacy-banner">
              <span>Alte Browserdaten sind unverändert gesichert.</span>
              <button
                className="text-button"
                onClick={() => navigate('Alte Browserdaten')}
              >
                Prüfen und übernehmen <ChevronRight size={15} />
              </button>
            </div>
          )}
          {(page === 'Übersicht' || page === 'Statistiken') && (
            <div className="stats-grid">
              {[
                {
                  label: 'Teilnehmer gesamt',
                  value: data.members.length,
                  icon: Users,
                  note: 'Zentral verwaltet',
                  tone: 'green',
                },
                {
                  label: 'Erfasste Anwesenheiten',
                  value: totalAttendance,
                  icon: ClipboardCheck,
                  note: `Heute: ${todayCount} Trainingsbesuche`,
                  tone: 'lime',
                },
                {
                  label: 'Wöchentliche Einheiten',
                  value: activeTrainings.length,
                  icon: Activity,
                  note: `${data.attendance.length} Trainings erfasst`,
                  tone: 'blue',
                },
                {
                  label: 'Vorfallmeldungen',
                  value: data.incidents.length,
                  icon: ShieldAlert,
                  note: `${openIncidents} offen`,
                  tone: 'orange',
                },
              ].map(({ label, value, icon: Icon, note, tone }) => (
                <section className="stat-card" key={label}>
                  <div className="stat-top">
                    <span>{label}</span>
                    <span className={`stat-icon ${tone}`}>
                      <Icon size={18} />
                    </span>
                  </div>
                  <strong className="stat-number">{value}</strong>
                  <small>{note}</small>
                </section>
              ))}
            </div>
          )}
          {page === 'Übersicht' && (
            <>
              <section className="hero">
                <div className="hero-content">
                  <div className="hero-label">
                    <span /> GEMEINSAM IN BEWEGUNG
                  </div>
                  <h2>
                    Bereit für die
                    <br />
                    nächste Runde?
                  </h2>
                  <p>
                    Ein Plan. Ein Team.
                    <br />
                    Alle Trainings und Anwesenheiten im Blick.
                  </p>
                  <button onClick={() => navigate('Trainingsplan')}>
                    Zum Trainingsplan <ArrowRight size={15} />
                  </button>
                </div>
                <div className="hero-art" aria-hidden="true">
                  <div className="orbit" />
                  <div className="orbit orbit-two" />
                  <Dumbbell className="big-dumbbell" />
                  <span className="art-caption">
                    STRONGER
                    <br />
                    TOGETHER.
                  </span>
                </div>
              </section>
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Heutige Trainings</h2>
                      <p>{formatDate(today)}</p>
                    </div>
                  </div>
                  {activeTrainings
                    .filter((t) => t.day === weekday(today))
                    .map((t) => (
                      <button
                        className="quick-link"
                        key={t.id}
                        onClick={() => choose(t.id, today)}
                      >
                        <CalendarDays size={20} />
                        <span>
                          <strong>
                            {t.start}–{t.end} · {t.name}
                          </strong>
                          <small>{trainerNames(t.trainerIds)}</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  {!activeTrainings.some((t) => t.day === weekday(today)) && (
                    <div className="empty">Heute kein aktives Training.</div>
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Schnellzugriff</h2>
                  </div>
                  {(['Teilnehmer', 'Anwesenheit', 'Trainer'] as Page[]).map(
                    (name) => (
                      <button
                        key={name}
                        className="quick-link"
                        onClick={() => navigate(name)}
                      >
                        <span className="quick-icon">
                          <Users size={19} />
                        </span>
                        <strong>{name}</strong>
                        <ChevronRight size={16} />
                      </button>
                    ),
                  )}
                </section>
              </div>
            </>
          )}
          {page === 'Trainingsplan' && (
            <div className="week-grid">
              {days.map((day, index) => (
                <section className="panel day-panel" key={day}>
                  <div className="panel-heading">
                    <h2>{day}</h2>
                    <span className="count">
                      {
                        data.trainings.filter(
                          (t) => t.day === index && t.active,
                        ).length
                      }{' '}
                      aktiv
                    </span>
                  </div>
                  {data.trainings
                    .filter((t) => t.day === index)
                    .sort(
                      (a, b) =>
                        a.start.localeCompare(b.start) ||
                        a.name.localeCompare(b.name),
                    )
                    .map((t) => (
                      <article
                        className={`training-card ${t.active ? '' : 'inactive'}`}
                        key={t.id}
                      >
                        <button
                          className="training-open"
                          onClick={() => choose(t.id, nextDate(t.day))}
                        >
                          <span className="training-time">
                            {t.start}–{t.end}
                          </span>
                          <strong>{t.name}</strong>
                          <small>{trainerNames(t.trainerIds)}</small>
                          <span className="text-button">
                            {t.active
                              ? 'Training öffnen'
                              : 'Inaktiv · Verlauf öffnen'}{' '}
                            <ChevronRight size={14} />
                          </span>
                        </button>
                        {admin && (
                          <div className="row-actions">
                            <button
                              className="text-button"
                              onClick={() =>
                                setEdit({ kind: 'trainings', entity: t })
                              }
                            >
                              Bearbeiten
                            </button>
                            <button
                              className="text-button"
                              disabled={busy}
                              onClick={() =>
                                void action(() =>
                                  save('trainings', {
                                    ...t,
                                    active: !t.active,
                                  }),
                                )
                              }
                            >
                              {t.active ? 'Deaktivieren' : 'Aktivieren'}
                            </button>
                            <button
                              className="text-button danger"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `«${t.name}» löschen? Erfasste Anwesenheiten bleiben im Verlauf erhalten.`,
                                  )
                                )
                                  void action(async () => {
                                    if (configured) await deleteTraining(t);
                                    else {
                                      const current = readLocal();
                                      if (
                                        current.trainings.find(
                                          (v) => v.id === t.id,
                                        )?.revision !== t.revision
                                      )
                                        throw new Error(
                                          'Eintrag wurde geändert. Bitte erneut öffnen.',
                                        );
                                      const next = {
                                        ...current,
                                        trainings: current.trainings.filter(
                                          (v) => v.id !== t.id,
                                        ),
                                      };
                                      localStorage.setItem(
                                        localKey,
                                        JSON.stringify(next),
                                      );
                                      setData(next);
                                    }
                                  });
                              }}
                            >
                              Löschen
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                  {!data.trainings.some((t) => t.day === index) && (
                    <div className="empty">Keine Einheiten.</div>
                  )}
                </section>
              ))}
            </div>
          )}
          {page === 'Teilnehmer' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>
                  Teilnehmer{' '}
                  <span className="count">{data.members.length}</span>
                </h2>
              </div>
              <SearchField value={search} onChange={setSearch} />
              {filtered.length ? (
                memberRows(filtered)
              ) : (
                <div className="empty">
                  Keine Teilnehmer gefunden. Füge den ersten Teilnehmer hinzu.
                </div>
              )}
            </section>
          )}
          {page === 'Anwesenheit' && (
            <>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Training auswählen</h2>
                </div>
                <div className="attendance-controls">
                  <label>
                    Datum
                    <input
                      aria-label="Trainingsdatum"
                      type="date"
                      value={date}
                      onChange={(e) => {
                        if (e.target.value && canLeave()) {
                          setDate(e.target.value);
                          setTrainingId('');
                          setDirty(false);
                        }
                      }}
                    />
                  </label>
                  <label>
                    Training
                    <select
                      aria-label="Training auswählen"
                      value={trainingId}
                      onChange={(e) => {
                        if (canLeave()) {
                          setTrainingId(e.target.value);
                          setDirty(false);
                        }
                      }}
                    >
                      <option value="">Bitte wählen</option>
                      {data.trainings
                        .filter(
                          (t) =>
                            (t.active && t.day === weekday(date)) ||
                            data.attendance.some(
                              (a) => a.trainingId === t.id && a.date === date,
                            ),
                        )
                        .sort((a, b) => a.start.localeCompare(b.start))
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.start}–{t.end} · {t.name}
                            {t.active ? '' : ' (inaktiv)'}
                          </option>
                        ))}
                      {data.attendance
                        .filter(
                          (a) =>
                            a.date === date &&
                            !data.trainings.some((t) => t.id === a.trainingId),
                        )
                        .map((a) => (
                          <option key={a.id} value={a.trainingId}>
                            {a.start}–{a.end} · {a.trainingName} (gelöscht)
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              </section>
              {trainingId && (training || saved) && (
                <section className="panel attendance-panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{saved?.trainingName ?? training?.name}</h2>
                      <p>
                        {formatDate(date)} · {saved?.start ?? training?.start}–
                        {saved?.end ?? training?.end} · {selection.length}{' '}
                        anwesend
                      </p>
                    </div>
                    {training && (
                      <small>{trainerNames(training.trainerIds)}</small>
                    )}
                  </div>
                  {!saved &&
                  (!training?.active || training.day !== weekday(date)) ? (
                    <div className="empty">
                      An diesem Datum findet diese Einheit nicht statt.
                      Vergangene Erfassungen findest du im Verlauf.
                    </div>
                  ) : (
                    <>
                      <SearchField value={search} onChange={setSearch} />
                      <div className="bulk-actions">
                        <button
                          className="secondary"
                          disabled={busy || !filtered.length}
                          onClick={() => {
                            setSelection((ids) => [
                              ...new Set([
                                ...ids,
                                ...filtered.map((m) => m.id),
                              ]),
                            ]);
                            setDirty(true);
                          }}
                        >
                          Suchergebnisse auswählen ({filtered.length})
                        </button>
                        <button
                          className="text-button"
                          disabled={busy || !filtered.length}
                          onClick={() => {
                            setSelection((ids) =>
                              ids.filter(
                                (id) => !filtered.some((m) => m.id === id),
                              ),
                            );
                            setDirty(true);
                          }}
                        >
                          Suchergebnisse abwählen
                        </button>
                      </div>
                      {filtered.length ? (
                        memberRows(filtered, true)
                      ) : (
                        <div className="empty">Keine Teilnehmer gefunden.</div>
                      )}
                      {selection.some(
                        (id) => !data.members.some((m) => m.id === id),
                      ) && (
                        <p className="stat-note">
                          Die Liste enthält archivierte Teilnehmer-IDs. Diese
                          Zuordnungen bleiben erhalten.
                        </p>
                      )}
                      <div className="save-bar">
                        <span>
                          {dirty
                            ? 'Ungespeicherte Änderungen'
                            : saved
                              ? 'Gespeicherte Anwesenheit'
                              : 'Noch keine Anwesenheit erfasst'}
                        </span>
                        {dirty && (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() => {
                              if (
                                window.confirm(
                                  'Eigene Auswahl verwerfen und neuesten gespeicherten Stand laden?',
                                )
                              ) {
                                setSelection(saved?.memberIds ?? []);
                                setBaseline(saved);
                                setDirty(false);
                              }
                            }}
                          >
                            Gespeicherten Stand laden
                          </button>
                        )}
                        <button
                          disabled={busy}
                          className="primary"
                          onClick={() => void saveAttendance()}
                        >
                          <Check size={17} />
                          {busy
                            ? 'Wird gespeichert …'
                            : 'Anwesenheit speichern'}
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}
              <section className="panel attendance-panel">
                <div className="panel-heading">
                  <h2>Vergangene und erfasste Trainings</h2>
                  <p>
                    Auch deaktivierte und gelöschte Einheiten bleiben
                    nachvollziehbar.
                  </p>
                </div>
                {data.attendance.length ? (
                  data.attendance
                    .slice()
                    .sort(
                      (a, b) =>
                        b.date.localeCompare(a.date) ||
                        a.start.localeCompare(b.start),
                    )
                    .map((a) => (
                      <button
                        className="quick-link"
                        key={a.id}
                        onClick={() => choose(a.trainingId, a.date)}
                      >
                        <ClipboardCheck size={20} />
                        <span>
                          <strong>
                            {formatDate(a.date)} · {a.start} · {a.trainingName}
                          </strong>
                          <small>{a.memberIds.length} anwesend</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))
                ) : (
                  <div className="empty">Noch keine Anwesenheit erfasst.</div>
                )}
              </section>
            </>
          )}
          {page === 'Trainer' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Dein Trainerteam</h2>
                  <p>
                    {admin
                      ? 'Konten in Firebase Authentication anlegen und hier über die UID freigeben.'
                      : 'Trainerzuordnungen und Rollen sind durch Administratoren verwaltet.'}
                  </p>
                </div>
              </div>
              {data.trainers.length ? (
                data.trainers.map((t) => (
                  <div
                    className={`member-row trainer-row ${t.active ? '' : 'inactive'}`}
                    key={t.id}
                  >
                    <span className="avatar">{initials(t.name)}</span>
                    <div className="member-name">
                      <strong>
                        {t.name} ·{' '}
                        {t.role === 'admin' ? 'Administrator' : 'Trainer'}
                        {t.active ? '' : ' · Inaktiv'}
                      </strong>
                      <span>
                        {t.email} · {t.uid ? 'Login verknüpft' : 'Ohne Login'}
                      </span>
                      <span>
                        {data.trainings
                          .filter((p) => p.trainerIds.includes(t.id))
                          .map((p) => `${days[p.day]} ${p.start} ${p.name}`)
                          .join(' · ') || 'Noch keinem Training zugeordnet'}
                      </span>
                    </div>
                    {admin && (
                      <div className="row-actions">
                        <button
                          className="text-button"
                          onClick={() =>
                            setEdit({ kind: 'trainers', entity: t })
                          }
                        >
                          Bearbeiten
                        </button>
                        <button
                          className="text-button"
                          disabled={busy || Boolean(uid && uid === t.uid)}
                          onClick={() =>
                            void action(() =>
                              save('trainers', { ...t, active: !t.active }),
                            )
                          }
                        >
                          {t.active ? 'Deaktivieren' : 'Aktivieren'}
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="empty">Noch keine Trainer erfasst.</div>
              )}
            </section>
          )}
          {page === 'Statistiken' && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Anwesenheiten pro Training</h2>
                  <p>
                    Jede Teilnahme zählt für genau eine Einheit und ein Datum.
                  </p>
                </div>
              </div>
              {data.attendance.length ? (
                data.attendance
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((a) => (
                    <div className="member-row" key={a.id}>
                      <div className="member-name">
                        <strong>{a.trainingName}</strong>
                        <span>
                          {formatDate(a.date)} · {a.start}–{a.end}
                        </span>
                      </div>
                      <strong>{a.memberIds.length}</strong>
                    </div>
                  ))
              ) : (
                <div className="empty">Noch keine Statistiken vorhanden.</div>
              )}
            </section>
          )}
          {page === 'Vorfälle' && (
            <section className="panel">
              <div className="panel-heading">
                <h2>Vorfallprotokoll</h2>
                <p>{openIncidents} offen</p>
              </div>
              {data.incidents.length ? (
                data.incidents.map((i) => (
                  <article className="incident" key={i.id}>
                    <div
                      className={`incident-icon ${i.resolved ? 'resolved' : ''}`}
                    >
                      {i.resolved ? (
                        <CheckCircle2 size={21} />
                      ) : (
                        <ShieldAlert size={21} />
                      )}
                    </div>
                    <div className="incident-body">
                      <div className="incident-title">
                        <h3>
                          {i.category} · {i.member}
                        </h3>
                        <span className="status-tag">
                          {i.resolved ? 'Erledigt' : 'Offen'}
                        </span>
                      </div>
                      <small>{formatDate(i.date)}</small>
                      <p>{i.detail}</p>
                      <div className="row-actions">
                        <button
                          className="text-button"
                          onClick={() =>
                            setEdit({ kind: 'incidents', entity: i })
                          }
                        >
                          Bearbeiten
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void action(() =>
                              save('incidents', {
                                ...i,
                                resolved: !i.resolved,
                              }),
                            )
                          }
                        >
                          {i.resolved
                            ? 'Wieder öffnen'
                            : 'Als erledigt markieren'}{' '}
                          <Check size={15} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="empty">Keine Vorfälle dokumentiert.</div>
              )}
            </section>
          )}
          {page === 'Alte Browserdaten' && (
            <LegacyReview
              raw={legacyRaw}
              legacy={legacy}
              data={data}
              busy={busy}
              save={save}
              action={action}
            />
          )}
          <footer>
            <span>
              BUDDY GYM <span className="footer-divider">/</span> Gemeinsam in
              Bewegung.
            </span>
            <span>
              {configured
                ? 'Gemeinsame Testdaten · Firebase'
                : 'Testdaten · nur in diesem Browser'}
            </span>
          </footer>
        </main>
      </div>
      {edit && (
        <Editor
          edit={edit}
          data={data}
          uid={uid}
          onClose={() => setEdit(null)}
          onSave={async (entity) => {
            await save(edit.kind, entity);
            setNotice('Änderungen gespeichert.');
            setEdit(null);
          }}
        />
      )}
    </div>
  );
}
function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (s: string) => void;
}) {
  return (
    <div className="filters">
      <label className="search">
        <Search size={17} />
        <input
          aria-label="Teilnehmer suchen"
          placeholder="Teilnehmer suchen …"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}
function Modal({
  title,
  onClose,
  children,
  busy,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current
      ?.querySelector<HTMLElement>('input,select,textarea,button')
      ?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) onClose();
      if (e.key !== 'Tab') return;
      const nodes = ref.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)',
      );
      if (!nodes?.length) return;
      const first = nodes[0],
        last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [busy, onClose]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={ref}
      >
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button
            className="icon-button"
            disabled={busy}
            aria-label="Dialog schliessen"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
function Editor({
  edit,
  data,
  uid,
  onClose,
  onSave,
}: {
  edit: Edit;
  data: Data;
  uid: string;
  onClose: () => void;
  onSave: (e: Entity) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const e = edit.entity;
  const t = e as Training | undefined,
    trainer = e as Trainer | undefined,
    m = e as Member | undefined,
    i = e as Incident | undefined;
  const self = Boolean(uid && trainer?.uid === uid);
  const titles = {
    members: 'Teilnehmer',
    trainings: 'Training',
    trainers: 'Trainer',
    incidents: 'Vorfall',
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const f = new FormData(event.currentTarget),
      s = (name: string) => String(f.get(name) ?? '').trim();
    const base = {
      id: e?.id ?? crypto.randomUUID(),
      revision: e?.revision ?? 0,
    };
    let value: Entity;
    if (edit.kind === 'members')
      value = {
        ...base,
        name: s('name'),
        email: s('email'),
        joined: m?.joined ?? localDate(),
      };
    else if (edit.kind === 'trainings')
      value = {
        ...base,
        name: s('name'),
        day: Number(s('day')),
        start: s('start'),
        end: s('end'),
        active: t?.active ?? true,
        trainerIds: f.getAll('trainerIds').map(String),
      };
    else if (edit.kind === 'trainers')
      value = {
        ...base,
        name: s('name'),
        email: s('email'),
        active: trainer?.active ?? true,
        role: self ? trainer!.role : (s('role') as Trainer['role']),
        uid: self ? uid : s('uid'),
      };
    else
      value = {
        ...base,
        member: s('member'),
        date: s('date'),
        category: s('category'),
        detail: s('detail'),
        resolved: i?.resolved ?? false,
      };
    try {
      await onSave(value);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${titles[edit.kind]} ${e ? 'bearbeiten' : 'hinzufügen'}`}
      onClose={onClose}
      busy={busy}
    >
      <form onSubmit={submit}>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <fieldset disabled={busy} className="editor-fields">
          {edit.kind !== 'incidents' && (
            <label>
              {edit.kind === 'trainings'
                ? 'Trainingsart'
                : 'Vollständiger Name'}
              <input
                name="name"
                required
                maxLength={100}
                defaultValue={(e as Member | undefined)?.name}
              />
            </label>
          )}
          {(edit.kind === 'members' || edit.kind === 'trainers') && (
            <label>
              E-Mail{edit.kind === 'members' ? ' (optional)' : ''}
              <input
                name="email"
                type="email"
                required={edit.kind === 'trainers'}
                maxLength={200}
                defaultValue={m?.email}
              />
            </label>
          )}
          {edit.kind === 'trainings' && (
            <>
              <label>
                Wochentag
                <select name="day" defaultValue={t?.day ?? 0}>
                  {days.map((d, index) => (
                    <option key={d} value={index}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Beginn
                  <input
                    required
                    name="start"
                    type="time"
                    defaultValue={t?.start ?? '18:00'}
                  />
                </label>
                <label>
                  Ende
                  <input
                    required
                    name="end"
                    type="time"
                    defaultValue={t?.end ?? '19:00'}
                  />
                </label>
              </div>
              <fieldset className="trainer-options">
                <legend>Trainer zuweisen</legend>
                {data.trainers
                  .filter((tr) => tr.active || t?.trainerIds.includes(tr.id))
                  .map((tr) => (
                    <label className="checkbox-label" key={tr.id}>
                      <input
                        type="checkbox"
                        name="trainerIds"
                        value={tr.id}
                        defaultChecked={t?.trainerIds.includes(tr.id)}
                      />
                      {tr.name}
                      {tr.active ? '' : ' (inaktiv)'}
                    </label>
                  ))}
                {!data.trainers.length && (
                  <p className="form-note">
                    Lege zuerst einen Trainer unter «Trainer» an.
                  </p>
                )}
              </fieldset>
            </>
          )}
          {edit.kind === 'trainers' && (
            <>
              <label>
                Rolle
                <select
                  name="role"
                  defaultValue={trainer?.role ?? 'trainer'}
                  disabled={self}
                >
                  <option value="trainer">Trainer</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
              <label>
                Firebase Authentication UID (optional)
                <input
                  name="uid"
                  maxLength={128}
                  pattern="[a-zA-Z0-9_-]+"
                  defaultValue={trainer?.uid ?? ''}
                  disabled={self}
                />
              </label>
              <p className="form-note">
                Das Login separat in Firebase Authentication erstellen und
                E-Mail bestätigen lassen. Die UID verbindet dieses Profil mit
                dem Konto. Ohne UID besteht kein Login-Zugriff. Die eigene
                Kontofreigabe kann hier nicht verändert werden.
              </p>
            </>
          )}
          {edit.kind === 'incidents' && (
            <>
              <label>
                Teilnehmer
                <select
                  name="member"
                  defaultValue={i?.member ?? 'Allgemein / ohne Teilnehmer'}
                >
                  <option>Allgemein / ohne Teilnehmer</option>
                  {i?.member &&
                    !data.members.some((m) => m.name === i.member) &&
                    i.member !== 'Allgemein / ohne Teilnehmer' && (
                      <option>{i.member}</option>
                    )}
                  {data.members.map((m) => (
                    <option key={m.id}>{m.name}</option>
                  ))}
                </select>
              </label>
              <div className="form-grid">
                <label>
                  Kategorie
                  <select
                    name="category"
                    defaultValue={i?.category ?? 'Verletzung'}
                  >
                    {['Verletzung', 'Verhalten', 'Ausrüstung', 'Sonstiges'].map(
                      (c) => (
                        <option key={c}>{c}</option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Datum
                  <input
                    name="date"
                    type="date"
                    required
                    defaultValue={i?.date ?? localDate()}
                  />
                </label>
              </div>
              <label>
                Beschreibung
                <textarea
                  name="detail"
                  required
                  maxLength={3000}
                  rows={4}
                  defaultValue={i?.detail}
                />
              </label>
            </>
          )}
        </fieldset>
        <p className="form-note">Ausschliesslich Testdaten verwenden.</p>
        <div className="modal-actions">
          <button
            type="button"
            disabled={busy}
            className="secondary"
            onClick={onClose}
          >
            Abbrechen
          </button>
          <button type="submit" disabled={busy} className="primary">
            <Check size={17} />
            {busy ? 'Wird gespeichert …' : 'Speichern'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function LegacyReview({
  raw,
  legacy,
  data,
  busy,
  save,
  action,
}: {
  raw: string | null;
  legacy: ReturnType<typeof readLegacy>;
  data: Data;
  busy: boolean;
  save: (key: Collection, e: Entity) => Promise<void>;
  action: (fn: () => Promise<void>, message?: string) => Promise<void>;
}) {
  const [memberIds, setMemberIds] = useState<string[]>([]),
    [incidentIds, setIncidentIds] = useState<string[]>([]),
    [assignments, setAssignments] = useState<Record<string, string>>({});
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>Altdaten prüfen</h2>
          <p>
            Keine automatische Löschung oder Übernahme. Auch unveränderte
            Beispiele könnten manuell angepasst worden sein.
          </p>
        </div>
        <button
          className="secondary"
          onClick={() => download('buddy-gym-v1-sicherung.json', raw ?? '{}')}
        >
          Original herunterladen
        </button>
      </div>
      {!legacy ? (
        <div className="empty">
          Altdaten nicht lesbar. Das Original bleibt zum Herunterladen erhalten.
        </div>
      ) : (
        <>
          <div className="migration-copy">
            Wähle ausschliesslich selbst erfasste Testeinträge. Alte
            Anwesenheiten haben noch keine Trainingseinheit: Weise jeden Tag
            ausdrücklich einem Training zu. Bestehende Erfassungen werden nicht
            überschrieben.
          </div>
          <h3 className="migration-title">Teilnehmer</h3>
          {legacy.members.map((m) => (
            <label className="migration-row" key={m.id}>
              <input
                type="checkbox"
                checked={memberIds.includes(m.id)}
                disabled={data.members.some((v) => v.id === `legacy-${m.id}`)}
                onChange={(e) =>
                  setMemberIds((ids) =>
                    e.target.checked
                      ? [...ids, m.id]
                      : ids.filter((id) => id !== m.id),
                  )
                }
              />
              <span>
                {m.name} · {m.email}
                {data.members.some((v) => v.id === `legacy-${m.id}`)
                  ? ' (übernommen)'
                  : ''}
              </span>
            </label>
          ))}
          <h3 className="migration-title">Vorfälle</h3>
          {legacy.incidents.map((i) => (
            <label className="migration-row" key={i.id}>
              <input
                type="checkbox"
                checked={incidentIds.includes(i.id)}
                disabled={data.incidents.some((v) => v.id === `legacy-${i.id}`)}
                onChange={(e) =>
                  setIncidentIds((ids) =>
                    e.target.checked
                      ? [...ids, i.id]
                      : ids.filter((id) => id !== i.id),
                  )
                }
              />
              <span>
                {i.date} · {i.member}: {i.detail}
              </span>
            </label>
          ))}
          <h3 className="migration-title">Alte Anwesenheiten</h3>
          {Object.entries(legacy.attendance).map(([date, ids]) => (
            <label className="migration-row" key={date}>
              <span>
                {date} · {ids.length} Personen
              </span>
              <select
                aria-label={`Alte Anwesenheit ${date} zuordnen`}
                value={assignments[date] ?? ''}
                onChange={(e) =>
                  setAssignments((v) => ({ ...v, [date]: e.target.value }))
                }
              >
                <option value="">Nicht übernehmen</option>
                {data.trainings
                  .filter((t) => t.active && t.day === weekday(date))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.start} {t.name}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          <div className="save-bar">
            <p className="form-note">
              Originaldaten bleiben nach der Übernahme erhalten.
            </p>
            <button
              disabled={busy}
              className="primary"
              onClick={() =>
                void action(async () => {
                  // Preflight all selected records before the first write. Stable IDs make retries safe.
                  for (const [date, id] of Object.entries(assignments).filter(
                    ([, id]) => id,
                  )) {
                    if (
                      data.attendance.some(
                        (a) => a.id === attendanceId(id, date),
                      )
                    )
                      throw new Error(
                        'Anwesenheit existiert bereits. Bitte diese Tageszuordnung abwählen.',
                      );
                    if (
                      legacy.attendance[date].some(
                        (old) =>
                          !data.members.some((m) => m.id === `legacy-${old}`) &&
                          !memberIds.includes(old),
                      )
                    )
                      throw new Error(
                        'Bitte zuerst alle Teilnehmer der gewählten Altdaten auswählen oder übernehmen.',
                      );
                  }
                  for (const m of legacy.members.filter(
                    (m) =>
                      memberIds.includes(m.id) &&
                      !data.members.some((v) => v.id === `legacy-${m.id}`),
                  ))
                    await save('members', {
                      id: `legacy-${m.id}`,
                      name: m.name,
                      email: m.email,
                      joined: m.joined ?? localDate(),
                      revision: 0,
                    });
                  for (const i of legacy.incidents.filter(
                    (i) =>
                      incidentIds.includes(i.id) &&
                      !data.incidents.some((v) => v.id === `legacy-${i.id}`),
                  ))
                    await save('incidents', {
                      ...i,
                      id: `legacy-${i.id}`,
                      revision: 0,
                    });
                  for (const [date, id] of Object.entries(assignments).filter(
                    ([, id]) => id,
                  ))
                    await save(
                      'attendance',
                      attendanceDraft(
                        data.trainings.find((t) => t.id === id)!,
                        date,
                        legacy.attendance[date].map((id) => `legacy-${id}`),
                      ),
                    );
                  setMemberIds([]);
                  setIncidentIds([]);
                  setAssignments({});
                }, 'Ausgewählte Altdaten übernommen. Original bleibt unverändert.')
              }
            >
              <Check size={17} />
              Ausgewählte Testdaten übernehmen
            </button>
          </div>
        </>
      )}
    </section>
  );
}
