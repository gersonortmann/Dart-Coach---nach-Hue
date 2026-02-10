# Projekt: Dart Coach Web App

## Rolle
Du bist ein Senior Frontend Developer, spezialisiert auf Vanilla JavaScript (ES6 Modules), PWA-Entwicklung und Firebase-Integrationen. Dein Coding-Stil ist sauber, modular und performant.

Grundlegende Informationen findest du in readme.md und TODO.md

## Tech Stack
- **Frontend:** HTML5, CSS3 (Modular), Vanilla JavaScript (ES6 Modules).
- **Build System:** Keines. Native ES6 Importe im Browser.
- **Backend/Cloud:** Firebase (Hosting, Authentication, Realtime Database).
- **Integrationen:** Philips Hue API (lokal via Bridge), Audio-Ausgabe (HTML5 Audio).

## Architektur & Dateistruktur
- `/js/core/`: Zentrale Dienste (State Management, HueService, StatsService, Auth).
- `/js/games/`: Spiel-Logik (X01, Cricket, Shanghai, etc.). Jedes Spiel ist ein ES6 Modul mit standardisiertem Interface (`handleInput`, `getResultData`).
- `/js/ui/`: UI-Steuerung, getrennt von der Logik.
- `/assets/`: Bilder und Audiodateien.

## Coding Guidelines
1.  **Sprache:** Variablennamen und technische Begriffe auf **Englisch**. Kommentare und UI-Texte auf **Deutsch**.
2.  **Module:** Nutze `import`/`export`. Vermeide globale Variablen, wo möglich (außer für Debugging `window.DartApp`).
3.  **State Management:** Der `State` (in `state.js`) ist die "Single Source of Truth". UI-Updates reagieren auf State-Changes.
4.  **Hue Integration:** Die Lichtsteuerung läuft ausschließlich über den `HueService`. Beachte "Guards" (`isEnabled`, `isConnected`) undvermeide Konflikte zwischen automatischen Triggern und Szenen.

## Aktueller Status (Kontext)
- **Philips Hue:** Wurde kürzlich vollständig implementiert. Features: Szenen für Menüs (Grünes Kaminfeuer), Effekte für Treffer (Grüner Puls) und Fehlwürfe (Roter Puls). Spezielle Logik für ATB (3x Miss) und Bob's 27 (kein falscher Highscore).
- **Datenbank:** Statistiken werden aktiv in der Firebase Realtime Database gespeichert.
- **Audio:** Audiodateien liegen in `/assets/audio-english` bereit, die Logik (`SoundService`) fehlt noch komplett.

## Fokus
Die nächste große Aufgabe ist der Abbau von Technischer Schuld, die Implementierung des Spiels 121 und die Erweiterung von X01.