import { GameEngine } from '../games/game-engine.js';
import { UI } from '../ui/ui-core.js';
import { State } from './state.js';

// Privater State für den Manager
let activePlan = null;
let currentBlockIndex = -1;
let activeLineup = [];

export const TrainingManager = {
    
    /**
     * Startet einen neuen Trainingsplan
     * @param {Object} plan - Das Plan-Objekt aus training-plans.js
     * @param {Array} playerIds - Array mit Spieler-IDs (meistens nur einer)
     */
    startPlan(plan, playerIds) {
        if (!plan || !playerIds || playerIds.length === 0) {
            console.error("Ungültiger Plan-Start", plan, playerIds);
            return;
        }

        console.log(`🚀 Start Training Plan: ${plan.label}`);
        activePlan = plan;
        activeLineup = playerIds;
        currentBlockIndex = 0;

        this._runCurrentBlock();
    },

    restartCurrentBlock() {
        if (!activePlan) return;
        console.log(`🔄 Restarting Block ${currentBlockIndex}`);
        this._runCurrentBlock();
    },
	
	/**
     * Prüft, ob gerade ein Plan aktiv ist
     */
    isActive() {
        return activePlan !== null;
    },

    /**
     * Gibt Infos zum aktuellen Status zurück (für UI)
     */
    getStatus() {
        if (!activePlan) return null;
        return {
            planLabel: activePlan.label,
            blockIndex: currentBlockIndex,
            totalBlocks: activePlan.blocks.length,
            nextBlock: activePlan.blocks[currentBlockIndex + 1] || null
        };
    },

    /**
     * Wird vom Result-Screen aufgerufen, um weiterzumachen
     */
    nextBlock() {
        if (!activePlan) return;

        currentBlockIndex++;

        if (currentBlockIndex < activePlan.blocks.length) {
            this._runCurrentBlock();
        } else {
            this.finishPlan();
        }
    },

    finishPlan() {
        const planName = activePlan.label;
        console.log("🏁 Training Plan finished");
        
        // Reset
        activePlan = null;
        currentBlockIndex = -1;
        activeLineup = [];

        // Zurück zum Dashboard mit Erfolgsmeldung
        UI.showScreen('screen-dashboard');
        
        // Optional: Kleines Konfetti oder Toast
        setTimeout(() => {
            // Falls du eine Toast-Funktion hast, sonst Alert oder Modal
            if(UI.showMatchModal) {
                UI.showMatchModal("TRAINING ABGESCHLOSSEN", `Glückwunsch! Du hast den Plan "${planName}" erfolgreich absolviert.`, "YEAH");
            }
        }, 500);
    },

    _runCurrentBlock() {
        const block = activePlan.blocks[currentBlockIndex];
        const gameId = block.gameId;
        const settings = block.settings || {};

        // UI Feedback: Kurzer Loader oder Overlay, dass es weitergeht
        // Hier starten wir direkt das Spiel via GameEngine
        // WICHTIG: Wir nutzen startGame, das schaltet auch den Screen um.
        
        console.log(`➡️ Block ${currentBlockIndex + 1}: ${gameId}`, settings);
        
        // Einstellungen übergeben
        GameEngine.startGame(gameId, activeLineup, settings);
    }
};