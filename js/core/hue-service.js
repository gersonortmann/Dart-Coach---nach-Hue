/**
 * hue-service.js
 * 
 * Steuerung von Philips Hue Lampen über die Hue Bridge (HTTP-API).
 * 
 * WICHTIG: EventBus-Subscriptions wurden ausgelagert nach:
 *   → lighting-coordinator.js
 * 
 * Dieser Service ist rein "dumb" – er empfängt Befehle und setzt sie um.
 * Wer wann welchen Befehl schickt, entscheidet der LightingCoordinator.
 */

import { Store } from './store.js';
import { EventBus } from './event-bus.js';

const DEFAULT_USER = "ZCOSuetFzmudvr7TAbDmPJUN1Ta8Lf7N2eJ7D7tL";

// ── FESTE FARBEN ──────────────────────────────────────────────────────────────
const CONST_COLORS = {
    warmWhite: { name: "Warmweiß",    data: { ct: 400, bri: 150 } },
    coldWhite: { name: "Kaltweiß",    data: { ct: 153, bri: 254 } },
    green:     { name: "Grün",        data: { hue: 25500, sat: 254, bri: 150 } },
    red:       { name: "Rot",         data: { hue: 0,     sat: 254, bri: 150 } },
    blue:      { name: "Blau",        data: { hue: 46920, sat: 254, bri: 150 } },
    magenta:   { name: "Magenta",     data: { hue: 50000, sat: 254, bri: 150 } },
    gold:      { name: "Gold",        data: { hue: 10000, sat: 254, bri: 254 } },
    warmGreen: { name: "Warmes Grün", data: { hue: 18000, sat: 220, bri: 200 } },
};

// ── SPEZIAL-EFFEKTE ───────────────────────────────────────────────────────────
const SPECIAL_EFFECTS = {
    'pulse-green': { name: "Pulsieren (Grün)", func: 'pulseGreen' },
    'pulse-red':   { name: "Pulsieren (Rot)",   func: 'pulseRed' },
    'party':       { name: "Party (Colorloop)", data: { effect: "colorloop", sat: 254, bri: 254 }, duration: 5000 },
    'flash':       { name: "Flash (Alarm)",      data: { alert: "lselect" }, duration: 3000 },
};

// ── KONSTANTEN FÜR DIE UI ─────────────────────────────────────────────────────
export const HUE_CONSTANTS = {
    EVENTS: [
        { id: 'HIT',           label: 'Treffer (Standard)' },
        { id: 'MISS',          label: 'Fehlwurf / Bust' },
        { id: 'HIGH_SCORE',    label: 'Highscore (100+)' },
        { id: '180',           label: '180 / Maximum' },
        { id: 'CHECK',         label: 'Check / Runden-Sieg' },
        { id: 'WIN',           label: 'Match gewonnen' },
        { id: 'CRICKET_OPEN',  label: 'Cricket: Öffnen' },
        { id: 'CRICKET_CLOSE', label: 'Cricket: Schließen' },
    ],
    SCREENS: [
        { id: 'screen-dashboard',   label: 'Dashboard (Start)' },
        { id: 'screen-match-setup', label: 'Match Setup' },
        { id: 'screen-game',        label: 'Im Spiel (Idle)' },
        { id: 'screen-result',      label: 'Ergebnis-Screen' },
    ],
};

// ── INTERNER STATE ────────────────────────────────────────────────────────────
let _hueState = {
    bridgeIp:  null,
    username:  DEFAULT_USER,
    lightId:   null,   // Optional: einzelne Lampe
    groupId:   null,   // Pflicht: Raum/Gruppe
    
    config: {
        events: {
            'HIT':          'cmd:pulse-green:1',
            'MISS':         'cmd:pulse-red:1',
            'HIGH_SCORE':   'cmd:pulse-green:3',
            '180':          'cmd:party',
            'CHECK':        'cmd:pulse-green:3',
            'WIN':          'color:gold',
            'CRICKET_OPEN':  'cmd:pulse-green:1',
            'CRICKET_CLOSE': 'cmd:pulse-green:2',
        },
        screens: {
            'screen-dashboard':   'color:green',
            'screen-match-setup': 'color:magenta',
            'screen-game':        'color:warmWhite',
            'screen-result':      'color:warmGreen',
        },
    },
    
    isConnected: false,
    isEnabled:   false,
    _availableScenes: [],
};

// ── PUBLIC API ────────────────────────────────────────────────────────────────

export const HueService = {
    _currentMood: null,

    // ─── INIT ─────────────────────────────────────────────────────────────────

    async init() {
        const storedData = localStorage.getItem('dc_hue_config');
        if (storedData) {
            const parsed = JSON.parse(storedData);
            _hueState = { ..._hueState, ...parsed };
            if (!_hueState.config) _hueState.config = { events: {}, screens: {} };

            // Migrations: Neue Keys ergänzen falls alte Config
            const defaultEvents = {
                'CHECK':         'cmd:pulse-green:3',
                'CRICKET_OPEN':  'cmd:pulse-green:1',
                'CRICKET_CLOSE': 'cmd:pulse-green:2',
            };
            for (const [k, v] of Object.entries(defaultEvents)) {
                if (!_hueState.config.events[k]) _hueState.config.events[k] = v;
            }
        } else {
            await this.discoverBridge();
        }

        if (_hueState.isEnabled && _hueState.bridgeIp) {
            this.checkConnection().then(ok => {
                if (ok) this.setMood('screen-dashboard');
            });
        }
    },

    // ─── GETTER ───────────────────────────────────────────────────────────────

    getConfig:    () => _hueState,
    getConstants: () => HUE_CONSTANTS,
    getColors:    () => CONST_COLORS,
    getSpecials:  () => SPECIAL_EFFECTS,
    getScenes:    () => _hueState._availableScenes || [],

    /**
     * Gibt die HTTPS-URL zur Hue Bridge zurück (für Zertifikat-Akzeptanz im Browser).
     * Hue Bridge unterstützt HTTPS seit Firmware 1.24 (selbstsigniertes Zertifikat).
     */
    getSetupUrl() {
        if (!_hueState.bridgeIp) return null;
        return `https://${_hueState.bridgeIp}/api/config`;
    },

    /** Liefert einen kombinierten Status-String für das Header-Widget */
    getStatusInfo() {
        return {
            enabled:   _hueState.isEnabled,
            connected: _hueState.isConnected,
            label:     'Hue',
            icon:      '💡',
        };
    },

    // ─── KERN-AKTIONEN ─────────────────────────────────────────────────────────

    executeEffect(configValue, fallbackColorKey = 'warmWhite') {
        if (!_hueState.isEnabled || !_hueState.isConnected || !configValue) return;

        const [type, val, opt] = configValue.split(':');

        if (type === 'color') {
            const col = CONST_COLORS[val] || CONST_COLORS[fallbackColorKey];
            this._put({ on: true, ...col.data, effect: 'none', alert: 'none', transitiontime: 10 });
        } else if (type === 'cmd') {
            const cmd = SPECIAL_EFFECTS[val];
            if (cmd) {
                if (cmd.func) {
                    const count = opt ? parseInt(opt) : 1;
                    this[cmd.func](count);
                } else if (cmd.data) {
                    this._put({ on: true, ...cmd.data });
                    if (cmd.duration) setTimeout(() => this.restoreMood(), cmd.duration);
                }
            }
        } else if (type === 'scene') {
            this.activateScene(val);
        }
    },

    setMood(screenId) {
        if (!_hueState.isEnabled || !_hueState.isConnected) return;
        const cfgVal = _hueState.config.screens[screenId];
        if (!cfgVal) return;
        if (this._currentMood === screenId) return;
        this._currentMood = screenId;
        this.executeEffect(cfgVal, 'warmWhite');
    },

    trigger(eventId) {
        if (!_hueState.isEnabled || !_hueState.isConnected) return;
        
        let cfgVal = _hueState.config.events[eventId];
        if (!cfgVal) return;

        this._currentMood = null;
        this.executeEffect(cfgVal, 'warmWhite');

        if (!cfgVal.startsWith('cmd:party') && !cfgVal.startsWith('cmd:flash')) {
            if (cfgVal.startsWith('color:') || cfgVal.startsWith('scene:')) {
                setTimeout(() => this.restoreMood(), 4000);
            }
        }
    },

    restoreMood() {
        const currentScreen = document.querySelector('.screen.active')?.id || 'screen-dashboard';
        this._currentMood = null;
        this.setMood(currentScreen);
    },

    // ─── PULSE-EFFEKTE ────────────────────────────────────────────────────────

    pulseGreen(count = 1) {
        this._put({ on: true, ...CONST_COLORS.green.data, alert: 'none', transitiontime: 2 });
        setTimeout(() => {
            this.restoreMood();
            if (count > 1) setTimeout(() => this.pulseGreen(count - 1), 600);
        }, 600);
    },

    pulseRed(count = 1) {
        this._put({ on: true, ...CONST_COLORS.red.data, alert: 'none', transitiontime: 2 });
        setTimeout(() => {
            this.restoreMood();
            if (count > 1) setTimeout(() => this.pulseRed(count - 1), 600);
        }, 600);
    },

    // ─── SETUP & NETZWERK ─────────────────────────────────────────────────────

    activateScene(sceneId) {
        if (!_hueState.groupId) return;
        fetch(
            `https://${_hueState.bridgeIp}/api/${_hueState.username}/groups/${_hueState.groupId}/action`,
            { method: 'PUT', body: JSON.stringify({ scene: sceneId }) }
        ).catch(() => {});
    },

    async fetchResources() {
        if (!_hueState.bridgeIp) return null;
        try {
            const base = `https://${_hueState.bridgeIp}/api/${_hueState.username}`;
            const [lRes, gRes] = await Promise.all([
                fetch(`${base}/lights`),
                fetch(`${base}/groups`),
            ]);
            const lights = await lRes.json();
            const groups = await gRes.json();
            return {
                lights: Object.entries(lights || {}).map(([id, d]) => ({ id, name: d.name })),
                groups: Object.entries(groups || {}).map(([id, d]) => ({ id, name: d.name, lights: d.lights || [] })),
            };
        } catch { return null; }
    },

    async fetchScenes(groupId) {
        if (!_hueState.bridgeIp || !groupId) return [];
        try {
            const res  = await fetch(`https://${_hueState.bridgeIp}/api/${_hueState.username}/scenes`);
            const data = await res.json();
            if (data.error) return [];
            const scenes = Object.entries(data)
                .filter(([_, s]) => s.group === groupId && !s.name.startsWith('Group Scene'))
                .map(([id, s]) => ({ id, name: s.name }));
            _hueState._availableScenes = scenes;
            return scenes;
        } catch { return []; }
    },

    setConfigValue(category, key, value) {
        if (!_hueState.config[category]) _hueState.config[category] = {};
        _hueState.config[category][key] = value;
        this._saveConfig();
    },

    setSelection(lightId, groupId) {
        if (lightId !== undefined) _hueState.lightId = lightId;
        if (groupId !== undefined) _hueState.groupId = groupId;
        this._saveConfig();
    },

    async discoverBridge() {
        console.log("🔍 Suche Hue Bridge via Cloud-Discovery...");
        try {
            const controller = new AbortController();
            const timeoutId  = setTimeout(() => controller.abort(), 3000);
            const res = await fetch('https://discovery.meethue.com/', { signal: controller.signal });
            clearTimeout(timeoutId);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (Array.isArray(data) && data.length > 0 && data[0].internalipaddress) {
                const ip = data[0].internalipaddress;
                console.log("✅ Bridge via Cloud gefunden:", ip);
                _hueState.bridgeIp = ip;
                this._saveConfig();
                return ip;
            }
            return null;
        } catch (e) {
            console.warn("Hue Discovery fehlgeschlagen.", e.message);
            return null;
        }
    },

    async checkConnection() {
        if (!_hueState.bridgeIp) return false;
        try {
            const r = await fetch(`https://${_hueState.bridgeIp}/api/${_hueState.username}/config`);
            const d = await r.json();
            if (!d || d.error) return false;
            _hueState.isConnected = true;
            this._saveConfig();
            return true;
        } catch { return false; }
    },

    toggleEnabled() {
        _hueState.isEnabled = !_hueState.isEnabled;
        this._saveConfig();
        if (!_hueState.isEnabled) {
            this._put({ on: false });
        } else if (_hueState.isConnected) {
            this.setMood(document.querySelector('.screen.active')?.id);
        }
        return _hueState.isEnabled;
    },

    // ─── INTERNE HELPER ───────────────────────────────────────────────────────

    _saveConfig() {
        localStorage.setItem('dc_hue_config', JSON.stringify(_hueState));
    },

    /**
     * FIX: Sendet Befehle an lightId (einzelne Lampe) ODER groupId (ganzer Raum).
     * Früher: Brach ab wenn kein lightId gesetzt war → nichts passierte.
     * Jetzt:  Fallback auf Gruppe, wenn keine einzelne Lampe gewählt.
     */
    _put(body) {
        if (!_hueState.bridgeIp) return;

        let url;
        if (_hueState.lightId) {
            // Einzelne Lampe
            url = `https://${_hueState.bridgeIp}/api/${_hueState.username}/lights/${_hueState.lightId}/state`;
        } else if (_hueState.groupId) {
            // Ganzer Raum (Gruppe)
            url = `https://${_hueState.bridgeIp}/api/${_hueState.username}/groups/${_hueState.groupId}/action`;
        } else {
            console.warn('[Hue] Weder lightId noch groupId gesetzt – kein Befehl gesendet.');
            return;
        }

        fetch(url, { method: 'PUT', body: JSON.stringify(body) }).catch(() => {});
    },
};
