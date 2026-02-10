/* js/ui/ui-overlay.js */

export const UIOverlay = {
    
    /**
     * Zeigt ein Overlay an.
     * @param {string|number} content - Der anzuzeigende Text/Zahl
     * @param {string} type - Der Typ der Animation (kommt aus der Strategy)
     */
    show: function(content, type = 'standard') {
        // Altes Overlay entfernen falls vorhanden (Spam-Schutz)
        const existing = document.querySelector('.turn-score-overlay');
        if (existing) document.body.removeChild(existing);

        const overlay = document.createElement('div');
        overlay.className = 'turn-score-overlay visible';

        // Mapping der Strategie-Typen auf CSS-Klassen
        switch (type) {
            case '180':
                overlay.classList.add('ts-180');
                overlay.classList.add('ts-180-bg'); // Dunklerer Hintergrund
                break;
            case 'high': // 100-139
                overlay.classList.add('ts-high');
                break;
            case 'very-high': // 140-179
                overlay.classList.add('ts-very-high');
                break;
            case 'miss':
                overlay.classList.add('ts-miss');
                break;
            case 'bust':
                overlay.classList.add('ts-bust');
                break;
            case 'check':
            case 'match-win': // Nutzen gleichen Style, evtl. später anpassbar
                overlay.classList.add('ts-check');
                break;
            
            // CRICKET SPEZIAL
            case 'cricket-open':
                overlay.classList.add('ts-cricket-open');
                break;
            case 'cricket-closed':
                overlay.classList.add('ts-cricket-closed');
                break;

            case 'standard':
            default:
                overlay.classList.add('ts-standard');
                break;
        }

        overlay.innerHTML = `<div class="ts-val">${content}</div>`;
        document.body.appendChild(overlay);

        // Anzeige-Dauer je nach Typ variieren
        let duration = 1200;
        if (type === '180') duration = 2500;
        if (type === 'miss') duration = 900;
        if (type === 'bust') duration = 1500;

        setTimeout(() => {
            overlay.classList.remove('visible');
            setTimeout(() => {
                if(overlay.parentNode) document.body.removeChild(overlay);
            }, 300); // Warten auf CSS Transition opacity
        }, duration);
    }
};