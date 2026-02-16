/**
 * Scoring Drill Strategy
 * Ziel: Maximiere den Score innerhalb eines Dart-Limits (z.B. 99 Darts).
 */

export const ScoringDrill = {

    config: {
        hasOptions: true,
        description: "Highscore Jagd! Wirf so viele Punkte wie möglich mit einer begrenzten Anzahl an Darts (z.B. 99).",
        mode: 'pro',
        defaultProInput: true
    },

    // ── ZIELE ──
    // Wir brauchen keine spezifischen Targets, aber wir nutzen targets
    // um dem System das Limit mitzuteilen (optional) oder einfach als Dummy.
    generateTargets(options) {
        return ['HIGHSCORE'];
    },

    // ── INIT ──
    initPlayer(player, options, targets) {
        player.score = 0;
        player.dartsThrown = 0;
        // Limit speichern wir direkt am Spieler für schnellen Zugriff
        player.dartLimit = options.dartLimit || 99; 
        
        // Statistik-Zähler
        player.stats = {
            ton: 0,     // 100+
            ton40: 0,   // 140+
            max: 0      // 180
        };
        
        player.turns = [];
    },

    // ── INPUT ──
    // ── INPUT ──
    handleInput(session, player, dart) {
        const val = dart.points;
        player.score += val;
        player.dartsThrown++;
        
        session.tempDarts.push(dart);
		
		// --- LIVE STATS: PPT (Points per Turn) ---
		const totalScoreDrill = player.score; 
    
		// Wir sind aktuell in einer Runde, also ist turns.length die Anzahl der *beendeten* Runden.
		// Für den Durchschnitt müssen wir die aktuelle (laufende) Runde als 1 zählen.
		const drillTurns = player.turns.length + 1;

		let ppt = 0;
		if (drillTurns > 0) {
			ppt = totalScoreDrill / drillTurns;
		}

		player.livePpt = ppt.toFixed(1);
		
        // A) Wurf 1 & 2: Kein Overlay, weiterwerfen
        if (session.tempDarts.length < 3) {
            return { 
                action: 'CONTINUE', 
                overlay: null 
            };
        }

        // B) Wurf 3 (Aufnahme beendet): Abrechnung
        const turnScore = session.tempDarts.reduce((a,b) => a + b.points, 0);
        
        // Statistik pflegen
        if (turnScore === 180) player.stats.max++;
        else if (turnScore >= 140) player.stats.ton40++;
        else if (turnScore >= 100) player.stats.ton++;

        this._saveTurn(player, session.tempDarts, turnScore);

        // Overlay Logik (Farbe & Text)
        let overlayType = 'miss';
        let overlayText = "Miss";

        if (turnScore > 0) {
            overlayType = 'hit'; // Grün (für Punkte > 0)
            overlayText = String(turnScore);
        }

        // Prüfen: Limit erreicht?
        if (player.dartsThrown >= player.dartLimit) {
            player.finished = true;
            
            // MULTIPLAYER CHECK: Sind ALLE fertig?
            const allFinished = session.players.every(p => p.finished);
            
            if (allFinished) {
                return { 
                    action: 'WIN_MATCH', 
                    overlay: { text: overlayText, type: overlayType },
                    delay: 2000
                };
            } else {
                // Dieser Spieler ist fertig, aber andere müssen noch werfen.
                // Wir geben einfach an den nächsten weiter.
                // Overlay zeigen wir trotzdem kurz an.
                return {
                    action: 'NEXT_TURN',
                    overlay: { text: overlayText, type: overlayType },
                    delay: 2000
                };
            }
        }

        return { 
            action: 'NEXT_TURN', 
            overlay: { text: overlayText, type: overlayType },
            delay: 2000
        };
    },

    _saveTurn(player, darts, turnScore) {
        player.turns.push({
            roundIndex: Math.floor((player.dartsThrown - 1) / 3),
            score: turnScore,
            totalScoreAfter: player.score,
            darts: [...darts]
        });
    },

    handleWinLogik(session, player, result) {
        // Highscore-Logik: Der mit den meisten Punkten steht oben
        // Das sortiert ui-result.js, hier nur die Message
        return {
            messageTitle: "DRILL BEENDET",
            messageBody: `${player.name} erreicht ${player.score} Punkte!`,
            nextActionText: "STATISTIK"
        };
    },

    getResultData(session, player) {
        // Average berechnen
        const avg = player.dartsThrown > 0 
            ? ((player.score / player.dartsThrown) * 3).toFixed(1) 
            : "0.0";

        // Chart Daten (Score Accumulation)
        const chartValues = [0];
        player.turns.forEach(t => chartValues.push(t.totalScoreAfter));
        const chartLabels = chartValues.map((_, i) => i === 0 ? 'Start' : String(i));

        // Heatmap
        const allThrows = player.turns.flatMap(t => t.darts || []);
        const heatmap = {};
        allThrows.forEach(d => {
            if (!d.isMiss && d.segment) {
                heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
            }
        });

        return {
            summary: {
                totalScore: player.score,
                avg: avg,
                dartsThrown: player.dartsThrown,
                limit: player.dartLimit
            },
            powerScores: player.stats, // { ton, ton40, max }
            heatmap: heatmap,
            chart: {
                labels: chartLabels,
                datasets: [{
                    label: 'Gesamtscore',
                    data: chartValues,
                    borderColor: '#0ea5e9', // Cyan/Blau
                    backgroundColor: 'rgba(14, 165, 233, 0.1)',
                    fill: true
                }]
            }
        };
    }
};