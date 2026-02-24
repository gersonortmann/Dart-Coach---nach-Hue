import { GameEngine } from './games/game-engine.js';
import { State } from './core/state.js';
import { Store } from './core/store.js';
import { UI } from './ui/ui-core.js';
import { LightingCoordinator } from './core/lighting-coordinator.js';

window.DartApp = {
    GameEngine: GameEngine,
    State: State,
    Store: Store,
    UI: UI
};

document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 Dart Coach V2 Booting (ES Modules)...");
    try {
        // SCHRITT A: UI vorbereiten
        UI.init();
        UI.initHueWidget();

        // SCHRITT B: Lichtsteuerung initialisieren (Hue + WLED + EventBus)
        await LightingCoordinator.init();

        // SCHRITT C: Datenbankverbindung
        const user = await Store.init();

        // SCHRITT D: Routing
        if (user) {
            console.log("User already logged in:", user.email);
            UI.onLoginSuccess();
        } else {
            console.log("No user logged in. Showing Login Screen.");
            UI.showScreen('screen-login');
        }
    } catch (error) {
        console.error("❌ Critical App Error:", error);
        alert("Fehler beim Starten der App. Check die Konsole (F12).");
    }
});