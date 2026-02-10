# 🎯 Dart Coach - Roadmap & Backlog

## ✅ Abgeschlossen (Core & Features)
- [X] **X01 Spielmodus** (Logik, Checkout-Varianten, Sets/Legs)
- [X] **Weitere Spiele:** Cricket, Bob's 27, Shanghai, Single Training, Around the Board
- [X] **Eingabe:** "Delete Last Dart" (Undo), Numpad-Steuerung
- [X] **Cloud & Daten:**
    - [X] Firebase Hosting & Auth Integration
    - [X] Speicherung der Statistiken in Realtime Database
- [X] **Hardware Integration:**
    - [X] **Philips Hue:** Vollständige Integration (Szenen, Treffer-Feedback, An/Aus-Schalter im Header)

## Prio 0: Analyse & Refactoring
- [ ] Umfassende Analyse des Repository
- [ ] Identifizierung von Schwachstellen im Code
- [ ] "Erste Schritte" definieren (z.B. CSS-Optimierungen, ...)
- [ ] Technische Schulden abbauen (z.B. Datenspeicherung Firebase, Gegneranzeige in Statistiken, ...)

## 🎮 Priorität 1: Neue Spielmodi
- [ ] **121 (Checkout-Training)**
    - [ ] Spiel-Logik implementieren (9 Darts Zeit für Finish, bei Erfolg +1, bei Misserfolg -1)
    - [ ] UI-Anpassung für Checkout-Vorgaben
- [ ] **X01 Erweiterungen**
    - [ ] AVG-Anzeige während des Spiels (3-Dart Average live)
    - [ ] Bot-Gegner (CPU Level 1-5)

## ✨ Priorität 2: UI & Polish
- [ ] **Responsiveness:** Optimierung für Tablets vs. Smartphones
- [ ] **Animationen:** Flüssigere Übergänge beim Dart-Einschlag (Visualisierung auf Board optional)
- [ ] **Sprachwahl:** Umschalter Deutsch/Englisch (aktuell Hardcoded Deutsch)
	
## 🚀 Priorität 3: Audio & Atmosphäre
- [ ] **Sound Service Architektur**
    - [ ] Erstellen eines `sound-service.js` (analog zu `hue-service.js`)
    - [ ] Mapping der Scores (0-180) auf die MP3-Dateien in `/assets/audio-english/`
    - [ ] Implementierung "Caller" (Ansage der Gesamtpunktzahl nach Aufnahme)
    - [ ] Implementierung Spezial-Sounds (Bust, Bullseye, Game Shot)
- [ ] **Settings Erweiterung**
    - [ ] Master-Schalter für Sound (An/Aus) im UI
    - [ ] Lautstärkeregler (optional)

## 🐛 Known Issues / Refactoring
- [ ] Prüfung der "Undo"-Funktion bei komplexen Spielmodi (Cricket) auf Konsistenz mit Statistiken.