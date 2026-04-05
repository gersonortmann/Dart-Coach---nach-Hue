import { CHECKOUTS } from '../core/constants.js';

export const X01 = {
    
    config: {
        hasOptions: true,
        mode: 'mixed',
        defaultProInput: true,
		description: "Der Klassiker. Starte bei 501. Double Out."
    },

    generateTargets: function(settings) {
        return [settings.startScore];
    },

    initPlayer: function(player, settings, targets) {
        const startScore = parseInt(targets[0]); 
        player.currentResidual = startScore;
        if (player.legsWon === undefined) player.legsWon = 0;
        if (player.setsWon === undefined) player.setsWon = 0;
        
        player.startOfTurnResidual = startScore;
        player.hasDoubledIn = !settings.doubleIn;
    },

    /**
     * Step 7a: Empfängt jetzt ein universelles Dart-Objekt statt String.
     * dart.points, dart.multiplier, dart.segment – alles direkt verfügbar.
     */
    handleInput: function(session, player, dart) {
        const settings = session.settings;
        const result = this._processThrow(player, dart, settings);

        // _isHit: Dart hat anrechenbare Punkte erzielt (kein Bust, kein Double-In-Miss)
        dart._isHit = result.points > 0;

        // Dart speichern: points = angerechnete Punkte (0 bei Bust/Double-In-Miss)
        session.tempDarts.push({ ...dart, points: result.points });
        
        // --- FALL 1: BUST ---
        if (result.status === 'BUST') {
            player.currentResidual = player.startOfTurnResidual;
            this._logTurn(player, session, { bust: true });

            return { 
				action: 'BUST', 
				overlay: { text: 'BUST', type: 'bust' }
			};
        }

        // --- FALL 2: MATCH/LEG WIN ---
        if (result.status === 'WIN') {
            this._logTurn(player, session, { isLegFinish: true });
            const winAction = this._checkMatchWin(session, player);
            
            return {
                action: winAction,
                overlay: { text: 'CHECK!', type: 'check' },
                points: result.points
            };
        }

        // --- FALL 3: DOUBLED IN (Spezialfall) ---
        if (result.status === 'DOUBLED_IN') {
             // Weiter mit CONTINUE
        }

        // --- FALL 4: NORMALER WEITERGANG ---
        if (session.tempDarts.length >= 3) {
            player.startOfTurnResidual = player.currentResidual;
            
            const totalScore = session.tempDarts.reduce((a, b) => a + b.points, 0);
            this._logTurn(player, session, {});

            let ovType = 'standard';
			let ovText = totalScore.toString();

			if (totalScore === 180) {
				ovType = '180';
			} else if (totalScore >= 140) {
				ovType = 'very-high';
			} else if (totalScore >= 100) {
				ovType = 'high';
			} else if (totalScore === 0) {
				ovType = 'miss';
				ovText = 'MISS';
			} else if (totalScore <= 10) { 
				 ovType = 'standard';
			}

			return { 
				action: 'NEXT_TURN', 
				overlay: { text: ovText, type: ovType }, 
				delay: (ovType === '180' ? 2500 : 1200)
			};
		}
        return { action: 'CONTINUE' };
    },

    // --- INTERNE HELPER ---

    _logTurn: function(player, session, flags) {
        const totalScore = session.tempDarts.reduce((a, b) => a + (b.points || 0), 0);
        // legIndex: wie viele Legs hat dieser Spieler bisher abgeschlossen?
        if (player._currentLegIndex === undefined) player._currentLegIndex = 0;
        player.turns.push({
            roundIndex:    session.roundIndex,
            legIndex:      player._currentLegIndex,
            score:         totalScore,
            residualAfter: player.currentResidual,  // Reststand nach dieser Aufnahme
            darts:         [...session.tempDarts],
            timestamp:     Date.now(),
            ...flags
        });
        // Leg abgeschlossen → Index erhöhen
        if (flags.isLegFinish) player._currentLegIndex++;
    },

    _checkMatchWin: function(session, player) {
        const settings = session.settings;
        
        player.legsWon = (player.legsWon || 0) + 1;

        // 170 Checkout-Training: bestOf = exakte Rundenanzahl (nicht "Best of")
        if (settings.startScore === 170) {
            if (player.legsWon >= settings.bestOf) return 'WIN_MATCH';
            return 'WIN_LEG';
        }

        const legsNeeded = Math.ceil(settings.bestOf / 2);

        if (settings.mode === 'sets') {
             if (player.legsWon >= 3) {
                 player.setsWon = (player.setsWon || 0) + 1;
                 if (player.setsWon >= legsNeeded) return 'WIN_MATCH';
             }
             return 'WIN_LEG'; 
        } 
        
        if (player.legsWon >= legsNeeded) return 'WIN_MATCH';
        return 'WIN_LEG';
    },

    /**
     * Step 7a: Nutzt dart.points und dart.multiplier direkt.
     * _calculatePoints() ist komplett entfallen!
     */
    _processThrow: function(player, dart, settings) {
        const thrownPoints = dart.points;
        const isDoubleOut = settings.doubleOut;
        const isDoubleIn = settings.doubleIn;
        const hasDoubledIn = player.hasDoubledIn;
        const isDoubleHit = dart.multiplier === 2;

        // Check Double In
        if (isDoubleIn && !hasDoubledIn) {
            if (isDoubleHit) {
                player.hasDoubledIn = true;
                player.currentResidual -= thrownPoints;
                return { status: 'DOUBLED_IN', points: thrownPoints };
            }
            return { status: 'OK', points: 0 };
        }

        const newRest = player.currentResidual - thrownPoints;

        if (newRest < 0) return { status: 'BUST', points: 0 };
        if (isDoubleOut && newRest === 1) return { status: 'BUST', points: 0 };

        if (newRest === 0) {
            if (isDoubleOut) {
                return isDoubleHit ? { status: 'WIN', points: thrownPoints } : { status: 'BUST', points: 0 };
            }
            return { status: 'WIN', points: thrownPoints };
        }

        player.currentResidual -= thrownPoints;
        return { status: 'OK', points: thrownPoints };
    },

    handleWinLogik: function(session, player, result) {
        const opponent = session.players.find(p => p.id !== player.id);
        const isMatch = (result.action === 'WIN_MATCH');
        const is170 = session.settings.startScore === 170;
        const isSets = session.settings.mode === 'sets';

        // ── Leg-Statistik: nur aktueller Leg (legIndex des zuletzt gespielten Legs) ──
        const _legStats = (p) => {
            // Turns des soeben beendeten Legs (legIndex erhöht sich erst durch _logTurn mit isLegFinish)
            // Nach dem Leg: _currentLegIndex wurde um 1 erhöht, also ist der Leg bei idx-1
            const legIdx = (p._currentLegIndex ?? 1) - 1;
            const legTurns = p.turns.filter(t => t.legIndex === legIdx);
            const darts = legTurns.flatMap(t => t.darts || []);
            const pts   = legTurns.reduce((a, t) => a + (t.bust ? 0 : (t.score || 0)), 0);
            const avg   = darts.length > 0 ? ((pts / darts.length) * 3).toFixed(1) : '-';
            const f9d   = darts.slice(0, 9);
            const f9pts = f9d.reduce((a, d) => a + (d.points || 0), 0);
            const f9    = f9d.length > 0 ? ((f9pts / f9d.length) * 3).toFixed(1) : '-';
            return { avg, f9 };
        };

        // ── Leg-für-Leg Tabelle (alle bisherigen Legs) ─────────────────────
        const _legTable = () => {
            const allLegs = new Set(player.turns.map(t => t.legIndex ?? 0));
            const legCount = Math.max(...allLegs) + 1;
            if (legCount <= 1) return ''; // Nur sinnvoll ab 2 Legs

            const _legAvg = (p, idx) => {
                const lt   = p.turns.filter(t => (t.legIndex ?? 0) === idx);
                const dts  = lt.flatMap(t => t.darts || []);
                const pts  = lt.reduce((a, t) => a + (t.bust ? 0 : (t.score || 0)), 0);
                return dts.length > 0 ? ((pts / dts.length) * 3).toFixed(1) : '-';
            };
            const _legF9 = (p, idx) => {
                const lt   = p.turns.filter(t => (t.legIndex ?? 0) === idx);
                const dts  = lt.flatMap(t => t.darts || []).slice(0, 9);
                const pts  = dts.reduce((a, d) => a + (d.points || 0), 0);
                return dts.length > 0 ? ((pts / dts.length) * 3).toFixed(1) : '-';
            };

            const legNums = Array.from({ length: legCount }, (_, i) => i);
            const avgColor = (val, all) => {
                const nums = all.map(v => parseFloat(v)).filter(v => !isNaN(v));
                if (nums.length < 2) return '#ccc';
                const max = Math.max(...nums), min = Math.min(...nums);
                const v = parseFloat(val);
                if (isNaN(v)) return '#555';
                if (v === max) return '#10b981';
                if (v === min) return '#ef4444';
                return '#ccc';
            };

            const rows = session.players.map(p => {
                const avgs = legNums.map(i => _legAvg(p, i));
                const f9s  = legNums.map(i => _legF9(p, i));
                return `
                    <tr>
                        <td style="text-align:left;padding:3px 6px;color:#aaa;font-size:0.8rem;">${p.name}</td>
                        ${avgs.map((v, i) => `
                            <td style="text-align:center;padding:3px 6px;font-size:0.82rem;color:${avgColor(v, avgs)}">
                                ${v}<br><span style="font-size:0.65rem;color:#555">f9:${f9s[i]}</span>
                            </td>`).join('')}
                    </tr>`;
            }).join('');

            const headers = legNums.map(i => `<th style="text-align:center;padding:2px 6px;font-size:0.7rem;color:#555">L${i+1}</th>`).join('');
            return `
                <table style="width:100%;margin-top:14px;border-collapse:collapse;font-size:0.82rem;border-top:1px solid #222;padding-top:8px;">
                    <thead><tr><th style="text-align:left;padding:2px 6px;font-size:0.7rem;color:#555">Leg-AVG</th>${headers}</tr></thead>
                    <tbody>${rows}</tbody>
                </table>`;
        };

        // ── Aktuelle Leg-Stats Tabelle ─────────────────────────────────────
        const allPlayers = session.players;
        const statsRows = allPlayers.map(p => {
            const s = _legStats(p);
            const isWinner = p.id === player.id;
            return `<tr style="color:${isWinner ? 'var(--accent-color)' : '#ccc'}">
                <td style="text-align:left;padding:4px 8px;">${p.name}</td>
                <td style="padding:4px 12px;">${s.avg}</td>
                <td style="padding:4px 8px;">${s.f9}</td>
            </tr>`;
        }).join('');

        const statsTable = `
            <table style="width:100%;margin-top:12px;border-collapse:collapse;font-size:0.9rem;">
                <thead><tr style="color:#555;font-size:0.75rem;">
                    <th style="text-align:left;padding:2px 8px;"></th>
                    <th style="padding:2px 12px;">AVG</th>
                    <th style="padding:2px 8px;">F9</th>
                </tr></thead>
                <tbody>${statsRows}</tbody>
            </table>
            ${_legTable()}`;

        // ── 170 Checkout-Training ─────────────────────────────────────────
        if (is170) {
            if (isMatch) {
                return {
                    messageTitle: "TRAINING BEENDET!",
                    messageBody: `${player.name} checkt ${player.legsWon}× in ${session.settings.bestOf} Runden.${statsTable}`,
                    nextActionText: "STATISTIK"
                };
            }
            return {
                messageTitle: "CHECK!",
                messageBody: `Runde ${player.legsWon} von ${session.settings.bestOf}${statsTable}`,
                nextActionText: "NÄCHSTE RUNDE"
            };
        }

        // ── Standard X01 ──────────────────────────────────────────────────
        const scoreDisplay = `${player.legsWon}:${opponent ? opponent.legsWon : 0}`;

        if (isSets) {
            const setScore = `${player.setsWon}:${opponent ? opponent.setsWon : 0}`;
            if (isMatch) {
                return { messageTitle: "MATCH GEWONNEN!", messageBody: `🏆 ${player.name} gewinnt ${setScore} Sätze!${statsTable}`, nextActionText: "STATISTIK" };
            }
            return { messageTitle: "SATZ / LEG", messageBody: `Stand: ${setScore} Sätze (${scoreDisplay} Legs)${statsTable}`, nextActionText: "WEITER" };
        }

        if (isMatch) {
            return { messageTitle: "MATCH GEWONNEN!", messageBody: `🏆 ${player.name} gewinnt ${scoreDisplay}!${statsTable}`, nextActionText: "STATISTIK" };
        }
        return { messageTitle: "LEG GEWONNEN!", messageBody: `${player.name} checkt zum ${scoreDisplay}!${statsTable}`, nextActionText: "NÄCHSTES LEG" };
    },

    /**
     * Step 7a: Heatmap nutzt jetzt dart.segment statt dart.val
     */
    getResultData: function(session, player) {
         const allDarts  = player.turns.flatMap(t => t.darts || []);
         const totalPoints = player.turns.reduce((a, t) => a + (t.bust ? 0 : (t.score || 0)), 0);
         const totalDarts  = allDarts.length;
         const avg = totalDarts > 0 ? ((totalPoints / totalDarts) * 3).toFixed(1) : "0.0";

         // F9 pro Leg berechnen, dann Durchschnitt über alle Legs
         const legIndices = [...new Set(player.turns.map(t => t.legIndex ?? 0))];
         const legF9s = legIndices.map(li => {
             const lt   = player.turns.filter(t => (t.legIndex ?? 0) === li);
             const dts  = lt.flatMap(t => t.darts || []).slice(0, 9);
             const pts  = dts.reduce((a, d) => a + (d.points || 0), 0);
             return dts.length > 0 ? (pts / dts.length) * 3 : null;
         }).filter(v => v !== null);
         const f9Avg = legF9s.length > 0
             ? (legF9s.reduce((a, v) => a + v, 0) / legF9s.length).toFixed(1)
             : "-";

         // Leg-für-Leg Breakdown
         const legBreakdown = legIndices.map(li => {
             const lt   = player.turns.filter(t => (t.legIndex ?? 0) === li);
             const dts  = lt.flatMap(t => t.darts || []);
             const pts  = lt.reduce((a, t) => a + (t.bust ? 0 : (t.score || 0)), 0);
             const legAvg = dts.length > 0 ? ((pts / dts.length) * 3).toFixed(1) : '-';
             const f9d  = dts.slice(0, 9);
             const f9pts = f9d.reduce((a, d) => a + (d.points || 0), 0);
             const legF9 = f9d.length > 0 ? ((f9pts / f9d.length) * 3).toFixed(1) : '-';
             const isWon = lt.some(t => t.isLegFinish);
             return { legIndex: li, avg: legAvg, f9: legF9, darts: dts.length, isWon };
         });

         let bestLegDarts = Infinity;
         let bestCheckout = 0;
         let currentLegDarts = 0;
         player.turns.forEach((t, idx) => {
             currentLegDarts += (t.darts ? t.darts.length : 3);
             if (t.isLegFinish) {
                 if (currentLegDarts < bestLegDarts) bestLegDarts = currentLegDarts;
                 if (t.score > bestCheckout) bestCheckout = t.score;
                 currentLegDarts = 0;
             } else {
                 const next = player.turns[idx + 1];
                 if (next && next.roundIndex < t.roundIndex) currentLegDarts = 0;
             }
         });

         let c100 = 0, c140 = 0, c180 = 0;
         player.turns.forEach(t => {
             const s = t.bust ? 0 : (t.score || 0);
             if (s === 180) c180++;
             else if (s >= 140) c140++;
             else if (s >= 100) c100++;
         });

         const heatmap = {};
         allDarts.forEach(d => {
             if (!d.isMiss && d.segment) heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
         });

         const turnScores = player.turns.map(t => t.bust ? 0 : (t.score || 0));
         const chartData = { labels: turnScores.map((_, i) => i + 1), values: turnScores };

         return {
             summary: {
                 avg,
                 first9: f9Avg,
                 bestLeg: bestLegDarts === Infinity ? '-' : bestLegDarts,
                 checkout: bestCheckout || '-',
                 totalScore: totalPoints,
                 totalDarts,
             },
             legBreakdown,
             powerScores: { ton: c100, ton40: c140, max: c180 },
             heatmap,
             chart: chartData,
         };
     },
 
     getCheckoutGuide: function(score, dartsLeft) {
         if (score > 170 || score < 2) return ""; 
         const impossible3 = [169, 168, 166, 165, 163, 162, 159];
         if (impossible3.includes(score)) return "Nicht checkbar";
         if (dartsLeft === 1) {
             if (score === 50) return "Bull";
             if (score <= 40 && score % 2 === 0) return "D" + (score / 2);
             return "Nicht checkbar";
         }
         if (dartsLeft === 2) {
             if (score > 110) return "Nicht checkbar";
             const impossible2Standard = [99, 101, 102, 103, 104, 105, 106, 107, 108, 109];
             if (impossible2Standard.includes(score)) return "Nicht checkbar";
         }
         if(CHECKOUTS[score]) return CHECKOUTS[score];
         if(score <= 40 && score % 2 === 0) return "D" + (score/2);
         return "";
     }
};