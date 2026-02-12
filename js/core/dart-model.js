// =========================================================
// DART MODEL – Universelles Datenformat für jeden Wurf
// =========================================================
//
// Normalisiert alle Input-Formate (Keypad, Autodarts) in ein
// einheitliches Dart-Objekt. Dieses Objekt fließt durch das
// gesamte System: Strategy → Turns → Firebase → Stats.
//
// QUELLEN & FORMATE (verifiziert gegen tatsächlichen Code):
//
//   Pro Keypad (X01/Cricket): 'S20', 'D20', 'T20', '25', '50', '0'
//   Training/Shanghai Keypad: { multiplier: 1-3, isMiss: bool }
//   Bob's 27 Keypad:          { hits: 0-3 } (Runden-Aggregat!)
//   ATB Keypad:               'HIT', 'MISS'
//   Autodarts (Firebase):     { segment: 'T20', x: 6.2, y: -3.1, confidence: 0.95 }
//

// ─── INTERNE BUILDER ────────────────────────────────────

function _miss(source = 'keypad') {
    return {
        segment: 'MISS', base: 0, multiplier: 0, points: 0,
        isMiss: true, source,
        position: null, confidence: null
    };
}

function _dart(base, multiplier, source = 'keypad', position = null, confidence = null) {
    const prefix = multiplier === 3 ? 'T' : multiplier === 2 ? 'D' : 'S';
    const segment = base === 25
        ? (multiplier >= 2 ? 'D25' : 'S25')
        : prefix + base;

    return {
        segment, base, multiplier,
        points: base * multiplier,
        isMiss: false, source,
        position, confidence
    };
}

// ─── HAUPT-NORMALIZER ───────────────────────────────────

/**
 * Wandelt JEDES Input-Format in ein universelles Dart-Objekt um.
 *
 * @param {*} raw - Roher Input vom Keypad oder Autodarts
 * @param {object} [ctx] - Kontext
 * @param {number} [ctx.target] - Aktuelle Zielzahl (für Training/Shanghai/ATB/Bob's27)
 * @param {string} [ctx.gameId] - Spiel-ID (für Sonderfälle)
 * @param {string} [ctx.source] - 'keypad' oder 'autodarts'
 * @returns {object} Universelles Dart-Objekt
 */
export function normalizeDart(raw, ctx = {}) {
    const source = ctx.source || 'keypad';
    const target = ctx.target || 0;

    // ─── Autodarts (hat segment + x/y) ──────────────────
    if (raw && typeof raw === 'object' && raw.segment && raw.x !== undefined) {
        const parsed = parseSegment(raw.segment);
        if (parsed.isMiss) return _miss('autodarts');
        return _dart(
            parsed.base, parsed.multiplier, 'autodarts',
            { x: raw.x, y: raw.y },
            raw.confidence ?? null
        );
    }

    // ─── Bereits normalisiert (hat segment + base) ──────
    if (raw && typeof raw === 'object' && raw.segment && raw.base !== undefined) {
        return raw; // Durchleiten
    }

    // ─── String-basierte Inputs ─────────────────────────

    if (typeof raw === 'string') {
        if (raw === '0' || raw === 'MISS') return _miss(source);

        if (raw === 'HIT') {
            // ATB: HIT → Single auf aktuelle Zielzahl
            return target ? _dart(target, 1, source) : _dart(1, 1, source);
        }

        if (raw === '25') return _dart(25, 1, source);
        if (raw === '50') return _dart(25, 2, source);

        // Segment-String: S20, D20, T20, S25, D25
        const type = raw.charAt(0);
        const num = parseInt(raw.substring(1));

        if (!isNaN(num) && num >= 1 && num <= 25) {
            const mult = type === 'T' ? 3 : type === 'D' ? 2 : 1;
            return _dart(num, mult, source);
        }

        console.warn(`[DartModel] Unbekannter String-Input: "${raw}"`);
        return _miss(source);
    }

    // ─── Object-basierte Inputs ─────────────────────────

    if (raw && typeof raw === 'object') {

        // Training / Shanghai: { multiplier: 1-3, isMiss: bool }
        if ('multiplier' in raw && 'isMiss' in raw) {
            if (raw.isMiss || raw.multiplier === 0) return _miss(source);
            return _dart(target, raw.multiplier, source);
        }

        // Bob's 27: { hits: 0-3 } (Runden-Aggregat)
        if ('hits' in raw) {
            const d = raw.hits > 0
                ? _dart(target, 2, source)  // Double auf Target
                : _miss(source);
            d._isAggregate = true;
            d._aggregateHits = raw.hits;
            return d;
        }
    }

    // ─── Fallback ───────────────────────────────────────
    console.warn(`[DartModel] Unbekannter Input:`, raw);
    return _miss(source);
}


// ─── HISTORY-NORMALIZER ─────────────────────────────────

/**
 * Liest Dart-Daten aus bestehenden Firebase-Einträgen.
 * Versteht sowohl das alte als auch das neue Format.
 *
 * @param {object} stored - Ein Element aus turn.darts[]
 * @param {number} [target] - Zielzahl der Runde
 * @returns {object} Universelles Dart-Objekt
 */
export function normalizeFromHistory(stored, target = 0) {
    if (!stored) return _miss();

    // Neues Format (hat 'segment')
    if (stored.segment) return stored;

    // Altes X01/Cricket: val ist String ('S20', 'T17', '0', '25', '50')
    if (typeof stored.val === 'string') {
        return normalizeDart(stored.val, { target });
    }

    // Altes Training/Shanghai: val ist { multiplier, isMiss }
    if (stored.val && typeof stored.val === 'object' && 'multiplier' in stored.val) {
        return normalizeDart(stored.val, { target });
    }

    // Altes ATB: { val: 'HIT'/'MISS', isHit, target }
    if ('isHit' in stored) {
        return stored.isHit
            ? _dart(stored.target || target, 1)
            : _miss();
    }

    // Fallback: Nur Points vorhanden
    if (stored.points && stored.points > 0) {
        return { ..._miss(), isMiss: false, points: stored.points, _legacy: true };
    }

    return _miss();
}


// ─── SEGMENT PARSER (Utility) ───────────────────────────

/**
 * Parst einen Segment-String in Bestandteile.
 * Nützlich für Heatmap, Stats, Autodarts-Integration.
 *
 * @param {string} segment - z.B. 'T20', 'D25', 'S1', 'MISS'
 * @returns {{ base: number, multiplier: number, points: number, isMiss: boolean }}
 */
export function parseSegment(segment) {
    if (!segment || segment === 'MISS') {
        return { base: 0, multiplier: 0, points: 0, isMiss: true };
    }

    if (segment === 'S25') return { base: 25, multiplier: 1, points: 25, isMiss: false };
    if (segment === 'D25') return { base: 25, multiplier: 2, points: 50, isMiss: false };

    const type = segment.charAt(0);
    const num = parseInt(segment.substring(1));

    if (isNaN(num)) return { base: 0, multiplier: 0, points: 0, isMiss: true };

    const mult = type === 'T' ? 3 : type === 'D' ? 2 : 1;
    return { base: num, multiplier: mult, points: num * mult, isMiss: false };
}
