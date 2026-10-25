import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  attendanceDraft,
  emptyData,
  initialTrainings,
  nextDate,
  readLegacy,
  upsertLocal,
  validate,
  weekday,
} from '../src/model.ts';
test('exact weekly schedule, 17 unique units and independent Tuesday parallel sessions', () => {
  const t = initialTrainings();
  assert.equal(t.length, 17);
  assert.equal(new Set(t.map((t) => t.id)).size, 17);
  assert.deepEqual(
    [0, 1, 2, 3, 4, 5, 6].map((day) => t.filter((v) => v.day === day).length),
    [2, 3, 4, 2, 4, 1, 1],
  );
  const parallel = t.filter((t) => t.day === 1 && t.start === '18:15');
  assert.equal(parallel.length, 2);
  const a = attendanceDraft(parallel[0], '2026-10-27', ['a', 'a']),
    b = attendanceDraft(parallel[1], '2026-10-27', ['b']);
  assert.notEqual(a.id, b.id);
  assert.deepEqual(a.memberIds, ['a']);
});
test('empty personal data and real statistics start at zero', () => {
  const d = emptyData();
  assert.equal(
    d.members.length +
      d.incidents.length +
      d.attendance.length +
      d.trainers.length,
    0,
  );
  assert.equal(d.trainings.filter((t) => t.active).length, 17);
});
test('recurrences, disabled training, invalid dates and times', () => {
  assert.equal(nextDate(0, '2026-10-25'), '2026-10-26');
  assert.equal(weekday('2026-10-26'), 0);
  const t = initialTrainings()[0];
  assert.throws(() => attendanceDraft(t, '2026-10-27', []));
  assert.throws(() => attendanceDraft(t, '2026-02-30', []));
  assert.throws(() =>
    attendanceDraft({ ...t, active: false }, '2026-10-26', []),
  );
  assert.throws(() => validate('trainings', { ...t, end: '17:00' }));
});
test('optimistic revision prevents lost updates and historical snapshot stays stable', () => {
  const t = initialTrainings()[0];
  const a = attendanceDraft(t, '2026-10-26', ['member']);
  let d = upsertLocal(emptyData(), 'attendance', a);
  assert.throws(() => upsertLocal(d, 'attendance', a));
  const saved = d.attendance[0];
  const changed = attendanceDraft(
    { ...t, name: 'Changed', start: '10:00' },
    saved.date,
    [],
    saved,
  );
  assert.equal(changed.trainingName, t.name);
  assert.equal(changed.start, t.start);
  d = upsertLocal(d, 'attendance', changed);
  assert.equal(d.attendance[0].revision, 2);
});
test('legacy data parser never removes or mutates ambiguous manual records', () => {
  const raw = JSON.stringify({
    members: [{ id: '1', name: 'Edited manually', email: 'test@example.com' }],
    incidents: [],
    attendance: { '2026-10-26': ['1'] },
  });
  const legacy = readLegacy(raw);
  assert.equal(legacy?.members[0].name, 'Edited manually');
  assert.equal(readLegacy('invalid'), null);
  assert.equal(JSON.parse(raw).members.length, 1);
});
