Das ist eine großartige Frage. Lass mich dir ein vollständiges Bild zeichnen – von offenen Baustellen über Quick Wins bis zu richtig spannenden Weiterentwicklungen.

---

## 🔧 Noch offen aus dieser Session

**Bugs zum Testen:**
- Checkout Challenge: Punktestand-Sprung nach Aufnahme (Lazy-Apply Fix eingebaut, muss live verifiziert werden)
- Multiplayer Opponents: `state.js` Fix ist drin, aber alte Einträge bleiben "Solo" – neue Spiele sollten jetzt korrekt taggen
- Checkout-Guide in X01: Style-Reset ist drin, Praxistest steht aus
- "Springende große Zahl" in X01: Konnte ich ohne Live-Reproduktion nicht weiter eingrenzen

**Technische Schulden (aus dem UNIFIED-DART-MODEL-PLAN):**
- Der Stats-Service hat immer noch 9 separate `getXxxStats()`-Methoden mit viel Duplikation – der DRY-Refactor mit einem generischen Aggregator steht noch aus
- Die `_calculateSingleTrainingStats` in `state.js` nutzt teilweise noch das alte `d.val`-Format

---

## 🎯 Neue Spiele – Was fehlt im Dart-Ökosystem?

Eure App deckt **Scoring** (X01, Scoring Drill), **Präzision** (Single Training, ATB, Shanghai), **Doubles** (Bob's 27, Checkout Challenge) und **Taktik** (Cricket, Halve It) ab. Was fehlt:

### 1. **Killer** – Das ultimative Multiplayer-Trainings-Spiel
Jeder Spieler bekommt eine zufällige Zahl (oder wählt blind). Man hat 3 "Leben". Ziel: Treffe das Double deiner Zahl um "Killer" zu werden, dann triffst du die Doubles der Gegner um deren Leben zu nehmen. Wer zuletzt steht, gewinnt.

**Warum perfekt für eure App:** Taktisch, spannend im Multiplayer, trainiert Doubles unter echtem Druck. Ergänzt Bob's 27 (Solo-Double-Training) durch eine kompetitive Variante. Einfach zu implementieren – ein neuer Strategy, kein neues Keypad nötig.

### 2. **301 Countdown** – Blitz-Training
Wie X01 mit 301, aber auf Zeit. Uhr läuft, du wirfst so schnell wie möglich. Kein Multiplayer, nur du gegen die Uhr. Statistik: beste Zeit pro Checkout, Durchschnittszeit.

**Warum spannend:** Simuliert den Zeitdruck eines echten Matches. Autodarts-kompatibel. Nutzt die bestehende X01-Logik mit einem Timer-Overlay.

### 3. **Segment Master** – Fokus-Training auf ein einzelnes Feld
Wähle ein Segment (z.B. T19). 30 Darts. Jeder Treffer auf T19 = 3 Punkte, D19 = 2, S19 = 1, alles andere = 0. Heatmap zeigt, wie eng deine Gruppierung ist.

**Warum wertvoll:** Das Scoring Drill trainiert T20, aber im Match brauchst du auch T19 (Cover-Shot) und T18 (Setup). Dieses Spiel macht gezieltes Segment-Training messbar. Euer bestehendes Pro-Keypad funktioniert direkt.

### 4. **Pressure Finish** – Checkout unter Stress
Wie Checkout Challenge, aber mit aufsteigender Schwierigkeit UND sinkendem Zeitlimit. Runde 1: 80er Checkout, 30 Sekunden. Runde 5: 120er Checkout, 15 Sekunden. Wer die meisten Checks schafft.

**Warum aufregend:** Kombiniert Checkout-Training mit Zeitdruck. Die Checkout Challenge ist aktuell "entspannt" – das hier bringt den Puls hoch.

---

## 📋 Kuratierte Trainingspläne – Die nächste Stufe

### Idee: **Adaptive Pläne**
Statt fixer Blöcke passt sich der Plan an die Performance an:

**"The Diagnostic"** – 20 Min Schwächenanalyse:
1. ATB Full (schnell) → misst generelle Board-Kontrolle
2. Scoring Drill 33 → misst Scoring-Stärke
3. Bob's 27 → misst Double-Präzision
4. **Ergebnis-Screen:** Radar-Chart mit 4 Achsen (Scoring, Doubles, Präzision, Consistency), konkreter Tipp welcher Bereich Training braucht

**"Match Prep"** – 15 Min vor einem echten Match:
1. ATB Outer Singles (Warm-Up, locker)
2. Scoring Drill 33 (Rhythmus finden)
3. Checkout Challenge Easy, 2 Aufnahmen (Confidence aufbauen)
4. 170 × 3 Runden (Checkout-Gefühl schärfen)

**"Double Trouble"** – 25 Min reines Double-Training:
1. Bob's 27 (Warm-Up)
2. Checkout Challenge Hard, 3 Aufnahmen (hohe Checkouts)
3. 170 × 10 Runden (Checkout unter Wiederholung)
4. Checkout Challenge Easy, 1 Aufnahme (Speed-Finishes zum Abschluss)

**"The Grinder Pro"** – 60 Min Kompletttraining:
1. ATB Double (nur Doubles aufwärmen)
2. Scoring Drill 99 (Ausdauer)
3. Shanghai 20 Runden (Precision under pressure)
4. Halve It Long (mentale Stärke)
5. Checkout Challenge Standard, 2 Aufnahmen
6. 501 Best of 5 (Match-Simulation)

### Idee: **Wochenplan-System**
Statt einzelner Sessions ein strukturierter Wochenplan:

| Tag | Fokus | Plan |
|---|---|---|
| Mo | Scoring | Scoring Drill 99 + Shanghai |
| Di | Doubles | Bob's 27 + Checkout Challenge |
| Mi | Match | 501 Best of 7 + Cricket |
| Do | Präzision | ATB Triples + Single Training |
| Fr | Pressure | 170 × 20 + Halve It |
| Sa | Diagnostic | The Diagnostic (Fortschritt messen) |

Die App könnte auf dem Dashboard den **heutigen Plan** hervorheben und über Wochen den Fortschritt tracken.

---

## 📊 Statistik-Weiterentwicklungen

### Cross-Game Analytics
- **"Dart IQ"** – ein gewichteter Gesamtscore aus allen Spielen: Scoring AVG (30%), Double-Rate (25%), Hit-Rate (20%), Consistency (15%), Checkout-Rate (10%)
- **Trend-Dashboard** auf der Startseite: Spark-Lines pro Spiel der letzten 7 Tage
- **Session-Überblick** nach jedem Trainingsplan: "Heute trainiert: 45 Min, 180 Darts, +2.3 Avg, Double-Rate ↑3%"

### Achievements / Badges
- 🏆 "First 180" – Erste 180 geworfen
- 🎯 "Checkout King" – 170 in 3 Darts gecheckt
- 🔥 "On Fire" – 5 Checkouts in Folge
- 💪 "Iron Man" – 7 Tage in Folge trainiert
- 🎓 "Master Class" – Alle Diagnostic-Achsen über 70%

---

## 🔮 Langfristige Vision

**Autodarts-Integration (im UNIFIED-DART-MODEL-PLAN skizziert):**
Die Normalizer-Schicht ist vorbereitet. Wenn Autodarts-Daten über Firebase kommen, braucht es nur ~5 Zeilen in `normalizeDart()`. Dann funktionieren ALLE Spiele automatisch mit Board-Erkennung, inklusive Scatter-Heatmaps mit echten Dart-Positionen.

**Social Features:**
- Geteilte Leaderboards pro Spiel
- "Challenge a Friend" – asynchrone Matches (jeder spielt seine Runde, Ergebnis wird verglichen)
- Trainingsplan-Sharing

---

Welche Richtung begeistert dich am meisten? Soll ich einen konkreten nächsten Schritt ausarbeiten – sei es ein neues Spiel, ein adaptiver Trainingsplan, oder das Statistik-Dashboard?