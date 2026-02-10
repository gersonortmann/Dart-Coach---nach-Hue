import { State } from '../core/state.js';

export const SingleTraining = {
    config: {
        hasOptions: true,
        defaultProInput: false 
    },

    generateTargets: function(options) {
        let targets = Array.from({ length: 20 }, (_, i) => i + 1);
        targets.push(25); // Bullseye
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
        
        let points = 0;
        if (!input.isMiss) {
            points = input.multiplier; 
        }

        player.currentResidual += points;
        session.tempDarts.push({ val: input, points: points });
        
        // 3 Darts Check
        if (session.tempDarts.length >= 3) {
             const totalTurn = session.tempDarts.reduce((a,b)=>a+b.points,0);
             player.turns.push({
                roundIndex: currentRoundIdx,
                score: totalTurn,
                darts: [...session.tempDarts]
             });
             
             // WIN CONDITION: War das die 21. Runde (Index 20)?
             if (currentRoundIdx >= 20) {
                 player.finished = true;
                 return { 
                    action: 'NEXT_TURN', // Engine prüft "allFinished"
                    overlay: { text: "FINISH", type: 'check' } 
                };
             }
             
             let ovText = totalTurn.toString();
             let ovType = 'standard';
             if (totalTurn === 0) { ovText = "MISS"; ovType = 'miss'; }

             return { action: 'NEXT_TURN', overlay: { text: ovText, type: ovType }, delay: 800 };
        }

        return { action: 'CONTINUE' };
    },

    handleWinLogik: function(session, player, result) {
         return {
            messageTitle: 'TRAINING BEENDET!',
            messageBody: `${player.name} hat ${player.currentResidual} Punkte erzielt.`,
            nextActionText: 'ZUR STATISTIK'
        };
    },

    getResultData: function(session, player) {
        const allThrows = player.turns.flatMap(t => t.darts || []);
        const totalDarts = allThrows.length;
        const hits = allThrows.filter(d => !d.val.isMiss && d.val.multiplier > 0);
        
        const singles = hits.filter(d => d.val.multiplier === 1).length;
        const doubles = hits.filter(d => d.val.multiplier === 2).length;
        const triples = hits.filter(d => d.val.multiplier === 3).length;
        
        const hitRate = totalDarts > 0 ? ((hits.length / totalDarts) * 100).toFixed(1) : "0.0";

        const chartLabels = session.targets.map(t => t === 25 ? 'B' : t);
        const chartValues = session.targets.map((_, i) => {
            const turn = player.turns[i];
            return turn ? turn.score : 0;
        });

        const heatmap = {};
        player.turns.forEach((turn, roundIdx) => {
            const target = session.targets[roundIdx];
            if (!turn.darts) return;
            turn.darts.forEach(d => {
                const input = d.val;
                if (input.isMiss) return;
                let segId = "";
                if (target === 25) {
                    segId = input.multiplier === 2 ? "50" : "25";
                } else {
                    const prefix = input.multiplier === 3 ? "T" : (input.multiplier === 2 ? "D" : "S");
                    segId = prefix + target;
                }
                heatmap[segId] = (heatmap[segId] || 0) + 1;
            });
        });

        return {
            summary: {
                score: player.currentResidual,
                hitRate: hitRate + "%",
                hits: hits.length,
                misses: totalDarts - hits.length
            },
            distribution: { singles, doubles, triples },
            chart: { labels: chartLabels, values: chartValues },
            heatmap: heatmap
        };
    }
};