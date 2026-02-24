import { State } from '../core/state.js'; 
import { EventBus } from '../core/event-bus.js';
import { normalizeDart } from '../core/dart-model.js';
import { X01 } from './x01.js';
import { SingleTraining } from './single-training.js';
import { Shanghai } from './shanghai.js';
import { Bobs27 } from './bobs27.js';
import { Cricket } from './cricket.js';
import { AroundTheBoard } from './around-the-board.js';
import { CheckoutChallenge } from './checkout-challenge.js';
import { HalveIt } from './halve-it.js';
import { ScoringDrill } from './scoring-drill.js';
import { UI } from '../ui/ui-core.js';
import { Management } from '../ui/ui-mgmt.js';

const STRATEGY_MAP = {
    'x01': X01, 'single-training': SingleTraining, 'shanghai': Shanghai,
    'bobs27': Bobs27, 'cricket': Cricket, 'around-the-board': AroundTheBoard,
    'checkout-challenge': CheckoutChallenge, 'halve-it': HalveIt, 'scoring-drill': ScoringDrill
};

let isLocked = false;
let lastInputTime = 0;

// ── Correction window ────────────────────────────────────────────────────────
// Aktiver Timer nach Dart 3 in dem Korrekturen noch möglich sind.
// Keypad-Inputs werden geblockt, Dartbox-Klicks bleiben aktiv.
let _correctionTimer = null;

// ── Held Darts ───────────────────────────────────────────────────────────────
// Darts die nach einer Korrektur in Originalposition gehalten werden,
// bis der neue Dart eingegeben wurde.
let _heldDarts = null;
let _applyingHeldDarts = false;

// ── Letztes Turn-End-Result speichern für Neustart des Korrektur-Fensters ───
let _lastTurnEndResult = null;
let _lastTurnEndContext = null;
// Letztes Ergebnis aus onInput – für held-dart Loop nach Korrektur
let _lastAppliedResult = null;
// Aufgeschobenes Turn-Ende während Held-Dart Re-Application
let _deferredTurnEnd = null;

function _getStrategy(gameId) { return STRATEGY_MAP[gameId] || null; }

function _getCurrentTarget(session) {
    const player = session.players[session.currentPlayerIndex];
    return session.targets?.[player.turns.length] ?? null;
}

function _pushUndoState(session) {
    if (!session.historyStack) session.historyStack = [];
    const snap = JSON.stringify({
        pIdx: session.currentPlayerIndex,
        rIdx: session.roundIndex,
        turnTotal: session.turnTotalIndex,
        players: session.players,
        tempDarts: session.tempDarts,
    });
    session.historyStack.push(snap);
    if (session.historyStack.length > 50) session.historyStack.shift();
}

function _cancelCorrectionWindow() {
    if (_correctionTimer) { clearTimeout(_correctionTimer); _correctionTimer = null; }
    UI.cancelCorrectionCountdown();
}

function _triggerAnimation(type, duration, callback) {
    isLocked = true;
    let ms = duration;
    if (!ms) { try { ms = Management.getSettings().overlayDuration || 1200; } catch(e) { ms = 1200; } }
    State.updateSessionState({ animation: type });
    UI.updateGameDisplay();
    setTimeout(() => {
        State.updateSessionState({ animation: null });
        isLocked = false;
        UI.updateGameDisplay();
        if (callback) callback();
    }, ms);
}

function _nextTurn(session) {
    isLocked = true;
    // Korrektur-Markierung für neue Aufnahme zurücksetzen
    UI.markDartBoxCorrected(null);
    let nextPIdx = (session.currentPlayerIndex + 1) % session.players.length;
    const allFinished = session.players.every(p => p.finished);
    if (allFinished) { isLocked = false; UI.showResult(); return; }
    let loopCount = 0;
    while (session.players[nextPIdx].finished && loopCount < session.players.length) {
        nextPIdx = (nextPIdx + 1) % session.players.length;
        loopCount++;
    }
    let nextRoundIndex = session.roundIndex;
    if (nextPIdx === 0) nextRoundIndex++;
    State.updateSessionState({
        currentPlayerIndex: nextPIdx,
        turnTotalIndex: (session.turnTotalIndex || 0) + 1,
        roundIndex: nextRoundIndex,
        tempDarts: []
    });
    isLocked = false;
    UI.updateGameDisplay();
}

/**
 * Führt die Spiel-Action nach dem Korrektur-Fenster aus.
 * Wird entweder direkt oder nach dem Timer aufgerufen.
 */
function _executeAction(result, session, player, strategy, overlayMs) {
    switch (result.action) {
        case 'BUST':
            _triggerAnimation('BUST', overlayMs + 300, () => {
                State.updateSessionState({ tempDarts: [] });
                _nextTurn(session);
            });
            break;
        case 'WIN_LEG':
        case 'WIN_MATCH':
            _triggerAnimation('CHECK', 1000, () => {
                if (result.suppressModal && result.action === 'WIN_MATCH') {
                    player.finished = true; UI.showResult(); return;
                }
                let matchStatus = { isMatchOver: result.action === 'WIN_MATCH' };
                if (strategy.handleWinLogik) {
                    matchStatus = strategy.handleWinLogik(session, player, result);
                } else {
                    matchStatus.messageTitle = result.action === 'WIN_MATCH' ? 'SIEG!' : 'RUNDE GEWONNEN';
                    matchStatus.messageBody  = `${player.name} hat es geschafft!`;
                    matchStatus.nextActionText = result.action === 'WIN_MATCH' ? 'STATISTIK' : 'WEITER';
                }
                if (result.action === 'WIN_MATCH') {
                    player.finished = true;
                    UI.showMatchModal(matchStatus.messageTitle, matchStatus.messageBody, matchStatus.nextActionText, () => UI.showResult());
                } else {
                    UI.showMatchModal(matchStatus.messageTitle, matchStatus.messageBody, matchStatus.nextActionText, () => GameEngine.resetLeg(session, strategy));
                }
            });
            break;
        case 'NEXT_TURN':
            _nextTurn(session);
            break;
        case 'FINISH_GAME':
            if (session.players.every(p => p.finished)) UI.showResult();
            else _nextTurn(session);
            break;
        case 'CONTINUE':
        default:
            UI.updateGameDisplay();
            break;
    }
}

export const GameEngine = {

    hasOptions(gameType) {
        return _getStrategy(gameType)?.config?.hasOptions ?? false;
    },

    getResultData(session, player) {
        return _getStrategy(session.gameId)?.getResultData?.(session, player) ?? null;
    },

    getGameConfig(gameType) {
        return _getStrategy(gameType)?.config ?? null;
    },

    getCheckoutGuide(score, dartsLeftInTurn) {
        const session = State.getActiveSession();
        if (!session) return "";
        const s = _getStrategy(session.gameId);
        return typeof s?.getCheckoutGuide === 'function' ? s.getCheckoutGuide(score, dartsLeftInTurn) : "";
    },

    /** Liefert die aktuell gehaltenen Darts für die UI-Darstellung */
    getHeldDarts() { return _heldDarts; },

    startGame(gameType, selectedPlayerIds, gameOptions) {
        EventBus.emit('GAME_EVENT', { type: 'game-started' });
        const strategy = _getStrategy(gameType);
        if (!strategy) return;

        // Alle Korrektur-States zurücksetzen
        _cancelCorrectionWindow();
        isLocked = false;
        _heldDarts = null;
        _applyingHeldDarts = false;

        const targets = strategy.generateTargets ? strategy.generateTargets(gameOptions) : [];
        State.createSession(gameType, gameOptions, selectedPlayerIds);
        const session = State.getActiveSession();
        session.players.forEach(p => { if (strategy.initPlayer) strategy.initPlayer(p, gameOptions, targets); });
        State.updateSessionState({ targets, roundIndex: 0, turnTotalIndex: 0, tempDarts: [], historyStack: [], animation: null });
        UI.switchToGame();
    },

    onInput(value) {
        // Blockiert während Korrektur-Fenster (nur Dartbox-Klicks via undoSpecificDart erlaubt)
        if (_correctionTimer && !_applyingHeldDarts) return;
        if (isLocked && !_applyingHeldDarts) return;

        const now = Date.now();
        if (!_applyingHeldDarts && now - lastInputTime < 200) return;
        if (!_applyingHeldDarts) lastInputTime = now;

        const session = State.getActiveSession();
        if (!session || session.status !== 'running') return;
        const strategy = _getStrategy(session.gameId);
        if (!strategy) return;

        _pushUndoState(session);

        const pIdx   = session.currentPlayerIndex;
        const player = session.players[pIdx];
        if (player.finished) { _nextTurn(session); return; }

        const target = _getCurrentTarget(session);
        const dart = normalizeDart(value, {
            target, gameId: session.gameId,
            source: session.useAutodarts ? 'autodarts' : 'keypad'
        });

        const result = strategy.handleInput(session, player, dart);

        EventBus.emit('GAME_EVENT', {
            type: 'input-processed',
            overlay: result.overlay || null,
            action: result.action,
            dart,
            gameId: session.gameId,
            lastTurnScore: _getLastTurnScore(player, session.gameId)
        });

        // ── Held Darts: nach neuem Dart automatisch re-applyen ────────────────
        if (_heldDarts && session.tempDarts.length === _heldDarts.afterPosition) {
            const held = _heldDarts;
            _heldDarts = null;
            _deferredTurnEnd = null;
            _applyingHeldDarts = true;
            held.darts.forEach(d => this.onInput(d.isMiss ? 'MISS' : (d.segment || 'MISS')));
            _applyingHeldDarts = false;

            // Wurde ein Turn-Ende aufgeschoben? → Countdown neu starten, DANN ausführen
            if (_deferredTurnEnd) {
                const deferred = _deferredTurnEnd;
                _deferredTurnEnd = null;
                let corrWindowMs = 3000;
                try { corrWindowMs = (Management.getSettings().correctionWindow ?? 3.0) * 1000; } catch(e) {}
                if (corrWindowMs > 0) {
                    _lastTurnEndResult  = deferred.result;
                    _lastTurnEndContext = deferred.ctx;
                    EventBus.emit('GAME_EVENT', { type: 'correction-window', duration: corrWindowMs });
                    UI.showCorrectionCountdown(corrWindowMs, () => {
                        _correctionTimer    = null;
                        _lastTurnEndResult  = null;
                        _lastTurnEndContext = null;
                        EventBus.emit('GAME_EVENT', { type: 'correction-window-end' });
                        _executeAction(deferred.result, deferred.ctx.session, deferred.ctx.player, deferred.ctx.strategy, deferred.ctx.overlayMs);
                    });
                    _correctionTimer = setTimeout(() => {}, corrWindowMs);
                } else {
                    _executeAction(deferred.result, deferred.ctx.session, deferred.ctx.player, deferred.ctx.strategy, deferred.ctx.overlayMs);
                }
            }
            UI.updateGameDisplay();
            return;
        }

        // Overlay nur bei nicht-turn-endenden Events zeigen (WIN, BUST werden separat behandelt)
        // Turn-Enden (NEXT_TURN, FINISH_GAME) bekommen kein Overlay mehr – WLED übernimmt.
        const isTurnEnding = ['NEXT_TURN', 'BUST', 'FINISH_GAME'].includes(result.action);

        if (result.overlay && !_applyingHeldDarts && !isTurnEnding) {
            UI.showOverlay(result.overlay.text, result.overlay.type);
        }
        // BUST und WIN bekommen ihr Overlay weiterhin über _triggerAnimation
        if (result.overlay && !_applyingHeldDarts && result.action === 'BUST') {
            UI.showOverlay(result.overlay.text, result.overlay.type);
        }
        // NEXT_TURN mit Overlay (z.B. BUST/CHECK in Checkout Challenge)
        if (result.overlay && !_applyingHeldDarts && result.action === 'NEXT_TURN') {
            UI.showOverlay(result.overlay.text, result.overlay.type);
        }

        let overlayMs = 1200;
        try { overlayMs = Management.getSettings().overlayDuration || 1200; } catch(e) {}

        // ── Korrektur-Fenster nach Dart 3 ────────────────────────────────────
        let corrWindowMs = 0;
        try { corrWindowMs = (Management.getSettings().correctionWindow ?? 3.0) * 1000; } catch(e) { corrWindowMs = 3000; }

        if (isTurnEnding && corrWindowMs > 0 && !_applyingHeldDarts) {
            
            // 1. UI sofort aktualisieren, damit der 3. Dart in der Liste erscheint
            UI.updateGameDisplay();
            
            // 2. Eingabe kurz sperren, damit während der Farbeffekt-Zeit nichts passiert
            isLocked = true;

            // 3. Verzögerung starten (z.B. 1000ms), damit Grün/Rot sichtbar bleibt
            // Erst danach wird auf Amber geschaltet.
            setTimeout(() => {
                isLocked = false; // Sperre aufheben, Correction-Timer übernimmt gleich

                _lastAppliedResult  = result;
                _lastTurnEndResult  = result;
                _lastTurnEndContext = { session, player, strategy, overlayMs };

                // JETZT erst Amber auslösen
                EventBus.emit('GAME_EVENT', { type: 'correction-window', duration: corrWindowMs });

                UI.showCorrectionCountdown(corrWindowMs, () => {
                    _correctionTimer = null;
                    _lastTurnEndResult  = null;
                    _lastTurnEndContext = null;
                    EventBus.emit('GAME_EVENT', { type: 'correction-window-end' });
                    _executeAction(result, session, player, strategy, overlayMs);
                });
                
                // Timer für die interne Logik setzen
                _correctionTimer = setTimeout(() => {}, corrWindowMs);
                
                // Display update, damit der Countdown-Balken erscheint (falls nötig)
                UI.updateGameDisplay();

            }, 500);
            
            return;
        }

        _lastAppliedResult = result;
        // Wenn wir gerade Held-Darts re-applyen und dieser Dart den Turn beendet,
        // NICHT sofort ausführen – der Held-Dart-Block übernimmt die Action danach.
        if (_applyingHeldDarts && ['NEXT_TURN', 'BUST', 'FINISH_GAME'].includes(result.action)) {
            _deferredTurnEnd = { result, ctx: { session, player, strategy, overlayMs } };
            return;
        }
        _executeAction(result, session, player, strategy, overlayMs);
    },

    resetLeg(session, strategy) {
        session.firstPlayerOfLeg = (session.firstPlayerOfLeg + 1) % session.players.length;
        session.currentPlayerIndex = session.firstPlayerOfLeg;
        session.players.forEach(p => {
            if (strategy.initPlayer) strategy.initPlayer(p, session.settings, session.targets);
            p.startOfTurnResidual = p.currentResidual;
        });
        session.tempDarts = [];
        session.roundIndex = 0;
        session.turnTotalIndex = 0;
        UI.updateGameDisplay();
    },

    undoLastAction() {
        if (isLocked) return;
        _cancelCorrectionWindow();
        const session = State.getActiveSession();
        if (!session || !session.historyStack?.length) return;
        const snap = JSON.parse(session.historyStack.pop());
        session.currentPlayerIndex = snap.pIdx;
        session.roundIndex         = snap.rIdx;
        session.turnTotalIndex     = snap.turnTotal;
        session.players            = snap.players;
        session.tempDarts          = snap.tempDarts;
        _heldDarts = null;
        UI.updateGameDisplay();
    },

    /**
     * Entfernt nur den Dart an Position boxIndex (1-3).
     * Darts nach der Lücke werden in _heldDarts gespeichert und nach
     * der Neueingabe automatisch in Originalposition wiederhergestellt.
     */
    undoSpecificDart(boxIndex) {
        // Darf auch während Korrektur-Fenster aufgerufen werden
        _cancelCorrectionWindow();
        if (isLocked) return;

        const session = State.getActiveSession();
        if (!session) return;

        const allDarts    = [...(session.tempDarts || [])];
        const currentCount = allDarts.length;
        if (boxIndex < 1 || boxIndex > currentCount) return;

        const dartsAfterGap  = allDarts.slice(boxIndex);
        const dartsBeforeGap = allDarts.slice(0, boxIndex - 1);

        _heldDarts = dartsAfterGap.length > 0
            ? { afterPosition: boxIndex, darts: dartsAfterGap }
            : null;

        // Alle Darts dieses Turns zurückrollen
        for (let i = 0; i < currentCount; i++) {
            if (!session.historyStack?.length) break;
            const snap = JSON.parse(session.historyStack.pop());
            session.currentPlayerIndex = snap.pIdx;
            session.roundIndex         = snap.rIdx;
            session.turnTotalIndex     = snap.turnTotal;
            session.players            = snap.players;
            session.tempDarts          = snap.tempDarts;
        }

        // Darts vor der Lücke sofort re-applyen
        if (dartsBeforeGap.length > 0) {
            _applyingHeldDarts = true;
            dartsBeforeGap.forEach(d => this.onInput(d.isMiss ? 'MISS' : (d.segment || 'MISS')));
            _applyingHeldDarts = false;
        }

        UI.markDartBoxCorrected(boxIndex);
        // _lastTurnEndResult bleibt erhalten → onInput startet den Countdown
        // neu sobald der korrigierte Dart eingegeben wurde und den Turn wieder beendet.
    },
};

function _getLastTurnScore(player, gameId) {
    const isScoreBased = ['bobs27', 'shanghai', 'cricket', 'around-the-board'].includes(gameId);
    if (isScoreBased) return null;
    if (player.turns.length > 0) {
        const last = player.turns[player.turns.length - 1];
        if (last.darts?.length === 3) return last.score || 0;
    }
    return null;
}
