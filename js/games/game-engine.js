import { State } from '../core/state.js'; 
import { EventBus } from '../core/event-bus.js';
import { normalizeDart } from '../core/dart-model.js';
import { X01 } from './x01.js';
import { SingleTraining } from './single-training.js';
import { Shanghai } from './shanghai.js';
import { Bobs27 } from './bobs27.js';
import { Cricket } from './cricket.js';
import { AroundTheBoard } from './around-the-board.js';
import { UI } from '../ui/ui-core.js';

const STRATEGY_MAP = {
    'x01': X01,
    'single-training': SingleTraining,
    'shanghai': Shanghai,
    'bobs27': Bobs27,
	'cricket': Cricket,
	'around-the-board': AroundTheBoard
};

// --- PRIVATE VARS ---
let isLocked = false;
let lastInputTime = 0;

function _getStrategy(gameId) {
    return STRATEGY_MAP[gameId] || null;
}

/**
 * Ermittelt das aktuelle Ziel (Target) für den aktiven Spieler.
 * Wird von normalizeDart() benötigt für Training/Shanghai/ATB/Bob's27,
 * wo das Keypad kein Segment liefert, sondern nur {multiplier} oder 'HIT'.
 */
function _getCurrentTarget(session) {
    const player = session.players[session.currentPlayerIndex];
    const roundIdx = player.turns.length;
    return session.targets?.[roundIdx] ?? null;
}

function _pushUndoState(session) {
    if (!session.historyStack) session.historyStack = [];
    const snapshot = JSON.stringify({
        pIdx: session.currentPlayerIndex,
        rIdx: session.roundIndex, 
        turnTotal: session.turnTotalIndex, 
        players: session.players,
        tempDarts: session.tempDarts,
    });
    session.historyStack.push(snapshot);
    if (session.historyStack.length > 50) session.historyStack.shift();
}

function _triggerAnimation(type, duration = 1000, callback) {
    isLocked = true;
    
    State.updateSessionState({ animation: type });
    UI.updateGameDisplay();

    setTimeout(() => {
        State.updateSessionState({ animation: null });
        isLocked = false;
        UI.updateGameDisplay();
        if (callback) callback();
    }, duration);
}

function _nextTurn(session) {
    isLocked = true;
    
    setTimeout(() => {
        let currentIdx = session.currentPlayerIndex;
        let nextPIdx = (currentIdx + 1) % session.players.length;
        
        const allFinished = session.players.every(p => p.finished);
        if (allFinished) {
            isLocked = false;
            UI.showResult();
            return;
        }

        let loopCount = 0;
        while (session.players[nextPIdx].finished && loopCount < session.players.length) {
            nextPIdx = (nextPIdx + 1) % session.players.length;
            loopCount++;
        }

        let nextRoundIndex = session.roundIndex;
        let nextTurnTotal = (session.turnTotalIndex || 0) + 1;
        
        if (nextPIdx === 0) nextRoundIndex++;

        State.updateSessionState({
            currentPlayerIndex: nextPIdx,
            turnTotalIndex: nextTurnTotal,
            roundIndex: nextRoundIndex, 
            tempDarts: [] 
        });

        isLocked = false;
        UI.updateGameDisplay();
    }, 800); 
}

export const GameEngine = {
    
    hasOptions(gameType) { 
        const strategy = _getStrategy(gameType);
        return strategy ? strategy.config.hasOptions : false;
    },
    
    getResultData: function(session, player) {
        const strategy = _getStrategy(session.gameId);
        if (strategy && strategy.getResultData) {
            return strategy.getResultData(session, player);
        }
        return null; 
    },
    
    getGameConfig: function(gameType) {
        const strategy = _getStrategy(gameType);
        return strategy ? strategy.config : null;
    },

    getCheckoutGuide(score, dartsLeftInTurn) {
        const session = State.getActiveSession();
        if(session && session.gameId === 'x01') {
             return X01.getCheckoutGuide(score, dartsLeftInTurn);
        }
        return "";
    },  

    startGame(gameType, selectedPlayerIds, gameOptions) {
        EventBus.emit('GAME_EVENT', { type: 'game-started' });

        const strategy = _getStrategy(gameType);
        if (!strategy) return;
        
        isLocked = false; 

        let targets = strategy.generateTargets ? strategy.generateTargets(gameOptions) : [];
        let defaultPro = strategy.config.defaultProInput;

        State.createSession(gameType, gameOptions, selectedPlayerIds);
        const session = State.getActiveSession();
        
        session.players.forEach(p => {
            if(strategy.initPlayer) strategy.initPlayer(p, gameOptions, targets);
        });

        State.updateSessionState({
            targets: targets,
            roundIndex: 0,
            turnTotalIndex: 0,
            tempDarts: [],
            historyStack: [],
            useProInput: defaultPro,
            animation: null 
        });
        
        UI.switchToGame();
    },

    /**
     * ZENTRALE INPUT METHODE (Step 6: Event-Bus + Step 7a: Dart-Model)
     * 
     * Jeder Input (Keypad, Autodarts) wird durch normalizeDart() in ein
     * universelles Dart-Objekt umgewandelt, bevor er an die Strategy geht.
     */
    onInput(value) {
        if (isLocked) return; 

        const now = Date.now();
        if (now - lastInputTime < 200) return;
        lastInputTime = now;

        const session = State.getActiveSession();
        if(!session || session.status !== 'running') return;
        
        const strategy = _getStrategy(session.gameId);
        if (!strategy) return;

        // 1. Snapshot für Undo
        _pushUndoState(session);
    
        const pIdx = session.currentPlayerIndex;
        const player = session.players[pIdx];
        
        if (player.finished) { _nextTurn(session); return; }

        // 2. INPUT NORMALISIEREN (Step 7a: Unified Dart Model)
        //    Wandelt JEDES Format (String, Object, Autodarts) in ein
        //    universelles Dart-Objekt um, bevor die Strategy es bekommt.
        const target = _getCurrentTarget(session);
        const dart = normalizeDart(value, {
            target: target,
            gameId: session.gameId,
            source: session.useAutodarts ? 'autodarts' : 'keypad'
        });

        // 3. DELEGATION an Strategy (bekommt jetzt immer ein Dart-Objekt)
        const result = strategy.handleInput(session, player, dart);

        // 4. EVENT EMITTIEREN (Step 6: Event-Bus)
        EventBus.emit('GAME_EVENT', {
            type: 'input-processed',
            overlay: result.overlay || null,
            action: result.action,
            dart: dart,
            gameId: session.gameId,
            lastTurnScore: _getLastTurnScore(player, session.gameId)
        });

        // 5. UI FEEDBACK (Overlay)
        if (result.overlay) {
            UI.showOverlay(result.overlay.text, result.overlay.type);
        }

        // 6. AKTION AUSFÜHREN
        switch (result.action) {
            case 'BUST':
                _triggerAnimation('BUST', 1500, () => {
                    State.updateSessionState({ tempDarts: [] }); 
                    _nextTurn(session);
                });
                break;

            case 'WIN_LEG':
            case 'WIN_MATCH':
                _triggerAnimation('CHECK', 1000, () => {
                    if (result.suppressModal && result.action === 'WIN_MATCH') {
                        player.finished = true;
                        UI.showResult();
                        return;
                    }

                    let matchStatus = { isMatchOver: (result.action === 'WIN_MATCH') };
                    
                    if (strategy.handleWinLogik) {
                        matchStatus = strategy.handleWinLogik(session, player, result);
                    } else {
                        matchStatus.messageTitle = result.action === 'WIN_MATCH' ? 'SIEG!' : 'RUNDE GEWONNEN';
                        matchStatus.messageBody = `${player.name} hat es geschafft!`;
                        matchStatus.nextActionText = result.action === 'WIN_MATCH' ? 'STATISTIK' : 'WEITER';
                    }

                    if (result.action === 'WIN_MATCH') {
                        player.finished = true;
                        UI.showMatchModal(
                            matchStatus.messageTitle, 
                            matchStatus.messageBody, 
                            matchStatus.nextActionText, 
                            () => UI.showResult()
                        );
                    } else {
                        UI.showMatchModal(
                            matchStatus.messageTitle, 
                            matchStatus.messageBody, 
                            matchStatus.nextActionText, 
                            () => this.resetLeg(session, strategy)
                        );
                    }
                });
                break;

            case 'NEXT_TURN':
				UI.updateGameDisplay();
                if (result.delay) {
                    isLocked = true;
                    setTimeout(() => {
                        _nextTurn(session);
                    }, result.delay);
                } else {
                    _nextTurn(session);
                }
                break;
            
            case 'FINISH_GAME':
                UI.updateGameDisplay();
                setTimeout(() => {
                    if(session.players.every(p => p.finished)) {
                        UI.showResult();
                    } else {
                         _nextTurn(session);
                    }
                }, 1000);
                break;

            case 'CONTINUE':
            default:
                UI.updateGameDisplay();
                break;
        }
    },

    resetLeg: function(session, strategy) {
        session.firstPlayerOfLeg = (session.firstPlayerOfLeg + 1) % session.players.length;
        session.currentPlayerIndex = session.firstPlayerOfLeg;

        session.players.forEach(p => {
            if(strategy.initPlayer) strategy.initPlayer(p, session.settings, session.targets);
            p.startOfTurnResidual = p.currentResidual;
        });
        
        session.tempDarts = [];
        session.roundIndex = 0; 
        session.turnTotalIndex = 0;
        
        UI.updateGameDisplay(); 
    },
    
    undoLastAction: function() {
        if (isLocked) return;
        
        const session = State.getActiveSession();
        if(!session || !session.historyStack || session.historyStack.length === 0) return;
        
        const lastState = JSON.parse(session.historyStack.pop());
        
        session.currentPlayerIndex = lastState.pIdx;
        session.roundIndex = lastState.rIdx;
        session.turnTotalIndex = lastState.turnTotal;
        session.players = lastState.players; 
        session.tempDarts = lastState.tempDarts;
        
        UI.updateGameDisplay();
    }
};

// --- PRIVATE HELPER ---

/**
 * Ermittelt den Score des letzten abgeschlossenen Turns (3 Darts).
 * Wird für den Highscore-Check bei X01/Training gebraucht.
 */
function _getLastTurnScore(player, gameId) {
    const isScoreBased = ['bobs27', 'shanghai', 'cricket', 'around-the-board'].includes(gameId);
    if (isScoreBased) return null;
    
    if (player.turns.length > 0) {
        const lastTurn = player.turns[player.turns.length - 1];
        if (lastTurn.darts && lastTurn.darts.length === 3) {
            return lastTurn.score || 0;
        }
    }
    return null;
}
