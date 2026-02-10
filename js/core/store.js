// HINWEIS: Wir greifen hier auf das globale 'firebase' Objekt zu, 
// das über die <script>-Tags in der index.html geladen wird.

// --- KONFIGURATION ---
const firebaseConfig = {
    apiKey: "AIzaSyAM5dWGFVD4Rcfxl721F7RfvGqiz0GTq7c",
    authDomain: "gersons-dartcoach.firebaseapp.com",
    databaseURL: "https://gersons-dartcoach-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "gersons-dartcoach",
    storageBucket: "gersons-dartcoach.firebasestorage.app",
    messagingSenderId: "1063340008217",
    appId: "1:1063340008217:web:e0a8a35103b8ae1cdc9b88",
    measurementId: "G-4T8XK3RVBE"
};

// --- PRIVATE VARIABLEN (Module Scope) ---
// Diese sind von außen nicht sichtbar, nur über die exportierten Methoden.
let auth = null;
let db = null;
let currentUser = null;

function _initFirebase() {
    // Prüfen, ob Firebase schon läuft, um Fehler beim Hot-Reload zu vermeiden
    if (typeof firebase !== 'undefined' && !firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    } else if (typeof firebase === 'undefined') {
        console.error("Firebase SDK nicht gefunden! Hast du die Scripts in der index.html eingebunden?");
        return;
    }
    
    auth = firebase.auth();
    db = firebase.database();
}

// --- PUBLIC INTERFACE (Export) ---
export const Store = {
    
    init: function() {
        _initFirebase();
        
        // Wir geben ein Promise zurück, damit app.js warten kann,
        // bis der Login-Status geklärt ist.
        return new Promise((resolve) => {
            if (!auth) { resolve(null); return; }
            
            auth.onAuthStateChanged((user) => {
                currentUser = user;
                if (user) {
                    console.log("Store: User erkannt:", user.email);
                } else {
                    console.log("Store: Kein User eingeloggt.");
                }
                resolve(user);
            });
        });
    },

    getCurrentUser: () => currentUser,

    login: async function(email, password) {
        if (!auth) return { success: false, error: "Firebase nicht initialisiert" };
        try {
            await auth.signInWithEmailAndPassword(email, password);
            return { success: true };
        } catch (error) {
            console.error("Login Fail", error);
            return { success: false, error: error.message };
        }
    },

    register: async function(email, password) {
        if (!auth) return { success: false, error: "Firebase nicht initialisiert" };
        try {
            await auth.createUserWithEmailAndPassword(email, password);
            return { success: true };
        } catch (error) {
            console.error("Register Fail", error);
            return { success: false, error: error.message };
        }
    },

    logout: async function() {
        if (!auth) return;
        await auth.signOut();
    },

    // Lädt alle Spieler-Profile des eingeloggten Users
    loadAllPlayers: async function() {
        if (!currentUser || !db) return [];
        try {
            // Pfad: users/{uid}/players
            const snapshot = await db.ref('users/' + currentUser.uid + '/players').once('value');
            const val = snapshot.val();
            if (!val) return [];
            // Object to Array
            return Object.values(val);
        } catch (e) {
            console.error("Load Players Error", e);
            return [];
        }
    },

    // Speichert/Update einen Spieler
    saveUser: async function(playerObj) {
        if (!currentUser || !db) return false;
        try {
            // Pfad: users/{uid}/players/{playerId}
            await db.ref('users/' + currentUser.uid + '/players/' + playerObj.id).set(playerObj);
            return true;
        } catch (e) {
            console.error("Save Error", e);
            return false;
        }
    }
};