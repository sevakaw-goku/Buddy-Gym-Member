import { test, expect } from '@playwright/test';
test('admin invitation, new password, actual verification action, acceptance and login with scoped trainer rights', async ({
  browser,
  request,
}) => {
  test.setTimeout(90000);
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await admin.goto('/');
  await admin
    .getByLabel('E-Mail', { exact: true })
    .fill('browser-admin@example.com');
  await admin
    .getByLabel('Passwort', { exact: true })
    .fill('BrowserAdminTest!123');
  await admin.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await admin
    .getByRole('navigation')
    .getByRole('button', { name: 'Trainer', exact: true })
    .click();
  await admin
    .getByRole('button', { name: 'Trainer einladen', exact: true })
    .click();
  await admin.getByLabel('Name des Trainers').fill('Invited Browser Coach');
  await admin.getByLabel('E-Mail-Adresse').fill('invited-browser@example.com');
  await admin
    .getByRole('button', { name: 'Einladung senden', exact: true })
    .click();
  await expect(admin.getByRole('dialog')).toHaveCount(0);
  await expect(admin.getByText('Eingeladen', { exact: true })).toBeVisible();
  const inbox = await (await request.get('http://127.0.0.1:4175/inbox')).json();
  const link = inbox.at(-1).link;
  const coachContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const coach = await coachContext.newPage();
  await coach.goto(link);
  await expect(
    coach.getByText('invited-browser@example.com', { exact: true }),
  ).toBeVisible();
  await coach
    .getByLabel('Eigenes Passwort festlegen')
    .fill('NewTrainerPassword!123');
  await coach
    .getByRole('button', {
      name: 'Konto erstellen und E-Mail bestätigen',
      exact: true,
    })
    .click();
  await expect(
    coach.getByRole('button', { name: 'Bestätigung prüfen', exact: true }),
  ).toBeVisible();
  await expect(coach.getByRole('status')).toContainText(
    'Bestätigungs-E-Mail gesendet',
  );
  const codes = await (
    await request.get(
      'http://127.0.0.1:9099/emulator/v1/projects/demo-buddy-gym/oobCodes',
    )
  ).json();
  const code = codes.oobCodes.find(
    (c: { email: string; requestType: string }) =>
      c.email === 'invited-browser@example.com' &&
      c.requestType === 'VERIFY_EMAIL',
  );
  expect(code).toBeTruthy();
  const applied = await request.post(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:update?key=demo-key',
    { data: { oobCode: code.oobCode } },
  );
  expect(applied.ok()).toBeTruthy();
  await coach
    .getByRole('button', { name: 'Bestätigung prüfen', exact: true })
    .click();
  await coach
    .getByRole('button', { name: 'Einladung annehmen', exact: true })
    .click();
  await expect(
    coach.getByRole('heading', { name: 'Willkommen im Team.' }),
  ).toBeVisible();
  await coach
    .getByRole('button', { name: 'Zur Trainer-App', exact: true })
    .click();
  await expect(
    coach.getByRole('heading', { name: 'Alles im Blick.' }),
  ).toBeVisible();
  await coach.getByRole('button', { name: 'Menü öffnen' }).click();
  await coach
    .getByRole('navigation')
    .getByRole('button', { name: 'Trainer', exact: true })
    .click();
  await expect(
    coach.getByRole('button', { name: 'Trainer einladen', exact: true }),
  ).toHaveCount(0);
  await expect(
    coach.getByRole('button', { name: 'Bearbeiten', exact: true }),
  ).toHaveCount(0);
  await expect(admin.getByText('Aktiv', { exact: true })).toHaveCount(2);
  const reused = await request.post('/api/invitations', {
    headers: { Origin: 'http://127.0.0.1:4174' },
    data: {
      action: 'preview',
      token: new URL(link).hash.slice('#invite='.length),
    },
  });
  expect(reused.status()).toBe(410);
  const row = admin
    .locator('.trainer-row')
    .filter({ hasText: 'Invited Browser Coach' });
  await row.getByRole('button', { name: 'Deaktivieren', exact: true }).click();
  await expect(
    coach.getByText(
      /Dein Konto ist noch nicht freigegeben oder wurde deaktiviert/,
    ),
  ).toBeVisible();
  await row.getByRole('button', { name: 'Aktivieren', exact: true }).click();
  await expect(
    coach.getByRole('heading', { name: 'Alles im Blick.' }),
  ).toBeVisible();
  await row.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await admin
    .getByRole('dialog')
    .getByLabel('Rolle', { exact: true })
    .selectOption('admin');
  await admin
    .getByRole('dialog')
    .getByRole('button', { name: 'Speichern', exact: true })
    .click();
  await expect(admin.getByRole('dialog')).toHaveCount(0);
  await expect(coach.locator('.profile strong')).toHaveText('Administrator');
  await coach.getByRole('button', { name: 'Menü öffnen' }).click();
  await coach
    .getByRole('navigation')
    .getByRole('button', { name: 'Trainer', exact: true })
    .click();
  await expect(
    coach.getByRole('button', { name: 'Trainer einladen', exact: true }),
  ).toBeVisible();
  await admin
    .getByRole('button', { name: 'Trainer einladen', exact: true })
    .click();
  await admin.getByLabel('Name des Trainers').fill('Cancelled Browser Coach');
  await admin
    .getByLabel('E-Mail-Adresse')
    .fill('cancelled-browser@example.com');
  await admin
    .getByRole('button', { name: 'Einladung senden', exact: true })
    .click();
  await expect(admin.getByRole('dialog')).toHaveCount(0);
  const cancelled = admin
    .locator('.trainer-row')
    .filter({ hasText: 'Cancelled Browser Coach' });
  const before = await (
    await request.get('http://127.0.0.1:4175/inbox')
  ).json();
  await cancelled
    .getByRole('button', { name: 'Erneut senden', exact: true })
    .click();
  await expect(admin.getByRole('status')).toContainText(
    'Einladung erneut versendet',
  );
  const after = await (await request.get('http://127.0.0.1:4175/inbox')).json();
  expect(after.length).toBe(before.length + 1);
  const check = async (link: string) =>
    request.post('/api/invitations', {
      headers: { Origin: 'http://127.0.0.1:4174' },
      data: {
        action: 'preview',
        token: new URL(link).hash.slice('#invite='.length),
      },
    });
  expect((await check(before.at(-1).link)).status()).toBe(410);
  admin.once('dialog', (d) => d.accept());
  await cancelled
    .getByRole('button', { name: 'Widerrufen', exact: true })
    .click();
  await expect(
    cancelled.getByText('Deaktiviert', { exact: true }),
  ).toBeVisible();
  expect((await check(after.at(-1).link)).status()).toBe(410);
  await coachContext.close();
  await adminContext.close();
});
