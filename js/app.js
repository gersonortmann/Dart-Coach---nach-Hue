// 1. IMPORTS: Wir holen uns die Bausteine, die wir brauchen.
// (Voraussetzung: Du hast in den anderen Dateien 'export' hinzugefügt!)
import { GameEngine } from './games/game-engine.js';
import { State } from './core/state.js';
import { Store } from './core/store.js';
import { UI } from './ui/ui-core.js';
import { HueService } from './core/hue-service.js';
// Falls du Training Plans nutzt, müsste das auch hier importiert werden, 
// oder wir lassen es kurz außen vor bis Phase 2.

// 2. DIE BRÜCKE (Global Namespace):
// Damit deine HTML-Buttons wie onclick="DartApp.GameEngine.undoLastAction()"
// weiterhin funktionieren, bauen wir das alte 'DartApp'-Objekt hier
// manuell wieder zusammen und hängen es ins Fenster (window).
window.DartApp = {
    GameEngine: GameEngine,
    State: State,
    Store: Store,
    UI: UI,
	Hue: HueService
};

// 3. DER INIT-CODE (Der Startvorgang):
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Dart Coach V2 Booting (ES Modules)...");

    try {
        // SCHRITT A: UI Vorbereiten
        // Hier werden z.B. Klick-Listener auf die Dashboard-Buttons gesetzt.
        // Vorher passiert nichts, wenn man klickt.
        UI.init();
		
		UI.initHueWidget();
		
		HueService.init();
        
        // SCHRITT B: Verbindung zur Datenbank / Speicher herstellen
        // Store.init() schaut z.B. nach, ob Firebase bereit ist 
        // und ob noch ein User vom letzten Mal eingeloggt ist.
        const user = await Store.init();
        
        // SCHRITT C: Routing (Wohin geht die Reise?)
        if (user) {
            console.log("User already logged in:", user.email);
            // User ist da -> Wir laden seine Daten und zeigen das Dashboard
            UI.onLoginSuccess();
        } else {
            console.log("No user logged in. Showing Login Screen.");
            // Keiner da -> Login-Maske zeigen
            UI.showScreen('screen-login');
        }

    } catch (error) {
        // Der "Airbag": Falls beim Start was explodiert
        console.error("❌ Critical App Error:", error);
        alert("Fehler beim Starten der App. Check die Konsole (F12).");
    }
});