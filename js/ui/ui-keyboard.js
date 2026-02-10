import { GameEngine } from '../games/game-engine.js';

let inputModifier = ''; 

/**
 * Setzt alle Modifikatoren zurück und entfernt visuelle Markierungen (Farben).
 */
function _resetModifiers() {
    inputModifier = ''; 
    
    // 1. Buttons zurücksetzen (Rahmen/Hervorhebung der Mod-Taste selbst)
    document.querySelectorAll('.mod-btn').forEach(b => b.classList.remove('active-mod'));
    
    // 2. Container-Klassen entfernen (Das sorgt für die Blaufärbung der Zahlen via CSS)
    const containers = document.querySelectorAll('#keypad-pro, #keypad-cricket, #num-grid-container');
    containers.forEach(el => {
        el.classList.remove('mode-double', 'mode-triple');
    });

    // 3. Fallback: Entferne Klassen auch von Buttons direkt
    document.querySelectorAll('.num-btn').forEach(b => {
        b.classList.remove('mod-active-d', 'mod-active-t');
    });
}

/**
 * Behandelt Klicks auf Double/Triple Tasten.
 */
function _handleModClick(type, btnElement) {
    const isActive = (inputModifier === type);
    _resetModifiers(); 

    if (!isActive) {
        inputModifier = type;
        
        // Button selbst aktivieren (Rahmen)
        if(btnElement) btnElement.classList.add('active-mod');
        
        // Parent-Container finden und Klasse setzen (für blaue Zahlen)
        const parentKeypad = btnElement.closest('#keypad-pro, #keypad-cricket');
        
        if (parentKeypad) {
            if (type === 'D') parentKeypad.classList.add('mode-double');
            if (type === 'T') parentKeypad.classList.add('mode-triple');
        } else {
            // Fallback (falls Grid separat ist)
            const grid = document.getElementById('num-grid-container');
            if(grid) {
                if (type === 'D') grid.classList.add('mode-double');
                if (type === 'T') grid.classList.add('mode-triple');
            }
        }
    }
}

export const Keyboard = {
    
    // Versteckt ALLE Keypads und setzt Modifikatoren zurück
    hideAll: function() {
        _resetModifiers();
        const ids = ['keypad-pro', 'keypad-cricket', 'keypad-unified', 'keypad-atc'];
        
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.classList.add('hidden');
                el.style.display = 'none';
            }
        });
    },

    // -------------------------------------------------------------------------
    // 1. PRO KEYPAD (X01) - Dynamisch generiert
    // -------------------------------------------------------------------------
    setProLayout: function() {
        this.hideAll();
        
        let kp = document.getElementById('keypad-pro');
        
        // Wenn noch nicht existiert -> Bauen
        if (!kp) {
            const screen = document.getElementById('screen-game');
            kp = document.createElement('div');
            kp.id = 'keypad-pro';
            kp.className = 'keypad-pro-grid'; 
            kp.style.display = 'flex';
            kp.style.flexDirection = 'column';
            kp.style.gap = '8px';
            
            screen.appendChild(kp);

            kp.innerHTML = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:5px;">
                    <button id="btn-mod-double" class="key-btn mod-btn mod-double" style="height:50px;">DOUBLE</button>
                    <button id="btn-mod-triple" class="key-btn mod-btn mod-triple" style="height:50px;">TRIPLE</button>
                </div>
                
                <div class="num-grid-container" id="num-grid-container">
                    </div>
                
                <div class="bottom-row-grid" style="display:grid; grid-template-columns:1fr 1fr 1fr 0.6fr; gap:5px; margin-top:5px;">
                    <button class="key-btn bull-btn" data-val="25" style="font-size:0.8rem; line-height:1.1;">Single<br>Bull</button>
                    <button class="key-btn bull-btn" data-val="50" style="font-size:0.8rem; line-height:1.1;">Double<br>Bull</button>
                    <button class="key-btn miss" data-val="0" style="font-size:0.8rem; line-height:1.1; background:var(--btn-miss-bg); color:black;">Kein<br>Treffer</button>
                    <button id="btn-pro-back" class="key-btn" style="background:#555; color:white;">⬅</button>
                </div>
            `;

            // Zahlen 1-20 einfügen
            const gridContainer = kp.querySelector('#num-grid-container');
            for (let i = 1; i <= 20; i++) {
                const btn = document.createElement('button');
                btn.className = 'key-btn num-btn';
                btn.dataset.val = i;
                btn.innerText = i;
                gridContainer.appendChild(btn);
            }
            
            // Events binden
            kp.querySelector('#btn-mod-double').onclick = (e) => _handleModClick('D', e.target);
            kp.querySelector('#btn-mod-triple').onclick = (e) => _handleModClick('T', e.target);

            kp.querySelectorAll('.num-btn').forEach(btn => {
                btn.onclick = () => {
                    const raw = btn.dataset.val;
                    let final = raw;
                    
                    if (inputModifier === 'D') final = 'D' + raw;
                    else if (inputModifier === 'T') final = 'T' + raw;
                    else final = 'S' + raw; 

                    GameEngine.onInput(final);
                    _resetModifiers();
                };
            });

            kp.querySelectorAll('.bull-btn, .miss').forEach(btn => {
                btn.onclick = () => {
                    let val = btn.dataset.val;
                    if (val === '25' && inputModifier === 'D') val = '50';
                    GameEngine.onInput(val);
                    _resetModifiers();
                };
            });

            kp.querySelector('#btn-pro-back').onclick = () => GameEngine.undoLastAction();
        }

        // Sichtbar machen
        kp.classList.remove('hidden');
        kp.style.display = 'flex'; 
    },

    // -------------------------------------------------------------------------
    // 2. CRICKET KEYPAD (6x4 Grid + Coloring)
    // -------------------------------------------------------------------------
    setCricketLayout: function() {
        this.hideAll();
        let kp = document.getElementById('keypad-cricket');
        
        if (!kp) {
            const screen = document.getElementById('screen-game');
            kp = document.createElement('div');
            kp.id = 'keypad-cricket';
            
            kp.style.width = '100%';
            kp.style.maxWidth = '500px';
            kp.style.display = 'grid';
            kp.style.gap = 'var(--gap-sm)';
            kp.style.marginTop = 'auto';
            kp.style.marginBottom = 'auto';
            kp.style.gridTemplateColumns = 'repeat(6, 1fr)';
            kp.style.gridTemplateRows = '1fr, 2fr, 2fr, 1fr'; 

            screen.appendChild(kp);
            
            kp.innerHTML = `
                <button id="crm-d" class="key-btn mod-btn mod-double" style="grid-column: span 3;">DOUBLE</button>
                <button id="crm-t" class="key-btn mod-btn mod-triple" style="grid-column: span 3;">TRIPLE</button>

                <button class="key-btn num-btn" data-val="15" style="grid-column: span 2;">15</button>
                <button class="key-btn num-btn" data-val="16" style="grid-column: span 2;">16</button>
                <button class="key-btn num-btn" data-val="17" style="grid-column: span 2;">17</button>

                <button class="key-btn num-btn" data-val="18" style="grid-column: span 2;">18</button>
                <button class="key-btn num-btn" data-val="19" style="grid-column: span 2;">19</button>
                <button class="key-btn num-btn" data-val="20" style="grid-column: span 2;">20</button>

                <button class="key-btn bull-btn" data-val="25" style="grid-column: span 2; font-size:0.9rem; line-height:1.1;">Single<br>Bull</button>
                <button class="key-btn bull-btn" data-val="50" style="grid-column: span 1; font-size:0.9rem; line-height:1.1;">Double<br>Bull</button>
                <button class="key-btn miss" data-val="0" style="grid-column: span 2; font-size:0.9rem; line-height:1.1; background:var(--btn-miss-bg); color:black;">Kein<br>Treffer</button>
                <button id="btn-cr-undo" class="key-btn" style="grid-column: span 1; background:var(--gray-400); color:white; font-size:1.5rem;">⬅</button>
            `;

            // Events
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
        }

        kp.classList.remove('hidden');
        kp.style.display = 'grid'; 
    },

    // -------------------------------------------------------------------------
    // 3. ATB KEYPAD (Große Hit-Taste)
    // -------------------------------------------------------------------------
    setATBLayout: function() {
        this.hideAll();
        let kp = document.getElementById('keypad-atc');
        
        if (!kp) {
            const screen = document.getElementById('screen-game');
            kp = document.createElement('div');
            kp.id = 'keypad-atc';
            kp.style.width = '100%';
            kp.style.maxWidth = '500px';
            kp.style.display = 'grid';
            kp.style.gap = 'var(--gap-sm)';
            kp.style.marginTop = 'auto';
            kp.style.marginBottom = 'auto';
            
            // 2fr oben für doppelten Platz
            kp.style.gridTemplateColumns = 'repeat(3, 1fr)';
            kp.style.gridTemplateRows = '2fr 20px 1fr'; 
            
            screen.appendChild(kp);
            
            kp.innerHTML = `
                <button class="key-btn atc-hit" data-val="HIT" style="grid-column: 1 / -1; background:var(--btn-hit-bg); color:black; font-size:1.5rem;">TREFFER</button>
                <button class="key-btn atc-miss" data-val="MISS" style="grid-row: 3; grid-column: span 2; background:var(--btn-miss-bg); color:black;">Kein Treffer</button>
                <button class="key-btn atc-undo" data-val="UNDO" style="grid-row: 3; grid-column: span 1; background:var(--gray-400); color: white; font-size:1.5rem;">⬅</button>
            `;
            
            kp.querySelector('.atc-hit').onclick = () => GameEngine.onInput('HIT'); 
            kp.querySelector('.atc-miss').onclick = () => GameEngine.onInput('MISS'); 
            kp.querySelector('.atc-undo').onclick = () => GameEngine.undoLastAction(); 
        }
        
        kp.classList.remove('hidden');
        kp.style.display = 'grid'; 
    },

    // -------------------------------------------------------------------------
    // 4. UNIFIED KEYPAD (Training, Bob's 27)
    // -------------------------------------------------------------------------
    _setUnifiedLayout: function(cfg) {
        this.hideAll();
        
        let container = document.getElementById('keypad-unified');
        if (!container) {
            const screen = document.getElementById('screen-game');
            container = document.createElement('div');
            container.id = 'keypad-unified';
            container.style.width = '100%';
            container.style.maxWidth = '500px';
            container.style.gap = 'var(--gap-sm)';
            container.style.display = 'grid';
            container.style.gridTemplateColumns = '1fr 1fr 1fr';
            container.style.gridTemplateRows = '1fr 1fr 20px 1fr'; 
            container.style.marginTop = 'auto'; 
            container.style.marginBottom = 'auto'; 

            screen.appendChild(container);
            
            container.innerHTML = `
                <button class="key-btn btn-0" data-idx="0" style="grid-row: 1 / span 2; font-size:1.1rem;"></button>
                <button class="key-btn btn-1" data-idx="1" style="grid-row: 1 / span 2; font-size:1.1rem;"></button>
                <button class="key-btn btn-2" data-idx="2" style="grid-row: 1 / span 2; font-size:1.1rem;"></button>

                <button class="key-btn miss" data-val="miss" style="grid-row: 4; grid-column: 1 / span 2; background: var(--btn-miss-bg); color:black; font-size:1.1rem;">
                    Kein Treffer
                </button>
                <button class="key-btn" id="btn-uni-undo" style="grid-row: 4; grid-column: 3; background: var(--gray-400); color: white; font-size:1.5rem;">
                    ⬅
                </button>
            `;
            
            // Listener
            const mainBtns = container.querySelectorAll('button[data-idx]');
            mainBtns.forEach(btn => {
                btn.onclick = () => {
                    if(container.currentOnInput) container.currentOnInput(parseInt(btn.dataset.idx));
                };
            });
            container.querySelector('.miss').onclick = () => {
                if(container.currentOnInput) container.currentOnInput(-1);
            };
            document.getElementById('btn-uni-undo').onclick = () => GameEngine.undoLastAction();
        }

        container.querySelector('.btn-0').innerText = cfg.btnLabels[0];
        container.querySelector('.btn-1').innerText = cfg.btnLabels[1];
        container.querySelector('.btn-2').innerText = cfg.btnLabels[2];
        
        const b0 = container.querySelector('.btn-0');
        const b1 = container.querySelector('.btn-1');
        const b2 = container.querySelector('.btn-2');
        b0.className = `key-btn btn-0 ${cfg.btnClasses[0]}`;
        b1.className = `key-btn btn-1 ${cfg.btnClasses[1]}`;
        b2.className = `key-btn btn-2 ${cfg.btnClasses[2]}`;

        container.currentOnInput = cfg.onInput;
        container.classList.remove('hidden');
        container.style.display = 'grid'; 
    },

    setTrainingLayout: function() {
        this._setUnifiedLayout({
            btnLabels: ['SINGLE', 'DOUBLE', 'TRIPLE'],
            btnClasses: ['seg-single', 'seg-double', 'seg-triple'],
            onInput: (idx) => {
                if (idx === -1) GameEngine.onInput({ multiplier: 0, isMiss: true });
                else GameEngine.onInput({ multiplier: idx + 1, isMiss: false });
            }
        });
    },

    setBobs27Layout: function() {
        this._setUnifiedLayout({
            btnLabels: ['1 Treffer', '2 Treffer', '3 Treffer'],
            btnClasses: ['seg-single', 'seg-double', 'seg-triple'],
            onInput: (idx) => {
                if (idx === -1) GameEngine.onInput({ hits: 0 });
                else GameEngine.onInput({ hits: idx + 1 });
            }
        });
    }
};