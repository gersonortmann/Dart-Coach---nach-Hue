import { Store } from './store.js';
import { EventBus } from './event-bus.js';

const DEFAULT_USER = "ZCOSuetFzmudvr7TAbDmPJUN1Ta8Lf7N2eJ7D7tL";

// 1. FESTE FARBEN (Konstanten)
const CONST_COLORS = {
    warmWhite: { name: "Warmweiß",      data: { ct: 400, bri: 150 } },
    coldWhite: { name: "Kaltweiß",      data: { ct: 153, bri: 254 } },
    green:     { name: "Grün",          data: { hue: 25500, sat: 254, bri: 150 } },
    red:       { name: "Rot",           data: { hue: 0, sat: 254, bri: 150 } },
    blue:      { name: "Blau",          data: { hue: 46920, sat: 254, bri: 150 } },
    magenta:   { name: "Magenta",       data: { hue: 50000, sat: 254, bri: 150 } },
    gold:      { name: "Gold",          data: { hue: 10000, sat: 254, bri: 254 } },
    warmGreen: { name: "Warmes Grün",   data: { hue: 18000, sat: 220, bri: 200 } }
};

// 2. SPEZIAL-EFFEKTE (Funktionen)
const SPECIAL_EFFECTS = {
    'pulse-green': { name: "Pulsieren (Grün)", func: 'pulseGreen' },
    'pulse-red':   { name: "Pulsieren (Rot)",   func: 'pulseRed' },
    'party':       { name: "Party (Colorloop)", data: { effect: "colorloop", sat: 254, bri: 254 }, duration: 5000 },
    'flash':       { name: "Flash (Alarm)",     data: { alert: "lselect" }, duration: 3000 }
};

// DEFINITIONEN FÜR DIE UI
export const HUE_CONSTANTS = {
    EVENTS: [
        { id: 'HIT', label: 'Treffer (Standard)' },
        { id: 'MISS', label: 'Fehlwurf / Bust' },
        { id: 'HIGH_SCORE', label: 'Highscore (100+)' },
        { id: '180', label: '180 / Maximum' },
        { id: 'CHECK', label: 'Check / Runden-Sieg' }, // NEU
        { id: 'WIN', label: 'Match gewonnen' },
        { id: 'CRICKET_OPEN', label: 'Cricket: Öffnen' },
        { id: 'CRICKET_CLOSE', label: 'Cricket: Schließen' }
    ],
    SCREENS: [
        { id: 'screen-dashboard', label: 'Dashboard (Start)' },
        { id: 'screen-match-setup', label: 'Match Setup' },
        { id: 'screen-game', label: 'Im Spiel (Idle)' },
        { id: 'screen-result', label: 'Ergebnis-Screen' }
    ]
};

let _hueState = {
    bridgeIp: null,
    username: DEFAULT_USER,
    lightId: null,
    groupId: null,
    
    // Konfiguration
    config: {
        events: {
            'HIT': 'cmd:pulse-green:3',          // Standard: 1x
            'MISS': 'cmd:pulse-red:3',           // Standard: 1x
            'HIGH_SCORE': 'cmd:pulse-green:3',   // NEU: 3x blinken statt statisch Gold (optional)
            '180': 'cmd:party',
            'CHECK': 'cmd:pulse-green:3',        // NEU: Check blinkt 3x grün
            'WIN': 'color:gold',                 // Match Win ist statisch Gold
            'CRICKET_OPEN': 'cmd:pulse-green:1',
            'CRICKET_CLOSE': 'cmd:pulse-green:2'
        },
        screens: {
            'screen-dashboard': 'color:green',
            'screen-match-setup': 'color:magenta',
            'screen-game': 'color:warmWhite',
            'screen-result': 'color:warmGreen'
        }
    },
    
    isConnected: false,
    isEnabled: false,
    _availableScenes: [] 
};

export const HueService = {
    _currentMood: null,

    init: async function() {
        const storedData = localStorage.getItem('dc_hue_config');
        if (storedData) {
            const parsed = JSON.parse(storedData);
            _hueState = { ..._hueState, ...parsed };
            if (!_hueState.config) _hueState.config = { events: {}, screens: {} };
            
            // Migration: Falls CHECK noch fehlt (weil alte Config geladen wurde)
            if (!_hueState.config.events['CHECK']) {
                _hueState.config.events['CHECK'] = 'cmd:pulse-green:3';
            }
        } else {
            await this.discoverBridge();
        }

        if (_hueState.isEnabled && _hueState.bridgeIp) {
            this.checkConnection().then(ok => {
                if(ok) this.setMood('screen-dashboard');
            });
        }
    },

    getConfig: () => _hueState,
    getConstants: () => HUE_CONSTANTS,
    getColors: () => CONST_COLORS,
    getSpecials: () => SPECIAL_EFFECTS,
    getScenes: () => _hueState._availableScenes || [],

    // --- CORE ACTIONS ---

    // Führt einen Befehl aus. Format jetzt: "type:value:option"
    // Beispiel: "cmd:pulse-green:3" -> blinkt 3 mal
    executeEffect: function(configValue, fallbackColorKey = 'warmWhite') {
        if (!_hueState.isEnabled || !_hueState.isConnected || !configValue) return;

        const [type, val, opt] = configValue.split(':'); 

        if (type === 'color') {
            const col = CONST_COLORS[val] || CONST_COLORS[fallbackColorKey];
            this._put(null, { on: true, ...col.data, effect: 'none', alert: 'none', transitiontime: 10 });
        } 
        else if (type === 'cmd') {
            const cmd = SPECIAL_EFFECTS[val];
            if (cmd) {
                if (cmd.func) {
					const parts = configValue.split(':');
					const count = parts[2] ? parseInt(parts[2]) : 1;
                    // FIX: Anzahl der Pulse auslesen
                    // const count = opt ? parseInt(opt) : 1;
                    this[cmd.func](count); 
                } else if (cmd.data) {
                    this._put(null, { on: true, ...cmd.data });
                    if (cmd.duration) {
                        setTimeout(() => this.restoreMood(), cmd.duration);
                    }
                }
            }
        } 
        else if (type === 'scene') {
            this.activateScene(val);
        }
    },

    setMood: function(screenId) {
        if (!_hueState.isEnabled || !_hueState.isConnected) return;
        
        const cfgVal = _hueState.config.screens[screenId];
        if (!cfgVal) return;

        if (this._currentMood === screenId) return;
        this._currentMood = screenId;

        console.log(`Hue Mood: ${screenId} -> ${cfgVal}`);
        this.executeEffect(cfgVal, 'warmWhite');
    },

    trigger: function(eventId) {
        if (!_hueState.isEnabled || !_hueState.isConnected) return;

        // Fallback: Wenn CHECK nicht konfiguriert ist, nutze HIT
        let cfgVal = _hueState.config.events[eventId];
        if (eventId === 'CHECK' && !cfgVal) cfgVal = _hueState.config.events['HIT'];

        console.log(`Hue Trigger: ${eventId} -> ${cfgVal}`);
        
        if (cfgVal) {
            this._currentMood = null; 
            this.executeEffect(cfgVal, 'warmWhite');
            
            if (!cfgVal.startsWith('cmd:party') && !cfgVal.startsWith('cmd:flash')) {
                if (cfgVal.startsWith('color:') || cfgVal.startsWith('scene:')) {
                    setTimeout(() => this.restoreMood(), 4000);
                }
                // Bei "cmd:pulse..." stellt sich die Funktion selbst wieder her
            }
        }
    },

    restoreMood: function() {
        const currentScreen = document.querySelector('.screen.active')?.id || 'screen-dashboard';
        this._currentMood = null; 
        this.setMood(currentScreen);
    },

    // --- UPDATED HELPERS (mit rekursivem Count) ---

    pulseGreen: function(count=1) {
        // Schnell an (transitiontime 2 = 200ms)
        this._put(null, { on: true, ...CONST_COLORS.green.data, alert: 'none', transitiontime: 2 });
        
        setTimeout(() => { 
            // Zurück zur Mood
            this.restoreMood(); 
            
            if (count > 1) {
                // Wenn noch Pulse übrig sind, warte kurz und rufe nochmal auf
                setTimeout(() => this.pulseGreen(count - 1), 600); 
            }
        }, 600); // Dauer des "Grün"-Zustands
    },

    pulseRed: function(count=1) {
        this._put(null, { on: true, ...CONST_COLORS.red.data, alert: 'none', transitiontime: 2 });
        setTimeout(() => { 
            this.restoreMood(); 
            if (count > 1) setTimeout(() => this.pulseRed(count - 1), 600); 
        }, 600);
    },

    activateScene: function(sceneId) {
        if (!_hueState.groupId) return;
        const url = `http://${_hueState.bridgeIp}/api/${_hueState.username}/groups/${_hueState.groupId}/action`;
        fetch(url, { method: 'PUT', body: JSON.stringify({ scene: sceneId }) }).catch(()=>{});
    },

    // --- SETUP & NETWORK ---

    fetchResources: async function() {
        if (!_hueState.bridgeIp) return null;
        try {
            const baseUrl = `http://${_hueState.bridgeIp}/api/${_hueState.username}`;
            const [lRes, gRes] = await Promise.all([ fetch(`${baseUrl}/lights`), fetch(`${baseUrl}/groups`) ]);
            const lights = await lRes.json();
            const groups = await gRes.json();
            
            return {
                lights: Object.entries(lights||{}).map(([id, d]) => ({ id, name: d.name })),
                groups: Object.entries(groups||{}).map(([id, d]) => ({ id, name: d.name, lights: d.lights||[] }))
            };
        } catch (e) { return null; }
    },

    fetchScenes: async function(groupId) {
        if (!_hueState.bridgeIp || !groupId) return [];
        try {
            const res = await fetch(`http://${_hueState.bridgeIp}/api/${_hueState.username}/scenes`);
            const data = await res.json();
            if (data.error) return [];
            
            const scenes = Object.entries(data)
                .filter(([_, s]) => s.group === groupId && !s.name.startsWith('Group Scene')) 
                .map(([id, s]) => ({ id, name: s.name }));
            
            _hueState._availableScenes = scenes; 
            return scenes;
        } catch (e) { return []; }
    },

    setConfigValue: function(category, key, value) {
        if (!_hueState.config[category]) _hueState.config[category] = {};
        _hueState.config[category][key] = value;
        this._saveConfig();
    },

    setSelection: function(lightId, groupId) {
        if(lightId !== undefined) _hueState.lightId = lightId;
        if(groupId !== undefined) _hueState.groupId = groupId;
        this._saveConfig();
    },

    discoverBridge: async function() {
        console.log("🔍 Suche Hue Bridge via Cloud-Discovery...");
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000); 

            const res = await fetch('https://discovery.meethue.com/', { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
            const data = await res.json();
            
            if (Array.isArray(data) && data.length > 0 && data[0].internalipaddress) {
                const ip = data[0].internalipaddress;
                console.log("✅ Bridge via Cloud gefunden:", ip);
                _hueState.bridgeIp = ip;
                this._saveConfig();
                return ip;
            } else { return null; }
        } catch (e) {
            console.warn("Hue Discovery fehlgeschlagen.", e.message);
            return null;
        }
    },
    
    checkConnection: async function() {
        if(!_hueState.bridgeIp) return false;
        try {
            const r = await fetch(`http://${_hueState.bridgeIp}/api/${_hueState.username}/config`);
            const d = await r.json();
            if(!d || d.error) return false;
            _hueState.isConnected = true;
            return true;
        } catch(e) { return false; }
    },

    toggleEnabled: function() {
        _hueState.isEnabled = !_hueState.isEnabled;
        this._saveConfig();
        if(!_hueState.isEnabled) this._put(null, { on: false });
        else if(_hueState.isConnected) this.setMood(document.querySelector('.screen.active')?.id);
        return _hueState.isEnabled;
    },

    _saveConfig: function() { localStorage.setItem('dc_hue_config', JSON.stringify(_hueState)); },
    _put: function(ep, body) {
        if(!_hueState.lightId) return;
        fetch(`http://${_hueState.bridgeIp}/api/${_hueState.username}/lights/${_hueState.lightId}/state`, {
            method: 'PUT', body: JSON.stringify(body)
        }).catch(()=>{});
    }
};

// --- EVENT LISTENER (KORRIGIERT & VERBESSERT) ---

EventBus.on('SCREEN_CHANGED', ({ screen }) => { HueService.setMood(screen); });

EventBus.on('GAME_EVENT', (data) => {
    if (data.type === 'game-started') { HueService.setMood('screen-game'); return; }
    if (data.type !== 'input-processed') return;

    const { overlay, action, value, gameId, lastTurnScore } = data;
    
    // DEBUG OUTPUT (Optional, kann später entfernt werden)
    console.log("[Hue] Event:", { action, overlay: overlay?.type, score: lastTurnScore });

    // 1. MATCH GEWONNEN (Höchste Priorität)
    if (action === 'WIN_MATCH') {
        setTimeout(() => HueService.trigger('WIN'), 500);
        setTimeout(() => HueService.setMood('screen-result'), 3000);
        return;
    }

    // 2. HIGHSCORES & 180 (Bevor Overlay geprüft wird, da Overlays oft generisch sind)
    if (lastTurnScore === 180) { 
        HueService.trigger('180'); 
        return; 
    }
    if (lastTurnScore >= 100) { 
        HueService.trigger('HIGH_SCORE'); 
        return; 
    }

    // 3. OVERLAY EVENTS
    if (overlay) {
        const t = overlay.type;
        
        if (t === 'check') {
            HueService.trigger('HIT');
        }
        else if (t === 'bust' || t === 'miss') {
            HueService.trigger('MISS');
        }
        else if (t === 'cricket-open') {
             HueService.trigger('CRICKET_OPEN');
        }
        else if (t === 'cricket-closed') {
             HueService.trigger('CRICKET_CLOSE');
        }
        else if (t === 'very-high' || t === 'high') {
            // Fallback, falls score logik oben versagt, aber meist schon gefangen
            HueService.trigger('HIGH_SCORE');
        }
        else if (t === 'standard' || t === 'cricket-hit' || t === 'hit') {
             HueService.trigger('HIT');
        }
        
        return; // Wenn ein Overlay da war, sind wir fertig
    }

    // 4. STANDARD HITS / MISSES (Kein Overlay)
    // Wir erlauben jetzt Misses auch bei ATB, da die Sperre entfernt wurde.
    
    // Checken ob value ein Objekt (Autodarts) oder String ist
    const isMiss = (value === 'MISS') || (value?.val?.isMiss) || (value?.isMiss);
    
    if (isMiss) { 
        HueService.trigger('MISS'); 
    }
    else if ((value?.type === 'HIT' || value === 'HIT') || (!isMiss && value)) { 
        HueService.trigger('HIT'); 
    }
});