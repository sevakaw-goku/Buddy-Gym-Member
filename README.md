# BUDDY GYM Trainer-App

Mobiloptimierte React-, TypeScript- und Vite-Web-App für Trainerinnen und Trainer.

## Entwicklung

Voraussetzung: Node.js 22.12+ oder 24 LTS und npm.

```sh
npm install
npm run dev
```

```sh
npm run build
npm run preview
```

`npm run build` führt die TypeScript-Prüfung aus und erstellt den Produktionsbuild in `dist/`.
Nach der ersten Installation verwendet `npm ci` die mitgelieferte Lockdatei reproduzierbar.

## Funktionen

- Übersicht mit Teamkennzahlen und Schnellzugriffen
- Teilnehmer hinzufügen, bearbeiten, suchen und nach Trainingsgruppe filtern
- Anwesenheit pro Datum erfassen und korrigieren
- Statistiken aus den tatsächlichen lokalen Anwesenheitsdaten
- Vorfälle dokumentieren, abschliessen und wieder öffnen
- Responsive Navigation für Mobilgeräte und Desktop

## Lokale Daten

Die App startet mit fiktiven Beispieldaten. Änderungen werden unter `buddy-gym-v1` im Local Storage des aktuellen Browsers gespeichert. Keine Firebase-Konfiguration, Anmeldung oder Backend-Verbindung erforderlich. Daten werden nicht zwischen Geräten synchronisiert; beim Löschen der Browserdaten gehen Änderungen verloren. Das Entfernen dieses Local-Storage-Schlüssels setzt die Demo zurück.

Die Demo ist kein System für produktive oder sensible Personendaten. Google Fonts ist optional; bei fehlendem Netzwerkzugriff werden Systemschriften verwendet.
