import { UIOverlay } from './ui-overlay.js';
import { State } from '../core/state.js';
import { GameEngine } from '../games/game-engine.js';
import { UI } from './ui-core.js';
import { Keyboard } from './ui-keyboard.js';
import { ResultScreen } from './ui-result.js';

export const Game = {
    
    switchToGame: function() { 
        UI.showScreen('screen-game'); 
        
        if (Keyboard && Keyboard.hideAll) {
            Keyboard.hideAll();
        }
        
        const session = State.getActiveSession();
        if (!session) return;

        // Keypad Auswahl
        if (session.gameId === 'cricket') {
             Keyboard.setCricketLayout();
        }
        else if (session.gameId === 'single-training' || session.gameId === 'shanghai') {
            if(Keyboard.setTrainingLayout) Keyboard.setTrainingLayout();
        } 
        else if (session.gameId === 'bobs27') {
             if(Keyboard.setBobs27Layout) Keyboard.setBobs27Layout();
        }
		else if (session.gameId === 'around-the-board') {
            if(Keyboard.setATBLayout) Keyboard.setATBLayout();
        }
        else {
            if(Keyboard.setProLayout) Keyboard.setProLayout();
        }
        
        this.updateGameDisplay(); 
    },

    updateGameDisplay: function() {
        const session = State.getActiveSession(); 
        if(!session) return;

        // Header immer aktualisieren
        const player = session.players[session.currentPlayerIndex];
        const headerName = document.getElementById('game-player-name');
        const headerScore = document.getElementById('game-player-score');
        const matchInfo = document.getElementById('game-match-info');
        
        if(headerName) headerName.innerText = player.name;
        if(headerScore) {
            headerScore.innerText = player.currentResidual;
            headerScore.style.color = 'var(--accent-color)'; 
        }
        if(matchInfo) matchInfo.innerText = UI.getGameLabel(session.gameId);

        // Render Weiche
        if (session.gameId === 'cricket') {
            this._renderCricket(session);
        }
        else if (session.gameId === 'single-training') {
            this._renderTraining(session);
        }
        else if (session.gameId === 'shanghai') {
            this._renderShanghai(session);
        }
        else if (session.gameId === 'bobs27') {
            this._renderBobs27(session);
        }
		else if (session.gameId === 'around-the-board') {
            this._renderAroundTheBoard(session);
        }
        else {
            this._renderX01(session);
        }
    },

    /**
     * HILFSFUNKTION: Schaltet die Ansicht in der Target-Box um,
     * ohne Elemente zu löschen.
     */
    _prepareTargetBox: function(mode) {
        const box = document.querySelector('.target-box');
        const standardEls = box.querySelectorAll('.target-row-main, .target-row-hint, .target-row-score, #turn-score-container');
        
        let cricketContainer = document.getElementById('cricket-view-container');
        if (!cricketContainer) {
            cricketContainer = document.createElement('div');
            cricketContainer.id = 'cricket-view-container';
            cricketContainer.style.width = '100%';
            cricketContainer.style.flex = '1'; 
            const dartBox = document.getElementById('dart-display-container');
            box.insertBefore(cricketContainer, dartBox);
        }

        if (mode === 'cricket') {
            standardEls.forEach(el => el.classList.add('hidden'));
            cricketContainer.classList.remove('hidden');
            cricketContainer.style.display = 'block';
        } else {
            standardEls.forEach(el => el.classList.remove('hidden'));
            cricketContainer.classList.add('hidden');
            cricketContainer.style.display = 'none';
        }
        
        const dbContainer = document.getElementById('dart-display-container');
        if(dbContainer) dbContainer.classList.remove('hidden');
        
        return cricketContainer;
    },

	/**
     * CRICKET RENDERER
     */
    _renderCricket: function(session) {
        const container = this._prepareTargetBox('cricket');
        const activePIdx = session.currentPlayerIndex;
        const player = session.players[activePIdx];
        const players = session.players;
        
        // --- HEADER UPDATE (NEU) ---
        const headerName = document.getElementById('game-player-name');
        const headerScore = document.getElementById('game-player-score'); // Nutzen wir jetzt für Runden
        const matchInfo = document.getElementById('game-match-info');
        
        if(headerName) {
            // Name + "ist am Wurf"
            headerName.innerHTML = `<span style="font-size:2rem; font-weight:800; text-transform:uppercase;">${player.name}</span> <span style="font-size:1rem; color:#888; font-weight:normal;">ist am Wurf</span>`;
        }

        // Runden-Anzeige
        if(headerScore) {
            let currentRound = player.turns.length + 1;
            const maxRounds = session.settings.spRounds || 20;
            
            // Wenn wir gerade 3 Darts geworfen haben, sind wir technisch schon in der nächsten Runde (turns.length ist gestiegen),
            // aber visuell (Overlay) noch am Ende der alten. Daher ziehen wir 1 ab.
            if (session.tempDarts && session.tempDarts.length === 3) {
                 currentRound--;
            }

            // Im Singleplayer zeigen wir "Runde X von Y", im Multiplayer nur "Runde X"
            if (players.length === 1 && maxRounds > 0) {
                headerScore.innerText = `Runde ${currentRound} von ${maxRounds}`;
            } else {
                headerScore.innerText = `Runde ${currentRound}`;
            }
            headerScore.style.fontSize = '1.1rem';
            headerScore.style.color = '#aaa';
        }

        // Aktuelle Aufnahme (Turn Score)
        if(matchInfo) {
            const turnPoints = (session.tempDarts || []).reduce((a, b) => a + (b.points || 0), 0);
            matchInfo.innerHTML = `Aktuelle Aufnahme: <span style="color:var(--accent-color); font-weight:bold; font-size:1.2rem;">${turnPoints}</span>`;
        }
		
        // --- 1. TABELLEN LAYOUT ---
        let gridTemplate = "";
        let headerHTML = "";
        // WICHTIG: Targets umdrehen für Anzeige (20 oben, Bull unten)
        const targets = [20, 19, 18, 17, 16, 15, 25]; 

        if (players.length <= 2) {
            // 2 Spieler Layout
            gridTemplate = `1fr 60px 1fr`; 
            
            // Header
            headerHTML += `<div class="c-player-header ${activePIdx === 0 ? 'active' : ''}">
                ${players[0].name}
                <div class="c-score-big">${players[0].currentResidual}</div>
            </div>`;
            
            headerHTML += `<div style="background:#222;"></div>`; // Spacer

            if (players[1]) {
                headerHTML += `<div class="c-player-header ${activePIdx === 1 ? 'active' : ''}">
                    ${players[1].name}
                    <div class="c-score-big">${players[1].currentResidual}</div>
                </div>`;
            } else {
                 headerHTML += `<div></div>`;
            }

        } else {
            // 3+ Spieler Layout
            gridTemplate = `50px repeat(${players.length}, 1fr)`;
            headerHTML += `<div style="background:#222;"></div>`; 
            
            players.forEach((p, idx) => {
                 headerHTML += `<div class="c-player-header ${activePIdx === idx ? 'active' : ''}">
                    ${p.name.substring(0, 3)} 
                    <div class="c-score-big">${p.currentResidual}</div>
                </div>`;
            });
        }

        // --- 2. BOARD BAUEN ---
        let boardHtml = `
            <div class="cricket-board">
                <div class="cricket-header" style="grid-template-columns: ${gridTemplate};">
                    ${headerHTML}
                </div>
        `;

        targets.forEach(t => {
            const label = t === 25 ? 'B' : t;
            // Zeile geschlossen? (Einfache Logik: wenn alle zu haben)
            const allClosed = players.every(p => (p.marks[t] || 0) >= 3);
            const rowClass = allClosed ? 'cricket-row closed-row' : 'cricket-row';

            boardHtml += `<div class="${rowClass}" style="grid-template-columns: ${gridTemplate};">`;

            const getMarkSVG = (count) => {
                if (!count || count <= 0) return '';
                if (count >= 3) return `<svg class="mark-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" stroke-width="2"/><line x1="16" y1="8" x2="8" y2="16" stroke="currentColor" stroke-width="2"/><line x1="8" y1="8" x2="16" y2="16" stroke="currentColor" stroke-width="2"/></svg>`; 
                if (count === 2) return `<svg class="mark-svg" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2"/></svg>`; 
                return `<svg class="mark-svg" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2"/></svg>`; 
            };

            if (players.length <= 2) {
                // P1
                boardHtml += `<div class="c-mark-cell ${activePIdx === 0 ? 'active-col' : ''}">${getMarkSVG(players[0].marks[t])}</div>`;
                // Target
                boardHtml += `<div class="c-target-cell">${label}</div>`;
                // P2
                if(players[1]) {
                    boardHtml += `<div class="c-mark-cell ${activePIdx === 1 ? 'active-col' : ''}" style="border-right:none;">${getMarkSVG(players[1].marks[t])}</div>`;
                } else {
                     boardHtml += `<div></div>`;
                }
            } else {
                // Target Links
                boardHtml += `<div class="c-target-cell">${label}</div>`;
                // Players
                players.forEach((p, idx) => {
                    boardHtml += `<div class="c-mark-cell ${activePIdx === idx ? 'active-col' : ''}" style="${idx === players.length-1 ? 'border-right:none;' : ''}">
                        ${getMarkSVG(p.marks[t])}
                    </div>`;
                });
            }
            boardHtml += `</div>`;
        });

        boardHtml += `</div>`; // End Board Wrapper
        container.innerHTML = boardHtml;

        // Scoreboard (oben) ausblenden, da Tabelle alles zeigt
        const sb = document.getElementById('multiplayer-scoreboard');
        if(sb) sb.style.display = 'none';
        
        // Darts Boxen updaten (die waren vorher versteckt, jetzt sichtbar!)
        this._updateDartBoxes(session);
    },

    /**
     * X01 RENDERER (Aktualisiert für Reset)
     */
    _renderX01: function(session) {
        this._prepareTargetBox('standard'); // RESET AUF STANDARD!
        
        const player = session.players[session.currentPlayerIndex];
        const targetValEl = document.getElementById('game-target-val');
        const hintContainer = document.getElementById('checkout-suggestion');
        const scoreVal = document.getElementById('turn-score-val');

        // Cleanup Classes
        targetValEl.classList.remove('anim-bust', 'anim-miss', 'anim-check', 'bust-flash');

        document.getElementById('lbl-target-desc').innerText = "Rest";
        targetValEl.innerText = player.currentResidual; 
            
        const dartsLeft = 3 - (session.tempDarts || []).length;
        let guide = dartsLeft > 0 ? GameEngine.getCheckoutGuide(player.currentResidual, dartsLeft) : "";
        
        if(guide) { 
            hintContainer.innerText = guide; 
            hintContainer.classList.remove('hidden'); 
        } else {
            hintContainer.classList.add('hidden');
        }
        
        // Turn Score
        const currentTurnPoints = (session.tempDarts || []).reduce((acc, d) => acc + (d.points || 0), 0);
        scoreVal.innerText = currentTurnPoints;
        
        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },

	_renderAroundTheBoard: function(session) {
        this._prepareTargetBox('standard'); 

        const player = session.players[session.currentPlayerIndex];
        const targetValEl = document.getElementById('game-target-val');
        const hintContainer = document.getElementById('checkout-suggestion');
        const scoreVal = document.getElementById('turn-score-val');
        
        // Target Logic
        const currentIdx = player.currentResidual || 0;
        let targetText = "FINISH";
        
        if (currentIdx < session.targets.length) {
            const rawTarget = session.targets[currentIdx];
            
            // ÄNDERUNG: KEIN PRÄFIX MEHR IM HAUPTFENSTER
            // Nur "25" wird zu "BULL", sonst bleibt die Zahl nackt.
            targetText = (rawTarget === 25) ? "BULL" : rawTarget;
        }

        targetValEl.innerText = targetText;
        
        // Optional: Info unter der Zahl anzeigen ("Single Inner")
        const v = player.variant || 'full';
        const subMap = { 'full':'', 'single-inner':'Inner', 'single-outer':'Outer', 'double':'Double', 'triple':'Triple' };
        document.getElementById('lbl-target-desc').innerText = subMap[v] || "Ziel";

        // Fortschrittsanzeige
        hintContainer.classList.remove('hidden');
        hintContainer.innerText = `Ziel ${currentIdx + 1} von ${session.targets.length}`;

        // Score in Aufnahme
        const currentTurnHits = (session.tempDarts || []).filter(d => d.isHit).length;
        scoreVal.innerText = currentTurnHits + " Hits";
        
        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },
	
    _renderTraining: function(session) {
        this._prepareTargetBox('standard');
        
        const player = session.players[session.currentPlayerIndex];
        const targetValEl = document.getElementById('game-target-val');
        const hintContainer = document.getElementById('checkout-suggestion');
        const scoreVal = document.getElementById('turn-score-val');

        targetValEl.classList.remove('anim-bust', 'anim-miss', 'anim-check', 'bust-flash');
        document.getElementById('lbl-target-desc').innerText = "Ziel";

        let currentTargetIndex = player.turns.length;
		if (session.tempDarts && session.tempDarts.length === 3) {
            currentTargetIndex--;
        }
		
        // if (session.animation && currentTargetIndex > 0) currentTargetIndex--;

        if (currentTargetIndex >= session.targets.length) {
            targetValEl.innerText = "ENDE";
        } else {
            let target = session.targets[currentTargetIndex];
            if(target === 25) target = "BULL";
            targetValEl.innerText = target;
        }
        
        hintContainer.classList.remove('hidden');
        hintContainer.innerText = `Runde: ${currentTargetIndex + 1} / 21`;

        const currentTurnPoints = (session.tempDarts || []).reduce((acc, d) => acc + (d.points || 0), 0);
        scoreVal.innerText = currentTurnPoints;

        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },

    _renderShanghai: function(session) {
        this._prepareTargetBox('standard');

        const player = session.players[session.currentPlayerIndex];
        const targetValEl = document.getElementById('game-target-val');
        const hintContainer = document.getElementById('checkout-suggestion');
        
        let currentTargetIndex = player.turns.length; 
		if (session.tempDarts && session.tempDarts.length === 3) {
            currentTargetIndex--;
        }

        if (currentTargetIndex >= session.targets.length) {
            targetValEl.innerText = "ENDE";
        } else {
            targetValEl.innerText = session.targets[currentTargetIndex];
        }
        
        // HIER DIE ÄNDERUNG: Anzeige "Runde X / Y"
        hintContainer.innerText = `Runde: ${currentTargetIndex + 1} / ${session.targets.length}`;
        hintContainer.classList.remove('hidden');

        document.getElementById('turn-score-val').innerText = (session.tempDarts || []).reduce((a,b)=>a+b.points,0);
        
        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },

    _renderBobs27: function(session) {
        this._prepareTargetBox('standard');
		
        document.getElementById('dart-display-container').classList.add('hidden');
        
        const player = session.players[session.currentPlayerIndex];
        const targetValEl = document.getElementById('game-target-val');
        
        let currentTargetIndex = player.turns.length;
		if (session.tempDarts && session.tempDarts.length > 0) {
            currentTargetIndex--;
        }
		
        // if (session.animation && currentTargetIndex > 0) currentTargetIndex--;

        if (currentTargetIndex >= session.targets.length) {
            targetValEl.innerText = "ENDE";
        } else {
            const t = session.targets[currentTargetIndex];
            targetValEl.innerText = t === 25 ? "BULL" : "D" + t;
        }
        
        if (player.isEliminated) {
            document.getElementById('game-player-score').innerText = "BUST";
            document.getElementById('game-player-score').style.color = 'var(--miss-color)';
        }
        
        this._renderMultiplayerScoreboard(session);
    },

    _updateDartBoxes: function(session) {
        for(let i=1; i<=3; i++) {
            const box = document.getElementById(`dart-box-${i}`);
            box.classList.remove('filled', 'is-miss'); 
            box.style.color = ''; 
			box.innerHTML = "";
            
            const dart = session.tempDarts ? session.tempDarts[i-1] : null;
            if(dart) {
                box.classList.add('filled');
                
				// --- NEU: AROUND THE BOARD LOGIK ---
				if (session.gameId === 'around-the-board') {
                    if (dart.isHit) {
                        box.innerText = "✔"; // Oder Checkmark Icon
                        box.style.color = 'var(--accent-color)';
                    } else {
                        box.innerText = "✖";
                        box.classList.add('is-miss');
                    }
                }
				
                // CRICKET SPEZIAL LOGIK
                else if (session.gameId === 'cricket') {
                    let valStr = dart.val.toString();
                    if(valStr === 'MISS' || valStr === '0') {
                        box.innerText = "✖";
                        box.classList.add('is-miss');
                    } else {
                        // S20 -> 20, D20 -> D20, T20 -> T20
                        if(valStr.startsWith('S')) valStr = valStr.substring(1);
                        if(valStr === '25') valStr = 'SB'; // Single Bull
                        if(valStr === '50') valStr = 'DB'; // Double Bull
                        box.innerText = valStr;
                        // Farbe je nach Treffer (optional)
                        if(dart.points > 0 || dart.marksAdded > 0) box.style.color = 'var(--accent-color)';
                    }
                } 
                // STANDARD LOGIK
                else {
                    if (dart.val === '0' || (typeof dart.val === 'object' && dart.val.isMiss)) { 
                        box.innerText = "✖"; 
                        box.classList.add('is-miss'); 
                    } else if (typeof dart.val === 'object') {
                        const map = { 1: 'S', 2: 'D', 3: 'T' };
                        box.innerText = map[dart.val.multiplier];
                    } else {
                        let text = dart.val.toString(); 
                        text = text.replace('S', '');
                        if (text === '25') text = '25';
                        if (text === '50') text = 'Bull';
                        box.innerText = text; 
                    }
                }
            } else { 
                box.innerText = ""; 
            }
        }
    },

    _renderMultiplayerScoreboard: function(session) {
        // (Unverändert lassen, oder kopieren aus alter Datei)
        const sbContainer = document.getElementById('multiplayer-scoreboard');
        if (!sbContainer) return;
        sbContainer.innerHTML = '';
        const inactivePlayers = session.players.filter((p, idx) => idx !== session.currentPlayerIndex);
        
        if (inactivePlayers.length === 0) {
            sbContainer.style.display = 'none';
        } else {
            sbContainer.style.display = 'flex';
            inactivePlayers.forEach(p => {
                const card = document.createElement('div');
                card.className = 'player-mini-card';
                let scoreVal = p.currentResidual;
                // Bei Training/Shanghai "Pkt" anhängen
                if(session.gameId !== 'x01' && session.gameId !== 'cricket') scoreVal += ' Pkt';
                
                let detailLine = "";
                if(session.gameId === 'x01') {
                     detailLine = (session.settings.mode === 'sets') ? `S:${p.setsWon} L:${p.legsWon}` : `Legs: ${p.legsWon}`;
                }

                card.innerHTML = `
                    <div class="mini-name">${p.name}</div>
                    <div class="mini-score">${scoreVal}</div>
                    <div class="mini-legs" style="font-size:0.7rem; color:#666;">${detailLine}</div>
                `;
                sbContainer.appendChild(card);
            });
        }
    },

    showOverlay: function(content, type) {
        UIOverlay.show(content, type);
    },

    showResult: function() { ResultScreen.show(); },
    renderDetails: function(playerId) { ResultScreen.renderDetails(playerId); },
    selectResultPlayer: function(playerId) { ResultScreen.renderDetails(playerId); }
};