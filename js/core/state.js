import { Store } from './store.js';

// 1. PRIVATE STATE
let _state = {
    currentScreen: 'screen-login',
    activeSession: null,      
    availablePlayers: [],
    activePlan: null 
};

// 2. PUBLIC INTERFACE
export const State = {
    
    initAfterLogin: async function() {
        _state.availablePlayers = await Store.loadAllPlayers();
        return _state.availablePlayers;
    },

    reset: function() {
         _state.availablePlayers = [];
         _state.activeSession = null;
         _state.activePlan = null;
         _state.currentScreen = 'screen-login';
    },

    getCurrentScreen: () => _state.currentScreen,
    getActiveSession: () => _state.activeSession,
    getAvailablePlayers: () => _state.availablePlayers,
    getActivePlan: () => _state.activePlan,

    setScreen: function(screenId) {
        _state.currentScreen = screenId;
    },

    addPlayer: async function(name) {
        const newPlayer = { id: 'p_' + Date.now(), name: name, history: [] };
        _state.availablePlayers.push(newPlayer);
        await Store.saveUser(newPlayer);
        return newPlayer;
    },

    renamePlayer: async function(playerId, newName) {
        const p = _state.availablePlayers.find(x => x.id === playerId);
        if(p) {
            p.name = newName;
            await Store.saveUser(p);
            return true;
        }
        return false;
    },
	
	addToHistory: async function(playerId, historyEntry) {
        const user = _state.availablePlayers.find(u => u.id === playerId);
        if (user) {
            if (!user.history) user.history = [];
            user.history.push(historyEntry);
            // Sofort persistieren
            await Store.saveUser(user);
            return true;
        }
        return false;
    },
    
    // --- X01 STATISTIK (Bestehend) ---
    calculateMatchStats: function(player, session) {
        const allDarts = player.turns.flatMap(t => t.darts || []);
        
        const totalPoints = player.turns.reduce((sum, t) => {
            return sum + ((t.bust === true) ? 0 : (t.score || 0));
        }, 0);
        
        const baseStats = {
            totalDarts: allDarts.length,
            totalScore: totalPoints,
            avg: allDarts.length > 0 ? ((totalPoints / allDarts.length) * 3).toFixed(1) : 0
        };

        if (session.gameId === 'x01') {
            const turnScores = player.turns.map(t => t.score || 0);
            
            let bestCheckout = 0;
            let bestLegDarts = Infinity;
            let currentLegDarts = 0;
            let legEndIndices = [];

            player.turns.forEach((t, idx) => {
                currentLegDarts += (t.darts ? t.darts.length : 3);
                const nextTurn = player.turns[idx + 1];
                const isLegEnd = t.isLegFinish || (nextTurn && nextTurn.roundIndex < t.roundIndex);

                if (t.isLegFinish) {
                    if (t.score > bestCheckout) bestCheckout = t.score;
                    if (currentLegDarts < bestLegDarts) bestLegDarts = currentLegDarts;
                }
                if (isLegEnd) {
                    legEndIndices.push(idx);
                    currentLegDarts = 0; 
                }
            });

            const f9Darts = allDarts.slice(0, 9);
            const f9Sum = f9Darts.reduce((a, b) => a + (b.points || 0), 0);

            return {
                ...baseStats,
                first9Avg: f9Darts.length > 0 ? ((f9Sum / f9Darts.length) * 3).toFixed(1) : 0,
                highestScore: Math.max(...turnScores, 0),
                bestCheckout: bestCheckout || '-',
                bestLeg: bestLegDarts === Infinity ? '-' : bestLegDarts,
                matchResult: session.settings.mode === 'sets' ? (player.setsWon || 0) : (player.legsWon || 0),
                resultLabel: session.settings.mode === 'sets' ? 'SETS' : 'LEGS'
            };
        }
        return baseStats;
    },

    // --- FIX: SINGLE TRAINING STATISTIK ---
    _calculateSingleTrainingStats: function(player) {
        // KORREKTUR: Zugriff auf 'darts' statt 'throws'
        const allDarts = player.turns.flatMap(t => t.darts || []);
        
        // KORREKTUR: Filterung auf Basis des Objekts { val: { isMiss: ... } }
        const hits = allDarts.filter(d => d.val && !d.val.isMiss);
        
        return {
            totalDarts: allDarts.length,
            hitCount: hits.length,
            accuracy: allDarts.length > 0 ? ((hits.length / allDarts.length) * 100).toFixed(2) : "0.00",
            
            // Zugriff auf Multiplier im verschachtelten Objekt d.val.multiplier
            singles: hits.filter(d => d.val.multiplier === 1).length,
            doubles: hits.filter(d => d.val.multiplier === 2).length,
            triples: hits.filter(d => d.val.multiplier === 3).length,
            
            dartsPerTarget: (allDarts.length / 21).toFixed(2),
            totalScore: player.currentResidual // Der Gesamtscore
        };
    },

    saveActiveSession: async function() {
        const session = _state.activeSession;
        if(!session) return;
        
        const planData = _state.activePlan ? { /* ... */ } : null; // (Dein bestehender Code)

        // --- NEU: WINNER ERMITTELN (Für Statistik) ---
        // Bei X01 ist es komplexer (Sets/Legs), bei Training zählt der Score.
        let winnerId = null;
        
        if (session.gameId === 'x01') {
            const isSets = session.settings.mode === 'sets';
            const sorted = [...session.players].sort((a,b) => {
                if(isSets) return b.setsWon - a.setsWon;
                return b.legsWon - a.legsWon;
            });
            winnerId = sorted[0].id;
        } else {
            // Training/Shanghai: Höchster Score gewinnt
            const sorted = [...session.players].sort((a,b) => b.currentResidual - a.currentResidual);
            winnerId = sorted[0].id;
        }
        // ----------------------------------------------

        const savePromises = session.players.map(async (p) => {
            const user = _state.availablePlayers.find(u => u.id === p.id);
            if(user) {
                if(!user.history) user.history = [];
                
                const opponents = session.players
                    .filter(otherPlayer => otherPlayer.id !== p.id)
                    .map(otherPlayer => otherPlayer.name);

                let matchStats;
				if (session.gameId === 'bobs27') {
                    matchStats = {
                        // WICHTIG: Nicht summieren! Der Endstand IST der Score.
                        totalScore: p.currentResidual, 
                        // Wer nicht eliminiert ist, hat gewonnen (Survived)
                        isWinner: !p.isEliminated,
                        // Wir speichern auch Hits für die Statistik (optional, falls wir es später brauchen)
                        totalHits: p.turns.reduce((acc, t) => acc + (t.hits || 0), 0)
                    };
                }
                else if (session.gameId === 'single-training' || session.gameId === 'shanghai') { // Shanghai ergänzt!
                    matchStats = this._calculateSingleTrainingStats(p);
                } else {
                    matchStats = this.calculateMatchStats(p, session);
                }
                
                // NEU: Wir speichern, ob dieser Spieler gewonnen hat
                if (matchStats.isWinner === undefined) {
                    matchStats.isWinner = (p.id === winnerId);
                }

                const settingsToSave = JSON.parse(JSON.stringify(session.settings || {}));
                settingsToSave.opponents = opponents;

                const historyEntry = {
                    matchId: 'm_' + Date.now() + '_' + p.id,
                    date: session.timestamp,
                    game: session.gameId,
                    settings: settingsToSave,
                    stats: matchStats, 
                    totalScore: matchStats.totalScore || 0, 
                    turns: p.turns,
                    targets: session.targets, 
                    planContext: planData
                };

                user.history.push(historyEntry);
                await Store.saveUser(user);
            }
        });

        await Promise.all(savePromises);
        _state.activeSession = null; 
    },

    deleteGameFromHistory: async function(playerId, gameIndexInArray) {
        const p = _state.availablePlayers.find(x => x.id === playerId);
        if(p && p.history) {
            p.history.splice(gameIndexInArray, 1);
            await Store.saveUser(p);
            return true;
        }
        return false;
    },
    
    createSession: function(gameId, settings, selectedPlayerIds) {
        const players = selectedPlayerIds
            .map(id => _state.availablePlayers.find(p => p.id === id))
            .filter(p => p !== undefined)
            .map(p => ({
                id: p.id,
                name: p.name,
                turns: [],
                progressIndex: 0,
                finished: false,
                legsWon: 0,
                setsWon: 0,
                history: []
            }));

        _state.activeSession = {
            gameId: gameId,
            timestamp: Date.now(),
            settings: settings || {},
            status: 'running',
            currentPlayerIndex: 0,
            roundIndex: 0, 
            turnTotalIndex: 0, 
            players: players,
            firstPlayerOfMatch: 0,
            firstPlayerOfLeg: 0
        };
    },

    updateSessionState: function(updates) {
        if(!_state.activeSession) return;
        Object.assign(_state.activeSession, updates);
    },

    getCurrentPlayer: function() {
        if(!_state.activeSession) return null;
        return _state.activeSession.players[_state.activeSession.currentPlayerIndex];
    },
    
    // --- PLAN HELPER ---
    startTrainingPlan: function(planId) {
        const plans = (window.TRAINING_PLANS ? window.TRAINING_PLANS : []);
        const planDef = plans.find(p => p.id === planId);
        if(!planDef) return false;

        _state.activePlan = {
            id: planDef.id,
            name: planDef.name,
            sessionId: 'ts_' + Date.now(),
            currentBlockIndex: 0,
            totalBlocks: planDef.blocks.length,
            blocks: planDef.blocks
        };
        return true;
    },

    getCurrentPlanBlock: function() {
        if(!_state.activePlan) return null;
        return _state.activePlan.blocks[_state.activePlan.currentBlockIndex];
    },

    advancePlanBlock: function() {
        if(!_state.activePlan) return null;
        _state.activePlan.currentBlockIndex++;
        if(_state.activePlan.currentBlockIndex >= _state.activePlan.totalBlocks) {
            const sid = _state.activePlan.sessionId;
            _state.activePlan = null; 
            return { finished: true, sessionId: sid };
        }
        return { finished: false, block: _state.activePlan.blocks[_state.activePlan.currentBlockIndex] };
    },

    cancelPlan: function() { _state.activePlan = null; }
};