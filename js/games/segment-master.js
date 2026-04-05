/**
 * Segment Master Strategy
 *
 * Wähle ein Segment (1–20 oder Bull) und eine Zone:
 *   any    → jeder Treffer zählt (Single=1, Double=2, Triple=3)
 *   single → Inner + Outer Single zählen (1 Pkt)
 *   inner  → nur Inner Single – mit Autodarts; manuell = jede Single
 *   outer  → nur Outer Single – mit Autodarts; manuell = jede Single
 *   double → nur Double (2 Pkt)
 *   triple → nur Triple (3 Pkt)
 *
 * Limit: Anzahl Aufnahmen (turnLimit × 3 Darts).
 */

function _zoneMatch(dart, zone, target) {
    if (dart.isMiss || dart.base !== target) return false;
    switch (zone) {
        case 'any':    return true;
        case 'single': return dart.multiplier === 1;
        case 'double': return dart.multiplier === 2;
        case 'triple': return dart.multiplier === 3;
        case 'inner':
            // Autodarts: 'SI20' = inner, 'SO20' = outer
            if (dart.segment && /^S[IO]/.test(dart.segment)) return dart.segment.startsWith('SI');
            return dart.multiplier === 1; // manuell: kein Unterschied
        case 'outer':
            if (dart.segment && /^S[IO]/.test(dart.segment)) return dart.segment.startsWith('SO');
            return dart.multiplier === 1;
        default: return true;
    }
}

function _zonePoints(dart, zone) {
    if (zone === 'any')    return dart.multiplier;
    if (zone === 'triple') return 3;
    if (zone === 'double') return 2;
    return 1;
}

export const SegmentMaster = {

    config: {
        hasOptions: true,
        description: 'Wähle Segment + Zone – triff in der vorgegebenen Anzahl Aufnahmen so oft wie möglich.',
        mode: 'pro',
        defaultProInput: true,
    },

    generateTargets(options) {
        return [options.segment ?? 20];
    },

    initPlayer(player, options) {
        player.score       = 0;
        player.turnLimit   = options.turnLimit ?? 10;
        player.target      = options.segment   ?? 20;
        player.zone        = options.zone       ?? 'any';
        player.dartsThrown = 0;   // nur nach Aufnahme inkrementiert
        player.hitStats    = { single: 0, double: 0, triple: 0 };
        player.liveHitRate = '0.0%';
        player.turns       = [];
    },

    handleInput(session, player, dart) {
        const isHit = _zoneMatch(dart, player.zone, player.target);
        let pts = 0;
        if (isHit) {
            pts = _zonePoints(dart, player.zone);
            if (dart.multiplier === 1) player.hitStats.single++;
            else if (dart.multiplier === 2) player.hitStats.double++;
            else if (dart.multiplier === 3) player.hitStats.triple++;
        }
        dart._isHit = isHit;
        player.score += pts;
        session.tempDarts.push(dart);

        // Live Hit-Rate: gezählte Treffer / (fertige Darts + aktuelle Aufnahme)
        const totalHits  = player.hitStats.single + player.hitStats.double + player.hitStats.triple;
        const totalDarts = player.dartsThrown + session.tempDarts.length;
        player.liveHitRate = totalDarts > 0
            ? ((totalHits / totalDarts) * 100).toFixed(1) + '%' : '0.0%';

        if (session.tempDarts.length < 3) {
            return { action: 'CONTINUE', overlay: null };
        }

        // ── Aufnahme vorbei ────────────────────────────────────────────────
        const turnScore = session.tempDarts.reduce(
            (a, d) => a + (d._isHit ? _zonePoints(d, player.zone) : 0), 0);

        player.dartsThrown += 3;   // NACH Aufnahme zählen → kein Doppelzählen
        this._saveTurn(player, session.tempDarts, turnScore);

        const overlayType = turnScore > 0 ? 'hit' : 'miss';
        const overlayText = turnScore > 0 ? String(turnScore) : 'MISS';

        if (player.turns.length >= player.turnLimit) {
            player.finished = true;
            const allFinished = session.players.every(p => p.finished);
            return { action: allFinished ? 'WIN_MATCH' : 'NEXT_TURN',
                     overlay: { text: overlayText, type: overlayType }, delay: 2000 };
        }

        return { action: 'NEXT_TURN', overlay: { text: overlayText, type: overlayType }, delay: 1500 };
    },

    _saveTurn(player, darts, turnScore) {
        player.turns.push({ score: turnScore, totalScoreAfter: player.score, darts: [...darts] });
    },

    handleWinLogik(session, player) {
        const segLabel  = player.target === 25 ? 'Bull' : String(player.target);
        const zoneLabel = { any:'', single:' Single', inner:' Inner', outer:' Outer',
                            double:' Double', triple:' Triple' }[player.zone] || '';
        return {
            messageTitle:   'SEGMENT MASTER',
            messageBody:    `${player.name}: ${player.score} Pkt auf ${segLabel}${zoneLabel}`,
            nextActionText: 'STATISTIK',
        };
    },

    getResultData(session, player) {
        const totalHits = player.hitStats.single + player.hitStats.double + player.hitStats.triple;
        const hitRate   = player.dartsThrown > 0
            ? ((totalHits / player.dartsThrown) * 100).toFixed(1) + '%' : '0.0%';
        const chartValues = [0];
        player.turns.forEach(t => chartValues.push(t.totalScoreAfter));
        const chartLabels = chartValues.map((_, i) => i === 0 ? 'Start' : String(i));
        const heatmap = {};
        player.turns.flatMap(t => t.darts || []).forEach(d => {
            if (!d.isMiss && d.segment) heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
        });
        return {
            summary: {
                score:     player.score,
                turnLimit: player.turnLimit,
                dartLimit: player.turnLimit * 3,
                target:    player.target,
                zone:      player.zone ?? 'any',
                hitRate,
                hits:      { ...player.hitStats },
            },
            heatmap,
            chart: {
                labels: chartLabels,
                datasets: [{ label: 'Score', data: chartValues,
                    borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.1)', fill: true }],
            },
        };
    },
};