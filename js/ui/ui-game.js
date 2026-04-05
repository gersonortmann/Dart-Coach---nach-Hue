import { UIOverlay } from './ui-overlay.js';
import { State } from '../core/state.js';
import { GameEngine } from '../games/game-engine.js';
import { UI } from './ui-core.js';
import { Keyboard } from './ui-keyboard.js';
import { ResultScreen } from './ui-result.js';
import { TrainingManager } from '../core/training-manager.js';

// Box-Index (1-3) die zuletzt korrigiert wurde. Wird gelb dargestellt.
// Wird beim nächsten regulären Dart-Eingang zurückgesetzt.
let _correctedBox = null;

export const Game = {
    
    switchToGame: function() { 
        UI.showScreen('screen-game'); 
        
        // Korrektur-States beim Spielstart zurücksetzen
        _correctedBox = null;

        if (Keyboard && Keyboard.hideAll) Keyboard.hideAll();
        
        // Alle Spiele nutzen das Pro-Keypad
        Keyboard.setProLayout();
        
        this.updateGameDisplay(); 
		
		const btnRestart = document.getElementById('btn-restart');
        if (btnRestart) {
            if (TrainingManager && TrainingManager.isActive()) {
                btnRestart.style.display = 'none';
            } else {
                btnRestart.style.display = 'flex';
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
		else if (session.gameId === 'segment-master') {
			this._renderSegmentMaster(session);
		}
		else if (session.gameId === 'killer') {
			this._renderKiller(session);
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
                session.gameId === 'segment-master' ||
                session.gameId === 'cricket') {
                displayScore = p.score;
            }
            else if (session.gameId === 'killer') {
                if (p.finished) {
                    displayScore = '☠️';
                } else {
                    const lives = p.lives ?? 3;
                    displayScore = '❤️'.repeat(lives);
                }
            }

            // Sicherstellen, dass 0 angezeigt wird
            displayScore = (displayScore !== undefined && displayScore !== null) ? displayScore : 0;

            // Zusatz-Info (z.B. Sets/Legs bei X01)
            let metaInfo = "&nbsp;"; 

            if (session.gameId === 'x01') {
                if (session.settings.startScore === 170) {
                    // 170 Checkout-Training: "Runde X / Y"
                    metaInfo = `Runde: ${(p.legsWon || 0) + 1}/${session.settings.bestOf}`;
                } else if (session.settings.mode === 'sets') {
                    metaInfo = `S:${p.setsWon} | L:${p.legsWon}`;
                } else {
                    metaInfo = `Legs: ${p.legsWon}`;
                }
            } 
            else if (session.gameId === 'cricket') {
                 metaInfo = `MPR: ${p.liveMpr || '0.00'}`;
            } 
            else if (session.gameId === 'single-training' || session.gameId === 'around-the-board' || session.gameId === 'shanghai') {
                 // Beide nutzen Hit Rate
                 metaInfo = `Quote: ${p.liveHitRate || '0.0%'}`;
            } 
            else if (session.gameId === 'bobs27') {
                 metaInfo = `Hits: ${p.liveBobsHits || '0'}`;
            } 
            else if (session.gameId === 'scoring-drill') {
                 metaInfo = `PPT: ${p.livePpt || '00.0'}`;
            }
            else if (session.gameId === 'segment-master') {
                 metaInfo = `Quote: ${p.liveHitRate || '0.0%'}`;
            }
            else if (session.gameId === 'killer') {
                const zone = session.settings?.zone ?? 'double';
                const prefix = zone === 'double' ? 'D' : zone === 'triple' ? 'T' : '';
                const fieldLabel = prefix + p.killerNumber;
                const badge = p.finished ? '☠️' : (p.isKiller ? `🔪 ${fieldLabel}` : fieldLabel);
                metaInfo = badge;
            }
            else if (session.gameId === 'checkout-challenge') {
                 metaInfo = `Checks: ${p.checkoutsHit || '0'}`;
            }
            else if (session.gameId === 'halve-it') {
                 metaInfo = `Halbiert: ${p.halvedCount || '0'}`;
            }

            // Killer: Herz-Emojis brauchen kleinere Schrift
            const scoreStyle = (session.gameId === 'killer' && !p.finished)
                ? 'font-size:1rem; letter-spacing:1px;'
                : '';

            html += `
				<div class="player-header-card ${isActive ? 'active' : ''}">
					<div class="ph-col-left">
						<div class="ph-name">${p.name}</div>
					</div>
					
					<div class="ph-col-center">
						<div class="ph-legs">${metaInfo}</div>
					</div>
					
					<div class="ph-col-right">
						<div class="ph-score" style="${scoreStyle}">${displayScore}</div>
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
        
        // FIX: Inline-Styles auf der Checkout-Suggestion zurücksetzen.
        // Verschiedene Renderer (X01, Checkout Challenge, Halve It, Scoring Drill)
        // setzen opacity, color, transition, visibility etc. – ohne Reset
        // "leaken" diese Styles in den nächsten Renderer.
        const hint = document.getElementById('checkout-suggestion');
        if (hint) {
            hint.style.opacity = '';
            hint.style.color = '';
            hint.style.transition = '';
            hint.style.visibility = '';
        }
        // Auch turn-score-val Farbe zurücksetzen (wird von verschiedenen Renderern gefärbt)
        const tsVal = document.getElementById('turn-score-val');
        if (tsVal) tsVal.style.color = '';

        // game-target-val: Schriftgröße und Farbe zurücksetzen (Killer setzt beides dynamisch)
        const targetVal = document.getElementById('game-target-val');
        if (targetVal) {
            targetVal.style.fontSize = '';
            targetVal.style.color    = '';
        }

        let cricketContainer = document.getElementById('cricket-view-container');
        if (!cricketContainer) {
            cricketContainer = document.createElement('div');
            cricketContainer.id = 'cricket-view-container';
            const dartBox = document.getElementById('dart-display-container');
            box.insertBefore(cricketContainer, dartBox);
        }

        if (mode === 'cricket') {
            standardEls.forEach(el => el.classList.add('hidden'));
            cricketContainer.classList.remove('hidden');
            cricketContainer.style.display = '';   // flex via CSS
            box.classList.add('cricket-mode');
        } else {
            standardEls.forEach(el => el.classList.remove('hidden'));
            cricketContainer.classList.add('hidden');
            cricketContainer.style.display = 'none';
            box.classList.remove('cricket-mode');
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
            // Zeile geschlossen? (alle Spieler haben 3+ Marks)
            const allClosed = players.every(p => (p.marks[t] || 0) >= 3);
            const rowClass = allClosed ? 'cricket-row closed-row' : 'cricket-row';

            boardHtml += `<div class="${rowClass}" style="grid-template-columns: ${gridTemplate};">`;

            const getMarkSVG = (count) => {
                if (!count || count <= 0) return '';
                if (count >= 3) return `<svg class="mark-svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" fill="none" stroke-width="2"/><line x1="16" y1="8" x2="8" y2="16" stroke="currentColor" stroke-width="2"/><line x1="8" y1="8" x2="16" y2="16" stroke="currentColor" stroke-width="2"/></svg>`; 
                if (count === 2) return `<svg class="mark-svg" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2"/><line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2"/></svg>`; 
                return `<svg class="mark-svg" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2"/></svg>`; 
            };

            // Bestimmt die CSS-Klasse für die Farbe des Mark-Symbols
            const getMarkColorClass = (pIdx) => {
                if (allClosed) return 'mark-closed';
                const thisMarks = players[pIdx].marks[t] || 0;
                if (thisMarks >= 3) {
                    // Dieser Spieler hat geschlossen – kann er punkten (mind. 1 Gegner noch offen)?
                    const anyOpponentOpen = players.some((op, i) => i !== pIdx && (op.marks[t] || 0) < 3);
                    return anyOpponentOpen ? 'mark-scoring' : 'mark-closed';
                }
                // Dieser Spieler < 3: gibt es Gegner mit >= 3, die auf ihn punkten können?
                const opponentCanScore = players.some((op, i) => i !== pIdx && (op.marks[t] || 0) >= 3);
                return opponentCanScore ? 'mark-danger' : '';
            };

            if (players.length <= 2) {
                const cls0 = getMarkColorClass(0);
                boardHtml += `<div class="c-mark-cell ${activePIdx === 0 ? 'active-col' : ''} ${cls0}">${getMarkSVG(players[0].marks[t])}</div>`;
                boardHtml += `<div class="c-target-cell">${label}</div>`;
                if (players[1]) {
                    const cls1 = getMarkColorClass(1);
                    boardHtml += `<div class="c-mark-cell ${activePIdx === 1 ? 'active-col' : ''} ${cls1}" style="border-right:none;">${getMarkSVG(players[1].marks[t])}</div>`;
                } else {
                    boardHtml += `<div></div>`;
                }
            } else {
                boardHtml += `<div class="c-target-cell">${label}</div>`;
                players.forEach((p, idx) => {
                    const cls = getMarkColorClass(idx);
                    boardHtml += `<div class="c-mark-cell ${activePIdx === idx ? 'active-col' : ''} ${cls}" style="${idx === players.length-1 ? 'border-right:none;' : ''}">
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
        
        // FIX: Alle Inline-Styles zurücksetzen, die andere Renderer (Checkout Challenge,
        // Halve It, Scoring Drill) auf dem hint-Container hinterlassen.
        // Ohne diesen Reset bleibt z.B. opacity:0 von Checkout Challenge bestehen.
        hintContainer.style.opacity = '';
        hintContainer.style.color = '';
        hintContainer.style.transition = '';

        if(guide) { 
            hintContainer.innerText = guide;
            hintContainer.style.visibility = '';
            hintContainer.classList.remove('hidden'); 
        } else {
            // Platz reservieren aber unsichtbar → kein Layout-Sprung
            hintContainer.innerText = '\u00A0';
            hintContainer.classList.remove('hidden');
            hintContainer.style.visibility = 'hidden';
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
            
            // Zeitmaschine: Korrektur-Fenster → tempDarts noch 3
            if ((session.tempDarts || []).length === 3) currentRound--;
            if (currentRound > totalRounds) currentRound = totalRounds;
            if (currentRound < 1) currentRound = 1;

            hintContainer.classList.remove('hidden');
            hintContainer.innerText = `RUNDE ${currentRound} von ${totalRounds}`;
            hintContainer.style.color = "#888";
     

        // 3. Live Aufnahme-Punkte
        if (scoreLabel) scoreLabel.innerText = "AUFNAHME";
        const sdTurnScore = (session.tempDarts || []).reduce((a,b) => a + b.points, 0);
        if (scoreVal) {
            scoreVal.innerText = sdTurnScore > 0 ? sdTurnScore : '0';
            scoreVal.style.color = sdTurnScore > 0 ? 'var(--accent-color)' : '#666';
        }

        // Header Meta leeren
        const headerMeta = document.querySelector('.game-header-meta');
        if(headerMeta) headerMeta.innerText = "";

        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },

    _renderSegmentMaster: function(session) {
        this._prepareTargetBox('standard');
        const player = session.players[session.currentPlayerIndex];

        const headerScore = document.getElementById('game-player-score');
        if (headerScore) headerScore.innerText = player.score;

        const targetValEl     = document.getElementById('game-target-val');
        const labelEl         = document.getElementById('lbl-target-desc');
        const hintContainer   = document.getElementById('checkout-suggestion');
        const scoreLabel      = document.getElementById('lbl-turn-score');
        const scoreVal        = document.getElementById('turn-score-val');

        // Ziel-Anzeige: Segment + Zone
        const segLabel  = player.target === 25 ? 'BULL' : String(player.target);
        const zoneLabel = { any:'', single:' S', inner:' Inner', outer:' Outer',
                            double:' D', triple:' T' }[player.zone || 'any'] || '';
        if (targetValEl) targetValEl.innerText = segLabel + zoneLabel;
        if (labelEl) {
            const zoneFull = { any:'ALLE ZONEN', single:'SINGLE', inner:'INNER SINGLE',
                               outer:'OUTER SINGLE', double:'DOUBLE', triple:'TRIPLE' };
            labelEl.innerText = zoneFull[player.zone || 'any'] || 'ZIEL';
        }

        // Aufnahmen-Zähler (korrekt: completed turns + 1 für laufende)
        const completedTurns = player.turns.length;
        // Korrektur-Fenster: tempDarts=3 bedeutet Aufnahme gerade fertig → noch nicht inkrementiert
        const currentTurn = (session.tempDarts || []).length === 3
            ? completedTurns
            : completedTurns + 1;
        const limit = player.turnLimit || 10;

        if (hintContainer) {
            hintContainer.classList.remove('hidden');
            hintContainer.innerText = `AUFNAHME ${Math.min(currentTurn, limit)} / ${limit}`;
            hintContainer.style.color = '#888';
        }

        // Live Aufnahme-Punkte
        if (scoreLabel) scoreLabel.innerText = 'AUFNAHME';
        const smTurnScore = (session.tempDarts || []).reduce(
            (a, d) => a + (d._isHit ? (d.multiplier || 1) : 0), 0);
        if (scoreVal) {
            scoreVal.innerText = smTurnScore > 0 ? String(smTurnScore) : '0';
            scoreVal.style.color = smTurnScore > 0 ? 'var(--accent-color)' : '#666';
        }

        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },

    _renderKiller: function(session) {
        this._prepareTargetBox('standard');
        const player  = session.players[session.currentPlayerIndex];
        const zone    = session.settings?.zone   ?? 'double';
        const shield  = session.settings?.shield ?? false;

        const targetValEl   = document.getElementById('game-target-val');
        const labelEl       = document.getElementById('lbl-target-desc');
        const hintContainer = document.getElementById('checkout-suggestion');
        const scoreLabel    = document.getElementById('lbl-turn-score');
        const scoreVal      = document.getElementById('turn-score-val');
        const headerScore   = document.getElementById('game-player-score');

        if (headerScore) headerScore.innerText = '';  // Leben jetzt als ❤️ in Spielerkarte

        // Zonen-Labels
        const zoneLabel = { any:'ANY', single:'SINGLE', double:'DOUBLE', triple:'TRIPLE' }[zone] || 'DOUBLE';
        const zonePrefix = (num) => {
            if (zone === 'double') return `D${num}`;
            if (zone === 'triple') return `T${num}`;
            if (zone === 'single') return `S${num}`;
            return String(num); // any
        };

        // ── Fix 3: Aufnahmeergebnis in Targetbox zeigen (statt Popup-Overlay) ─
        if (session.targetBoxMessage && (session.tempDarts || []).length === 3) {
            const msg = session.targetBoxMessage;
            if (targetValEl) {
                targetValEl.innerText   = msg;
                targetValEl.style.color = '#ef4444';
                targetValEl.style.fontSize = msg.length <= 5 ? '7rem'
                    : msg.length <= 10 ? '4.5rem'
                    : msg.length <= 16 ? '3rem'
                    : '2.2rem';
            }
            if (labelEl) labelEl.innerText = 'AUFNAHME';
            if (hintContainer) hintContainer.classList.add('hidden');
            this._updateDartBoxes(session);
            this._renderMultiplayerScoreboard(session);
            return;
        }

        if (!player.isKiller) {
            // Phase 1: Eigenes Feld treffen
            if (targetValEl) {
                targetValEl.innerText      = zonePrefix(player.killerNumber);
                targetValEl.style.color    = '';
                targetValEl.style.fontSize = '';
            }
            if (labelEl) labelEl.innerText = `DEIN ${zoneLabel}`;
            if (hintContainer) {
                hintContainer.classList.remove('hidden');
                hintContainer.innerText    = 'WERDE KILLER 🔪';
                hintContainer.style.color  = '#f59e0b';
            }
        } else {
            // Phase 2: Gegner angreifen
            const victims = session.players.filter(p => !p.finished && p.id !== player.id);

            if (targetValEl) {
                targetValEl.style.color = '';
                if (victims.length === 0) {
                    targetValEl.innerText      = '🏆';
                    targetValEl.style.fontSize = '8rem';
                } else {
                    const targetStr = '🔪 ' + victims.map(p => zonePrefix(p.killerNumber)).join(' ');
                    targetValEl.innerText = targetStr;
                    targetValEl.style.fontSize = victims.length <= 2 ? '5rem'
                        : victims.length <= 3 ? '3.5rem'
                        : '2.5rem';
                }
            }
            if (labelEl) labelEl.innerText = `KILLER – ${zoneLabel}`;
            if (hintContainer) {
                if (victims.length > 0) {
                    const shieldHint = shield ? `  🛡️ ${zonePrefix(player.killerNumber)}` : '';
                    hintContainer.classList.remove('hidden');
                    hintContainer.innerText    = victims.map(p => `${zonePrefix(p.killerNumber)} ${p.name}`).join('  ') + shieldHint;
                    hintContainer.style.color  = '#ef4444';
                    hintContainer.style.fontSize = '0.85rem';
                } else {
                    hintContainer.classList.add('hidden');
                }
            }
        }

        if (scoreLabel) scoreLabel.innerText = 'KILLS';
        if (scoreVal) {
            scoreVal.innerText = String(player.kills || 0);
            scoreVal.style.color = player.kills > 0 ? '#ef4444' : '#666';
        }

        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },

	_renderHalveIt: function(session) {
        this._prepareTargetBox('standard');
        
        const player = session.players[session.currentPlayerIndex];
        
        // Zeitmaschine: Korrektur-Fenster hat turns.length +1, tempDarts noch 3
        let roundIdx = player.turns.length;
        if ((session.tempDarts || []).length === 3) roundIdx--;
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

        // 4. Info: Punkte in dieser Aufnahme (nur Treffer auf Ziel zählen)
        if (scoreLabel) scoreLabel.innerText = "AUFNAHME";
        const hiTurnHits  = (session.tempDarts || []).filter(d => d._isHit).length;
        const hiTurnScore = (session.tempDarts || []).reduce((sum, d) => sum + (d._isHit ? d.points : 0), 0);
        const scoreVal    = document.getElementById('turn-score-val');
        if (scoreVal) {
            scoreVal.innerText = hiTurnHits === 0 && (session.tempDarts||[]).length === 0 ? '0' : (hiTurnScore > 0 ? '+' + hiTurnScore : '0');
            scoreVal.style.color = hiTurnScore > 0 ? 'var(--accent-color)' : (hiTurnHits === 0 && (session.tempDarts||[]).length > 0 ? 'var(--miss-color)' : '#666');
        }

        const turnScoreBox = document.getElementById('target-row-score');
        if (turnScoreBox) turnScoreBox.style.visibility = 'visible';

        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },
	
	_renderCheckoutChallenge: function(session) {
        this._prepareTargetBox('standard');

        const player = session.players[session.currentPlayerIndex];
        const targets = session.targets;

        // Wenn _pendingCCReset vorliegt und noch kein Dart geworfen wurde,
        // die pending-Werte für die Anzeige verwenden (lazy apply noch nicht passiert).
        const pending = player._pendingCCReset;
        const dartsNow = (session.tempDarts || []).length;
        const displayTurnOnTarget = (pending && dartsNow === 0)
            ? pending.turnOnTarget
            : (player._turnOnTarget || 0);
        const displayStartRes = (pending && dartsNow === 0)
            ? pending.startOfTurnRes
            : ((player._startOfTurnRes !== undefined) ? player._startOfTurnRes : targets[0]);

        const currentTurnScore = (session.tempDarts || []).reduce((a,b) => a + b.points, 0);

        // Time Machine: nach Dart 3 den Snapshot aus _completedRoundDisplay nutzen
        // (deckt alle Fälle ab: Check, Bust, normales Rundenende)
        let startRes = displayStartRes;
        let currentRoundIndex = player._roundIdx || 0;

        if (dartsNow === 3 && player._completedRoundDisplay) {
            startRes          = player._completedRoundDisplay.startRes;
            currentRoundIndex = player._completedRoundDisplay.roundIdx;
        } else if (session.tempDarts && dartsNow === 3 && currentRoundIndex > 0) {
            // Fallback für ältere Pfade (Bust/Check ohne _completedRoundDisplay)
            const prevTarget = targets[currentRoundIndex - 1];
            const prevRes = prevTarget - currentTurnScore;
            if ((startRes - currentTurnScore) < 0 || prevRes <= 1) {
                startRes = prevTarget;
                currentRoundIndex--;
            }
        }

        const liveResidual = startRes - currentTurnScore;

        // UI Elemente
        const targetValEl = document.getElementById('game-target-val');
        const labelEl = document.getElementById('lbl-target-desc');
        const hintContainer = document.getElementById('checkout-suggestion');
        const headerScore = document.getElementById('game-player-score');
        
        // Live Aufnahme-Punkte im turn-score-container
        const ccScoreVal = document.getElementById('turn-score-val');
        const ccScoreLabel = document.getElementById('lbl-turn-score');
        const ccTurnPoints = (session.tempDarts || []).reduce((a,b) => a + b.points, 0);
        if (ccScoreLabel) ccScoreLabel.innerText = 'GEWORFEN';
        if (ccScoreVal) {
            ccScoreVal.innerText = ccTurnPoints > 0 ? ccTurnPoints : '0';
            ccScoreVal.style.color = ccTurnPoints > 0 ? 'var(--accent-color)' : '#666';
        }

        // 1. Anzeige Restwert (Große Zahl)
        if (targetValEl) {
             targetValEl.innerText = liveResidual;
        }

        // 2. Header Score
        if (headerScore) headerScore.innerText = player.score;
        
        // 3. Runden-Info + Aufnahme
        if (labelEl) {
            const displayRound = currentRoundIndex + 1;
            const maxTurns = session.settings.turnsPerTarget || 1;
            if (maxTurns > 1) {
                labelEl.innerText = `RUNDE ${displayRound}/${targets.length} · Aufn. ${displayTurnOnTarget + 1}/${maxTurns}`;
            } else {
                labelEl.innerText = `RUNDE ${displayRound} von ${targets.length}`;
            }
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
       
        // Time Machine: wenn Dart 3 ein Treffer war, hat handleInput currentResidual
        // bereits inkrementiert – wir zeigen noch den abgeschlossenen Zustand.
        const dartsNow  = (session.tempDarts || []).length;
        const lastDartHit = dartsNow === 3 && session.tempDarts[2]?._isHit;
        const displayIdx = lastDartHit
            ? Math.max(0, (player.currentResidual || 0) - 1)
            : (player.currentResidual || 0);

        let targetText = 'FINISH';
        if (displayIdx < session.targets.length) {
            const rawTarget = session.targets[displayIdx];
            targetText = (rawTarget === 25) ? 'BULL' : rawTarget;
        }

        targetValEl.innerText = targetText;
        
        const v = player.variant || 'full';
        const subMap = { 'full':'', 'single-inner':'Inner', 'single-outer':'Outer', 'double':'Double', 'triple':'Triple' };
        document.getElementById('lbl-target-desc').innerText = subMap[v] || 'Ziel';

        hintContainer.classList.remove('hidden');
        hintContainer.innerText = `Ziel ${displayIdx + 1} von ${session.targets.length}`;

        const currentTurnHits = (session.tempDarts || []).filter(d => d._isHit).length;
        const totalInTurn = dartsNow;
        scoreVal.innerText = totalInTurn === 0 ? '0' : currentTurnHits + ' Treffer';
        scoreVal.style.color = currentTurnHits > 0 ? 'var(--accent-color)' : (totalInTurn > 0 ? 'var(--miss-color)' : '#666');
        
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
		
        document.getElementById('lbl-target-desc').innerText = 'Ziel';

        // Zeitmaschine: während Korrektur-Fenster haben turns.length bereits +1
        let currentTargetIndex = player.turns.length;
        if ((session.tempDarts || []).length === 3) currentTargetIndex--;
        if (currentTargetIndex < 0) currentTargetIndex = 0;

        if (currentTargetIndex >= session.targets.length) {
            targetValEl.innerText = "ENDE";
        } else {
            let target = session.targets[currentTargetIndex];
            if (target === 25) target = "BULL";
            targetValEl.innerText = target;
        }

        hintContainer.classList.remove('hidden');
        hintContainer.innerText = `Runde: ${currentTargetIndex + 1} / ${session.targets.length}`;

        // Live Aufnahme-Punkte pro Dart (Multiplier-Summe: S=1, D=2, T=3)
        const stDartsThrown = (session.tempDarts || []).length;
        const stTurnPoints = (session.tempDarts || []).reduce((acc, d) => acc + (d.points || 0), 0);
        scoreVal.innerText = stDartsThrown === 0 ? '0' : (stTurnPoints > 0 ? stTurnPoints : '0');
        scoreVal.style.color = stTurnPoints > 0 ? 'var(--accent-color)' : (stDartsThrown > 0 ? 'var(--miss-color)' : '#666');

        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },

    _renderShanghai: function(session) {
        this._prepareTargetBox('standard');

        const player = session.players[session.currentPlayerIndex];
        const targetValEl = document.getElementById('game-target-val');
        const hintContainer = document.getElementById('checkout-suggestion');
       
        document.getElementById('lbl-target-desc').innerText = 'Ziel';

        // Zeitmaschine
        let currentTargetIndex = player.turns.length;
        if ((session.tempDarts || []).length === 3) currentTargetIndex--;
        if (currentTargetIndex < 0) currentTargetIndex = 0;

        if (currentTargetIndex >= session.targets.length) {
            targetValEl.innerText = "ENDE";
        } else {
            const t = session.targets[currentTargetIndex];
            targetValEl.innerText = t === 25 ? 'BULL' : t;
        }

        // Rundenanzahl im hint-Container UND im Label
        const shRound = Math.min(currentTargetIndex + 1, session.targets.length);
        document.getElementById('lbl-target-desc').innerText = `Runde ${shRound} / ${session.targets.length}`;
        hintContainer.innerText = '';
        hintContainer.classList.add('hidden');

        // Live Aufnahme-Punkte (nur Treffer auf aktuelles Ziel)
        const shTurnScore = (session.tempDarts || []).filter(d => d._isHit).reduce((a,b) => a + b.points, 0);
        const shDartsThrown = (session.tempDarts || []).length;
        const shScoreVal = document.getElementById('turn-score-val');
        if (shScoreVal) {
            shScoreVal.innerText = shDartsThrown === 0 ? '0' : (shTurnScore > 0 ? shTurnScore : '0');
            shScoreVal.style.color = shTurnScore > 0 ? 'var(--accent-color)' : (shDartsThrown > 0 ? 'var(--miss-color)' : '#666');
        }
        
        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },

    _renderBobs27: function(session) {
        this._prepareTargetBox('standard');
        
        const player = session.players[session.currentPlayerIndex];
        const targetValEl   = document.getElementById('game-target-val');
        const hintContainer = document.getElementById('checkout-suggestion');
        const labelEl       = document.getElementById('lbl-target-desc');
        const scoreLabelEl  = document.getElementById('lbl-turn-score');
        const scoreValEl    = document.getElementById('turn-score-val');
        const turnScoreCont = document.getElementById('turn-score-container');

        if (labelEl) labelEl.innerText = 'Doppel';

        // Turn-score-container sicherstellen (wird von _prepareTargetBox gesteuert)
        if (turnScoreCont) turnScoreCont.style.display = '';

        // Ziel ermitteln: wenn 3 Darts geworfen wurden (Overlay), ist turns.length
        // bereits +1 → eine Runde zurückgehen
        const dartsThrown = (session.tempDarts || []).length;
        const roundIdx = dartsThrown === 3
            ? player.turns.length - 1   // Runde gerade beendet
            : player.turns.length;       // Runde läuft noch

        if (player.isEliminated) {
            targetValEl.innerText = 'BUST';
            targetValEl.style.color = 'var(--miss-color)';
        } else if (roundIdx >= session.targets.length) {
            targetValEl.innerText = 'ENDE';
            targetValEl.style.color = '';
        } else {
            const t = session.targets[roundIdx];
            targetValEl.innerText = t === 25 ? 'BULL' : 'D' + t;
            targetValEl.style.color = '';
        }

        if (hintContainer) {
            hintContainer.classList.remove('hidden');
            const display = Math.min(roundIdx + 1, session.targets.length);
            hintContainer.innerText = `Runde ${display} / ${session.targets.length}`;
        }

        // ── Live-Score: vorläufige Punkteänderung ────────────────────────────
        // Zeigt die bisher gesammelten Trefferpunkte. Erst nach Dart 3 steht
        // fest ob 0 Treffer → negativ. Bis dahin: +X (offen).
        if (scoreValEl && roundIdx < session.targets.length) {
            const t = session.targets[roundIdx];
            const dblValue = t * 2;
            const hits = (session.tempDarts || []).filter(d => d._isHit).length;
            const provisional = hits * dblValue;

            if (dartsThrown >= 3) {
                // Runde abgeschlossen – finaler Wert
                const finalVal = hits > 0 ? '+' + (hits * dblValue) : '-' + dblValue;
                scoreValEl.innerText = finalVal;
                scoreValEl.style.color = hits > 0 ? 'var(--accent-color)' : 'var(--miss-color)';
            } else if (dartsThrown === 0) {
                scoreValEl.innerText = '0';
                scoreValEl.style.color = '#666';
            } else {
                scoreValEl.innerText = '+' + provisional + ' ⌛';
                scoreValEl.style.color = provisional > 0 ? 'var(--accent-color)' : '#888';
            }
        }

        this._updateDartBoxes(session);
        this._renderMultiplayerScoreboard(session);
    },

    /**
     * Aktualisiert die 3 Dart-Boxen.
     *
     * Unterstützt _heldDarts: Darts nach einer Korrektur bleiben visuell
     * in ihrer Originalposition bis der neue Dart eingegeben wurde.
     *
     * CSS-Klassen:
     *   .dart-hit       → grüner Rahmen  (Treffer auf Ziel)
     *   .dart-miss      → roter Rahmen   (Miss oder falsches Feld)
     *   .dart-corrected → gelber Rahmen  (zuletzt korrigiert / Lücke)
     *   .dart-held      → gedimmter Stil (gehalten, noch nicht re-applied)
     */
    _updateDartBoxes: function(session) {
        const player    = session.players[session.currentPlayerIndex];
        const tempDarts = session.tempDarts || [];
        const totalNow  = tempDarts.length;
        const held      = GameEngine.getHeldDarts();

        // Korrektes Zielfeld für Bob's 27 (auch während Overlay/nach Turn-Ende)
        let bobs27Target = null;
        if (session.gameId === 'bobs27') {
            const roundIdx = totalNow === 3
                ? player.turns.length - 1   // Runde gerade beendet
                : player.turns.length;       // Runde läuft noch
            if (roundIdx >= 0 && roundIdx < (session.targets || []).length) {
                bobs27Target = session.targets[roundIdx];
            }
        }

        for (let i = 1; i <= 3; i++) {
            const box = document.getElementById(`dart-box-${i}`);
            if (!box) continue;

            // Reset
            box.classList.remove('filled', 'is-miss', 'dart-hit', 'dart-miss', 'dart-corrected', 'dart-held');
            box.style.color  = '';
            box.style.cursor = '';
            box.title        = '';
            box.onclick      = null;
            box.innerHTML    = '';

            // Dart-Quelle bestimmen
            let dart   = null;
            let isHeld = false;

            if (held) {
                if (i < held.afterPosition) {
                    dart = tempDarts[i - 1];                         // vor Lücke: live
                } else if (i === held.afterPosition) {
                    dart = null;                                      // Lücke: Korrekturbox
                } else {
                    dart   = held.darts[i - held.afterPosition - 1]; // nach Lücke: gehalten
                    isHeld = !!dart;
                }
            } else {
                dart = tempDarts[i - 1];
            }

            // Korrektur-Lücke – gelb, leer
            if (_correctedBox === i && !dart) {
                box.classList.add('dart-corrected');
                box.title = 'Warte auf neuen Dart…';
                continue;
            }

            if (!dart) continue;

            // Gefüllte Box
            box.classList.add('filled');
            if (isHeld) box.classList.add('dart-held');

            // Klick-Handler (nur für live Darts, nicht Held, nicht Bot)
            if (!isHeld && !player.isBot) {
                const boxIndex  = i;
                const dartCount = held ? held.afterPosition : totalNow;
                box.style.cursor = 'pointer';
                box.title = `Pfeil ${i} korrigieren`;
                box.onclick = () => {
                    _correctedBox = null;
                    GameEngine.undoSpecificDart(boxIndex);
                };
            }

            // Korrektur-Markierung auf dem nun gefüllten Slot
            if (_correctedBox === i) box.classList.add('dart-corrected');

            // Anzeige & Rahmenfarbe
            if (dart.isMiss) {
                box.innerText = '✖';
                box.classList.add('is-miss', 'dart-miss');
            }
            else if (session.gameId === 'bobs27') {
                box.innerText = _formatSegment(dart);
                const isHit = bobs27Target !== null
                    && dart.multiplier === 2
                    && dart.base === bobs27Target;
                box.classList.add(isHit ? 'dart-hit' : 'dart-miss');
            }
            else if (session.gameId === 'around-the-board') {
                box.innerText = _formatSegment(dart);
                box.classList.add(dart._isHit ? 'dart-hit' : 'dart-miss');
            }
            else if (session.gameId === 'single-training' || session.gameId === 'shanghai') {
                // Segment-Format wie ATB: 20, D20, T20 (kein S-Prefix)
                box.innerText = _formatSegment(dart);
                box.classList.add(dart._isHit ? 'dart-hit' : 'dart-miss');
            }
            else if (session.gameId === 'cricket') {
                let text = dart.segment || '?';
                if      (text === 'S25') text = 'SB';
                else if (text === 'D25') text = 'DB';
                else if (text.startsWith('S')) text = text.substring(1);
                box.innerText = text;
                box.classList.add(dart._isHit ? 'dart-hit' : 'dart-miss');
            }
            else {
                // X01, checkout-challenge, halve-it, scoring-drill
                box.innerText = _formatSegment(dart);
                if (dart._isHit !== undefined) {
                    box.classList.add(dart._isHit ? 'dart-hit' : 'dart-miss');
                }
            }
        }

        // Korrektur-Markierung nach abgeschlossenem Turn zurücksetzen
        if (_correctedBox !== null && totalNow === 3 && !held) {
            _correctedBox = null;
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
                if (session.gameId === 'halve-it' || session.gameId === 'checkout-challenge' || session.gameId === 'scoring-drill' || session.gameId === 'segment-master') {
                    rawScore = p.score;
                } else if (session.gameId === 'killer') {
                    rawScore = p.lives ?? 3;
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

    /**
     * Markiert eine Dartbox als korrigiert (gelb).
     * Wird von GameEngine.undoSpecificDart() aufgerufen.
     * Die Markierung bleibt bis zum nächsten regulären Dart-Input.
     */
    markDartBoxCorrected: function(boxIndex) {
        _correctedBox = boxIndex; // null = reset, 1-3 = highlight
        const session = State.getActiveSession();
        if (session) this._updateDartBoxes(session);
    },

    /**
     * Zeigt einen Countdown-Balken unter den Dartboxen.
     * Der Platzhalter-Container existiert immer (transparent wenn inaktiv),
     * damit kein Layout-Shift beim Ein-/Ausblenden entsteht.
     */
    showCorrectionCountdown: function(durationMs, onExpire) {
        this.cancelCorrectionCountdown();

        // Platzhalter holen oder anlegen
        let bar = document.getElementById('correction-countdown');
        if (!bar) {
            const dartContainer = document.getElementById('dart-display-container');
            if (!dartContainer) { if (onExpire) onExpire(); return; }
            bar = document.createElement('div');
            bar.id = 'correction-countdown';
            bar.style.cssText = 'width:100%; height:4px; background:#333; border-radius:2px; margin-top:6px; overflow:hidden; visibility:hidden;';
            const fill = document.createElement('div');
            fill.id = 'correction-countdown-fill';
            fill.style.cssText = 'height:100%; width:100%; background:var(--accent-color); border-radius:2px;';
            bar.appendChild(fill);
            dartContainer.after(bar);
        }

        const fill = document.getElementById('correction-countdown-fill');
        if (!fill) { if (onExpire) onExpire(); return; }

        // Sichtbar machen und auf 100% zurücksetzen (ohne Transition)
        bar.style.visibility = 'visible';
        fill.style.transition = 'none';
        fill.style.width = '100%';

        // Transition starten (zwei rAF-Frames warten)
        requestAnimationFrame(() => requestAnimationFrame(() => {
            fill.style.transition = `width ${durationMs}ms linear`;
            fill.style.width = '0%';
        }));

        const timerId = setTimeout(() => {
            if (bar) bar.style.visibility = 'hidden';
            if (fill) { fill.style.transition = 'none'; fill.style.width = '100%'; }
            if (onExpire) onExpire();
        }, durationMs);

        bar.dataset.timerId = timerId;
    },

    cancelCorrectionCountdown: function() {
        const bar = document.getElementById('correction-countdown');
        if (bar) {
            clearTimeout(parseInt(bar.dataset.timerId));
            bar.style.visibility = 'hidden';
            const fill = document.getElementById('correction-countdown-fill');
            if (fill) { fill.style.transition = 'none'; fill.style.width = '100%'; }
            delete bar.dataset.timerId;
        }
    },

    showOverlay: function(content, type) {
        UIOverlay.show(content, type);
    },

    showResult: function() { ResultScreen.show(); },
    renderDetails: function(playerId) { ResultScreen.renderDetails(playerId); },
    selectResultPlayer: function(playerId) {
        ResultScreen.renderPlayerDashboard(playerId, State.getActiveSession());
    },
};
/**
 * Formatiert ein Dart-Segment für die Anzeige in den Dartboxen.
 * Singles werden ohne S-Prefix angezeigt: S20 → 20, D20 → D20, T20 → T20
 * Bull-Sonderfälle: S25 → 25, D25 → Bull
 */
function _formatSegment(dart) {
    if (!dart) return '?';
    const seg = dart.segment || '';
    if (seg === 'S25') return '25';
    if (seg === 'D25') return 'Bull';
    if (seg.startsWith('S')) return seg.substring(1); // S20 → 20
    return seg; // D20, T20, etc. bleiben unverändert
}