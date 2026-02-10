import { State } from '../core/state.js'; 
import { X01 } from './x01.js';
import { SingleTraining } from './single-training.js';
import { Shanghai } from './shanghai.js';
import { Bobs27 } from './bobs27.js';
import { Cricket } from './cricket.js';
import { AroundTheBoard } from './around-the-board.js';
import { HueService } from '../core/hue-service.js';
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
let isLocked = false; // Die globale Sperre für Eingaben
let lastInputTime = 0; // Spam-Schutz

function _getStrategy(gameId) {
    return STRATEGY_MAP[gameId] || null;
}

function _pushUndoState(session) {
    if (!session.historyStack) session.historyStack = [];
    // Wir speichern eine tiefe Kopie relevanter Daten
    // (Performance-Hinweis: JSON.stringify ist hier okay, solange State klein bleibt)
    const snapshot = JSON.stringify({
        pIdx: session.currentPlayerIndex,
        rIdx: session.roundIndex, 
        turnTotal: session.turnTotalIndex, 
        players: session.players,
        tempDarts: session.tempDarts,
        // WICHTIG: Falls Strategies eigene State-Felder haben (wie Cricket Marks),
        // werden sie hier mitgesichert, da sie im 'players'-Objekt hängen.
    });
    session.historyStack.push(snapshot);
    if (session.historyStack.length > 50) session.historyStack.shift();
}

/**
 * Steuert Animationen und Input-Sperre zentral
 */
function _triggerAnimation(type, duration = 1000, callback) {
    isLocked = true; // SPERREN
    
    State.updateSessionState({ animation: type });
    UI.updateGameDisplay();

    setTimeout(() => {
        State.updateSessionState({ animation: null }); // Reset
        isLocked = false; // ENTSPERREN
        UI.updateGameDisplay();
        if (callback) callback();
    }, duration);
}

function _nextTurn(session) {
    isLocked = true;
    
    // Kleines Delay für UX (damit man das Ergebnis noch kurz sieht)
    setTimeout(() => {
        let currentIdx = session.currentPlayerIndex;
        let nextPIdx = (currentIdx + 1) % session.players.length;
        
        const allFinished = session.players.every(p => p.finished);
        if (allFinished) {
            isLocked = false;
            UI.showResult();
            return;
        }

        // Überspringe fertige Spieler
        let loopCount = 0;
        while (session.players[nextPIdx].finished && loopCount < session.players.length) {
            nextPIdx = (nextPIdx + 1) % session.players.length;
            loopCount++;
        }

        let nextRoundIndex = session.roundIndex;
        let nextTurnTotal = (session.turnTotalIndex || 0) + 1;
        
        // Wenn wir wieder beim ersten Spieler sind, neue Runde
        if (nextPIdx === 0) nextRoundIndex++;

        State.updateSessionState({
            currentPlayerIndex: nextPIdx,
            turnTotalIndex: nextTurnTotal,
            roundIndex: nextRoundIndex, 
            tempDarts: [] 
        });

        isLocked = false; // ENTSPERREN
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
		HueService.setMood('warm');
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
     * ZENTRALE INPUT METHODE (REFACTORED)
     */
/**
     * ZENTRALE INPUT METHODE (FIXED FOR ATB & BOBS27)
     */
    /**
     * ZENTRALE INPUT METHODE (FIXED FOR ATB 3x MISS)
     */
    onInput(value) {
        if (isLocked) return; 

        // Spam-Schutz (200ms)
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

        // 2. DELEGATION
        const result = strategy.handleInput(session, player, value);

        // =========================================================
        // HUE INTELLIGENT TRIGGER (FINAL FIX)
        // =========================================================
        
        const isScoreBasedGame = ['bobs27', 'shanghai', 'cricket', 'around-the-board'].includes(session.gameId);
        let hueTriggered = false;

        // A) Overlay-Events (Priorität 1)
        if (result.overlay) {
            hueTriggered = true;
            switch (result.overlay.type) {
                case '180':
                    HueService.trigger('180');
                    break;
                case 'high':      
                case 'very-high': 
                    HueService.trigger('HIGH_SCORE');
                    break;
                
                case 'check':     
                    if (session.gameId === 'bobs27') {
                         HueService.trigger('HIT'); 
                    } else {
                         HueService.trigger('180'); 
                    }
                    break;
                
                case 'match-win':
                    HueService.trigger('180');
                    break;

                case 'miss':
                case 'bust':
                    // BEI ATB: Overlay "miss" kommt NUR am Ende der Runde bei 3x Miss.
                    // Daher können wir hier IMMER feuern. Die Einzel-Misses erzeugen KEIN Overlay.
                    HueService.trigger('MISS');
                    break;

                case 'standard':       
                case 'cricket-open':
                case 'cricket-closed':
                case 'cricket-hit': 
                    HueService.trigger('HIT'); 
                    break;

                default:
                    HueService.trigger('HIT');
                    break;
            }
        } 
        
        // B) Stille Treffer (Priorität 2) - Wenn kein Overlay kam
        if (!hueTriggered) {
             const isHitEvent = (value.type === 'HIT') || (value === 'HIT');
             const isDirectMiss = (value === 'MISS'); // String "MISS"
             
             if (isHitEvent || isDirectMiss) {
                 // War es ein Miss?
                 const isMiss = isDirectMiss || (value.val && value.val.isMiss);
                 
                 if (isMiss) {
                     // === ATB SPECIAL ===
                     // Bei ATB wollen wir bei "stillen" Misses (1. oder 2. Dart) KEIN Rotlicht.
                     // Das Rotlicht soll NUR kommen, wenn das Overlay "miss" kommt (siehe oben).
                     if (session.gameId === 'around-the-board') {
                         // TU NICHTS. 
                         // Wir warten auf das Overlay am Ende der Runde.
                     } 
                     // === ANDERE SPIELE ===
                     else {
                         HueService.trigger('MISS');
                     }
                 } else {
                     // Treffer (Grün)
                     HueService.trigger('HIT'); 
                 }
             }
        }
        
        // C) Highscore Check (Nur für X01/Training)
        if (!isScoreBasedGame && player.turns.length > 0) {
            const lastTurn = player.turns[player.turns.length - 1];
            if (lastTurn.darts && lastTurn.darts.length === 3) {
                 const turnScore = lastTurn.score || 0;
                 setTimeout(() => {
                     if (turnScore === 180) {
                         HueService.trigger('180');
                     } else if (turnScore >= 100) {
                         HueService.trigger('HIGH_SCORE');
                     }
                 }, 600); 
            }
        }

        // Match Win Stimmung
        if (result.action === 'WIN_MATCH') {
            setTimeout(() => HueService.setMood('match-won'), 2000);
        }
        
        // =========================================================

        // 3. UI FEEDBACK
        if (result.overlay) {
            UI.showOverlay(result.overlay.text, result.overlay.type);
        }

        // 4. AKTION AUSFÜHREN
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
            // Falls Cricket: p.marks resetten? Das entscheidet initPlayer!
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
        
        // Restore State (Generic)
        const lastState = JSON.parse(session.historyStack.pop());
        
        session.currentPlayerIndex = lastState.pIdx;
        session.roundIndex = lastState.rIdx;
        session.turnTotalIndex = lastState.turnTotal;
        session.players = lastState.players; 
        session.tempDarts = lastState.tempDarts;
        
        UI.updateGameDisplay();
    }
};