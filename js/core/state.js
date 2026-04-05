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

    saveDiagnosticProfile: async function(playerId, scores) {
        const user = _state.availablePlayers.find(u => u.id === playerId);
        if (user) {
            user.diagnosticProfile = {
                scores,
                date: Date.now(),
            };
            await Store.saveUser(user);
            return true;
        }
        return false;
    },

    addTrendEntry: async function(playerId, entry) {
        // entry: { date, axis, score, gameId }
        const user = _state.availablePlayers.find(u => u.id === playerId);
        if (!user) return false;
        if (!user.trendEntries) user.trendEntries = [];
        user.trendEntries.push(entry);
        // Auf maximal 200 Einträge begrenzen (älteste zuerst raus)
        if (user.trendEntries.length > 200) {
            user.trendEntries = user.trendEntries.slice(-200);
        }
        await Store.saveUser(user);
        return true;
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
    _calculateSingleTrainingStats: function(player, session) {
        let hitCount = 0;
        let allDartsCount = 0;

        player.turns.forEach((turn, i) => {
            // Das Ziel dieser Runde ermitteln (Fallback: 1-20, 25)
            const target = session.targets?.[i] ?? (i < 20 ? i + 1 : 25);
            
            if (turn.darts) {
                turn.darts.forEach(d => {
                    allDartsCount++;
                    
                    // 1. Prüfen ob das Spiel schon gesagt hat "Treffer"
                    if (d._isHit) {
                        hitCount++;
                    }
                    // 2. Sicherheitsnetz: Falls _isHit fehlt, prüfen wir manuell
                    // Ein Treffer ist es nur, wenn Wurf-Basis == Ziel-Nummer
                    else {
                        const base = d.base || (d.val ? d.val.base : 0);
                        const isMiss = d.isMiss || (d.val ? d.val.isMiss : false);
                        
                        // WICHTIG: base muss target entsprechen!
                        if (!isMiss && base === target) {
                            hitCount++;
                        }
                    }
                });
            }
        });
        
        const hitRate = allDartsCount > 0 ? ((hitCount / allDartsCount) * 100).toFixed(1) : '0.0';
        
        return {
            totalScore: player.currentResidual,
            totalDarts: allDartsCount,
            hitCount: hitCount,
            hitRate: hitRate,
            accuracy: hitRate, 
            summary: {
                score: player.currentResidual,
                hitRate: hitRate,
            }
        };
    },

    saveActiveSession: async function() {
        const session = _state.activeSession;
        if(!session) return;
        
        // ── Plan-Kontext: Speichert, ob dieses Spiel Teil eines Trainingsplans war ──
        const planData = _state.activePlan ? {
            planId:   _state.activePlan.id,
            planName: _state.activePlan.name,
            sessionId: _state.activePlan.sessionId,
            blockIndex: _state.activePlan.currentBlockIndex
        } : null;

        // ── Match-Kontext: 'multiplayer' | 'training' | 'solo' ──
        const isMultiplayer = session.players.length > 1;
        const isTraining    = !!planData;
        const matchContext  = isMultiplayer ? 'multiplayer' : (isTraining ? 'training' : 'solo');

        // --- WINNER ERMITTELN (Für Statistik) ---
        let winnerId = null;
        
        if (session.gameId === 'x01') {
            const isSets = session.settings.mode === 'sets';
            const sorted = [...session.players].sort((a,b) => {
                if(isSets) return b.setsWon - a.setsWon;
                return b.legsWon - a.legsWon;
            });
            winnerId = sorted[0].id;
        } else {
            // Spiele mit player.score: checkout-challenge, halve-it, scoring-drill, cricket
            // Spiele mit currentResidual: bobs27, shanghai, single-training, around-the-board
            const scoreGames = ['checkout-challenge', 'halve-it', 'scoring-drill', 'cricket'];
            const useScore = scoreGames.includes(session.gameId);
            const sorted = [...session.players].sort((a,b) => {
                const aVal = useScore ? (a.score || 0) : (a.currentResidual || 0);
                const bVal = useScore ? (b.score || 0) : (b.currentResidual || 0);
                return bVal - aVal;
            });
            winnerId = sorted[0].id;
        }
        // ----------------------------------------------

        const savePromises = session.players.map(async (p) => {
            // Bots haben kein Firebase-Konto → nicht speichern
            if (p.isBot) return;

            const user = _state.availablePlayers.find(u => u.id === p.id);
            if(user) {
                if(!user.history) user.history = [];
                
                const opponents = session.players
                    .filter(otherPlayer => otherPlayer.id !== p.id)
                    .map(otherPlayer => otherPlayer.name);

                let matchStats;
                if (session.gameId === 'bobs27') {
                    matchStats = {
                        totalScore: p.currentResidual,
                        isWinner: !p.isEliminated,
                        totalHits: p.turns.reduce((acc, t) => acc + (t.hits || 0), 0)
                    };
                }
                else if (session.gameId === 'single-training' || session.gameId === 'shanghai') {
					matchStats = this._calculateSingleTrainingStats(p, session); // <--- session hier übergeben!
				}
                else if (session.gameId === 'halve-it') {
                    const allThrows = p.turns.flatMap(t => t.darts || []);
                    const totalRounds = p.turns.length;
                    const halvings = p.halvedCount || 0;
                    const halvingRate = totalRounds > 0
                        ? ((halvings / totalRounds) * 100).toFixed(0) + '%' : '0%';
                    matchStats = {
                        totalScore: p.score, halvings, halvingRate,
                        perfectRounds: p.perfectRounds || 0, totalRounds,
                        totalDarts: allThrows.length,
                        summary: { score: p.score, halvings, halvingRate, perfectRounds: p.perfectRounds || 0 }
                    };
                }
                else if (session.gameId === 'scoring-drill') {
                    const avg = p.dartsThrown > 0
                        ? ((p.score / p.dartsThrown) * 3).toFixed(1) : '0.0';
                    matchStats = {
                        totalScore: p.score, avg, dartsThrown: p.dartsThrown,
                        dartLimit: p.dartLimit || session.settings?.dartLimit || 99,
                        powerScores: p.stats || { ton: 0, ton40: 0, max: 0 },
                        summary: {
                            score: p.score, avg,
                            ton:  (p.stats || {}).ton   || 0,
                            ton40:(p.stats || {}).ton40 || 0,
                            max:  (p.stats || {}).max   || 0,
                        }
                    };
                }
                else if (session.gameId === 'checkout-challenge') {
                    const totalTargets = session.targets?.length || 0;
                    const checkoutsHit = p.checkoutsHit || 0;
                    const checkoutRate = totalTargets > 0
                        ? ((checkoutsHit / totalTargets) * 100).toFixed(0) + '%' : '0%';
                    const allThrows = p.turns.flatMap(t => t.darts || []);
                    const dartsThrown = allThrows.length;
                    const avgDPC = checkoutsHit > 0 ? (dartsThrown / checkoutsHit).toFixed(1) : '-';
                    matchStats = {
                        totalScore: p.score, checkoutsHit, checkoutsTotal: totalTargets,
                        checkoutRate, avgDartsPerCheckout: avgDPC, dartsThrown,
                        summary: { score: p.score, checkoutsHit, checkoutsTotal: totalTargets,
                                   checkoutRate, avgDartsPerCheckout: avgDPC }
                    };
                }
                else {
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
                    matchContext: matchContext,
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

    // ─── BOT MANAGEMENT ───────────────────────────────────────────────────────

    /**
     * Stellt sicher, dass mindestens ein Bot-Spieler in der Spielerliste existiert.
     * Legt ihn an falls nötig. Wird beim App-Start nach initAfterLogin() aufgerufen.
     */
    ensureBotPlayers: async function(botSettings) {
        const existing = _state.availablePlayers.filter(p => p.isBot);
        if (existing.length > 0) {
            // Einstellungen aktualisieren falls nötig
            existing.forEach(b => {
                b.botDifficulty = botSettings?.difficulty ?? b.botDifficulty ?? 60;
                b.botSpeed      = botSettings?.speed      ?? b.botSpeed      ?? 'medium';
            });
            return existing;
        }
        // Standard-Bot anlegen
        const bot = {
            id: 'bot_default',
            name: '🤖 Bot',
            isBot: true,
            botDifficulty: botSettings?.difficulty ?? 60,
            botSpeed:      botSettings?.speed      ?? 'medium',
            history: []
        };
        _state.availablePlayers.push(bot);
        await Store.saveUser(bot);
        return [bot];
    },

    getBotPlayers: function() {
        return _state.availablePlayers.filter(p => p.isBot);
    },

    updateBotSettings: async function(botId, difficulty, speed) {
        const bot = _state.availablePlayers.find(p => p.id === botId);
        if (!bot) return;
        bot.botDifficulty = difficulty;
        bot.botSpeed      = speed;
        await Store.saveUser(bot);
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
                isBot: p.isBot ?? false,
                botDifficulty: p.botDifficulty ?? 60,
                botSpeed: p.botSpeed ?? 'medium',
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