import { UIOverlay } from './ui-overlay.js';
import { State } from '../core/state.js';
import { GameEngine } from '../games/game-engine.js';
import { UI } from './ui-core.js';
import { Keyboard } from './ui-keyboard.js';
import { ResultScreen } from './ui-result.js';
import { TrainingManager } from '../core/training-manager.js';

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
		
		const btnRestart = document.getElementById('btn-restart');
        if (btnRestart) {
            // Wenn TrainingManager aktiv ist, Button verstecken, sonst zeigen
            if (TrainingManager && TrainingManager.isActive()) {
                btnRestart.style.display = 'none';
            } else {
                btnRestart.style.display = 'flex'; // oder 'block', je nach CSS
            }
        }
    },

    updateGameDisplay: function() {
        const session = State.getActiveSession(); 
        if(!session) return;

        // 1. NEU: Header komplett neu rendern (Grid-System)
        this._renderPlayerHeader(session);

        // Match-Info (z.B. "Best of 5") aktualisieren, falls vorhanden
        const matchInfo = document.getElementById('game-match-info');
        if(matchInfo) matchInfo.innerText = UI.getGameLabel(session.gameId);

        // Render Weiche für Target-Box (bleibt unverändert)
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
        else if (session.gameId === 'checkout-challenge') {
            this._renderCheckoutChallenge(session);
        }
        else if (session.gameId === 'halve-it') {
            this._renderHalveIt(session);
        }
		else if (session.gameId === 'scoring-drill') {
			this._renderScoringDrill(session);
		}
        else {
            this._renderX01(session);
        }
        
        // 2. WICHTIG: Das alte Multiplayer-Scoreboard unten ausblenden/leeren,
        // da wir jetzt alle Infos oben haben.
        const sbContainer = document.getElementById('multiplayer-scoreboard');
        if (sbContainer) {
            sbContainer.innerHTML = '';
            sbContainer.style.display = 'none';
        }
    },

    /**
     * NEU: Baut den Header mit Boxen für jeden Spieler
     */
    _renderPlayerHeader: function(session) {
        // Container finden (in deiner HTML ist das vermutlich .game-header-area)
        const headerContainer = document.querySelector('.game-header-area');
        if (!headerContainer) return;

        const players = session.players;
        const activeIdx = session.currentPlayerIndex;
        const count = players.length;
        const isMultiplayer = count > 1;

        // Grid-Klassen bestimmen
        let gridClass = 'p-count-multi'; // Default für 4+
        if (count === 1) gridClass = 'p-count-1';
        else if (count === 2) gridClass = 'p-count-2';
        else if (count === 3) gridClass = 'p-count-3';

        // HTML zusammenbauen
        let html = `<div class="player-header-grid ${gridClass} ${isMultiplayer ? 'is-multi' : ''}">`;

        players.forEach((p, idx) => {
            const isActive = (idx === activeIdx);
            
            // Score ermitteln (Logik aus deinem alten Code übernommen)
            let displayScore = p.currentResidual; // Standard (X01)
            
            // Spiele wo Score hochzählt statt Rest
            if (session.gameId === 'halve-it' || 
                session.gameId === 'checkout-challenge' || 
                session.gameId === 'scoring-drill' || 
                session.gameId === 'cricket') { // Bei Cricket zeigen wir hier oft Punkte oder Marks, Score ist aber safe
                displayScore = p.score;
            }

            // Sicherstellen, dass 0 angezeigt wird
            displayScore = (displayScore !== undefined && displayScore !== null) ? displayScore : 0;

            // Zusatz-Info (z.B. Sets/Legs bei X01)
            let metaInfo = "&nbsp;"; 

            if (session.gameId === 'x01') {
                if (session.settings.mode === 'sets') {
                    metaInfo = `S:${p.setsWon} | L:${p.legsWon}`;
                } else {
                    metaInfo = `Legs: ${p.legsWon}`;
                }
            } 
            else if (session.gameId === 'cricket') {
                 metaInfo = `MPR: ${p.liveMpr || '0.00'}`;
            } 
            else if (session.gameId === 'single-training' || session.gameId === 'around-the-board') {
                 // Beide nutzen Hit Rate
                 metaInfo = `Quote: ${p.liveHitRate || '0.0%'}`;
            } 
            else if (session.gameId === 'bobs27') {
                 metaInfo = `Hits: ${p.liveBobsHits || '0'}`;
            } 
            else if (session.gameId === 'scoring-drill') {
                 metaInfo = `PPT: ${p.livePpt || '00.0'}`;
            }
            else if (session.gameId === 'checkout-challenge') {
                 metaInfo = `Checks: ${p.checkoutsHit || '0'}`;
            }
            else if (session.gameId === 'halve-it') {
                 metaInfo = `Halbiert: ${p.halvedCount || '0'}`;
            }

            html += `
				<div class="player-header-card ${isActive ? 'active' : ''}">
					<div class="ph-col-left">
						<div class="ph-name">${p.name}</div>
					</div>
					
					<div class="ph-col-center">
						<div class="ph-legs">${metaInfo}</div>
					</div>
					
					<div class="ph-col-right">
						<div class="ph-score">${displayScore}</div>
					</div>
				</div>
			`;
        });

        html += `</div>`;

        // In den Header injecten
        // ACHTUNG: Wir ersetzen den kompletten Inhalt von .game-header-area, 
        // damit die alten IDs (game-player-name etc.) weg sind.
        headerContainer.innerHTML = html;
        
        // Style-Reset, falls der Container vorher Flex/Padding hatte, 
        // das jetzt stört (optional, je nach deiner base.css)
        headerContainer.style.background = 'transparent';
        headerContainer.style.border = 'none';
        headerContainer.style.padding = '0';
        headerContainer.style.width = '100%';
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
        const headerScore = document.getElementById('game-player-score');
        const matchInfo = document.getElementById('game-match-info');
        
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

	_renderScoringDrill: function(session) {
        this._prepareTargetBox('standard');
        const player = session.players[session.currentPlayerIndex];
        
        // Header Score setzen (WICHTIG: updateGameDisplay behandelt 'scoring-drill' bereits korrekt als Punktestand)
        // Aber sicherheitshalber hier nochmal explizit:
        const headerScore = document.getElementById('game-player-score');
        if(headerScore) headerScore.innerText = player.score;

        const targetValEl = document.getElementById('game-target-val');
        const labelEl = document.getElementById('lbl-target-desc');
        const hintContainer = document.getElementById('checkout-suggestion');
        const scoreLabel = document.getElementById('lbl-turn-score');
        const scoreVal = document.getElementById('turn-score-val');
        
        // 1. Hauptanzeige: Score
        if (targetValEl) targetValEl.innerText = player.score;
        if (labelEl) labelEl.innerText = "SCORE";

        // 2. Info-Box: Darts Left
        // Wir rechnen aus: Limit - (Geworfen + TempDarts)
        const totalThrown = player.dartsThrown + (session.tempDarts ? session.tempDarts.length : 0);
        const limit = player.dartLimit || 99;
		const totalRounds = Math.floor(limit / 3);
        
        let currentRound = Math.floor(player.dartsThrown / 3) + 1;
            
            // ZEITMASCHINEN-LOGIK:
            // Wenn wir gerade 3 Darts geworfen haben (Pause/Overlay), 
            // ist dartsThrown schon 3, 6, 9... und currentRound wäre schon eins weiter.
            // Wir wollen aber visuell noch in der alten Runde bleiben.
            if (session.tempDarts && session.tempDarts.length === 3) {
                currentRound--;
            }
            
            // Begrenzung (falls wir genau am Ende sind)
            if (currentRound > totalRounds) currentRound = totalRounds;
            if (currentRound < 1) currentRound = 1; // Startfall

            hintContainer.classList.remove('hidden');
            hintContainer.innerText = `RUNDE ${currentRound} von ${totalRounds}`;
            hintContainer.style.color = "#888";
     

        // 3. Runden-Score
        if (scoreLabel) scoreLabel.innerText = "AUFNAHME";
        const currentTurnScore = (session.tempDarts || []).reduce((a,b) => a+b.points, 0);
        if (scoreVal) scoreVal.innerText = currentTurnScore;

        // Header Meta leeren
        const headerMeta = document.querySelector('.game-header-meta');
        if(headerMeta) headerMeta.innerText = "";

        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },
	
	_renderHalveIt: function(session) {
        this._prepareTargetBox('standard');
        
        const player = session.players[session.currentPlayerIndex];
        
        // ZEITMASCHINEN-LOGIK:
        let roundIdx = player.turns.length;
        if (session.tempDarts && session.tempDarts.length === 3) {
            roundIdx--; 
        }
        
        // Schutz vor Index-Fehlern (falls roundIdx < 0 oder > max)
        if (roundIdx < 0) roundIdx = 0;
        const targetId = session.targets[roundIdx] || session.targets[session.targets.length-1];

        // Mapping
        const labelMap = {
            'ANY_DOUBLE': 'Double',
            'ANY_TRIPLE': 'Triple',
            'BULL': 'BULL',
            'ALL': 'ALLE'
        };
        const displayTarget = labelMap[targetId] || targetId;

        // Elemente
        const targetValEl = document.getElementById('game-target-val');
        const labelEl = document.getElementById('lbl-target-desc');
        const scoreLabel = document.getElementById('lbl-turn-score');
		const hintContainer = document.getElementById('checkout-suggestion');
        const headerScore = document.getElementById('game-player-score');
        const headerMeta = document.querySelector('.game-header-meta');
        
        // 1. Ziel-Anzeige
        if (targetValEl) targetValEl.innerText = displayTarget;
        if (labelEl) labelEl.innerText = "ZIEL";
		
		// 2. Grüne Box: Runden-Info
		if (hintContainer) {
            hintContainer.classList.remove('hidden');
            hintContainer.innerText = `Runde ${roundIdx + 1} von ${session.targets.length}`;
            hintContainer.style.color = "#888"; // Dezent
        }
		
        // 3. Header Bereinigung & Score
        if (headerMeta) headerMeta.innerText = ""; 
        if (headerScore) {
            headerScore.innerText = player.score; 
            headerScore.style.color = "var(--highlight-color)";
        }

        // 4. Info unten rechts (Punkte in dieser Aufnahme)
        if (scoreLabel) scoreLabel.innerText = "RUNDEN-SCORE";
        
        const currentTurnScore = (session.tempDarts || []).reduce((sum, d) => sum + (d.isTargetHit ? d.points : 0), 0);
        const scoreVal = document.getElementById('turn-score-val');
        if (scoreVal) scoreVal.innerText = currentTurnScore;

        const turnScoreBox = document.getElementById('target-row-score');
        if (turnScoreBox) turnScoreBox.style.visibility = 'visible';

        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },
	
	_renderCheckoutChallenge: function(session) {
        this._prepareTargetBox('standard');

        const player = session.players[session.currentPlayerIndex];
        const targets = session.targets;
        
        const currentTurnScore = (session.tempDarts || []).reduce((a,b) => a + b.points, 0);

        // Standard: Wir nehmen den gespeicherten Startwert (z.B. 85 nach Checkout)
        let startRes = (player._startOfTurnRes !== undefined) 
            ? player._startOfTurnRes 
            : targets[0];
            
        let currentRoundIndex = player._roundIdx || 0;

        // 🔍 FIX: "Time Machine" für den Overlay-Moment
        // Wenn Darts im Speicher liegen (tempDarts) UND die Strategie schon auf die nächste Runde geschaltet hat (roundIdx > 0),
        // kann es sein, dass wir rechnerisch im "Niemandsland" sind (Neues Ziel minus Alte Darts = Negativ).
        if (session.tempDarts && session.tempDarts.length > 0 && currentRoundIndex > 0) {
            const prevTarget = targets[currentRoundIndex - 1];
            const prevRes = prevTarget - currentTurnScore;
            
            // Wenn die Rechnung mit dem neuen Ziel keinen Sinn macht (< 0)
            // ODER wenn wir auf dem alten Ziel exakt 0 (Check) oder <=1 (Bust) haben:
            // Dann zeigen wir visuell noch die ALTE Runde an.
            if ((startRes - currentTurnScore) < 0 || prevRes <= 1) {
                startRes = prevTarget;
                currentRoundIndex--; // Auch Anzeige "Runde X" korrigieren
            }
        }

        // Live-Restwert Berechnung
        let liveResidual = startRes - currentTurnScore;

        // UI Elemente
        const targetValEl = document.getElementById('game-target-val');
        const labelEl = document.getElementById('lbl-target-desc');
        const hintContainer = document.getElementById('checkout-suggestion');
        const headerScore = document.getElementById('game-player-score');
        
        // Turn Score Box ausblenden (wir nutzen Main Display)
        const turnScoreBox = document.getElementById('target-row-score');
        if (turnScoreBox) turnScoreBox.style.visibility = 'hidden'; 

        // 1. Anzeige Restwert (Große Zahl)
        if (targetValEl) {
             targetValEl.innerText = liveResidual;
        }

        // 2. Header Score
        if (headerScore) headerScore.innerText = player.score;
        
        // 3. Runden-Info
        if (labelEl) {
            // +1 weil Array 0-basiert
            const displayRound = currentRoundIndex + 1;
            labelEl.innerText = `RUNDE ${displayRound} von ${targets.length}`;
        }

        // 4. Checkout Guide (Grüne Box)
        if (hintContainer) {
            const dartsThrown = session.tempDarts ? session.tempDarts.length : 0;
            const dartsLeft = 3 - dartsThrown;
			
            hintContainer.classList.remove('hidden');
            hintContainer.style.transition = "opacity 0.2s ease";

            // FIX: Ausblenden bei 0 Darts oder während Animation
            if (dartsLeft <= 0 || session.animation) { 
                 hintContainer.style.opacity = '0';
            } else {
				hintContainer.style.opacity = '1';
                
                if (liveResidual <= 1 && liveResidual !== 0) {
                     // 1 Rest oder < 0 ist Bust
                     hintContainer.innerText = "BUST";
                     hintContainer.style.color = "var(--miss-color)";
                } 
                else if (liveResidual === 0) {
                     hintContainer.innerText = "CHECK!";
                     hintContainer.style.color = "var(--accent-color)";
                }
                else {
                    const guide = GameEngine.getCheckoutGuide(liveResidual, dartsLeft);
                    if (guide && guide !== "") {
                        hintContainer.innerText = guide;
                        hintContainer.style.color = "var(--accent-color)"; 
                    } else {
                        hintContainer.innerText = "nicht checkbar"; 
                        hintContainer.style.color = "#666"; 
                    }
                }
            }
        }
        
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
        const currentTurnHits = (session.tempDarts || []).filter(d => !d.isMiss).length;
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

    /**
     * Step 7a: Liest jetzt das universelle Dart-Format.
     * dart.segment, dart.isMiss, dart.multiplier, dart.base
     */
    _updateDartBoxes: function(session) {
        for(let i=1; i<=3; i++) {
            const box = document.getElementById(`dart-box-${i}`);
            box.classList.remove('filled', 'is-miss'); 
            box.style.color = ''; 
			box.innerHTML = "";
            
            const dart = session.tempDarts ? session.tempDarts[i-1] : null;
            if(dart) {
                box.classList.add('filled');
                
                // MISS (universal – gilt für alle Spiele)
                if (dart.isMiss) {
                    box.innerText = "✖";
                    box.classList.add('is-miss');
                }
                // AROUND THE BOARD: Treffer = ✔
                else if (session.gameId === 'around-the-board') {
                    box.innerText = "✔";
                    box.style.color = 'var(--accent-color)';
                }
                // TRAINING / SHANGHAI: Zeige S/D/T (nur Buchstabe)
                else if (session.gameId === 'single-training' || session.gameId === 'shanghai') {
                    const map = { 1: 'S', 2: 'D', 3: 'T' };
                    box.innerText = map[dart.multiplier] || '?';
                }
                // CRICKET: Segment mit Bull-Sonderbehandlung
                else if (session.gameId === 'cricket') {
                    let text = dart.segment || '?';
                    if (text === 'S25') text = 'SB';
                    else if (text === 'D25') text = 'DB';
                    else if (text.startsWith('S')) text = text.substring(1); // S20 → 20
                    box.innerText = text;
                    // Farbe wenn Cricket-Target getroffen
                    const cricketTargets = [15,16,17,18,19,20,25];
                    if (cricketTargets.includes(dart.base)) {
                        box.style.color = 'var(--accent-color)';
                    }
                }
                // X01 / STANDARD: Segment anzeigen
                else {
                    let text = dart.segment || '?';
                    if (text === 'S25') text = '25';
                    else if (text === 'D25') text = 'Bull';
                    else if (text.startsWith('S')) text = text.substring(1); // S20 → 20
                    box.innerText = text;
                }
            } else { 
                box.innerText = ""; 
            }
        }
    },

    _renderMultiplayerScoreboard: function(session) {
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
                
                // FIX: Score-Auswahl für Halve It / Checkout Challenge
                let rawScore = p.currentResidual;
                if (session.gameId === 'halve-it' || session.gameId === 'checkout-challenge' || session.gameId === 'scoring-drill') {
                    rawScore = p.score;
                }
                
                let scoreVal = String(rawScore !== undefined ? rawScore : 0);
                
                // Bei Training/Shanghai/Halve It "Pkt" anhängen
                if(session.gameId !== 'x01' && session.gameId !== 'cricket') scoreVal += ' Pkt';
                
                let detailLine = "";
                if(session.gameId === 'x01') {
                     detailLine = (session.settings.mode === 'sets') ? `S:${p.setsWon} L:${p.legsWon}` : `Legs: ${p.legsWon}`;
                } else if (session.gameId === 'halve-it') {
                     // Optional: Zeige "Halbiert: X mal"
                     detailLine = `✂️ ${p.halvedCount || 0}`;
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