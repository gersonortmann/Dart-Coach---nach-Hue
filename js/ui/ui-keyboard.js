/**
 * ui-keyboard.js
 *
 * Einheitliches Pro-Keypad für alle Spiele.
 * Jeder Wurf wird als S/D/T + Zahl erfasst – vollständiges Dart-Tracking.
 *
 * Entfernte Layouts: Cricket-Grid, ATB Hit/Miss, Unified-Training, Bob's27 Aggregate.
 * Alle Spiele nutzen setProLayout().
 */

import { GameEngine } from '../games/game-engine.js';

let inputModifier = '';

function _resetModifiers() {
    inputModifier = '';
    document.querySelectorAll('.mod-btn').forEach(b => b.classList.remove('active-mod'));
    const kp = document.getElementById('keypad-pro');
    if (kp) kp.classList.remove('mode-double', 'mode-triple');
}

function _handleModClick(type, btnElement) {
    const isActive = (inputModifier === type);
    _resetModifiers();
    if (!isActive) {
        inputModifier = type;
        if (btnElement) btnElement.classList.add('active-mod');
        const kp = btnElement?.closest('#keypad-pro') || document.getElementById('keypad-pro');
        if (kp) {
            if (type === 'D') kp.classList.add('mode-double');
            if (type === 'T') kp.classList.add('mode-triple');
        }
    }
}

export const Keyboard = {

    hideAll() {
        _resetModifiers();
        const kp = document.getElementById('keypad-pro');
        if (kp) { kp.classList.add('hidden'); kp.style.display = 'none'; }
    },

    setProLayout() {
        this.hideAll();
        let kp = document.getElementById('keypad-pro');

        if (!kp) {
            const screen = document.getElementById('screen-game');
            kp = document.createElement('div');
            kp.id = 'keypad-pro';
            kp.className = 'keypad-pro-grid';
            // kp.style.cssText = 'display:flex; flex-direction:column; gap:8px; width:80%;';
            screen.appendChild(kp);

            kp.innerHTML = `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:5px;">
                    <button id="btn-mod-double" class="key-btn mod-btn mod-double" style="height:50px;">DOUBLE</button>
                    <button id="btn-mod-triple" class="key-btn mod-btn mod-triple" style="height:50px;">TRIPLE</button>
                </div>
                <div class="num-grid-container" id="num-grid-container"></div>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr 0.6fr; gap:5px; margin-top:5px;">
                    <button class="key-btn bull-btn" data-val="S25" style="line-height:1.1;">Single<br>Bull</button>
                    <button class="key-btn bull-btn" data-val="D25" style="line-height:1.1;">Double<br>Bull</button>
                    <button class="key-btn miss-btn" data-val="MISS" style="line-height:1.1; background:var(--btn-miss-bg); color:black;">Kein<br>Treffer</button>
                    <button id="btn-pro-back" class="key-btn" style="font-size:3rem; background:#555; color:black; line-height:1.1">&#8592;</button>
                </div>
            `;

            const grid = kp.querySelector('#num-grid-container');
            for (let i = 1; i <= 20; i++) {
                const btn = document.createElement('button');
                btn.className = 'key-btn num-btn';
                btn.dataset.val = i;
                btn.innerText = i;
                grid.appendChild(btn);
            }

            kp.querySelector('#btn-mod-double').onclick = (e) => _handleModClick('D', e.currentTarget);
            kp.querySelector('#btn-mod-triple').onclick = (e) => _handleModClick('T', e.currentTarget);

            kp.querySelectorAll('.num-btn').forEach(btn => {
                btn.onclick = () => {
                    const n = btn.dataset.val;
                    let seg;
                    if      (inputModifier === 'D') seg = 'D' + n;
                    else if (inputModifier === 'T') seg = 'T' + n;
                    else                             seg = 'S' + n;
                    GameEngine.onInput(seg);
                    _resetModifiers();
                };
            });

            kp.querySelectorAll('.bull-btn').forEach(btn => {
                btn.onclick = () => {
                    let val = btn.dataset.val;
                    if (val === 'S25' && inputModifier === 'D') val = 'D25';
                    GameEngine.onInput(val);
                    _resetModifiers();
                };
            });

            kp.querySelector('.miss-btn').onclick = () => { GameEngine.onInput('MISS'); _resetModifiers(); };
            kp.querySelector('#btn-pro-back').onclick = () => GameEngine.undoLastAction();
        }

        kp.classList.remove('hidden');
        kp.style.display = 'flex';
    },

    // Compat-Aliases – alle Spiele landen beim Pro-Layout
    setCricketLayout:  function() { this.setProLayout(); },
    setTrainingLayout: function() { this.setProLayout(); },
    setBobs27Layout:   function() { this.setProLayout(); },
    setATBLayout:      function() { this.setProLayout(); },
};
