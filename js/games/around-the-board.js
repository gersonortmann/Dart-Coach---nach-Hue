import { State } from '../core/state.js';

export const AroundTheBoard = {
    config: {
        hasOptions: true,
        description: "Der Klassiker! Triff die Zahlen von 1 bis 20 und Bull. Fehlschüsse zählen, bis du triffst."
    },

    generateTargets: function(options) {
        let targets = Array.from({ length: 20 }, (_, i) => i + 1);
        const mode = options.direction || 'ascending';
        
        if (mode === 'descending') {
            targets.reverse();
        } else if (mode === 'random') {
            for (let i = targets.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [targets[i], targets[j]] = [targets[j], targets[i]];
            }
        }
        targets.push(25);
        return targets;
    },

    initPlayer: function(player, options, targets) {
        player.currentResidual = 0; 
        player.totalDarts = 0;
        player.misses = 0;
        player.finished = false;
        player.turns = []; 
        player.variant = options.variant || 'full';
    },

    /**
     * Step 7a: Empfängt universelles Dart-Objekt.
     * input === 'HIT' → !dart.isMiss
     */
    handleInput: function(session, player, dart) {
        const currentTargetIdx = player.currentResidual; 
        const targetVal = session.targets[currentTargetIdx];
        
        player.totalDarts++;
        
        const isHit = !dart.isMiss;
        
        if (isHit) {
            player.currentResidual++; 
        } else {
            player.misses++;
        }

        session.tempDarts.push(dart);

        // 1. WIN CHECK
        if (player.currentResidual >= session.targets.length) {
            this._logTurn(session, player);
            player.finished = true;
            
            return { 
                action: 'NEXT_TURN', 
                overlay: { text: 'FINISH', type: 'check' } 
            };
        }

        // 2. RUNDENENDE CHECK (3 Darts geworfen)
        if (session.tempDarts.length >= 3) {
            this._logTurn(session, player);
            
            const hits = session.tempDarts.filter(d => !d.isMiss).length;
            let overlay = null;
            
            if (hits === 0) {
                overlay = { text: 'MISS', type: 'miss' };
            }

            return { 
                action: 'NEXT_TURN', 
                overlay: overlay,
                delay: overlay ? 1000 : 500 
            };
        }

        // 3. EINZELWURF
        return { action: 'CONTINUE' };
    },

    _logTurn: function(session, player) {
        const hitsInTurn = session.tempDarts.filter(d => !d.isMiss).length;
        player.turns.push({
            roundIndex: session.roundIndex,
            dartsThrown: session.tempDarts.length,
            hits: hitsInTurn,
            darts: [...session.tempDarts]
        });
    },
    
    _getPrefix: function(variant) {
        if (variant === 'double') return 'D';
        if (variant === 'triple') return 'T';
        if (variant.startsWith('single')) return 'S';
        return '';
    },

    handleWinLogik: function(session, player, result) {
        return {
            messageTitle: 'GAME FINISHED!',
            messageBody: `${player.name} benötigt ${player.totalDarts} Darts für den Kurs.`,
            nextActionText: 'ERGEBNIS'
        };
    },
    
    /**
     * Step 7a: d.isHit → !d.isMiss
     * Matrix-Logik bleibt ansonsten unverändert.
     */
    getResultData: function(session, player) {
        const totalDarts = player.totalDarts;
        const targetsHit = player.currentResidual; 
        const misses = player.misses;
        const hitRate = totalDarts > 0 ? ((targetsHit / totalDarts) * 100).toFixed(1) + "%" : "0.0%";

        // Matrix: Wie viele Darts pro Ziel?
        const matrix = [];
        const allDarts = player.turns.flatMap(t => t.darts || []);
        
        let dartPointer = 0;
        
        session.targets.forEach((tVal, idx) => {
            if (idx > player.currentResidual) return;
            
            let count = 0;
            let finished = false;
            
            while(dartPointer < allDarts.length) {
                const d = allDarts[dartPointer];
                dartPointer++;
                count++;
                
                if (!d.isMiss) {
                    finished = true;
                    break;
                }
            }
            
            if (count > 0 || idx === player.currentResidual) {
                const label = (tVal === 25) ? 'B' : tVal.toString();
                let heatClass = 'heat-low';
                if (count <= 1) heatClass = 'heat-high';
                else if (count <= 3) heatClass = 'heat-medium';
                
                if (!finished && idx === player.currentResidual) heatClass = 'heat-low'; 

                matrix.push({ label: label, val: count, heatClass: heatClass });
            }
        });

        return {
            summary: {
                score: totalDarts, 
                hitRate: hitRate,
                hits: targetsHit,
                misses: misses
            },
            distribution: { singles: 0, doubles: 0, triples: 0 },
			matrix: matrix,
            chart: { 
                labels: player.turns.map((_, i) => i + 1),
                values: player.turns.map((t, i) => {
                    let d = 0;
                    for(let k=0; k<=i; k++) d += player.turns[k].dartsThrown;
                    return d;
                })
            },
            heatmap: {} 
        };
    }
};
