import { Store } from './store.js';

// Konfiguration
const DEFAULT_USER = "ZCOSuetFzmudvr7TAbDmPJUN1Ta8Lf7N2eJ7D7tL";
const APP_NAME = "dart_coach";

// Farb-Definitionen (Hue: 0-65535, Sat: 0-254, Bri: 0-254)
const COLORS = {
    warmWhite: { ct: 400, bri: 120 }, // Kamin/Start
    green: { hue: 25500, sat: 254, bri: 150 }, // Treffer
    red: { hue: 0, sat: 254, bri: 150 }, // Miss
    magenta: { hue: 50000, sat: 254, bri: 120 }, // Options/Sieg
    gold: { hue: 10000, sat: 254, bri: 254 }, // Alternative für Sieg
    party: { effect: "colorloop", sat: 254, bri: 254 } // 180er
};

const SCENES = {
    greenFire: "BitHBKDu6KCIaUtq", // Grünes Kaminfeuer
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

export const HueService = {

    _currentMood: null,
	
	init: async function() {
        // 1. Gespeicherte Daten laden
        const storedData = localStorage.getItem('dc_hue_config');
        if (storedData) {
            _hueState = { ..._hueState, ...JSON.parse(storedData) };
        } else {
            // Versuche Auto-Discovery beim ersten Start
            await this.discoverBridge();
        }
		
		// WICHTIG: Wenn der User es ausgeschaltet hat, prüfen wir gar nicht erst die Verbindung!
        if (!_hueState.isEnabled) {
            console.log("Hue Service ist deaktiviert.");
            return;
        }
        
        // Wenn wir IP und User haben, checken wir kurz die Verbindung
        if (_hueState.bridgeIp && _hueState.username) {
            this.checkConnection().then(success => {
                if(success) {
                    console.log("💡 Hue Connected via " + _hueState.bridgeIp);
                    // Intro nur starten, wenn wirklich aktiv
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

    // Testet Verbindung und sucht automatisch nach "Flux" oder "Dart"
    checkConnection: async function() {
        if (!_hueState.bridgeIp) return false;
        
        try {
            // 1. Erstmal schauen, ob die API antwortet (Ping via Config)
            const configUrl = `http://${_hueState.bridgeIp}/api/${_hueState.username}/config`;
            const configRes = await fetch(configUrl);
            const configData = await configRes.json();

            if (!configData || configData.error) {
                 console.warn("Hue Check failed. Zertifikat?");
                 return false;
            }
            
            _hueState.isConnected = true;

            // 2. Wenn wir noch keine Lampe haben, suchen wir sie (wie vorher)
            if (!_hueState.lightId) {
                const lightsUrl = `http://${_hueState.bridgeIp}/api/${_hueState.username}/lights`;
                const lightsRes = await fetch(lightsUrl);
                const lights = await lightsRes.json();
                
                for (const [id, light] of Object.entries(lights)) {
                    const name = light.name.toLowerCase();
                    // Sucht nach "flux", "dart" oder "lightstrip"
                    if (name.includes('flux') || name.includes('dart') || name.includes('lightstrip')) {
                        _hueState.lightId = id;
                        console.log(`💡 Licht gefunden: ${light.name} (ID: ${id})`);
                        this._saveConfig();
                        break;
                    }
                }
            }

            // 3. NEU: Wenn wir eine Lampe haben, suchen wir ihren RAUM (Gruppe)
            if (_hueState.lightId && !_hueState.groupId) {
                const groupsUrl = `http://${_hueState.bridgeIp}/api/${_hueState.username}/groups`;
                const groupsRes = await fetch(groupsUrl);
                const groups = await groupsRes.json();

                for (const [gid, group] of Object.entries(groups)) {
                    // Prüfen, ob unsere Lampen-ID in dieser Gruppe ist
                    if (group.lights && group.lights.includes(_hueState.lightId)) {
                        _hueState.groupId = gid;
                        console.log(`🏠 Raum gefunden: ${group.name} (ID: ${gid})`);
                        this._saveConfig();
                        break; // Ersten Treffer nehmen (meist der Raum)
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
        // Diese URL muss der User einmal öffnen, um das Zertifikat zu akzeptieren
        return `https://${_hueState.bridgeIp}/api/${_hueState.username}/config`;
    },

    _saveConfig: function() {
        localStorage.setItem('dc_hue_config', JSON.stringify(_hueState));
    },

	toggleEnabled: function() {
        // 1. Neuen Status setzen
        _hueState.isEnabled = !_hueState.isEnabled;
        this._saveConfig(); 
        
        // 2. Memory Reset (WICHTIG!)
        // Damit beim Anschalten der Befehl 'intro' auch ausgeführt wird, 
        // obwohl er vielleicht vorher schon aktiv war.
        this._currentMood = null; 

        if (_hueState.isEnabled) {
            // === ANSCHALTEN ===
            if (!_hueState.isConnected) {
                // Wenn noch keine Verbindung war, Init starten (das ruft dann setMood auf)
                this.init(); 
            } else {
                // Wenn Verbindung schon da war: Direkt Intro starten
                this.setMood('intro'); 
            }
        } else {
            // === AUSSCHALTEN ===
            // Da wir den Guard in _put entfernt haben, geht dieser Befehl jetzt durch!
            this._put(null, { on: false, transitiontime: 10 });
        }
        
        return _hueState.isEnabled;
    },
	
    // --- LICHT STEUERUNG (Low Level) ---
	
	activateScene: function(sceneId) {
		if (!_hueState.isEnabled || !_hueState.isConnected) return;
        // if (!_hueState.isConnected) return;
        
        // Sicherheits-Check: Haben wir einen Raum gefunden?
        // Wenn nicht, brechen wir lieber ab, statt das ganze Haus zu steuern.
        if (!_hueState.groupId) {
            console.warn("⚠️ Kein Raum für die Dart-Lampe gefunden. Szene wird nicht ausgeführt.");
            return;
        }

        // Wir feuern nur auf die spezifische Gruppen-ID (z.B. "1" für Wohnzimmer)
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
        // KORREKTUR: Hier KEIN Check auf isEnabled! 
        // Wir wollen ja auch den "Licht AUS"-Befehl senden können, wenn wir deaktivieren.
        if (!_hueState.isConnected || !_hueState.lightId) return;
        
        // URL für spezifisches Licht
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

    // --- HIGH LEVEL API FÜR DAS SPIEL ---

    // Setzt eine Grundstimmung (Dauerzustand)
    setMood: function(mood) {
		if (!_hueState.isEnabled || !_hueState.isConnected) return;
        // if (!_hueState.isConnected) return;

		if (this._currentMood === mood) return;
		
		this._currentMood = mood;
		
        console.log("Hue SetMood:", mood);

        switch(mood) {
            case 'intro':
            case 'startup':
                // 1. STARTSEITE: Grünes Kaminfeuer (Szene)
                this.activateScene(SCENES.greenFire);
                break;

            case 'match-setup':
                // 2. SETUP: Magenta (Farbe)
                this._put(null, { on: true, ...COLORS.magenta, effect: 'none', alert: 'none', transitiontime: 10 });
                break;

            case 'warm':
            case 'idle':
                // 3. SPIEL: Warmweiß statisch (Farbe)
                // Wichtig: Szenen laufen oft weiter. Wir müssen 'effect: none' senden, um sicherzugehen.
                this._put(null, { on: true, ...COLORS.warmWhite, effect: 'none', alert: 'none', transitiontime: 10 });
                break;

            case 'match-won':
                this.activateScene(SCENES.goldenFire);
                break;
        }
    },
	
	pulseGreen: function(count = 1) {
		if (!_hueState.isEnabled || !_hueState.isConnected) return;

        // WICHTIG: Da wir hier manuell die Farbe ändern (auf Rot), 
        // stimmt der gespeicherte Status "warm" nicht mehr überein.
        // Wir müssen das Gedächtnis löschen, damit der spätere 
        // setMood('warm')-Befehl nicht blockiert wird!
        this._currentMood = null;

        // 1. ROT AN (schneller Übergang: 200ms)
        this._put(null, { on: true, ...COLORS.green, alert: 'none', transitiontime: 2 });

        // 2. Halten und dann zurücksetzen
        setTimeout(() => {
            // Zurück zur Grundstimmung (Warm)
            // Dank _currentMood = null wird dieser Befehl jetzt GARANTIERT ausgeführt
            this.setMood('warm');

            // 3. REKURSION: Wenn wir noch öfter blinken sollen...
            if (count > 1) {
                // ...warten wir kurz (300ms Pause), damit man das "Aus/Warm" sieht...
                setTimeout(() => {
                    // ...und rufen uns selbst noch einmal auf
                    this.pulseGreen(count - 1);
                }, 500); 
            }
        }, 500); // Wie lange bleibt es rot an? (500ms)
    },
	
	pulseRed: function(count = 1) {
        if (!_hueState.isEnabled || !_hueState.isConnected) return;

        // WICHTIG: Da wir hier manuell die Farbe ändern (auf Rot), 
        // stimmt der gespeicherte Status "warm" nicht mehr überein.
        // Wir müssen das Gedächtnis löschen, damit der spätere 
        // setMood('warm')-Befehl nicht blockiert wird!
        this._currentMood = null;

        // 1. ROT AN (schneller Übergang: 200ms)
        this._put(null, { on: true, ...COLORS.red, alert: 'none', transitiontime: 2 });

        // 2. Halten und dann zurücksetzen
        setTimeout(() => {
            // Zurück zur Grundstimmung (Warm)
            // Dank _currentMood = null wird dieser Befehl jetzt GARANTIERT ausgeführt
            this.setMood('warm');

            // 3. REKURSION: Wenn wir noch öfter blinken sollen...
            if (count > 1) {
                // ...warten wir kurz (300ms Pause), damit man das "Aus/Warm" sieht...
                setTimeout(() => {
                    // ...und rufen uns selbst noch einmal auf
                    this.pulseRed(count - 1);
                }, 500); 
            }
        }, 500); // Wie lange bleibt es rot an? (500ms)
    },

    // Feuert einen einmaligen Effekt
    trigger: function(event) {
		if (!_hueState.isEnabled || !_hueState.isConnected) return;
        // if (!_hueState.isConnected) return;

        console.log("Hue Trigger:", event);
		
		this._currentMood = null;

        switch(event) {
            case 'HIT':
            case 'SINGLE':
            case 'DOUBLE':
            case 'TRIPLE':
                // Grün aufleuchten (kurz)
                // "alert": "select" ist ein einzelnes "Atmen"
                this.pulseGreen(3);
                break;

            case 'MISS':
                // Rot blinken (3x ist schwer mit API "select", wir nehmen "lselect" für 15sek und brechen ab, oder manuell)
                // Manuelles Blinken simulieren
                this.pulseRed(3);
                break;

            case 'HIGH_SCORE': // 100+
                this._put(null, { on: true, ...COLORS.party, alert: 'lselect' }); 
                // Nach 4 Sekunden zurück
                setTimeout(() => this.setMood('warm'), 4000);
                break;

            case '180': 
                // Voller Party Mode
                this._put(null, { on: true, ...COLORS.party, effect: 'colorloop', bri: 254 });
                // Nach 8 Sekunden zurück
                setTimeout(() => this.setMood('warm'), 8000);
                break;
        }
    },

    _blinkRed: function(times) {
        // Rekursive Funktion für manuelles Blinken
        if (times <= 0) {
            this.setMood('warm');
            return;
        }
        // ROT AN
        this._put(null, { on: true, ...COLORS.red, transitiontime: 3 });
        
        setTimeout(() => {
            // AUS (oder dunkel)
            this._put(null, { on: true, bri: 10, transitiontime: 3 });
            setTimeout(() => {
                this._blinkRed(times - 1);
            }, 300);
        }, 300);
    },

    getConfig: () => _hueState
};