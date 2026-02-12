// =========================================
// EVENT BUS - Zentrale Kommunikation
// =========================================
// Ersetzt direkte Aufrufe zwischen Modulen.
// Module emittieren Events, Subscriber reagieren.
//
// Events:
//   SCREEN_CHANGED  { screen: 'screen-game' }
//   GAME_EVENT      { type: 'overlay'|'input'|'high-score'|'match-won'|'game-started',
//                     overlay?, value?, gameId?, score? }

const _listeners = {};

export const EventBus = {

    /**
     * Registriert einen Listener für ein Event.
     * @param {string} event - Event-Name
     * @param {function} callback - Handler-Funktion
     */
    on(event, callback) {
        if (!_listeners[event]) _listeners[event] = [];
        _listeners[event].push(callback);
    },

    /**
     * Entfernt einen spezifischen Listener.
     */
    off(event, callback) {
        if (!_listeners[event]) return;
        _listeners[event] = _listeners[event].filter(cb => cb !== callback);
    },

    /**
     * Feuert ein Event mit optionalen Daten.
     * @param {string} event - Event-Name
     * @param {object} data - Payload
     */
    emit(event, data) {
        if (!_listeners[event]) return;
        _listeners[event].forEach(cb => {
            try {
                cb(data);
            } catch (err) {
                console.error(`[EventBus] Error in handler for "${event}":`, err);
            }
        });
    }
};
