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

    handleInput: function(session, player, input) {
        const currentTargetIdx = player.currentResidual; 
        const targetVal = session.targets[currentTargetIdx];
        
        player.totalDarts++;
        
        // Input ist 'HIT' oder 'MISS'
        let isHit = (input === 'HIT');
        
        if (isHit) {
            player.currentResidual++; 
        } else {
            player.misses++;
        }

        session.tempDarts.push({ 
            val: input, 
            isHit: isHit, 
            target: targetVal 
        });

        // 1. WIN CHECK (Geändert für Nachziehen)
        if (player.currentResidual >= session.targets.length) {
            this._logTurn(session, player);
            player.finished = true; // Spieler markieren
            
            // WICHTIG: NEXT_TURN statt WIN_MATCH
            // Die Engine prüft dann "Are all players finished?"
            return { 
                action: 'NEXT_TURN', 
                overlay: { text: 'FINISH', type: 'check' } 
            };
        }

        // 2. RUNDENENDE CHECK (3 Darts geworfen)
        if (session.tempDarts.length >= 3) {
            this._logTurn(session, player);
            
            const hits = session.tempDarts.filter(d => d.isHit).length;
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
        const hitsInTurn = session.tempDarts.filter(d => d.isHit).length;
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
    
    getResultData: function(session, player) {
        const totalDarts = player.totalDarts;
        const targetsHit = player.currentResidual; 
        const misses = player.misses;
        const hitRate = totalDarts > 0 ? ((targetsHit / totalDarts) * 100).toFixed(1) + "%" : "0.0%";

        // --- MATRIX BERECHNUNG (NEU) ---
        // Wir rekonstruieren: Wie viele Darts pro Ziel?
        const matrix = [];
        const allDarts = player.turns.flatMap(t => t.darts || []);
        
        // Wir iterieren über die ZIELE der Session
        let dartPointer = 0;
        
        session.targets.forEach((tVal, idx) => {
            // Wenn Spieler dieses Ziel noch nicht erreicht hat (bei Abbruch), stoppen
            if (idx > player.currentResidual) return;
            
            let count = 0;
            let finished = false;
            
            // Suche im Dart-Stream ab dartPointer
            while(dartPointer < allDarts.length) {
                const d = allDarts[dartPointer];
                dartPointer++;
                count++;
                
                if (d.isHit) {
                    finished = true;
                    break; // Ziel getroffen, weiter zum nächsten
                }
            }
            
            // Nur hinzufügen, wenn wir auch Darts geworfen haben für dieses Ziel
            // oder wenn es das aktuelle Ziel ist (auch bei 0 Hits)
            if (count > 0 || idx === player.currentResidual) {
                const label = (tVal === 25) ? 'B' : tVal.toString();
                // Heatmap Logik für Farben
                let heatClass = 'heat-low'; // Rot/Schlecht
                if (count <= 1) heatClass = 'heat-high'; // Perfekt (1 Dart)
                else if (count <= 3) heatClass = 'heat-medium'; // Okay (1 Runde)
                
                // Falls noch nicht getroffen (aktuelles Ziel bei Abbruch):
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