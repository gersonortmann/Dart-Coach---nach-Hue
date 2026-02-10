# 📂 Erweiterte Dateistruktur & Assets

Dieser Abschnitt detailliert die physische Ablagestruktur des Projekts, einschließlich der neu hinzugefügten Audio-Assets und Konfigurationsdateien.

## 1. Wurzelverzeichnis & Konfiguration

Zusätzlich zu den Standard-Webdateien enthält das Root-Verzeichnis spezifische Konfigurationen für Firebase und PWA.

* **`.firebaserc`**: Verknüpfung zum Firebase-Projekt (Default-Alias).
* **`firebase.json`**: Konfiguration für Firebase Hosting (Rewrites, Header, Ignorierte Dateien).
* **`google-key.json`**: (Achtung: Sensibel!) Authentifizierungsschlüssel für Google Services (falls lokal benötigt).
* **`manifest.json`**: PWA-Manifest für die Installation als App (Definiert Icons, Start-URL, Display-Modus).
* **`package.json` / `package-lock.json**`: NPM-Abhängigkeiten und Skripte (hauptsächlich für Entwicklungstools, da Core Vanilla JS ist).
* **`sw.js`**: Service Worker für Offline-Caching und PWA-Funktionalität.

## 2. Assets (`/assets`)

Ressourcen für UI und Audio-Feedback.

### 🖼 Icons

* **`icon-192.png`**: App-Icon für Homescreen (klein/Standard).
* **`icon-512.png`**: App-Icon für Splash-Screen und Stores (groß).

### 🔊 Audio (`/assets/audio-english` & `/assets/audio-ssml`)

Das Projekt enthält umfangreiche Audio-Bibliotheken für den "Audio Caller" (Sprachausgabe der Scores).

* **Struktur**:
* **Zahlen (0-180)**: Einzelne MP3-Dateien für jeden möglichen Score (z.B. `180.mp3`, `26.mp3`, `100.mp3`). Abgedeckt sind alle Werte von `0.mp3` bis `180.mp3`.
* **Spezial-Effekte**:
* `bull.mp3` / `singlebull.mp3` / `doublebull.mp3`
* `bullseye.mp3`
* `bust.mp3` (Überworfen)
* `miss.mp3` (Fehlwurf/Null Punkte)


* **Spiel-Ansagen**:
* `gameon.mp3` (Spielstart)
* `gameshot.mp3` / `finished.mp3` (Leg/Set gewonnen)
* `winner.mp3` / `thewinneris.mp3` (Match gewonnen)
* `next.mp3` (Nächster Spieler)
* `check.mp3` (Checkout möglich/erfolgt)
* `bust.mp3` (Überworfen)


* **Motivation/Atmosphäre**:
* `yes.mp3`, `ohno.mp3`, `rocknroll.mp3`


* **Personalisierung**:
* `gerson.mp3`, `stefanie.mp3` (Spielernamen)




* **Formate**:
* `/audio-english`: Standard-Ansagen (menschlich/natürlich).
* `/audio-ssml`: (Potenziell) Synthetische oder alternative Sprachdateien (Struktur spiegelt weitgehend `audio-english` wider).



## 3. Quellcode (`/js`)

Die Anwendungslogik ist modular in Unterordner gegliedert.

### 🧠 Core (`/js/core`)

Zentrale Dienste und State-Management.

* **`autodarts-service.js`**: API-Client für Autodarts-Integration.
* **`hue-service.js`**: Steuerung von Philips Hue Lichtern (Verbindung, Szenen, Effekte).
* **`stats-service.js`**: Berechnung und Aggregation von Spielstatistiken.
* **`state.js`**: Zentraler State-Store (Single Source of Truth).
* **`store.js`**: LocalStorage-Wrapper für Persistenz.
* **`constants.js`**: Globale Konfigurationswerte.

### 🎮 Games (`/js/games`)

Implementierung der Spielregeln (Strategy Pattern).

* **`game-engine.js`**: Haupt-Controller für den Spielablauf.
* **`x01.js`**: Standard 301/501 Logik.
* **`cricket.js`**: Cricket-Logik.
* **`around-the-board.js`**: ATB-Logik (1-20).
* **`bobs27.js`**: Bob's 27 Training.
* **`shanghai.js`**: Shanghai Spielmodus.
* **`single-training.js`**: Highscore-Training.

### 🖥 UI (`/js/ui`)

View-Layer und DOM-Interaktion.

* **`ui-core.js`**: Basis-Routing und Screen-Management.
* **`ui-auth.js`**: Login/Logout Masken und Firebase Auth UI.
* **`ui-setup.js`**: Match-Erstellung und Spielauswahl.
* **`ui-game.js`**: Aktives Spielfeld (Scoreboard, Darts).
* **`ui-keyboard.js`**: Virtuelle Eingabemasken.
* **`ui-overlay.js`**: Popups (Sieg, 180, Miss).
* **`ui-result.js`**: Match-Zusammenfassung.
* **`ui-stats.js`**: Statistik-Dashboards.
* **`ui-stats-board.js`**: Visualisierung (Heatmaps/Boards).
* **`ui-mgmt.js`**: (Vermutlich) Management-UI für Profile oder Einstellungen.

## 4. Stylesheets (`/css`)

Modulares CSS für verschiedene Aspekte der App.

* **`base.css`**: Reset und Variablen.
* **`layouts.css`**: Grid-Systeme und Struktur.
* **`components.css`**: Buttons, Cards, Inputs.
* **`game.css`**: Spezifische Styles für die Spielansicht.
* **`overlays.css`**: Animationen und Modals.

---