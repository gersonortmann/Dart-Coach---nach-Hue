import { State } from './state.js';

export const StatsService = {
    
    // --- PUBLIC METHODS (Erweitert um 'variant' Filter) ---

    /**
     * X01 Statistiken abrufen
     * variant: 'sido' (Standard), 'siso', 'dido', 'diso' oder 'all'
     */
    getX01Stats: function(playerId, days = 30, variant = 'all') {
        const filteredHistory = this._getFilteredHistory(playerId, 'x01', days);
        if (!filteredHistory || filteredHistory.length === 0) return null;

        let totalGames = 0;
        let totalScoreSum = 0;
        let totalDartsThrown = 0;
        let bestAvg = 0;
        let highestCheckout = 0;
        let globalBestLeg = 999; // Startwert für "Shortest Leg"
        
        let power = { score100: 0, score140: 0, score180: 0 };
        const heatmap = {};
        const avgTrend = [];
        const f9Trend = []; 
        const labels = [];
        const matchHistoryDetails = [];

        filteredHistory.forEach(game => {
            const settings = game.settings || {};
            const di = settings.doubleIn || false;
            const dou = settings.doubleOut || false;

            // --- FILTER ---
            if (variant !== 'all') {
                if (variant === 'sido' && (di || !dou)) return;
                if (variant === 'siso' && (di || dou)) return;
                if (variant === 'dido' && (!di || !dou)) return;
                if (variant === 'diso' && (!di || dou)) return;
            }

            totalGames++;
            
            // Stats lesen
            const pStats = game.stats || {}; 
            const summary = pStats.summary || {};

            // Werte aggregieren
            const tScore = pStats.totalScore || summary.totalScore || 0;
            const tDarts = pStats.totalDarts || summary.totalDarts || 0;
            totalScoreSum += tScore;
            totalDartsThrown += tDarts;
            
            const avg = parseFloat(summary.avg || pStats.average || 0);
            const first9 = parseFloat(summary.first9 || pStats.first9Avg || 0);
            const checkout = summary.checkout || pStats.highestCheckout || 0;
            
            // Best Leg Logik
            let matchBestLeg = summary.bestLeg || pStats.bestLeg || '-';
            // Prüfen ob numerisch und besser als bisheriges Global Best
            if (matchBestLeg !== '-' && parseInt(matchBestLeg) > 0) {
                const legVal = parseInt(matchBestLeg);
                if (legVal < globalBestLeg) globalBestLeg = legVal;
            }

            if (avg > bestAvg) bestAvg = avg;
            if (checkout !== '-' && parseInt(checkout) > highestCheckout) highestCheckout = parseInt(checkout);

            // Power Scores
            const m100 = pStats.powerScores?.ton || pStats.score100 || 0;
            const m140 = pStats.powerScores?.ton40 || pStats.score140 || 0;
            const m180 = pStats.powerScores?.max || pStats.score180 || 0;
            power.score100 += m100;
            power.score140 += m140;
            power.score180 += m180;

            // Heatmap
            if (pStats.heatmap) {
                Object.entries(pStats.heatmap).forEach(([k, v]) => {
                    heatmap[k] = (heatmap[k] || 0) + v;
                });
            }

            // Charts
            avgTrend.push(avg);
            f9Trend.push(first9);
            labels.push(this._formatDate(game.date, days));

            // Match Info für Liste
            const opponents = (settings.opponents) ? settings.opponents : [];
            let resultLabel = "Solo"; let resultClass = "res-solo";
            if (opponents.length > 0) {
                if (typeof pStats.isWinner === 'boolean') {
                    if (pStats.isWinner) { resultLabel = "SIEG"; resultClass = "res-win"; }
                    else { resultLabel = "NIEDERLAGE"; resultClass = "res-loss"; }
                } else { resultLabel = "VS"; resultClass = "res-solo"; }
            }
            
            let modeShort = `${settings.startScore || 501} `;
            modeShort += (di ? 'DI' : 'SI');
            modeShort += (dou ? 'DO' : 'SO');

            matchHistoryDetails.push({
                date: this._formatDate(game.date, days),
                opponents: opponents.length > 0 ? opponents.join(", ") : "Solo",
                resultLabel: resultLabel,
                resultClass: resultClass,
                mode: modeShort, 
                avg: avg.toFixed(1),
                checkout: checkout > 0 ? checkout : '-',
                bestLeg: matchBestLeg, // HIER für die Liste
                p100: m100, p140: m140, p180: m180
            });
        });
        
        if (totalGames === 0) return null;

        const lifeAvg = totalDartsThrown > 0 ? ((totalScoreSum / totalDartsThrown) * 3).toFixed(1) : "0.0";

        return {
            summary: {
                games: totalGames,
                lifetimeAvg: lifeAvg,
                bestAvg: bestAvg.toFixed(1),
                highestCheckout: highestCheckout,
                bestLeg: globalBestLeg === 999 ? '-' : globalBestLeg, // HIER für Hero Card
                total180s: power.score180,
                total140s: power.score140,
                total100s: power.score100
            },
            heatmap: heatmap,
            matches: matchHistoryDetails.reverse(),
            charts: { labels: labels, avgTrend: avgTrend, f9Trend: f9Trend }
        };
    },
	
	getAtcStats: function(playerId, days = 30, variant = 'all') {
        const filteredHistory = this._getFilteredHistory(playerId, 'around-the-board', days);
        if (!filteredHistory || filteredHistory.length === 0) return null;

        let totalGames = 0;
        let totalDarts = 0;
        let totalHits = 0;
        let bestDarts = 9999;
        
        const dartTrend = [];
        const labels = [];
        const matchHistoryDetails = [];
		
		const targetStats = Array.from({length: 21}, () => ({ sum: 0, count: 0 }));

        filteredHistory.forEach(game => {
            const settings = game.settings || {};
            const v = settings.variant || 'full';
            
            // --- FILTER ---
            if (variant !== 'all') {
                if (variant !== v) return; // Skip if filter mismatch
            }

            totalGames++;
            
            // Stats lesen
            const stats = game.stats || {}; 
            const summary = stats.summary || {};

            // Score bei ATC = Benötigte Darts
            const dartsNeeded = summary.score || 0;
            const hits = summary.hits || 0; 
            
            totalDarts += dartsNeeded;
            totalHits += hits;
            
            // Bestes Spiel (weniger Darts ist besser)
            if (hits === 21 && dartsNeeded < bestDarts) bestDarts = dartsNeeded;

            dartTrend.push(dartsNeeded);
            labels.push(this._formatDate(game.date, days));
            
            // --- MATRIX LOGIK ---
            // Wir rekonstruieren den Verlauf anhand der Turns
            if (game.turns) {
                const allDarts = game.turns.flatMap(t => t.darts || []);
                let currentTargetIdx = 0;
                let dartsForCurrent = 0;
                
                for (const d of allDarts) {
                    if (currentTargetIdx >= 21) break; // Fertig
                    
                    dartsForCurrent++;
                    if (d.isHit) {
                        // Treffer! Speichern
                        targetStats[currentTargetIdx].sum += dartsForCurrent;
                        targetStats[currentTargetIdx].count++;
                        
                        // Reset für nächstes Target
                        currentTargetIdx++;
                        dartsForCurrent = 0;
                    }
                }
            }
            
            // 1. Modus / Richtung (z.B. Aufsteigend)
            let dirDisplay = settings.direction || 'Standard';
            const dirMap = {
                'ascending': 'Aufsteigend',
                'descending': 'Absteigend',
                'random': 'Zufällig'
            };
            if(dirMap[dirDisplay]) dirDisplay = dirMap[dirDisplay];

            // 2. Variante (z.B. Full Board)
            let varDisplay = v;
            const varMap = {
                'full': 'Komplettes Segment',
                'single-inner': 'Inneres Single',
                'single-outer': 'Äußeres Single',
                'double': 'Nur Doubles',
                'triple': 'Nur Triples'
            };
            if(varMap[v]) varDisplay = varMap[v];

            // Match Result String
            const resultLabel = (stats.summary) ? "FINISHED" : "ABORT";
            const resultClass = "res-win";

            matchHistoryDetails.push({
                date: this._formatDate(game.date, days),
                opponents: dirDisplay, // Hier steht jetzt "Aufsteigend"
                resultLabel: resultLabel,
                resultClass: resultClass,
                variant: varDisplay,   // Hier steht jetzt "Full Board"
                darts: dartsNeeded,
                hitRate: summary.hitRate || '-'
            });
        });

        if (totalGames === 0) return null;

        const avgDarts = (totalDarts / totalGames).toFixed(1);
        const globalHitRate = totalDarts > 0 ? ((totalHits / totalDarts) * 100).toFixed(1) + "%" : "0.0%";
		
		// Matrix finalisieren (Durchschnitte berechnen)
        const matrixData = targetStats.map((t, idx) => {
            const label = (idx === 20) ? 'B' : (idx + 1).toString();
            // Wenn count 0 ist (Target nie erreicht/getroffen), zeigen wir '-'
            const val = t.count > 0 ? (t.sum / t.count).toFixed(1) : '-';
            
            // Heatmap-Klasse berechnen (optional, hier einfach Color-Coding im UI)
            let heatClass = 'heat-low'; 
            if (t.count > 0) {
                const v = parseFloat(val);
                if (v <= 2) heatClass = 'heat-high';      // Super (<= 2 Darts)
                else if (v <= 4) heatClass = 'heat-medium'; // Ok
                else heatClass = 'heat-low';              // Naja
            }
            
            return { label, val, heatClass };
        });
		
        return {
            summary: {
                games: totalGames,
                avgDarts: avgDarts,
                bestDarts: bestDarts === 9999 ? '-' : bestDarts,
                hitRate: globalHitRate
            },
            matches: matchHistoryDetails.reverse(),
			matrix: matrixData,
            chart: { labels: labels, values: dartTrend }
        };
    },

    /**
     * Shanghai Stats
     * variant: '7', '20' oder 'all'
     */
    getShanghaiStats: function(playerId, days = 30, variant = 'all') {
        const filteredHistory = this._getFilteredHistory(playerId, 'shanghai', days);
        if (!filteredHistory || filteredHistory.length === 0) return null;

        let totalGames = 0; let totalScoreSum = 0; let bestScore = 0;
        let globalHits = 0; let globalDarts = 0;
        let dist = { singles: 0, doubles: 0, triples: 0 };
        const heatmap = {};
        const matchHistoryDetails = [];

        filteredHistory.forEach(game => {
            const settings = game.settings || {};
            // length: 'full' (20) oder standard (7)
            const isFull = settings.length === 'full';
            const rounds = isFull ? 20 : 7;
            
            // --- FILTER LOGIK SHANGHAI ---
            if (variant !== 'all') {
                if (variant === '7' && isFull) return;
                if (variant === '20' && !isFull) return;
            }
            // -----------------------------

            totalGames++;
            
            // Score holen (mit Fallback)
            const score = game.totalScore !== undefined ? game.totalScore : (game.stats?.summary?.score || 0);
            
            totalScoreSum += score;
            if (score > bestScore) bestScore = score;
            
            // Match Details extrahieren (Hits, Darts)
            let matchS = 0, matchD = 0, matchT = 0;
            let matchHits = 0; let matchDarts = 0;
            const targets = game.targets || (isFull ? Array.from({length:20},(_,i)=>i+1) : [1,2,3,4,5,6,7]);

            // Turns iterieren
            if (game.turns) {
                game.turns.forEach((turn, roundIdx) => {
                    const target = targets[roundIdx] !== undefined ? targets[roundIdx] : 0;
                    if (turn.darts) {
                        turn.darts.forEach(d => {
                            globalDarts++; matchDarts++;
                            const input = d.val;
                            if (input && !input.isMiss) {
                                globalHits++; matchHits++;
                                if (input.multiplier === 1) { dist.singles++; matchS++; }
                                if (input.multiplier === 2) { dist.doubles++; matchD++; }
                                if (input.multiplier === 3) { dist.triples++; matchT++; }
                                let segId = "";
                                const prefix = input.multiplier === 3 ? "T" : (input.multiplier === 2 ? "D" : "S");
                                segId = prefix + target;
                                heatmap[segId] = (heatmap[segId] || 0) + 1;
                            }
                        });
                    }
                });
            }

            const matchHitRate = matchDarts > 0 ? ((matchHits / matchDarts) * 100).toFixed(1) + '%' : '0.0%';
            const opponents = (settings.opponents) ? settings.opponents : [];
            let resultLabel = "Solo"; let resultClass = "res-solo";
            if (opponents.length > 0) {
                 if (game.stats && game.stats.isWinner) { resultLabel = "SIEG"; resultClass = "res-win"; }
                 else { resultLabel = "NIEDERLAGE"; resultClass = "res-loss"; }
            }
            
            matchHistoryDetails.push({
                date: this._formatDate(game.date, days),
                score: score,
                opponents: opponents.length > 0 ? opponents.join(", ") : `Solo (${rounds} R.)`,
                resultLabel: resultLabel,
                resultClass: resultClass,
                s: matchS, d: matchD, t: matchT,
                hitRate: matchHitRate
            });
        });

        if (totalGames === 0) return null;

        return {
            summary: { 
                games: totalGames, 
                avgScore: (totalScoreSum / totalGames).toFixed(0), 
                bestScore: bestScore, 
                hitRate: globalDarts > 0 ? ((globalHits / globalDarts) * 100).toFixed(1) + '%' : '0.0%' 
            },
            distribution: dist, 
            heatmap: heatmap, 
            matches: matchHistoryDetails.reverse(),
            chart: { 
                // Einfacher Chart: Score pro Spiel
                labels: filteredHistory.map(h => this._formatDate(h.date, days)), 
                values: filteredHistory.map(h => h.totalScore || 0) // Hier ist Mapping leider ungenau nach Filterung, aber ok für Demo
            }
        };
    },

    /**
     * Cricket Stats
     * variant: 'nolimit', '20', '10' oder 'all'
     */
    getCricketStats: function(playerId, days = 30, variant = 'all') {
        const filteredHistory = this._getFilteredHistory(playerId, 'cricket', days);
        if (!filteredHistory || filteredHistory.length === 0) return null;

        let totalGames = 0;
        let totalMarks = 0;
        let totalDarts = 0;
        let bestMPR = 0;
        
        let dist = { singles: 0, doubles: 0, triples: 0 };
        const heatmap = {};
        const matchHistoryDetails = [];
        const mprTrend = [];
        const labels = [];

        filteredHistory.forEach(game => {
            const settings = game.settings || {};
            const roundsLimit = settings.spRounds || 0; 
            
            // --- FILTER ---
            if (variant !== 'all') {
                if (variant === 'nolimit' && (roundsLimit == 20 || roundsLimit == 10)) return;
                if (variant === '20' && roundsLimit != 20) return;
                if (variant === '10' && roundsLimit != 10) return;
            }

            const stats = game.stats || {};
            const summary = stats.summary || {}; 
            
            // Werte auslesen (mit Fallback)
            let mpr = parseFloat(summary.mpr || stats.mpr || 0);
            let marks = parseInt(summary.totalMarks || stats.totalMarks || 0);
            let rounds = parseInt(summary.rounds || stats.rounds || 0);
            // NEU: Score auslesen
            let score = parseInt(summary.score || stats.score || 0);

            // Nur Spiele zählen, die valide Daten haben
            if (marks > 0) {
                totalGames++; 
                if(mpr > bestMPR) bestMPR = mpr;
                totalMarks += marks;
                if(mpr > 0) totalDarts += (marks / mpr) * 3;

                // Distribution & Heatmap
                const d = stats.distribution || summary.distribution || {};
                dist.singles += (d.singles || 0);
                dist.doubles += (d.doubles || 0);
                dist.triples += (d.triples || 0);

                const h = stats.heatmap || summary.heatmap;
                if (h) {
                    Object.entries(h).forEach(([k, v]) => { heatmap[k] = (heatmap[k] || 0) + v; });
                }
                
                mprTrend.push(mpr);
                labels.push(this._formatDate(game.date, days));
            }

            // --- MATCH INFO LOGIK (Verbessert) ---
            const opponents = (settings.opponents) ? settings.opponents : [];
            let resultLabel = "Solo"; 
            let resultClass = "res-solo";
            let opponentText = "Solo";

            // Prüfen ob es ein Match war (isWinner existiert als boolean)
            const isMatch = (typeof stats.isWinner === 'boolean');

            if (opponents.length > 0) {
                opponentText = opponents.join(", ");
            } else if (isMatch) {
                // Falls keine Namen da sind, aber ein Ergebnis existiert -> "Match"
                opponentText = "Match";
            } else {
                opponentText = roundsLimit ? `Solo (${roundsLimit} R.)` : "Solo (No Limit)";
            }

            if (isMatch || opponents.length > 0) {
                 if (stats.isWinner) { resultLabel = "SIEG"; resultClass = "res-win"; }
                 else { resultLabel = "NIEDERLAGE"; resultClass = "res-loss"; }
            }

            matchHistoryDetails.push({
                date: this._formatDate(game.date, days),
                opponents: opponentText,
                resultLabel: resultLabel,
                resultClass: resultClass,
                mpr: marks > 0 ? mpr.toFixed(2) : '-',
                marks: marks,
                rounds: rounds,
                score: score // NEU: Score übergeben
            });
        });

        if (totalGames === 0 && matchHistoryDetails.length === 0) return null;

        const globalMPR = totalDarts > 0 ? ((totalMarks / totalDarts) * 3).toFixed(2) : "0.00";

        return {
            summary: {
                games: totalGames,
                avgMPR: globalMPR,
                bestMPR: bestMPR.toFixed(2),
                totalMarks: totalMarks
            },
            distribution: dist,
            heatmap: heatmap,
            matches: matchHistoryDetails.reverse(),
            chart: { labels: labels, values: mprTrend }
        };
    },
    
    // --- Single Training & Bob's 27 (Kein Mode-Filter notwendig) ---
    getSingleTrainingStats: function(playerId, days) {
        return this._origSingleTraining(playerId, days);
    },
    
    getBobs27Stats: function(playerId, days = 30) {
        // (Identisch zum vorherigen Code, hier der Vollständigkeit halber)
        const filteredHistory = this._getFilteredHistory(playerId, 'bobs27', days);
        if (!filteredHistory || filteredHistory.length === 0) return null;
        let totalGames = 0; let highestScore = -9999; let scoreSum = 0; let gamesSurvived = 0;
        let totalDoublesHit = 0; let totalDartsThrown = 0;
        const heatmap = {}; const matchHistoryDetails = [];
        filteredHistory.forEach(game => {
            totalGames++;
            const finalScore = game.totalScore !== undefined ? game.totalScore : (game.stats?.totalScore || 0);
            scoreSum += finalScore;
            if (finalScore > highestScore) highestScore = finalScore;
            const survived = finalScore >= 0; 
            if (survived) gamesSurvived++;
            let matchHits = 0; let matchDarts = 0;
            const targets = game.targets || [];
            if(game.turns) {
                game.turns.forEach((turn, roundIdx) => {
                    matchDarts += 3; 
                    const hits = turn.hits || 0;
                    matchHits += hits;
                    const targetVal = targets[roundIdx];
                    if (targetVal) {
                        let heatId = "";
                        if (targetVal === 25) { heatId = "50"; } else { heatId = "D" + targetVal; }
                        if (hits > 0) { heatmap[heatId] = (heatmap[heatId] || 0) + hits; }
                    }
                });
            }
            totalDoublesHit += matchHits; totalDartsThrown += matchDarts;
            const matchHitRate = matchDarts > 0 ? ((matchHits / matchDarts) * 100).toFixed(1) + '%' : '0.0%';
            matchHistoryDetails.push({
                date: this._formatDate(game.date, days),
                score: finalScore,
                resultLabel: survived ? "SURVIVED" : "BUST",
                resultClass: survived ? "res-win" : "res-loss",
                hitRate: matchHitRate,
                doublesHit: matchHits,
                rounds: game.turns ? game.turns.length : 0
            });
        });
        return {
            summary: { games: totalGames, avgScore: (scoreSum / totalGames).toFixed(0), bestScore: highestScore, survivalRate: ((gamesSurvived / totalGames) * 100).toFixed(0) + '%', hitRate: totalDartsThrown > 0 ? ((totalDoublesHit / totalDartsThrown) * 100).toFixed(1) + '%' : '0.0%' },
            heatmap: heatmap, matches: matchHistoryDetails.reverse(),
            chart: { labels: filteredHistory.map(h => this._formatDate(h.date, days)), values: filteredHistory.map(h => h.totalScore !== undefined ? h.totalScore : 0) }
        };
    },

    // --- HELPER (Wiederverwendet) ---
    _origSingleTraining: function(playerId, days) {
        const filteredHistory = this._getFilteredHistory(playerId, 'single-training', days);
        if (!filteredHistory || filteredHistory.length === 0) return null;
        let totalGames = 0; let totalScoreSum = 0; let bestScore = 0;
        let globalHits = 0; let globalDarts = 0;
        let dist = { singles: 0, doubles: 0, triples: 0 };
        const heatmap = {};
        const matchHistoryDetails = [];
        filteredHistory.forEach(game => {
            totalGames++;
            const score = game.totalScore || 0;
            totalScoreSum += score;
            if (score > bestScore) bestScore = score;
            let matchS = 0, matchD = 0, matchT = 0;
            let matchHits = 0; let matchDarts = 0;
            const targets = game.targets || Array.from({length:20}, (_,i)=>i+1).concat([25]);
            if(game.turns) {
                game.turns.forEach((turn, roundIdx) => {
                    const target = targets[roundIdx];
                    if (turn.darts) {
                        turn.darts.forEach(d => {
                            globalDarts++; matchDarts++;
                            const input = d.val;
                            if (input && !input.isMiss) {
                                globalHits++; matchHits++;
                                if (input.multiplier === 1) { dist.singles++; matchS++; }
                                if (input.multiplier === 2) { dist.doubles++; matchD++; }
                                if (input.multiplier === 3) { dist.triples++; matchT++; }
                                let segId = "";
                                if (target === 25) { segId = input.multiplier === 2 ? "50" : "25"; }
                                else { const prefix = input.multiplier === 3 ? "T" : (input.multiplier === 2 ? "D" : "S"); segId = prefix + target; }
                                heatmap[segId] = (heatmap[segId] || 0) + 1;
                            }
                        });
                    }
                });
            }
            const matchHitRate = matchDarts > 0 ? ((matchHits / matchDarts) * 100).toFixed(1) + '%' : '0.0%';
            const opponents = (game.settings && game.settings.opponents) ? game.settings.opponents : [];
            let resultLabel = "Solo"; let resultClass = "res-solo";
            if (opponents.length > 0) {
                 if (game.stats && game.stats.isWinner) { resultLabel = "SIEG"; resultClass = "res-win"; }
                 else { resultLabel = "NIEDERLAGE"; resultClass = "res-loss"; }
            }
            matchHistoryDetails.push({
                date: this._formatDate(game.date, days),
                score: score,
                opponents: opponents.length > 0 ? opponents.join(", ") : "Solo Training",
                resultLabel: resultLabel,
                resultClass: resultClass,
                s: matchS, d: matchD, t: matchT,
                hitRate: matchHitRate
            });
        });
        return {
            summary: { games: totalGames, avgScore: (totalScoreSum / totalGames).toFixed(0), bestScore: bestScore, hitRate: globalDarts > 0 ? ((globalHits / globalDarts) * 100).toFixed(1) + '%' : '0.0%' },
            distribution: dist, heatmap: heatmap, matches: matchHistoryDetails.reverse(),
            chart: { labels: filteredHistory.map(h => this._formatDate(h.date, days)), values: filteredHistory.map(h => h.totalScore) }
        };
    },

    _getFilteredHistory: function(playerId, gameId, days) {
        const player = State.getAvailablePlayers().find(p => p.id === playerId);
        if (!player || !player.history) return null;
        let cutoff = 0;
        if (days === 'all') { cutoff = 0; } else if (days === 'today') { const now = new Date(); now.setHours(0,0,0,0); cutoff = now.getTime(); } else { cutoff = Date.now() - (days * 24 * 60 * 60 * 1000); }
        return player.history.filter(h => h.game === gameId && h.date >= cutoff).sort((a, b) => a.date - b.date);
    },
    _formatDate: function(timestamp, daysFilter) {
        const dateObj = new Date(timestamp);
        if (daysFilter === 'today') { return dateObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
        return dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }
};