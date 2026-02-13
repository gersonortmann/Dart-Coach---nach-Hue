# Dart Coach – Technische Projektdokumentation

> **Stand:** 13. Februar 2026 – nach Abschluss aller Refactoring-Steps (1–7b)
> **Zweck:** Onboarding-Dokument für KI-Assistenten (Claude, Gemini) und menschliche Entwickler. Enthält alles, um ohne Repository-Einlesen sofort produktiv arbeiten zu können.

---

## 1. Projektübersicht

**Dart Coach** ist eine Single-Page Web-App für Dart-Training und -Wettkämpfe. Die App läuft im Browser (kein Build-System, reine ES-Module), nutzt Firebase Realtime Database als Backend und unterstützt optional Philips Hue Lichtsteuerung.

### Tech Stack
- **Frontend:** Vanilla JavaScript (ES Modules), HTML, CSS (Custom Properties)
- **Backend:** Firebase Realtime Database + Firebase Auth
- **Keine Build-Tools:** Kein Webpack, kein npm, kein TypeScript. Alles läuft nativ im Browser über `<script type="module">`.
- **Externe Libs:** Chart.js (via CDN), Firebase SDK (via CDN)

### Unterstützte Spiele
| ID | Name | Modus | Beschreibung |
|---|---|---|---|
| `x01` | X01 Match | Pro-Keypad (S/D/T) | 301/501/701, Double-In/Out, Sets/Legs |
| `cricket` | Cricket | Pro-Keypad (S/D/T) | 15–20 + Bull, Marks, Multiplayer |
| `single-training` | Single Training | Training-Keypad (S/D/T/Miss) | 21 Ziele (1–20 + Bull), Hit-Rate |
| `shanghai` | Shanghai | Training-Keypad (S/D/T/Miss) | 7 oder 20 Runden, S+D+T = Sofort-Sieg |
| `bobs27` | Bob's 27 | Aggregate-Keypad (0–3 Hits) | Start bei 27, Doubles treffen, Bust bei <0 |
| `around-the-board` | Around the Board | Hit/Miss-Keypad | 1–20 + Bull, Darts zählen |

---

## 2. Dateistruktur

```
project-root/
├── index.html                    ← Single-Page HTML, Firebase CDN, Chart.js CDN
├── js/
│   ├── app.js                    ← Entry Point: Init, DOMContentLoaded, window.DartApp Bridge
│   ├── core/
│   │   ├── state.js              ← Zentraler App-State, Session-Management, Firebase-Save
│   │   ├── store.js              ← Firebase Auth + Realtime DB (CRUD)
│   │   ├── constants.js          ← Checkout-Tabelle, statische Daten
│   │   ├── dart-model.js         ← ★ Universelles Dart-Objekt (Step 7a)
│   │   ├── event-bus.js          ← ★ Pub/Sub Event-System (Step 6)
│   │   ├── stats-service.js      ← ★ Historische Statistik-Aggregation (Step 7b)
│   │   ├── hue-service.js        ← Philips Hue Bridge (EventBus-Subscriber)
│   │   └── autodarts-service.js  ← Firebase-Listener für Autodarts-Hardware
│   ├── games/
│   │   ├── game-engine.js        ← ★ Zentrale Spielsteuerung (Normalizer + EventBus)
│   │   ├── x01.js                ← Strategy: X01
│   │   ├── cricket.js            ← Strategy: Cricket
│   │   ├── single-training.js    ← Strategy: Single Training
│   │   ├── shanghai.js           ← Strategy: Shanghai
│   │   ├── bobs27.js             ← Strategy: Bob's 27
│   │   └── around-the-board.js   ← Strategy: Around the Board
│   └── ui/
│       ├── ui-core.js            ← Screen-Routing, showScreen(), updateGameDisplay()
│       ├── ui-game.js            ← In-Game Rendering (Target-Box, Dart-Boxes, Scoreboard)
│       ├── ui-keyboard.js        ← Keypad-Layouts (Pro, Training, ATB, Bob's27)
│       ├── ui-setup.js           ← Spielkonfiguration (Spielerauswahl, Optionen, Start)
│       ├── ui-result.js          ← Ergebnis-Screen nach Spielende
│       ├── ui-stats.js           ← Lifetime-Statistik Dashboard
│       ├── ui-stats-board.js     ← SVG Dartboard für Heatmaps
│       ├── ui-overlay.js         ← Score-Overlay Animationen
│       ├── ui-mgmt.js            ← Spieler-Verwaltung
│       └── ui-auth.js            ← Login/Register UI
├── css/
│   ├── base.css                  ← CSS Variables, Reset, Typography
│   ├── layouts.css               ← Grid-Layouts, Screen-Struktur
│   ├── components.css            ← Buttons, Cards, Badges, Forms
│   ├── game.css                  ← Spiel-spezifische Styles (Target-Box, Dart-Boxes)
│   └── overlays.css              ← Overlay-Animationen
```

### Dateien markiert mit ★ = Im letzten Refactoring grundlegend überarbeitet

---

## 3. Architektur-Überblick

### 3.1 Schichtenmodell

```
┌─────────────────────────────────────────────────────────┐
│ UI-SCHICHT (ui/*.js)                                    │
│  ui-core → ui-game, ui-keyboard, ui-result, ui-stats    │
│  ui-setup → Spielkonfiguration                          │
│  ui-overlay → Score-Animationen                         │
└────────────────────┬────────────────────────────────────┘
                     │ Aufrufe: UI.updateGameDisplay(),
                     │ UI.showOverlay(), UI.showResult()
┌────────────────────▼────────────────────────────────────┐
│ GAME-SCHICHT (games/*.js)                               │
│  GameEngine ← Zentrale Steuerung                        │
│    ├─ normalizeDart()  → Unified Dart Model             │
│    ├─ Strategy Pattern → 6 Spiel-Strategien             │
│    └─ EventBus.emit()  → Entkoppelte Events             │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│ CORE-SCHICHT (core/*.js)                                │
│  State     ← In-Memory State + Session                  │
│  Store     ← Firebase Realtime DB                       │
│  EventBus  ← Pub/Sub für Services                       │
│  HueService ← Licht (subscribed auf EventBus)           │
│  StatsService ← Historische Aggregation                 │
│  DartModel ← normalizeDart(), parseSegment()            │
└─────────────────────────────────────────────────────────┘
```

### 3.2 Kommunikationsregeln
- **UI → GameEngine:** Direkte Aufrufe (`GameEngine.onInput()`, `GameEngine.startGame()`)
- **GameEngine → UI:** Direkte Aufrufe (`UI.updateGameDisplay()`, `UI.showOverlay()`)
- **GameEngine → Services:** NUR über EventBus (`EventBus.emit('GAME_EVENT', {...})`)
- **Services → Nichts:** HueService reagiert nur, ruft niemanden auf
- **UI → State:** Direkte Aufrufe (`State.getActiveSession()`)
- **State → Store:** Direkte Aufrufe (`Store.saveUser()`)

### 3.3 Event-Bus (Step 6)

```javascript
// Events die emittiert werden:
EventBus.emit('SCREEN_CHANGED', { screen: 'screen-game' });      // Von ui-core.js
EventBus.emit('GAME_EVENT', { type: 'game-started' });            // Von game-engine.js
EventBus.emit('GAME_EVENT', {                                     // Von game-engine.js
    type: 'input-processed',
    overlay: { text: '180', type: '180' },
    action: 'NEXT_TURN',
    dart: { segment: 'T20', ... },                                // Universal Dart
    gameId: 'x01',
    lastTurnScore: 180
});

// Subscriber:
EventBus.on('GAME_EVENT', (data) => { ... });     // hue-service.js
EventBus.on('SCREEN_CHANGED', (data) => { ... }); // hue-service.js
```

---

## 4. Zentraler Datenfluss: Vom Wurf zur Statistik

### 4.1 Input → Normalisierung → Strategy → Firebase

```
KEYPAD / AUTODARTS
       │
       ▼
 GameEngine.onInput(rawValue)
       │
       ├─ 1. _getCurrentTarget(session)     → Aktuelles Ziel ermitteln
       ├─ 2. normalizeDart(raw, context)    → Universal Dart Object erzeugen
       ├─ 3. strategy.handleInput(dart)     → Spiellogik ausführen
       ├─ 4. EventBus.emit('GAME_EVENT')    → Services benachrichtigen
       ├─ 5. UI.showOverlay()               → Visuelles Feedback
       └─ 6. switch(result.action)          → BUST/WIN/NEXT_TURN/CONTINUE
```

### 4.2 Das Universal Dart Object (dart-model.js)

**Jeder Wurf** – egal ob vom Keypad oder Autodarts – wird in dieses Format normalisiert:

```javascript
{
    segment:    'T20',       // Notation: S1–S20, D1–D20, T1–T20, S25, D25, MISS
    base:       20,          // Grundzahl: 1–20 oder 25
    multiplier: 3,           // 0=Miss, 1=Single, 2=Double, 3=Triple
    points:     60,          // base × multiplier
    isMiss:     false,       // Schneller Check
    source:     'keypad',    // 'keypad' | 'autodarts'
    position:   null,        // { x, y } mm vom Zentrum (nur Autodarts)
    confidence: null         // 0.0–1.0 (nur Autodarts)
}
```

**Wichtig:** Manche Spiele überschreiben `points` beim Speichern in `tempDarts`:
- **X01:** `{ ...dart, points: result.points }` → 0 bei Bust/Double-In-Miss
- **Cricket:** `{ ...dart, points: pointsScored }` → Cricket-Punkte statt Face Value
- **Training:** `{ ...dart, points: dart.multiplier }` → S=1, D=2, T=3
- **Shanghai/ATB/Bob's27:** Dart wird unverändert gespeichert

### 4.3 Input-Formate die normalizeDart() versteht

| Quelle | Rohformat | Beispiel |
|---|---|---|
| Pro-Keypad (X01/Cricket) | String | `'T20'`, `'D25'`, `'0'`, `'25'`, `'50'` |
| Training-Keypad | Object | `{ multiplier: 2, isMiss: false }` |
| Bob's 27 Keypad | Object (Aggregat) | `{ hits: 2 }` → `_isAggregate: true` |
| ATB Keypad | String | `'HIT'`, `'MISS'` |
| Autodarts | Object | `{ segment: 'T20', x: 6.2, y: -3.1, confidence: 0.95 }` |
| Bereits normalisiert | Object (segment+base) | Wird durchgereicht |

### 4.4 Wie jede Strategy das Dart-Objekt nutzt

```javascript
// X01:       dart.points, dart.multiplier === 2 (Double-Check)
// Cricket:   dart.base (welche Zahl), dart.multiplier (wie viele Marks)
// Training:  dart.isMiss, dart.multiplier (als Score: S=1, D=2, T=3)
// Shanghai:  dart.isMiss, dart.points (= base × multiplier)
// Bob's 27:  dart._isAggregate ? dart._aggregateHits : (dart.multiplier===2)
// ATB:       dart.isMiss (Hit oder Miss)
```

---

## 5. Strategy Pattern

### 5.1 Aufbau einer Strategy

Jede Strategy exportiert ein Objekt mit dieser Schnittstelle:

```javascript
export const MyGame = {
    config: {
        hasOptions: true,          // Zeigt Options-Panel in Setup
        mode: 'mixed',             // Keypad-Modus (optional)
        defaultProInput: false,    // Pro vs Training Keypad
        description: "..."         // Beschreibung für UI
    },

    generateTargets(options) { },   // → Array von Zielzahlen
    initPlayer(player, opts, t) { }, // Spieler-State initialisieren

    handleInput(session, player, dart) {
        // Spiellogik ausführen
        // tempDarts befüllen
        // Return: { action, overlay?, delay? }
    },

    handleWinLogik(session, player, result) {
        // Return: { messageTitle, messageBody, nextActionText }
    },

    getResultData(session, player) {
        // Return: { summary, chart, heatmap, distribution?, ... }
    }
};
```

### 5.2 Mögliche Actions von handleInput()

| Action | Bedeutung | GameEngine-Reaktion |
|---|---|---|
| `CONTINUE` | Noch Darts übrig | UI aktualisieren |
| `NEXT_TURN` | Aufnahme beendet (3 Darts) | Nächster Spieler nach Delay |
| `BUST` | Überworfen (X01) | Animation + Score-Reset + Nächster |
| `WIN_LEG` | Leg gewonnen (X01) | Modal → resetLeg() |
| `WIN_MATCH` | Spiel gewonnen | Modal → Result-Screen |
| `FINISH_GAME` | Spieler fertig (Training) | Prüfe ob alle fertig → Result |

### 5.3 Turn-Speicherung (tempDarts → player.turns)

```javascript
// Während der Aufnahme (3 Darts):
session.tempDarts = [ dart1, dart2, dart3 ];  // Universal Dart Objects

// Nach Aufnahme-Ende → in player.turns gepusht:
player.turns.push({
    roundIndex: 0,
    score: 60,                    // Turn-Score (Semantik je Spiel unterschiedlich)
    darts: [...session.tempDarts], // Array von Universal Darts
    timestamp: Date.now(),

    // Optionale Spiel-spezifische Felder:
    bust: false,                  // X01
    isLegFinish: false,           // X01
    marksSnapshot: {...},         // Cricket
});

// Sonderfall Bob's 27: Kein darts[]-Array, stattdessen:
player.turns.push({
    hits: 2,                      // Aggregate-Treffer (0–3)
    score: 67,                    // Aktueller Gesamtscore
    change: 40,                   // Score-Änderung dieser Runde
    target: 20                    // Double-Ziel
});
```

---

## 6. Firebase-Datenstruktur

### 6.1 Datenbankpfade

```
Firebase Realtime Database
└── users/
    └── {uid}/                           ← Firebase Auth UID
        └── players/
            └── {playerId}/              ← z.B. "p_1707744000000"
                ├── id: "p_1707744000000"
                ├── name: "Max"
                └── history: [           ← Array aller gespielten Matches
                    {
                        matchId: "m_1707744000000_p_123",
                        date: 1707744000000,
                        game: "x01",
                        settings: {
                            startScore: 501,
                            doubleIn: false,
                            doubleOut: true,
                            bestOf: 3,
                            mode: "legs",
                            opponents: ["Lisa"]
                        },
                        stats: {         ← Vorberechnet von getResultData()
                            summary: { avg: "45.2", first9: "52.1", ... },
                            powerScores: { ton: 3, ton40: 1, max: 0 },
                            heatmap: { T20: 5, S20: 12, ... },
                            isWinner: true
                        },
                        totalScore: 1250,
                        turns: [...],    ← Komplette Turn-Historie
                        targets: [501]   ← Ziel-Array
                    },
                    // ... weitere Matches
                ]
```

### 6.2 Speicherzeitpunkt

Das Speichern erfolgt in `State.saveActiveSession()` am Spielende:

1. Für jeden Spieler wird `getResultData()` der Strategy aufgerufen → `stats`
2. `calculateMatchStats()` berechnet basis-Statistiken → wird mit `stats` gemerged
3. Winner wird ermittelt → `stats.isWinner`
4. Alles wird als `historyEntry` in `player.history[]` gepusht
5. `Store.saveUser(player)` schreibt den kompletten Spieler nach Firebase

### 6.3 Rückwärtskompatibilität

Historische Daten (vor Step 7a) nutzen das alte Format:
- X01/Cricket: `darts[].val` ist ein String (`'T20'`, `'S5'`)
- Training/Shanghai: `darts[].val` ist ein Object (`{ multiplier: 2, isMiss: false }`)
- ATB: `darts[].isHit` statt `darts[].isMiss`

**Lösung:** `normalizeFromHistory()` in dart-model.js und `_readDart()` in stats-service.js lesen beide Formate. Neue Spiele schreiben das Universal-Format, alte Daten werden beim Lesen on-the-fly konvertiert.

---

## 7. UI-Architektur

### 7.1 Screen-Routing

```
screen-login → screen-dashboard → screen-setup → screen-game → screen-result
                   ↓                                                ↑
              screen-stats                                    (Automatisch
              screen-mgmt                                     nach Spielende)
```

**Routing über:** `UI.showScreen(screenId)` → blendet CSS-Klassen ein/aus, emittiert `EventBus.emit('SCREEN_CHANGED', { screen })`.

### 7.2 In-Game Rendering (ui-game.js)

`updateGameDisplay()` wird nach JEDEM Input aufgerufen und dispatcht per Switch:

```javascript
if (gameId === 'cricket')         → _renderCricket(session)
else if (gameId === 'single-training') → _renderTraining(session)
else if (gameId === 'shanghai')   → _renderShanghai(session)
else if (gameId === 'bobs27')     → _renderBobs27(session)
else if (gameId === 'around-the-board') → _renderAroundTheBoard(session)
else                               → _renderX01(session)
```

**Dart-Boxes** (`_updateDartBoxes`): Zeigt die 3 Darts der aktuellen Aufnahme. Liest `dart.isMiss`, `dart.segment`, `dart.multiplier`, `dart.base` aus dem Universal Dart Format.

### 7.3 Keypad-Layouts (ui-keyboard.js)

| Layout | Spiel | Buttons |
|---|---|---|
| Pro | X01, Cricket | S1–S20, D1–D20, T1–T20, 25, 50, 0 |
| Training | Single Training, Shanghai | Single, Double, Triple, Miss |
| Bob's 27 | Bob's 27 | 0 Treffer, 1 Treffer, 2 Treffer, 3 Treffer |
| ATB | Around the Board | HIT, MISS |

Alle Keypads rufen `GameEngine.onInput(rawValue)` auf. Die Normalisierung passiert im GameEngine.

---

## 8. Statistik-System

### 8.1 Zwei Ebenen

1. **Match-Statistik** (`getResultData()` in jeder Strategy): Berechnet nach Spielende, wird in Firebase gespeichert. Enthält Summary, Charts, Heatmap, Distribution.

2. **Lifetime-Statistik** (`stats-service.js`): Aggregiert über alle historischen Matches. Wird bei jedem Öffnen der Stats-Seite live berechnet aus `player.history[]`.

### 8.2 Stats-Service Methoden

| Methode | Spiel | Filter | Datenquelle |
|---|---|---|---|
| `getX01Stats()` | X01 | sido/siso/dido/diso | `game.stats` (vorberechnet) |
| `getCricketStats()` | Cricket | nolimit/20/10 | `game.stats` (vorberechnet) |
| `getShanghaiStats()` | Shanghai | 7/20 | `_aggregateHitDarts()` |
| `getSingleTrainingStats()` | Training | – | `_aggregateHitDarts()` |
| `getAtcStats()` | ATB | Variant-Filter | `_readDart()` für Matrix |
| `getBobs27Stats()` | Bob's 27 | – | `turn.hits` direkt |

### 8.3 Format-agnostische Helper

```javascript
_readDart(d)            // Liest altes UND neues Format → { isMiss, multiplier }
_aggregateHitDarts(game) // Zählt Hits/Misses/S/D/T über alle Turns eines Games
```

---

## 9. Hue-Service & Smart Home

### 9.1 Architektur

```
GameEngine.onInput()
    └─ EventBus.emit('GAME_EVENT', { type, overlay, action, dart, gameId })
         └─ HueService (subscriber):
              ├─ overlay.type === '180'  → HueService.trigger('180')  → Grünes Pulsieren
              ├─ overlay.type === 'bust' → HueService.trigger('MISS') → Rotes Pulsieren
              ├─ overlay.type === 'check'→ HueService.trigger('180')  → Feier-Effekt
              └─ Kein Overlay, stiller Hit → HueService.trigger('HIT')
```

### 9.2 Konfiguration
- Bridge-IP + API-Key werden in `localStorage` gespeichert
- Lichtgruppe (Entertainment Area) wird über Dropdown gewählt
- Szenen (warm, cool, party) werden aus der Bridge geladen

---

## 10. Autodarts-Integration (Vorbereitet, nicht aktiv)

### 10.1 Aktueller Stand
- `autodarts-service.js` lauscht auf Firebase-Pfad `autodarts_live/current_throw`
- `ui-setup.js` hat Toggle-Button (📡)
- `normalizeDart()` erkennt Autodarts-Format automatisch (segment + x/y)
- **Keine Strategy muss geändert werden** – alles läuft durch den Normalizer

### 10.2 Erwartetes Autodarts-Format

```javascript
// Firebase: autodarts_live/current_throw
{
    segment: "T20",
    x: 6.2,           // mm vom Zentrum
    y: -3.1,
    confidence: 0.95
}
```

### 10.3 Was noch fehlt
- Hardware-Kalibrierung
- Confidence-Threshold (wann wird ein Wurf akzeptiert?)
- Bob's 27 Phase B: Per-Dart statt Aggregate (3 Klicks statt 1)

---

## 11. CSS-System

### 11.1 Custom Properties (base.css)

```css
:root {
    --bg-primary: #0a0a0a;
    --bg-card: #1a1a1a;
    --accent-color: #00d26a;      /* Grün – Treffer, Erfolg */
    --highlight-color: #eab308;   /* Gold – Bestleistung */
    --miss-color: #f87171;        /* Rot – Fehler, Bust */
    --text-primary: #ffffff;
    --text-secondary: #a0a0a0;
}
```

### 11.2 Konvention
- Farben NUR über CSS Variables
- Layouts über CSS Grid
- Keine CSS-Frameworks, kein Tailwind
- Dark-Theme only (Optimiert für Dart-Räume / dunkle Umgebungen)

---

## 12. Abgeschlossene Refactoring-Steps

| Step | Beschreibung | Status |
|---|---|---|
| 1–3 | CSS-Cleanup, Variable System | ✅ Erledigt |
| 4 | Security Review | ✅ Erledigt |
| 5 | Strategy UI Config | ✅ Erledigt |
| 6 | Event-Bus (Hue-Entkopplung) | ✅ Erledigt & getestet |
| 7a | Unified Dart Model + Strategy-Migration | ✅ Erledigt & getestet |
| 7b | Stats-Service DRY Refactor | ✅ Erledigt & getestet |
| 8 | Autodarts-Integration | ⏳ Wartet auf Hardware |

---

## 13. Offene Aufgaben & Ideen

### Statistik-Visualisierungen (Prio: Mittel)
- **X01:** Graph + Power-Scores funktionieren gut. Heatmap braucht Autodarts-Daten.
- **Cricket:** MPR-Trend ist wertvoll. Heatmap optional.
- **Training/Shanghai:** "Score pro Ziel"-Graph zeigt Stärken/Schwächen.
- **Bob's 27:** Score-Verlauf mit "bis wohin geschafft"-Markierung (gewünscht).
- **ATB:** Matrix (Darts pro Ziel) ist aussagekräftigster Bereich.

### Heatmaps (Prio: Niedrig)
- Aktuell: Segment-basiert (Farbflächen auf SVG). Wenig aussagekräftig ohne Positionsdaten.
- Zukunft mit Autodarts: Punkt-genaue Scatter-Heatmap (`dart.position.x/y`).
- Entscheidung: Heatmaps erst mit Autodarts sinnvoll überarbeiten.

### Training-Pläne (Prio: Niedrig)
- Grundstruktur in `state.js` vorhanden (`startTrainingPlan`, `advancePlanBlock`)
- UI-Integration nicht abgeschlossen

### state.js Cleanup (Prio: Mittel)
- `_calculateSingleTrainingStats()` liest noch das alte Format (`d.val.isMiss`). Sollte auf `_readDart()` oder das neue Format umgestellt werden.
- `calculateMatchStats()` ist robust (liest `d.points`), aber könnte vereinfacht werden.

---

## 14. Wichtige Konventionen & Fallstricke

### 14.1 Für AI-Assistenten

1. **Immer ui-game.js und ui-stats.js mitdenken** wenn Datenformate geändert werden. Diese Dateien sind die Konsumenten der Strategy-Outputs.

2. **Firebase-Daten sind immutabel** – alte Spiele behalten ihr Format. Neue Lese-Logik muss IMMER beide Formate unterstützen.

3. **Kein Build-System** – Änderungen sind sofort live. Keine Kompilierung, kein `npm run build`. Einfach Datei speichern und Browser refreshen.

4. **`window.DartApp`** ist die globale Bridge für HTML-onclick-Handler. Neue Module die von HTML aus erreichbar sein müssen, werden dort eingehängt.

5. **tempDarts** werden nach der Aufnahme geleert. Die Turn-Daten leben dann nur noch in `player.turns[]`.

6. **Bob's 27 ist der Sonderfall** – kein `darts[]` Array in Turns, stattdessen `{ hits, score, change, target }`. Die Strategy nutzt `_isAggregate` Flag.

### 14.2 Test-Checkliste nach Änderungen

Für jedes betroffene Spiel:
1. Spiel starten → 3 Darts werfen → Dart-Boxes korrekt?
2. Turn beenden → Score korrekt? Overlay korrekt?
3. Undo → Vorheriger Zustand wiederhergestellt?
4. Spiel beenden → Result-Screen korrekt?
5. Stats-Seite → Hero Cards, Chart, Match-Liste korrekt?
6. Multiplayer → Spielerwechsel korrekt?

### 14.3 Import-Abhängigkeiten

```
app.js
├── games/game-engine.js
│   ├── core/dart-model.js       (normalizeDart)
│   ├── core/event-bus.js        (EventBus)
│   ├── core/state.js
│   ├── games/x01.js
│   ├── games/cricket.js
│   ├── games/single-training.js
│   ├── games/shanghai.js
│   ├── games/bobs27.js
│   ├── games/around-the-board.js
│   └── ui/ui-core.js
├── core/state.js
│   └── core/store.js
├── core/store.js (Firebase)
├── core/hue-service.js
│   └── core/event-bus.js
└── ui/ui-core.js
    ├── ui/ui-game.js
    ├── ui/ui-keyboard.js
    ├── ui/ui-result.js
    ├── ui/ui-stats.js
    │   └── core/stats-service.js
    ├── ui/ui-setup.js
    │   └── core/autodarts-service.js
    └── ui/ui-overlay.js
```
