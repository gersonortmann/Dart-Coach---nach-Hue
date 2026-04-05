import { CHECKOUTS } from '../core/constants.js';

export const CheckoutChallenge = {

    config: {
        hasOptions: true,
        description: "Checkout Training: Checke zufällige Werte. Wähle 1–3 Aufnahmen pro Ziel.",
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
        player._turnOnTarget = 0;   // Welche Aufnahme auf dem aktuellen Ziel (0-basiert)
        player.turns = [];
    },

    // ── WURF LOGIK ──
    handleInput(session, player, dart) {
        // Lazy Apply + Snapshot-Cleanup: am ersten Dart der neuen Aufnahme
        delete player._completedRoundDisplay; // Time-Machine-Snapshot löschen
        if (player._pendingCCReset) {
            const p = player._pendingCCReset;
            player._residual       = p.residual;
            player._startOfTurnRes = p.startOfTurnRes;
            player._turnOnTarget   = p.turnOnTarget;
            delete player._pendingCCReset;
        }

        // Fallback Safety
        if (player._residual === undefined) {
             player._residual = session.targets[0];
             player._startOfTurnRes = player._residual;
        }

        const currentTarget = session.targets[player._roundIdx];
        const maxTurns = session.settings.turnsPerTarget || 1;
        const val = dart.points;
        const doubleOutRequired = (session.settings.doubleOut !== false);
        const isDouble = (dart.multiplier === 2);
        const newResidual = player._residual - val;

        // _isHit: Dart hat den Restwert sauber reduziert (kein Bust, kein Miss)
        dart._isHit = !dart.isMiss && newResidual >= 0;
        session.tempDarts.push(dart);
	
        // 1. CHECKOUT GESCHAFFT
        if (newResidual === 0 && (!doubleOutRequired || isDouble)) {
            // Bonus: gespartes Darts über ALLE Aufnahmen auf dieses Ziel
            const totalMaxDarts = maxTurns * 3;
            const totalUsedDarts = (player._turnOnTarget * 3) + session.tempDarts.length;
            const bonus = (totalMaxDarts - totalUsedDarts) * 5;
            
            player.score += (currentTarget + Math.max(0, bonus));
            player.checkoutsHit++;
            
            this._saveTurn(player, session.tempDarts, player._roundIdx, true);
            
            return this._nextTarget(session, player, { text: 'CHECK', type: 'check' });
        }

        // 2. BUST (Überworfen oder Rest 1 bei Double Out)
        if (newResidual < 0 || (doubleOutRequired && newResidual === 1)) {
            this._saveTurn(player, session.tempDarts, player._roundIdx);

            // Noch Aufnahmen übrig? → State-Reset aufschieben (erst nach Correction-Window)
            if (player._turnOnTarget + 1 < maxTurns) {
                player._pendingCCReset = {
                    residual: currentTarget,
                    startOfTurnRes: currentTarget,
                    turnOnTarget: player._turnOnTarget + 1
                };
                return { 
                    action: 'NEXT_TURN', 
                    overlay: { text: 'BUST', type: 'bust' }, 
                    delay: 1500 
                };
            }

            // Letzte Aufnahme → weiter zum nächsten Ziel
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

        // 4. AUFNAHME VORBEI OHNE CHECK
        this._saveTurn(player, session.tempDarts, player._roundIdx);

        // Noch Aufnahmen übrig? → Rest bleibt stehen, aufgeschoben anwenden
        if (player._turnOnTarget + 1 < maxTurns) {
            player._pendingCCReset = {
                residual: player._residual,  // Rest bleibt stehen
                startOfTurnRes: player._residual,
                turnOnTarget: player._turnOnTarget + 1
            };
            return { 
                action: 'NEXT_TURN', 
                overlay: null,
                delay: 800 
            };
        }

        // Letzte Aufnahme → weiter zum nächsten Ziel
        return this._nextTarget(session, player, null);
    },

    // Helper: Schaltet auf das nächste Ziel weiter
    _nextTarget(session, player, overlay) {
        // Snapshot für Renderer (Time Machine): hält alten Zustand während Overlay/Correction.
        player._completedRoundDisplay = {
            roundIdx: player._roundIdx,
            startRes: player._startOfTurnRes,
        };

        player._roundIdx++;
        player._turnOnTarget = 0;

        // Spiel vorbei?
        if (player._roundIdx >= session.targets.length) {
            player.finished = true;
            const allFinished = session.players.every(p => p.finished);
            if (allFinished) {
                return {
                    action: 'WIN_MATCH',
                    overlay: { text: 'FERTIG', type: 'match-win' }
                };
            } else {
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

    _saveTurn(player, darts, roundIndex, checked) {
        const dartScore = darts.reduce((a, b) => a + b.points, 0);
        player.turns.push({
            roundIndex: roundIndex,
            score: dartScore,
            checked: !!checked,
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
        // Gewinner = höchster Score, unabhängig davon wer WIN_MATCH getriggert hat
        const winner = [...session.players].sort((a, b) => b.score - a.score)[0] || player;
        const isMulti = session.players.length > 1;
        const body = isMulti
            ? `${winner.name} gewinnt mit ${winner.score} Pts (${winner.checkoutsHit} Checkouts).`
            : `${winner.name} holt ${winner.score} Punkte (${winner.checkoutsHit} Finishs).`;
        return {
            messageTitle: 'CHALLENGE BEENDET',
            messageBody:  body,
            nextActionText: 'STATISTIK'
        };
    },

    getResultData(session, player) {
        const totalTargets = session.targets.length;
        const rate = totalTargets > 0 ? Math.round((player.checkoutsHit / totalTargets) * 100) : 0;
        
        // Heatmap
        const allThrows = player.turns.flatMap(t => t.darts || []);
        const heatmap = {};
        allThrows.forEach(d => {
            if (!d.isMiss && d.segment) {
                heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
            }
        });

        // Chart: Turns nach roundIndex gruppieren (bei Multi-Turn gibt es
        // mehrere turns mit dem selben roundIndex → zu einem Ziel zusammenfassen)
        let currentTotal = 0;
        const chartValues = [];
        const chartLabels = [];

        // Gruppierung: roundIndex → Array von Turns
        const grouped = {};
        player.turns.forEach(turn => {
            const ri = turn.roundIndex ?? 0;
            if (!grouped[ri]) grouped[ri] = [];
            grouped[ri].push(turn);
        });

        // Pro Ziel: Kumulierten Score berechnen
        for (let i = 0; i < totalTargets; i++) {
            const turnsForTarget = grouped[i] || [];
            const wasChecked = turnsForTarget.some(t => t.checked);
            
            // Score für dieses Ziel: target + bonus wenn Check, 0 wenn Fail
            const scoreForTarget = wasChecked ? session.targets[i] : 0;
            // Bonus berechnen wenn gecheckt
            if (wasChecked) {
                const maxTurns = session.settings?.turnsPerTarget || 1;
                const totalMaxDarts = maxTurns * 3;
                const totalUsedDarts = turnsForTarget.reduce((a, t) => a + (t.darts?.length || 0), 0);
                const bonus = Math.max(0, (totalMaxDarts - totalUsedDarts) * 5);
                currentTotal += scoreForTarget + bonus;
            }
            chartValues.push(currentTotal);
            chartLabels.push(String(session.targets[i] || '?'));
        }

        // Darts/Checkout: ALLE Darts auf dem Ziel zählen (nicht nur letzte Aufnahme)
        let dpcSum = 0;
        for (let i = 0; i < totalTargets; i++) {
            const turnsForTarget = grouped[i] || [];
            const wasChecked = turnsForTarget.some(t => t.checked);
            if (wasChecked) {
                dpcSum += turnsForTarget.reduce((a, t) => a + (t.darts?.length || 0), 0);
            }
        }
        const avgDpc = player.checkoutsHit > 0 ? (dpcSum / player.checkoutsHit).toFixed(1) : '-';

        return {
            summary: {
                totalScore: player.score,
                checkoutsHit: player.checkoutsHit,
                checkoutsTotal: totalTargets,
                checkoutRate: `${rate}%`,
                avgDartsPerCheckout: avgDpc,
            },
            heatmap: heatmap,
            chart: {
                labels: chartLabels,
                datasets: [{
                    label: 'Punkteverlauf',
                    data: chartValues,
                    borderColor: '#e11d48',
                    backgroundColor: 'rgba(225, 29, 72, 0.1)',
                    fill: true
                }]
            }
        };
    }
};