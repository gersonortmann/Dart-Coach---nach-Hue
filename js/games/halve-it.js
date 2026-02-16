/**
 * Halve It Strategy
 * "Split Score"
 */

export const HalveIt = {

    config: {
        hasOptions: true,
        description: "Das Risiko-Spiel. Triff das Ziel oder dein Punktestand wird halbiert! Start: 40 Punkte.",
        mode: 'pro',
        defaultProInput: true
    },

    // ── ZIELE DEFINIEREN ──
    generateTargets(options) {
        const opts = options || {};
        const mode = opts.mode || 'standard';
        const direction = opts.direction || 'descending'; 
        const useSpecials = (opts.useSpecials !== false); // Default: Ja (true)

        // 1. Definition der benötigten Anzahl an Zahlen & des Musters
        let countNeeded = 0;
        let pattern = []; // Array aus Zahlen (Anzahl Normale) und Strings (Sonderfeld-ID)

        if (useSpecials) {
            // -- MIT SONDERFELDERN --
            if (mode === 'short') {
                // Short: 2 Zahlen, Double, 2 Zahlen, Triple -> (4 Zahlen insgesamt)
                countNeeded = 4;
                pattern = [2, 'ANY_DOUBLE', 2, 'ANY_TRIPLE'];
            } 
            else if (mode === 'long') {
                // Long: 3, D, 3, T, 3, D, 3, T, 2, D, 1 -> (15 Zahlen insgesamt)
                countNeeded = 15;
                pattern = [
                    3, 'ANY_DOUBLE', 
                    3, 'ANY_TRIPLE', 
                    3, 'ANY_DOUBLE', 
                    3, 'ANY_TRIPLE', 
                    2, 'ANY_DOUBLE', 
                    1
                ];
            } 
            else {
                // Standard: 3, D, 2, T, 2, D, 1 -> (8 Zahlen insgesamt)
                countNeeded = 8;
                pattern = [3, 'ANY_DOUBLE', 2, 'ANY_TRIPLE', 2, 'ANY_DOUBLE', 1];
            }
        } else {
            // -- OHNE SONDERFELDER --
            if (mode === 'short') {
                countNeeded = 6; // 20 bis 15
            } else if (mode === 'long') {
                countNeeded = 20; // 20 bis 1
            } else {
                // Standard
                countNeeded = 11; // 20 bis 10
            }
            // Pattern ist hier einfach: Alles am Stück
            pattern = [countNeeded];
        }

        // 2. Zahlen-Pool generieren (immer von 20 abwärts startend)
        // Erzeugt z.B. bei countNeeded=4 -> ['20', '19', '18', '17']
        let numbers = Array.from({length: countNeeded}, (_, i) => String(20 - i));

        // 3. Sortierung auf den Zahlen-Pool anwenden
        if (direction === 'ascending') {
            numbers.reverse(); 
        } 
        else if (direction === 'random') {
            // Fisher-Yates Shuffle nur für die Zahlen
            for (let i = numbers.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
            }
        }
        // bei 'descending' bleibt es wie generiert (20, 19, ...)

        // 4. Finale Liste basierend auf Pattern zusammenbauen
        let finalTargets = [];
        let numberIdx = 0;

        for (let step of pattern) {
            if (typeof step === 'number') {
                // Nimm die nächsten X Zahlen aus dem sortierten Pool
                for (let i = 0; i < step; i++) {
                    if (numberIdx < numbers.length) {
                        finalTargets.push(numbers[numberIdx]);
                        numberIdx++;
                    }
                }
            } else {
                // Es ist ein Sonderfeld (String)
                finalTargets.push(step);
            }
        }

        // 5. Ende immer gleich
        finalTargets.push('BULL');
        finalTargets.push('ALL');

        return finalTargets;
    },

    // ── SPIELER STARTWERTE ──
    initPlayer(player, options, targets) {
        player.score = 40;          
        player.halvedCount = 0;     
        player.perfectRounds = 0;   
        player.turns = [];
    },

    // ── WURF LOGIK ──
    handleInput(session, player, dart) {
        const roundIdx = player.turns.length;
        const targetId = session.targets[roundIdx];
        
        const isHit = this._checkHit(targetId, dart);
        
        // Speichern (mit Hit-Flag)
        session.tempDarts.push({ ...dart, isTargetHit: isHit });

        // A) Wurf 1 oder 2: RUHE (Kein Overlay)
        if (session.tempDarts.length < 3) {
            return { 
                action: 'CONTINUE', 
                overlay: null 
            };
        }

        // B) Aufnahme beendet (3 Darts): Abrechnung & Overlay
        const hits = session.tempDarts.filter(d => d.isTargetHit).length;
        const roundScore = session.tempDarts.reduce((sum, d) => sum + (d.isTargetHit ? d.points : 0), 0);
        
        let overlayText = "";
        let overlayType = "";

        if (hits > 0) {
            // ERFOLG
            player.score += roundScore;
            if (hits === 3) player.perfectRounds++;
            
            // Grün / Check (Punkte)
            overlayText = `+${roundScore}`;
            overlayType = 'hit'; // check = Grün/Positiv in Hue
        } else {
            // VERSAGEN
            player.score = Math.floor(player.score / 2);
            player.halvedCount++;
            
            // Rot / Bust (Halbiert)
            overlayText = "HALBIERT";
            overlayType = 'bust'; // bust = Rot/Negativ in Hue
        }

        this._saveTurn(player, session.tempDarts, roundIdx, roundScore, hits === 0);

        // Spielende?
        if (roundIdx + 1 >= session.targets.length) {
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
                // Nur dieser Spieler ist fertig, andere müssen noch werfen
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
            delay: 2500
        };
    },

    // ── HELPER ──
    _checkHit(targetId, dart) {
        if (dart.isMiss) return false;

        switch (targetId) {
            case 'ANY_DOUBLE': return dart.multiplier === 2;
            case 'ANY_TRIPLE': return dart.multiplier === 3;
            case 'BULL':       return dart.base === 25; 
            case 'ALL':        return true; 
            default:           return dart.base === parseInt(targetId);
        }
    },

    _saveTurn(player, darts, roundIndex, scoreAdded, wasHalved) {
        player.turns.push({
            roundIndex: roundIndex,
            score: scoreAdded,
            wasHalved: wasHalved,
            totalScoreAfter: player.score,
            darts: [...darts]
        });
    },

    handleWinLogik(session, player, result) {
        return {
            messageTitle: "SPIEL BEENDET",
            messageBody: `${player.name} beendet mit ${player.score} Punkten.`,
            nextActionText: "STATISTIK"
        };
    },

    getResultData(session, player) {
        const chartValues = [40]; 
        player.turns.forEach(t => chartValues.push(t.totalScoreAfter));
        const chartLabels = ['Start', ...session.targets.map(this._formatTargetName)];

        const allThrows = player.turns.flatMap(t => t.darts || []);
        const heatmap = {};
        allThrows.forEach(d => {
            if (!d.isMiss && d.segment) {
                heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
            }
        });

        const totalDarts = allThrows.length;
        const validHits = allThrows.filter(d => d.isTargetHit).length;
        const hitRate = totalDarts > 0 ? Math.round((validHits / totalDarts) * 100) : 0;

        return {
            summary: {
                totalScore: player.score,
                avg: "-", // Halve It hat keinen klassischen Average
                checkoutRate: hitRate + "%", 
                hitRate: hitRate + "%",
                halvings: player.halvedCount,
                perfectRounds: player.perfectRounds
            },
            heatmap: heatmap,
            chart: {
                labels: chartLabels,
                datasets: [{
                    label: 'Score Verlauf',
                    data: chartValues,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: true,
                    stepped: true
                }]
            }
        };
    },

    _formatTargetName(t) {
        if (t === 'ANY_DOUBLE') return 'D';
        if (t === 'ANY_TRIPLE') return 'T';
        if (t === 'BULL') return 'B';
        if (t === 'ALL') return 'A';
        return t;
    }
};