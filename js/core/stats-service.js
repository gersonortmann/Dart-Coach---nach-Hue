import { State } from './state.js';

export const StatsService = {
    
    // ─── FORMAT-AGNOSTISCHE HELPER ────────────────────────────────────────────

    /**
     * Liest ein Dart aus historischen Turns (altes UND neues Format).
     * Neues Format:     { segment:'D5', multiplier:2, isMiss:false, ... }
     * Altes Training:   { val:{ multiplier:2, isMiss:false }, points:2 }
     * Altes ATB:        { val:'HIT', isHit:true, target:15 }
     */
    _readDart: function(d) {
        if (d.segment !== undefined) {
            return { isMiss: !!d.isMiss, multiplier: d.multiplier || 0 };
        }
        if (d.val && typeof d.val === 'object' && 'multiplier' in d.val) {
            return { isMiss: !!d.val.isMiss, multiplier: d.val.multiplier || 0 };
        }
        if ('isHit' in d) {
            return { isMiss: !d.isHit, multiplier: d.isHit ? 1 : 0 };
        }
        return { isMiss: true, multiplier: 0 };
    },

    /** Aggregiert Hits/Misses/S/D/T aus einem Game (beliebige Treffer). */
    _aggregateHitDarts: function(game) {
        let hits = 0, misses = 0, singles = 0, doubles = 0, triples = 0, totalDarts = 0;
        if (game.turns) {
            game.turns.forEach(turn => {
                (turn.darts || []).forEach(d => {
                    totalDarts++;
                    const parsed = this._readDart(d);
                    if (parsed.isMiss) { misses++; return; }
                    hits++;
                    if (parsed.multiplier === 1) singles++;
                    else if (parsed.multiplier === 2) doubles++;
                    else if (parsed.multiplier === 3) triples++;
                });
            });
        }
        return { hits, misses, singles, doubles, triples, totalDarts };
    },

    /**
     * Aggregiert für Spiele mit Zielfeld-Logik (Shanghai, Single Training).
     * Verwendet d._isHit (Treffer auf ZIELFELD), nicht bloß !isMiss.
     */
    _aggregateTargetHitDarts: function(game) {
        let hits = 0, misses = 0, singles = 0, doubles = 0, triples = 0, totalDarts = 0;
        const targetStats = {};

        if (game.turns) {
            game.turns.forEach((turn, i) => {
                const target = game.targets?.[i] ?? (i < 20 ? i + 1 : 25);
                if (!targetStats[target]) targetStats[target] = { hits: 0, total: 0, score: 0 };

                (turn.darts || []).forEach(d => {
                    totalDarts++;
                    targetStats[target].total++;
                    const isTargetHit = ('_isHit' in d) ? d._isHit : !this._readDart(d).isMiss;

                    if (!isTargetHit) { misses++; return; }
                    hits++;
                    targetStats[target].hits++;
                    targetStats[target].score += d.points || 0;

                    const mult = d.multiplier || this._readDart(d).multiplier || 0;
                    if (mult === 1) singles++;
                    else if (mult === 2) doubles++;
                    else if (mult === 3) triples++;
                });
            });
        }
        return { hits, misses, singles, doubles, triples, totalDarts, targetStats };
    },

    /** Baut Matrix-Daten aus akkumulierten targetStats für Shanghai / Single Training. */
    _buildTargetMatrix: function(accTargetStats, maxTarget, includeBull) {
        const cells = [];
        for (let i = 1; i <= maxTarget; i++) {
            const s = accTargetStats[i];
            const label = String(i);
            if (!s || s.total === 0) {
                cells.push({ label, val: '-', heatClass: 'heat-low' });
            } else {
                const rate = (s.hits / s.total) * 100;
                cells.push({ label, val: rate.toFixed(0) + '%', heatClass: rate >= 66 ? 'heat-high' : rate >= 33 ? 'heat-medium' : 'heat-low' });
            }
        }
        if (includeBull) {
            const s = accTargetStats[25];
            if (!s || s.total === 0) {
                cells.push({ label: 'B', val: '-', heatClass: 'heat-low' });
            } else {
                const rate = (s.hits / s.total) * 100;
                cells.push({ label: 'B', val: rate.toFixed(0) + '%', heatClass: rate >= 66 ? 'heat-high' : rate >= 33 ? 'heat-medium' : 'heat-low' });
            }
        }
        return cells;
    },

    // ─── GENERISCHER AGGREGATOR ───────────────────────────────────────────────

    /**
     * Generischer Stats-Loop. Reduziert Boilerplate in allen getXxxStats()-Methoden.
     *
     * @param {string}   playerId
     * @param {string}   gameId
     * @param {number|string} days
     * @param {Object}   opts
     * @param {Function} opts.filter   (game) => bool  – false = Spiel überspringen (optional)
     * @param {Function} opts.init     ()  => accumulator-Objekt (totalGames wird automatisch hinzugefügt)
     * @param {Function} opts.process  (game, acc) => matchEntry   [this = StatsService]
     * @param {Function} opts.finalize (acc, matches) => result    [this = StatsService]
     * @returns {Object|null}
     */
    _runStats: function(playerId, gameId, days, { filter, init, process, finalize }) {
        const history = this._getFilteredHistory(playerId, gameId, days);
        if (!history?.length) return null;
        const acc = { totalGames: 0, ...init() };
        const matches = [];
        history.forEach(game => {
            if (filter && !filter(game)) return;
            acc.totalGames++;
            const entry = process.call(this, game, acc);
            if (entry) matches.push(entry);
        });
        if (acc.totalGames === 0) return null;
        return finalize.call(this, acc, [...matches].reverse());
    },

    /**
     * Baut einen Standard-Match-History-Eintrag.
     * Liefert { date, opponents, resultLabel, resultClass, ...fields }.
     */
    _mkEntry: function(game, days, soloFallback, fields) {
        const ctx = this._getMatchContext(game, soloFallback);
        return {
            date: this._formatDate(game.date, days),
            opponents: ctx.opponentText,
            resultLabel: ctx.resultLabel,
            resultClass: ctx.resultClass,
            ...fields,
        };
    },

    // ─── MATCH CONTEXT ────────────────────────────────────────────────────────

    /**
     * Bestimmt den Kontext eines Spiels: Solo, Training (Plan) oder Multiplayer.
     * Gibt { resultLabel, resultClass, opponentText } zurück.
     */
    _getMatchContext: function(game, fallbackSoloText) {
        const ctx      = game.matchContext;
        const settings = game.settings || {};
        const stats    = game.stats || {};
        const plan     = game.planContext;

        // Firebase kann Arrays als Objekte {0:'A', 1:'B'} zurückliefern → normalisieren
        const rawOpp = settings.opponents;
        const opponents = Array.isArray(rawOpp) ? rawOpp
            : (rawOpp && typeof rawOpp === 'object') ? Object.values(rawOpp) : [];

        if (ctx === 'multiplayer' || opponents.length > 0) {
            let resultLabel = 'VS';
            let resultClass = 'res-vs';
            if (typeof stats.isWinner === 'boolean') {
                resultLabel = stats.isWinner ? 'SIEG' : 'NIEDERLAGE';
                resultClass = stats.isWinner ? 'res-win' : 'res-loss';
            }
            // Bot-Badge: Gegner deren Name mit 🤖 beginnt oder isBot-Flag
            const opponentDisplay = opponents.map(name => {
                const isBot = typeof name === 'string' && name.startsWith('🤖');
                return isBot ? `<span style="color:#8b5cf6">${name}</span>` : name;
            }).join(', ') || 'Gegner';
            return { resultLabel, resultClass, opponentText: opponentDisplay };
        }

        if (ctx === 'training' || (plan && plan.planId)) {
            return { resultLabel: 'TRAINING', resultClass: 'res-training', opponentText: plan?.planName || 'Trainingsplan' };
        }

        return { resultLabel: 'Solo', resultClass: 'res-solo', opponentText: fallbackSoloText || 'Solo' };
    },

    // ─── PUBLIC STATS METHODS ─────────────────────────────────────────────────

    /**
     * X01 Statistiken  –  variant: 'sido'|'siso'|'dido'|'diso'|'170'|'301'|'501'|'701'|'all'
     */
    getX01Stats: function(playerId, days = 30, variant = 'all') {
        return this._runStats(playerId, 'x01', days, {
            filter: game => {
                if (variant === 'all') return true;
                const ss = game.settings?.startScore || 501;
                return variant === String(ss);
            },
            init: () => ({
                totalScoreSum: 0, totalDartsThrown: 0,
                bestAvg: 0, highestCheckout: 0, globalBestLeg: 999,
                power: { score100: 0, score140: 0, score180: 0 },
                heatmap: {}, avgTrend: [], f9Trend: [], labels: [],
            }),
            process(game, acc) {
                const settings = game.settings || {};
                const di  = settings.doubleIn  || false;
                const dou = settings.doubleOut || false;
                const pStats  = game.stats || {};
                const summary = pStats.summary || {};

                const tScore = pStats.totalScore || summary.totalScore || 0;
                const tDarts = pStats.totalDarts || summary.totalDarts || 0;
                acc.totalScoreSum    += tScore;
                acc.totalDartsThrown += tDarts;

                const avg     = parseFloat(summary.avg     || pStats.average      || 0);
                const first9  = parseFloat(summary.first9  || pStats.first9Avg    || 0);
                const checkout = summary.checkout || pStats.highestCheckout || 0;

                let matchBestLeg = summary.bestLeg || pStats.bestLeg || '-';
                if (matchBestLeg !== '-' && parseInt(matchBestLeg) > 0) {
                    const legVal = parseInt(matchBestLeg);
                    if (legVal < acc.globalBestLeg) acc.globalBestLeg = legVal;
                }
                if (avg > acc.bestAvg) acc.bestAvg = avg;
                if (checkout !== '-' && parseInt(checkout) > acc.highestCheckout) acc.highestCheckout = parseInt(checkout);

                const m100 = pStats.powerScores?.ton  || pStats.score100 || 0;
                const m140 = pStats.powerScores?.ton40 || pStats.score140 || 0;
                const m180 = pStats.powerScores?.max   || pStats.score180 || 0;
                acc.power.score100 += m100;
                acc.power.score140 += m140;
                acc.power.score180 += m180;

                if (pStats.heatmap) {
                    Object.entries(pStats.heatmap).forEach(([k, v]) => {
                        acc.heatmap[k] = (acc.heatmap[k] || 0) + v;
                    });
                }

                acc.avgTrend.push(avg);
                acc.f9Trend.push(first9);
                acc.labels.push(this._formatDate(game.date, days));

                let modeShort = `${settings.startScore || 501} `;
                modeShort += (di ? 'DI' : 'SI');
                modeShort += (dou ? 'DO' : 'SO');

                return this._mkEntry(game, days, 'Solo', {
                    mode: modeShort,
                    avg: avg.toFixed(1),
                    checkout: checkout > 0 ? checkout : '-',
                    bestLeg: matchBestLeg,
                    p100: m100, p140: m140, p180: m180,
                    roundBreakdown: (game.turns || []).map((t, i) => ({
                        idx:          i + 1,
                        score:        t.score ?? 0,
                        totalAfter:   t.totalScoreAfter ?? null,
                        residualAfter: t.residualAfter ?? null,
                        darts:        t.darts || [],
                    })),
                });
            },
            finalize(acc, matches) {
                const lifeAvg = acc.totalDartsThrown > 0
                    ? ((acc.totalScoreSum / acc.totalDartsThrown) * 3).toFixed(1) : '0.0';
                return {
                    summary: {
                        games: acc.totalGames,
                        lifetimeAvg: lifeAvg,
                        bestAvg: acc.bestAvg.toFixed(1),
                        highestCheckout: acc.highestCheckout,
                        bestLeg: acc.globalBestLeg === 999 ? '-' : acc.globalBestLeg,
                        total180s: acc.power.score180,
                        total140s: acc.power.score140,
                        total100s: acc.power.score100,
                    },
                    heatmap: acc.heatmap,
                    matches,
                    charts: { labels: acc.labels, avgTrend: acc.avgTrend, f9Trend: acc.f9Trend },
                };
            },
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  AROUND THE BOARD
    // ─────────────────────────────────────────────────────────────────────────
    getAtcStats: function(playerId, days = 30, variant = 'all') {
        return this._runStats(playerId, 'around-the-board', days, {
            filter: game => variant === 'all' || (game.settings?.variant || 'full') === variant,
            init: () => ({
                totalDarts: 0, totalHits: 0, bestDarts: 9999,
                dartTrend: [], labels: [],
                targetStats: Array.from({ length: 21 }, () => ({ sum: 0, count: 0 })),
            }),
            process(game, acc) {
                const settings = game.settings || {};
                const stats    = game.stats    || {};
                const summary  = stats.summary || {};
                const v = settings.variant || 'full';

                const dartsNeeded = summary.score || 0;
                const hits        = summary.hits  || 0;
                acc.totalDarts += dartsNeeded;
                acc.totalHits  += hits;
                if (hits === 21 && dartsNeeded < acc.bestDarts) acc.bestDarts = dartsNeeded;

                acc.dartTrend.push(dartsNeeded);
                acc.labels.push(this._formatDate(game.date, days));

                // Matrix: Rekonstruktion aus Turns
                if (game.turns) {
                    const allDarts = game.turns.flatMap(t => t.darts || []);
                    let currentTargetIdx = 0;
                    let dartsForCurrent  = 0;
                    for (const d of allDarts) {
                        if (currentTargetIdx >= 21) break;
                        dartsForCurrent++;
                        const parsed = this._readDart(d);
                        if (!parsed.isMiss) {
                            acc.targetStats[currentTargetIdx].sum += dartsForCurrent;
                            acc.targetStats[currentTargetIdx].count++;
                            currentTargetIdx++;
                            dartsForCurrent = 0;
                        }
                    }
                }

                const dirMap = { ascending: 'Aufsteigend', descending: 'Absteigend', random: 'Zufällig' };
                const varMap = {
                    'full': 'Komplettes Segment', 'single-inner': 'Inneres Single',
                    'single-outer': 'Äußeres Single', 'double': 'Nur Doubles', 'triple': 'Nur Triples'
                };
                const dirDisplay = dirMap[settings.direction] || settings.direction || 'Standard';
                const varDisplay = varMap[v] || v;

                const ctx = this._getMatchContext(game, dirDisplay);
                const resultLabel = (ctx.resultLabel === 'Solo' || ctx.resultLabel === 'TRAINING')
                    ? (stats.summary ? 'FINISHED' : 'ABORT') : ctx.resultLabel;
                const resultClass = ctx.resultLabel === 'SIEG' ? 'res-win'
                    : ctx.resultLabel === 'NIEDERLAGE' ? 'res-loss' : 'res-win';

                const roundBreakdown = (game.turns || []).map((t, i) => ({
                    idx: i + 1, score: t.hits > 0 ? `${t.hits} Hit` : '', darts: t.darts || [],
                }));

                return {
                    date: this._formatDate(game.date, days),
                    opponents: ctx.opponentText,
                    resultLabel, resultClass,
                    variant: varDisplay,
                    darts: dartsNeeded,
                    hitRate: summary.hitRate || '-',
                    roundBreakdown,
                };
            },
            finalize(acc, matches) {
                const avgDarts      = (acc.totalDarts / acc.totalGames).toFixed(1);
                const globalHitRate = acc.totalDarts > 0
                    ? ((acc.totalHits / acc.totalDarts) * 100).toFixed(1) + '%' : '0.0%';
                const matrixData = acc.targetStats.map((t, idx) => {
                    const label = idx === 20 ? 'B' : (idx + 1).toString();
                    const val   = t.count > 0 ? (t.sum / t.count).toFixed(1) : '-';
                    let heatClass = 'heat-low';
                    if (t.count > 0) {
                        const v = parseFloat(val);
                        if (v <= 2) heatClass = 'heat-high';
                        else if (v <= 4) heatClass = 'heat-medium';
                    }
                    return { label, val, heatClass };
                });
                return {
                    summary: {
                        games: acc.totalGames, avgDarts,
                        bestDarts: acc.bestDarts === 9999 ? '-' : acc.bestDarts,
                        hitRate: globalHitRate,
                    },
                    matches,
                    matrix: matrixData,
                    chart: { labels: acc.labels, values: acc.dartTrend },
                };
            },
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  SHANGHAI
    // ─────────────────────────────────────────────────────────────────────────
    getShanghaiStats: function(playerId, days = 30, variant = 'all') {
        return this._runStats(playerId, 'shanghai', days, {
            filter: game => {
                if (variant === 'all') return true;
                const isFull = game.settings?.length === 'full';
                return (variant === '20' && isFull) || (variant === '7' && !isFull);
            },
            init: () => ({
                totalScoreSum: 0, bestScore: 0,
                globalHits: 0, globalDarts: 0,
                accTargetStats: {},
                chartLabels: [], chartValues: [],
            }),
            process(game, acc) {
                const isFull = game.settings?.length === 'full';
                const rounds = isFull ? 20 : 7;
                const score  = game.totalScore ?? game.stats?.summary?.score ?? 0;

                acc.totalScoreSum += score;
                if (score > acc.bestScore) acc.bestScore = score;

                const agg = this._aggregateTargetHitDarts(game);
                acc.globalHits  += agg.hits;
                acc.globalDarts += agg.totalDarts;

                Object.entries(agg.targetStats).forEach(([t, s]) => {
                    const key = parseInt(t);
                    if (!acc.accTargetStats[key]) acc.accTargetStats[key] = { hits: 0, total: 0, score: 0 };
                    acc.accTargetStats[key].hits  += s.hits;
                    acc.accTargetStats[key].total += s.total;
                    acc.accTargetStats[key].score += s.score;
                });

                const matchHitRate = agg.totalDarts > 0
                    ? ((agg.hits / agg.totalDarts) * 100).toFixed(1) + '%' : '0.0%';

                const isShanghaiWin = !!(game.stats?.isShanghaiWin);
                const scoreLabel = game.stats?.scoreLabel || null;

                acc.chartLabels.push(this._formatDate(game.date, days));
                acc.chartValues.push(score);

                return this._mkEntry(game, days, `Solo (${rounds} R.)`, {
                    score, hitRate: matchHitRate,
                    isShanghaiWin, scoreLabel,
                    roundBreakdown: (game.turns || []).map((t, i) => ({
                        idx: i + 1, target: i + 1, score: t.score ?? 0, darts: t.darts || [],
                    })),
                });
            },
            finalize(acc, matches) {
                return {
                    summary: {
                        games: acc.totalGames,
                        avgScore: (acc.totalScoreSum / acc.totalGames).toFixed(0),
                        bestScore: acc.bestScore,
                        hitRate: acc.globalDarts > 0
                            ? ((acc.globalHits / acc.globalDarts) * 100).toFixed(1) + '%' : '0.0%',
                    },
                    matrix: this._buildTargetMatrix(acc.accTargetStats, 20, false),
                    heatmap: {},
                    matches,
                    chart: { labels: acc.chartLabels, values: acc.chartValues },
                };
            },
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  CRICKET
    // ─────────────────────────────────────────────────────────────────────────
    getCricketStats: function(playerId, days = 30, variant = 'all') {
        const CRICKET_TARGETS = new Set([15, 16, 17, 18, 19, 20, 25]);

        return this._runStats(playerId, 'cricket', days, {
            filter: game => {
                if (variant === 'all') return true;
                const rl   = game.settings?.spRounds || 0;
                const mode = game.settings?.mode;
                if (variant === 'nolimit' && (rl == 20 || rl == 10)) return false;
                if (variant === '20'      && rl != 20)  return false;
                if (variant === '10'      && rl != 10)  return false;
                if (variant === 'mark21'  && mode !== 'mark21') return false;
                if (variant !== 'mark21'  && variant !== 'nolimit' && mode === 'mark21') return false;
                return true;
            },
            init: () => ({
                totalMarks: 0, totalDarts: 0, bestMPR: 0,
                dist: { singles: 0, doubles: 0, triples: 0 },
                heatmap: {}, mprTrend: [], labels: [],
            }),
            process(game, acc) {
                const settings    = game.settings || {};
                const roundsLimit = settings.spRounds || 0;
                const turns = game.turns || [];

                let gameMarks = 0, gameDarts = 0, gameScore = 0;
                const gameDist = { singles: 0, doubles: 0, triples: 0 };
                let runningScore = 0;

                const roundBreakdown = turns.map((turn, i) => {
                    let turnMarks = 0;
                    (turn.darts || []).forEach(d => {
                        gameDarts++;
                        if (!d.isMiss && d.segment) {
                            acc.heatmap[d.segment] = (acc.heatmap[d.segment] || 0) + 1;
                        }
                        if (!d.isMiss && CRICKET_TARGETS.has(d.base)) {
                            const m = d.multiplier || 0;
                            gameMarks += m; turnMarks += m;
                            if (m === 1) gameDist.singles++;
                            else if (m === 2) gameDist.doubles++;
                            else if (m === 3) gameDist.triples++;
                        }
                    });
                    const turnScore = turn.score ?? 0;
                    runningScore += turnScore;
                    gameScore    += turnScore;
                    return { idx: i + 1, darts: turn.darts || [], marks: turnMarks, score: turnScore, totalAfter: runningScore };
                });

                const gameMPR = gameDarts > 0 ? (gameMarks / gameDarts) * 3 : 0;

                if (gameDarts > 0) {
                    acc.totalMarks += gameMarks;
                    acc.totalDarts += gameDarts;
                    if (gameMPR > acc.bestMPR) acc.bestMPR = gameMPR;
                    acc.dist.singles += gameDist.singles;
                    acc.dist.doubles += gameDist.doubles;
                    acc.dist.triples += gameDist.triples;
                    acc.mprTrend.push(parseFloat(gameMPR.toFixed(2)));
                    acc.labels.push(this._formatDate(game.date, days));
                }

                const soloFallback = roundsLimit ? `Solo (${roundsLimit} R.)` : 'Solo (No Limit)';
                return this._mkEntry(game, days, soloFallback, {
                    mpr:    gameDarts > 0 ? gameMPR.toFixed(2) : '-',
                    marks:  gameMarks,
                    rounds: turns.length,
                    score:  gameScore,
                    roundBreakdown,
                });
            },
            finalize(acc, matches) {
                const globalMPR = acc.totalDarts > 0
                    ? ((acc.totalMarks / acc.totalDarts) * 3).toFixed(2) : '0.00';
                return {
                    summary:      { games: acc.totalGames, avgMPR: globalMPR, bestMPR: acc.bestMPR.toFixed(2), totalMarks: acc.totalMarks },
                    distribution: acc.dist,
                    heatmap:      acc.heatmap,
                    matches,
                    chart:        { labels: acc.labels, values: acc.mprTrend },
                };
            },
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  SINGLE TRAINING
    // ─────────────────────────────────────────────────────────────────────────
    getSingleTrainingStats: function(playerId, days = 30) {
        return this._runStats(playerId, 'single-training', days, {
            init: () => ({
                totalScoreSum: 0, bestScore: 0,
                globalHits: 0, globalDarts: 0,
                accTargetStats: {},
            }),
            process(game, acc) {
                const score = game.totalScore || 0;
                acc.totalScoreSum += score;
                if (score > acc.bestScore) acc.bestScore = score;

                const agg = this._aggregateTargetHitDarts(game);
                acc.globalHits  += agg.hits;
                acc.globalDarts += agg.totalDarts;

                Object.entries(agg.targetStats).forEach(([t, s]) => {
                    const key = parseInt(t);
                    if (!acc.accTargetStats[key]) acc.accTargetStats[key] = { hits: 0, total: 0, score: 0 };
                    acc.accTargetStats[key].hits  += s.hits;
                    acc.accTargetStats[key].total += s.total;
                    acc.accTargetStats[key].score += s.score;
                });

                const matchHitRate = agg.totalDarts > 0
                    ? ((agg.hits / agg.totalDarts) * 100).toFixed(1) + '%' : '0.0%';

                return this._mkEntry(game, days, 'Solo Training', {
                    score, hitRate: matchHitRate,
                    roundBreakdown: (game.turns || []).map((t, i) => ({
                        idx:    i + 1,
                        target: game.targets?.[i] ?? (i < 20 ? i + 1 : 25),
                        score:  t.score ?? 0,
                        darts:  t.darts || [],
                    })),
                });
            },
            finalize(acc, matches) {
                return {
                    summary: {
                        games: acc.totalGames,
                        avgScore: (acc.totalScoreSum / acc.totalGames).toFixed(0),
                        bestScore: acc.bestScore,
                        hitRate: acc.globalDarts > 0
                            ? ((acc.globalHits / acc.globalDarts) * 100).toFixed(1) + '%' : '0.0%',
                    },
                    matrix:  this._buildTargetMatrix(acc.accTargetStats, 20, true),
                    heatmap: {},
                    matches,
                    chart: {
                        labels: matches.slice().reverse().map(m => m.date),
                        values: matches.slice().reverse().map(m => m.score),
                    },
                };
            },
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  BOB'S 27
    // ─────────────────────────────────────────────────────────────────────────
    getBobs27Stats: function(playerId, days = 30) {
        return this._runStats(playerId, 'bobs27', days, {
            init: () => ({
                highestScore: -9999, scoreSum: 0, gamesSurvived: 0,
                totalDoublesHit: 0, totalDartsThrown: 0,
            }),
            process(game, acc) {
                const finalScore = game.totalScore ?? game.stats?.totalScore ?? 0;
                acc.scoreSum += finalScore;
                if (finalScore > acc.highestScore) acc.highestScore = finalScore;
                const survived = finalScore >= 0;
                if (survived) acc.gamesSurvived++;

                let matchHits = 0, matchDarts = 0;
                (game.turns || []).forEach(turn => {
                    matchDarts += 3;
                    matchHits  += turn.hits || 0;
                });
                acc.totalDoublesHit   += matchHits;
                acc.totalDartsThrown  += matchDarts;

                const matchHitRate = matchDarts > 0
                    ? ((matchHits / matchDarts) * 100).toFixed(1) + '%' : '0.0%';

                const roundBreakdown = (game.turns || []).map((t, i) => ({
                    idx:        i + 1,
                    target:     t.target ?? i + 1,
                    hit:        (t.hits ?? 0) > 0,
                    score:      t.change ?? 0,
                    totalAfter: t.score  ?? 0,
                    darts:      t.darts  || [],
                }));

                const ctx = this._getMatchContext(game, survived ? 'SURVIVED' : 'BUST');
                const useCtxLabel = (ctx.resultLabel !== 'Solo' && ctx.resultLabel !== 'TRAINING');
                return {
                    date:        this._formatDate(game.date, days),
                    opponents:   ctx.opponentText,
                    resultLabel: useCtxLabel ? ctx.resultLabel : (survived ? 'SURVIVED' : 'BUST'),
                    resultClass: useCtxLabel ? ctx.resultClass : (survived ? 'res-win' : 'res-loss'),
                    score:       finalScore,
                    hitRate:     matchHitRate,
                    doublesHit:  matchHits,
                    rounds:      game.turns?.length || 0,
                    roundBreakdown,
                };
            },
            finalize(acc, matches) {
                // Chart braucht chronologische Reihenfolge (matches ist bereits reversed)
                const chronoMatches = [...matches].reverse();
                return {
                    summary: {
                        games:        acc.totalGames,
                        avgScore:     (acc.scoreSum / acc.totalGames).toFixed(0),
                        bestScore:    acc.highestScore,
                        survivalRate: ((acc.gamesSurvived / acc.totalGames) * 100).toFixed(0) + '%',
                        hitRate:      acc.totalDartsThrown > 0
                            ? ((acc.totalDoublesHit / acc.totalDartsThrown) * 100).toFixed(1) + '%' : '0.0%',
                    },
                    heatmap: {},
                    matches,
                    chart: {
                        labels:        chronoMatches.map(m => m.date),
                        values:        chronoMatches.map(m => Math.max(0, m.score)),
                        reachedRounds: chronoMatches.map(m => m.rounds),
                    },
                };
            },
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  HALVE IT
    // ─────────────────────────────────────────────────────────────────────────
    getHalveItStats: function(playerId, days = 30, variant = 'all') {
        return this._runStats(playerId, 'halve-it', days, {
            filter: game => variant === 'all' || (game.settings?.mode || 'standard') === variant,
            init: () => ({
                scoreSum: 0, bestScore: 0,
                totalHalvings: 0, totalRounds: 0, totalPerfect: 0,
                chartLabels: [], chartValues: [],
            }),
            process(game, acc) {
                const sm       = game.stats?.summary || game.stats || {};
                const score    = sm.score          ?? game.totalScore ?? 0;
                const halvings = sm.halvings        ?? 0;
                const perfect  = sm.perfectRounds   ?? 0;
                const rounds   = sm.totalRounds     ?? (game.turns?.length || 0);
                const mode     = game.settings?.mode || 'standard';

                acc.scoreSum      += score;
                acc.totalHalvings += halvings;
                acc.totalRounds   += rounds;
                acc.totalPerfect  += perfect;
                if (score > acc.bestScore) acc.bestScore = score;

                acc.chartLabels.push(this._formatDate(game.date, days));
                acc.chartValues.push(score);

                const halvingRate = rounds > 0 ? ((halvings / rounds) * 100).toFixed(0) + '%' : '0%';
                const roundBreakdown = (game.turns || []).map((t, i) => ({
                    idx:        i + 1,
                    target:     game.targets?.[i] ?? '?',
                    score:      t.scoreAdded ?? t.score ?? 0,
                    wasHalved:  !!t.wasHalved,
                    totalAfter: t.totalScoreAfter ?? 0,
                    darts:      t.darts || [],
                }));

                return this._mkEntry(game, days, `Solo (${mode})`, {
                    score, halvings, halvingRate, perfect, rounds, mode, roundBreakdown,
                });
            },
            finalize(acc, matches) {
                const globalHalvingRate = acc.totalRounds > 0
                    ? ((acc.totalHalvings / acc.totalRounds) * 100).toFixed(0) + '%' : '0%';
                return {
                    summary: {
                        games:         acc.totalGames,
                        avgScore:      (acc.scoreSum / acc.totalGames).toFixed(0),
                        bestScore:     acc.bestScore,
                        halvingRate:   globalHalvingRate,
                        perfectRounds: acc.totalPerfect,
                    },
                    matches,
                    chart: { labels: acc.chartLabels, values: acc.chartValues },
                };
            },
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  SCORING DRILL
    // ─────────────────────────────────────────────────────────────────────────
    getScoringDrillStats: function(playerId, days = 30, variant = 'all') {
        return this._runStats(playerId, 'scoring-drill', days, {
            filter: game => {
                if (variant === 'all') return true;
                const dartLimit = game.settings?.dartLimit ?? game.stats?.dartLimit ?? 99;
                return dartLimit === parseInt(variant);
            },
            init: () => ({
                scoreSum: 0, bestScore: 0,
                tonSum: 0, ton40Sum: 0, maxSum: 0, avgSum: 0,
                chartLabels: [], chartValues: [],
            }),
            process(game, acc) {
                const sm  = game.stats?.summary   || game.stats || {};
                const ps  = game.stats?.powerScores || {};
                const dartLimit = game.settings?.dartLimit ?? game.stats?.dartLimit ?? 99;
                const score = sm.score ?? game.totalScore ?? 0;
                const avg   = parseFloat(sm.avg ?? game.stats?.avg ?? 0);
                const ton   = sm.ton    ?? ps.ton   ?? 0;
                const ton40 = sm.ton40  ?? ps.ton40 ?? 0;
                const max   = sm.max    ?? ps.max   ?? 0;

                acc.scoreSum  += score;
                acc.avgSum    += avg;
                acc.tonSum    += ton;
                acc.ton40Sum  += ton40;
                acc.maxSum    += max;
                if (score > acc.bestScore) acc.bestScore = score;

                acc.chartLabels.push(this._formatDate(game.date, days));
                acc.chartValues.push(avg);

                const roundBreakdown = (game.turns || []).map((t, i) => ({
                    idx:        i + 1,
                    score:      t.score       ?? 0,
                    totalAfter: t.totalScoreAfter ?? 0,
                    darts:      t.darts || [],
                }));

                return this._mkEntry(game, days, `Solo (${dartLimit} Darts)`, {
                    score, avg: avg.toFixed(1), ton, ton40, max,
                    limit: dartLimit,
                    roundBreakdown,
                });
            },
            finalize(acc, matches) {
                return {
                    summary: {
                        games:    acc.totalGames,
                        avgScore: (acc.scoreSum  / acc.totalGames).toFixed(0),
                        bestScore: acc.bestScore,
                        avgAvg:   (acc.avgSum    / acc.totalGames).toFixed(1),
                        total180: acc.maxSum,
                        total140: acc.ton40Sum,
                        total100: acc.tonSum,
                    },
                    matches,
                    chart: { labels: acc.chartLabels, values: acc.chartValues },
                };
            },
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  CHECKOUT CHALLENGE
    // ─────────────────────────────────────────────────────────────────────────
    getCheckoutChallengeStats: function(playerId, days = 30, variant = 'all') {
        return this._runStats(playerId, 'checkout-challenge', days, {
            filter: game => {
                if (variant === 'all') return true;
                const rounds = game.settings?.rounds ?? (game.targets?.length ?? 0);
                return String(rounds) === variant;
            },
            init: () => ({
                scoreSum: 0, bestScore: 0,
                totalCheckoutsHit: 0, totalCheckoutsAttempted: 0,
                avgDpcSum: 0, avgDpcCount: 0,
            }),
            process(game, acc) {
                const sm         = game.stats?.summary || game.stats || {};
                const score      = sm.score            ?? sm.totalScore ?? game.totalScore ?? 0;
                const hit        = sm.checkoutsHit     ?? 0;
                const total      = sm.checkoutsTotal   ?? (game.targets?.length ?? 0);
                const difficulty = game.settings?.difficulty || 'standard';

                // Darts pro Checkout: Turns nach roundIndex gruppieren
                const targetTurns = {};
                (game.turns || []).forEach(t => {
                    const ri = t.roundIndex ?? 0;
                    if (!targetTurns[ri]) targetTurns[ri] = { darts: 0, checked: false };
                    targetTurns[ri].darts += (t.darts || []).length;
                    if (t.checked) targetTurns[ri].checked = true;
                });

                let dpcSum = 0, dpcCount = 0;
                Object.values(targetTurns).forEach(tt => {
                    if (tt.checked) { dpcSum += tt.darts; dpcCount++; }
                });

                let avgDpc;
                if (dpcCount > 0) {
                    avgDpc = dpcSum / dpcCount;
                } else if (hit > 0) {
                    const totalDarts = (game.turns || []).reduce((a, t) => a + (t.darts?.length || 0), 0);
                    avgDpc = totalDarts / hit;
                } else {
                    avgDpc = 0;
                }

                acc.scoreSum                += score;
                acc.totalCheckoutsHit       += hit;
                acc.totalCheckoutsAttempted += total;
                if (avgDpc > 0) { acc.avgDpcSum += avgDpc; acc.avgDpcCount++; }
                if (score > acc.bestScore) acc.bestScore = score;

                const checkoutRate = total > 0 ? ((hit / total) * 100).toFixed(0) + '%' : '0%';
                const roundBreakdown = (game.turns || []).map((t, i) => ({
                    idx:    i + 1,
                    target: game.targets?.[t.roundIndex ?? i] ?? '?',
                    hit:    !!t.checked,
                    darts:  t.darts || [],
                }));

                return this._mkEntry(game, days, `Solo (${difficulty})`, {
                    score, hit, total, checkoutRate,
                    avgDpc: avgDpc > 0 ? avgDpc.toFixed(1) : '-',
                    difficulty,
                    roundBreakdown,
                });
            },
            finalize(acc, matches) {
                const globalRate = acc.totalCheckoutsAttempted > 0
                    ? ((acc.totalCheckoutsHit / acc.totalCheckoutsAttempted) * 100).toFixed(0) + '%' : '0%';
                // Chart: chronologisch (matches ist bereits reversed → nochmal reverse für chart)
                const chronoMatches = [...matches].reverse();
                return {
                    summary: {
                        games:        acc.totalGames,
                        avgScore:     (acc.scoreSum / acc.totalGames).toFixed(0),
                        bestScore:    acc.bestScore,
                        checkoutRate: globalRate,
                        avgDpc:       acc.avgDpcCount > 0 ? (acc.avgDpcSum / acc.avgDpcCount).toFixed(1) : '-',
                    },
                    matches,
                    chart: {
                        labels: chronoMatches.map(m => m.date),
                        values: chronoMatches.map(m => m.score),
                        rates:  chronoMatches.map(m => {
                            const tot = m.total ?? 1;
                            return tot > 0 ? Math.round((m.hit / tot) * 100) : 0;
                        }),
                    },
                };
            },
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  KILLER
    // ─────────────────────────────────────────────────────────────────────────
    getKillerStats: function(playerId, days = 30, variant = 'all') {
        return this._runStats(playerId, 'killer', days, {
            filter: game => {
                if (variant === 'all') return true;
                // Variant kann Lives-Filter ('3','5','7') oder Zone-Filter sein
                if (['3','5','7'].includes(variant))
                    return String(game.settings?.lives ?? 3) === variant;
                if (['any','single','double','triple'].includes(variant))
                    return (game.settings?.zone ?? 'double') === variant;
                return true;
            },
            init: () => ({
                survived: 0,
                killsSum: 0, bestKills: 0,
                shieldsSum: 0,
                dtkSum: 0, dtkCount: 0,
                chartLabels: [], chartValues: [],
            }),
            process(game, acc) {
                const sm           = game.stats?.summary || game.stats || {};
                const survived     = sm.survived        ?? false;
                const kills        = sm.kills           ?? 0;
                const shields      = sm.shields         ?? 0;
                const dtk          = sm.dartsToKiller   ?? -1;
                const zone         = sm.zone            ?? game.settings?.zone ?? 'double';
                const shieldOn     = sm.shield          ?? game.settings?.shield ?? false;
                const killerNumber = game.stats?.killerNumber ?? game.killerNumber ?? '?';
                const zoneLabel    = game.stats?.zoneLabel ?? `D${killerNumber}`;

                if (survived) acc.survived++;
                acc.killsSum   += kills;
                acc.shieldsSum += shields;
                if (kills > acc.bestKills) acc.bestKills = kills;
                if (dtk > 0) { acc.dtkSum += dtk; acc.dtkCount++; }

                acc.chartLabels.push(this._formatDate(game.date, days));
                acc.chartValues.push(kills);

                const ctx          = this._getMatchContext(game, survived ? 'SURVIVED' : 'OUT');
                const useCtxLabel  = (ctx.resultLabel !== 'Solo' && ctx.resultLabel !== 'TRAINING');
                return {
                    date:         this._formatDate(game.date, days),
                    opponents:    ctx.opponentText,
                    resultLabel:  useCtxLabel ? ctx.resultLabel : (survived ? 'SIEG' : 'OUT'),
                    resultClass:  useCtxLabel ? ctx.resultClass : (survived ? 'res-win' : 'res-loss'),
                    survived, kills, shields, dartsToKiller: dtk,
                    killerNumber, zoneLabel, zone,
                    shieldOn,
                    roundBreakdown: (game.turns || []).map((t, i) => ({
                        idx:   i + 1,
                        darts: t.darts || [],
                    })),
                };
            },
            finalize(acc, matches) {
                return {
                    summary: {
                        games:            acc.totalGames,
                        survivalRate:     ((acc.survived / acc.totalGames) * 100).toFixed(0) + '%',
                        avgKills:         (acc.killsSum   / acc.totalGames).toFixed(1),
                        bestKills:        acc.bestKills,
                        avgShields:       acc.totalGames > 0 ? (acc.shieldsSum / acc.totalGames).toFixed(1) : '0',
                        avgDartsToKiller: acc.dtkCount > 0 ? (acc.dtkSum / acc.dtkCount).toFixed(1) : '–',
                    },
                    matches,
                    chart: { labels: acc.chartLabels, values: acc.chartValues },
                };
            },
        });
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  SEGMENT MASTER
    // ─────────────────────────────────────────────────────────────────────────
    getSegmentMasterStats: function(playerId, days = 30, variant = 'all') {
        return this._runStats(playerId, 'segment-master', days, {
            filter: game => {
                if (variant === 'all') return true;
                return String(game.settings?.dartLimit ?? 30) === variant;
            },
            init: () => ({
                scoreSum: 0, bestScore: 0,
                totalHits: 0, totalDarts: 0,
                totalTriples: 0, totalDoubles: 0,
                chartLabels: [], chartValues: [],
            }),
            process(game, acc) {
                const sm       = game.stats?.summary || game.stats || {};
                const score    = sm.score      ?? game.totalScore ?? 0;
                const dartLimit = game.settings?.dartLimit ?? 30;
                const target    = game.settings?.segment   ?? 20;

                // Hits aus Rohdaten berechnen (robust für altes + neues Format)
                let matchTriples = 0, matchDoubles = 0, matchSingles = 0, matchDarts = 0;
                (game.turns || []).forEach(turn => {
                    (turn.darts || []).forEach(d => {
                        matchDarts++;
                        const isHit = '_isHit' in d ? d._isHit : (!d.isMiss && d.base === target);
                        if (isHit) {
                            const m = d.multiplier || 0;
                            if (m === 3) matchTriples++;
                            else if (m === 2) matchDoubles++;
                            else matchSingles++;
                        }
                    });
                });
                const matchHits = matchTriples + matchDoubles + matchSingles;

                acc.scoreSum      += score;
                acc.totalHits     += matchHits;
                acc.totalDarts    += matchDarts || dartLimit;
                acc.totalTriples  += matchTriples;
                acc.totalDoubles  += matchDoubles;
                if (score > acc.bestScore) acc.bestScore = score;

                acc.chartLabels.push(this._formatDate(game.date, days));
                acc.chartValues.push(score);

                const hitRate = matchDarts > 0
                    ? ((matchHits / matchDarts) * 100).toFixed(1) + '%' : '0.0%';
                const zone     = game.settings?.zone ?? 'any';
                const baseLabel = target === 25 ? 'Bull' : String(target);
                const zonePrefix = { double:'D', triple:'T' }[zone] ?? '';
                const segLabel = zonePrefix + baseLabel;

                return this._mkEntry(game, days, `Solo (${segLabel})`, {
                    score, hitRate, dartLimit, segLabel,
                    roundBreakdown: (game.turns || []).map((t, i) => ({
                        idx: i + 1, score: t.score ?? 0,
                        totalAfter: t.totalScoreAfter ?? 0, darts: t.darts || [],
                    })),
                });
            },
            finalize(acc, matches) {
                const globalHitRate = acc.totalDarts > 0
                    ? ((acc.totalHits / acc.totalDarts) * 100).toFixed(1) + '%' : '0.0%';
                return {
                    summary: {
                        games:         acc.totalGames,
                        avgScore:      (acc.scoreSum / acc.totalGames).toFixed(0),
                        bestScore:     acc.bestScore,
                        hitRate:       globalHitRate,
                        totalTriples:  acc.totalTriples,
                        totalDoubles:  acc.totalDoubles,
                    },
                    matches,
                    chart: { labels: acc.chartLabels, values: acc.chartValues },
                };
            },
        });
    },

    // ─── PRIVATE HELPER ───────────────────────────────────────────────────────

    _getFilteredHistory: function(playerId, gameId, days) {
        const player = State.getAvailablePlayers().find(p => p.id === playerId);
        if (!player || !player.history) return null;
        let cutoff = 0;
        if (days === 'all') {
            cutoff = 0;
        } else if (days === 'today') {
            const now = new Date();
            now.setHours(0, 0, 0, 0);
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
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  TREND-DATEN (für Stärkenprofil-Tendenzen)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Gibt Wochendurchschnitte pro Achse zurück.
     * Rückgabe: { axis: [{ week: 'KW 12', avg: 58 }, …] }
     * weeks: Anzahl Wochen rückwärts (default 8)
     */
    getTrendData: function(playerId, weeks = 8) {
        const player = State.getAvailablePlayers().find(p => p.id === playerId);
        if (!player?.trendEntries?.length) return {};

        const now    = Date.now();
        const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
        const axes   = ['scoring', 'doubles', 'checkout', 'precision', 'match'];
        const result = {};

        axes.forEach(axis => {
            const weekly = [];
            for (let w = weeks - 1; w >= 0; w--) {
                const end   = now - w * MS_WEEK;
                const start = end - MS_WEEK;
                const entries = player.trendEntries.filter(e =>
                    e.axis === axis && e.date >= start && e.date < end
                );
                if (entries.length > 0) {
                    const avg = Math.round(entries.reduce((s, e) => s + e.score, 0) / entries.length);
                    const label = new Date(start).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
                    weekly.push({ label, avg, count: entries.length });
                }
            }
            if (weekly.length > 0) result[axis] = weekly;
        });

        return result;
    },

    /**
     * Liefert für jede Achse den letzten Score + Tendenz vs. vorherige Woche.
     * Rückgabe: { scoring: { latest: 62, delta: +5, trend: '↑' }, … }
     */
    getLatestTrendScores: function(playerId) {
        const player = State.getAvailablePlayers().find(p => p.id === playerId);
        if (!player?.trendEntries?.length) return {};

        const now     = Date.now();
        const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
        const axes    = ['scoring', 'doubles', 'checkout', 'precision', 'match'];
        const result  = {};

        axes.forEach(axis => {
            const thisWeek  = player.trendEntries.filter(e =>
                e.axis === axis && e.date >= now - MS_WEEK
            );
            const lastWeek  = player.trendEntries.filter(e =>
                e.axis === axis && e.date >= now - 2 * MS_WEEK && e.date < now - MS_WEEK
            );

            if (thisWeek.length === 0) return;

            const latest = Math.round(thisWeek.reduce((s, e) => s + e.score, 0) / thisWeek.length);
            let delta = null, trend = '→';

            if (lastWeek.length > 0) {
                const prev = Math.round(lastWeek.reduce((s, e) => s + e.score, 0) / lastWeek.length);
                delta = latest - prev;
                trend = delta > 2 ? '↑' : delta < -2 ? '↓' : '→';
            }

            result[axis] = { latest, delta, trend, count: thisWeek.length };
        });

        return result;
    },
};