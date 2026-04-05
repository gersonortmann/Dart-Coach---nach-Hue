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

    /**
     * Step 7a: Empfängt universelles Dart-Objekt.
     * points = Multiplier-Wert (S=1, D=2, T=3), NICHT base*multiplier.
     */
    handleInput: function(session, player, dart) {
        const currentRoundIdx = player.turns.length;
        const targetVal = session.targets[currentRoundIdx];

        // Treffer = kein Miss UND Basis trifft das aktuelle Zielfeld
        const isHit = !dart.isMiss && dart.base === targetVal;
        // Punkte = Multiplier (1/2/3) – aber nur bei Treffer auf das Ziel
        const points = isHit ? dart.multiplier : 0;

        player.currentResidual += points;
        dart._isHit = isHit;
        session.tempDarts.push({ ...dart, points });

        // Trefferquote live berechnen (Treffer auf Zielfeld / alle Würfe)
        let totalThrows = 0;
        let totalHits   = 0;
        (player.turns || []).forEach(t => (t.darts || []).forEach(d => {
            totalThrows++;
            if (d._isHit) totalHits++;
        }));
        (session.tempDarts || []).forEach(d => {
            totalThrows++;
            if (d._isHit) totalHits++;
        });
        player.liveHitRate = totalThrows > 0 ? ((totalHits / totalThrows) * 100).toFixed(1) + '%' : '0.0%';

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
                    action: 'NEXT_TURN',
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

    /**
     * Step 7a: Nutzt dart.isMiss, dart.multiplier, dart.segment direkt.
     * Heatmap-Reconstruction (15 Zeilen) → 3 Zeilen über dart.segment.
     */
    getResultData: function(session, player) {
        // Wir müssen durch die Runden iterieren, um sicherzugehen
        let hits = 0;
        let totalDarts = 0;
        
        // Alle Darts durchgehen und prüfen, ob sie als Treffer markiert wurden
        if (player.turns) {
            player.turns.forEach(t => {
                if (t.darts) {
                    t.darts.forEach(d => {
                        totalDarts++;
                        if (d._isHit) hits++;
                    });
                }
            });
        }
        
        // Singles/Doubles/Triples nur zählen, wenn es auch ein Treffer auf das Ziel war
        const validHitsList = player.turns.flatMap(t => t.darts || []).filter(d => d._isHit);
        
        const singles = validHitsList.filter(d => d.multiplier === 1).length;
        const doubles = validHitsList.filter(d => d.multiplier === 2).length;
        const triples = validHitsList.filter(d => d.multiplier === 3).length;
        
        const hitRate = totalDarts > 0 ? ((hits / totalDarts) * 100).toFixed(1) : "0.0";

        const chartLabels = session.targets.map(t => t === 25 ? 'B' : t);
        const chartValues = session.targets.map((_, i) => {
            const turn = player.turns[i];
            return turn ? turn.score : 0;
        });

        // Heatmap bleibt wie sie ist (zeigt wo die Pfeile gelandet sind)
        const heatmap = {};
        const allThrows = player.turns.flatMap(t => t.darts || []);
        allThrows.forEach(d => {
            if (!d.isMiss && d.segment) {
                heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
            }
        });

        return {
            summary: {
                score: player.currentResidual,
                hitRate: hitRate + "%",
                hits: hits,
                misses: totalDarts - hits
            },
            distribution: { singles, doubles, triples },
            chart: { labels: chartLabels, values: chartValues },
            heatmap: heatmap
        };
    }
};
