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

    /**
     * Step 7a: Empfängt universelles Dart-Objekt.
     * 20 Zeilen String-Parsing → 2 Zeilen: dart.base + dart.multiplier
     */
    handleInput: function(session, player, dart) {
        // Step 7a: Input-Parsing entfällt komplett!
        const targetVal = dart.base;                          // 20, 19, ..., 25 oder 0
        const hits = dart.isMiss ? 0 : dart.multiplier;       // 0, 1, 2, oder 3

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

        // Dart speichern: points wird mit Cricket-spezifischem Wert überschrieben
        session.tempDarts.push({ ...dart, points: pointsScored });

        // ============================================================
        // NEU: LIVE MPR BERECHNUNG (Hier eingefügt!)
        // ============================================================
        let totalMarks = 0;
        let totalDarts = 0;
        const cricketTargets = [15, 16, 17, 18, 19, 20, 25];

        // 1. Vergangene Runden
        (player.turns || []).forEach(t => {
            (t.darts || []).forEach(d => {
                totalDarts++;
                if (!d.isMiss && cricketTargets.includes(d.base)) {
                    totalMarks += d.multiplier;
                }
            });
        });

        // 2. Aktuelle Darts (tempDarts sind oben gerade aktualisiert worden)
        (session.tempDarts || []).forEach(d => {
            totalDarts++;
            if (!d.isMiss && cricketTargets.includes(d.base)) {
                totalMarks += d.multiplier;
            }
        });

        // 3. Wert am Spieler speichern
        if (totalDarts > 0) {
            player.liveMpr = ((totalMarks / totalDarts) * 3).toFixed(2);
        } else {
            player.liveMpr = "0.00";
        }
        // ============================================================


        // --- WIN CHECK ---
        if (this._checkWinCondition(session, player)) { 
             this._logTurn(session, player);
             return { action: 'WIN_MATCH', overlay: { text: "WINNER!", type: 'check' }, suppressModal: true };
        }
        
        // --- LIMIT CHECK ---
        const maxRounds = session.settings.spRounds || 20;
        
        if (player.turns.length + 1 >= maxRounds && session.tempDarts.length === 3) {
             this._logTurn(session, player);
             return { action: 'WIN_MATCH', overlay: { text: "FINISH!", type: 'check' }, suppressModal: true };
        }

        // --- RUNDENENDE (3 Darts) ---
        if (session.tempDarts.length >= 3) {
            this._logTurn(session, player);
            
            // Check auf MISS: Kein Dart hat ein gültiges Target getroffen
            const anyHit = session.tempDarts.some(d => !d.isMiss && validTargets.includes(d.base));
            
            if (!anyHit && !overlayText) { 
                 overlayText = "MISS"; 
                 overlayType = 'miss'; 
            }

            return { 
                action: 'NEXT_TURN', 
                overlay: overlayText ? { text: overlayText, type: overlayType } : null,
                delay: overlayText ? 1200 : 500
            };
        }

        return { 
            action: 'CONTINUE', 
            overlay: overlayText ? { text: overlayText, type: overlayType } : null 
        };
    },

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

    /**
     * Step 7a: Heatmap nutzt dart.segment statt String-Reconstruction.
     * Distribution nutzt dart.multiplier statt d.hits / d.val Parsing.
     */
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
                        
                        const hits = d.isMiss ? 0 : d.multiplier;

                        if (hits > 0 && d.base > 0) {
                            totalMarks += hits;
                            if(hits === 1) distribution.singles++;
                            else if(hits === 2) distribution.doubles++;
                            else if(hits === 3) distribution.triples++;
                        }

                        // Einheitliche Heatmap über dart.segment
                        if (!d.isMiss && d.segment) {
                             heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
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
