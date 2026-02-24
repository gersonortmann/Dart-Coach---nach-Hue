/**
 * wled-service.js
 * Steuerung eines WLED RGBW-Rings (SK6812/WS2814) via JSON-API.
 * Unterstützt nun benutzerdefinierte Zuweisungen (Presets, Farben, Effekte).
 */

const STORAGE_KEY = 'dc_wled_config';

// ── NAMEN FÜR UI ─────────────────────────────────────────────────────────────
const COLOR_NAMES = {
    coldWhite:  'Kaltweiß',
    green:      'Grün',
    red:        'Rot',
    amber:      'Amber',
    gold:       'Gold',
    cyan:       'Türkis',
    magenta:    'Magenta',
    white_rgb:  'RGB Weiß',
    warmWhite:  'Warmweiß',
    off:        'Aus'
};

const FX_NAMES = {
    SOLID:       'Statisch',
    BLINK:       'Blinken',
    RAINBOW:     'Regenbogen',
    CHASE:       'Verfolgung',
    COLORWAVES:  'Farbwellen',
    SPARKLE:     'Glitzern',
    TWINKLE:     'Funkeln'
};

// ── RGBW-FARBEN (Standard-Palette) ───────────────────────────────────────────
const C = {
    coldWhite:  [0,   0,   0,   255],
    green:      [0,   210, 80,  0  ],
    red:        [220, 30,  30,  0  ],
    amber:      [255, 110, 0,   0  ],
    gold:       [255, 180, 0,   0  ],
    cyan:       [0,   200, 220, 0  ],
    magenta:    [200, 0,   200, 0  ],
    white_rgb:  [255, 255, 255, 0  ],
    warmWhite:  [255, 190, 80,  0  ],
    off:        [0,   0,   0,   0  ],
};

// ── WLED FX-IDs ──────────────────────────────────────────────────────────────
const FX = {
    SOLID:       0,
    BLINK:       1,
    RAINBOW:     9,
    CHASE:       28,
    COLORWAVES:  31,
    SPARKLE:     46,
    TWINKLE:     41,
};

// ── STANDARD DEFAULTS (Fallback) ─────────────────────────────────────────────
// dur: ms bis Rücksprung (null = bleibt). sx=Speed, ix=Intensity
const DEFAULTS_EVENTS = {
    HIT:            { col: C.green,      fx: FX.SOLID,      sx: 128, ix: 128, dur: 600 },
    MISS:           { col: C.red,        fx: FX.SOLID,      sx: 128, ix: 128, dur: 600 },
    BUST:           { col: C.red,        fx: FX.BLINK,      sx: 230, ix: 160, dur: 1200 },
    CHECK:          { col: C.green,      fx: FX.BLINK,      sx: 128, ix: 128, dur: 1200  },
    HIGH_SCORE:     { col: C.gold,       fx: FX.TWINKLE,      sx: 128, ix: 128, dur: 2500  },
    '180':          { col: C.white_rgb,  fx: FX.RAINBOW,    sx: 220, ix: 200, dur: 2500 },
    WIN:            { col: C.white_rgb,  fx: FX.RAINBOW,    sx: 180, ix: 200, dur: 5000 },
    CRICKET_OPEN:   { col: C.green,      fx: FX.BLINK,      sx: 200, ix: 160, dur: 700  },
    CRICKET_CLOSE:  { col: C.cyan,       fx: FX.SOLID,      sx: 128, ix: 128, dur: 700  },
    CORRECTION:     { col: C.amber,      fx: FX.SOLID,      sx: 128, ix: 128, dur: null },
};

const DEFAULTS_SCREENS = {
    'screen-dashboard':   { col: C.warmWhite,  fx: FX.SOLID,   sx: 128, ix: 128 },
    'screen-match-setup': { col: C.magenta,    fx: FX.TWINKLE, sx: 100, ix: 100 },
    'screen-game':        { col: C.coldWhite,  fx: FX.SOLID,   sx: 128, ix: 128 },
    'screen-result':      { col: C.gold,       fx: FX.COLORWAVES, sx: 128, ix: 200 },
};

// ── CONFIG STRUKTUR ──────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
    isEnabled:   false,
    isConnected: false,
    ip:          '',
    brightness:  220,
    // Benutzer-Abweichungen vom Standard
    custom: {
        events: {},
        screens: {}
    },
    // Gespeicherte Lichtprofile (komplette Snapshots der custom-Konfiguration)
    profiles: [],
};

let _cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
let _presets = [];
let _currentMood = null;
let _restoreTimer = null;

// ── INTERNE HELPER ───────────────────────────────────────────────────────────

async function _post(payload) {
    if (!_cfg.ip) return false;
    try {
        const res = await fetch(`http://${_cfg.ip}/json/state`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });
        return res.ok;
    } catch { return false; }
}

function _save() { 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_cfg)); 
}

function _load() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            // Deep merge für custom Felder
            _cfg = { 
                ...DEFAULT_CONFIG, 
                ...parsed, 
                custom: { 
                    events: { ...DEFAULT_CONFIG.custom.events, ...(parsed.custom?.events || {}) },
                    screens: { ...DEFAULT_CONFIG.custom.screens, ...(parsed.custom?.screens || {}) }
                },
                profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
            };
        }
    } catch {
        _cfg = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    }
}

/**
 * Wandelt einen Konfig-String (aus UI) oder ein Default-Objekt in ein WLED-Payload um.
 */
function _buildPayload(val) {
    // Generelle Option: Wir wollen bei Spiel-Events KEINEN weichen Übergang.
    // transition: 0 erzwingt einen harten Cut (0ms).
    const FADE = 4; 

    // Fall 1: Benutzerdefiniertes Preset ("preset:2")
    if (typeof val === 'string' && val.startsWith('preset:')) {
        const id = parseInt(val.split(':')[1]);
        // Auch bei Presets: Sofort umschalten
        return { ps: id, on: true, bri: _cfg.brightness, transition: FADE };
    }

    // Fall 2: Benutzerdefinierte Farbe ("color:red")
    if (typeof val === 'string' && val.startsWith('color:')) {
        const key = val.split(':')[1];
        const color = C[key] || C.coldWhite;
        return { 
            on: true, bri: _cfg.brightness, 
            transition: FADE,
            seg: [{ col: [color, C.off, C.off], fx: 0 }] 
        };
    }

    // Fall 3: Benutzerdefinierter Effekt – "effect:RAINBOW" oder "effect:RAINBOW:white"
    if (typeof val === 'string' && val.startsWith('effect:')) {
        const parts  = val.split(':'); 
        const fxKey  = parts[1];
        const colKey = parts[2]; // optional
        const fxId   = FX[fxKey] !== undefined ? FX[fxKey] : FX.RAINBOW;
        const color  = C[colKey] || C.white_rgb;
        return { 
            on: true, bri: _cfg.brightness, 
            transition: FADE,
            seg: [{ col: [color, C.off, C.off], fx: fxId, sx: 200, ix: 200 }] 
        };
    }

    // Fall 4: Ausgeschaltet
    if (val === 'off') {
        return { on: false, transition: FADE }; 
    }

    // Fall 5: Standard-Objekt (Fallback aus DEFAULTS_...)
    if (typeof val === 'object' && val !== null) {
        return {
            on:  true,
            bri: _cfg.brightness,
            transition: FADE,
            seg: [{
                col: [val.col, C.off, C.off],
                fx:  val.fx,
                sx:  val.sx,
                ix:  val.ix,
            }],
        };
    }
    return null;
}

/** Ermittelt die effektive Konfiguration (Custom > Default) */
function _resolve(category, key) {
    // 1. Schau in Custom Config
    if (category === 'events' && _cfg.custom.events[key]) {
        return _cfg.custom.events[key];
    }
    if (category === 'screens' && _cfg.custom.screens[key]) {
        return _cfg.custom.screens[key];
    }

    // 2. Fallback auf Defaults
    if (category === 'events') return DEFAULTS_EVENTS[key];
    if (category === 'screens') return DEFAULTS_SCREENS[key];
    
    return null;
}

// ── PUBLIC API ────────────────────────────────────────────────────────────────

export const WledService = {

    async init() {
        _load();
        if (_cfg.isEnabled && _cfg.ip) {
            const ok = await this.checkConnection();
            if (ok) this.setMood('screen-dashboard');
        }
    },

    async checkConnection() {
        if (!_cfg.ip) return false;
        try {
            const res = await fetch(`http://${_cfg.ip}/json/info`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const info = await res.json();
            
            _cfg.isConnected = true;
            _save();
            
            console.log('[WLED] Verbunden:', info.name);
            
            // NEU: Sofort Presets laden, sobald Verbindung steht!
            await this.fetchPresets(); 

            return { name: info.name, ledCount: info.leds?.count, version: info.ver };
        } catch(e) {
            _cfg.isConnected = false;
            _save();
            return false;
        }
    },

    async fetchPresets() {
        if (!_cfg.ip) return [];
        try {
            const res  = await fetch(`http://${_cfg.ip}/presets.json`);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            _presets = Object.entries(data)
                .filter(([id, p]) => parseInt(id) > 0 && p?.n)
                .map(([id, p]) => ({ id: parseInt(id), name: p.n }))
                .sort((a, b) => a.id - b.id);
            return _presets;
        } catch(e) {
            return [];
        }
    },

    // ─── STEUERUNG ───────────────────────────────────────────────────────────

    setMood(screenId) {
        if (!_cfg.isEnabled || !_cfg.isConnected) return;
        
        const configVal = _resolve('screens', screenId);
        if (!configVal) return;

        _currentMood = screenId;
        const payload = _buildPayload(configVal);
        if(payload) _post(payload);
    },

    trigger(eventId, overrideDur) {
        if (!_cfg.isEnabled || !_cfg.isConnected) return;

        const configVal = _resolve('events', eventId);
        if (!configVal) return;

        // Wenn Standard (Objekt), nehme Standard-Duration.
        // Wenn Custom (String), nehme auch Standard-Duration als Basis, damit der Effekt endet.
        const defaultObj = DEFAULTS_EVENTS[eventId] || {};
        const dur = overrideDur ?? defaultObj.dur; 

        if (_restoreTimer) { clearTimeout(_restoreTimer); _restoreTimer = null; }

        const payload = _buildPayload(configVal);
        if(payload) _post(payload);

        if (dur !== null) {
            const savedMood = _currentMood || 'screen-game';
            _restoreTimer = setTimeout(() => {
                _restoreTimer = null;
                this.setMood(savedMood);
            }, dur);
        }
    },

    cancelEffect() {
        if (_restoreTimer) { clearTimeout(_restoreTimer); _restoreTimer = null; }
        if (!_cfg.isEnabled || !_cfg.isConnected) return;
        _currentMood = null;
        this.setMood(this._currentScreenId());
    },

    // ─── CONFIG SETTER (VON UI) ──────────────────────────────────────────────

    setConfigValue(category, key, val) {
        if (!_cfg.custom) _cfg.custom = { events: {}, screens: {} };
        if (!_cfg.custom[category]) _cfg.custom[category] = {};

        _cfg.custom[category][key] = val;
        _save();
        // console.log(`[WLED] Config saved: ${category}.${key} = ${val}`);
    },

    setIp(ip) { _cfg.ip = ip.trim(); _cfg.isConnected = false; _save(); },
    
    setBrightness(value) { 
        _cfg.brightness = Math.max(0, Math.min(255, parseInt(value))); 
        _save(); 
    },

    // ─── LICHTPROFILE ────────────────────────────────────────────────────────

    /**
     * Speichert die aktuelle custom-Konfiguration als benanntes Profil.
     * @returns {object} Das gespeicherte Profil
     */
    saveProfile(name) {
        if (!name?.trim()) return null;
        if (!_cfg.profiles) _cfg.profiles = [];
        const profile = {
            id:      'p_' + Date.now(),
            name:    name.trim(),
            events:  { ..._cfg.custom.events  },
            screens: { ..._cfg.custom.screens },
        };
        _cfg.profiles.push(profile);
        _save();
        console.log('[WLED] Profil gespeichert:', profile.name);
        return profile;
    },

    /**
     * Lädt ein Profil und wendet es sofort an (überschreibt custom).
     */
    loadProfile(id) {
        const p = (_cfg.profiles || []).find(x => x.id === id);
        if (!p) return false;
        _cfg.custom.events  = { ...p.events  };
        _cfg.custom.screens = { ...p.screens };
        _save();
        // Mood sofort neu anwenden
        _currentMood = null;
        this.setMood(this._currentScreenId());
        console.log('[WLED] Profil geladen:', p.name);
        return true;
    },

    /** Löscht ein Profil anhand der ID. */
    deleteProfile(id) {
        _cfg.profiles = (_cfg.profiles || []).filter(x => x.id !== id);
        _save();
    },

    getProfiles: () => _cfg.profiles || [],
    
    toggleEnabled() {
        _cfg.isEnabled = !_cfg.isEnabled;
        _save();
        if (!_cfg.isEnabled) { _post({ on: false }); }
        else if (_cfg.isConnected) { this.setMood(this._currentScreenId()); }
        return _cfg.isEnabled;
    },

    // ─── TEST & UTILS ────────────────────────────────────────────────────────

    testEffect(valString) {
        if (!valString) return;
        const payload = _buildPayload(valString);
        if(payload) _post(payload);
    },

    _currentScreenId() {
        return document.querySelector('.screen.active')?.id || 'screen-dashboard';
    },

    // UI-Daten bereitstellen
    getColors: () => {
        const out = {};
        for(const [key, val] of Object.entries(C)) {
            out[key] = { name: COLOR_NAMES[key] || key, value: val };
        }
        return out;
    },

    getEffects: () => {
        const out = {};
        for(const [key, val] of Object.entries(FX)) {
            out[key] = { name: FX_NAMES[key] || key, id: val };
        }
        return out;
    },

    getPresets: () => _presets,

    // Hier war der Fehler: Die UI erwartet events/screens direkt, nicht unter "config"
    getConfig: () => {
        const mergedEvents = {};
        Object.keys(DEFAULTS_EVENTS).forEach(k => {
            if (_cfg.custom.events[k]) {
                mergedEvents[k] = _cfg.custom.events[k];
            } else {
                const def = DEFAULTS_EVENTS[k];
                const colName = Object.keys(C).find(key => C[key] === def.col);
                const fxName  = Object.keys(FX).find(key => FX[key] === def.fx);
                
                if (colName) mergedEvents[k] = `color:${colName}`;
                else if (fxName) mergedEvents[k] = `effect:${fxName}:white`;
                else mergedEvents[k] = 'off';
            }
        });

        const mergedScreens = {};
        Object.keys(DEFAULTS_SCREENS).forEach(k => {
            if (_cfg.custom.screens[k]) {
                mergedScreens[k] = _cfg.custom.screens[k];
            } else {
                const def = DEFAULTS_SCREENS[k];
                const colName = Object.keys(C).find(key => C[key] === def.col);
                if (colName) mergedScreens[k] = `color:${colName}`;
                else mergedScreens[k] = 'off';
            }
        });

        // KORREKTUR: Rückgabe als flache Struktur für UI
        return {
            ..._cfg,
            events: mergedEvents,
            screens: mergedScreens
        };
    },

    isConnected: () => _cfg.isConnected,
    isEnabled:   () => _cfg.isEnabled,
    getStatusInfo() {
        return { enabled: _cfg.isEnabled, connected: _cfg.isConnected, label: 'WLED', icon: '💡' };
    },
};