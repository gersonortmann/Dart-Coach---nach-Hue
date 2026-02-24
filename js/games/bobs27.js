/**
 * bobs27.js - Bob's 27 Strategy
 *
 * Pro Runde 3 Pfeile auf das aktuelle Doppel (D1..D20, Bull).
 *   Treffer D{n}: +n*2 je Treffer
 *   0 Treffer:   -n*2
 * Score < 0 → BUST.
 */

export const Bobs27 = {
    config: {
        hasOptions: false,
        description: "Starte mit 27 Punkten. Triff die Doppel mit allen 3 Pfeilen. Kein Treffer kostet!"
    },

    generateTargets(options) {
        return [...Array.from({ length: 20 }, (_, i) => i + 1), 25];
    },

    initPlayer(player, options, targets) {
        player.currentResidual = 27;
        player.scoreHistory    = [27];
        player.isEliminated    = false;
        player.liveBobsHits    = 0;
        player.turns           = [];
        player.finished        = false;
    },

    handleInput(session, player, dart) {
        const roundIdx = player.turns.length;
        const targets  = session.targets;
        if (roundIdx >= targets.length) return { action: 'FINISH_GAME' };

        const targetVal = targets[roundIdx];

        // Dart sammeln
        dart._isHit = (dart.multiplier === 2 && dart.base === targetVal);
        session.tempDarts.push(dart);

        // Noch nicht 3 Darts
        if (session.tempDarts.length < 3) {
            return { action: 'CONTINUE' };
        }

        // 3. Dart: Runde auswerten
        const hits = session.tempDarts.filter(d =>
            d.multiplier === 2 && d.base === targetVal
        ).length;

        const dblValue  = targetVal * 2;
        const scoreChange = hits > 0 ? dblValue * hits : -dblValue;

        player.currentResidual += scoreChange;
        player.scoreHistory.push(player.currentResidual);
        player.liveBobsHits = (player.liveBobsHits || 0) + hits;

        player.turns.push({
            target: targetVal,
            hits,
            change:     scoreChange,
            score:      player.currentResidual,
            darts:      [...session.tempDarts],
        });

        let overlayText = scoreChange > 0 ? '+' + scoreChange : String(scoreChange);
        let overlayType = scoreChange > 0 ? 'check' : 'miss';
        let action      = 'NEXT_TURN';

        if (player.currentResidual < 0) {
            player.isEliminated = true;
            player.finished     = true;
            overlayText         = 'BUST';
            overlayType         = 'bust';
        }

        if (roundIdx === targets.length - 1) {
            player.finished = true;
            if (!player.isEliminated) action = 'FINISH_GAME';
        }

        return {
            action,
            overlay: { text: overlayText, type: overlayType },
            delay: 1200,
        };
    },

    getResultData(session, player) {
        const labels = session.targets
            .slice(0, player.turns.length)
            .map(t => t === 25 ? 'BULL' : 'D' + t);

        return {
            summary: {
                finalScore:   player.currentResidual,
                statusText:   player.isEliminated ? 'BUSTED' : 'SURVIVED',
                statusClass:  player.isEliminated ? 'res-loss' : 'res-win',
                totalHits:    player.turns.reduce((a, t) => a + t.hits, 0),
                maxScore:     Math.max(...player.scoreHistory),
                roundsPlayed: player.turns.length,
            },
            chart: {
                labels,
                values: player.scoreHistory,
            },
            history: player.turns.map((t, idx) => ({
                round:      idx + 1,
                target:     session.targets[idx] === 25 ? 'BULL' : 'D' + session.targets[idx],
                hits:       t.hits,
                change:     t.change,
                scoreAfter: t.score,
            })).reverse(),
        };
    },
};
