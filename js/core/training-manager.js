import { GameEngine } from '../games/game-engine.js';
import { UI } from '../ui/ui-core.js';
import { State } from './state.js';
import { ResultScreen } from '../ui/ui-result.js';

let activePlan         = null;
let currentBlockIndex  = -1;
let activeLineup       = [];
let humanLineup        = [];
let _diagnosticResults = {};
let _humanPlayerId     = null;  // gespeichert für finishPlan

const BOT_SUPPORTED = ['x01','cricket','killer','shanghai','checkout-challenge'];

export const TrainingManager = {

    startPlan(plan, playerIds) {
        if (!plan || !playerIds?.length) { console.error('Ungültiger Plan-Start', plan, playerIds); return; }
        console.log(`🚀 Start Training Plan: ${plan.label}`);
        activePlan         = plan;
        currentBlockIndex  = 0;
        activeLineup       = playerIds;
        _diagnosticResults = {};
        const all = State.getAvailablePlayers();
        humanLineup    = playerIds.filter(id => { const p = all.find(x => x.id === id); return p && !p.isBot; });
        _humanPlayerId = humanLineup[0] ?? null;
        this._runCurrentBlock();
    },

    restartCurrentBlock() { if (!activePlan) return; this._runCurrentBlock(); },

    isActive() { return activePlan !== null; },

    isDiagnosticPlan() { return !!(activePlan?.diagnostic); },

    getStatus() {
        if (!activePlan) return null;
        return {
            planLabel:    activePlan.label,
            blockIndex:   currentBlockIndex,
            totalBlocks:  activePlan.blocks.length,
            nextBlock:    activePlan.blocks[currentBlockIndex + 1] || null,
            isDiagnostic: !!activePlan.diagnostic,
        };
    },

    getDiagnosticResults() { return _diagnosticResults; },

    /** Vom Result-Screen aufgerufen um Block-Ergebnis zu speichern */
    saveBlockResult(session) {
        if (!activePlan?.diagnostic) return;
        const block = activePlan.blocks[currentBlockIndex];
        const key   = block?.diagnosticKey;
        if (!key) return;
        const humanPlayer = session.players.find(p => !p.isBot);
        if (!humanPlayer) return;
        const data = GameEngine.getResultData(session, humanPlayer);
        if (data) _diagnosticResults[key] = { data, gameId: block.gameId };
    },

    nextBlock() {
        if (!activePlan) return;
        currentBlockIndex++;
        if (currentBlockIndex < activePlan.blocks.length) { this._runCurrentBlock(); }
        else { this.finishPlan(); }
    },

    finishPlan() {
        const planName      = activePlan?.label ?? '';
        const wasDiagnostic = activePlan?.diagnostic ?? false;
        const savedResults  = { ..._diagnosticResults };
        const savedPlayerId = _humanPlayerId;
        console.log('🏁 Training Plan finished');
        activePlan = null; currentBlockIndex = -1; activeLineup = []; humanLineup = []; _humanPlayerId = null;
        _diagnosticResults = {};

        // Diagnostic: Scores normalisieren & persistieren BEVOR Dashboard geladen wird
        if (wasDiagnostic && savedPlayerId && Object.keys(savedResults).length > 0) {
            const scores = ResultScreen.normalizeDiagnostic(savedResults);
            State.saveDiagnosticProfile(savedPlayerId, scores).catch(e => console.error('Diagnostic save error', e));
        }

        UI.showScreen('screen-dashboard');
        setTimeout(() => {
            if (UI.showMatchModal) {
                const msg = wasDiagnostic
                    ? `Dein Stärken-Profil ist gespeichert – schau es dir oben auf dem Dashboard an!`
                    : `Glückwunsch! Du hast den Plan "${planName}" erfolgreich absolviert.`;
                UI.showMatchModal('TRAINING ABGESCHLOSSEN', msg, 'YEAH');
            }
        }, 500);
    },

    _runCurrentBlock() {
        const block    = activePlan.blocks[currentBlockIndex];
        const settings = block.settings || {};
        const lineup   = BOT_SUPPORTED.includes(block.gameId) ? activeLineup : humanLineup;
        console.log(`➡️ Block ${currentBlockIndex + 1}: ${block.gameId}`, settings);
        GameEngine.startGame(block.gameId, lineup, settings);
    },
};