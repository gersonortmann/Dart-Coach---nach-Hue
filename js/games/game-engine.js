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
// NEU: Zugriff auf Management Settings
import { Management } from '../ui/ui-mgmt.js';

const STRATEGY_MAP = {
    'x01': X01,
    'single-training': SingleTraining,
    'shanghai': Shanghai,
    'bobs27': Bobs27,
	'cricket': Cricket,
	'around-the-board': AroundTheBoard,
	'checkout-challenge': CheckoutChallenge,
	'halve-it': HalveIt,
	'scoring-drill': ScoringDrill
};

// --- PRIVATE VARS ---
let isLocked = false;
let lastInputTime = 0;

function _getStrategy(gameId) {
    return STRATEGY_MAP[gameId] || null;
}

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

// NEU: Duration wird aus Settings gelesen, falls nicht explizit übergeben
function _triggerAnimation(type, duration = null, callback) {
    isLocked = true;
    
    // Fallback auf Settings oder Hardcoded Default
    let animDuration = duration;
    if (!animDuration) {
        try {
            const settings = Management.getSettings();
            animDuration = settings.overlayDuration || 1200;
        } catch (e) {
            animDuration = 1200;
        }
    }
    
    State.updateSessionState({ animation: type });
    UI.updateGameDisplay();

    setTimeout(() => {
        State.updateSessionState({ animation: null });
        isLocked = false;
        UI.updateGameDisplay();
        if (callback) callback();
    }, animDuration);
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
        if (!session) return "";

        // Generische Lösung: Wir fragen die aktuelle Strategie, ob sie eine Hilfe hat
        const strategy = _getStrategy(session.gameId);
        if (strategy && typeof strategy.getCheckoutGuide === 'function') {
             return strategy.getCheckoutGuide(score, dartsLeftInTurn);
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

    onInput(value) {
        if (isLocked) return; 

        const now = Date.now();
        if (now - lastInputTime < 200) return;
        lastInputTime = now;

        const session = State.getActiveSession();
        if(!session || session.status !== 'running') return;
        
        const strategy = _getStrategy(session.gameId);
        if (!strategy) return;

        _pushUndoState(session);
    
        const pIdx = session.currentPlayerIndex;
        const player = session.players[pIdx];
        
        if (player.finished) { _nextTurn(session); return; }

        const target = _getCurrentTarget(session);
        const dart = normalizeDart(value, {
            target: target,
            gameId: session.gameId,
            source: session.useAutodarts ? 'autodarts' : 'keypad'
        });

        const result = strategy.handleInput(session, player, dart);

        EventBus.emit('GAME_EVENT', {
            type: 'input-processed',
            overlay: result.overlay || null,
            action: result.action,
            dart: dart,
            gameId: session.gameId,
            lastTurnScore: _getLastTurnScore(player, session.gameId)
        });

        if (result.overlay) {
            UI.showOverlay(result.overlay.text, result.overlay.type);
        }

        // NEU: Management Settings lesen für Overlay Duration
        let overlayMs = 1200; 
        try {
            overlayMs = Management.getSettings().overlayDuration || 1200;
        } catch(e) { /* Fallback */ }

        switch (result.action) {
            case 'BUST':
                // BUST ist oft etwas länger, wir nehmen overlayMs + 300
                _triggerAnimation('BUST', overlayMs + 300, () => {
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