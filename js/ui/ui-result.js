import { State } from '../core/state.js';
import { GameEngine } from '../games/game-engine.js';
import { UI } from './ui-core.js';
import { HueService } from '../core/hue-service.js';
import { StatsBoard } from './ui-stats-board.js';
import { TrainingManager } from '../core/training-manager.js';

let resultChartInstance = null;

export const ResultScreen = {
    
    show: function() {
        const session = State.getActiveSession(); 
        if(!session) return;
        
        const container = document.getElementById('result-container');
        if(!container) return;
        
        container.style.position = 'relative'; 

        // 1. GEWINNER & HEADER LOGIK
        let winner = session.players[0];
        let headerHtml = '';

        // --- A) LOGIK FÜR X01 ---
        if (session.gameId === 'x01') {
            const isSets = session.settings.mode === 'sets';
            const sortedPlayers = [...session.players].sort((a,b) => {
                if(isSets) return b.setsWon - a.setsWon;
                return b.legsWon - a.legsWon;
            });
            winner = sortedPlayers[0];
            
            const scoreString = isSets 
                ? session.players.map(p => p.setsWon).join(" : ")
                : session.players.map(p => p.legsWon).join(" : ");

            headerHtml = `
                <div class="result-header">
                    <h1 style="font-size: 5rem; margin: 10px 0; font-weight: 900; font-family:'Permanent Marker', cursive; color: var(--text-color);">${scoreString}</h1>
                    <div class="winner-showcase compact">
                        <div class="winner-name" style="color:var(--accent-color);">${winner.name}</div>
                        <div class="winner-crown">👑</div>
                    </div>
                </div>
            `;
        }
        
        // --- B) LOGIK FÜR BOB'S 27 ---
        else if (session.gameId === 'bobs27') {
            const sortedPlayers = [...session.players].sort((a,b) => {
                if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
                return b.currentResidual - a.currentResidual;
            });
            winner = sortedPlayers[0];

            const isSurvivor = !winner.isEliminated && winner.currentResidual >= 0;
            const icon = isSurvivor ? '👑' : '☠️';
            const scoreColor = isSurvivor ? 'var(--accent-color)' : 'var(--miss-color)';
            
            headerHtml = `
                <div class="result-header">
                    <div class="winner-showcase">
                        <div class="winner-crown" style="font-size:4rem; filter: drop-shadow(0 0 10px ${scoreColor});">${icon}</div>
                        <div class="winner-name" style="color:#fff;">${winner.name}</div>
                        <div style="font-family:'Permanent Marker', cursive; font-size:3.5rem; color:${scoreColor}; margin-top:5px;">
                            ${winner.currentResidual}
                        </div>
                        <div class="winner-sub">Punkte</div>
                    </div>
                </div>
            `;
        }
        
        else if (session.gameId === 'checkout-challenge' || session.gameId === 'halve-it' || session.gameId === 'scoring-drill') {
            // Sortierung nach Score (höchster gewinnt)
            const sortedPlayers = [...session.players].sort((a,b) => b.score - a.score);
            winner = sortedPlayers[0];

            headerHtml = `
                <div class="result-header">
                    <div class="winner-showcase">
                        <div class="winner-crown">👑</div>
                        <div class="winner-name">${winner.name}</div>
                        <div class="winner-sub" style="color:var(--accent-color);">${winner.score} Punkte</div>
                    </div>
                </div>
            `;
        }
        
        // --- C) TRAINING, CRICKET & SHANGHAI ---
        else {
            const sortedPlayers = [...session.players].sort((a,b) => b.currentResidual - a.currentResidual);
            winner = sortedPlayers[0];

            headerHtml = `
                <div class="result-header">
                    <div class="winner-showcase">
                        <div class="winner-crown">👑</div>
                        <div class="winner-name">${winner.name}</div>
                        <div class="winner-sub">${winner.currentResidual} Punkte</div>
                    </div>
                </div>
            `;
        }

        // 2. HTML ZUSAMMENBAUEN
        // WICHTIG: Wir geben den Buttons hier schon IDs, konfigurieren sie aber gleich erst
        let html = `
            <div class="result-actions-top">
                <button id="btn-result-menu" class="btn-compact secondary">
                    💾 Speichern & Beenden
                </button>
                <button id="btn-result-rematch" class="btn-compact primary">
                    🔄 Revanche
                </button>
            </div>

            ${headerHtml}

            <div class="result-tabs" id="result-tabs-container"></div>

            <div id="result-content-area" class="stats-main-dashboard" style="width:100%;"></div>
            
            <div style="margin-bottom: 40px;"></div>
        `;
        
        container.innerHTML = html;

        // 3. TABS ERSTELLEN
        const tabContainer = document.getElementById('result-tabs-container');
        session.players.forEach((p) => {
            const btn = document.createElement('div');
            btn.className = 'result-tab-btn';
            btn.innerHTML = p.name;
            btn.onclick = () => this.renderPlayerDashboard(p.id, session);
            btn.dataset.pid = p.id;
            tabContainer.appendChild(btn);
        });

        // 4. BUTTON LOGIK KONFIGURIEREN (HIER WAR DER FEHLER)
        // Wir prüfen SOFORT, nicht erst beim Klick
        
        const btnMenu = document.getElementById('btn-result-menu');
        const btnRematch = document.getElementById('btn-result-rematch');
        const isTrainingPlan = TrainingManager.isActive();

        if (isTrainingPlan) {
             // --- PLAN MODUS ---
             // Wir ändern Text und Verhalten der existierenden Buttons

             // LINKS: PLAN ABBRECHEN
             btnMenu.innerHTML = "PLAN ABBRECHEN ✕";
             btnMenu.onclick = async () => {
                 if(!UI.isGuest()) await this._saveToHistory(session);
                 TrainingManager.finishPlan(); 
             };

             // RECHTS: NÄCHSTE ÜBUNG (oder Plan fertig)
             const status = TrainingManager.getStatus();
             // Prüfen: War das der letzte Block?
             if (status && status.blockIndex >= status.totalBlocks - 1) {
                 btnRematch.innerHTML = "PLAN ABSCHLIESSEN ✅";
                 btnRematch.onclick = async () => {
                     if(!UI.isGuest()) await this._saveToHistory(session);
                     TrainingManager.finishPlan();
                 };
             } else {
                 btnRematch.innerHTML = "NÄCHSTE ÜBUNG ▶";
                 btnRematch.onclick = async () => {
                     if(!UI.isGuest()) await this._saveToHistory(session);
                     TrainingManager.nextBlock();
                 };
             }
             
             // OPTIONAL: WIEDERHOLEN BUTTON
             // Da deine UI nur 2 Buttons oben vorsieht (Actions Top), haben wir keinen Platz für einen dritten.
             // Du hattest "Wiederholen" gewünscht. Wir könnten den "Abbrechen"-Button dafür nutzen
             // oder einen dritten Button einfügen.
             // VORSCHLAG: Wir fügen "Wiederholen" als kleinen Text-Link oder dritten Button hinzu,
             // ODER wir lassen es so (Weiter / Abbruch).
             // Wenn du "Wiederholen" statt "Abbrechen" willst:
             /*
             btnMenu.innerHTML = "↺ WIEDERHOLEN";
             btnMenu.onclick = async () => {
                 if(!UI.isGuest()) await this._saveToHistory(session);
                 TrainingManager.restartCurrentBlock();
             };
             */

        } else {
             // --- NORMALER MODUS ---
             
             btnMenu.onclick = async () => {
                const isGuest = UI.isGuest(); 
                if(!isGuest) {
                    btnMenu.innerText = "Speichert...";
                    btnMenu.disabled = true;
                    await this._saveToHistory(session);
                }
                setTimeout(() => { UI.showScreen('screen-dashboard'); }, 800);
             };
             
             btnRematch.onclick = async () => {
                if(!UI.isGuest()) await this._saveToHistory(session); 
                this.handleRematch(session);
             };
        }

        // 5. INITIAL VIEW
        this.renderPlayerDashboard(winner.id, session);
        UI.showScreen('screen-result');
    },

    // --- NEUE METHODE ZUM SPEICHERN ---
    _saveToHistory: async function(session) {
        const promises = session.players.map(async p => {
            const stats = GameEngine.getResultData(session, p);
            
            // WICHTIG: Den Haupt-Score für die Statistik-Liste extrahieren
            let totalScore = 0;
            if (stats.summary) {
                if (stats.summary.totalScore !== undefined) {
                    totalScore = stats.summary.totalScore; // X01
                } else if (stats.summary.score !== undefined) {
                    totalScore = stats.summary.score; // Shanghai, Training, Cricket
                } else if (stats.summary.finalScore !== undefined) {
                    totalScore = stats.summary.finalScore; // Bob's 27
                }
            }

            const historyEntry = {
                date: Date.now(),
                game: session.gameId,
                settings: session.settings,
                stats: stats, 
                totalScore: totalScore, // <--- DIESE ZEILE HAT GEFEHLT!
                turns: p.turns 
            };

            if (State.addToHistory) {
                await State.addToHistory(p.id, historyEntry);
            }
        });
        
        await Promise.all(promises);
    },

    handleRematch: function(oldSession) {
        const currentOrderIds = oldSession.players.map(p => p.id);
        if (currentOrderIds.length > 1) {
            const first = currentOrderIds.shift();
            currentOrderIds.push(first);
        }
        GameEngine.startGame(oldSession.gameId, currentOrderIds, oldSession.settings);
    },

    renderPlayerDashboard: function(playerId, session) {
        document.querySelectorAll('.result-tab-btn').forEach(b => {
            if(b.dataset.pid === playerId) b.classList.add('active');
            else b.classList.remove('active');
        });
		
		HueService.setMood('match-won');

        const container = document.getElementById('result-content-area');
        if(!container) return;
        
        container.innerHTML = ''; 
        
        if (session.gameId === 'bobs27') {
            this._renderBobsDashboard(container, playerId, session); 
        } else if (session.gameId === 'single-training' || session.gameId === 'shanghai') {
            this._renderTrainingDashboard(container, playerId, session);
        } else if (session.gameId === 'cricket') {
            this._renderCricketDashboard(container, playerId, session); 
		} else if (session.gameId === 'checkout-challenge') {
            this._renderCheckoutChallengeDashboard(container, playerId, session);
		} else if (session.gameId === 'halve-it') {
            this._renderHalveItDashboard(container, playerId, session);
		} else if (session.gameId === 'around-the-board') {
            this._renderAtbDashboard(container, playerId, session);
		} else if (session.gameId === 'scoring-drill') {
			this._renderScoringDrillDashboard(container, playerId, session);
        } else {
            this._renderX01Dashboard(container, playerId, session);
        }
    },

    // --- DASHBOARDS ---

    _renderScoringDrillDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        container.innerHTML = `
            <div class="stats-hero-grid" style="margin-bottom: 20px;">
                <div class="hero-card accent">
                    <span class="hero-label">Total Score</span>
                    <span class="hero-val">${data.summary.totalScore}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Average</span>
                    <span class="hero-val">${data.summary.avg}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Darts</span>
                    <span class="hero-val">${data.summary.dartsThrown} / ${data.summary.limit}</span>
                </div>
            </div>

            <div class="grid-triple-result">
                <div class="chart-wrapper-big">
                    <canvas id="scoringDrillChart"></canvas>
                </div>
                <div class="heatmap-container" id="result-heatmap-box">
                    ${StatsBoard.generateSVG(350)}
                </div>
                <div class="score-distribution">
                    <h4 style="margin-bottom:25px; letter-spacing:1px; color:#888; text-transform:uppercase; font-size:0.9rem;">POWER SCORES</h4>
                    <div class="dist-bar"><span>100+</span> <strong>${data.powerScores.ton}</strong></div>
                    <div class="dist-bar"><span>140+</span> <strong>${data.powerScores.ton40}</strong></div>
                    <div class="dist-bar gold"><span>180</span> <strong>${data.powerScores.max}</strong></div>
                </div>
            </div>
        `;

        setTimeout(() => {
            this.applyHeatmap(data.heatmap);
            
            const ctx = document.getElementById('scoringDrillChart');
            if (ctx && data.chart) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.chart.labels,
                        datasets: data.chart.datasets 
                    },
                    options: {
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { 
                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                            x: { display: true, ticks: { color: '#888', font: {size: 10} } }
                        }
                    }
                });
            }
        }, 0);
    },
	
	_renderHalveItDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        container.innerHTML = `
            <div class="stats-hero-grid" style="margin-bottom: 20px;">
                <div class="hero-card accent">
                    <span class="hero-label">Endstand</span>
                    <span class="hero-val">${data.summary.totalScore}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Halbiert</span>
                    <span class="hero-val" style="color:var(--miss-color)">${data.summary.halvings}x</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Perfekte Runden</span>
                    <span class="hero-val" style="color:#eab308">${data.summary.perfectRounds}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Trefferquote</span>
                    <span class="hero-val">${data.summary.hitRate}</span>
                </div>
            </div>

            <div class="grid-triple-result">
                <div class="chart-wrapper-big">
                    <canvas id="halveItChart"></canvas>
                </div>
                <div class="heatmap-container" id="result-heatmap-box">
                    ${StatsBoard.generateSVG(350)}
                </div>
            </div>
        `;

        setTimeout(() => {
            this.applyHeatmap(data.heatmap);
            
            const ctx = document.getElementById('halveItChart');
            if (ctx && data.chart) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.chart.labels,
                        datasets: data.chart.datasets 
                    },
                    options: {
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { 
                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                            x: { display: true, ticks: { color: '#888', font: {size: 10} } }
                        }
                    }
                });
            }
        }, 0);
    },
	
	_renderCheckoutChallengeDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        container.innerHTML = `
            <div class="stats-hero-grid" style="margin-bottom: 20px;">
                <div class="hero-card accent">
                    <span class="hero-label">Gesamtpunkte</span>
                    <span class="hero-val">${data.summary.totalScore}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Quote</span>
                    <span class="hero-val">${data.summary.checkoutRate}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Checkouts</span>
                    <span class="hero-val">${data.summary.checkoutsHit} / ${data.summary.checkoutsTotal}</span>
                </div>
            </div>

            <div class="grid-triple-result">
                <div class="chart-wrapper-big">
                    <canvas id="checkoutResultChart"></canvas>
                </div>
                
                <div class="heatmap-container" id="result-heatmap-box">
                    ${StatsBoard.generateSVG(350)}
                </div>
            </div>
        `;

        setTimeout(() => {
            // A) Heatmap aktivieren
            this.applyHeatmap(data.heatmap);

            // B) Chart manuell rendern (für rote Farbe)
            const ctx = document.getElementById('checkoutResultChart');
            if (ctx && data.chart) {
                // Wir nehmen die Datasets direkt aus der Strategy (dort haben wir Farbe & Daten definiert)
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: data.chart.labels,
                        datasets: data.chart.datasets 
                    },
                    options: {
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: { 
                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                            x: { display: true, ticks: { color: '#888', font: {size: 10} } }
                        }
                    }
                });
            }
        }, 0);
    },
	
	_renderAtbDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        // Matrix HTML bauen
        let matrixHTML = '<div style="display:grid; grid-template-columns: repeat(7, 1fr); gap:6px; margin: 20px 0;">';
        
        if(data.matrix) {
            data.matrix.forEach(item => {
                // Farben based on heatClass
                let bg = 'rgba(255,255,255,0.05)';
                let color = '#fff';
                
                if (item.heatClass === 'heat-high') { bg = 'rgba(0, 210, 106, 0.2)'; color = '#00d26a'; }
                else if (item.heatClass === 'heat-medium') { color = '#fff'; }
                else { bg = 'rgba(248, 113, 113, 0.15)'; color = '#f87171'; } // Rot

                matrixHTML += `
                    <div style="background:${bg}; border-radius:6px; padding:8px 2px; text-align:center;">
                        <div style="font-size:0.7rem; color:#888; margin-bottom:2px;">${item.label}</div>
                        <div style="font-size:1.1rem; font-weight:bold; color:${color};">${item.val}</div>
                    </div>
                `;
            });
        }
        matrixHTML += '</div>';

        container.innerHTML = `
            <div class="stats-hero-grid" style="margin-bottom: 20px;">
                <div class="hero-card accent"><span class="hero-label">Darts Total</span><span class="hero-val">${data.summary.score}</span></div>
                <div class="hero-card"><span class="hero-label">Trefferquote</span><span class="hero-val">${data.summary.hitRate}</span></div>
                <div class="hero-card"><span class="hero-label">Treffer</span><span class="hero-val">${data.summary.hits}</span></div>
                <div class="hero-card"><span class="hero-label">Fehlwürfe</span><span class="hero-val" style="color:var(--miss-color)">${data.summary.misses}</span></div>
            </div>

            <h4 style="margin-bottom:5px; color:#c4c4c4; letter-spacing:1px; font-size:0.8rem; text-transform:uppercase;">Benötigte Darts pro Ziel</h4>
            ${matrixHTML}
            
            <div style="text-align:center; color:#666; font-size:0.9rem; margin-top:20px;">
                ${player.finished ? '✅ Kurs erfolgreich beendet' : '❌ Vorzeitig beendet'}
            </div>
        `;
        
        // Kein Chart-Render Aufruf mehr nötig!
    },
	
	_renderCricketDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        if (!data || !data.summary) {
            container.innerHTML = '<div style="padding:20px; text-align:center;">Keine Daten verfügbar</div>';
            return;
        }

        container.innerHTML = `
            <div class="stats-hero-grid" style="margin-bottom: 20px;">
                <div class="hero-card accent">
                    <span class="hero-label">MPR</span>
                    <span class="hero-val">${data.summary.mpr}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Punkte</span>
                    <span class="hero-val" style="color:var(--highlight-color);">${data.summary.score}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Marks Total</span>
                    <span class="hero-val">${data.summary.totalMarks}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Runden</span>
                    <span class="hero-val">${data.summary.rounds}</span>
                </div>
            </div>

            <div class="grid-triple-result">
                <div class="chart-wrapper-big">
                    <canvas id="resultTrendChart"></canvas>
                </div>
                
                <div class="heatmap-container" id="result-heatmap-box">
                    ${StatsBoard.generateSVG(350)}
                </div>

                <div class="score-distribution">
                    <h4 style="margin-bottom:25px; letter-spacing:1px; color:#888; text-transform:uppercase; font-size:0.9rem;">TREFFER QUALITÄT</h4>
                    <div class="dist-bar">
                        <span>Singles (1 Mark)</span> 
                        <strong>${data.distribution.singles}</strong>
                    </div>
                    <div class="dist-bar">
                        <span>Doubles (2 Marks)</span> 
                        <strong>${data.distribution.doubles}</strong>
                    </div>
                    <div class="dist-bar gold">
                        <span>Triples (3 Marks)</span> 
                        <strong>${data.distribution.triples}</strong>
                    </div>
                </div>
            </div>
        `;

        setTimeout(() => {
            this.renderChart(data.chart, "Punkte Verlauf");
            this.applyHeatmap(data.heatmap);
        }, 0);
    },
    
    _renderBobsDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);
        if (!data) return;
        const sum = data.summary;
        
        container.innerHTML = `
            <div class="stats-hero-grid" style="padding: 0 5px; margin-bottom: 20px;">
                <div class="hero-card accent">
                    <span class="hero-label">Final Score</span>
                    <span class="hero-val" style="color:${sum.statusClass === 'res-win' ? 'var(--accent-color)' : 'var(--miss-color)'}">${sum.finalScore}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Max Score</span>
                    <span class="hero-val" style="color:#eab308;">${sum.maxScore}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Treffer</span>
                    <span class="hero-val">${sum.totalHits}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Runden</span>
                    <span class="hero-val">${sum.roundsPlayed} / 21</span>
                </div>
            </div>

            <div class="chart-wrapper-big" style="background: rgba(255,255,255,0.03); border: 1px solid #333; border-radius: 12px; padding: 15px; margin-bottom:20px; height: 300px;">
                <canvas id="bobsResultChart"></canvas>
            </div>

            <div class="stats-history-scroll-area" style="padding: 10px;">
                <h4 style="margin-bottom:15px; color:#888; text-transform:uppercase; font-size:0.8rem;">Rundenverlauf</h4>
                <div class="bobs-list">
                    ${data.history.map(row => `
                        <div style="display:grid; grid-template-columns: 50px 1fr 1fr 1fr; align-items:center; padding:10px; border-bottom:1px solid #333; font-size:0.9rem;">
                            <div style="font-weight:bold; color:#fff;">${row.target}</div>
                            <div style="text-align:center;">
                                <span style="background:${row.hits > 0 ? 'rgba(0,210,106,0.1)' : 'rgba(255,0,0,0.1)'}; color:${row.hits > 0 ? 'var(--accent-color)' : 'var(--miss-color)'}; padding:2px 8px; border-radius:4px; font-weight:bold;">
                                    ${row.hits === 0 ? 'MISS' : row.hits + ' HIT'}
                                </span>
                            </div>
                            <div style="text-align:right; color:${row.change > 0 ? '#fff' : '#888'};">${row.change > 0 ? '+' : ''}${row.change}</div>
                            <div style="text-align:right; font-weight:bold; color:#eab308;">${row.scoreAfter}</div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        setTimeout(() => {
            const ctx = document.getElementById('bobsResultChart');
            if(ctx) {
                new Chart(ctx.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: data.chart.labels,
                        datasets: [{
                            label: 'Score Verlauf',
                            data: data.chart.values,
                            borderColor: '#00d26a',
                            backgroundColor: 'rgba(0, 210, 106, 0.1)',
                            borderWidth: 3,
                            pointBackgroundColor: '#fff',
                            tension: 0.3,
                            fill: true
                        }]
                    },
                    options: { 
                        responsive: true, maintainAspectRatio: false, 
                        plugins: { legend: { display: false } },
                        scales: { y: { grid: { color: '#333' } }, x: { display: false } }
                    }
                });
            }
        }, 0);
    },

    _renderTrainingDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        container.innerHTML = `
            <div class="stats-hero-grid" style="margin-bottom: 20px;">
                <div class="hero-card accent"><span class="hero-label">Gesamtpunkte</span><span class="hero-val">${data.summary.score}</span></div>
                <div class="hero-card"><span class="hero-label">Trefferquote</span><span class="hero-val">${data.summary.hitRate}</span></div>
                <div class="hero-card"><span class="hero-label">Treffer Total</span><span class="hero-val">${data.summary.hits}</span></div>
                <div class="hero-card"><span class="hero-label">Fehlwürfe</span><span class="hero-val" style="color:var(--miss-color)">${data.summary.misses}</span></div>
            </div>

            <div class="grid-triple-result">
                <div class="chart-wrapper-big"><canvas id="resultTrendChart"></canvas></div>
                <div class="heatmap-container" id="result-heatmap-box">${StatsBoard.generateSVG(350)}</div>
                <div class="score-distribution">
                    <h4 style="margin-bottom:25px; letter-spacing:1px; color:#888; text-transform:uppercase; font-size:0.9rem;">TREFFER QUALITÄT</h4>
                    <div class="dist-bar"><span>Singles (1 Pkt)</span> <strong>${data.distribution.singles}</strong></div>
                    <div class="dist-bar"><span>Doubles (2 Pkt)</span> <strong>${data.distribution.doubles}</strong></div>
                    <div class="dist-bar gold"><span>Triples (3 Pkt)</span> <strong>${data.distribution.triples}</strong></div>
                </div>
            </div>
        `;
        setTimeout(() => { this.renderChart(data.chart, "Punkte pro Ziel"); this.applyHeatmap(data.heatmap); }, 0);
    },

    _renderX01Dashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);
        if (!data) { container.innerHTML = 'No Data'; return; }

        container.innerHTML = `
            <div class="stats-hero-grid" style="margin-bottom: 20px;">
                <div class="hero-card accent"><span class="hero-label">Average</span><span class="hero-val">${data.summary.avg}</span></div>
                <div class="hero-card"><span class="hero-label">First 9</span><span class="hero-val">${data.summary.first9}</span></div>
                <div class="hero-card accent"><span class="hero-label">Best Leg</span><span class="hero-val">${data.summary.bestLeg}</span></div>
                <div class="hero-card"><span class="hero-label">Checkout</span><span class="hero-val">${data.summary.checkout}</span></div>
            </div>
            <div class="grid-triple-result">
                <div class="chart-wrapper-big"><canvas id="resultTrendChart"></canvas></div>
                <div class="heatmap-container" id="result-heatmap-box">${StatsBoard.generateSVG(350)}</div>
                <div class="score-distribution">
                    <h4 style="margin-bottom:25px; letter-spacing:1px; color:#888; text-transform:uppercase; font-size:0.9rem;">POWER SCORES</h4>
                    <div class="dist-bar"><span>100+</span> <strong>${data.powerScores.ton}</strong></div>
                    <div class="dist-bar"><span>140+</span> <strong>${data.powerScores.ton40}</strong></div>
                    <div class="dist-bar gold"><span>180</span> <strong>${data.powerScores.max}</strong></div>
                </div>
            </div>
        `;
        setTimeout(() => { this.renderChart(data.chart, "Score Verlauf"); this.applyHeatmap(data.heatmap); }, 0);
    },

    renderChart: function(chartData, label) {
        const ctx = document.getElementById('resultTrendChart');
        if(!ctx) return;
        if(resultChartInstance) { resultChartInstance.destroy(); resultChartInstance = null; }
        
        resultChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: label || 'Verlauf',
                    data: chartData.values,
                    borderColor: '#00d26a',
                    backgroundColor: 'rgba(0, 210, 106, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                    x: { display: true, ticks: { color: '#888', font: {size: 10} } }
                },
                plugins: { legend: { display: false } }
            }
        });
    },

    applyHeatmap: function(heatmapData) {
        if (!heatmapData) return;
        const values = Object.values(heatmapData);
        if(values.length === 0) return;
        const maxHits = Math.max(...values);
        Object.entries(heatmapData).forEach(([segId, hits]) => {
            let elementId = `seg-${segId}`;
            const svg = document.getElementById('result-heatmap-box');
            if(!svg) return;
            let elements = [];
            if (segId.startsWith('S')) {
                const elO = svg.querySelector(`#${elementId}-O`);
                const elI = svg.querySelector(`#${elementId}-I`);
                if(elO) elements.push(elO); if(elI) elements.push(elI);
            } else {
                const el = svg.querySelector(`#${elementId}`);
                if(el) elements.push(el);
            }
            const intensity = hits / maxHits;
            let heatClass = '';
            if (intensity > 0.7) heatClass = 'heat-high';
            else if (intensity > 0.3) heatClass = 'heat-medium';
            else if (intensity > 0) heatClass = 'heat-low';
            elements.forEach(el => { if (el) el.classList.add(heatClass); });
        });
    }
};