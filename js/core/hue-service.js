import { Store } from './store.js';
import { EventBus } from './event-bus.js';

// Konfiguration
const DEFAULT_USER = "ZCOSuetFzmudvr7TAbDmPJUN1Ta8Lf7N2eJ7D7tL";
const APP_NAME = "dart_coach";

// Farb-Definitionen (Hue: 0-65535, Sat: 0-254, Bri: 0-254)
const COLORS = {
    warmWhite: { ct: 400, bri: 120 },
    green: { hue: 25500, sat: 254, bri: 150 },
    red: { hue: 0, sat: 254, bri: 150 },
    magenta: { hue: 50000, sat: 254, bri: 120 },
    gold: { hue: 10000, sat: 254, bri: 254 },
    party: { effect: "colorloop", sat: 254, bri: 254 }
};

const SCENES = {
    greenFire: "BitHBKDu6KCIaUtq",
	goldenFire: "3FbIAFFKqilyYtpe"
};

let _hueState = {
    bridgeIp: null,
    username: DEFAULT_USER,
    lightId: null,
	groupId: null,
    isConnected: false,
	isEnabled: false
};

// =========================================================
// SCREEN → MOOD MAPPING (vorher in ui-core.js showScreen())
// =========================================================
const SCREEN_MOOD_MAP = {
    'screen-dashboard':      'intro',
    'screen-game-selector':  'intro',
    'screen-match-setup':    'match-setup',
    'screen-game':           'warm',
    'screen-result':         'match-won'
};

// =========================================================
// OVERLAY → HUE TRIGGER MAPPING (vorher in game-engine.js onInput())
// =========================================================
const OVERLAY_HUE_MAP = {
    '180':             '180',
    'high':            'HIGH_SCORE',
    'very-high':       'HIGH_SCORE',
    'match-win':       '180',
    'miss':            'MISS',
    'bust':            'MISS',
    'standard':        'HIT',
    'cricket-open':    'HIT',
    'cricket-closed':  'HIT',
    'cricket-hit':     'HIT',
    // 'check' wird pro gameId differenziert (siehe _handleGameEvent)
};

export const HueService = {

    _currentMood: null,
	
	init: async function() {
        const storedData = localStorage.getItem('dc_hue_config');
        if (storedData) {
            _hueState = { ..._hueState, ...JSON.parse(storedData) };
        } else {
            await this.discoverBridge();
        }
		
        if (!_hueState.isEnabled) {
            console.log("Hue Service ist deaktiviert.");
            return;
        }
        
        if (_hueState.bridgeIp && _hueState.username) {
            this.checkConnection().then(success => {
                if(success) {
                    console.log("💡 Hue Connected via " + _hueState.bridgeIp);
                    this.setMood('intro');
                }
            });
        }
    },

    // --- SETUP & VERBINDUNG ---

    discoverBridge: async function() {
		const FALLBACK_IP = "192.168.178.40";
		
        try {
            console.log("🔍 Suche Hue Bridge...");
            const res = await fetch('https://discovery.meethue.com/');
            const data = await res.json();
            if (data && data.length > 0) {
                _hueState.bridgeIp = data[0].internalipaddress;
                this._saveConfig();
                console.log("Bridge gefunden:", _hueState.bridgeIp);
                return _hueState.bridgeIp;
            }
        } catch (e) {
            console.error("Hue Discovery failed:", e);
        }
        console.log("⚠️ Nutze Fallback-IP:", FALLBACK_IP);
        _hueState.bridgeIp = FALLBACK_IP;
        this._saveConfig();
        return FALLBACK_IP;
    },

    checkConnection: async function() {
        if (!_hueState.bridgeIp) return false;
        
        try {
            const configUrl = `http://${_hueState.bridgeIp}/api/${_hueState.username}/config`;
            const configRes = await fetch(configUrl);
            const configData = await configRes.json();

            if (!configData || configData.error) {
                 console.warn("Hue Check failed. Zertifikat?");
                 return false;
            }
            
            _hueState.isConnected = true;

            if (!_hueState.lightId) {
                const lightsUrl = `http://${_hueState.bridgeIp}/api/${_hueState.username}/lights`;
                const lightsRes = await fetch(lightsUrl);
                const lights = await lightsRes.json();
                
                for (const [id, light] of Object.entries(lights)) {
                    const name = light.name.toLowerCase();
                    if (name.includes('dart') || name.includes('lightstrip')) {
                        _hueState.lightId = id;
                        console.log(`💡 Licht gefunden: ${light.name} (ID: ${id})`);
                        this._saveConfig();
                        break;
                    }
                }
            }

            if (_hueState.lightId && !_hueState.groupId) {
                const groupsUrl = `http://${_hueState.bridgeIp}/api/${_hueState.username}/groups`;
                const groupsRes = await fetch(groupsUrl);
                const groups = await groupsRes.json();

                for (const [gid, group] of Object.entries(groups)) {
                    if (group.lights && group.lights.includes(_hueState.lightId)) {
                        _hueState.groupId = gid;
                        console.log(`🏠 Raum gefunden: ${group.name} (ID: ${gid})`);
                        this._saveConfig();
                        break;
                    }
                }
            }

            return true;
        } catch (e) {
            console.error("Hue Connection Error:", e);
            return false;
        }
    },

    getSetupUrl: function() {
        return `https://${_hueState.bridgeIp}/api/${_hueState.username}/config`;
    },

    _saveConfig: function() {
        localStorage.setItem('dc_hue_config', JSON.stringify(_hueState));
    },

	toggleEnabled: function() {
        _hueState.isEnabled = !_hueState.isEnabled;
        this._saveConfig(); 
        this._currentMood = null; 

        if (_hueState.isEnabled) {
            if (!_hueState.isConnected) {
                this.init(); 
            } else {
                this.setMood('intro'); 
            }
        } else {
            this._put(null, { on: false, transitiontime: 10 });
        }
        
        return _hueState.isEnabled;
    },
	
    // --- LICHT STEUERUNG (Low Level) ---
	
	activateScene: function(sceneId) {
		if (!_hueState.isEnabled || !_hueState.isConnected) return;
        
        if (!_hueState.groupId) {
            console.warn("⚠️ Kein Raum für die Dart-Lampe gefunden. Szene wird nicht ausgeführt.");
            return;
        }

        const url = `http://${_hueState.bridgeIp}/api/${_hueState.username}/groups/${_hueState.groupId}/action`;

        try {
            fetch(url, {
                method: 'PUT',
                body: JSON.stringify({ scene: sceneId })
            }).catch(e => console.error("Scene Error:", e));
            
            console.log(`🎬 Szene ${sceneId} in Gruppe ${_hueState.groupId} aktiviert.`);
        } catch (e) {
            console.error(e);
        }
    },

    _put: async function(endpoint, body) {
        if (!_hueState.isConnected || !_hueState.lightId) return;
        
        const url = `https://${_hueState.bridgeIp}/api/${_hueState.username}/lights/${_hueState.lightId}/state`;
        
        try {
            fetch(url, {
                method: 'PUT',
                body: JSON.stringify(body)
            }).catch(e => console.error(e));
        } catch (e) {
            // Silent fail
        }
    },

    // --- HIGH LEVEL API ---

    setMood: function(mood) {
		if (!_hueState.isEnabled || !_hueState.isConnected) return;

		if (this._currentMood === mood) return;
		this._currentMood = mood;
		
        console.log("Hue SetMood:", mood);

        switch(mood) {
            case 'intro':
            case 'startup':
                this.activateScene(SCENES.greenFire);
                break;
            case 'match-setup':
                this._put(null, { on: true, ...COLORS.magenta, effect: 'none', alert: 'none', transitiontime: 10 });
                break;
            case 'warm':
            case 'idle':
                this._put(null, { on: true, ...COLORS.warmWhite, effect: 'none', alert: 'none', transitiontime: 10 });
                break;
            case 'match-won':
                this.activateScene(SCENES.goldenFire);
                break;
        }
    },
	
	pulseGreen: function(count = 1) {
		if (!_hueState.isEnabled || !_hueState.isConnected) return;
        this._currentMood = null;
        this._put(null, { on: true, ...COLORS.green, alert: 'none', transitiontime: 2 });
        setTimeout(() => {
            this.setMood('warm');
            if (count > 1) {
                setTimeout(() => this.pulseGreen(count - 1), 500); 
            }
        }, 500);
    },
	
	pulseRed: function(count = 1) {
        if (!_hueState.isEnabled || !_hueState.isConnected) return;
        this._currentMood = null;
        this._put(null, { on: true, ...COLORS.red, alert: 'none', transitiontime: 2 });
        setTimeout(() => {
            this.setMood('warm');
            if (count > 1) {
                setTimeout(() => this.pulseRed(count - 1), 500); 
            }
        }, 500);
    },

    trigger: function(event) {
		if (!_hueState.isEnabled || !_hueState.isConnected) return;

        console.log("Hue Trigger:", event);
		this._currentMood = null;

        switch(event) {
            case 'HIT':
            case 'SINGLE':
            case 'DOUBLE':
            case 'TRIPLE':
                this.pulseGreen(3);
                break;
            case 'MISS':
                this.pulseRed(3);
                break;
            case 'HIGH_SCORE':
                this._put(null, { on: true, ...COLORS.party, alert: 'lselect' }); 
                setTimeout(() => this.setMood('warm'), 4000);
                break;
            case '180': 
                this._put(null, { on: true, ...COLORS.party, effect: 'colorloop', bri: 254 });
                setTimeout(() => this.setMood('warm'), 8000);
                break;
        }
    },

    getConfig: () => _hueState
};


// =========================================================
// EVENT-BUS SUBSCRIPTIONS
// =========================================================
// Alle Mapping-Logik lebt jetzt HIER statt in game-engine.js / ui-core.js.
// Neue Services (Sound, etc.) subscriben einfach auf die gleichen Events.
// =========================================================

/**
 * SCREEN_CHANGED: Setzt die Grundstimmung passend zum Screen.
 * Emittiert von ui-core.js showScreen()
 */
EventBus.on('SCREEN_CHANGED', ({ screen }) => {
    const mood = SCREEN_MOOD_MAP[screen];
    if (mood) {
        HueService.setMood(mood);
    }
});

/**
 * GAME_EVENT: Reagiert auf Spiel-Events (Overlay, Input, Highscore, Match-Win).
 * Emittiert von game-engine.js onInput() und startGame()
 */
EventBus.on('GAME_EVENT', (data) => {
    
    // A) Spiel gestartet → Warmweiß
    if (data.type === 'game-started') {
        HueService.setMood('warm');
        return;
    }

    // Ab hier nur 'input-processed' Events
    if (data.type !== 'input-processed') return;

    const { overlay, action, value, gameId, lastTurnScore } = data;
    let hueTriggered = false;

    // B) Overlay-Events (Priorität 1)
    if (overlay) {
        hueTriggered = true;
        const overlayType = overlay.type;

        // Sonderfall: 'check' hängt vom Spieltyp ab
        if (overlayType === 'check') {
            if (gameId === 'bobs27') {
                HueService.trigger('HIT');
            } else {
                HueService.trigger('180');
            }
        } 
        // Standard-Mapping aus der Tabelle
        else if (OVERLAY_HUE_MAP[overlayType]) {
            HueService.trigger(OVERLAY_HUE_MAP[overlayType]);
        } 
        // Unbekannter Overlay-Typ → Default HIT
        else {
            HueService.trigger('HIT');
        }
    }

    // C) Stille Treffer/Miss (kein Overlay) → Priorität 2
    if (!hueTriggered) {
        const isHitEvent = (value?.type === 'HIT') || (value === 'HIT');
        const isDirectMiss = (value === 'MISS');

        if (isHitEvent || isDirectMiss) {
            const isMiss = isDirectMiss || (value?.val?.isMiss);

            if (isMiss) {
                // ATB: Bei stillen Misses (1./2. Dart) KEIN Rotlicht.
                // Rotlicht kommt nur über das Overlay am Rundenende.
                if (gameId !== 'around-the-board') {
                    HueService.trigger('MISS');
                }
            } else {
                HueService.trigger('HIT');
            }
        }
    }

    // D) Highscore-Check (X01/Training - nach Turn-Abschluss)
    if (lastTurnScore !== null && lastTurnScore !== undefined) {
        setTimeout(() => {
            if (lastTurnScore === 180) {
                HueService.trigger('180');
            } else if (lastTurnScore >= 100) {
                HueService.trigger('HIGH_SCORE');
            }
        }, 600);
    }

    // E) Match-Win Stimmung (verzögert)
    if (action === 'WIN_MATCH') {
        setTimeout(() => HueService.setMood('match-won'), 2000);
    }
});
