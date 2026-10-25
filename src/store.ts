import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  type Access,
  type Collection,
  type Data,
  type Entity,
  type Trainer,
  type Training,
  emptyData,
  initialTrainings,
  validate,
  upsertLocal,
  conflictMessage,
} from './model';
export const localKey = 'buddy-gym-v2-test';
export function readLocal(): Data {
  const raw = localStorage.getItem(localKey);
  if (!raw) return emptyData();
  const data = JSON.parse(raw) as Data;
  for (const key of [
    'members',
    'trainers',
    'trainings',
    'attendance',
    'incidents',
  ] as Collection[]) {
    if (!Array.isArray(data[key]))
      throw new Error(
        'Lokale Testdaten beschädigt. Bitte Sicherung exportieren, bevor Daten verändert werden.',
      );
    for (const entity of data[key]) validate(key, entity);
  }
  return data;
}
export function localSave(data: Data, key: Collection, entity: Entity): Data {
  const next = upsertLocal(data, key, entity);
  localStorage.setItem(localKey, JSON.stringify(next));
  return next;
}
export function watchData(
  next: (data: Data) => void,
  fail: (error: Error) => void,
): Unsubscribe {
  const data: Data = {
    members: [],
    trainers: [],
    trainings: [],
    attendance: [],
    incidents: [],
  };
  const ready = new Set<string>();
  const stops = (Object.keys(data) as Collection[]).map((key) =>
    onSnapshot(
      collection(db!, key),
      { includeMetadataChanges: true },
      (snapshot) => {
        if (snapshot.metadata.fromCache) return;
        (data[key] as Entity[]) = snapshot.docs.map(
          (d) => ({ ...d.data(), id: d.id }) as Entity,
        );
        ready.add(key);
        if (ready.size === 5) next(structuredClone(data));
      },
      fail,
    ),
  );
  return () => stops.forEach((stop) => stop());
}
export function watchAccess(
  uid: string,
  next: (access: Access | null) => void,
  fail: (e: Error) => void,
) {
  return onSnapshot(
    doc(db!, 'users', uid),
    { includeMetadataChanges: true },
    (snap) => {
      if (!snap.metadata.fromCache)
        next(snap.exists() ? (snap.data() as Access) : null);
    },
    fail,
  );
}
export async function saveRemote(key: Collection, entity: Entity) {
  validate(key, entity);
  await runTransaction(db!, async (tx) => {
    const ref = doc(db!, key, entity.id);
    const old = await tx.get(ref);
    if ((old.exists() ? old.data().revision : 0) !== entity.revision)
      throw new Error(conflictMessage);
    if (key === 'trainers') {
      const trainer = entity as Trainer;
      const oldUid = old.exists() ? (old.data().uid as string) : '';
      if (trainer.uid) {
        const account = await tx.get(doc(db!, 'users', trainer.uid));
        if (account.exists() && account.data().trainerId !== trainer.id)
          throw new Error(
            'Diese Firebase-UID ist bereits einem anderen Trainer zugeordnet.',
          );
      }
      if (oldUid && oldUid !== trainer.uid)
        tx.delete(doc(db!, 'users', oldUid));
      if (
        trainer.uid &&
        (!old.exists() ||
          oldUid !== trainer.uid ||
          old.data().role !== trainer.role ||
          old.data().active !== trainer.active)
      )
        tx.set(doc(db!, 'users', trainer.uid), {
          role: trainer.role,
          active: trainer.active,
          trainerId: trainer.id,
        });
    }
    tx.set(ref, { ...entity, revision: entity.revision + 1 });
  });
}
export async function deleteTraining(training: Training) {
  await runTransaction(db!, async (tx) => {
    const ref = doc(db!, 'trainings', training.id);
    const old = await tx.get(ref);
    if (!old.exists() || old.data().revision !== training.revision)
      throw new Error(conflictMessage);
    tx.delete(ref);
  });
}
// Atomic marker: never repopulate deleted or edited weekly sessions on later logins.
export async function seedSchedule() {
  await runTransaction(db!, async (tx) => {
    const marker = doc(db!, 'settings', 'schedule-v1');
    const exists = await tx.get(marker);
    if (exists.exists()) return;
    const trainings = initialTrainings();
    const snapshots = await Promise.all(
      trainings.map((t) => tx.get(doc(db!, 'trainings', t.id))),
    );
    trainings.forEach((t, i) => {
      if (!snapshots[i].exists())
        tx.set(doc(db!, 'trainings', t.id), { ...t, revision: 1 });
    });
    tx.set(marker, { initialized: true });
  });
}
