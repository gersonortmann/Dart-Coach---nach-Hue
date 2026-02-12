import { CHECKOUTS } from '../core/constants.js';

export const X01 = {
    
    config: {
        hasOptions: true,
        mode: 'mixed',
        defaultProInput: true,
		description: "Der Klassiker. Starte bei 501. Double Out."
    },

    generateTargets: function(settings) {
        return [settings.startScore];
    },

    initPlayer: function(player, settings, targets) {
        const startScore = parseInt(targets[0]); 
        player.currentResidual = startScore;
        if (player.legsWon === undefined) player.legsWon = 0;
        if (player.setsWon === undefined) player.setsWon = 0;
        
        player.startOfTurnResidual = startScore;
        player.hasDoubledIn = !settings.doubleIn;
    },

    /**
     * Step 7a: Empfängt jetzt ein universelles Dart-Objekt statt String.
     * dart.points, dart.multiplier, dart.segment – alles direkt verfügbar.
     */
    handleInput: function(session, player, dart) {
        const settings = session.settings;
        const result = this._processThrow(player, dart, settings);

        // Dart speichern: points = angerechnete Punkte (0 bei Bust/Double-In-Miss)
        session.tempDarts.push({ ...dart, points: result.points });
        
        // --- FALL 1: BUST ---
        if (result.status === 'BUST') {
            player.currentResidual = player.startOfTurnResidual;
            this._logTurn(player, session, { bust: true });

            return { 
				action: 'BUST', 
				overlay: { text: 'BUST', type: 'bust' }
			};
        }

        // --- FALL 2: MATCH/LEG WIN ---
        if (result.status === 'WIN') {
            this._logTurn(player, session, { isLegFinish: true });
            const winAction = this._checkMatchWin(session, player);
            
            return {
                action: winAction,
                overlay: { text: 'CHECK!', type: 'check' },
                points: result.points
            };
        }

        // --- FALL 3: DOUBLED IN (Spezialfall) ---
        if (result.status === 'DOUBLED_IN') {
             // Weiter mit CONTINUE
        }

        // --- FALL 4: NORMALER WEITERGANG ---
        if (session.tempDarts.length >= 3) {
            player.startOfTurnResidual = player.currentResidual;
            
            const totalScore = session.tempDarts.reduce((a, b) => a + b.points, 0);
            this._logTurn(player, session, {});

            let ovType = 'standard';
			let ovText = totalScore.toString();

			if (totalScore === 180) {
				ovType = '180';
			} else if (totalScore >= 140) {
				ovType = 'very-high';
			} else if (totalScore >= 100) {
				ovType = 'high';
			} else if (totalScore === 0) {
				ovType = 'miss';
				ovText = 'MISS';
			} else if (totalScore <= 10) { 
				 ovType = 'standard';
			}

			return { 
				action: 'NEXT_TURN', 
				overlay: { text: ovText, type: ovType }, 
				delay: (ovType === '180' ? 2500 : 1200)
			};
		}
        return { action: 'CONTINUE' };
    },

    // --- INTERNE HELPER ---

    _logTurn: function(player, session, flags) {
        const totalScore = session.tempDarts.reduce((a, b) => a + (b.points || 0), 0);
        player.turns.push({
            roundIndex: session.roundIndex,
            score: totalScore,
            darts: [...session.tempDarts],
            timestamp: Date.now(),
            ...flags
        });
    },

    _checkMatchWin: function(session, player) {
        const settings = session.settings;
        const legsNeeded = Math.ceil(settings.bestOf / 2);
        
        player.legsWon = (player.legsWon || 0) + 1;

        if (settings.mode === 'sets') {
             if (player.legsWon >= 3) {
                 player.setsWon = (player.setsWon || 0) + 1;
                 if (player.setsWon >= legsNeeded) return 'WIN_MATCH';
             }
             return 'WIN_LEG'; 
        } 
        
        if (player.legsWon >= legsNeeded) return 'WIN_MATCH';
        return 'WIN_LEG';
    },

    /**
     * Step 7a: Nutzt dart.points und dart.multiplier direkt.
     * _calculatePoints() ist komplett entfallen!
     */
    _processThrow: function(player, dart, settings) {
        const thrownPoints = dart.points;
        const isDoubleOut = settings.doubleOut;
        const isDoubleIn = settings.doubleIn;
        const hasDoubledIn = player.hasDoubledIn;
        const isDoubleHit = dart.multiplier === 2;

        // Check Double In
        if (isDoubleIn && !hasDoubledIn) {
            if (isDoubleHit) {
                player.hasDoubledIn = true;
                player.currentResidual -= thrownPoints;
                return { status: 'DOUBLED_IN', points: thrownPoints };
            }
            return { status: 'OK', points: 0 };
        }

        const newRest = player.currentResidual - thrownPoints;

        if (newRest < 0) return { status: 'BUST', points: 0 };
        if (isDoubleOut && newRest === 1) return { status: 'BUST', points: 0 };

        if (newRest === 0) {
            if (isDoubleOut) {
                return isDoubleHit ? { status: 'WIN', points: thrownPoints } : { status: 'BUST', points: 0 };
            }
            return { status: 'WIN', points: thrownPoints };
        }

        player.currentResidual -= thrownPoints;
        return { status: 'OK', points: thrownPoints };
    },

    handleWinLogik: function(session, player, result) {
        const opponent = session.players.find(p => p.id !== player.id);
        const scoreDisplay = `${player.legsWon}:${opponent ? opponent.legsWon : 0}`;
        const isMatch = (result.action === 'WIN_MATCH');
        
        if (session.settings.mode === 'sets') {
             const setScore = `${player.setsWon}:${opponent ? opponent.setsWon : 0}`;
             if (isMatch) {
                 return { messageTitle: "MATCH GEWONNEN!", messageBody: `🏆 ${player.name} gewinnt ${setScore} Sätze!`, nextActionText: "STATISTIK" };
             }
             return { messageTitle: "SATZ / LEG", messageBody: `Stand: ${setScore} Sätze (${scoreDisplay} Legs)`, nextActionText: "WEITER" };
        }
        
        if (isMatch) {
            return { messageTitle: "MATCH GEWONNEN!", messageBody: `🏆 ${player.name} gewinnt ${scoreDisplay}!`, nextActionText: "STATISTIK" };
        }
        return { messageTitle: "LEG GEWONNEN!", messageBody: `${player.name} checkt zum ${scoreDisplay}!`, nextActionText: "NÄCHSTES LEG" };
    },

    /**
     * Step 7a: Heatmap nutzt jetzt dart.segment statt dart.val
     */
    getResultData: function(session, player) {
         const turnScores = player.turns.map(t => t.score || 0);
         const totalPoints = turnScores.reduce((a,b) => a+b, 0);
         const totalDarts = player.turns.flatMap(t => t.darts || []).length;
         
         const avg = totalDarts > 0 ? ((totalPoints / totalDarts) * 3).toFixed(1) : "0.0";
         
         const allDarts = player.turns.flatMap(t => t.darts || []);
         const f9Darts = allDarts.slice(0, 9);
         const f9Sum = f9Darts.reduce((a, b) => a + (b.points || 0), 0);
         const f9Avg = f9Darts.length > 0 ? ((f9Sum / f9Darts.length) * 3).toFixed(1) : "-";
 
         let bestLegDarts = Infinity;
         let bestCheckout = 0;
         let currentLegDarts = 0;
         
         player.turns.forEach((t, idx) => {
             currentLegDarts += (t.darts ? t.darts.length : 3);
             if(t.isLegFinish) {
                 if(currentLegDarts < bestLegDarts) bestLegDarts = currentLegDarts;
                 if(t.score > bestCheckout) bestCheckout = t.score;
                 currentLegDarts = 0;
             } else {
                  const next = player.turns[idx+1];
                  if(next && next.roundIndex < t.roundIndex) currentLegDarts = 0;
             }
         });
         
         let c100 = 0, c140 = 0, c180 = 0;
         turnScores.forEach(s => {
             if(s === 180) c180++;
             else if(s >= 140) c140++;
             else if(s >= 100) c100++;
         });
 
         // Step 7a: Einheitliche Heatmap über dart.segment
         const heatmap = {};
         allDarts.forEach(d => {
             if (!d.isMiss && d.segment) {
                 heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
             }
         });
 
         const chartData = {
             labels: turnScores.map((_, i) => i + 1),
             values: turnScores
         };
 
         return {
             summary: { 
                 avg: avg, 
                 first9: f9Avg, 
                 bestLeg: bestLegDarts === Infinity ? '-' : bestLegDarts, 
                 checkout: bestCheckout || '-',
                 totalScore: totalPoints,
                 totalDarts: totalDarts
             },
             powerScores: { ton: c100, ton40: c140, max: c180 },
             heatmap: heatmap,
             chart: chartData
         };
     },
 
     getCheckoutGuide: function(score, dartsLeft) {
         if (score > 170 || score < 2) return ""; 
         const impossible3 = [169, 168, 166, 165, 163, 162, 159];
         if (impossible3.includes(score)) return "Nicht checkbar";
         if (dartsLeft === 1) {
             if (score === 50) return "Bull";
             if (score <= 40 && score % 2 === 0) return "D" + (score / 2);
             return "Nicht checkbar";
         }
         if (dartsLeft === 2) {
             if (score > 110) return "Nicht checkbar";
             const impossible2Standard = [99, 101, 102, 103, 104, 105, 106, 107, 108, 109];
             if (impossible2Standard.includes(score)) return "Nicht checkbar";
         }
         if(CHECKOUTS[score]) return CHECKOUTS[score];
         if(score <= 40 && score % 2 === 0) return "D" + (score/2);
         return "";
     }
};
