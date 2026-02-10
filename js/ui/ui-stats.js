import { State } from '../core/state.js';
import { StatsService } from '../core/stats-service.js';
import { UI } from './ui-core.js';
import { StatsBoard } from './ui-stats-board.js';

export const Stats = {
    init: function() {
        // 1. Container finden (KORREKTUR: .stats-filter-row statt .stats-header)
        const filterRow = document.querySelector('.stats-filter-row');
        
        if (filterRow) {
            // Prüfen, ob der 4. Filter schon da ist, um doppeltes Einfügen zu verhindern
            if (!document.getElementById('stats-mode-filter')) {
                filterRow.innerHTML = `
                    <select id="stats-player-select" class="stats-dropdown"></select>
                    <select id="stats-game-select" class="stats-dropdown"></select>
                    <select id="stats-mode-filter" class="stats-dropdown" disabled>
                        <option value="all">Alle Modi</option>
                    </select>
                    <select id="stats-time-filter" class="stats-dropdown"></select>
                `;
            }
        }

        // 2. Referenzen holen
        const pSelect = document.getElementById('stats-player-select');
        const gSelect = document.getElementById('stats-game-select');
        const mFilter = document.getElementById('stats-mode-filter');
        const tFilter = document.getElementById('stats-time-filter');

        // Sicherheitscheck, falls DOM nicht bereit ist
        if (!pSelect || !gSelect || !tFilter) return;

        // 3. Spieler laden
        const players = State.getAvailablePlayers();
        if (players.length === 0) {
            pSelect.innerHTML = '<option value="">Keine Spieler</option>';
            return;
        }

        // Falls wir neu rendern, behalten wir die Auswahl bei oder setzen zurück
        // Hier einfacher Reset oder Neubefüllung:
        const currentP = pSelect.value;
        pSelect.innerHTML = players.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        if(currentP && players.find(p => p.id === currentP)) pSelect.value = currentP;
        
        // 4. Spiel-Optionen befüllen (nur wenn leer oder Reset gewünscht, hier statisch ok)
        // Wir setzen die Optionen neu, um sicherzugehen
        const currentG = gSelect.value;
        gSelect.innerHTML = `
            <option value="x01">X01 Match</option>
            <option value="cricket">Cricket</option>
            <option value="shanghai">Shanghai</option>
            <option value="single-training">Single Training</option>
			<option value="around-the-board">Around the Board</option>
			<option value="bobs27">Bob's 27</option>
        `;
        if(currentG) gSelect.value = currentG;
		
        const currentT = tFilter.value;
		tFilter.innerHTML = `
            <option value="today">Heute</option>
            <option value="7">Letzte 7 Tage</option>
            <option value="30" selected>Letzte 30 Tage</option>
            <option value="365">Letztes Jahr</option>
            <option value="all">Gesamter Zeitraum</option>
        `;
        if(currentT) tFilter.value = currentT;

        // 5. Event Listener
        pSelect.onchange = () => this.updateView();
        
        gSelect.onchange = () => {
            if(mFilter) this.updateModeFilterOptions(gSelect.value, mFilter);
            this.updateView();
        };

        if(mFilter) {
            mFilter.onchange = () => this.updateView();
            // Initial Optionen setzen für das aktuell gewählte Spiel
            this.updateModeFilterOptions(gSelect.value || 'x01', mFilter);
        }

        tFilter.onchange = () => this.updateView();

        // Initial View Update
        this.updateView();
    },

    updateModeFilterOptions: function(gameType, filterEl) {
        if(!filterEl) return;
        
        filterEl.disabled = false;
        filterEl.style.opacity = "1";
        let options = `<option value="all">Alle Varianten</option>`;

        if (gameType === 'x01') {
            options += `
                <option value="sido">Single In - Double Out (Standard)</option>
                <option value="siso">Single In - Single Out</option>
                <option value="dido">Double In - Double Out</option>
                <option value="diso">Double In - Single Out</option>
            `;
        } else if (gameType === 'shanghai') {
            options += `
                <option value="7">7 Runden</option>
                <option value="20">20 Runden</option>
            `;
        } else if (gameType === 'cricket') {
            options += `
                <option value="nolimit">Kein Limit</option>
                <option value="20">20 Runden</option>
                <option value="10">10 Runden</option>
            `;
		} else if (gameType === 'around-the-board') {
            options += `
                <option value="full">Komplettes Segment</option>
                <option value="single-inner">Innere Singles</option>
                <option value="single-outer">Äußere Singles</option>
                <option value="double">Nur Doubles</option>
                <option value="triple">Nur Triples</option>
            `;
        } else {
            // Für Training und Bob's 27 gibt es keine Varianten
            options = `<option value="all">Standard</option>`;
            filterEl.disabled = true;
            filterEl.style.opacity = "0.5";
        }

        filterEl.innerHTML = options;
    },

    updateView: function() {
		const pSelect = document.getElementById('stats-player-select');
        const gSelect = document.getElementById('stats-game-select');
        const tFilter = document.getElementById('stats-time-filter');
        const mFilter = document.getElementById('stats-mode-filter');

        if(!pSelect || !gSelect || !tFilter) return;

		const playerId = pSelect.value;
		const days = tFilter.value;
		const gameType = gSelect.value;
        const modeVariant = mFilter ? mFilter.value : 'all';
		
		const container = document.getElementById('stats-main-dashboard');
		if (!container) return;

		if (gameType === 'x01') {
			const data = StatsService.getX01Stats(playerId, days, modeVariant);
            if (!data) { this._renderEmpty(container); return; }
			this.renderDashboardX01(container, data);
		}
        else if (gameType === 'cricket') {
            const data = StatsService.getCricketStats(playerId, days, modeVariant);
            if (!data) { this._renderEmpty(container); return; }
            this.renderDashboardCricket(container, data);
        }
        else if (gameType === 'shanghai') {
            const data = StatsService.getShanghaiStats(playerId, days, modeVariant);
            if (!data) { this._renderEmpty(container); return; }
            this.renderDashboardShanghai(container, data);
        }
        else if (gameType === 'single-training') {
            const data = StatsService.getSingleTrainingStats(playerId, days);
            if (!data) { this._renderEmpty(container); return; }
            this.renderDashboardTraining(container, data);
        }
		else if (gameType === 'around-the-board') {
            const data = StatsService.getAtcStats(playerId, days, modeVariant);
            if (!data) { this._renderEmpty(container); return; }
            this.renderDashboardAtc(container, data);
        }
		else if (gameType === 'bobs27') {
            const data = StatsService.getBobs27Stats(playerId, days);
            if (!data) { this._renderEmpty(container); return; }
            this.renderDashboardBobs27(container, data);
        }
	},

	_renderEmpty: function(container, msg = "Keine Daten für diese Auswahl.") {
        container.innerHTML = `<p style="text-align:center; padding:50px; color:#666;">${msg}</p>`;
    },
	
    // --- DASHBOARD RENDERER (Originale) ---

	renderDashboardAtc: function(container, data) {
        // Matrix HTML generieren
        let matrixHTML = '<div class="atc-matrix-grid" style="display:grid; grid-template-columns: repeat(7, 1fr); gap:8px; margin-bottom:20px;">';
        
        data.matrix.forEach(item => {
            // Farben: Grün für wenig Darts, Rot für viele
            let color = '#fff';
            let bg = 'rgba(255,255,255,0.05)';
            
            const val = parseFloat(item.val);
            if (!isNaN(val)) {
                if (val <= 1.5) { color = '#00d26a'; bg = 'rgba(0, 210, 106, 0.15)'; }
                else if (val <= 3.0) { color = '#fff'; }
                else { color = '#f87171'; bg = 'rgba(248, 113, 113, 0.15)'; }
            }

            matrixHTML += `
                <div style="background:${bg}; border-radius:6px; padding:8px 2px; text-align:center;">
                    <div style="font-size:0.7rem; color:#888; margin-bottom:2px;">${item.label}</div>
                    <div style="font-size:1.1rem; font-weight:bold; color:${color};">${item.val}</div>
                </div>
            `;
        });
        matrixHTML += '</div>';

        container.innerHTML = `
            <div class="stats-hero-grid" style="padding: 0 5px; margin-bottom: 20px;">
                <div class="hero-card accent"><span class="hero-label">Avg Darts</span><span class="hero-val">${data.summary.avgDarts}</span></div>
                <div class="hero-card"><span class="hero-label">Best Darts</span><span class="hero-val" style="color:var(--highlight-color);">${data.summary.bestDarts}</span></div>
                <div class="hero-card"><span class="hero-label">Hit Rate</span><span class="hero-val">${data.summary.hitRate}</span></div>
                <div class="hero-card"><span class="hero-label">Spiele</span><span class="hero-val">${data.summary.games}</span></div>
            </div>
            
            <h4 style="margin-bottom:10px; color:#c4c4c4; letter-spacing:1px; font-size:0.8rem; text-transform:uppercase;">Darts Ø pro Target</h4>
            ${matrixHTML}

            <div class="chart-wrapper-big" style="background: rgba(255,255,255,0.03); border: 1px solid #333; border-radius: 12px; padding: 15px; margin-bottom:20px; height: 250px;">
                <canvas id="mainTrendChart"></canvas>
            </div>

            <div class="stats-history-scroll-area" style="margin-top: 20px; padding: 20px;">
                <h4 style="margin-bottom:15px; color:#888; text-transform:uppercase; font-size:0.9rem;">Match Historie</h4>
                <div id="stats-match-list-container">
                    ${this._generateAtcMatchListHTML(data.matches)}
                </div>
            </div>
        `;
        
        setTimeout(() => {
            this.renderTrendChart({
                labels: data.chart.labels,
                values: data.chart.values 
            }, "Darts Total");
        }, 0);
    },

    _generateAtcMatchListHTML: function(matches) {
        return matches.map(m => `
            <div class="history-item-complex" style="background: rgba(255,255,255,0.02); border: 1px solid #333; padding: 10px; margin-bottom: 8px; border-radius: 10px; display: grid; grid-template-columns: 80px 1.2fr 1fr 1fr 1fr; align-items: center; gap: 10px; font-size: 0.85rem;">
                <div style="font-size: 0.75rem; color: #666;">${m.date}</div>
                
                <div>
                    <div style="font-weight:bold; color:#fff;">${m.variant}</div>
                    <div style="font-size:0.75rem; color:#888;">${m.opponents}</div>
                </div>

                <div style="text-align: center;">
                    <strong style="font-size:1.1rem; color:${m.resultClass === 'res-win' ? 'var(--accent-color)' : '#fff'};">${m.darts}</strong>
                    <small style="display:block; color:#555; font-size:0.6rem;">Darts</small>
                </div>

                <div style="text-align: right;">
                    <strong style="font-size:1.1rem; color:var(--highlight-color);">${m.hitRate}</strong>
                    <small style="display:block; color:#555; font-size:0.6rem;">Quote</small>
                </div>
            </div>
        `).join('');
    },
	
    renderDashboardCricket: function(container, data) {
        container.innerHTML = `
            <div class="stats-hero-grid" style="padding: 0 5px; margin-bottom: 20px;">
                <div class="hero-card accent"><span class="hero-label">Avg MPR</span><span class="hero-val">${data.summary.avgMPR}</span></div>
                <div class="hero-card"><span class="hero-label">Best MPR</span><span class="hero-val" style="color:var(--highlight-color);">${data.summary.bestMPR}</span></div>
                <div class="hero-card"><span class="hero-label">Total Marks</span><span class="hero-val">${data.summary.totalMarks}</span></div>
                <div class="hero-card"><span class="hero-label">Spiele</span><span class="hero-val">${data.summary.games}</span></div>
            </div>
            <div class="grid-triple-result">
                <div class="chart-wrapper-big"><canvas id="mainTrendChart"></canvas></div>
                <div class="heatmap-container" id="stats-heatmap-box">
                    <h4 style="color:#c4c4c4; margin-bottom:15px; letter-spacing:1px; font-size:0.8rem;">CRICKET HEATMAP</h4>
                    ${StatsBoard.generateSVG(300)}
                </div>
                <div class="score-distribution">
                    <h4 style="margin-bottom:20px; letter-spacing:1px; color:#c4c4c4;">VERTEILUNG</h4>
                    <div class="dist-bar"><span>Singles</span> <strong>${data.distribution.singles}</strong></div>
                    <div class="dist-bar"><span>Doubles</span> <strong>${data.distribution.doubles}</strong></div>
                    <div class="dist-bar gold"><span>Triples</span> <strong>${data.distribution.triples}</strong></div>
                </div>
            </div>
            <div class="stats-history-scroll-area" style="margin-top: 20px; padding: 20px;">
                <h4 style="margin-bottom:15px; color:#888; text-transform:uppercase; font-size:0.9rem;">Match Historie</h4>
                <div id="stats-match-list-container">${this._generateCricketMatchListHTML(data.matches)}</div>
            </div>
        `;
        setTimeout(() => { this.renderTrendChart({ labels: data.chart.labels, values: data.chart.values }, "MPR Verlauf"); this.applyHeatmapData(data.heatmap, 'stats-heatmap-box'); }, 0);
    },
	
    _generateCricketMatchListHTML: function(matches) {
        // Grid angepasst: 6 Spalten (Punkte eingefügt)
        // 80px Date | 1.2fr Name | 0.8fr Score | 0.8fr MPR | 0.8fr Marks | 0.6fr Rounds
        return matches.map(m => `
            <div class="history-item-complex" style="background: rgba(255,255,255,0.02); border: 1px solid #333; padding: 10px; margin-bottom: 8px; border-radius: 10px; display: grid; grid-template-columns: 80px 1.2fr 0.8fr 0.8fr 0.8fr 0.6fr; align-items: center; gap: 8px; font-size: 0.85rem;">
                
                <div style="font-size: 0.75rem; color: #666;">${m.date}</div>
                
                <div style="min-width:0;">
                    <div class="${m.resultClass}" style="font-size:0.9rem; margin-bottom:2px;">${m.resultLabel}</div>
                    <div style="font-size:0.75rem; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.opponents}</div>
                </div>

                <div style="text-align: center;">
                    <strong style="font-size:1.1rem; color:#fff;">${m.score}</strong>
                    <small style="display:block; color:#555; font-size:0.6rem;">Punkte</small>
                </div>

                <div style="text-align: center;">
                    <strong style="font-size:1.2rem; color:var(--accent-color);">${m.mpr}</strong>
                    <small style="display:block; color:#555; font-size:0.6rem;">MPR</small>
                </div>

                <div style="text-align: center;">
                    <strong style="font-size:1.1rem; color:#fff;">${m.marks}</strong>
                    <small style="display:block; color:#555; font-size:0.6rem;">Marks</small>
                </div>

                <div style="text-align: right;">
                    <strong style="font-size:1.1rem; color:#888;">${m.rounds}</strong>
                    <small style="display:block; color:#555; font-size:0.6rem;">Runden</small>
                </div>
            </div>
        `).join('');
    },
	
    renderDashboardX01: function(container, data) {
        // --- HIER: 'Best AVG' durch 'Best Leg' ersetzt ---
        container.innerHTML = `
            <div class="stats-hero-grid" style="padding: 0 5px; margin-bottom: 20px;">
                <div class="hero-card accent">
                    <span class="hero-label">Period AVG</span>
                    <span class="hero-val">${data.summary.lifetimeAvg}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Best Leg</span>
                    <span class="hero-val" style="color:var(--highlight-color);">${data.summary.bestLeg}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">Best Match AVG</span>
                    <span class="hero-val">${data.summary.bestAvg}</span>
                </div>
                <div class="hero-card">
                    <span class="hero-label">High Finish</span>
                    <span class="hero-val">${data.summary.highestCheckout}</span>
                </div>
            </div>
            
            <div class="grid-x01-layout">
                <div class="chart-wrapper-big" style="background: rgba(255,255,255,0.03); border: 1px solid #333; border-radius: 12px; padding: 15px; height: 100%;">
                    <canvas id="mainTrendChart"></canvas>
                </div>
                <div class="heatmap-container" id="stats-heatmap-box" style="margin:0; height: 100%;">
                    <h4 style="color:#c4c4c4; margin-bottom:15px; letter-spacing:1px; font-size:0.8rem;">X01 HEATMAP</h4>
                    ${StatsBoard.generateSVG(280)} 
                </div>
                <div class="score-distribution" style="margin:0; height: 100%;">
                    <h4 style="margin-bottom:20px; letter-spacing:1px; color:#c4c4c4;">SCORES</h4>
                    <div class="dist-bar"><span style="font-size:0.8rem;">100+</span> <strong>${data.summary.total100s}</strong></div>
                    <div class="dist-bar"><span style="font-size:0.8rem;">140+</span> <strong>${data.summary.total140s}</strong></div>
                    <div class="dist-bar gold" style="margin-top:15px;"><span style="font-size:0.9rem;">180</span> <strong style="font-size:1.4rem;">${data.summary.total180s}</strong></div>
                </div>
            </div>

            <div class="stats-history-scroll-area" style="margin-top: 20px; padding: 20px;">
                <h4 style="margin-bottom:15px; color:#888; text-transform:uppercase; font-size:0.9rem;">Match Historie</h4>
                <div id="stats-match-list-container">${this._generateX01MatchListHTML(data.matches)}</div>
            </div>
        `;
        setTimeout(() => { this.renderTrendChart(data.charts, "AVG Trend"); this.applyHeatmapData(data.heatmap, 'stats-heatmap-box'); }, 0);
    },
	
    _generateX01MatchListHTML: function(matches) {
        // --- ÄNDERUNG: NEUE SPALTE "LD" (Leg Darts) ---
        // Grid angepasst: 7 Spalten
        return matches.map(m => `
            <div class="history-item-complex" style="background: rgba(255,255,255,0.02); border: 1px solid #333; padding: 10px; margin-bottom: 8px; border-radius: 10px; display: grid; grid-template-columns: 80px 1.2fr 0.7fr 0.9fr 0.7fr 0.9fr 1.6fr; align-items: center; gap: 6px; font-size: 0.85rem;">
                
                <div style="font-size: 0.75rem; color: #666;">${m.date}</div>
                
                <div style="min-width:0;">
                    <div class="${m.resultClass}" style="font-size:0.9rem; margin-bottom:2px;">${m.resultLabel}</div>
                    <div style="font-size:0.75rem; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.opponents}</div>
                </div>

                <div style="text-align:center;"><span style="background:#222; padding:2px 4px; border-radius:4px; color:#aaa; font-size:0.7rem;">${m.mode}</span></div>

                <div style="text-align: center;">
                    <strong style="font-size:1.1rem; color:#fff;">${m.avg}</strong>
                    <small style="display:block; color:#555; font-size:0.6rem;">Ø</small>
                </div>

                <div style="text-align: center;">
                    <strong style="font-size:1.1rem; color:#fff;">${m.bestLeg}</strong>
                    <small style="display:block; color:#555; font-size:0.6rem;">LD</small>
                </div>

                <div style="text-align: center;">
                    <strong style="font-size:1.1rem; color:var(--highlight-color);">${m.checkout}</strong>
                    <small style="display:block; color:#555; font-size:0.6rem;">Check</small>
                </div>

                <div style="display:flex; justify-content:flex-end; align-items:center; gap:5px;">
                    <div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><span style="font-size:0.8rem; font-weight:bold; color:#fff;">${m.p100}</span><span style="font-size:0.6rem; color:#666;">100</span></div>
                    <div style="width:1px; height:15px; background:#444;"></div>
                    <div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><span style="font-size:0.8rem; font-weight:bold; color:#fff;">${m.p140}</span><span style="font-size:0.6rem; color:#666;">140</span></div>
                    <div style="width:1px; height:15px; background:#444;"></div>
                    <div style="display:flex; flex-direction:column; align-items:center; line-height:1;"><span style="font-size:0.8rem; font-weight:bold; color:#eab308;">${m.p180}</span><span style="font-size:0.6rem; color:#eab308;">180</span></div>
                </div>
            </div>
        `).join('');
    },
	
    renderDashboardTraining: function(container, data) {
         container.innerHTML = `
            <div class="stats-hero-grid" style="padding: 0 5px; margin-bottom: 20px;">
                <div class="hero-card accent"><span class="hero-label">Avg Score</span><span class="hero-val">${data.summary.avgScore}</span></div>
                <div class="hero-card"><span class="hero-label">Best Score</span><span class="hero-val" style="color:var(--highlight-color);">${data.summary.bestScore}</span></div>
                <div class="hero-card"><span class="hero-label">Trefferquote</span><span class="hero-val">${data.summary.hitRate}</span></div>
                <div class="hero-card"><span class="hero-label">Spiele</span><span class="hero-val">${data.summary.games}</span></div>
            </div>
            <div class="grid-triple-result">
                <div class="chart-wrapper-big"><canvas id="mainTrendChart"></canvas></div>
                <div class="heatmap-container" id="stats-heatmap-box">
                    <h4 style="color:#c4c4c4; margin-bottom:15px; letter-spacing:1px; font-size:0.8rem;">GESAMT HEATMAP</h4>
                    ${StatsBoard.generateSVG(300)}
                </div>
                <div class="score-distribution">
                    <h4 style="margin-bottom:20px; letter-spacing:1px; color:#c4c4c4;">VERTEILUNG</h4>
                    <div class="dist-bar"><span>Singles</span> <strong>${data.distribution.singles}</strong></div>
                    <div class="dist-bar"><span>Doubles</span> <strong>${data.distribution.doubles}</strong></div>
                    <div class="dist-bar gold"><span>Triples</span> <strong>${data.distribution.triples}</strong></div>
                </div>
            </div>
            <div class="stats-history-scroll-area" style="margin-top: 20px; padding: 20px;">
                <h4 style="margin-bottom:15px; color:#888; text-transform:uppercase; font-size:0.9rem;">Match Historie</h4>
                <div id="stats-match-list-container">${this._generateTrainingMatchListHTML(data.matches)}</div>
            </div>
        `;
        setTimeout(() => { this.renderTrendChart(data.chart, "Score Verlauf"); this.applyHeatmapData(data.heatmap, 'stats-heatmap-box'); }, 0);
    },
    renderDashboardShanghai: function(container, data) {
        container.innerHTML = `
            <div class="stats-hero-grid" style="padding: 0 5px; margin-bottom: 20px;">
                <div class="hero-card accent"><span class="hero-label">Avg Score</span><span class="hero-val">${data.summary.avgScore}</span></div>
                <div class="hero-card"><span class="hero-label">Best Score</span><span class="hero-val" style="color:var(--highlight-color);">${data.summary.bestScore}</span></div>
                <div class="hero-card"><span class="hero-label">Trefferquote</span><span class="hero-val">${data.summary.hitRate}</span></div>
                <div class="hero-card"><span class="hero-label">Spiele</span><span class="hero-val">${data.summary.games}</span></div>
            </div>
            <div class="grid-triple-result">
                <div class="chart-wrapper-big"><canvas id="mainTrendChart"></canvas></div>
                <div class="heatmap-container" id="stats-heatmap-box">
                    <h4 style="color:#c4c4c4; margin-bottom:15px; letter-spacing:1px; font-size:0.8rem;">SHANGHAI HEATMAP</h4>
                    ${StatsBoard.generateSVG(300)}
                </div>
                <div class="score-distribution">
                    <h4 style="margin-bottom:20px; letter-spacing:1px; color:#c4c4c4;">VERTEILUNG</h4>
                    <div class="dist-bar"><span>Singles</span> <strong>${data.distribution.singles}</strong></div>
                    <div class="dist-bar"><span>Doubles</span> <strong>${data.distribution.doubles}</strong></div>
                    <div class="dist-bar gold"><span>Triples</span> <strong>${data.distribution.triples}</strong></div>
                </div>
            </div>
            <div class="stats-history-scroll-area" style="margin-top: 20px; padding: 20px;">
                <h4 style="margin-bottom:15px; color:#888; text-transform:uppercase; font-size:0.9rem;">Match Historie</h4>
                <div id="stats-match-list-container">${this._generateTrainingMatchListHTML(data.matches)}</div>
            </div>
        `;
        setTimeout(() => { this.renderTrendChart(data.chart, "Score Verlauf"); this.applyHeatmapData(data.heatmap, 'stats-heatmap-box'); }, 0);
    },
    renderDashboardBobs27: function(container, data) {
        container.innerHTML = `
            <div class="stats-hero-grid" style="padding: 0 5px; margin-bottom: 20px;">
                <div class="hero-card accent"><span class="hero-label">Avg Score</span><span class="hero-val">${data.summary.avgScore}</span></div>
                <div class="hero-card"><span class="hero-label">Best Score</span><span class="hero-val" style="color:var(--highlight-color);">${data.summary.bestScore}</span></div>
                <div class="hero-card"><span class="hero-label">Survival Rate</span><span class="hero-val">${data.summary.survivalRate}</span></div>
                <div class="hero-card"><span class="hero-label">Hit Rate</span><span class="hero-val">${data.summary.hitRate}</span></div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-bottom:20px;">
                <div class="chart-wrapper-big" style="background: rgba(255,255,255,0.03); border: 1px solid #333; border-radius: 12px; padding: 15px; height: 350px;">
                    <canvas id="mainTrendChart"></canvas>
                </div>
                <div class="heatmap-container" id="stats-heatmap-box" style="margin:0; height: 350px; background: rgba(255,255,255,0.03); border: 1px solid #333; border-radius: 12px; display:flex; flex-direction:column; justify-content:center; align-items:center; width:100%;">
                    <h4 style="color:#c4c4c4; margin-bottom:15px; letter-spacing:1px; font-size:0.8rem; text-align:center;">DOUBLES HEATMAP</h4>
                    ${StatsBoard.generateSVG(280)}
                </div>
            </div>
            <div class="stats-history-scroll-area" style="margin-top: 20px; padding: 20px;">
                <h4 style="margin-bottom:15px; color:#888; text-transform:uppercase; font-size:0.9rem;">Match Historie</h4>
                <div id="stats-match-list-container">${this._generateBobsMatchListHTML(data.matches)}</div>
            </div>
        `;
        setTimeout(() => { this.renderTrendChart({ labels: data.chart.labels, avgTrend: data.chart.values }, "Score Verlauf"); this.applyHeatmapData(data.heatmap, 'stats-heatmap-box'); }, 0);
    },
    _generateTrainingMatchListHTML: function(matches) {
        return matches.map(m => `
            <div class="history-item-complex" style="background: rgba(255,255,255,0.02); border: 1px solid #333; padding: 10px; margin-bottom: 8px; border-radius: 10px; display: grid; grid-template-columns: 90px 1.5fr 0.8fr 0.8fr 2.2fr; align-items: center; gap: 10px; font-size: 0.85rem;">
                <div style="font-size: 0.75rem; color: #666;">${m.date}</div>
                <div><div class="${m.resultClass}" style="font-size:0.9rem; margin-bottom:2px;">${m.resultLabel}</div><div style="font-size:0.75rem; color:#888; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${m.opponents}</div></div>
                <div style="text-align: center;"><strong style="font-size:1.2rem; color:#fff;">${m.score}</strong><small style="display:block; color:#555; font-size:0.6rem;">Punkte</small></div>
                <div style="text-align: center;"><strong style="font-size:1.2rem; color:var(--highlight-color);">${m.hitRate}</strong><small style="display:block; color:#555; font-size:0.6rem;">Quote</small></div>
                <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px;">
                    <div style="display:flex; align-items:center; gap:4px;"><span style="color:#666; font-size:0.8rem; font-weight:bold;">S:</span><span class="badge-sdt bg-s">${m.s}</span></div>
                    <div style="width:1px; height:20px; background:#444;"></div>
                    <div style="display:flex; align-items:center; gap:4px;"><span style="color:#666; font-size:0.8rem; font-weight:bold;">D:</span><span class="badge-sdt bg-d">${m.d}</span></div>
                    <div style="width:1px; height:20px; background:#444;"></div>
                    <div style="display:flex; align-items:center; gap:4px;"><span style="color:#666; font-size:0.8rem; font-weight:bold;">T:</span><span class="badge-sdt bg-t">${m.t}</span></div>
                </div>
            </div>
        `).join('');
    },
    _generateBobsMatchListHTML: function(matches) {
        return matches.map(m => {
            const targets = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,25];
            let infoText = `${m.rounds} Runden`;
            if (m.resultLabel === 'BUST') {
                const bustIndex = m.rounds - 1;
                if (bustIndex >= 0 && bustIndex < targets.length) {
                    const t = targets[bustIndex];
                    infoText = `Aus bei ${t === 25 ? 'BULL' : 'D'+t}`;
                }
            } else { infoText = `${m.doublesHit} Treffer`; }
            return `
            <div class="history-item-complex" style="background: rgba(255,255,255,0.02); border: 1px solid #333; padding: 10px; margin-bottom: 8px; border-radius: 10px; display: grid; grid-template-columns: 80px 1.2fr 1.2fr 1fr 1fr; align-items: center; gap: 10px; font-size: 0.85rem;">
                <div style="font-size: 0.75rem; color: #666;">${m.date}</div>
                <div class="${m.resultClass}" style="font-size:0.9rem; font-weight:bold;">${m.resultLabel}</div>
                <div style="font-size:0.8rem; color:#aaa;">${infoText}</div>
                <div style="text-align: center;"><strong style="font-size:1.1rem; color:${m.score >= 0 ? '#fff' : 'var(--miss-color)'};">${m.score}</strong><small style="display:block; color:#555; font-size:0.6rem;">Punkte</small></div>
                <div style="text-align: right;"><strong style="font-size:1.1rem; color:var(--highlight-color);">${m.hitRate}</strong><small style="display:block; color:#555; font-size:0.6rem;">Quote</small></div>
            </div>
        `}).join('');
    },
	applyHeatmapData: function(heatmapData, containerId) {
		if (!heatmapData) return;
		const values = Object.values(heatmapData);
		if(values.length === 0) return;
		const maxHits = Math.max(...values);
        const container = document.getElementById(containerId);
        if(!container) return;
		Object.entries(heatmapData).forEach(([segId, hits]) => {
			let elementId = `seg-${segId}`;
			let elements = [];
			if (segId.startsWith('S')) {
				const elO = container.querySelector(`#${elementId}-O`);
				const elI = container.querySelector(`#${elementId}-I`);
				if(elO) elements.push(elO); if(elI) elements.push(elI);
			} else {
				const el = container.querySelector(`#${elementId}`);
				if(el) elements.push(el);
			}
			const intensity = hits / maxHits;
			let heatClass = '';
			if (intensity > 0.7) heatClass = 'heat-high';
			else if (intensity > 0.3) heatClass = 'heat-medium';
			else if (intensity > 0) heatClass = 'heat-low';
			elements.forEach(el => {
                el.classList.remove('heat-low', 'heat-medium', 'heat-high');
				if (el) el.classList.add(heatClass);
			});
		});
	},
    renderTrendChart: function(chartData, label) {
        const canvas = document.getElementById('mainTrendChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        if (window.statsChartInstance) window.statsChartInstance.destroy();
        
        let datasets = [];
        if (chartData.avgTrend) {
            datasets = [
                { label: 'AVG', data: chartData.avgTrend, borderColor: '#00d26a', backgroundColor: 'rgba(0, 210, 106, 0.1)', fill: true, tension: 0.4 },
                { label: 'First 9', data: chartData.f9Trend, borderColor: '#eab308', borderDash: [5, 5], tension: 0.4 }
            ];
        } else {
            datasets = [
                { label: 'Werte', data: chartData.values, borderColor: '#00d26a', backgroundColor: 'rgba(0, 210, 106, 0.1)', fill: true, tension: 0.3 }
            ];
        }

        window.statsChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: chartData.labels, datasets: datasets },
            options: { 
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' }, beginAtZero: true },
                    x: { grid: { display: false }, ticks: { color: '#888', maxTicksLimit: 10 } }
                },
                plugins: { legend: { labels: { color: '#fff' } } }
            }
        });
    }
};