export type Member = {
  id: string;
  name: string;
  email: string;
  joined: string;
  revision: number;
};
export type Trainer = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  role: 'admin' | 'trainer';
  uid: string;
  revision: number;
};
export type Training = {
  id: string;
  day: number;
  name: string;
  start: string;
  end: string;
  active: boolean;
  trainerIds: string[];
  revision: number;
};
export type Attendance = {
  id: string;
  trainingId: string;
  date: string;
  memberIds: string[];
  trainingName: string;
  start: string;
  end: string;
  revision: number;
};
export type Incident = {
  id: string;
  member: string;
  date: string;
  category: string;
  detail: string;
  resolved: boolean;
  revision: number;
};
export type Data = {
  members: Member[];
  trainers: Trainer[];
  trainings: Training[];
  attendance: Attendance[];
  incidents: Incident[];
};
export type Entity = Member | Trainer | Training | Attendance | Incident;
export type Collection = keyof Data;
export type Access = {
  active: boolean;
  role: 'admin' | 'trainer';
  trainerId: string;
};
export const days = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];
export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekday(date: string) {
  return (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
}
export function validDate(date: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    !Number.isNaN(new Date(`${date}T12:00:00`).getTime()) &&
    localDate(new Date(`${date}T12:00:00`)) === date
  );
}
export function nextDate(day: number, from = localDate()) {
  const date = new Date(`${from}T12:00:00`);
  date.setDate(date.getDate() + ((day - weekday(from) + 7) % 7));
  return localDate(date);
}
const weekly: [number, string, string, string][] = [
  [0, '18:30', '19:30', 'Kickboxing'],
  [0, '19:40', '20:40', 'Grappling No-Gi'],
  [1, '18:15', '19:30', 'MMA Wettkämpfer'],
  [1, '18:15', '19:30', 'Brazilian Jiu-Jitsu Gi'],
  [1, '19:40', '20:40', 'MMA Wrestling'],
  [2, '16:00', '16:45', 'BJJ Kleinkinder'],
  [2, '16:45', '17:45', 'Kids Martial Arts U14'],
  [2, '18:00', '19:30', 'MMA Wettkämpfer'],
  [2, '19:40', '20:40', 'Kickboxing'],
  [3, '18:00', '19:30', 'Grappling No-Gi Wettkämpfer'],
  [3, '19:40', '20:40', 'MMA Basics'],
  [4, '06:45', '07:45', 'Morning Boxing'],
  [4, '16:45', '17:45', 'Kids Martial Arts U14'],
  [4, '18:00', '19:00', 'Kickboxing'],
  [4, '19:10', '20:30', 'Brazilian Jiu-Jitsu Gi'],
  [5, '10:00', '11:30', 'Grappling No-Gi'],
  [6, '09:00', '10:30', 'Brazilian Jiu-Jitsu Gi'],
];
export function initialTrainings(): Training[] {
  return weekly.map(([day, start, end, name], i) => ({
    id: `weekly-${String(i + 1).padStart(2, '0')}`,
    day,
    start,
    end,
    name,
    active: true,
    trainerIds: [],
    revision: 0,
  }));
}
export function emptyData(): Data {
  return {
    members: [],
    trainers: [],
    trainings: initialTrainings(),
    attendance: [],
    incidents: [],
  };
}
export function attendanceId(trainingId: string, date: string) {
  return `${trainingId}_${date}`;
}
export function attendanceDraft(
  training: Training,
  date: string,
  memberIds: string[],
  previous?: Attendance,
): Attendance {
  if (
    !validDate(date) ||
    (!previous && (weekday(date) !== training.day || !training.active))
  )
    throw new Error(
      'Bitte ein gültiges Datum dieses aktiven Trainings wählen.',
    );
  return {
    id: attendanceId(training.id, date),
    trainingId: training.id,
    date,
    memberIds: [...new Set(memberIds)].sort(),
    trainingName: previous?.trainingName ?? training.name,
    start: previous?.start ?? training.start,
    end: previous?.end ?? training.end,
    revision: previous?.revision ?? 0,
  };
}
export function validate(collection: Collection, entity: Entity) {
  if (!Number.isInteger(entity.revision) || entity.revision < 0)
    throw new Error('Ungültige Versionsnummer.');
  if (!/^[a-zA-Z0-9-]{1,100}(?:_\d{4}-\d{2}-\d{2})?$/.test(entity.id))
    throw new Error('Ungültige ID.');
  const text = (s: unknown, max: number, required = true) =>
    typeof s === 'string' &&
    s.length <= max &&
    (!required || s.trim().length > 0);
  const time = (s: unknown) =>
    typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
  const ids = (v: unknown, max: number) =>
    Array.isArray(v) &&
    v.length <= max &&
    v.every((s) => typeof s === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(s)) &&
    new Set(v).size === v.length;
  let ok = false;
  if (collection === 'members') {
    const e = entity as Member;
    ok = text(e.name, 100) && text(e.email, 200, false) && validDate(e.joined);
  }
  if (collection === 'trainers') {
    const e = entity as Trainer;
    ok =
      text(e.name, 100) &&
      text(e.email, 200) &&
      typeof e.active === 'boolean' &&
      ['admin', 'trainer'].includes(e.role) &&
      text(e.uid, 128, false) &&
      (!e.uid || /^[a-zA-Z0-9_-]+$/.test(e.uid));
  }
  if (collection === 'trainings') {
    const e = entity as Training;
    ok =
      text(e.name, 100) &&
      Number.isInteger(e.day) &&
      e.day >= 0 &&
      e.day < 7 &&
      time(e.start) &&
      time(e.end) &&
      e.start < e.end &&
      typeof e.active === 'boolean' &&
      ids(e.trainerIds, 30);
  }
  if (collection === 'attendance') {
    const e = entity as Attendance;
    ok =
      validDate(e.date) &&
      e.id === attendanceId(e.trainingId, e.date) &&
      ids(e.memberIds, 1000) &&
      text(e.trainingName, 100) &&
      time(e.start) &&
      time(e.end) &&
      e.start < e.end;
  }
  if (collection === 'incidents') {
    const e = entity as Incident;
    ok =
      text(e.member, 100) &&
      validDate(e.date) &&
      text(e.category, 100) &&
      text(e.detail, 3000) &&
      typeof e.resolved === 'boolean';
  }
  if (!ok)
    throw new Error(
      'Bitte die Eingaben prüfen (Name, Zeiten, Datum und Zuordnungen).',
    );
}
export const conflictMessage =
  'Dieser Eintrag wurde inzwischen geändert. Bitte neu öffnen und Änderungen erneut übernehmen.';
export function upsertLocal(
  data: Data,
  collection: Collection,
  entity: Entity,
): Data {
  validate(collection, entity);
  const rows = data[collection] as Entity[];
  const old = rows.find((row) => row.id === entity.id);
  if ((old?.revision ?? 0) !== entity.revision)
    throw new Error(conflictMessage);
  const next = { ...entity, revision: entity.revision + 1 };
  return {
    ...data,
    [collection]: old
      ? rows.map((row) => (row.id === entity.id ? next : row))
      : [...rows, next],
  };
}
export type LegacyData = {
  members: { id: string; name: string; email: string; joined?: string }[];
  incidents: Omit<Incident, 'revision'>[];
  attendance: Record<string, string[]>;
};
export function readLegacy(raw: string | null): LegacyData | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    if (
      !Array.isArray(d.members) ||
      !Array.isArray(d.incidents) ||
      !d.attendance ||
      typeof d.attendance !== 'object' ||
      Array.isArray(d.attendance)
    )
      return null;
    if (
      !d.members.every(
        (m: Member) =>
          typeof m.id === 'string' &&
          typeof m.name === 'string' &&
          typeof m.email === 'string',
      ) ||
      !Object.values(d.attendance).every(
        (v) => Array.isArray(v) && v.every((i) => typeof i === 'string'),
      )
    )
      return null;
    return d;
  } catch {
    return null;
  }
}
