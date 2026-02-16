import { CHECKOUTS } from '../core/constants.js';

export const CheckoutChallenge = {

    config: {
        hasOptions: true,
        description: "Checkout Training: Du hast genau 3 Darts pro Zahl. Checkst du, gibt es Punkte. Wenn nicht, kommt sofort die nächste Zahl.",
        mode: 'pro',            
        defaultProInput: true
    },

    // ── ZIELE DEFINIEREN (NEU: Basiert auf CHECKOUTS Konstante) ──
    generateTargets(options) {
        const opts = options || {};
        const difficulty = opts.difficulty || 'standard';
        const rounds = opts.rounds || 10;
        
        // Deine definierten Ranges
        const RANGES = {
            easy:     { min: 40, max: 80 },
            standard: { min: 60, max: 120 }, // "Normal"
            hard:     { min: 100, max: 170 }
        };

        const range = RANGES[difficulty] || RANGES.standard;

        // 1. Alle Keys aus CHECKOUTS holen (das sind alle validen Checkouts)
        // 2. In Zahlen umwandeln
        // 3. Filtern basierend auf Min/Max der gewählten Difficulty
        const validTargets = Object.keys(CHECKOUTS)
            .map(Number)
            .filter(val => val >= range.min && val <= range.max);

        // Fallback, falls keine Targets gefunden würden (theoretisch unmöglich bei den Ranges)
        if (validTargets.length === 0) validTargets.push(40);

        const targets = [];
        
        // Zufällige Ziele aus dem gefilterten Pool ziehen
        for (let i = 0; i < rounds; i++) {
            const randomIdx = Math.floor(Math.random() * validTargets.length);
            targets.push(validTargets[randomIdx]);
        }
        
        return targets;
    },

    // ── SPIELER STARTWERTE ──
    initPlayer(player, options, targets) {
        player.score = 0;           
        player.checkoutsHit = 0;    
        
        player._roundIdx = 0;       
        player._residual = targets[0]; 
        player._startOfTurnRes = targets[0]; 
        player.turns = [];
    },

    // ── WURF LOGIK ──
    handleInput(session, player, dart) {
        // Fallback Safety
        if (player._residual === undefined) {
             player._residual = session.targets[0];
             player._startOfTurnRes = player._residual;
        }

        const currentTarget = session.targets[player._roundIdx];
        const val = dart.points;
        const doubleOutRequired = (session.settings.doubleOut !== false); // Default true
        const isDouble = (dart.multiplier === 2);
        const newResidual = player._residual - val;

        session.tempDarts.push(dart);
	
        // 1. CHECKOUT GESCHAFFT (WIN)
        if (newResidual === 0 && (!doubleOutRequired || isDouble)) {
            // Punkte: Wert des Checkouts + Bonus (5 Punkte pro gespartem Dart)
            const dartsThrown = session.tempDarts.length;
            const bonus = (3 - dartsThrown) * 5; 
            
            player.score += (currentTarget + bonus);
            player.checkoutsHit++;
            
            this._saveTurn(player, session.tempDarts, player._roundIdx);
            
            return this._nextTarget(session, player, { text: 'CHECK', type: 'check' });
        }

        // 2. BUST (Überworfen oder Rest 1)
        if (newResidual <= 1) {
            this._saveTurn(player, session.tempDarts, player._roundIdx);
            return this._nextTarget(session, player, { text: 'BUST', type: 'bust' });
        }

        // 3. NORMALE PUNKTE (Noch im Rennen)
        player._residual = newResidual;

        // Wenn noch Darts übrig sind (weniger als 3)
        if (session.tempDarts.length < 3) {
            return { 
                action: 'CONTINUE'
            };
        }

        // 4. AUFNAHME VORBEI OHNE CHECK (FAIL)
        this._saveTurn(player, session.tempDarts, player._roundIdx);
        return this._nextTarget(session, player, { text: 'MISS', type: 'miss' });
    },

    // Helper: Schaltet auf das nächste Ziel weiter
    _nextTarget(session, player, overlay) {
        player._roundIdx++;

        // Spiel vorbei?
        if (player._roundIdx >= session.targets.length) {
            player.finished = true;
            
            // Multiplayer Sync Check
            const allFinished = session.players.every(p => p.finished);

            if (allFinished) {
                return { 
                    action: 'WIN_MATCH', 
                    overlay: { text: 'FERTIG', type: 'match-win' } 
                };
            } else {
                // Warten auf andere
                return {
                    action: 'NEXT_TURN',
                    overlay: overlay,
                    delay: 2500
                };
            }
        }

        // Nächstes Ziel vorbereiten
        const nextVal = session.targets[player._roundIdx];
        player._residual = nextVal;
        player._startOfTurnRes = nextVal;

        return {
            action: 'NEXT_TURN',
            overlay: overlay,
            delay: 2000
        };
    },

    _saveTurn(player, darts, roundIndex) {
        const score = darts.reduce((a, b) => a + b.points, 0);
        player.turns.push({
            roundIndex: roundIndex,
            score: score,
            darts: [...darts]
        });
    },

    // ── CHECKOUT GUIDE ──
    getCheckoutGuide: function(score, dartsLeft) {
        if (score > 170 || score < 2) return ""; 
        
        // Unmögliche Zahlen (Bogey Numbers) abfangen
        const impossible3 = [169, 168, 166, 165, 163, 162, 159];
        if (impossible3.includes(score)) return ""; 

        // 1 Dart Finish
        if (dartsLeft === 1) {
            if (score === 50) return "Bull";
            if (score <= 40 && score % 2 === 0) return "D" + (score / 2);
            return "";
        }
        
        // 2 Dart Finish Limits
        if (dartsLeft === 2) {
            if (score > 110) return "";
            const impossible2 = [99, 101, 102, 103, 104, 105, 106, 107, 108, 109];
            if (impossible2.includes(score)) return "";
        }

        // 1. Priorität: Konstante Liste
        if(CHECKOUTS[score]) return CHECKOUTS[score];
        
        // 2. Priorität: Restwege für 41-60 berechnen (auf Tops oder D16)
        if (score > 40 && score <= 60) {
            let remainder = score - 40;
            if (remainder > 0 && remainder <= 20) return `S${remainder} D20`;
            remainder = score - 32;
            if (remainder > 0 && remainder <= 20) return `S${remainder} D16`;
        }
        
        // 3. Priorität: Kleine gerade Zahlen
        if(score <= 40 && score % 2 === 0) return "D" + (score/2);
        
        return "";
    },

    handleWinLogik(session, player, result) {
        return {
            messageTitle: "CHALLENGE BEENDET",
            messageBody: `${player.name} holt ${player.score} Punkte (${player.checkoutsHit} Finishs).`,
            nextActionText: "STATISTIK"
        };
    },

    getResultData(session, player) {
        const totalTargets = session.targets.length;
        // Berechnung der Erfolgsquote
        const rate = totalTargets > 0 ? Math.round((player.checkoutsHit / totalTargets) * 100) : 0;
        
        // Heatmap Daten sammeln (alle geworfenen Darts)
        const allThrows = player.turns.flatMap(t => t.darts || []);
        const heatmap = {};
        allThrows.forEach(d => {
            if (!d.isMiss && d.segment) {
                heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
            }
        });

        // Chart Daten vorbereiten (Kumulierter Score-Verlauf)
        // Wir gehen durch alle Turns und addieren den Score laufend auf
        let currentTotal = 0;
        const chartValues = [];
        const chartLabels = [];

        // Wir nutzen session.targets für die Labels (z.B. "80", "121", "40")
        // und player.turns für die Punkte.
        // Achtung: player.turns enthält nur abgeschlossene Runden.
        
        player.turns.forEach((turn, index) => {
            currentTotal += turn.score; // turn.score ist entweder 0 (Miss) oder Punkte (Check)
            chartValues.push(currentTotal);
            
            // Label ist das Ziel dieser Runde (z.B. "121")
            const targetVal = session.targets[index]; 
            chartLabels.push(String(targetVal));
        });

        return {
            summary: {
                totalScore: player.score,        // Haupt-Score
                checkoutsHit: player.checkoutsHit,
                checkoutsTotal: totalTargets,
                checkoutRate: `${rate}%`         // "40%"
            },
            heatmap: heatmap,
            chart: {
                labels: chartLabels,
                datasets: [{
                    label: 'Punkteverlauf',
                    data: chartValues,
                    borderColor: '#e11d48', // Passendes Rot/Pink zum Spiel
                    backgroundColor: 'rgba(225, 29, 72, 0.1)',
                    fill: true
                }]
            }
        };
    }
};