# Management-Screen: Integration Guide

## Übersicht

Die neue `ui-mgmt.js` ersetzt die bisherige Verwaltungsseite komplett. Sie bietet 4 Tabs:

| Tab | Inhalt |
|---|---|
| ⚙️ Einstellungen | Overlay-Dauer, Sprachausgabe, Spielvorgaben für alle 6 Spiele |
| 💾 Datenbank | Spieler verwalten, Historie, Firebase-Info (bisherige Funktionalität) |
| 💡 Lichtsteuerung | Hue Bridge verbinden, Effekte konfigurieren & testen |
| 📡 Autodarts | Status, Anleitung, Datenformat (Info-only, wartet auf Hardware) |

---

## 1. Dateien

### ERSETZEN:
```
js/ui/ui-mgmt.js     ← Komplett ersetzen mit neuer Version
```

### NEU:
```
css/mgmt.css          ← Neues Stylesheet
```

---

## 2. index.html

### CSS einbinden (nach den bestehenden CSS-Dateien):
```html
<link rel="stylesheet" href="css/mgmt.css">
```

### HTML-Container prüfen:
Der Management-Screen braucht nur einen leeren Container:
```html
<div id="screen-mgmt" class="screen" style="display:none;">
    <div id="management-container"></div>
</div>
```
Falls dort noch alter HTML-Code steht, kann er entfernt werden — `ui-mgmt.js` rendert alles dynamisch.

---

## 3. Imports in ui-mgmt.js

Die neue Version importiert zusätzlich:
```javascript
import { Store } from '../core/store.js';          // Für Firebase-User-Info
import { HueService } from '../core/hue-service.js'; // Für Hue-Tab
import { AutodartsService } from '../core/autodarts-service.js'; // Für Autodarts-Tab
```

Falls die bisherige `ui-mgmt.js` nur `State` und `UI` importiert hat, sind diese neuen Imports der einzige Unterschied in der Einbindung.

---

## 4. Aufruf (keine Änderung nötig)

Die API bleibt identisch:
```javascript
Management.init();  // Beim Anzeigen des Verwaltungs-Screens
```

---

## 5. Settings-API (NEU)

Die neue `ui-mgmt.js` exportiert eine `getSettings()`-Methode:
```javascript
import { Management } from './ui-mgmt.js';

const settings = Management.getSettings();
// settings.overlayDuration      → 1200 (ms)
// settings.speechEnabled        → false
// settings.defaults.x01         → { startScore: 501, doubleOut: true, bestOf: 3, ... }
// settings.defaults.cricket     → { spRounds: 20, mode: 'standard' }
// settings.defaults.shanghai    → { mode: 'ascending', length: 'standard' }
// settings.defaults['single-training'] → { mode: 'ascending' }
// settings.defaults['around-the-board'] → { variant: 'full', direction: 'ascending' }
// settings.hue.effectDuration   → { hit: 500, miss: 500, highScore: 4000, oneEighty: 8000 }
```

### Wo diese Settings nutzen:

**A) Overlay-Dauer in game-engine.js:**
```javascript
// Bisher vermutlich hart-codiert:
const OVERLAY_DURATION = 1200;

// Neu:
import { Management } from '../ui/ui-mgmt.js';
const overlayMs = Management.getSettings().overlayDuration;
```

**B) Spielvorgaben im Setup-Screen (ui-setup.js):**
```javascript
// Wenn ein Spiel geöffnet wird, die Defaults als Startwerte laden:
import { Management } from './ui-mgmt.js';

function _getDefaultSettings(gameId) {
    const defaults = Management.getSettings().defaults;
    return defaults[gameId] || {};
}
```
Das ist optional — die Defaults werden nur vorbelegt, der Spieler kann sie im Setup ändern.

**C) Hue Effekt-Dauer:**
Die Effekt-Dauer-Slider sind bereits in der UI, aber die Werte müssen noch an den HueService durchgereicht werden. Da der HueService aktuell feste Timeouts hat (z.B. `setTimeout(() => ..., 4000)` für HIGH_SCORE), müsste man dort die Werte aus den Settings lesen:

```javascript
// In hue-service.js, trigger():
case 'HIGH_SCORE':
    this._put(null, { on: true, ...COLORS.party, alert: 'lselect' });
    // Bisher: setTimeout(() => this.setMood('warm'), 4000);
    // Neu: Duration aus Settings lesen
    const dur = JSON.parse(localStorage.getItem('dc_app_settings') || '{}');
    const ms = dur?.hue?.effectDuration?.highScore || 4000;
    setTimeout(() => this.setMood('warm'), ms);
    break;
```

Das ist ein optionaler nächster Schritt — die Settings werden bereits gespeichert, die Anbindung an den HueService kann schrittweise erfolgen.

---

## 6. Was sich geändert hat vs. alte ui-mgmt.js

| Feature | Alt | Neu |
|---|---|---|
| Tabs | Keine (nur Spieler-Liste) | 4 Tabs |
| Spielerverwaltung | ✅ | ✅ (Tab "Datenbank") |
| Historie löschen | ✅ | ✅ (mit Farbbalken + Tags) |
| Spieler umbenennen | `prompt()` | Inline-Editing |
| Spieler löschen | `confirm()` | `UI.showConfirm()` Modal |
| History-Filter | ✅ Select | ✅ Select |
| Hue Config | ❌ | ✅ Discover + Connect + Test |
| Effekt-Dauer | ❌ | ✅ Slider pro Effekt |
| Spielvorgaben | ❌ | ✅ Alle 6 Spiele |
| Overlay-Dauer | ❌ | ✅ Slider |
| Sprachausgabe | ❌ | ✅ Toggle |
| Autodarts Info | ❌ | ✅ Status + Anleitung |
| Firebase Info | ❌ | ✅ User + Verbindungsstatus |

---

## 7. Persistenz

Settings werden in `localStorage` unter dem Key `dc_app_settings` gespeichert.
Jede Änderung speichert sofort (kein "Speichern"-Button nötig).
Beim ersten Laden werden `DEFAULT_SETTINGS` verwendet.
Neue Setting-Felder werden automatisch gemergt (deep merge).
