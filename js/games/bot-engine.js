/**
 * BotEngine – Virtueller Gegner für Dart Coach
 *
 * Unterstützte Spiele: x01, cricket, killer, shanghai, checkout-challenge
 *
 * Spielstärke: 30er–100er Average (5er-Schritte)
 * Modell: Gauß-ähnliche Streuung um Ziel-Segment.
 * Bei X01 ≥ Checkout-Schwelle: intelligente Finish-Route aus CHECKOUTS-Tabelle.
 *
 * Integration: BotEngine.scheduleTurn(session, player) wird von game-engine.js
 * nach _nextTurn() aufgerufen wenn player.isBot === true.
 */

import { CHECKOUTS } from '../core/constants.js';

// ─── BOARD LAYOUT ────────────────────────────────────────────────────────────
// Clockwise order starting at 20, used for neighbour lookup
const BOARD_ORDER = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];
const BOARD_IDX   = {};
BOARD_ORDER.forEach((n, i) => { BOARD_IDX[n] = i; });

// ─── DIFFICULTY TABLE ────────────────────────────────────────────────────────
// Maps average (30–100) to throw profile probabilities (sum = 1.0)
// triple: P(T-target), double: P(D-target), single: P(S-target),
// neighbour: P(neighbour segment, any mult), miss: P(off-board)
const DIFFICULTY = {
     30: { triple:0.03, double:0.06, single:0.30, neighbour:0.48, miss:0.13 },
     35: { triple:0.05, double:0.08, single:0.33, neighbour:0.43, miss:0.11 },
     40: { triple:0.07, double:0.10, single:0.36, neighbour:0.39, miss:0.08 },
     45: { triple:0.10, double:0.13, single:0.37, neighbour:0.34, miss:0.06 },
     50: { triple:0.14, double:0.15, single:0.37, neighbour:0.29, miss:0.05 },
     55: { triple:0.18, double:0.17, single:0.36, neighbour:0.24, miss:0.05 },
     60: { triple:0.23, double:0.18, single:0.34, neighbour:0.21, miss:0.04 },
     65: { triple:0.28, double:0.19, single:0.31, neighbour:0.18, miss:0.04 },
     70: { triple:0.33, double:0.20, single:0.29, neighbour:0.15, miss:0.03 },
     75: { triple:0.38, double:0.20, single:0.27, neighbour:0.12, miss:0.03 },
     80: { triple:0.44, double:0.20, single:0.24, neighbour:0.10, miss:0.02 },
     85: { triple:0.50, double:0.20, single:0.20, neighbour:0.08, miss:0.02 },
     90: { triple:0.56, double:0.20, single:0.16, neighbour:0.06, miss:0.02 },
     95: { triple:0.62, double:0.20, single:0.12, neighbour:0.05, miss:0.01 },
    100: { triple:0.68, double:0.20, single:0.08, neighbour:0.03, miss:0.01 },
};

// ─── HELPER: random weighted pick ───────────────────────────────────────────
function _pick(p) {
    let r = Math.random();
    if (r < p.triple)                           return 'triple';
    if (r < p.triple + p.double)                return 'double';
    if (r < p.triple + p.double + p.single)     return 'single';
    if (r < p.triple + p.double + p.single + p.neighbour) return 'neighbour';
    return 'miss';
}

function _neighbour(base) {
    const idx = BOARD_IDX[base];
    if (idx === undefined) return Math.ceil(Math.random() * 20);
    const offset = Math.random() < 0.5 ? -1 : 1;
    return BOARD_ORDER[(idx + offset + 20) % 20];
}

function _rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

/** Baut ein normalisiertes Dart-Objekt aus segment+multiplier. */
function _makeDart(base, multiplier) {
    if (multiplier === 0 || base === 0) {
        return { segment: 'S0', base: 0, multiplier: 0, points: 0, isMiss: true, source: 'bot' };
    }
    const pfx = multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : 'S';
    const seg  = base === 25 ? (multiplier === 2 ? 'D25' : 'S25') : `${pfx}${base}`;
    return { segment: seg, base, multiplier, points: base * multiplier, isMiss: false, source: 'bot' };
}

/** Erzeugt einen Miss-Dart (landet irgendwo zufällig, aber low points). */
function _missDart() {
    const bases = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20];
    const base  = bases[Math.floor(Math.random() * bases.length)];
    return _makeDart(base, 1); // Single, aber als _isHit=false markiert von Strategy
}

/** Parst einen Segment-String aus der CHECKOUTS-Tabelle ("T20", "D16", "25" …). */
function _parseCheckoutSegment(token) {
    token = token.trim();
    if (token === 'Bull' || token === '25') return { base: 25, multiplier: 2 };
    if (token.startsWith('T')) return { base: parseInt(token.slice(1)), multiplier: 3 };
    if (token.startsWith('D')) return { base: parseInt(token.slice(1)), multiplier: 2 };
    return { base: parseInt(token), multiplier: 1 };
}

// ─── THROW GENERATORS ────────────────────────────────────────────────────────

/**
 * Generiert einen Dart auf ein Ziel-Segment.
 * target: { base, multiplier }  (was der Bot anpeilt)
 * p: difficulty profile
 */
function _throwAt(target, p) {
    const outcome = _pick(p);
    const { base, multiplier: wantedMult } = target;

    switch (outcome) {
        case 'triple':
            // Zielt auf Triple → trifft Triple des Ziels wenn möglich
            if (wantedMult === 3) return _makeDart(base, 3);
            if (wantedMult === 2) return _makeDart(base, 3); // Überschuss → trotzdem nah dran
            return _makeDart(base, 3);

        case 'double':
            if (wantedMult === 2) return _makeDart(base, 2);
            return _makeDart(base, 2);

        case 'single':
            return _makeDart(base, 1);

        case 'neighbour': {
            const nb   = _neighbour(base);
            const mult = _rand(1, 3);
            return _makeDart(nb, mult);
        }

        case 'miss':
        default:
            return _missDart();
    }
}

// ─── CHECKOUT INTELLIGENCE ───────────────────────────────────────────────────

/**
 * Gibt das nächste Ziel (base, multiplier) für X01 zurück.
 * Wenn Checkout möglich und im CHECKOUTS-Table: nimmt den ersten Token.
 * Sonst: T20 (oder T19/T18 je nach Rest), ab 40 Points: passende Doubles.
 *
 * dartIndex: 0=erster Dart der Aufnahme, 1=zweiter, 2=dritter
 */
function _x01Target(residual, dartIndex, difficulty) {
    // ── Checkout möglich? ────────────────────────────────────────────────────
    if (residual <= 170 && CHECKOUTS[residual]) {
        const tokens  = CHECKOUTS[residual].split(' ');
        const token   = tokens[dartIndex] ?? tokens[tokens.length - 1];
        const parsed  = _parseCheckoutSegment(token);
        return parsed;
    }

    // ── Setup: Rest >170 oder kein direkter Checkout ──────────────────────
    // Höherer Avg → zielt auf T20; niedrigerer Avg → realistischere Ziele
    if (residual > 40) {
        // Standard: T20, ab Avg<50 manchmal T19
        const preferT19 = difficulty <= 50 && Math.random() < 0.3;
        return preferT19 ? { base: 19, multiplier: 3 } : { base: 20, multiplier: 3 };
    }

    // ── Rest ≤ 40: Double anpeilen ───────────────────────────────────────────
    if (residual % 2 === 0 && residual >= 2) {
        return { base: residual / 2, multiplier: 2 };
    }
    // Ungerade: erst 1er werfen zum Setup
    return { base: 1, multiplier: 1 };
}

// ─── SPIEL-SPEZIFISCHE SINGLE-DART-LOGIK ─────────────────────────────────────
// Jede Funktion erzeugt genau EINEN Dart mit dem aktuellen State.
// dartIdx = 0/1/2 (Index in der laufenden Aufnahme = session.tempDarts.length zum Aufrufzeitpunkt)

function _singleDartX01(session, player, p) {
    const residual    = player.currentResidual;
    const dartIdx     = session.tempDarts?.length ?? 0;
    const target      = _x01Target(residual, dartIdx, p._difficulty);
    const isDoubleOut = session.settings?.doubleOut !== false;
    let dart          = _throwAt(target, p);

    if (isDoubleOut) {
        const newRes = residual - dart.points;
        if (newRes < 0 || newRes === 1 || (newRes === 0 && dart.multiplier !== 2)) {
            dart = _makeDart(dart.base, 1);
            if (residual - dart.points < 0) dart = _missDart();
        }
    }
    dart._isHit = !dart.isMiss;
    return dart;
}

function _singleDartCricket(session, player, p) {
    const TARGETS    = [20, 19, 18, 17, 16, 15, 25];
    // Marks werden LIVE aus dem aktuellen player-State gelesen
    const openTarget = TARGETS.find(t => (player.marks?.[t] || 0) < 3);
    const target     = openTarget
        ? { base: openTarget, multiplier: 3 }
        : { base: 20, multiplier: 3 };
    const dart = _throwAt(target, p);
    dart._isHit = !dart.isMiss && TARGETS.includes(dart.base);
    return dart;
}

function _singleDartKiller(session, player, p) {
    const zone = session.settings?.zone ?? 'double';
    const shield = session.settings?.shield ?? false;

    // Multiplier je Zone
    const multForZone = { any: 1, single: 1, double: 2, triple: 3 };
    const mult = multForZone[zone] ?? 2;

    // Wahrscheinlichkeiten je Zone anpassen
    const hitChance = zone === 'triple' ? p.triple
        : zone === 'double' ? p.double
        : zone === 'single' ? p.single
        : (p.single + p.double + p.triple); // any
    const pZone = {
        triple:    zone === 'triple' ? p.triple : 0,
        double:    zone === 'double' ? p.double * 0.7 : (zone === 'any' ? p.double * 0.5 : 0),
        single:    zone === 'single' ? p.single : (zone === 'any' ? p.single * 0.5 : 0),
        neighbour: p.neighbour + (1 - hitChance) * 0.5,
        miss:      p.miss + 0.05,
    };

    let target;
    if (!player.isKiller) {
        target = { base: player.killerNumber, multiplier: mult };
    } else {
        // Shield: gelegentlich eigenes Feld anvisieren wenn Leben < max
        if (shield && player.lives < player._maxLives && Math.random() < 0.25) {
            target = { base: player.killerNumber, multiplier: mult };
        } else {
            const victims = session.players.filter(pl => !pl.finished && pl.id !== player.id);
            const victim  = victims[Math.floor(Math.random() * victims.length)];
            target = victim
                ? { base: victim.killerNumber, multiplier: mult }
                : { base: player.killerNumber, multiplier: mult };
        }
    }
    return _throwAt(target, pZone);
}

function _singleDartShanghai(session, player, p) {
    // Shanghai: Ziel ändert sich erst nach der Aufnahme (turns.length) – kein Mid-Turn-Wechsel
    const turnIdx = player.turns.length;
    const target  = session.targets?.[turnIdx] ?? (turnIdx + 1);
    const dart    = _throwAt({ base: target, multiplier: 1 }, p);
    dart._isHit   = !dart.isMiss && dart.base === target;
    return dart;
}

function _singleDartCheckout(session, player, p) {
    const target  = session.targets?.[player._roundIdx ?? player.turns.length] ?? 50;
    const residual = player._residual ?? target;
    const dartIdx  = session.tempDarts?.length ?? 0;
    const seg      = _x01Target(residual, dartIdx, p._difficulty);
    const dart     = _throwAt(seg, p);
    dart._isHit    = !dart.isMiss;
    return dart;
}

function _singleDartSingleTraining(session, player, p) {
    const turnIdx = player.turns.length;
    const target  = session.targets?.[turnIdx] ?? (turnIdx + 1);
    const dart    = _throwAt({ base: target, multiplier: 1 }, p);
    dart._isHit   = !dart.isMiss && dart.base === target;
    return dart;
}

function _singleDartAtb(session, player, p) {
    // currentResidual wurde nach jedem Treffer sofort inkrementiert → immer aktuell
    const target = session.targets?.[player.currentResidual] ?? 1;
    const base   = target === 25 ? 25 : target;
    const dart   = _throwAt({ base, multiplier: 1 }, p);
    dart._isHit  = !dart.isMiss && dart.base === base;
    return dart;
}

function _singleDartBobs27(session, player, p) {
    const roundIdx  = player.turns.length;
    const targetVal = session.targets?.[roundIdx] ?? 1;
    const pDouble   = {
        triple:    0,
        double:    p.double * 0.8,
        single:    p.single * 0.6,
        neighbour: p.neighbour + p.triple + p.double * 0.2 + p.single * 0.4,
        miss:      p.miss + 0.05,
    };
    const dart  = _throwAt({ base: targetVal, multiplier: 2 }, pDouble);
    dart._isHit = dart.multiplier === 2 && dart.base === targetVal;
    return dart;
}

function _singleDartHalveIt(session, player, p) {
    const roundIdx = session.roundIndex ?? player.turns.length;
    const targetId = session.targets?.[roundIdx];
    let base, multiplier;
    if (targetId === 'ANY_DOUBLE')      { base = 20; multiplier = 2; }
    else if (targetId === 'ANY_TRIPLE') { base = 20; multiplier = 3; }
    else if (targetId === 'BULL' || targetId === 25) { base = 25; multiplier = 1; }
    else { base = parseInt(targetId) || 20; multiplier = 1; }

    const pAdjusted = (multiplier === 2 || multiplier === 3) ? {
        triple:    multiplier === 3 ? p.triple * 0.8 : 0,
        double:    multiplier === 2 ? p.double * 0.8 : p.double * 0.3,
        single:    p.single * 0.6,
        neighbour: p.neighbour + p.triple * (multiplier === 3 ? 0.2 : 1) + p.double * (multiplier === 2 ? 0.2 : 0.7) + p.single * 0.4,
        miss:      p.miss + 0.05,
    } : p;
    const dart = _throwAt({ base, multiplier }, pAdjusted);
    let isHit;
    if (targetId === 'ANY_DOUBLE')       isHit = dart.multiplier === 2;
    else if (targetId === 'ANY_TRIPLE')  isHit = dart.multiplier === 3;
    else if (targetId === 'BULL' || targetId === 25) isHit = dart.base === 25;
    else isHit = !dart.isMiss && dart.base === (parseInt(targetId) || 20);
    dart._isHit = isHit;
    return dart;
}

function _singleDartSegmentMaster(session, player, p) {
    const target = player.target ?? session.targets?.[0] ?? 20;
    const zone   = player.zone ?? 'any';
    const multiplier = zone === 'triple' ? 3 : zone === 'double' ? 2 : 1;
    const pAdjusted = multiplier > 1 ? {
        triple:    multiplier === 3 ? p.triple * 0.8 : 0,
        double:    multiplier === 2 ? p.double * 0.8 : p.double * 0.3,
        single:    p.single * 0.6,
        neighbour: p.neighbour + p.triple * (multiplier === 3 ? 0.2 : 1) + p.double * (multiplier === 2 ? 0.2 : 0.7) + p.single * 0.4,
        miss:      p.miss + 0.05,
    } : p;
    const dart = _throwAt({ base: target, multiplier }, pAdjusted);
    let isHit;
    if (zone === 'double')       isHit = dart.multiplier === 2 && dart.base === target;
    else if (zone === 'triple')  isHit = dart.multiplier === 3 && dart.base === target;
    else                         isHit = !dart.isMiss && dart.base === target;
    dart._isHit = isHit;
    return dart;
}

// ─── SPEED DELAYS ────────────────────────────────────────────────────────────
const SPEED_DELAYS = {
    instant: { between: 0,    after: 0    },
    fast:    { between: 250,  after: 300  },
    medium:  { between: 600,  after: 700  },
    slow:    { between: 1100, after: 1200 },
};

// ─── PUBLIC API ───────────────────────────────────────────────────────────────
export const BotEngine = {

    /**
     * Gibt true zurück wenn der aktuelle Spieler ein Bot ist.
     */
    isBot(player) {
        return !!(player?.isBot);
    },

    /** Gibt den Between-Delay für den Bot zurück (für Overlay-Timing in game-engine). */
    getBetweenDelay(player) {
        const speed  = player?.botSpeed ?? 'medium';
        const delays = SPEED_DELAYS[speed] ?? SPEED_DELAYS.medium;
        return delays.between || 400;
    },

    /**
     * Lazy-Generation: Jeder Dart wird erst unmittelbar vor dem Wurf generiert,
     * sodass Zieländerungen mid-turn (ATB, X01 Checkout, Cricket Marks) korrekt
     * berücksichtigt werden.
     *
     * onInputFn liefert nach dem Aufruf synchron den aktualisierten State zurück –
     * der nächste Dart liest deshalb bereits den neuen player/session-State.
     */
    scheduleTurn(session, player, onInputFn) {
        const difficulty = player.botDifficulty ?? 60;
        const snapped    = Math.round(difficulty / 5) * 5;
        const clamped    = Math.max(30, Math.min(100, snapped));
        const p          = { ...DIFFICULTY[clamped], _difficulty: clamped };

        const speed  = player.botSpeed ?? 'medium';
        const delays = SPEED_DELAYS[speed] ?? SPEED_DELAYS.medium;

        // Lazy: Dart erst generieren wenn er geworfen wird
        const fire = (dartIdx) => {
            if (dartIdx >= 3) return;
            // Player-State nach letztem onInputFn-Aufruf ist jetzt aktuell
            const dart = this._generateSingleDart(session, player, p);
            onInputFn(dart.segment, dart);
            // Nur weiterfeuern wenn kein Turn-Ende eingetreten
            // (game-engine setzt isLocked, weitere onInput-Calls werden verworfen)
            if (dartIdx < 2) {
                setTimeout(() => fire(dartIdx + 1), delays.between || 1);
            }
        };

        const startDelay = delays.between > 0 ? delays.between : 1;
        setTimeout(() => fire(0), startDelay);
    },

    /**
     * Wählt den richtigen Single-Dart-Generator je nach Spiel.
     * Liest den AKTUELLEN session/player-State – kein Vorab-Snapshot.
     */
    _generateSingleDart(session, player, p) {
        switch (session.gameId) {
            case 'x01':               return _singleDartX01(session, player, p);
            case 'cricket':           return _singleDartCricket(session, player, p);
            case 'killer':            return _singleDartKiller(session, player, p);
            case 'shanghai':          return _singleDartShanghai(session, player, p);
            case 'checkout-challenge':return _singleDartCheckout(session, player, p);
            case 'single-training':   return _singleDartSingleTraining(session, player, p);
            case 'around-the-board':  return _singleDartAtb(session, player, p);
            case 'bobs27':            return _singleDartBobs27(session, player, p);
            case 'halve-it':          return _singleDartHalveIt(session, player, p);
            case 'segment-master':    return _singleDartSegmentMaster(session, player, p);
            case 'scoring-drill':
            default:
                return _throwAt({ base: 20, multiplier: 3 }, p);
        }
    },
};