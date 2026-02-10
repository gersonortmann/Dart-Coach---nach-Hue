import { GameEngine } from '../games/game-engine.js';

let inputModifier = ''; 

function _resetModifiers() {
    inputModifier = ''; 
    document.querySelectorAll('.mod-btn').forEach(b => b.classList.remove('active-mod'));
    document.querySelectorAll('.num-btn').forEach(b => {
        b.classList.remove('mod-active-d', 'mod-active-t');
    });
    // Cleanup X01 Pro Keys
    const btnD = document.getElementById('btn-mod-double');
    const btnT = document.getElementById('btn-mod-triple');
    const grid = document.getElementById('num-grid-container');
    if (btnD) btnD.classList.remove('active-mod'); 
    if (btnT) btnT.classList.remove('active-mod'); 
    if (grid) { grid.classList.remove('mode-double', 'mode-triple'); }
}

function _handleModClick(type, btnElement) {
    const isActive = (inputModifier === type);
    _resetModifiers(); 
    if (!isActive) {
        inputModifier = type;
        btnElement.classList.add('active-mod');
        const activeClass = type === 'D' ? 'mod-active-d' : 'mod-active-t';
        document.querySelectorAll('.num-btn').forEach(b => b.classList.add(activeClass));
    }
}

export const Keyboard = {
    
    init: function() {
        // --- X01 PRO KEYPAD LOGIK (bleibt erhalten) ---
        const btnD = document.getElementById('btn-mod-double'); 
        const btnT = document.getElementById('btn-mod-triple'); 
        const grid = document.getElementById('num-grid-container');

        if(btnD) { 
            const nD = btnD.cloneNode(true); btnD.parentNode.replaceChild(nD, btnD); 
            nD.onclick = () => { 
                if(inputModifier === 'D') { _resetModifiers(); } 
                else { _resetModifiers(); inputModifier = 'D'; nD.classList.add('active-mod'); if(grid) grid.classList.add('mode-double'); } 
            }; 
        }
        if(btnT) { 
            const nT = btnT.cloneNode(true); btnT.parentNode.replaceChild(nT, btnT); 
            nT.onclick = () => { 
                if(inputModifier === 'T') { _resetModifiers(); } 
                else { _resetModifiers(); inputModifier = 'T'; nT.classList.add('active-mod'); if(grid) grid.classList.add('mode-triple'); } 
            }; 
        }

        document.querySelectorAll('.num-btn, .bull-btn, .miss').forEach(btn => { 
            const n = btn.cloneNode(true); btn.parentNode.replaceChild(n, btn); 
            n.onclick = (e) => { 
                const target = e.target.closest('button');
                if(!target) return;
                let raw = target.dataset.val; 
                let final = raw; 
                
                if(raw !== '0' && raw !== '25' && raw !== '50') { 
                    if(inputModifier === 'D') final = 'D' + raw; 
                    else if(inputModifier === 'T') final = 'T' + raw; 
                    else final = 'S' + raw; 
                } 
                if(raw === '25' && inputModifier === 'D') final = '50'; 
                
                GameEngine.onInput(final); 
                _resetModifiers(); 
            }; 
        });

        const btnBack = document.getElementById('btn-pro-back'); 
        if(btnBack) { 
            const nB = btnBack.cloneNode(true); btnBack.parentNode.replaceChild(nB, btnBack); 
            nB.onclick = () => GameEngine.undoLastAction(); 
        }
    },

    /**
     * Versteckt ALLE Keypads
     */
    hideAll: function() {
        const ids = [
            'keypad-pro', 
			'keypad-cricket',
            'keypad-unified',
			'keypad-atc'
        ];
        
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.classList.add('hidden');
                el.style.display = 'none'; // Grid/Flex überschreiben
            }
        });
    },

    setVisibleLayout: function() {
        this.hideAll();
        const kpPro = document.getElementById('keypad-pro');
        if(kpPro) {
            kpPro.classList.remove('hidden');
            kpPro.style.display = 'flex'; // Restore default
        }
    },
	
	setATBLayout: function() {
        this.hideAll();
        
        // Wir nutzen die CSS Klasse .keypad-atc-grid, die du in game.css definiert hast
        let kp = document.getElementById('keypad-atc');
        
        // Falls noch nicht im DOM (oder via index.html geladen), erzeugen wir es dynamisch
        if (!kp) {
            const screen = document.getElementById('screen-game');
            kp = document.createElement('div');
            kp.id = 'keypad-atc';
            kp.className = 'keypad-atc-grid'; // Nutzt dein neues CSS
			kp.style.marginTop = 'auto';
            kp.style.marginBottom = 'auto';
            
            // HTML Struktur analog zu deiner CSS Beschreibung
            kp.innerHTML = `
                <button class="key-btn atc-hit" data-val="HIT">TREFFER</button>
                <button class="key-btn atc-miss" data-val="MISS">Kein Treffer</button>
                <button class="key-btn atc-undo" data-val="UNDO">⬅</button>
            `;
            
            // Events binden
            kp.querySelector('.atc-hit').onclick = () => { 
                // engine erwartet 'HIT'
                GameEngine.onInput('HIT'); 
            };
            kp.querySelector('.atc-miss').onclick = () => { 
                GameEngine.onInput('MISS'); 
            };
            kp.querySelector('.atc-undo').onclick = () => { 
                GameEngine.undoLastAction(); 
            };
            
            screen.appendChild(kp);
        }
        
        kp.classList.remove('hidden');
        // display: grid erzwingen, da hideAll() es vielleicht auf none setzt
        kp.style.display = 'grid'; 
    },
	
	/**
     * CRICKET LAYOUT (Unverändert)
     */
    setCricketLayout: function() {
        this.hideAll();
        let kp = document.getElementById('keypad-cricket');
        if (!kp) {
            const screen = document.getElementById('screen-game');
            kp = document.createElement('div');
            kp.id = 'keypad-cricket';
            screen.appendChild(kp);
        }

        kp.className = 'keypad-pro-grid'; 
        kp.style.display = 'flex';
        kp.style.flexDirection = 'column';
        kp.classList.remove('hidden');
        kp.style.margin = '0'; // Cricket hat eigenes Layout

        kp.innerHTML = `
            <div class="mod-row">
                <button id="crm-d" class="key-btn mod-btn mod-double">DOUBLE</button>
                <button id="crm-t" class="key-btn mod-btn mod-triple">TRIPLE</button>
            </div>
            <div class="num-grid-container" style="grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 1fr 1fr;">
                <button class="key-btn num-btn" data-val="15">15</button>
                <button class="key-btn num-btn" data-val="16">16</button>
                <button class="key-btn num-btn" data-val="17">17</button>
                <button class="key-btn num-btn" data-val="18">18</button>
                <button class="key-btn num-btn" data-val="19">19</button>
                <button class="key-btn num-btn" data-val="20">20</button>
            </div>
            <div class="bottom-row-grid" style="margin-top:8px;">
                <button class="key-btn bull-btn" data-val="25" style="font-size:0.9rem; line-height:1.1;">Single<br>Bull</button>
                <button class="key-btn bull-btn" data-val="50" style="font-size:0.9rem; line-height:1.1;">Double<br>Bull</button>
                <button class="key-btn miss" data-val="0" style="font-size:0.9rem; line-height:1.1; background:var(--btn-miss-bg); color:black;">Kein<br>Treffer</button>
                <button id="btn-cr-undo" class="key-btn" style="background:#555; font-size:1.5rem;">⬅</button>
            </div>
        `;

        // Event Listeners Cricket...
        const btnD = document.getElementById('crm-d');
        const btnT = document.getElementById('crm-t');
        if(btnD) btnD.onclick = (e) => _handleModClick('D', e.target);
        if(btnT) btnT.onclick = (e) => _handleModClick('T', e.target);

        kp.querySelectorAll('.num-btn').forEach(btn => {
            btn.onclick = () => {
                const num = btn.dataset.val;
                let val = num;
                if (inputModifier === 'D') val = 'D' + num;
                else if (inputModifier === 'T') val = 'T' + num;
                else val = 'S' + num; 
                GameEngine.onInput(val);
                _resetModifiers(); 
            };
        });
        kp.querySelectorAll('.bull-btn, .miss').forEach(btn => {
            btn.onclick = () => {
                _resetModifiers();
                GameEngine.onInput(btn.dataset.val);
            };
        });
        document.getElementById('btn-cr-undo').onclick = () => GameEngine.undoLastAction();
    },

    /**
     * Baut das einheitliche 4x3 Grid Layout.
     * @param {Object} cfg - Konfiguration { btnLabels: [], btnClasses: [], onInput: fn }
     */
    _setUnifiedLayout: function(cfg) {
        this.hideAll();
        
        let container = document.getElementById('keypad-unified');
        if (!container) {
            container = document.createElement('div');
            container.id = 'keypad-unified';
            container.style.width = '100%';
            container.style.maxWidth = '500px';
            container.style.gap = '10px';
            
            // GRID SETUP: 4 Zeilen
            // Zeile 1+2: Haupt-Buttons (hoch)
            // Zeile 3: Leer (Spacer)
            // Zeile 4: Miss + Undo
            container.style.display = 'grid';
            container.style.gridTemplateColumns = '1fr 1fr 1fr';
            container.style.gridTemplateRows = '1fr 1fr 20px 1fr'; // 20px Spacer in der Mitte
            
            // ZENTRIERUNG (Vertikal im Flex-Parent)
            container.style.marginTop = 'auto'; 
            container.style.marginBottom = 'auto'; 

            document.getElementById('screen-game').appendChild(container);
        }

        container.classList.remove('hidden');
        container.style.display = 'grid'; // Grid wieder aktivieren

        // HTML Generieren
        container.innerHTML = `
            <button class="key-btn ${cfg.btnClasses[0]}" data-idx="0" style="grid-row: 1 / span 2; font-size:1.1rem;">${cfg.btnLabels[0]}</button>
            <button class="key-btn ${cfg.btnClasses[1]}" data-idx="1" style="grid-row: 1 / span 2; font-size:1.1rem;">${cfg.btnLabels[1]}</button>
            <button class="key-btn ${cfg.btnClasses[2]}" data-idx="2" style="grid-row: 1 / span 2; font-size:1.1rem;">${cfg.btnLabels[2]}</button>

            <button class="key-btn miss" data-val="miss" style="grid-row: 4; grid-column: 1 / span 2; background: var(--btn-miss-bg); color:black; font-size:1.1rem;">
                Kein Treffer
            </button>
            
            <button class="key-btn" id="btn-uni-undo" style="grid-row: 4; grid-column: 3; background: #555; color: black; font-size:1.5rem;">
                ⬅
            </button>
        `;

        // Events binden
        const mainBtns = container.querySelectorAll('button[data-idx]');
        mainBtns.forEach(btn => {
            btn.onclick = () => {
                const idx = parseInt(btn.dataset.idx);
                cfg.onInput(idx); // Callback mit 0, 1 oder 2
            };
        });

        const missBtn = container.querySelector('.miss');
        missBtn.onclick = () => {
            cfg.onInput(-1); // -1 signalisiert Miss
        };

        const undoBtn = document.getElementById('btn-uni-undo');
        undoBtn.onclick = () => GameEngine.undoLastAction();
    },

    // --- TRAINING / SHANGHAI (S/D/T) ---
    setTrainingLayout: function() {
        this._setUnifiedLayout({
            btnLabels: ['SINGLE', 'DOUBLE', 'TRIPLE'],
            btnClasses: ['seg-single', 'seg-double', 'seg-triple'], // Farben aus game.css
            onInput: (idx) => {
                // idx 0->S (Mult 1), 1->D (Mult 2), 2->T (Mult 3), -1->Miss
                if (idx === -1) {
                    GameEngine.onInput({ multiplier: 0, isMiss: true });
                } else {
                    GameEngine.onInput({ multiplier: idx + 1, isMiss: false });
                }
            }
        });
    },

    // --- BOBS 27 (1/2/3 Hits) ---
    setBobs27Layout: function() {
        this._setUnifiedLayout({
            btnLabels: ['1 Treffer', '2 Treffer', '3 Treffer'],
            btnClasses: ['seg-single', 'seg-double', 'seg-triple'], // Wir nutzen die gleichen Farben für Konsistenz
            onInput: (idx) => {
                // idx 0->1 Hit, 1->2 Hits, 2->3 Hits, -1->Miss (0 Hits)
                if (idx === -1) {
                    GameEngine.onInput({ hits: 0 });
                } else {
                    GameEngine.onInput({ hits: idx + 1 });
                }
            }
        });
    }
};