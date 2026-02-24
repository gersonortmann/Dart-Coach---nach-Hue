/**
 * lighting-coordinator.js
 *
 * Übersetzt Dart-Events → WLED-Effekte.
 * Hue wird hier bewusst ignoriert (nur WLED-Ring aktiv).
 */

import { EventBus }    from './event-bus.js';
import { HueService }  from './hue-service.js';
import { WledService } from './wled-service.js';

// ── EVENT → EFFEKT MAPPING ────────────────────────────────────────────────────

function _handleGameEvent(data) {

    // ── Game gestartet: Kaltweiß aktivieren ─────────────────────────────────
    if (data.type === 'game-started') {
        WledService.setMood('screen-game');
        return;
    }

    // ── Korrektur-Fenster: Amber synchron zum UI-Countdown ───────────────────
    if (data.type === 'correction-window') {
        // dur kommt aus game-engine (identisch zum UI-Balken)
        WledService.trigger('CORRECTION', data.duration);
        return;
    }

    // ── Korrektur-Fenster abgelaufen: sofort zu Kaltweiß ────────────────────
    if (data.type === 'correction-window-end') {
        WledService.cancelEffect();
        return;
    }

    if (data.type !== 'input-processed') return;

    const { overlay, action, lastTurnScore, dart } = data;

    // ── Match gewonnen ───────────────────────────────────────────────────────
    if (action === 'WIN_MATCH') {
        setTimeout(() => WledService.trigger('WIN'), 300);
        setTimeout(() => WledService.setMood('screen-result'), 5500);
        return;
    }

    // ── Highscores (höchste Priorität vor Overlay) ───────────────────────────
    if (lastTurnScore === 180) {
        WledService.trigger('180');
        return;
    }
    if (lastTurnScore >= 100) {
        WledService.trigger('HIGH_SCORE');
        return;
    }

    // ── Overlay-basierte Events ──────────────────────────────────────────────
    if (overlay) {
        const t = overlay.type;
        
        if (t === 'check') {
            WledService.trigger('CHECK');
            return;
        } 
        if (t === 'bust') {
            WledService.trigger('BUST');
            return;
        } 
        if (t === 'miss') {
            WledService.trigger('MISS');
            return;
        }
        if (t === 'cricket-open') {
            WledService.trigger('CRICKET_OPEN');
            return;
        }
        if (t === 'cricket-closed') {
            WledService.trigger('CRICKET_CLOSE');
            return;
        }

        // ── HIER IST DIE KORREKTUR ──
        if (t === 'hit' || t === 'standard' || t === 'cricket-hit') {
            // Das Overlay sagt zwar "Standard" (weil Punkte in der Summe da sind),
            // aber wir prüfen, ob der *letzte* Dart spezifisch daneben ging.
            
            // Fall A: Spiel nutzt logisches _isHit (ATB, Training, Shanghai)
            if (dart && typeof dart._isHit === 'boolean' && !dart._isHit) {
                WledService.trigger('MISS');
            }
            // Fall B: Dart hat das Board komplett verfehlt (aber Overlay ist da, weil vorher Punkte kamen)
            else if (dart && dart.isMiss) {
                WledService.trigger('MISS');
            }
            // Fall C: Alles gut -> Grün
            else {
                WledService.trigger('HIT');
            }
            return;
        }
    }

    // ── Einzelne Darts ohne Overlay (zwischen den Würfen) ────────────────────
    if (dart) {
        // 1. Logische Prüfung: Hat das Spiel den Wurf als Treffer markiert?
        // Das nutzen ATB und SingleTraining (isHit = false bei falschem Segment)
        if (typeof dart._isHit === 'boolean') {
            if (dart._isHit) {
                WledService.trigger('HIT');
            } else {
                // Das hier löst deinen konfigurierten "Fehlwurf"-Effekt aus (Rot)
                WledService.trigger('MISS');
            }
            return;
        }

        // 2. Fallback: Wenn das Spiel keine Logik liefert (z.B. X01 Standardwurf)
        // Prüfen wir nur, ob das Board getroffen wurde.
        if (dart.isMiss) {
            WledService.trigger('MISS');
        } else {
            WledService.trigger('HIT');
        }
    }
}

function _handleScreenChanged({ screen }) {
    // Während eines Spiels den Screen-Mood NICHT überschreiben
    // (WLED bleibt auf Kaltweiß/Effekt, bis das Spiel endet)
    if (screen === 'screen-game') return; // game-started Event setzt Kaltweiß
    WledService.setMood(screen);
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

export const LightingCoordinator = {

    async init() {
        await Promise.all([
            HueService.init(),
            WledService.init(),
        ]);
        EventBus.on('SCREEN_CHANGED', _handleScreenChanged);
        EventBus.on('GAME_EVENT',     _handleGameEvent);
        console.log('[LightingCoordinator] Initialisiert ✓');
    },

    setMood(screenId)  { WledService.setMood(screenId); },
    trigger(eventId)   { WledService.trigger(eventId); },

    getStatus() {
        return {
            hue:  HueService.getStatusInfo(),
            wled: WledService.getStatusInfo(),
        };
    },

    onStatusChange(callback) {
        let last = JSON.stringify(this.getStatus());
        setInterval(() => {
            const cur = JSON.stringify(this.getStatus());
            if (cur !== last) { last = cur; callback(this.getStatus()); }
        }, 3000);
    },
};
