import { State } from '../core/state.js';

export const Shanghai = {
    config: {
        hasOptions: true,
        defaultProInput: false,
        description: "Highscore-Jagd! Ein 'Shanghai' (Single, Double, Triple) gewinnt sofort."
    },

    generateTargets: function(options) {
        const limit = options.length === 'full' ? 20 : 7;
        let targets = Array.from({ length: limit }, (_, i) => i + 1);
        const mode = options.mode || 'ascending';
        if (mode === 'descending') {
            targets.reverse();
        } else if (mode === 'random') {
            for (let i = targets.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [targets[i], targets[j]] = [targets[j], targets[i]];
            }
        }
        return targets;
    },

    initPlayer: function(player, options, targets) {
        player.currentResidual = 0; 
        player.finished = false;
        player.turns = [];
    },

    handleInput: function(session, player, input) {
        const currentRoundIdx = player.turns.length;
        const target = session.targets[currentRoundIdx];
        
        let points = 0;
        let hitMultiplier = 0;
        
        if (!input.isMiss) {
            points = target * input.multiplier;
            hitMultiplier = input.multiplier;
        }
        
        player.currentResidual += points;
        session.tempDarts.push({ val: input, points: points });

        // 1. SHANGHAI CHECK (Sofort-Sieg bei S-D-T im 3. Dart)
        if (!input.isMiss && session.tempDarts.length === 3) {
            const m1 = session.tempDarts[0].val.multiplier; 
            const m2 = session.tempDarts[1].val.multiplier;
            const m3 = hitMultiplier; // der aktuelle
            
            const mSet = new Set([m1, m2, m3]);
            if (mSet.has(1) && mSet.has(2) && mSet.has(3)) {
                // Turn loggen
                const totalTurn = session.tempDarts.reduce((a,b)=>a+b.points,0);
                player.turns.push({ roundIndex: currentRoundIdx, score: totalTurn, darts: [...session.tempDarts] });
                
                // Ein echtes Shanghai beendet das Spiel sofort für alle!
                return { 
                    action: 'WIN_MATCH', 
                    overlay: { text: 'SHANGHAI!', type: 'check' },
                    suppressModal: true 
                };
            }
        }

        // 2. RUNDEN-ENDE CHECK
        // Wenn 3 Darts geworfen und es war die letzte Runde
        if (session.tempDarts.length === 3) {
             const totalTurn = session.tempDarts.reduce((a,b)=>a+b.points,0);
             player.turns.push({ roundIndex: currentRoundIdx, score: totalTurn, darts: [...session.tempDarts] });

             // War das die letzte Runde (z.B. Runde 7 von 7)?
             if (currentRoundIdx >= session.targets.length - 1) {
                 player.finished = true; // Spieler ist fertig
                 
                 // Wir geben NEXT_TURN zurück. Die GameEngine prüft dann, ob ALLE fertig sind.
                 // Wenn ja, beendet sie das Spiel. Wenn nein, kommt der nächste Spieler.
                 return { 
                     action: 'NEXT_TURN', 
                     overlay: { text: "FINISH", type: 'check' }
                 };
             }

             // Normale Runde vorbei
             let ovText = totalTurn.toString();
             let ovType = 'standard';
             if (totalTurn === 0) { ovText = "MISS"; ovType = 'miss'; }

             return { action: 'NEXT_TURN', overlay: { text: ovText, type: ovType }, delay: 1000 };
        }

        return { action: 'CONTINUE' };
    },

    handleWinLogik: function(session, player, result) {
         if (result.overlay && result.overlay.text === 'SHANGHAI!') {
             return {
                messageTitle: 'SHANGHAI! 💎',
                messageBody: `${player.name} wirft ein perfektes Shanghai!`,
                nextActionText: 'ERGEBNIS'
            };
         }
         return {
            messageTitle: 'SPIELENDE',
            messageBody: `${player.name} beendet mit ${player.currentResidual} Punkten.`,
            nextActionText: 'ERGEBNIS'
        };
    },
    
    getResultData: function(session, player) {
        const allThrows = player.turns.flatMap(t => t.darts || []);
        const hits = allThrows.filter(d => !d.val.isMiss && d.val.multiplier > 0);
        const singles = hits.filter(d => d.val.multiplier === 1).length;
        const doubles = hits.filter(d => d.val.multiplier === 2).length;
        const triples = hits.filter(d => d.val.multiplier === 3).length;
        
        const heatmap = {};
        player.turns.forEach((turn, roundIdx) => {
            const target = session.targets[roundIdx];
            if (!turn.darts) return;
            turn.darts.forEach(d => {
                const input = d.val;
                if (input && !input.isMiss) {
                    const prefix = input.multiplier === 3 ? "T" : (input.multiplier === 2 ? "D" : "S");
                    const segId = prefix + target;
                    heatmap[segId] = (heatmap[segId] || 0) + 1;
                }
            });
        });

        const chartLabels = session.targets.slice(0, player.turns.length);
        const chartValues = player.turns.map(t => t.score);

        return {
            summary: {
                score: player.currentResidual,
                hitRate: allThrows.length > 0 ? ((hits.length / allThrows.length) * 100).toFixed(1) + "%" : "0.0%",
                hits: hits.length,
                misses: allThrows.length - hits.length
            },
            distribution: { singles, doubles, triples },
            chart: { labels: chartLabels, values: chartValues },
            heatmap: heatmap
        };
    }
};