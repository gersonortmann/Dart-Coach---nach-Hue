import { State } from '../core/state.js';

export const Cricket = {
    config: {
        hasOptions: true,
        mode: 'mixed', 
        description: "Taktik pur. Triff 15-20 und Bull dreimal zum Öffnen. Punkte zählen nur, wenn der Gegner noch offen ist."
    },

    generateTargets: function(settings) {
        return [20, 19, 18, 17, 16, 15, 25];
    },

    initPlayer: function(player, settings, targets) {
        player.currentResidual = 0; 
        player.scoreHistory = [0];
        player.finished = false;
        player.turns = [];
        player.marks = {};
        targets.forEach(t => player.marks[t] = 0);
        player.spRoundsPlayed = 0;
    },

    handleInput: function(session, player, input) {
        let targetVal = 0;
        let hits = 0;

        // Input Normalisierung
        if (input === '0' || input === 'MISS') { targetVal = 0; hits = 0; }
        else if (input === '25') { targetVal = 25; hits = 1; }
        else if (input === '50') { targetVal = 25; hits = 2; }
        else {
            const type = input.charAt(0);
            const num = parseInt(input.substring(1));
            targetVal = num;
            if (type === 'S') hits = 1; else if (type === 'D') hits = 2; else if (type === 'T') hits = 3;
        }

        const validTargets = session.targets; 
        let pointsScored = 0;
        let overlayText = null;
        let overlayType = 'score';
        
        // Logik Verarbeitung
        if (validTargets.includes(targetVal) && hits > 0) {
            const result = this._processMark(session, player, targetVal, hits);
            pointsScored = result.points;

            if (result.status === 'OPENED') {
                overlayText = `OPEN ${targetVal}`; 
                overlayType = 'cricket-open'; 
            } else if (result.status === 'CLOSED') {
                overlayText = `CLOSED ${targetVal}`; 
                overlayType = 'cricket-closed'; 
            } else if (pointsScored > 0) {
                overlayText = `+${pointsScored}`; 
                overlayType = 'standard'; 
            }
        }

        session.tempDarts.push({ 
            val: input, 
            points: pointsScored, 
            targetHit: targetVal,
            hits: hits
        });

        // --- WIN CHECK (Alles geschlossen & höchste Punkte) ---
        if (this._checkWinCondition(session, player)) { 
             this._logTurn(session, player);
             return { action: 'WIN_MATCH', overlay: { text: "WINNER!", type: 'check' }, suppressModal: true };
        }
        
        // --- LIMIT CHECK (Global für Single- & Multiplayer) ---
        // Fix: isSP Check entfernt, damit das Limit immer greift (Standard 20 oder Auswahl)
        const maxRounds = session.settings.spRounds || 20;
        
        if (player.turns.length + 1 >= maxRounds && session.tempDarts.length === 3) {
             this._logTurn(session, player); // Letzte Runde loggen
             
             // Im Multiplayer ist dies meist ein Draw oder Point-Win -> Wir nennen es "FINISH"
             return { action: 'WIN_MATCH', overlay: { text: "FINISH!", type: 'check' }, suppressModal: true };
        }

        // --- RUNDENENDE (3 Darts) ---
        if (session.tempDarts.length >= 3) {
            this._logTurn(session, player);
            
            // Fix: Keine aufsummierten Punkte mehr anzeigen
            // Wir prüfen nur noch auf MISS (kein Treffer in der ganzen Aufnahme)
            const anyHit = session.tempDarts.some(d => d.targetHit > 0);
            
            if (!anyHit && !overlayText) { 
                 overlayText = "MISS"; 
                 overlayType = 'miss'; 
            }

            return { 
                action: 'NEXT_TURN', 
                // Wenn kein OverlayText da ist (z.B. bei normalen Treffern ohne Open/Close), zeigen wir keins
                overlay: overlayText ? { text: overlayText, type: overlayType } : null,
                delay: overlayText ? 1200 : 500 // Kürzere Pause wenn kein Overlay
            };
        }

        return { 
            action: 'CONTINUE', 
            overlay: overlayText ? { text: overlayText, type: overlayType } : null 
        };
    },

    // Neuer Helper zum Loggen (vermeidet Code-Duplizierung)
    _logTurn: function(session, player) {
        const turnTotal = session.tempDarts.reduce((a, b) => a + b.points, 0);
        player.turns.push({
            roundIndex: session.roundIndex,
            score: turnTotal,
            darts: [...session.tempDarts],
            marksSnapshot: JSON.parse(JSON.stringify(player.marks))
        });
        player.scoreHistory.push(player.currentResidual);
    },

    _processMark: function(session, player, target, hits) {
        let points = 0;
        let status = 'HIT'; 

        const currentMarks = player.marks[target] || 0;
        const needed = 3 - currentMarks;
        
        const isSinglePlayer = session.players.length === 1;
        let allOpponentsClosed = false;
        if (!isSinglePlayer) {
            const opponents = session.players.filter(p => p.id !== player.id);
            allOpponentsClosed = opponents.every(op => op.marks[target] >= 3);
        }

        if (needed > 0) {
            if (hits >= needed) {
                player.marks[target] = 3;
                if (isSinglePlayer) {
                    status = 'OPENED'; 
                } else {
                    status = allOpponentsClosed ? 'CLOSED' : 'OPENED';
                }
                const surplus = hits - needed;
                if (surplus > 0 && (isSinglePlayer || !allOpponentsClosed)) {
                    points = surplus * target;
                    player.currentResidual += points;
                }
            } else {
                player.marks[target] += hits;
            }
        } else {
            if (isSinglePlayer || !allOpponentsClosed) {
                points = hits * target;
                player.currentResidual += points;
            }
        }
        return { points, status };
    },

    _checkWinCondition: function(session, player) {
        if (!this._areAllClosed(player)) return false;
        if (session.players.length === 1) return true;
        const myScore = player.currentResidual;
        const opponents = session.players.filter(p => p.id !== player.id);
        return opponents.every(op => myScore >= op.currentResidual);
    },

    _areAllClosed: function(player) {
        const targets = [15,16,17,18,19,20,25];
        return targets.every(t => (player.marks[t] || 0) >= 3);
    },

    handleWinLogik: function(session, player, result) {
        return {
            messageTitle: "CRICKET MASTER!",
            messageBody: `${player.name} gewinnt mit ${player.currentResidual} Punkten!`,
            nextActionText: "STATISTIK"
        };
    },

    getResultData: function(session, player) {
        let totalMarks = 0;
        let totalDarts = 0;
        let distribution = { singles: 0, doubles: 0, triples: 0 };
        let heatmap = {}; 

        if(player.turns && player.turns.length > 0) {
            player.turns.forEach(turn => {
                if(turn.darts) {
                    turn.darts.forEach(d => {
                        totalDarts++;
                        
                        let hits = d.hits;
                        if(hits === undefined) {
                            if(d.val && d.val.startsWith && d.val.startsWith('T')) hits = 3;
                            else if(d.val && d.val.startsWith && d.val.startsWith('D')) hits = 2;
                            else if(d.val && d.val !== '0' && d.val !== 'MISS') hits = 1;
                            else hits = 0;
                        }

                        if (hits > 0 && d.targetHit > 0) {
                            totalMarks += hits;
                            if(hits === 1) distribution.singles++;
                            else if(hits === 2) distribution.doubles++;
                            else if(hits === 3) distribution.triples++;
                        }

                        let key = d.val;
                        if(key === '25') key = 'S25'; 
                        if(key === '50') key = 'D25';
                        if(key && key !== '0' && key !== 'MISS') {
                             heatmap[key] = (heatmap[key] || 0) + 1;
                        }
                    });
                }
            });
        }

        const mpr = totalDarts > 0 ? (totalMarks / totalDarts) * 3 : 0;

        return {
            summary: { 
                score: player.currentResidual, 
                rounds: player.turns.length,
                mpr: mpr.toFixed(2),
                totalMarks: totalMarks
            },
            distribution: distribution, 
            chart: { 
                labels: player.turns.map(t => t.roundIndex + 1), 
                values: player.scoreHistory 
            },
            heatmap: heatmap 
        };
    }
};