import { State } from '../core/state.js';
import { GameEngine } from '../games/game-engine.js';
import { Dashboard } from './ui-dashboard.js';
import { Auth } from './ui-auth.js';
import { Setup } from './ui-setup.js';
import { Stats } from './ui-stats.js';
import { Management } from './ui-mgmt.js';
import { Game } from './ui-game.js';
import { Keyboard } from './ui-keyboard.js';
import { HueService } from '../core/hue-service.js';
import { WledService } from '../core/wled-service.js';
import { LightingCoordinator } from '../core/lighting-coordinator.js';
import { EventBus } from '../core/event-bus.js';
import { AutodartsService } from '../core/autodarts-service.js';

const GAME_NAMES = {
    'x01': 'X01 Match',
	'single-training': 'Single Training',
	'shanghai': 'Shanghai',
	'cricket': 'Cricket',
	'around-the-board': 'Around the Board',
	'bobs27': "Bob's 27",
	'checkout-challenge': 'Checkout Challenge',
	'halve-it': 'Halve It',
	'scoring-drill': 'Scoring Drill',
	'segment-master': 'Segment Master',
	'killer': 'Killer'
    /* CLEAN SWEEP: Andere Spiele vorerst deaktiviert
    'warmup': 'Warmup Routine',
    'catch40': 'Catch 40',
    */
};

const SCREEN_CONFIG = {
    'screen-login': { 
        home: false, restart: false, logout: false, settings: false,
        badge: false, title: "🎯 DART COACH V2" 
    },
    'screen-dashboard': { 
        home: false, restart: false, logout: true, settings: true,
        badge: false, title: "Dart Coach V2.0 by Schlomo" 
    },
    'screen-match-setup': { 
        home: true, restart: false, logout: false,  settings: false,
        badge: false, title: "DYNAMIC_SETUP" // Platzhalter für dynamischen Titel
    },
    'screen-game': { 
        home: true, restart: true, logout: false,  settings: false,
        badge: true, title: "DYNAMIC_GAME"   // Platzhalter für dynamischen Titel
    },
    'screen-result': { 
        home: false, restart: false, logout: false,  settings: false,
        badge: false, title: "MATCH RESULT" 
    }
};

// --- HELPER FUNKTIONEN (Privat im Modul) ---

function _updateHeaderButtons(config) {
    const btnHome = document.getElementById('btn-home');
    const btnRestart = document.getElementById('btn-restart');
    const btnLogout = document.getElementById('btn-logout'); 
    const adBadge = document.getElementById('ad-status-badge');
	const btnSettings = document.getElementById('btn-settings');

    // Sichtbarkeit setzen (Fallback auf 'none' wenn Element fehlt)
    if (btnHome) btnHome.style.display = config.home ? 'flex' : 'none';
    if (btnRestart) btnRestart.style.display = config.restart ? 'flex' : 'none';
    if (btnLogout) btnLogout.style.display = config.logout ? 'flex' : 'none';
	if (btnSettings) btnSettings.style.display = config.settings ? 'flex' : 'none';

    // Autodarts Badge Logik
    if (adBadge) {
        if (config.badge && AutodartsService.isActive()) {
            adBadge.classList.remove('hidden');
            adBadge.classList.add('connected');
            const t = document.getElementById('ad-status-text');
            if(t) t.innerText = "AUTODARTS: ON";
        } else {
            adBadge.classList.add('hidden');
        }
    }
}

function _getGameTitle() {
    const session = State.getActiveSession();
    if (session && session.settings) {
        const type = session.gameId;
        const settings = session.settings;
        let title = GAME_NAMES[type] || "DART COACH";

        // --- X01 LOGIK ---
        if (type === 'x01') {
            title = `${settings.startScore}`;
            let details = [];
            if (settings.startScore === 170) {
                // 170 Checkout-Training: "5 Runden" statt "Best of 5 Legs"
                details.push(`${settings.bestOf} Runden`);
            } else {
                const modeLabel = settings.mode === 'sets' ? 'Sets' : 'Legs';
                details.push(`Best of ${settings.bestOf} ${modeLabel}`);
            }
            if (settings.doubleIn) details.push("Double In");
            if (settings.doubleOut) details.push("Double Out");
            if (details.length > 0) title += ` (${details.join(', ')})`;
        }
        // --- AROUND THE BOARD LOGIK (NEU) ---
        else if (type === 'around-the-board') {
            const v = settings.variant || 'full';
            const map = {
                'full': 'Komplettes Segment',
                'single-inner': 'Innere Singles',
                'single-outer': 'Äußere Singles',
                'double': 'Nur Doubles',
                'triple': 'Nur Triples'
            };
            const variantText = map[v] || v;
            const dirText = settings.direction === 'random' ? '🎲' : '';
            
            title = `ATB: ${variantText} ${dirText}`;
        }
		else if (type === 'checkout-challenge') {
            let details = [];
            
            // 1. Schwierigkeit (Erster Buchstabe groß)
            if (settings.difficulty) {
                const diff = settings.difficulty.charAt(0).toUpperCase() + settings.difficulty.slice(1);
                details.push(diff);
            }
            
            // 2. Rundenanzahl
            if (settings.rounds) {
                details.push(`${settings.rounds} Runden`);
            }
            
            // 3. Modus (Double Out / Single Out)
            // Prüfen auf false, da undefined/true = Double Out ist
            if (settings.doubleOut === false) {
                details.push("Single Out");
            } else {
                details.push("Double Out");
            }
            
            if (details.length > 0) title += ` (${details.join(', ')})`;
        }
        // --- CRICKET LOGIK ---
        else if (type === 'cricket') {
            if (settings.spRounds) title += ` (${settings.spRounds} Runden)`;
        }
        // --- SEGMENT MASTER LOGIK ---
        else if (type === 'segment-master') {
            const seg      = settings.segment === 25 ? 'Bull' : `S${settings.segment ?? 20}`;
            const zoneMap  = { any:'', single:' Single', inner:' Inner', outer:' Outer', double:' Double', triple:' Triple' };
            const zone     = zoneMap[settings.zone ?? 'any'] || '';
            const turns    = settings.turnLimit ?? 10;
            title = `Segment Master: ${seg}${zone} · ${turns} Aufnahmen`;
        }
        // --- KILLER LOGIK ---
        else if (type === 'killer') {
            title = `Killer · ${settings.lives ?? 3} Leben`;
        }

        return title.toUpperCase();
    }
    
    // Fallback: Setup Modul
    if (Setup) {
        const type = Setup.getCurrentGameType();
        let t = GAME_NAMES[type] || "DART COACH";
        return t.toUpperCase();
    }
    return "DART COACH";
}

function _showMatchModal(title, message, btnText, callback) {
	const modal = document.createElement('div');
	modal.className = 'modal-overlay'; 
	
	setTimeout(() => modal.classList.add('active'), 10);

	modal.innerHTML = `
		<div class="modal-content"> <h2 style="margin-top:0; margin-bottom:15px; color:var(--text-main); font-size:1.5rem;">${title}</h2>
			<p id="modal-text">${message}</p>
			
			<div class="modal-buttons">
				<button id="modal-btn-next" class="modal-btn btn-yes">
					${btnText || "WEITER"}
				</button>
			</div>
		</div>
	`;

	document.body.appendChild(modal);

	const btnNext = modal.querySelector('#modal-btn-next');

	const close = () => {
		modal.classList.remove('active');
		setTimeout(() => {
			if(modal.parentNode) document.body.removeChild(modal);
		}, 300);
	};

	btnNext.onclick = () => {
		close();
		if (callback) callback();
	};
	
	const keyHandler = (e) => {
		if(e.key === 'Enter') {
			document.removeEventListener('keydown', keyHandler);
			btnNext.click();
		}
	};
	document.addEventListener('keydown', keyHandler);
}

function _getSetupTitle() {
    let gameName = "GAME";
    if (Setup) {
        const type = Setup.getCurrentGameType();
        gameName = GAME_NAMES[type] || type;
    }
    return ("MATCH SETUP - " + gameName).toUpperCase();
}

function _toggleFullscreen() { 
    const e = document.documentElement; 
    if(!document.fullscreenElement) e.requestFullscreen().catch(()=>{}); else document.exitFullscreen(); 
}

function _showConfirm(title, message, onConfirm, options = {}) {
    const confirmLabel = options.confirmLabel || "JA";
    const cancelLabel = options.cancelLabel || "ABBRECHEN";
    
    // Neue Default-Klassen (btn-yes / btn-no statt btn-hero...)
    const confirmClass = options.confirmClass || "btn-yes"; 
    const cancelClass = options.cancelClass || "btn-no"; 

    const modal = document.createElement('div');
    modal.className = 'modal-overlay'; 
    
    setTimeout(() => modal.classList.add('active'), 10);

    modal.innerHTML = `
        <div class="modal-content"> <h2 style="margin-top:0; margin-bottom:15px; color:var(--text-main); font-size:1.5rem;">${title}</h2>
            <p id="modal-text">${message}</p>
            
            <div class="modal-buttons">
                <button id="modal-btn-confirm" class="modal-btn ${confirmClass}">
                    ${confirmLabel}
                </button>
                <button id="modal-btn-cancel" class="modal-btn ${cancelClass}">
                    ${cancelLabel}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const btnConfirm = modal.querySelector('#modal-btn-confirm');
    const btnCancel = modal.querySelector('#modal-btn-cancel');

    const close = () => {
        modal.classList.remove('active');
        setTimeout(() => {
            if(modal.parentNode) document.body.removeChild(modal);
        }, 300);
    };

    btnConfirm.onclick = () => {
        close();
        if (onConfirm) onConfirm();
    };

    btnCancel.onclick = () => {
        close();
        if (options.onCancel) options.onCancel();
    };
}

// --- PUBLIC INTERFACE (Export) ---
export const UI = {
    // Hilfsfunktionen für Sub-Module
    getGameLabel: (key) => GAME_NAMES[key] || key,
    isGuest: () => Auth ? Auth.isGuest() : false,
    showConfirm: _showConfirm,
	showMatchModal: _showMatchModal,
	showOverlay: (t, type) => Game.showOverlay(t, type),
	// showOverlay: (content, type) => { if(Game) Game.showOverlay(content, type); },
	
	showHueCertError: function(bridgeIp) {
        if (!bridgeIp) return;
        const url = `https://${bridgeIp}/api/config`;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay active'; // 'active' damit es sofort sichtbar ist
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 500px;">
                <h2 style="color:#ef4444; margin-top:0;">⚠️ Verbindung blockiert</h2>
                <p style="color:#ccc; line-height:1.5;">
                    Der Browser blockiert den Zugriff auf deine Hue Bridge (${bridgeIp}), da ihr lokales Zertifikat nicht erkannt wird. Das ist normal.
                </p>
                
                <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:8px; margin:15px 0; text-align:left; font-size:0.9rem;">
                    <strong>Lösung (Einmalig):</strong>
                    <ol style="margin-left:20px; margin-top:5px; color:#aaa;">
                        <li>Klicke unten auf den Button "Zertifikat akzeptieren".</li>
                        <li>Es öffnet sich ein neuer Tab mit einer Warnung ("Nicht sicher").</li>
                        <li>Klicke dort auf <strong>"Erweitert"</strong> und dann auf <strong>"Weiter zu ${bridgeIp} (unsicher)"</strong>.</li>
                        <li>Sobald du dort Text (JSON) siehst, schließe den Tab und klicke hier erneut auf "Verbinden".</li>
                    </ol>
                </div>

                <div class="modal-buttons">
                    <button id="btn-open-cert" class="modal-btn" style="background:var(--accent-color); color:#000; font-weight:bold;">
                        Zertifikat akzeptieren 🔗
                    </button>
                    <button id="btn-close-cert" class="modal-btn btn-no">
                        Schließen
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // Events
        modal.querySelector('#btn-open-cert').onclick = () => {
            window.open(url, '_blank');
        };

        modal.querySelector('#btn-close-cert').onclick = () => {
            if(modal.parentNode) document.body.removeChild(modal);
        };
    },
	
    init: function() {
        // SUB-MODULE INITIALISIEREN
        if(Auth) Auth.init();
        if(Setup) Setup.init();
		window._dashModules = { Setup, Stats, Management };
	
        // Setup Buttons
        const btnShuffle = document.getElementById('btn-shuffle-players'); 
        if(btnShuffle) btnShuffle.addEventListener('click', () => {
            if(Setup) Setup.shuffle();
        });
        
        const btnStart = document.getElementById('btn-start-match');
        if(btnStart) btnStart.addEventListener('click', () => {
             if(Setup) Setup.handleStartMatch();
        });

        // Global Navigation
        const btnFinish = document.getElementById('btn-finish-game');
        if(btnFinish) btnFinish.addEventListener('click', async () => { 
            const isGuest = this.isGuest(); 
            if(!isGuest) await State.saveActiveSession(); 
			
            // Stattdessen direkt zum Dashboard:
			this.showScreen('screen-dashboard');
        });

        const btnFull = document.getElementById('btn-fullscreen'); 
        if(btnFull) btnFull.addEventListener('click', _toggleFullscreen);
        
        document.querySelectorAll('.back-btn').forEach(b => b.addEventListener('click', () => { this.showScreen('screen-dashboard'); }));
        
        const btnHome = document.getElementById('btn-home'); 
        if(btnHome) btnHome.addEventListener('click', () => { 
            if(State.getCurrentScreen() === 'screen-game') { 
                // KORREKTUR: Jetzt mit 3 Argumenten: (Titel, Text, Callback)
                _showConfirm(
                    "MENÜ", 
                    "Möchtest du das Spiel abbrechen und zum Hauptmenü zurückkehren?", 
                    () => { 
                        State.setScreen('screen-dashboard'); 
                        this.showScreen('screen-dashboard'); 
                    }
                ); 
            } else { 
                State.setScreen('screen-dashboard'); 
                this.showScreen('screen-dashboard'); 
            } 
        });

        const btnRestart = document.getElementById('btn-restart'); 
        if(btnRestart) btnRestart.addEventListener('click', () => { 
            // KORREKTUR: Jetzt mit 3 Argumenten: (Titel, Text, Callback)
            _showConfirm(
                "NEUSTART",
                "Möchtest du wirklich zurück zum Setup? Das aktuelle Spiel wird beendet.", 
                () => { 
                     if(Setup) Setup.openSetupForCurrent();
                }
            ); 
        });
		
		const btnSettings = document.getElementById('btn-settings');
        if (btnSettings) {
            btnSettings.addEventListener('click', () => {
                // Management Modul initialisieren (lädt Settings aus localStorage)
                if (Management) Management.init();
                // Screen wechseln
                this.showScreen('screen-management');
            });
        };
		
		AutodartsService.setStatusListener((status) => {
            const badge = document.getElementById('ad-status-badge');
            const text = document.getElementById('ad-status-text');
            if(!badge || !text) return;

            if(status === 'CONNECTED') {
                badge.classList.add('connected');
                text.innerText = "AUTODARTS: ON";
            } else {
                badge.classList.remove('connected');
                text.innerText = "AUTODARTS: OFF";
            }
        });
		
        this.showScreen('screen-login');
    },
	
	

    onLoginSuccess: async function() { 
        await State.initAfterLogin();
        // Bot-Spieler sicherstellen (wird einmalig angelegt falls noch nicht vorhanden)
        try {
            const botSettings = Management.getSettings()?.bot;
            await State.ensureBotPlayers(botSettings);
        } catch(e) { console.warn('Bot init skipped:', e); }
        this.showScreen('screen-dashboard'); 
    },

    showScreen: function(id) {
        // 1. Screens umschalten
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
        });
		
		EventBus.emit('SCREEN_CHANGED', { screen: id });
		
		const hueWidget = document.getElementById('hue-status-widget');
        if (hueWidget) {
            if (id === 'screen-dashboard' || id === 'screen-login') {
                // Zeigen
                hueWidget.style.display = 'inline-flex'; 
                hueWidget.style.opacity = '1';
                hueWidget.style.visibility = 'visible';
            } else {
                // Verstecken (aber Platz im Header ggf. behalten oder komplett weg)
                // display: 'none' nimmt den Platz weg. 
                // visibility: 'hidden' behält den Platz (damit der Titel mittig bleibt).
                // Wir nehmen 'none', außer du willst das Layout starr halten.
                hueWidget.style.display = 'none'; 
            }
        }
		
        const targetScreen = document.getElementById(id);
        if (targetScreen) {
            targetScreen.classList.remove('hidden');
            targetScreen.classList.add('active');
			if (id === 'screen-dashboard') {
				Dashboard.init();
			}
            State.setScreen(id);
        } else {
            console.warn(`Screen '${id}' not found in DOM.`);
            return;
        }

        // 2. Konfiguration laden (Fallback auf leeres Objekt um Fehler zu vermeiden)
        const config = SCREEN_CONFIG[id] || { home: true, restart: false, logout: false, badge: false, title: "DART COACH" };

        // 3. Header Buttons & Badge aktualisieren
        _updateHeaderButtons(config);

        // 4. Titel setzen
        const titleEl = document.getElementById('app-title');
        if (titleEl) {
            if (config.title === "DYNAMIC_GAME") {
                titleEl.innerText = _getGameTitle();
            } else if (config.title === "DYNAMIC_SETUP") {
                titleEl.innerText = _getSetupTitle();
            } else {
                titleEl.innerText = config.title;
            }
        }
    },
	
	/**
     * ═══════════════════════════════════════════════════════════
     *  LIGHTING WIDGET (Hue + WLED kombiniert)
     * ═══════════════════════════════════════════════════════════
     * 
     * Das Widget im Header zeigt den Status beider Lichtsysteme.
     * Aufbau: [💡●] [🌈●]
     *   ● grün  = aktiv & verbunden
     *   ● gelb  = aktiv, aber Verbindungsfehler
     *   ● grau  = deaktiviert
     * 
     * Klick auf 💡 → Hue-Tab in Einstellungen
     * Klick auf 🌈 → WLED-Tab in Einstellungen
     */
    initLightWidget: function() {
        const widget = document.getElementById('hue-status-widget');
        if (!widget) return;

        // Widget-Inhalt neu strukturieren für Dual-System
        widget.innerHTML = `
            <span id="light-hue-btn"  class="light-indicator" title="Hue an/aus" style="cursor:pointer;">💡<span id="light-hue-dot"  class="light-dot"></span></span>
            <span id="light-wled-btn" class="light-indicator" title="WLED an/aus" style="cursor:pointer;">🌈<span id="light-wled-dot" class="light-dot"></span></span>
        `;
        widget.style.cursor = 'default';
        widget.style.gap = '8px';

        // Dot-Farben aktualisieren
        const _update = () => {
            const status = LightingCoordinator.getStatus();
            _setDot(document.getElementById('light-hue-dot'),  status.hue,  document.getElementById('light-hue-btn'));
            _setDot(document.getElementById('light-wled-dot'), status.wled, document.getElementById('light-wled-btn'));
        };

        function _setDot(dotEl, info, btnEl) {
            if (!dotEl) return;
            if (!info.enabled) {
                dotEl.className = 'light-dot dot-off';
                if (btnEl) btnEl.title = `${info.label}: Aus – Klick zum Einschalten`;
            } else if (info.connected) {
                dotEl.className = 'light-dot dot-on';
                if (btnEl) btnEl.title = `${info.label}: Verbunden – Klick zum Ausschalten`;
            } else {
                dotEl.className = 'light-dot dot-error';
                if (btnEl) btnEl.title = `${info.label}: Verbindungsfehler – Klick für Einstellungen`;
            }
        }

        // Click-Handler: Toggle bei grün/grau, Management öffnen bei Fehler (orange)
        const hueBtn  = widget.querySelector('#light-hue-btn');
        const wledBtn = widget.querySelector('#light-wled-btn');

        const _openMgmt = (tab) => {
            if (Management) {
                Management.setTab(tab);
                Management.init();
            }
            this.showScreen('screen-management');
        };

        if (hueBtn) hueBtn.onclick = (e) => {
            e.stopPropagation();
            const info = HueService.getStatusInfo();
            // Fehler (aktiviert, aber nicht verbunden) → Management öffnen
            if (info.enabled && !info.connected) {
                _openMgmt('hue');
            } else {
                HueService.toggleEnabled();
                _update();
            }
        };

        if (wledBtn) wledBtn.onclick = (e) => {
            e.stopPropagation();
            const info = WledService.getStatusInfo();
            if (info.enabled && !info.connected) {
                _openMgmt('wled');
            } else {
                WledService.toggleEnabled();
                _update();
            }
        };

        // Initialer Update + Live-Updates bei Status-Änderung
        _update();
        LightingCoordinator.onStatusChange(_update);
    },

    // Rückwärtskompatibilität – alter Name funktioniert noch
    initHueWidget: function() { return this.initLightWidget(); },

    /**
     * Zeigt den Hue-Zertifikat-Fehler-Modal.
     * Erläutert das Mixed-Content / Self-Signed-Cert Problem und führt
     * den Nutzer durch den einmaligen Workaround.
     * 
     * Hintergrund: Seit Firmware 1.24 unterstützt die Bridge HTTPS
     * mit selbstsigniertem Zertifikat. Der Browser muss dieses einmalig
     * manuell akzeptieren, danach funktioniert HTTPS dauerhaft.
     */
    showHueCertError: function(bridgeIp) {
        if (!bridgeIp) {
            _showHueNoBridgeModal();
            return;
        }

        // HTTPS-URL zur Bridge (für Zertifikat-Akzeptanz)
        const certUrl = `https://${bridgeIp}/api/config`;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        setTimeout(() => modal.classList.add('active'), 10);

        modal.innerHTML = `
            <div class="modal-content" style="max-width:480px;">
                <h2 style="color:#f59e0b; margin-top:0; font-size:1.3rem;">⚠️ Einmalige Einrichtung nötig</h2>
                
                <p style="color:#ccc; line-height:1.6; margin-bottom:0;">
                    Dein Browser blockiert die Verbindung zur Hue Bridge
                    (<code style="background:#333; padding:1px 5px; border-radius:3px;">${bridgeIp}</code>),
                    weil sie ein selbstsigniertes Zertifikat verwendet.
                </p>

                <div style="background:rgba(255,255,255,0.05); border:1px solid #444; padding:14px 18px; border-radius:8px; margin:16px 0; text-align:left;">
                    <strong style="color:#fff; display:block; margin-bottom:8px;">Einmalige Lösung in 3 Schritten:</strong>
                    <ol style="margin:0 0 0 18px; padding:0; color:#aaa; line-height:1.9; font-size:0.9rem;">
                        <li>Klicke auf <strong style="color:#fff;">"Zertifikat öffnen"</strong> unten.</li>
                        <li>Im neuen Tab: <strong style="color:#fff;">"Erweitert"</strong> → <strong style="color:#fff;">"Weiter zu ${bridgeIp}"</strong> klicken.</li>
                        <li>Sobald du JSON-Text siehst: Tab schließen, dann hier erneut <strong style="color:#fff;">"Verbinden"</strong> klicken.</li>
                    </ol>
                </div>

                <p style="color:#666; font-size:0.8rem; margin-bottom:16px;">
                    Danach verbindet sich die App zuverlässig ohne diesen Schritt.
                </p>

                <div class="modal-buttons" style="gap:10px;">
                    <button id="btn-open-cert" class="modal-btn" style="background:var(--accent-color); color:#000; font-weight:bold; flex:2;">
                        🔗 Zertifikat öffnen
                    </button>
                    <button id="btn-close-cert" class="modal-btn btn-no" style="flex:1;">
                        Schließen
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#btn-open-cert').onclick = () => {
            window.open(certUrl, '_blank');
        };
        modal.querySelector('#btn-close-cert').onclick = () => {
            modal.classList.remove('active');
            setTimeout(() => { if (modal.parentNode) modal.parentNode.removeChild(modal); }, 300);
        };
    },
    switchToGame: function() { 
        if(Game) Game.switchToGame(); 
    },

    updateGameDisplay: function() {
        if(Game) Game.updateGameDisplay();
    },

    markDartBoxCorrected: function(boxIndex) {
        if(Game) Game.markDartBoxCorrected(boxIndex);
    },

    showCorrectionCountdown: function(durationMs, onExpire) {
        if(Game) Game.showCorrectionCountdown(durationMs, onExpire);
        else if (onExpire) onExpire();
    },

    cancelCorrectionCountdown: function() {
        if(Game) Game.cancelCorrectionCountdown();
    },

    showResult: function() {
         if(Game) Game.showResult();
    },

    selectResultPlayer: function(playerId) {
         if(Game) Game.selectResultPlayer(playerId);
    },

    renderDetails: function(playerId) {
         if(Game) Game.renderDetails(playerId);
    }
};