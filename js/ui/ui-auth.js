import { Store } from '../core/store.js';
import { State } from '../core/state.js';
import { UI } from './ui-core.js';

// --- PRIVATE VARS ---
let authMode = 'login'; // 'login' oder 'register'
let isGuestMode = false;

// --- PRIVATE FUNCTIONS ---

function _updateAuthUI() {
    const title = document.getElementById('auth-title');
    const btnAction = document.getElementById('btn-auth-action');
    const btnSwitch = document.getElementById('btn-switch-auth');
    
    // Falls Elemente auf dem Screen fehlen (z.B. weil wir schon im Dashboard sind), abbrechen
    if(!title || !btnAction || !btnSwitch) return;

    if(authMode === 'login') {
        title.innerText = "ANMELDEN";
        btnAction.innerText = "ANMELDEN";
        btnSwitch.innerHTML = "Noch kein Konto? <b>Hier registrieren</b>";
    } else {
        title.innerText = "REGISTRIEREN";
        btnAction.innerText = "REGISTRIEREN";
        btnSwitch.innerHTML = "Bereits ein Konto? <b>Hier anmelden</b>";
    }
}

async function _handleAuthAction(e) {
    e.preventDefault();
    
    // 1. Referenzen holen
    const emailInp = document.getElementById('inp-email');
    const passInp = document.getElementById('inp-pass');
    
    if(!emailInp || !passInp) return;

    // 2. Werte auslesen (DIESE ZEILEN FEHLTEN ZULETZT!)
    const email = emailInp.value.trim();
    const password = passInp.value.trim();

    if (!email || !password) {
        alert("Bitte E-Mail und Passwort eingeben.");
        return;
    }

    // 3. Button Feedback
    const btn = document.getElementById('btn-auth-action');
    const originalText = btn ? btn.innerText : "";
    if(btn) btn.innerText = "Lade...";

    try {
        if (authMode === 'login') {
            await Store.login(email, password);
            // SUCCESS -> Sofort weiterleiten
            UI.showScreen('screen-dashboard'); 
        } else {
            await Store.register(email, password);
            // SUCCESS -> Sofort weiterleiten
            UI.showScreen('screen-dashboard');
        }
    } catch (error) {
        console.error("Auth Error:", error);
        alert("Fehler: " + error.message);
        if(btn) btn.innerText = originalText;
    }
}

function _handleGuestMode() {
    isGuestMode = true;
    State.reset(); // State cleanen für frischen Start
    UI.showScreen('screen-dashboard');
}

// --- PUBLIC API ---

export const Auth = {
    
    init: function() {
        // 1. Login/Register Button
        const btnAuth = document.getElementById('btn-auth-action');
        if(btnAuth) {
            // Alten Listener entfernen (optional, falls Init mehrfach läuft)
            btnAuth.removeEventListener('click', _handleAuthAction);
            btnAuth.addEventListener('click', _handleAuthAction);
        }
        
        // 2. Switch Mode Button (Login <-> Register)
        const btnSwitchAuth = document.getElementById('btn-switch-auth');
        if(btnSwitchAuth) {
            btnSwitchAuth.addEventListener('click', (e) => { 
                e.preventDefault(); 
                authMode = (authMode === 'login' ? 'register' : 'login'); 
                _updateAuthUI(); 
            });
        }
        
        // 3. Gast Button
        const btnGuest = document.getElementById('btn-guest');
        if(btnGuest) btnGuest.addEventListener('click', _handleGuestMode);
        
        // 4. Logout Button (Das neue Modal)
        const btnLogout = document.getElementById('btn-logout');
        if(btnLogout) {
            // Wichtig: Wir klonen den Button NICHT, sondern hängen nur den Listener an.
            // Damit sich Events nicht stapeln, nutzen wir hier eine anonyme Funktion,
            // aber sauberer ist es, wenn Init nur 1x läuft.
            btnLogout.onclick = () => { 
                UI.showConfirm(
                    "LOGOUT", 
                    "Möchtest du dich wirklich abmelden?", 
                    async () => { 
                        if(!isGuestMode) await Store.logout(); 
                        State.reset(); 
                        isGuestMode = false; 
                        UI.showScreen('screen-login'); 
                    },
                    {
                        confirmLabel: "ABMELDEN",
                        confirmClass: "btn-danger",
                        cancelLabel: "BLEIBEN",
                        cancelClass: "btn-success"
                    }
                ); 
            };
        }

        _updateAuthUI();
    },

    isGuest: function() {
        return isGuestMode;
    }
};