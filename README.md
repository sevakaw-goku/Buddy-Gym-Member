# BUDDY GYM Trainer-App

React 19, TypeScript und Vite. Trainingsplan, zentrale Teilnehmer, einheitenspezifische Anwesenheit, Trainer, Vorfälle und Statistiken im bestehenden grünen Design.

## Start und Prüfungen

Node.js 22.12+ oder 24 LTS und npm, für Firebase-Emulatoren zusätzlich Java 21.

```sh
npm ci
npm run dev
npm run build
npm test
npm run test:ui
npm run test:rules
```

Die Browsertests nutzen standardmässig `/usr/bin/chromium`. Alternativ `CHROMIUM_PATH` auf einen installierten Chromium-Browser setzen. Die Emulator-Prüfung verwendet das lokale Projekt `demo-buddy-gym`, niemals ein echtes Firebase-Projekt. Der erste Start lädt den Firestore-Emulator herunter.

Ohne Firebase-Konfiguration: isolierter **lokaler Testmodus**, Schlüssel `buddy-gym-v2-test`. Keine gemeinsamen Daten und kein produktiver Zugriffsschutz. Bei unvollständiger Firebase-Konfiguration wird der Zugriff gesperrt, statt unbemerkt lokal zu speichern. Kein Emulator-Modus im Produktionsbuild.

## Funktionen und Datenmodell

- 17 initiale wiederkehrende Einheiten, einschliesslich beider separater Dienstagstrainings um 18:15. Jede Einheit hat eine stabile ID.
- Trainingsart, Wochentag, Zeiten und mehrere Trainer bearbeiten; Einheiten ergänzen, deaktivieren oder löschen. Ein Initialisierungsmarker verhindert die spätere Wiederherstellung gelöschter Einheiten.
- Teilnehmer zentral ohne feste Gruppen. Anwesenheit über Suche, Einzel- und Mehrfachauswahl, ausdrücklich speichern.
- Eine Anwesenheit ist ein Dokument mit der ID `<trainingId>_<YYYY-MM-DD>`. Auch eine gespeicherte leere Liste ist eine gültige Erfassung. Wiederkehrende Einheiten erscheinen automatisch am passenden Wochentag; noch nicht erfasste vergangene Termine lassen sich über das Datum öffnen.
- Verlauf und Korrekturen bleiben bei umbenannten, deaktivierten oder gelöschten Trainings erhalten. Einheitenname und Uhrzeit werden als unveränderlicher historischer Stand gespeichert.
- Revisionsnummern und Firestore-Transaktionen verhindern das stille Überschreiben gleichzeitiger Änderungen an derselben Erfassung oder demselben Stammdatensatz. Bei Konflikten den neuesten Stand laden und die eigene Auswahl erneut übernehmen. Änderungen an verschiedenen Dokumenten überschreiben sich nicht.
- Trainerprofile mit Rolle, Aktivstatus und optionaler Firebase-UID. Profile ohne UID gewähren keinen Login-Zugriff. Trainer können Teilnehmer, Anwesenheiten und Vorfälle bearbeiten. Nur Administratoren verwalten Trainings, Trainer und Kontofreigaben.
- Keine Beispielteilnehmer, -anwesenheiten oder -vorfälle. Statistiken basieren ausschliesslich auf erfassten Daten.

### Bestehende Browserdaten

`buddy-gym-v1` wird **nie automatisch verändert, gelöscht oder hochgeladen**. Ein Hinweis führt zu «Alte Browserdaten». Dort kann das unveränderte Original heruntergeladen werden. Selbst erfasste Testteilnehmer und Testvorfälle werden einzeln ausgewählt; alte Anwesenheiten müssen ausdrücklich einer Einheit am jeweiligen Wochentag zugewiesen werden. Bereits bestehende Erfassungen werden nicht überschrieben. Stabile Übernahme-IDs verhindern Duplikate beim Wiederholen nach einem Teilfehler. Bestehende feste Gruppen werden nicht übernommen.

Alte Beispielwerte können manuell bearbeitet worden sein. Deshalb werden sie nicht anhand von Namen oder IDs automatisch gelöscht. Der neue Datenbestand startet leer, während die Altdaten zur Prüfung erhalten bleiben. Vor einer Übernahme in ein echtes Produktivsystem braucht es einen gesonderten geprüften Migrationsschritt; die aktuelle App ist für Testdaten vorgesehen.

## Firebase einrichten – ausschliesslich Spark, zunächst Testdaten

Es wurden durch diese Änderung **keine Firebase-Ressourcen und kein kostenpflichtiger Dienst aktiviert**. E-Mail/Passwort-Anmeldung und Cloud Firestore funktionieren innerhalb der kostenlosen Spark-Kontingente. Spark hat Nutzungslimits, keine unbegrenzte Nutzung; bei Überschreitung können Zugriffe ausfallen. Keine Cloud Functions, keine SMS-Anmeldung, kein Cloud Storage und keine kostenpflichtigen APIs erforderlich. Firebase Analytics wird nicht eingebunden.

1. In der Firebase Console ein eigenes **Testprojekt im Spark-Tarif** anlegen. Keine Abrechnungsverknüpfung, kein Upgrade auf Blaze.
2. Eine Web-App registrieren. Unter Authentication nur **E-Mail/Passwort** aktivieren; öffentliche Selbstregistrierung ist in der App nicht vorhanden und allein kein Zugriff. Accounts werden administrativ in der Console angelegt.
3. Cloud Firestore im Produktionsmodus anlegen; eine passende europäische Region wählen. Die Testmodus-Regeln `allow read, write: if true` dürfen nie verwendet werden.
4. `firestore.rules` in der Console veröffentlichen, **bevor** die App mit dem Projekt verbunden wird. Alternativ mit einer lokal angemeldeten Firebase CLI: `npx firebase deploy --only firestore:rules --project DEINE_TESTPROJEKT_ID`. Vorher `npm run test:rules` ausführen. Keine Datenbank oder Hosting-Deployments erforderlich.
5. Die vier öffentlichen Web-Konfigurationswerte aus `.env.example` lokal in `.env.local` oder in Vercel hinterlegen. Diese Werte sind keine Zugriffsberechtigung. Niemals Service-Account-Schlüssel, private Schlüssel oder Admin-SDK-Zugangsdaten als `VITE_*` speichern.
6. Unter Authentication → Settings → Authorized domains die verwendete Vercel-Domain und für lokale Tests gegebenenfalls `localhost` ergänzen. Nur benötigte Domains freigeben.
7. Ein erstes Testkonto administrativ unter Authentication anlegen. E-Mail-Bestätigung durchführen. Die App bietet bei unbestätigten Konten einen Bestätigungslink an. Danach abmelden und erneut anmelden.
8. Für den ersten Administrator in der **Firestore Console** folgende beiden Dokumente anlegen (die App erlaubt keine Selbstfreigabe):

   `trainers/bootstrap-admin`:
   ```json
   {"id":"bootstrap-admin","name":"Test Admin","email":"DEINE_TEST_EMAIL","uid":"AUTHENTICATION_UID","active":true,"role":"admin","revision":1}
   ```

   `users/AUTHENTICATION_UID`:
   ```json
   {"trainerId":"bootstrap-admin","active":true,"role":"admin"}
   ```

9. Mit dem Test-Admin anmelden. Die 17 Einheiten werden einmalig per Transaktion angelegt. Teilnehmer, Anwesenheiten und Vorfälle bleiben leer.
10. Weitere Testkonten unter Authentication anlegen, deren E-Mail bestätigen und unter «Trainer» die genaue UID verknüpfen. Mehrere Trainer können derselben Einheit zugeordnet werden. Ein Administrator kann andere Trainer deaktivieren; das dazugehörige Kontorecht wird atomar entzogen. Eigene Rechte lassen sich in der App nicht ändern. Für die Deaktivierung eines Administrators einen zweiten aktiven Administrator verwenden. Umverknüpfungen von UIDs entziehen dem alten Konto das Recht.

### Zugriffsregeln und Speicherung

Alle Datenkollektionen sind für anonyme, unbestätigte, nicht freigegebene und deaktivierte Konten gesperrt. Freigaben stehen unter `users/<auth.uid>`, Trainerprofile unter `trainers/<id>`. UID-Freigabe und Trainerprofil müssen im selben atomaren Schreibvorgang zusammenpassen. Nur Administratoren dürfen Rechte anderer Konten ändern. Nicht aufgeführte Pfade sind gesperrt. Die Regeln validieren erlaubte Felder, Revisionsnummern und die Identität von Anwesenheiten.

Cloud-Daten werden über dokumentweise Echtzeit-Abonnements synchronisiert. Es gibt keinen automatischen Upload lokaler Browserdaten. Firebase-Sitzungen und Firestore-Caches bleiben im Arbeitsspeicher; es wird keine persistente Offline-Kopie der gemeinsamen Personendaten eingerichtet. Nach Neuladen ist eine erneute Anmeldung erforderlich. Speichern braucht eine funktionierende Verbindung; Fehler und Konflikte werden angezeigt. Eine Deaktivierung beendet den Datenzugriff und leert den angezeigten Datenbestand. Bereits vor Entzug gelesene oder bewusst exportierte Daten können technisch nicht zurückgerufen werden.

## Vercel – bestehendes Projekt weiterverwenden

Nach Review und Merge dieses Feature-Branches in `main` kann das bestehende Vercel-Projekt wie bisher bauen:

| Einstellung | Wert |
|---|---|
| Framework | Vite |
| Build | `npm run build` |
| Ausgabe | `dist` |
| Node | 22.12+ oder 24 LTS |

Für einen Firebase-Testbetrieb die vier `VITE_FIREBASE_*`-Variablen im **bestehenden** Vercel-Projekt für die gewünschte Umgebung eintragen und einen neuen Build auslösen. Variablen werden beim Build eingebunden. Kein neues Vercel-Projekt nötig. Für Preview-Deployments ein separates Firebase-Testprojekt verwenden und die Preview-Domain freigeben. Ohne Variablen bleibt es ein lokaler Testmodus im jeweiligen Browser.

### Vor einer Freigabe für echte Daten

Die App zeigt absichtlich durchgehend «Nur Testdaten». Dieser Entwicklungsstand ist keine Freigabe für echte Teilnehmerdaten. In einem separaten Einrichtungsschritt müssen Anmeldung, E-Mail-Bestätigung, Rollen, Deaktivierung und Synchronisierung mit mindestens zwei Konten auf dem tatsächlichen Firebase-/Vercel-Testprojekt geprüft werden. Anonyme und gesperrte Konten dürfen über das SDK keine Daten lesen. Sicherheitsregeln müssen im richtigen Projekt veröffentlicht sein. Zugriffstests und Build müssen erfolgreich sein. Erst nach dieser Prüfung einen ausdrücklich autorisierten Produktivumstieg planen.
