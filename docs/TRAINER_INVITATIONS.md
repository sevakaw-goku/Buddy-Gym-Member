# Trainer per E-Mail einladen – Einrichtung und Test

Die Erweiterung baut auf `feature/training-trainers-firebase` auf. Keine Änderungen wurden nach `main` übernommen, kein produktives Vercel-Deployment und keine Firebase-/E-Mail-Ressourcen wurden durch die Implementierung aktiviert. Alle Einladungs- und Kontotests verwenden ausschliesslich Testdaten.

## Lösung und mögliche Kosten – vor Aktivierung lesen

- **Vercel Node Function** `/api/invitations` führt privilegierte Aktionen aus. Keine Firebase Cloud Functions, keine Firebase-Erweiterung «Trigger Email», kein Blaze-Upgrade und keine kostenpflichtige Google-API nötig.
- **Firebase Spark** bleibt nutzbar: E-Mail/Passwort-Authentication, Firebase-Bestätigungs-E-Mails und Firestore innerhalb der jeweiligen kostenlosen Kontingente. Admin SDK bedeutet serverseitige Berechtigungen, nicht automatisch einen kostenpflichtigen Tarif. Firestore-Zugriffe für Einladungen und Ratenbegrenzung zählen zu den Kontingenten.
- **Resend** ist als Versandadapter vorbereitet. Resend bietet einen Free-Tarif mit begrenztem Kontingent; aktuelle Mengen, Tageslimits und Preise vor Aktivierung unter <https://resend.com/pricing> prüfen. Es wurde kein Resend-Konto erstellt und kein Tarif gebucht. Die Implementierung aktiviert kein Upgrade und kauft keine Kapazität; ausserhalb der Limits können E-Mails fehlschlagen.
- Eine eigene **bestätigte Absenderdomain** mit DNS-Zugriff ist für normale Empfänger erforderlich. Eine vorhandene Domain kann verwendet werden. Eine neue Domain kann Registrierungsgebühren verursachen. Die Vercel-Subdomain `*.vercel.app` gehört dir nicht als Absenderdomain. Resends Testabsender ist auf die für das Resend-Konto erlaubten Testempfänger beschränkt; er eignet sich nicht zum Einladen beliebiger Trainer.
- Das bestehende **Vercel-Konto** muss Functions und die beabsichtigte Nutzung abdecken. Hobby hat Tarif- und Nutzungsbeschränkungen, insbesondere hinsichtlich kommerzieller Nutzung. Vor Aktivierung den vorhandenen Tarif unter <https://vercel.com/pricing> prüfen. Diese Änderung bucht keinen Vercel-Tarif.
- Namen und E-Mail-Adressen der Eingeladenen sowie der persönliche Link werden an den Versanddienst übergeben. Vor echter Nutzung dessen Vertrags-/Datenschutzbedingungen und passende Vereinbarungen prüfen. Weitere Anbieter lassen sich später über den kleinen `Mailer`-Adapter anbinden; aktuell ist nur Resend implementiert.

**Zunächst nur Preview-Umgebung und Testkonten.** Der Mailversand ist ohne das ausdrückliche Server-Flag `INVITATIONS_ENABLED=true` gesperrt. Auch bei gesetztem Flag werden E-Mails nur durch eine ausdrückliche Aktion eines bestätigten aktiven Administrators gesendet.

## Was passiert bei einer Einladung?

1. Der angemeldete Administrator gibt Name, E-Mail und Rolle ein. Der Server verifiziert den Firebase-ID-Token einschliesslich Sperrung/Widerruf und prüft die aktuelle Freigabe unter `users/<uid>` innerhalb jeder Schreibtransaktion.
2. Ein Trainerprofil wird als **Eingeladen** angelegt (`active:false`, `uid:''`), bestehende zugewiesene Profile können über «Einladen» ihre vorhandene ID behalten. Es wird noch kein Login-Zugriff erteilt und kein Auth-Konto serverseitig verändert.
3. Ein 256-Bit-Zufallstoken wird per persönlichem Link versendet. Nur dessen SHA-256-Hash liegt in einer ausschliesslich serverseitig zugänglichen Sammlung. Der Token befindet sich im URL-Fragment, nicht im Pfad oder Querystring. Browser und API verwenden `no-referrer` beziehungsweise `no-store`. Kein Analytics-/Tracking-Skript wird ergänzt.
4. Die eingeladene Person öffnet den Link. **Neues Konto:** eigenes Passwort (mindestens zwölf Zeichen und die zusätzliche Firebase-Passwortrichtlinie) festlegen; Firebase sendet eine separate Bestätigungs-E-Mail. **Bestehendes Konto:** mit dem bisherigen Passwort anmelden; die Einladung ersetzt dieses Passwort nicht. Passwort-Reset erfolgt nur nach einer ausdrücklichen Aktion der Person über Firebase.
5. Nach dem Bestätigungslink im Postfach «Bestätigung prüfen» anklicken. Das aktualisiert den Benutzerstatus und den ID-Token. Danach «Einladung annehmen» wählen. Bei Bedarf führt der Continue-Link aus der Bestätigungs-E-Mail zurück zur Einladung. Falls die Sitzung neu gestartet wurde, «Bestehendes Konto» wählen und mit dem gerade festgelegten Passwort anmelden.
6. Der Server prüft die bestätigte E-Mail erneut, vergleicht sie mit der eingeladenen Adresse, prüft Ablauf/Widerruf und den noch aktiven Administrator hinter der Einladung. Eine Transaktion aktiviert das Trainerprofil, erstellt die Kontofreigabe und verbraucht den Token. Auch gleichzeitige Annahmeversuche können nur eine Freigabe erzeugen. Bestehende Freigaben werden nie überschrieben.
7. «Zur Trainer-App» öffnet die App in derselben Sitzung. Die normale Anmeldung funktioniert anschliessend mit E-Mail und eigenem Passwort. Firebase-Sitzungen bleiben wie bisher im Arbeitsspeicher; nach einem vollständigen Neuladen kann eine erneute Anmeldung erforderlich sein.

Links gelten **72 Stunden**. Ein blosser Aufruf oder E-Mail-Linkscanner verbraucht keinen Token. «Erneut senden» setzt die Frist neu und macht den vorherigen Link sofort ungültig. «Widerrufen» sperrt den Link sofort. Bei Versandfehler bleibt der sichtbare Status mit einem Fehlerhinweis bestehen; über «Erneut senden» lässt sich ein neuer Link verschicken. Ein bereits angelegtes, aber noch nicht freigegebenes Firebase-Konto bleibt bei Ablauf/Widerruf ohne Zugriff; es wird nicht gelöscht.

Bei bereits angemeldetem falschem Konto muss zuerst zu genau der eingeladenen E-Mail gewechselt werden. E-Mail-Adressen werden für den Vergleich getrimmt und kleingeschrieben; Gmail-Punkt- oder Plus-Aliase werden nicht gleichgesetzt.

## 1. Testprojekt und bestehenden Administrator beibehalten

Bevorzugt ein separates Firebase-Spark-Testprojekt und Vercel Preview verwenden. Wenn du das bereits eingerichtete Testprojekt verwendest, dessen bestehende Daten und Administrator-Dokumente unverändert lassen. Es gibt kein Reset- oder Migrationsskript.

Die bestehenden Dokumente `users/<deine UID>` und `trainers/<deine Trainer-ID>` bleiben gültig. Es sind keine neuen Custom Claims nötig. Der erste Administrator wird weiterhin einmalig durch einen berechtigten Projektadministrator in der Firebase Console eingerichtet; die App bietet keine öffentliche Selbstfreigabe.

## 2. Serverseitigen Firebase-Zugang für Vercel vorbereiten

Vercel benötigt einen vertrauenswürdigen serverseitigen Zugang, da die Web-Konfiguration allein keine Administratoraktionen erlaubt.

1. Im Google-Cloud-Projekt deines Firebase-Testprojekts unter **IAM & Verwaltung → Dienstkonten** ein eigenes Dienstkonto für die Einladung anlegen. Nicht pauschal «Owner» oder «Editor» vergeben.
2. Für diese Implementierung benötigt das Konto Firestore-Lese-/Schreibzugriff, z.B. **Cloud Datastore User** (`roles/datastore.user`), und lesenden Firebase-Authentication-Zugriff, z.B. **Firebase Authentication Viewer** (`roles/firebaseauth.viewer`). Der Server erstellt oder verändert keine Authentication-Benutzer und benötigt dafür keine Schreibrolle.
3. Falls dein Projekt langlebige Dienstkontoschlüssel erlaubt, unter **Schlüssel → Schlüssel hinzufügen → Neuen Schlüssel erstellen → JSON** einen Schlüssel erzeugen. Die JSON-Datei enthält private Zugangsdaten: nicht hochladen, nicht einchecken, nicht im Chat teilen. In Organisationen mit gesperrten Schlüsseln die Vorgabe nicht umgehen; dann ist eine gesonderte Einrichtung einer unterstützten Workload Identity erforderlich.
4. Aus der Datei nur die nachstehend genannten Werte als serverseitige Vercel-Variablen übernehmen. Lokale Kopie geschützt aufbewahren oder nach deiner Schlüsselrichtlinie entfernen. Nicht benötigte Schlüssel widerrufen/rotieren.

Admin-SDK-Zugriffe umgehen Firestore-Clientregeln. Deshalb sind die Prüfungen im Server und die Geheimhaltung dieser Variablen zwingend. Kein Geheimnis darf mit `VITE_` beginnen.

## 3. E-Mail-Dienst vorbereiten – erst nach Zustimmung zu Voraussetzungen und Kosten

1. Ein passendes Resend-Konto im gewünschten Tarif erstellen; aktuelle Free-Grenzen prüfen. Kein automatisches kostenpflichtiges Upgrade konfigurieren.
2. Eine eigene Absenderdomain unter **Domains** hinzufügen und die von Resend angezeigten DNS-Einträge beim Domainanbieter eintragen. Erst nach erfolgreicher Bestätigung weitergehen. Bestehende DNS-Einträge nicht ungeprüft ersetzen.
3. Einen API-Schlüssel mit möglichst eingeschränkter Versandberechtigung für diese Domain erstellen.
4. Eine gültige Absenderadresse festlegen, beispielsweise `BUDDY GYM <einladung@deine-domain.ch>`.

## 4. Variablen im bestehenden Vercel-Projekt setzen

Unter **Project → Settings → Environment Variables** zunächst ausschliesslich für **Preview**, möglichst auf diesen Feature-Branch beschränkt:

| Variable | Inhalt |
|---|---|
| `VITE_FIREBASE_API_KEY` | Öffentlicher Web-App-Wert des Testprojekts, wie bisher |
| `VITE_FIREBASE_AUTH_DOMAIN` | Web-App-Auth-Domain des Testprojekts |
| `VITE_FIREBASE_PROJECT_ID` | Projekt-ID des Testprojekts |
| `VITE_FIREBASE_APP_ID` | Web-App-ID des Testprojekts |
| `FIREBASE_ADMIN_PROJECT_ID` | Derselbe Projekt-ID-Wert |
| `FIREBASE_ADMIN_CLIENT_EMAIL` | `client_email` aus dem Dienstkontoschlüssel |
| `FIREBASE_ADMIN_PRIVATE_KEY` | Vollständiger `private_key`, inkl. BEGIN/END; echte Zeilenumbrüche oder literale `\n` werden unterstützt |
| `APP_ORIGIN` | Exakte HTTPS-Adresse der Testversion, **ohne abschliessenden Schrägstrich**, Pfad oder Query |
| `RESEND_API_KEY` | Geheimer Resend-Versandschlüssel |
| `INVITATION_FROM` | Bestätigte Absenderadresse, optional mit Anzeigename |
| `INVITATIONS_ENABLED` | Erst nach Freigabe des Versands auf `true` setzen |

Für `APP_ORIGIN` eine stabile Branch-Preview-Adresse oder einen eigenen Test-Alias verwenden. Ein Link aus der Einladung und die geöffnete App müssen dieselbe Adresse verwenden. Willkürliche Request-Host-Header und Redirect-Ziele werden nicht übernommen. Die Funktion erlaubt keine fremden Origins und kein CORS mit `*`.

Keine Emulator-Variablen in Vercel setzen. Die echte Serverfunktion verweigert Emulator-Konfigurationen. Der Browser-Emulatormodus ist zusätzlich auf Vite-Entwicklung und die Projekt-ID `demo-buddy-gym` begrenzt und im Produktionsbuild inaktiv.

## 5. Firebase-Anmeldung und Regeln im Testprojekt

1. **Authentication → Sign-in method:** E-Mail/Passwort aktiviert lassen. Bestehende Konten nicht löschen oder neu anlegen.
2. **Authentication → Settings → Authorized domains:** die Testdomain aus `APP_ORIGIN` ergänzen. Unter Templates die Bestätigungs-E-Mail und ihre Absenderdarstellung prüfen. Firebase bestätigt die E-Mail; der Server vertraut nicht auf ein vom Browser übermitteltes `emailVerified`-Feld.
3. Die neue `firestore.rules` aus diesem Branch in **Firestore → Regeln** veröffentlichen. Alternativ lokal mit korrekt ausgewähltem Testprojekt: `npx firebase deploy --only firestore:rules --project DEINE_TESTPROJEKT_ID`.
4. Keine offenen Testmodus-Regeln verwenden. Keine Sammlungen löschen. Die neuen serverinternen Sammlungen werden bei Bedarf angelegt.
5. Danach die Vercel-Testversion aus diesem Branch neu bauen. Build: `npm run build`, Ausgabe: `dist`; Vercel erkennt die Node Function unter `api/` automatisch. Ein reines `dist`-Hosting ohne diese Function kann keine Einladungen senden. `npm run dev` allein bietet den echten API-Endpunkt nicht an; für echte lokale Entwicklung Vercel Dev mit Testprojekt und geschützten Servervariablen verwenden.

**Kompatibilität:** Ab diesem Stand dürfen auch Administratoren Kontofreigaben und Trainerprofile nicht mehr direkt über das Browser-SDK schreiben. Alte Testversionen mit der früheren UID-Verwaltung können daher nach Veröffentlichung der neuen Regeln diese Verwaltung nicht mehr ausführen. Erst Server und neue Testversion bereitstellen und gemeinsam prüfen; die neuen Regeln nicht isoliert in einem produktiv verwendeten Projekt veröffentlichen.

## Datenmodell und Berechtigungen

- Bestehende `users/<uid>`: unverändert `trainerId`, `role`, `active`; nur der Server verwaltet diese Freigaben.
- Bestehende `trainers/<id>`: alle bisherigen Felder und IDs bleiben erhalten. Neue Einladungen ergänzen optional `invitationId` und `invitationState` (`invited`, `accepted`, `revoked`). Alte Administratoren brauchen diese Felder nicht. E-Mail/UID verknüpfter Konten können über die Verwaltung nicht umgeschrieben werden.
- `invitations/<id>`: E-Mail, Name, Rolle, Trainer-ID, Frist, Status, Einladender und Versandstatus; nur Administratoren können diese Metadaten lesen, kein Browser kann sie schreiben.
- `invitationTokens/<id>`: nur Token-Hash; keinerlei Browserzugriff, auch nicht für Administratoren.
- `trainerEmails/<hash>`: serverseitige Zuordnung gegen gleichzeitige doppelte Einladungen.
- `invitationLimits/<adminUid>`: höchstens zehn Versand-/Neusendeaktionen pro zehn Minuten pro Administrator. Kein Klartext-IP-Tracking. Das ersetzt keine plattformseitige DDoS-Abwehr; öffentliche Endpunkte und Firebase Spark haben weiterhin Kontingente.

Administratoren behalten die bisherigen Verwaltungsfunktionen, Rollenverwaltung und De-/Reaktivierung. Eigene Rechte können sie nicht entziehen. Trainer dürfen zentrale Teilnehmer und Vorfälle bearbeiten und **ihnen zugewiesene** Trainingszeiten/-arten/-Aktivstatus sowie Anwesenheiten verwalten. Sie dürfen keine Einheiten neu erstellen, löschen, Trainerzuordnungen verändern oder Kontorechte vergeben. Die Zuweisungsprüfung erfolgt in Firestore-Regeln, nicht nur in der Oberfläche. Autorisierte Trainer können wie bisher die gemeinsamen Daten lesen; das ist keine Abschottung der Teilnehmerlisten zwischen Trainern. Historische Anwesenheiten gelöschter oder inzwischen nicht mehr zugewiesener Einheiten bleiben lesbar und können nur von Administratoren korrigiert werden.

17 Ausgangseinheiten, Teilnehmer, Anwesenheiten, Vorfälle, Statistiken und Trainingszuordnungen werden nicht zurückgesetzt. Eine Einladung für ein bereits vorhandenes unverknüpftes Trainerprofil muss aus dessen Zeile über «Einladen» erfolgen und behält dessen Trainer-ID. Eine bestehende Kontofreigabe wird auch bei abweichender gewählter Rolle nicht überschrieben.

## 6. Testablauf vor jeder Produktivfreigabe

1. Bestehenden Administrator anmelden; vorhandene Daten und Trainingszuordnungen prüfen.
2. Unter **Trainer → Trainer einladen** ein neues Testkonto einladen. Status muss «Eingeladen» sein.
3. Link in separatem Browser/privatem Fenster öffnen, Passwort erstellen, Firebase-Bestätigungs-E-Mail öffnen, Bestätigung prüfen und Einladung annehmen. Danach «Aktiv» und normale Anmeldung prüfen.
4. Mit noch unbestätigtem, falschem, nicht eingeladenem und deaktiviertem Konto versuchen: kein Datenzugriff bzw. keine Annahme.
5. Als Trainer: nur zugewiesene Einheit bearbeiten und Anwesenheit erfassen; keine Zuweisungen, anderen Einheiten oder Kontorechte ändern.
6. Erneutes Senden: alter Link muss sofort abgewiesen werden. Widerruf: auch der neueste Link muss abgewiesen werden. Nach 72 Stunden darf keine Annahme mehr möglich sein.
7. Ein bereits existierendes Test-Auth-Konto einladen: mit ursprünglichem Passwort anmelden; Passwort und bestehende Daten dürfen nicht ersetzt werden. Bestehende Kontofreigaben dürfen keine Einladung erhalten.
8. Trainer deaktivieren, vorhandene offene Sitzung prüfen, wieder aktivieren und Rollenwechsel prüfen. Bestehenden Administrator nicht deaktivieren.
9. Versandfehler/fehlende Provider-Konfiguration prüfen: keine Erfolgsmeldung behaupten, erneutes Senden anbieten. App bleibt bei Serverausfall geschlossen für neue Freigaben.
10. Erst danach einen getrennten, ausdrücklich autorisierten Produktivumstieg planen. Dieser Pull Request veröffentlicht nichts direkt produktiv.

Automatisierte Tests: `npm test`, `npm run test:ui`, `npm run test:rules`, `npm run test:server`, `npm run test:integration`, `npm run build`. Backend-/Integrationstests benötigen Java und die lokalen Auth-/Firestore-Emulatoren. Der Test-Mailer sammelt Nachrichten ausschliesslich im lokalen Testprozess; es werden keine echten E-Mails gesendet. Die Integration prüft den tatsächlichen Firebase-Bestätigungs-OOB-Code gegen den Auth-Emulator und anschliessend Anmeldung, Annahme und Rollenoberfläche. Ein echter Zustelltest mit Resend/DNS bleibt nach autorisierter Einrichtung erforderlich.
