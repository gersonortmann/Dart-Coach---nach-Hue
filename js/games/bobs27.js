import { State } from '../core/state.js';

export const Bobs27 = {
    config: {
        hasOptions: false, 
        description: "Starte mit 27 Punkten. Triff die Doppel. Fehlwurf kostet."
    },

    generateTargets: function(options) {
        return [...Array.from({ length: 20 }, (_, i) => i + 1), 25];
    },

    initPlayer: function(player, options, targets) {
        player.currentResidual = 27; 
        player.scoreHistory = [27];  
        player.isEliminated = false;
        player.turns = [];
        player.finished = false;
    },

    /**
     * Step 7a: Empfängt universelles Dart-Objekt.
     * Bob's 27 nutzt Aggregate-Mode: Ein Klick pro Runde ({hits: 0-3}).
     * normalizeDart() setzt _isAggregate + _aggregateHits auf dem Dart.
     * 
     * Phase B (Zukunft mit Autodarts): Per-Dart-Mode mit
     *   hits = (dart.multiplier === 2 && dart.base === target) ? 1 : 0
     */
    handleInput: function(session, player, dart) {
        const currentRoundIdx = player.turns.length;
        const targets = session.targets;
        
        if (currentRoundIdx >= targets.length) return { action: 'FINISH_GAME' };

        const targetVal = targets[currentRoundIdx];
        
        // Aggregate-Mode (Keypad): _aggregateHits enthält 0-3
        // Per-Dart-Mode (Zukunft): Prüfe ob es ein Double auf das Target ist
        const hits = dart._isAggregate 
            ? dart._aggregateHits 
            : (dart.multiplier === 2 && dart.base === targetVal ? 1 : 0);
        
        const targetScoreValue = targetVal * 2; // Bull 25 * 2 = 50, D20 = 40
        
        let scoreChange = 0;
        
        if (hits > 0) {
            scoreChange = targetScoreValue * hits;
            player.currentResidual += scoreChange;
        } else {
            scoreChange = -targetScoreValue;
            player.currentResidual += scoreChange;
        }

        player.scoreHistory.push(player.currentResidual);
        
		session.tempDarts.push(dart);
		
        // Turn Loggen
        player.turns.push({
            hits: hits,
            score: player.currentResidual,
            change: scoreChange,
            target: targetVal
        });

        // Overlay Setup
        let overlayText = scoreChange > 0 ? "+" + scoreChange : scoreChange.toString();
        let overlayType = scoreChange > 0 ? 'check' : 'miss';
        let action = 'NEXT_TURN';

        // K.O. Prüfung
        if (player.currentResidual < 0) {
            player.isEliminated = true;
            player.finished = true;
            
            overlayText = "BUST";
            overlayType = 'bust'; 
        }

        // Ende Prüfung
        if (currentRoundIdx === targets.length - 1) {
            player.finished = true;
            if (!player.isEliminated) {
                action = 'FINISH_GAME'; 
            }
        }

        return {
            action: action,
            overlay: { text: overlayText, type: overlayType },
            delay: 1200 
        };
    },

    getResultData: function(session, player) {
        const labels = session.targets.slice(0, player.scoreHistory.length).map(t => {
            return t === 25 ? "BULL" : "D" + t;
        });

        const totalHits = player.turns.reduce((acc, t) => acc + (t.hits || 0), 0);
        const totalRounds = player.turns.length;
        const maxScore = Math.max(...player.scoreHistory);
        
        let statusText = "SURVIVED";
        let statusClass = "res-win";
        if (player.isEliminated || player.currentResidual < 0) {
            statusText = "BUSTED";
            statusClass = "res-loss";
        }

        return {
            summary: {
                finalScore: player.currentResidual,
                statusText: statusText,     
                statusClass: statusClass,   
                totalHits: totalHits,
                maxScore: maxScore,
                roundsPlayed: totalRounds
            },
            chart: {
                labels: labels,
                values: player.scoreHistory
            },
            history: player.turns.map((t, idx) => ({
                round: idx + 1,
                target: session.targets[idx] === 25 ? "BULL" : "D" + session.targets[idx],
                hits: t.hits,
                change: t.change,
                scoreAfter: t.score
            })).reverse()
        };
    }
};
