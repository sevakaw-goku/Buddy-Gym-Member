import { test, expect, type Page } from '@playwright/test';
async function nav(page: Page, name: string) {
  const mobile = await page
    .getByRole('button', { name: 'Menü öffnen' })
    .isVisible();
  if (mobile) await page.getByRole('button', { name: 'Menü öffnen' }).click();
  await page
    .getByRole('navigation')
    .getByRole('button', { name, exact: true })
    .click();
}
async function member(page: Page, name: string) {
  await nav(page, 'Teilnehmer');
  await page.getByRole('button', { name: 'Teilnehmer hinzufügen' }).click();
  await page.getByLabel('Vollständiger Name').fill(name);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
});
test('clean start, exact schedule and responsive navigation', async ({
  page,
}) => {
  await expect(page.locator('.stat-number')).toHaveText(['0', '0', '17', '0']);
  await nav(page, 'Trainingsplan');
  await expect(page.locator('.training-card')).toHaveCount(17);
  const tue = page.locator('.day-panel').filter({
    has: page.getByRole('heading', { name: 'Dienstag', exact: true }),
  });
  await expect(tue.locator('.training-card')).toHaveCount(3);
  await expect(tue.getByText('18:15–19:30', { exact: true })).toHaveCount(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `work/schedule-${test.info().project.name}.png`,
    fullPage: true,
  });
});
test('trainer CRUD, multiple assignment, recurring training CRUD and invalid times', async ({
  page,
}) => {
  await nav(page, 'Trainer');
  await page.getByRole('button', { name: 'Trainer hinzufügen' }).click();
  await page.getByLabel('Vollständiger Name').fill('Test Coach');
  await page.getByLabel('E-Mail', { exact: true }).fill('coach@example.com');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByLabel('Vollständiger Name').fill('Test Coach Updated');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Speichern', exact: true })
    .click();
  await page.getByRole('button', { name: 'Trainer hinzufügen' }).click();
  await page.getByLabel('Vollständiger Name').fill('Second Test Coach');
  await page.getByLabel('E-Mail', { exact: true }).fill('second@example.com');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Speichern', exact: true })
    .click();
  await nav(page, 'Trainingsplan');
  const card = page.locator('.training-card').first();
  await card.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByLabel('Test Coach Updated', { exact: true }).check();
  await page.getByLabel('Second Test Coach', { exact: true }).check();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Speichern', exact: true })
    .click();
  await expect(card).toContainText('Test Coach Updated');
  await expect(card).toContainText('Second Test Coach');
  await page.getByRole('button', { name: 'Training hinzufügen' }).click();
  await page.getByLabel('Trainingsart').fill('Test Session');
  await page.getByLabel('Beginn', { exact: true }).fill('20:00');
  await page.getByLabel('Ende', { exact: true }).fill('19:00');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Speichern', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByLabel('Ende', { exact: true }).fill('21:00');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Speichern', exact: true })
    .click();
  const created = page
    .locator('.training-card')
    .filter({ hasText: 'Test Session' });
  await expect(created).toBeVisible();
  await created
    .getByRole('button', { name: 'Deaktivieren', exact: true })
    .click();
  await expect(
    created.getByRole('button', { name: 'Aktivieren', exact: true }),
  ).toBeVisible();
  page.once('dialog', (d) => d.accept());
  await created.getByRole('button', { name: 'Löschen', exact: true }).click();
  await expect(created).toHaveCount(0);
  await nav(page, 'Trainer');
  await page
    .locator('.trainer-row')
    .filter({ hasText: 'Test Coach Updated' })
    .getByRole('button', { name: 'Deaktivieren', exact: true })
    .click();
  await expect(
    page.getByText('Test Coach Updated · Trainer · Inaktiv', { exact: true }),
  ).toBeVisible();
});
test('central participants, separate parallel attendance, history edit after training deletion and incidents', async ({
  page,
}) => {
  await member(page, 'Test Alice');
  await member(page, 'Test Bob');
  await nav(page, 'Anwesenheit');
  await page.getByLabel('Trainingsdatum').fill('2026-10-27');
  await page
    .getByLabel('Training auswählen', { exact: true })
    .selectOption('weekly-03');
  await page.getByLabel('Teilnehmer suchen').fill('Alice');
  await page
    .getByRole('button', { name: 'Suchergebnisse auswählen (1)', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Anwesenheit speichern', exact: true })
    .click();
  await expect(
    page.getByText('Gespeicherte Anwesenheit', { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel('Training auswählen', { exact: true })
    .selectOption('weekly-04');
  await expect(page.locator('.attendance-check input:checked')).toHaveCount(0);
  await page.getByLabel('Teilnehmer suchen').fill('Bob');
  await page.locator('.attendance-check input').check();
  await page
    .getByRole('button', { name: 'Anwesenheit speichern', exact: true })
    .click();
  await expect(
    page.getByText('Gespeicherte Anwesenheit', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await nav(page, 'Anwesenheit');
  await page
    .getByRole('button', { name: /27. Oktober 2026 · 18:15 · MMA Wettkämpfer/ })
    .click();
  await expect(page.locator('.attendance-check input:checked')).toHaveCount(1);
  await nav(page, 'Trainingsplan');
  const c = page
    .locator('.day-panel')
    .filter({
      has: page.getByRole('heading', { name: 'Dienstag', exact: true }),
    })
    .locator('.training-card')
    .filter({ hasText: 'MMA Wettkämpfer' });
  page.once('dialog', (d) => d.accept());
  await c.getByRole('button', { name: 'Löschen', exact: true }).click();
  await nav(page, 'Anwesenheit');
  await page
    .getByRole('button', { name: /27. Oktober 2026 · 18:15 · MMA Wettkämpfer/ })
    .click();
  await page.locator('.attendance-check input:checked').uncheck();
  await page
    .getByRole('button', { name: 'Anwesenheit speichern', exact: true })
    .click();
  await expect(
    page.getByText('Gespeicherte Anwesenheit', { exact: true }),
  ).toBeVisible();
  await nav(page, 'Vorfälle');
  await page.getByRole('button', { name: 'Vorfall melden' }).click();
  await page.getByLabel('Beschreibung').fill('Test incident only');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Speichern', exact: true })
    .click();
  await page.getByRole('button', { name: 'Als erledigt markieren' }).click();
  await expect(
    page.getByRole('button', { name: 'Wieder öffnen' }),
  ).toBeVisible();
  await nav(page, 'Übersicht');
  await expect(page.locator('.stat-number')).toHaveText(['2', '1', '16', '1']);
});
test('old data preserved and selectively imported without seeding examples', async ({
  page,
}) => {
  const legacy = {
    members: [
      {
        id: '1',
        name: 'Manually Edited',
        email: 'test@example.com',
        joined: '2026-10-01',
      },
    ],
    incidents: [],
    attendance: { '2026-10-26': ['1'] },
  };
  await page.evaluate(
    (data) => localStorage.setItem('buddy-gym-v1', JSON.stringify(data)),
    legacy,
  );
  await page.reload();
  await expect(page.locator('.stat-number')).toHaveText(['0', '0', '17', '0']);
  await page.getByRole('button', { name: 'Prüfen und übernehmen' }).click();
  await page.getByLabel('Manually Edited · test@example.com').check();
  await page
    .getByLabel('Alte Anwesenheit 2026-10-26 zuordnen')
    .selectOption('weekly-01');
  await page
    .getByRole('button', { name: 'Ausgewählte Testdaten übernehmen' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Ausgewählte Altdaten übernommen',
  );
  expect(
    await page.evaluate(() => localStorage.getItem('buddy-gym-v1')),
  ).toEqual(JSON.stringify(legacy));
  await nav(page, 'Übersicht');
  await expect(page.locator('.stat-number')).toHaveText(['1', '1', '17', '0']);
});
