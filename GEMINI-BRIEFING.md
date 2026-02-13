# Dart Coach – Arbeitsanweisung für Gemini

> **Zweck:** Dieses Dokument ist die vollständige Arbeitsanweisung für Gemini, um neue Spiele und Trainingspläne in der Dart Coach App zu implementieren.  
> **Stand:** 13. Februar 2026  
> **Wichtig:** Lies ZUERST die beigefügte `DART-COACH-PROJECT.md` — sie enthält die gesamte technische Architektur. Dieses Dokument hier beschreibt NUR die konkreten Aufgaben.

---

## 0. Kontext & Regeln

### Was Dart Coach ist
Eine Single-Page Web-App für Dart-Training und -Wettkämpfe. Vanilla JavaScript (ES Modules), Firebase Backend, kein Build-System. Alles läuft nativ im Browser.

### Was du implementieren sollst
1. **Checkout Challenge** — Neues Spiel (Strategy)
2. **Halve It** — Neues Spiel (Strategy)
3. **Trainingsplan-System** — Plan-Runner + zwei konkrete Pläne

### Goldene Regeln

| ✅ ERLAUBT | ❌ VERBOTEN |
|---|---|
| Neue Dateien unter `js/games/` erstellen | `dart-model.js` ändern |
| Strategy-Map in `game-engine.js` erweitern | `game-engine.js` Kernlogik ändern |
| Keypad-Layout in `ui-keyboard.js` registrieren | `event-bus.js` ändern |
| `ui-core.js` GAME_NAMES erweitern | Firebase-Datenstruktur ändern |
| Neue CSS-Klassen hinzufügen | Bestehende CSS-Klassen überschreiben |
| `ui-game.js` Render-Dispatch erweitern | Bestehende Spiele modifizieren |

### Dateien die du kennen musst (in DART-COACH-PROJECT.md beschrieben)

```
js/games/game-engine.js    → Hier registrierst du neue Strategies
js/games/shanghai.js       → TEMPLATE: Einfaches Training-Spiel
js/games/x01.js            → REFERENZ: Komplexes Match-Spiel
js/ui/ui-keyboard.js       → Keypad-Layouts registrieren
js/ui/ui-core.js           → GAME_NAMES Dictionary erweitern
js/ui/ui-game.js           → Render-Dispatch für In-Game Display
js/core/dart-model.js      → NUR LESEN, NICHT ÄNDERN
```

---

## 1. Das Universal Dart Object (Input für alle Strategies)

**Jede Strategy bekommt als Input ein normalisiertes Dart-Objekt.** Du musst NIEMALS selbst parsen.

```javascript
// Das bekommst du in handleInput(session, player, dart):
{
    segment:    'T20',       // 'S1'–'S20', 'D1'–'D20', 'T1'–'T20', 'S25', 'D25', 'MISS'
    base:       20,          // 1–20 oder 25
    multiplier: 3,           // 0=Miss, 1=Single, 2=Double, 3=Triple
    points:     60,          // base × multiplier
    isMiss:     false,
    source:     'keypad'     // 'keypad' | 'autodarts'
}
```

### Wie du das Dart-Objekt nutzt

```javascript
// Will ich wissen ob es ein Double war?
const isDouble = dart.multiplier === 2;

// Will ich wissen welche Zahl getroffen wurde?
const number = dart.base;  // 1–20 oder 25

// Will ich die Punkte?
const points = dart.points;  // Bereits berechnet: base × multiplier

// War es ein Miss?
const missed = dart.isMiss;

// Für die Heatmap (segment-basiert):
if (!dart.isMiss) {
    heatmap[dart.segment] = (heatmap[dart.segment] || 0) + 1;
}
```

---

## 2. Strategy-Schnittstelle (Interface)

Jede neue Strategy MUSS dieses Interface implementieren:

```javascript
// js/games/mein-neues-spiel.js
export const MeinNeuesSpiel = {

    // ── KONFIGURATION ──
    config: {
        hasOptions: true,           // Zeigt Options-Panel im Setup
        description: "Beschreibung des Spiels für den Info-Button",
        // Optional:
        mode: 'pro',                // Keypad-Modus: 'pro' | 'training' | 'atb' | 'bobs27'
        defaultProInput: true       // true = Pro-Keypad (S/D/T), false = Training-Keypad
    },

    // ── ZIELE GENERIEREN ──
    // Wird VOR Spielstart aufgerufen. Gibt Array zurück.
    generateTargets(options) {
        // options = die Settings aus dem Setup-Screen
        // Return: Array von Zielzahlen oder null
        return [20, 19, 18, 17, 16, 15, 25]; // Beispiel
    },

    // ── SPIELER INITIALISIEREN ──
    // Wird für jeden Spieler aufgerufen, bevor das Spiel startet.
    initPlayer(player, options, targets) {
        player.score = 0;
        player.currentTargetIndex = 0;
        // Setze beliebige Properties auf player
    },

    // ── WURF VERARBEITEN ──
    // Wird bei JEDEM Wurf aufgerufen. Kernlogik des Spiels.
    handleInput(session, player, dart) {
        const settings = session.settings || {};
        const targets = session.targets || [];

        // ... Spiellogik ...

        // Dart in tempDarts speichern (PFLICHT):
        session.tempDarts.push(dart);
        // ODER mit modifizierten Points:
        // session.tempDarts.push({ ...dart, points: customPoints });

        // Return-Objekt:
        return {
            action: 'CONTINUE',  // oder 'NEXT_TURN', 'FINISH_GAME', 'BUST', 'WIN_MATCH'
            overlay: {
                text: '60',      // Text der Overlay-Animation
                type: 'score'    // 'score', '180', 'bust', 'check', 'miss'
            },
            delay: 0             // Verzögerung in ms bevor nächster Spieler
        };
    },

    // ── WIN-LOGIK (optional) ──
    // Wird aufgerufen wenn action = 'WIN_MATCH' oder 'WIN_LEG'
    handleWinLogik(session, player, result) {
        return {
            messageTitle: "GEWONNEN! 🎉",
            messageBody: `${player.name} gewinnt mit ${player.score} Punkten!`,
            nextActionText: "WEITER"
        };
    },

    // ── ERGEBNIS-DATEN ──
    // Wird am Spielende aufgerufen. Daten werden in Firebase gespeichert.
    getResultData(session, player) {
        const turns = player.turns || [];
        const heatmap = {};

        turns.forEach(t => {
            (t.darts || []).forEach(d => {
                if (d.segment && !d.isMiss) {
                    heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
                }
            });
        });

        return {
            summary: {
                totalScore: player.score,
                rounds: turns.length,
                // ... spielspezifische Stats
            },
            heatmap: heatmap,
            chart: null  // Optional: Chart.js Daten
        };
    }
};
```

### Mögliche Actions von handleInput()

| Action | Bedeutung | Was passiert danach |
|---|---|---|
| `CONTINUE` | Noch Darts übrig in dieser Aufnahme | UI aktualisieren, warte auf nächsten Dart |
| `NEXT_TURN` | Aufnahme beendet (3 Darts oder Regel-bedingt) | Daten in player.turns speichern, nächster Spieler |
| `BUST` | Überworfen / Regel verletzt | Score-Reset, Animation, nächster Spieler |
| `WIN_MATCH` | Spiel gewonnen | Modal → Result-Screen |
| `FINISH_GAME` | Training beendet (alle Ziele durch) | Prüfe ob alle Spieler fertig → Result |

### Turn-Speicherung

Nach `NEXT_TURN` oder `FINISH_GAME` werden die tempDarts automatisch vom GameEngine gespeichert:

```javascript
player.turns.push({
    roundIndex: player.turns.length,
    score: turnScore,              // Score dieser Aufnahme
    darts: [...session.tempDarts], // Kopie der geworfenen Darts
    timestamp: Date.now(),
    // + optionale spielspezifische Felder
});
session.tempDarts = [];  // Wird automatisch geleert
```

---

## 3. AUFGABE A: Checkout Challenge

### Spielregeln
- Spieler bekommt einen Checkout-Wert (z.B. 170, 130, 80, 40)
- Muss diesen Wert auf exakt 0 bringen (Double-Out, wie X01)
- Pro Checkout-Wert hat der Spieler 3 Aufnahmen (= 9 Darts)
- Schafft er es → nächster Checkout-Wert, Punkte für verbleibende Darts
- Schafft er es nicht → 0 Punkte für diesen Checkout, weiter zum nächsten
- Am Ende: Gesamtpunkte über alle Checkouts

### Settings (Setup-Screen)
```javascript
let checkoutSettings = {
    difficulty: 'standard',  // 'easy' (40–80), 'standard' (40–130), 'hard' (40–170)
    rounds: 10               // Anzahl Checkout-Werte
};
```

### Checkout-Werte pro Schwierigkeit
```javascript
const CHECKOUT_POOLS = {
    easy:     [40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80],
    standard: [40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 130],
    hard:     [40, 56, 72, 88, 104, 120, 130, 140, 150, 160, 167, 170]
};
```

### Dateiname
`js/games/checkout-challenge.js`

### Keypad
**Pro-Keypad** (wie X01) — der Spieler muss S/D/T-Segmente wählen.

### Export-Name
`export const CheckoutChallenge = { ... }`

### Registrierung (game-engine.js)
```javascript
import { CheckoutChallenge } from './checkout-challenge.js';
// In der strategies Map:
'checkout-challenge': CheckoutChallenge,
```

### Registrierung (ui-core.js)
```javascript
// In GAME_NAMES:
'checkout-challenge': 'Checkout Challenge',
```

### Scoring-Logik (Pseudocode)
```
Für jeden Checkout-Wert:
    remaining = checkout_value
    darts_used = 0
    
    Für jede Aufnahme (max 3):
        Für jeden Dart (max 3):
            darts_used++
            remaining -= dart.points
            
            if remaining == 0 UND dart.multiplier == 2:
                // CHECKOUT! Bonus = (9 - darts_used) * 3
                score += checkout_value + bonus
                → Nächster Checkout-Wert
            
            if remaining < 0 ODER (remaining == 0 UND !isDouble):
                // BUST: Aufnahme zurücksetzen
                remaining = Wert_vor_dieser_Aufnahme
                → Nächste Aufnahme
    
    // Nach 3 Aufnahmen ohne Checkout:
    score += 0
    → Nächster Checkout-Wert
```

### Result-Daten
```javascript
getResultData() → {
    summary: {
        totalScore: Number,
        checkoutsHit: Number,      // Wie viele geschafft
        checkoutsTotal: Number,    // Wie viele versucht
        checkoutRate: String,      // "70%"
        avgDartsPerCheckout: String // Durchschnitt Darts bei erfolgreichen
    },
    heatmap: { ... },
    chart: {
        labels: ['170', '130', '80', ...],
        datasets: [{
            label: 'Verbleibend',
            data: [0, 42, 0, ...]  // 0 = geschafft
        }]
    }
}
```

---

## 4. AUFGABE B: Halve It

### Spielregeln
- Feste Runden mit vorgegebenen Zielen
- Pro Runde 3 Darts auf das Ziel
- Triffst du das Ziel mindestens einmal → Score addieren
- Triffst du GAR NICHT → Score wird halbiert!
- Höchster Score am Ende gewinnt

### Standard-Ziele (10 Runden)
```javascript
const HALVE_IT_TARGETS = [
    { target: 20,  label: '20er',     check: (dart) => dart.base === 20 },
    { target: 19,  label: '19er',     check: (dart) => dart.base === 19 },
    { target: 18,  label: '18er',     check: (dart) => dart.base === 18 },
    { target: 'D', label: 'Doubles',  check: (dart) => dart.multiplier === 2 },
    { target: 17,  label: '17er',     check: (dart) => dart.base === 17 },
    { target: 16,  label: '16er',     check: (dart) => dart.base === 16 },
    { target: 'T', label: 'Triples',  check: (dart) => dart.multiplier === 3 },
    { target: 15,  label: '15er',     check: (dart) => dart.base === 15 },
    { target: 25,  label: 'Bull',     check: (dart) => dart.base === 25 },
    { target: 'A', label: 'Alles',    check: (dart) => !dart.isMiss }
];
```

### Settings
```javascript
let halveItSettings = {
    mode: 'standard',  // 'standard' (10 Runden), 'short' (6 Runden), 'custom'
};
```

### Dateiname
`js/games/halve-it.js`

### Keypad
**Pro-Keypad** — der Spieler wirft auf beliebige Felder, die Strategy prüft ob es ein Treffer ist.

### Export-Name
`export const HalveIt = { ... }`

### Scoring-Logik
```
start_score = 40  // Jeder startet mit 40
Für jede Runde:
    round_points = 0
    hit_count = 0
    
    Für jeden Dart (3):
        if target.check(dart):
            hit_count++
            round_points += dart.points
    
    if hit_count > 0:
        score += round_points
    else:
        score = Math.floor(score / 2)  // HALBIERT!
```

### Besonderheit: Multiplayer
Halve It ist primär ein Multiplayer-Spiel. Die Spieler spielen abwechselnd. Am Ende gewinnt der höchste Score.

### Result-Daten
```javascript
getResultData() → {
    summary: {
        totalScore: Number,
        halvings: Number,        // Wie oft halbiert
        perfectRounds: Number,   // Runden mit 3/3 Treffern
        hitRate: String          // Gesamt-Trefferquote
    },
    chart: {
        labels: ['20er', '19er', ...],
        datasets: [{
            label: 'Score-Verlauf',
            data: [40, 100, 50, ...]  // Score nach jeder Runde
        }]
    }
}
```

---

## 5. AUFGABE C: Trainingsplan-System

### Architektur

Ein Trainingsplan = eine Sequenz von Mini-Spielen. Der Plan-Runner koordiniert den Ablauf.

### Neue Datei: `js/core/training-plans.js`

```javascript
export const TRAINING_PLANS = [
    {
        id: 'warmup-routine',
        name: 'Warmup Routine',
        description: 'Lockerung, Fokus, Board-Gefühl aufbauen',
        estimatedMinutes: 15,
        blocks: [
            {
                gameId: 'around-the-board',
                label: 'Board-Gefühl: Around the Board',
                settings: { direction: 'ascending', variant: 'full' },
                description: 'Einmal rund um das Board. Locker werfen, Rhythmus finden.'
            },
            {
                gameId: 'single-training',
                label: 'Präzision: Single Training',
                settings: { mode: 'random' },
                description: 'Zufällige Ziele treffen. Fokus auf Genauigkeit.'
            },
            {
                gameId: 'bobs27',
                label: 'Doubles: Bobs 27',
                settings: {},
                description: 'Doubles unter Druck. Guter Abschluss für das Warmup.'
            }
        ]
    },
    {
        id: 'scoring-drills',
        name: 'Scoring Drills',
        description: 'T20, T19, T18 intensiv trainieren',
        estimatedMinutes: 20,
        blocks: [
            {
                gameId: 'scoring-drill',
                label: 'Triple 20 (10 Aufnahmen)',
                settings: { target: 20, rounds: 10 },
                description: '10 Aufnahmen à 3 Darts auf T20. Ziel: Möglichst viele Treffer.'
            },
            {
                gameId: 'scoring-drill',
                label: 'Triple 19 (10 Aufnahmen)',
                settings: { target: 19, rounds: 10 },
                description: '10 Aufnahmen à 3 Darts auf T19. Ausweichziel trainieren.'
            },
            {
                gameId: 'scoring-drill',
                label: 'Triple 18 (10 Aufnahmen)',
                settings: { target: 18, rounds: 10 },
                description: '10 Aufnahmen à 3 Darts auf T18. Dritte Scoring-Option.'
            }
        ]
    }
];
```

### Neues Mini-Spiel für Scoring Drills: `js/games/scoring-drill.js`

Dieses Spiel ist speziell für das fokussierte Training eines einzelnen Segments:

```javascript
export const ScoringDrill = {
    config: {
        hasOptions: true,
        description: "Fokussiertes Training auf ein einzelnes Triple-Segment.",
        mode: 'pro',
        defaultProInput: true
    },

    generateTargets(options) {
        // z.B. [20, 20, 20, ...] (10× die gleiche Zahl)
        const target = options.target || 20;
        const rounds = options.rounds || 10;
        return Array(rounds).fill(target);
    },

    initPlayer(player, options, targets) {
        player.score = 0;
        player.totalDarts = 0;
        player.tripleHits = 0;
        player.singleHits = 0;
        player.misses = 0;
    },

    handleInput(session, player, dart) {
        const target = session.targets[player.turns.length]; // Aktuelles Ziel
        const dartsInTurn = session.tempDarts.length;

        player.totalDarts++;

        // Zähle Treffer-Typen
        if (dart.base === target) {
            if (dart.multiplier === 3) player.tripleHits++;
            else player.singleHits++;
            player.score += dart.points;
        } else if (!dart.isMiss) {
            // Anderes Segment getroffen (kein Miss, aber falsches Feld)
            player.score += dart.points;
        } else {
            player.misses++;
        }

        session.tempDarts.push(dart);

        // 3 Darts = Aufnahme beendet
        if (session.tempDarts.length >= 3) {
            const roundIdx = player.turns.length;
            
            if (roundIdx + 1 >= session.targets.length) {
                return { action: 'FINISH_GAME', overlay: { text: 'FERTIG!', type: 'check' } };
            }
            
            const turnScore = session.tempDarts.reduce((s, d) => s + d.points, 0);
            return {
                action: 'NEXT_TURN',
                overlay: { text: String(turnScore), type: turnScore >= target * 3 ? '180' : 'score' },
                delay: 800
            };
        }

        return { action: 'CONTINUE' };
    },

    getResultData(session, player) {
        const target = session.targets[0]; // Alle gleich
        const heatmap = {};
        
        player.turns.forEach(t => {
            (t.darts || []).forEach(d => {
                if (d.segment && !d.isMiss) {
                    heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
                }
            });
        });

        const tripleRate = player.totalDarts > 0
            ? ((player.tripleHits / player.totalDarts) * 100).toFixed(1)
            : '0';

        return {
            summary: {
                totalScore: player.score,
                target: `T${target}`,
                tripleHits: player.tripleHits,
                tripleRate: tripleRate + '%',
                totalDarts: player.totalDarts,
                avgPerRound: (player.score / (player.turns.length || 1)).toFixed(1)
            },
            heatmap
        };
    }
};
```

### Plan-Runner Integration

Der Plan-Runner nutzt die bestehende Grundstruktur in `state.js` (`startTrainingPlan`, `advancePlanBlock`). Was du tun musst:

**In `state.js`** — Prüfe ob `startTrainingPlan(planId)` und `advancePlanBlock()` existieren. Falls ja, nutze sie. Falls nicht, implementiere sie so:

```javascript
// In state.js:
let activePlan = null;
let activePlanIndex = 0;

startTrainingPlan(planId) {
    const plan = TRAINING_PLANS.find(p => p.id === planId);
    if (!plan) return;
    activePlan = plan;
    activePlanIndex = 0;
    return plan.blocks[0]; // Erster Block
},

advancePlanBlock() {
    activePlanIndex++;
    if (activePlanIndex >= activePlan.blocks.length) {
        const result = { finished: true, plan: activePlan };
        activePlan = null;
        activePlanIndex = 0;
        return result;
    }
    return { finished: false, block: activePlan.blocks[activePlanIndex] };
},

getActivePlan() { return activePlan; },
getActivePlanIndex() { return activePlanIndex; }
```

**In `ui-core.js`** — Der `btn-finish-game` Handler hat bereits auskommentierten Training-Plan-Code. Aktiviere ihn:

```javascript
// In ui-core.js, btn-finish-game Handler:
const activePlan = State.getActivePlan();
if (activePlan) {
    const result = State.advancePlanBlock();
    if (result.finished) {
        this.showMatchModal("TRAINING BEENDET", "Alle Blöcke absolviert!", "ZUM MENÜ", 
            () => this.showScreen('screen-dashboard'));
    } else {
        Setup.loadNextTrainingBlock();
    }
} else {
    this.showScreen('screen-dashboard');
}
```

---

## 6. Registrierung neuer Spiele (Checkliste)

Für JEDES neue Spiel diese Dateien anpassen:

### A) `js/games/game-engine.js`

```javascript
// 1. Import hinzufügen:
import { CheckoutChallenge } from './checkout-challenge.js';
import { HalveIt } from './halve-it.js';
import { ScoringDrill } from './scoring-drill.js';

// 2. In der strategies Map (suche nach "const strategies = {"):
const strategies = {
    'x01': X01,
    'cricket': Cricket,
    // ... bestehende ...
    'checkout-challenge': CheckoutChallenge,   // NEU
    'halve-it': HalveIt,                       // NEU
    'scoring-drill': ScoringDrill,             // NEU
};
```

### B) `js/ui/ui-core.js`

```javascript
// In GAME_NAMES:
const GAME_NAMES = {
    'x01': 'X01 Match',
    // ... bestehende ...
    'checkout-challenge': 'Checkout Challenge',   // NEU
    'halve-it': 'Halve It',                       // NEU
    'scoring-drill': 'Scoring Drill',             // NEU
};
```

### C) `js/ui/ui-game.js`

In der `updateGameDisplay()` Dispatch-Logik, ergänze Cases für die neuen Spiele. Du kannst bestehende Renderer als Vorlage nutzen:

- **Checkout Challenge** → Ähnlich wie X01 (`_renderX01`), zeige remaining + checkout-value
- **Halve It** → Ähnlich wie Shanghai (`_renderShanghai`), zeige aktuelles Ziel + Score
- **Scoring Drill** → Ähnlich wie Single Training (`_renderTraining`), zeige Target + Triple-Count

### D) `js/ui/ui-keyboard.js`

Checkout Challenge und Halve It nutzen das **Pro-Keypad** (existiert bereits).
Scoring Drill nutzt ebenfalls das **Pro-Keypad**.

→ Kein neues Keypad-Layout nötig, aber stelle sicher dass der Keypad-Dispatch den neuen gameId erkennt und Pro zuweist.

### E) `js/ui/ui-setup.js`

Für Setup-Options der neuen Spiele, füge Render-Funktionen hinzu:

```javascript
// In _renderSetupOptions(), nach den bestehenden else-if:
else if (selectedGameType === 'checkout-challenge') {
    _renderCheckoutChallengeOptions(c);
}
else if (selectedGameType === 'halve-it') {
    _renderHalveItOptions(c);
}
```

Und implementiere die entsprechenden `_renderXxxOptions(container)` Funktionen analog zu den bestehenden (siehe `_renderShanghaiOptions` als Vorlage).

---

## 7. Test-Checkliste

Für JEDES neue Spiel:

1. ☐ Spiel im Dashboard/Game-Selector sichtbar?
2. ☐ Setup-Screen mit korrekten Optionen?
3. ☐ Spiel starten → 3 Darts werfen → Dart-Boxes korrekt?
4. ☐ Turn beenden → Score korrekt? Overlay korrekt?
5. ☐ Undo → Vorheriger Zustand wiederhergestellt?
6. ☐ Spiel beenden → Result-Screen korrekt?
7. ☐ Stats-Seite → Neues Spiel in der Match-Liste?
8. ☐ Multiplayer → Spielerwechsel korrekt?
9. ☐ Heatmap → Korrekte Segmente eingefärbt?

Für Trainingspläne:
1. ☐ Plan starten → Erster Block wird geladen?
2. ☐ Block beenden → Nächster Block startet automatisch?
3. ☐ Letzter Block → "Training beendet" Modal erscheint?
4. ☐ Jeder Block speichert separat in Firebase?

---

## 8. Dateiübersicht (was du abliefern musst)

```
NEUE DATEIEN:
  js/games/checkout-challenge.js     ← Checkout Challenge Strategy
  js/games/halve-it.js               ← Halve It Strategy
  js/games/scoring-drill.js          ← Scoring Drill Strategy (für Trainingspläne)
  js/core/training-plans.js          ← Plan-Definitionen (Warmup + Scoring)

GEÄNDERTE DATEIEN (nur ergänzen, nicht umschreiben):
  js/games/game-engine.js            ← 3 Imports + 3 Map-Einträge
  js/ui/ui-core.js                   ← 3 GAME_NAMES Einträge
  js/ui/ui-game.js                   ← 3 Render-Cases in updateGameDisplay()
  js/ui/ui-setup.js                  ← 2 Options-Render-Funktionen + Settings
  js/core/state.js                   ← Training-Plan Runner aktivieren (falls nötig)
```

---

## 9. Coding-Style

- Vanilla JavaScript, ES Modules (`export const ...`)
- Keine externen Dependencies (kein lodash, kein jQuery)
- Inline-Styles vermeiden — nutze bestehende CSS-Klassen
- Deutsche Kommentare sind OK, Variablennamen auf Englisch
- Kein `var` — nur `const` und `let`
- Kein `async/await` in Strategies (nur synchrone Logik)
- Console.log nur für Debugging, nicht in Production-Code lassen
