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

    /**
     * Step 7a: Empfängt universelles Dart-Objekt.
     * dart.points = base × multiplier = target × multiplier → passt direkt!
     */
    handleInput: function(session, player, dart) {
        const currentRoundIdx = player.turns.length;
        const target = session.targets[currentRoundIdx];
        
        let points = 0;
        let hitMultiplier = 0;
        
        if (!dart.isMiss) {
            points = dart.points;         // base × multiplier (bereits korrekt!)
            hitMultiplier = dart.multiplier;
        }
        
        dart._isHit = !dart.isMiss && dart.base === target;
        // Punkte nur auf das Zielfeld zählen
        const hitPoints = dart._isHit ? dart.points : 0;
        player.currentResidual += hitPoints;
		session.tempDarts.push(dart);

		// Live-Trefferquote für Spieler-Header
		const pastDarts  = player.turns.flatMap(t => t.darts || []);
		const allDarts   = [...pastDarts, ...session.tempDarts];
		const totalHits  = allDarts.filter(d => d._isHit).length;
		player.liveHitRate = allDarts.length > 0
			? ((totalHits / allDarts.length) * 100).toFixed(1) + '%'
			: '0.0%';

        // 1. SHANGHAI CHECK (S-D-T im 3. Dart)
        if (!dart.isMiss && session.tempDarts.length === 3) {
            const m1 = session.tempDarts[0].multiplier; 
            const m2 = session.tempDarts[1].multiplier;
            const m3 = hitMultiplier;
            
            const mSet = new Set([m1, m2, m3]);
            if (mSet.has(1) && mSet.has(2) && mSet.has(3)) {
                const totalTurn = session.tempDarts.filter(d=>d._isHit).reduce((a,b)=>a+b.points,0);
                player.turns.push({ roundIndex: currentRoundIdx, score: totalTurn, darts: [...session.tempDarts] });
                
                return { 
                    action: 'WIN_MATCH', 
                    overlay: { text: 'SHANGHAI!', type: 'check' },
                    suppressModal: true 
                };
            }
        }

        // 2. RUNDEN-ENDE CHECK
        if (session.tempDarts.length === 3) {
             const totalTurn = session.tempDarts.filter(d=>d._isHit).reduce((a,b)=>a+b.points,0);
             player.turns.push({ roundIndex: currentRoundIdx, score: totalTurn, darts: [...session.tempDarts] });

             if (currentRoundIdx >= session.targets.length - 1) {
                 player.finished = true;
                 return { 
                     action: 'NEXT_TURN', 
                     overlay: { text: "FINISH", type: 'check' }
                 };
             }

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
    
    /**
     * Step 7a: Heatmap über dart.segment statt Reconstruction.
     * Distribution über dart.multiplier statt d.val.multiplier.
     */
    getResultData: function(session, player) {
        const allThrows = player.turns.flatMap(t => t.darts || []);
        // Nur Darts die das Rundziel getroffen haben zählen als "Treffer"
        const hits = allThrows.filter(d => d._isHit);
        const singles = hits.filter(d => d.multiplier === 1).length;
        const doubles = hits.filter(d => d.multiplier === 2).length;
        const triples = hits.filter(d => d.multiplier === 3).length;
        
        // Heatmap: alle Darts (auch Nicht-Ziel-Treffer zeigen wo man wirft)
        const heatmap = {};
        allThrows.forEach(d => {
            if (!d.isMiss && d.segment) {
                heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
            }
        });

        const chartLabels = session.targets.slice(0, player.turns.length);
        const chartValues = player.turns.map(t => t.score);

        return {
            summary: {
                score: player.currentResidual,
                hitRate: allThrows.length > 0 ? ((hits.length / allThrows.length) * 100).toFixed(1) + "%" : "0.0%",
                hits: hits.length,
                misses: allThrows.length - hits.length   // Fehlwürfe = alles ohne _isHit
            },
            distribution: { singles, doubles, triples },
            chart: { labels: chartLabels, values: chartValues },
            heatmap: heatmap
        };
    }
};
