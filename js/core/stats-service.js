import { State } from './state.js';

export const StatsService = {
    
    // ─── FORMAT-AGNOSTISCHE HELPER (Step 7b) ──────────────────

    /**
     * Liest ein Dart aus historischen Turns (altes UND neues Format).
     * 
     * Neues Format (Step 7a):  { segment:'D5', multiplier:2, isMiss:false, ... }
     * Altes Training/Shanghai: { val:{ multiplier:2, isMiss:false }, points:2 }
     * Altes ATB:               { val:'HIT', isHit:true, target:15 }
     * 
     * @returns {{ isMiss: boolean, multiplier: number }}
     */
    _readDart: function(d) {
        // Neues universelles Format (hat segment)
        if (d.segment !== undefined) {
            return { isMiss: !!d.isMiss, multiplier: d.multiplier || 0 };
        }
        // Altes Training/Shanghai: val ist Object mit {multiplier, isMiss}
        if (d.val && typeof d.val === 'object' && 'multiplier' in d.val) {
            return { isMiss: !!d.val.isMiss, multiplier: d.val.multiplier || 0 };
        }
        // Altes ATB: {isHit: bool}
        if ('isHit' in d) {
            return { isMiss: !d.isHit, multiplier: d.isHit ? 1 : 0 };
        }
        // Fallback
        return { isMiss: true, multiplier: 0 };
    },

    /**
     * Aggregiert Hits/Misses/S/D/T aus einem Game.
     * Shared Helper für Training + Shanghai (identische Logik).
     */
    _aggregateHitDarts: function(game) {
        let hits = 0, misses = 0, singles = 0, doubles = 0, triples = 0, totalDarts = 0;
        
        if (game.turns) {
            game.turns.forEach(turn => {
                if (turn.darts) {
                    turn.darts.forEach(d => {
                        totalDarts++;
                        const parsed = this._readDart(d);
                        if (parsed.isMiss) { misses++; return; }
                        hits++;
                        if (parsed.multiplier === 1) singles++;
                        else if (parsed.multiplier === 2) doubles++;
                        else if (parsed.multiplier === 3) triples++;
                    });
                }
            });
        }
        return { hits, misses, singles, doubles, triples, totalDarts };
    },

    // ─── PUBLIC METHODS ───────────────────────────────────────

    /**
     * X01 Statistiken
     * variant: 'sido', 'siso', 'dido', 'diso' oder 'all'
     * Liest hauptsächlich aus game.stats (vorberechnet) → keine Format-Probleme.
     */
    getX01Stats: function(playerId, days = 30, variant = 'all') {
        const filteredHistory = this._getFilteredHistory(playerId, 'x01', days);
        if (!filteredHistory || filteredHistory.length === 0) return null;

        let totalGames = 0;
        let totalScoreSum = 0;
        let totalDartsThrown = 0;
        let bestAvg = 0;
        let highestCheckout = 0;
        let globalBestLeg = 999;
        
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

            // Filter
            if (variant !== 'all') {
                if (variant === 'sido' && (di || !dou)) return;
                if (variant === 'siso' && (di || dou)) return;
                if (variant === 'dido' && (!di || !dou)) return;
                if (variant === 'diso' && (!di || dou)) return;
            }

            totalGames++;
            
            const pStats = game.stats || {}; 
            const summary = pStats.summary || {};

            const tScore = pStats.totalScore || summary.totalScore || 0;
            const tDarts = pStats.totalDarts || summary.totalDarts || 0;
            totalScoreSum += tScore;
            totalDartsThrown += tDarts;
            
            const avg = parseFloat(summary.avg || pStats.average || 0);
            const first9 = parseFloat(summary.first9 || pStats.first9Avg || 0);
            const checkout = summary.checkout || pStats.highestCheckout || 0;
            
            let matchBestLeg = summary.bestLeg || pStats.bestLeg || '-';
            if (matchBestLeg !== '-' && parseInt(matchBestLeg) > 0) {
                const legVal = parseInt(matchBestLeg);
                if (legVal < globalBestLeg) globalBestLeg = legVal;
            }

            if (avg > bestAvg) bestAvg = avg;
            if (checkout !== '-' && parseInt(checkout) > highestCheckout) highestCheckout = parseInt(checkout);

            const m100 = pStats.powerScores?.ton || pStats.score100 || 0;
            const m140 = pStats.powerScores?.ton40 || pStats.score140 || 0;
            const m180 = pStats.powerScores?.max || pStats.score180 || 0;
            power.score100 += m100;
            power.score140 += m140;
            power.score180 += m180;

            // Heatmap durchleiten (vorberechnet)
            if (pStats.heatmap) {
                Object.entries(pStats.heatmap).forEach(([k, v]) => {
                    heatmap[k] = (heatmap[k] || 0) + v;
                });
            }

            avgTrend.push(avg);
            f9Trend.push(first9);
            labels.push(this._formatDate(game.date, days));

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
                resultLabel, resultClass,
                mode: modeShort, 
                avg: avg.toFixed(1),
                checkout: checkout > 0 ? checkout : '-',
                bestLeg: matchBestLeg,
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
                bestLeg: globalBestLeg === 999 ? '-' : globalBestLeg,
                total180s: power.score180,
                total140s: power.score140,
                total100s: power.score100
            },
            heatmap: heatmap,
            matches: matchHistoryDetails.reverse(),
            charts: { labels, avgTrend, f9Trend }
        };
    },

    /**
     * Around the Board Stats
     * variant: 'full', 'single-inner', 'double', etc. oder 'all'
     * Step 7b: d.isHit → _readDart(d) für Matrix-Berechnung
     */
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
            
            if (variant !== 'all') {
                if (variant !== v) return;
            }

            totalGames++;
            
            const stats = game.stats || {}; 
            const summary = stats.summary || {};

            const dartsNeeded = summary.score || 0;
            const hits = summary.hits || 0; 
            
            totalDarts += dartsNeeded;
            totalHits += hits;
            
            if (hits === 21 && dartsNeeded < bestDarts) bestDarts = dartsNeeded;

            dartTrend.push(dartsNeeded);
            labels.push(this._formatDate(game.date, days));
            
            // Matrix: Rekonstruktion aus Turns
            // Step 7b: _readDart() statt d.isHit für altes+neues Format
            if (game.turns) {
                const allDarts = game.turns.flatMap(t => t.darts || []);
                let currentTargetIdx = 0;
                let dartsForCurrent = 0;
                
                for (const d of allDarts) {
                    if (currentTargetIdx >= 21) break;
                    
                    dartsForCurrent++;
                    const parsed = this._readDart(d);
                    if (!parsed.isMiss) {
                        targetStats[currentTargetIdx].sum += dartsForCurrent;
                        targetStats[currentTargetIdx].count++;
                        currentTargetIdx++;
                        dartsForCurrent = 0;
                    }
                }
            }
            
            let dirDisplay = settings.direction || 'Standard';
            const dirMap = { 'ascending': 'Aufsteigend', 'descending': 'Absteigend', 'random': 'Zufällig' };
            if(dirMap[dirDisplay]) dirDisplay = dirMap[dirDisplay];

            let varDisplay = v;
            const varMap = {
                'full': 'Komplettes Segment', 'single-inner': 'Inneres Single',
                'single-outer': 'Äußeres Single', 'double': 'Nur Doubles', 'triple': 'Nur Triples'
            };
            if(varMap[v]) varDisplay = varMap[v];

            const resultLabel = (stats.summary) ? "FINISHED" : "ABORT";
            const resultClass = "res-win";

            matchHistoryDetails.push({
                date: this._formatDate(game.date, days),
                opponents: dirDisplay,
                resultLabel, resultClass,
                variant: varDisplay,
                darts: dartsNeeded,
                hitRate: summary.hitRate || '-'
            });
        });

        if (totalGames === 0) return null;

        const avgDarts = (totalDarts / totalGames).toFixed(1);
        const globalHitRate = totalDarts > 0 ? ((totalHits / totalDarts) * 100).toFixed(1) + "%" : "0.0%";
        
        const matrixData = targetStats.map((t, idx) => {
            const label = (idx === 20) ? 'B' : (idx + 1).toString();
            const val = t.count > 0 ? (t.sum / t.count).toFixed(1) : '-';
            let heatClass = 'heat-low'; 
            if (t.count > 0) {
                const v = parseFloat(val);
                if (v <= 2) heatClass = 'heat-high';
                else if (v <= 4) heatClass = 'heat-medium';
            }
            return { label, val, heatClass };
        });
        
        return {
            summary: { games: totalGames, avgDarts, bestDarts: bestDarts === 9999 ? '-' : bestDarts, hitRate: globalHitRate },
            matches: matchHistoryDetails.reverse(),
            matrix: matrixData,
            chart: { labels, values: dartTrend }
        };
    },

    /**
     * Shanghai Stats
     * variant: '7', '20' oder 'all'
     * Step 7b: Nutzt _aggregateHitDarts() statt manuelles d.val.multiplier Parsing
     */
    getShanghaiStats: function(playerId, days = 30, variant = 'all') {
        const filteredHistory = this._getFilteredHistory(playerId, 'shanghai', days);
        if (!filteredHistory || filteredHistory.length === 0) return null;

        let totalGames = 0; let totalScoreSum = 0; let bestScore = 0;
        let globalHits = 0; let globalDarts = 0;
        let dist = { singles: 0, doubles: 0, triples: 0 };
        const matchHistoryDetails = [];

        filteredHistory.forEach(game => {
            const settings = game.settings || {};
            const isFull = settings.length === 'full';
            const rounds = isFull ? 20 : 7;
            
            // Filter
            if (variant !== 'all') {
                if (variant === '7' && isFull) return;
                if (variant === '20' && !isFull) return;
            }

            totalGames++;
            
            const score = game.totalScore !== undefined ? game.totalScore : (game.stats?.summary?.score || 0);
            totalScoreSum += score;
            if (score > bestScore) bestScore = score;
            
            // Step 7b: Shared Helper statt manuelles Parsing
            const agg = this._aggregateHitDarts(game);
            globalHits += agg.hits;
            globalDarts += agg.totalDarts;
            dist.singles += agg.singles;
            dist.doubles += agg.doubles;
            dist.triples += agg.triples;

            const matchHitRate = agg.totalDarts > 0 ? ((agg.hits / agg.totalDarts) * 100).toFixed(1) + '%' : '0.0%';
            const opponents = (settings.opponents) ? settings.opponents : [];
            let resultLabel = "Solo"; let resultClass = "res-solo";
            if (opponents.length > 0) {
                 if (game.stats && game.stats.isWinner) { resultLabel = "SIEG"; resultClass = "res-win"; }
                 else { resultLabel = "NIEDERLAGE"; resultClass = "res-loss"; }
            }
            
            matchHistoryDetails.push({
                date: this._formatDate(game.date, days),
                score,
                opponents: opponents.length > 0 ? opponents.join(", ") : `Solo (${rounds} R.)`,
                resultLabel, resultClass,
                s: agg.singles, d: agg.doubles, t: agg.triples,
                hitRate: matchHitRate
            });
        });

        if (totalGames === 0) return null;

        return {
            summary: { 
                games: totalGames, 
                avgScore: (totalScoreSum / totalGames).toFixed(0), 
                bestScore, 
                hitRate: globalDarts > 0 ? ((globalHits / globalDarts) * 100).toFixed(1) + '%' : '0.0%' 
            },
            distribution: dist, 
            heatmap: {},
            matches: matchHistoryDetails.reverse(),
            chart: { 
                labels: filteredHistory.map(h => this._formatDate(h.date, days)), 
                values: filteredHistory.map(h => h.totalScore || 0)
            }
        };
    },

    /**
     * Cricket Stats
     * variant: 'nolimit', '20', '10' oder 'all'
     * Liest hauptsächlich aus game.stats (vorberechnet) → keine Format-Probleme.
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
            
            if (variant !== 'all') {
                if (variant === 'nolimit' && (roundsLimit == 20 || roundsLimit == 10)) return;
                if (variant === '20' && roundsLimit != 20) return;
                if (variant === '10' && roundsLimit != 10) return;
            }

            const stats = game.stats || {};
            const summary = stats.summary || {}; 
            
            let mpr = parseFloat(summary.mpr || stats.mpr || 0);
            let marks = parseInt(summary.totalMarks || stats.totalMarks || 0);
            let rounds = parseInt(summary.rounds || stats.rounds || 0);
            let score = parseInt(summary.score || stats.score || 0);

            if (marks > 0) {
                totalGames++; 
                if(mpr > bestMPR) bestMPR = mpr;
                totalMarks += marks;
                if(mpr > 0) totalDarts += (marks / mpr) * 3;

                const d = stats.distribution || summary.distribution || {};
                dist.singles += (d.singles || 0);
                dist.doubles += (d.doubles || 0);
                dist.triples += (d.triples || 0);

                // Heatmap durchleiten (vorberechnet)
                const h = stats.heatmap || summary.heatmap;
                if (h) {
                    Object.entries(h).forEach(([k, v]) => { heatmap[k] = (heatmap[k] || 0) + v; });
                }
                
                mprTrend.push(mpr);
                labels.push(this._formatDate(game.date, days));
            }

            const opponents = (settings.opponents) ? settings.opponents : [];
            let resultLabel = "Solo"; 
            let resultClass = "res-solo";
            let opponentText = "Solo";

            const isMatch = (typeof stats.isWinner === 'boolean');

            if (opponents.length > 0) {
                opponentText = opponents.join(", ");
            } else if (isMatch) {
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
                resultLabel, resultClass,
                mpr: marks > 0 ? mpr.toFixed(2) : '-',
                marks, rounds, score
            });
        });

        if (totalGames === 0 && matchHistoryDetails.length === 0) return null;

        const globalMPR = totalDarts > 0 ? ((totalMarks / totalDarts) * 3).toFixed(2) : "0.00";

        return {
            summary: { games: totalGames, avgMPR: globalMPR, bestMPR: bestMPR.toFixed(2), totalMarks },
            distribution: dist,
            heatmap: heatmap,
            matches: matchHistoryDetails.reverse(),
            chart: { labels, values: mprTrend }
        };
    },
    
    /**
     * Single Training Stats
     * Step 7b: Nutzt _aggregateHitDarts() statt manuelles d.val Parsing
     */
    getSingleTrainingStats: function(playerId, days = 30) {
        const filteredHistory = this._getFilteredHistory(playerId, 'single-training', days);
        if (!filteredHistory || filteredHistory.length === 0) return null;

        let totalGames = 0; let totalScoreSum = 0; let bestScore = 0;
        let globalHits = 0; let globalDarts = 0;
        let dist = { singles: 0, doubles: 0, triples: 0 };
        const matchHistoryDetails = [];

        filteredHistory.forEach(game => {
            totalGames++;
            const score = game.totalScore || 0;
            totalScoreSum += score;
            if (score > bestScore) bestScore = score;
            
            // Step 7b: Shared Helper statt manuelles d.val.multiplier Parsing
            const agg = this._aggregateHitDarts(game);
            globalHits += agg.hits;
            globalDarts += agg.totalDarts;
            dist.singles += agg.singles;
            dist.doubles += agg.doubles;
            dist.triples += agg.triples;

            const matchHitRate = agg.totalDarts > 0 ? ((agg.hits / agg.totalDarts) * 100).toFixed(1) + '%' : '0.0%';
            const opponents = (game.settings && game.settings.opponents) ? game.settings.opponents : [];
            let resultLabel = "Solo"; let resultClass = "res-solo";
            if (opponents.length > 0) {
                 if (game.stats && game.stats.isWinner) { resultLabel = "SIEG"; resultClass = "res-win"; }
                 else { resultLabel = "NIEDERLAGE"; resultClass = "res-loss"; }
            }
            matchHistoryDetails.push({
                date: this._formatDate(game.date, days),
                score,
                opponents: opponents.length > 0 ? opponents.join(", ") : "Solo Training",
                resultLabel, resultClass,
                s: agg.singles, d: agg.doubles, t: agg.triples,
                hitRate: matchHitRate
            });
        });

        if (totalGames === 0) return null;

        return {
            summary: { 
                games: totalGames, 
                avgScore: (totalScoreSum / totalGames).toFixed(0), 
                bestScore, 
                hitRate: globalDarts > 0 ? ((globalHits / globalDarts) * 100).toFixed(1) + '%' : '0.0%' 
            },
            distribution: dist, 
            heatmap: {},
            matches: matchHistoryDetails.reverse(),
            chart: { 
                labels: filteredHistory.map(h => this._formatDate(h.date, days)), 
                values: filteredHistory.map(h => h.totalScore) 
            }
        };
    },
    
    /**
     * Bob's 27 Stats
     * Liest turn.hits (kein Dart-Parsing) → keine Format-Probleme.
     */
    getBobs27Stats: function(playerId, days = 30) {
        const filteredHistory = this._getFilteredHistory(playerId, 'bobs27', days);
        if (!filteredHistory || filteredHistory.length === 0) return null;

        let totalGames = 0; let highestScore = -9999; let scoreSum = 0; let gamesSurvived = 0;
        let totalDoublesHit = 0; let totalDartsThrown = 0;
        const matchHistoryDetails = [];

        filteredHistory.forEach(game => {
            totalGames++;
            const finalScore = game.totalScore !== undefined ? game.totalScore : (game.stats?.totalScore || 0);
            scoreSum += finalScore;
            if (finalScore > highestScore) highestScore = finalScore;
            const survived = finalScore >= 0; 
            if (survived) gamesSurvived++;

            let matchHits = 0; let matchDarts = 0;
            if(game.turns) {
                game.turns.forEach(turn => {
                    matchDarts += 3; 
                    const hits = turn.hits || 0;
                    matchHits += hits;
                });
            }
            totalDoublesHit += matchHits; 
            totalDartsThrown += matchDarts;
            
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

        if (totalGames === 0) return null;

        return {
            summary: { 
                games: totalGames, 
                avgScore: (scoreSum / totalGames).toFixed(0), 
                bestScore: highestScore, 
                survivalRate: ((gamesSurvived / totalGames) * 100).toFixed(0) + '%', 
                hitRate: totalDartsThrown > 0 ? ((totalDoublesHit / totalDartsThrown) * 100).toFixed(1) + '%' : '0.0%' 
            },
            heatmap: {},
            matches: matchHistoryDetails.reverse(),
            chart: { 
                labels: filteredHistory.map(h => this._formatDate(h.date, days)), 
                values: filteredHistory.map(h => h.totalScore !== undefined ? h.totalScore : 0) 
            }
        };
    },

    // ─── PRIVATE HELPER ───────────────────────────────────────

    _getFilteredHistory: function(playerId, gameId, days) {
        const player = State.getAvailablePlayers().find(p => p.id === playerId);
        if (!player || !player.history) return null;
        let cutoff = 0;
        if (days === 'all') { 
            cutoff = 0; 
        } else if (days === 'today') { 
            const now = new Date(); 
            now.setHours(0,0,0,0); 
            cutoff = now.getTime(); 
        } else { 
            cutoff = Date.now() - (days * 24 * 60 * 60 * 1000); 
        }
        return player.history
            .filter(h => h.game === gameId && h.date >= cutoff)
            .sort((a, b) => a.date - b.date);
    },

    _formatDate: function(timestamp, daysFilter) {
        const dateObj = new Date(timestamp);
        if (daysFilter === 'today') { 
            return dateObj.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); 
        }
        return dateObj.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }
};
