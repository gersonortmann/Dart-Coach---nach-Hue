/**
 * Killer Strategy
 *
 * Phase 1 – Eigene Zahl in der gewählten Zone treffen → „Killer" werden.
 * Phase 2 – Zahl der Gegner (gleiche Zone) treffen → Leben abziehen.
 *           Mit Shield: eigene Zahl treffen → Leben zurückgewinnen.
 * Letzter Überlebender gewinnt.
 *
 * Solo-Modus: X Runden (default 9), Score = Kills.
 *
 * Optionen:
 *   zone   : 'any' | 'single' | 'double' | 'triple'  (default: 'double')
 *   shield : true | false                             (default: false)
 *   lives  : 3 | 5 | 7                               (default: 3)
 */

// Modul-Level Zähler für sequentielle Nummernvergabe (wird in generateTargets zurückgesetzt)
let _initCounter = 0;

function _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/**
 * Prüft ob ein Dart die Ziel-Zahl in der geforderten Zone trifft.
 * zone 'any' = jede Zone (S/D/T) zählt; Bull: 25 (single) und 50 (double) beide ok.
 */
function _isZoneHit(dart, number, zone) {
    if (dart.isMiss || dart.base !== number) return false;
    if (zone === 'any')    return true;
    if (zone === 'single') return dart.multiplier === 1;
    if (zone === 'double') return dart.multiplier === 2;
    if (zone === 'triple') return dart.multiplier === 3;
    return false;
}

/** Kurz-Label für die Zone (für Overlays und Targetbox) */
function _zonePrefix(zone, number) {
    if (zone === 'double') return `D${number}`;
    if (zone === 'triple') return `T${number}`;
    return String(number); // 'any' und 'single' → nur Zahl
}

export const Killer = {

    config: {
        hasOptions: true,
        description: 'Triff dein Feld – werde Killer! Dann eliminiere die Gegner. Optionale Schutzregel: eigenes Feld = Leben zurück.',
        mode: 'pro',
        defaultProInput: true,
    },

    generateTargets(options) {
        _initCounter = 0;
        return _shuffle([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20]);
    },

    initPlayer(player, options, targets) {
        player.killerNumber  = targets[_initCounter % 20];
        _initCounter++;

        player.isKiller      = false;
        player.lives         = options.lives  ?? 3;
        player._maxLives     = options.lives  ?? 3; // für Shield-Cap
        player.kills         = 0;
        player.shields       = 0;                   // Anzahl erfolgreich abgewehrter Angriffe
        player.dartsToKiller = -1;

        player.liveKillerStatus = '';
        player.turns = [];
    },

    handleInput(session, player, dart) {
        dart._isHit = false;
        session.tempDarts.push(dart);

        const zone   = session.settings?.zone   ?? 'double';
        const shield = session.settings?.shield ?? false;

        let overlayText = null;
        let overlayType = 'miss';

        if (!dart.isMiss) {
            if (!player.isKiller) {
                // ── Phase 1: Eigene Zahl in der Zone treffen → Killer werden ──
                if (_isZoneHit(dart, player.killerNumber, zone)) {
                    player.isKiller      = true;
                    dart._isHit          = true;
                    player.dartsToKiller = this._countAllDarts(session, player) + session.tempDarts.length;
                    overlayText = 'KILLER! 🔪';
                    overlayType = 'hit';
                }
            } else {
                // ── Shield: eigene Zahl treffen → Leben zurück ───────────────
                if (shield && _isZoneHit(dart, player.killerNumber, zone)) {
                    dart._isHit = true;
                    if (player.lives < player._maxLives) {
                        player.lives++;
                        player.shields++;
                        overlayText = `🛡️ +1 Leben`;
                        overlayType = 'hit';
                    } else {
                        // Bereits voll – Treffer anerkennen, aber kein Bonus
                        overlayText = `🛡️ Voll`;
                        overlayType = 'hit';
                    }
                } else {
                    // ── Phase 2: Gegner treffen ──────────────────────────────
                    const victim = session.players.find(p =>
                        !p.finished && p.id !== player.id &&
                        _isZoneHit(dart, p.killerNumber, zone)
                    );
                    if (victim) {
                        dart._isHit = true;
                        victim.lives--;
                        player.kills++;
                        if (victim.lives <= 0) {
                            victim.lives    = 0;
                            victim.finished = true;
                            overlayText     = `${victim.name} ☠️`;
                            overlayType     = 'hit';
                        } else {
                            const hearts = '❤️'.repeat(victim.lives);
                            overlayText  = `${victim.name} ${hearts}`;
                            overlayType  = 'hit';
                        }
                    }
                }
            }
        }

        // Darts 1 & 2: weiterwerfen
        if (session.tempDarts.length < 3) {
            return { action: 'CONTINUE', overlay: overlayText ? { text: overlayText, type: overlayType } : null };
        }

        // ── Aufnahme beendet ─────────────────────────────────────────────────
        this._saveTurn(player, session.tempDarts);

        // Solo-Modus: nach N Runden enden
        const isSolo    = session.players.length === 1;
        const soloRounds = session.settings?.soloRounds ?? 9;
        if (isSolo && player.turns.length >= soloRounds) {
            return { action: 'WIN_MATCH', overlay: { text: 'FERTIG!', type: 'check' }, delay: 2000 };
        }

        // Multiplayer: noch 1 aktiver Spieler übrig?
        const active = session.players.filter(p => !p.finished);
        if (!isSolo && active.length <= 1) {
            return { action: 'WIN_MATCH', overlay: { text: '🏆 SIEG!', type: 'check' }, delay: 2000 };
        }

        return {
            action: 'NEXT_TURN',
            overlay: overlayText ? { text: overlayText, type: overlayType } : null,
            delay:   overlayText ? 1500 : 500,
        };
    },

    _countAllDarts(session, player) {
        return player.turns.reduce((a, t) => a + (t.darts?.length || 0), 0);
    },

    _saveTurn(player, darts) {
        player.turns.push({ darts: [...darts] });
    },

    handleWinLogik(session, player) {
        const isSolo = session.players.length === 1;
        const zone   = session.settings?.zone ?? 'double';
        const zoneLabel = { any:'Any', single:'Single', double:'Double', triple:'Triple' }[zone] || 'Double';
        if (isSolo) {
            const dtk = player.dartsToKiller > 0 ? `Killer nach ${player.dartsToKiller} Darts.` : 'Nicht Killer geworden.';
            return {
                messageTitle:   'TRAINING BEENDET',
                messageBody:    `${player.name} · ${zoneLabel} · ${dtk} ${player.kills} virtuelle Kills.`,
                nextActionText: 'STATISTIK',
            };
        }

        const winner = session.players.find(p => !p.finished) || player;
        return {
            messageTitle:   'KILLER! 🔪',
            messageBody:    `${winner.name} ist der letzte Überlebende!`,
            nextActionText: 'STATISTIK',
        };
    },

    getResultData(session, player) {
        const totalDarts = player.turns.reduce((a, t) => a + (t.darts?.length || 0), 0);
        const survived   = !player.finished;
        const zone       = session.settings?.zone   ?? 'double';
        const shield     = session.settings?.shield ?? false;

        const allPlayersData = session.players.map(p => ({
            name:          p.name,
            killerNumber:  p.killerNumber,
            zoneLabel:     _zonePrefix(zone, p.killerNumber),
            isKiller:      p.isKiller,
            kills:         p.kills || 0,
            shields:       p.shields || 0,
            lives:         p.lives,
            survived:      !p.finished,
            dartsToKiller: p.dartsToKiller,
        })).sort((a, b) => {
            if (a.survived !== b.survived) return a.survived ? -1 : 1;
            return b.kills - a.kills;
        });

        // Heatmap
        const heatmap = {};
        player.turns.flatMap(t => t.darts || []).forEach(d => {
            if (!d.isMiss && d.segment) heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
        });

        return {
            summary: {
                survived,
                isKiller:      player.isKiller,
                kills:         player.kills || 0,
                shields:       player.shields || 0,
                lives:         player.lives,
                dartsToKiller: player.dartsToKiller,
                totalDarts,
                zone,
                shield,
            },
            killerNumber: player.killerNumber,
            zoneLabel:    _zonePrefix(zone, player.killerNumber),
            allPlayers:   allPlayersData,
            heatmap,
        };
    },
};