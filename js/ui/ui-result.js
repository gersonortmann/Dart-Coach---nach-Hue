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
        if (!session) return;

        const container = document.getElementById('result-container');
        if (!container) return;
        container.style.position = 'relative';

        // ── 1. WINNER & SCORE ERMITTELN ─────────────────────────────────────
        const isMultiplayer = session.players.length > 1;
        let winner = session.players[0];
        let resultLine = ''; // z.B. "3 : 1" oder "247 Pts"

        if (session.gameId === 'x01') {
            const isSets = session.settings.mode === 'sets';
            const sorted = [...session.players].sort((a, b) =>
                isSets ? b.setsWon - a.setsWon : b.legsWon - a.legsWon);
            winner = sorted[0];
            resultLine = isSets
                ? session.players.map(p => p.setsWon).join(' : ')
                : session.players.map(p => p.legsWon).join(' : ');
        } else if (session.gameId === 'bobs27') {
            const sorted = [...session.players].sort((a, b) => {
                if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
                return b.currentResidual - a.currentResidual;
            });
            winner = sorted[0];
            resultLine = winner.currentResidual + ' Pts';
        } else if (session.gameId === 'checkout-challenge' || session.gameId === 'halve-it' || session.gameId === 'scoring-drill') {
            const sorted = [...session.players].sort((a, b) => b.score - a.score);
            winner = sorted[0];
            resultLine = winner.score + ' Pts';
        } else {
            const sorted = [...session.players].sort((a, b) => b.currentResidual - a.currentResidual);
            winner = sorted[0];
            resultLine = winner.currentResidual + ' Pts';
        }

        // ── 2. GAME LABEL ────────────────────────────────────────────────────
        const GAME_LABELS = {
            'x01': 'X01', 'cricket': 'Cricket', 'bobs27': "Bob's 27",
            'single-training': 'Single Training', 'around-the-board': 'Around the Board',
            'shanghai': 'Shanghai', 'halve-it': 'Halve It',
            'scoring-drill': 'Scoring Drill', 'checkout-challenge': 'Checkout Challenge'
        };
        const gameLabel = GAME_LABELS[session.gameId] || session.gameId;

        // ── 3. WINNER BAR ─────────────────────────────────────────────────────
        // Krone nur bei Multiplayer-Sieg; solo → kein Kron-Icon
        const crownHtml = isMultiplayer ? '<span class="result-crown">👑</span>' : '';

        // Bei X01 steht der Score-String in der Mitte, bei anderen spiele ist
        // resultLine die Kennzahl des Siegers/Solo-Spielers.
        const resultBadgeHtml = resultLine
            ? `<span class="result-score-badge">${resultLine}</span>`
            : '';

        const winnerBarHtml = `
            <div class="result-winner-bar">
                <div class="result-winner-left">
                    ${crownHtml}
                    <span class="result-winner-name">${winner.name}</span>
                    ${resultBadgeHtml}
                    <span class="result-game-chip">${gameLabel}</span>
                </div>
                <div class="result-winner-right" id="result-actions-area"></div>
            </div>
        `;

        // ── 4. PLAYER AREA: TABS (multi) oder BADGE (solo) ───────────────────
        const playerAreaHtml = `<div class="result-player-area" id="result-tabs-container"></div>`;

        // ── 5. HTML ZUSAMMENBAUEN ─────────────────────────────────────────────
        container.innerHTML = `
            ${winnerBarHtml}
            ${playerAreaHtml}
            <div id="result-content-area" class="result-content-area"></div>
            <div style="height:40px;"></div>
        `;

        // ── 6. BUTTONS IN DIE WINNER-BAR EINFÜGEN ────────────────────────────
        const actionsArea = document.getElementById('result-actions-area');
        const btnMenu    = document.createElement('button');
        const btnRematch = document.createElement('button');
        btnMenu.className    = 'btn-compact secondary';
        btnRematch.className = 'btn-compact primary';
        btnMenu.innerHTML    = '💾 Speichern & Beenden';
        btnRematch.innerHTML = '🔄 Revanche';
        actionsArea.appendChild(btnMenu);
        actionsArea.appendChild(btnRematch);

        const isTrainingPlan = TrainingManager.isActive();
        if (isTrainingPlan) {
            btnMenu.innerHTML = 'PLAN ABBRECHEN ✕';
            btnMenu.onclick = async () => {
                if (!UI.isGuest()) await this._saveToHistory(session);
                TrainingManager.finishPlan();
            };
            const status = TrainingManager.getStatus();
            if (status && status.blockIndex >= status.totalBlocks - 1) {
                btnRematch.innerHTML = 'PLAN ABSCHLIESSEN ✅';
                btnRematch.onclick = async () => {
                    if (!UI.isGuest()) await this._saveToHistory(session);
                    TrainingManager.finishPlan();
                };
            } else {
                btnRematch.innerHTML = 'NÄCHSTE ÜBUNG ▶';
                btnRematch.onclick = async () => {
                    if (!UI.isGuest()) await this._saveToHistory(session);
                    TrainingManager.nextBlock();
                };
            }
        } else {
            btnMenu.onclick = async () => {
                if (!UI.isGuest()) {
                    btnMenu.innerText = 'Speichert...';
                    btnMenu.disabled = true;
                    await this._saveToHistory(session);
                }
                setTimeout(() => UI.showScreen('screen-dashboard'), 800);
            };
            btnRematch.onclick = async () => {
                if (!UI.isGuest()) await this._saveToHistory(session);
                this.handleRematch(session);
            };
        }

        // ── 7. PLAYER TABS ODER BADGE ─────────────────────────────────────────
        const tabContainer = document.getElementById('result-tabs-container');
        if (isMultiplayer) {
            // Mehrere Spieler → klickbare Tabs
            session.players.forEach(p => {
                const btn = document.createElement('div');
                btn.className = 'result-tab-btn';
                // Gewinner-Tab bekommt Krone
                btn.innerHTML = p.id === winner.id
                    ? `👑 ${p.name}`
                    : p.name;
                btn.dataset.pid = p.id;
                btn.onclick = () => this.renderPlayerDashboard(p.id, session);
                tabContainer.appendChild(btn);
            });
        } else {
            // Einzelspieler → Info-Badge (nicht klickbar)
            const badge = document.createElement('div');
            badge.className = 'result-player-badge';
            badge.innerHTML = `
                <span class="result-badge-name">${session.players[0].name}</span>
                <span class="result-badge-sep">·</span>
                <span class="result-badge-info">${gameLabel}</span>
            `;
            tabContainer.appendChild(badge);
        }

        // ── 8. INITIAL VIEW ───────────────────────────────────────────────────
        this.renderPlayerDashboard(winner.id, session);
        UI.showScreen('screen-result');
    },

    // ── SAVE ──────────────────────────────────────────────────────────────────
    _saveToHistory: async function(session) {
        const promises = session.players.map(async p => {
            const stats = GameEngine.getResultData(session, p);
            let totalScore = 0;
            if (stats.summary) {
                totalScore = stats.summary.totalScore ?? stats.summary.score ?? stats.summary.finalScore ?? 0;
            }
            const opponents = session.players
                .filter(other => other.id !== p.id)
                .map(other => other.name);
            const settingsToSave = Object.assign({}, session.settings, { opponents });
            const historyEntry = {
                matchId: 'm_' + Date.now() + '_' + p.id,
                date: Date.now(),
                game: session.gameId,
                settings: settingsToSave,
                stats,
                totalScore,
                turns: p.turns,
                targets: session.targets,
            };
            if (State.addToHistory) await State.addToHistory(p.id, historyEntry);
        });
        await Promise.all(promises);
    },

    handleRematch: function(oldSession) {
        const ids = oldSession.players.map(p => p.id);
        if (ids.length > 1) { const first = ids.shift(); ids.push(first); }
        GameEngine.startGame(oldSession.gameId, ids, oldSession.settings);
    },

    // ── RENDER DISPATCHER ─────────────────────────────────────────────────────
    renderPlayerDashboard: function(playerId, session) {
        document.querySelectorAll('.result-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.pid === playerId);
        });
        HueService.setMood('match-won');

        const container = document.getElementById('result-content-area');
        if (!container) return;
        container.innerHTML = '';

        const dispatch = {
            'bobs27':             '_renderBobsDashboard',
            'single-training':    '_renderSingleTrainingDashboard',
            'shanghai':           '_renderShanghaiDashboard',
            'cricket':            '_renderCricketDashboard',
            'checkout-challenge': '_renderCheckoutChallengeDashboard',
            'halve-it':           '_renderHalveItDashboard',
            'around-the-board':   '_renderAtbDashboard',
            'scoring-drill':      '_renderScoringDrillDashboard',
        };
        const method = dispatch[session.gameId] || '_renderX01Dashboard';
        this[method](container, playerId, session);
    },

    // ══════════════════════════════════════════════════════════════════════════
    //  DASHBOARDS
    // ══════════════════════════════════════════════════════════════════════════

    // ── X01 ───────────────────────────────────────────────────────────────────
    _renderX01Dashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);
        if (!data) { container.innerHTML = '<div style="padding:20px">Keine Daten</div>'; return; }

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent"><span class="hero-label">Average</span><span class="hero-val">${data.summary.avg}</span></div>
                <div class="hero-card"><span class="hero-label">First 9</span><span class="hero-val">${data.summary.first9}</span></div>
                <div class="hero-card"><span class="hero-label">Best Leg</span><span class="hero-val">${data.summary.bestLeg}</span></div>
                <div class="hero-card"><span class="hero-label">Checkout</span><span class="hero-val">${data.summary.checkout}</span></div>
            </div>
            <div class="res-two-col">
                <div class="res-chart-card">
                    <div class="res-section-title">SCORE VERLAUF</div>
                    <canvas id="resultTrendChart"></canvas>
                </div>
                <div class="res-side-card">
                    <div class="res-section-title">POWER SCORES</div>
                    <div class="res-power-list">
                        <div class="res-power-row"><span>100+</span><strong>${data.powerScores.ton}</strong></div>
                        <div class="res-power-row"><span>140+</span><strong>${data.powerScores.ton40}</strong></div>
                        <div class="res-power-row gold"><span>180</span><strong>${data.powerScores.max}</strong></div>
                    </div>
                    <div class="res-section-title" style="margin-top:20px;">HEATMAP</div>
                    <div class="heatmap-container res-heatmap" id="result-heatmap-box">${StatsBoard.generateSVG(200)}</div>
                </div>
            </div>
        `;
        setTimeout(() => { this.renderChart(data.chart, 'Score Verlauf'); this.applyHeatmap(data.heatmap); }, 0);
    },

    // ── CRICKET ───────────────────────────────────────────────────────────────
    _renderCricketDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);
        if (!data?.summary) { container.innerHTML = '<div style="padding:20px">Keine Daten</div>'; return; }

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent"><span class="hero-label">MPR</span><span class="hero-val">${data.summary.mpr}</span></div>
                <div class="hero-card"><span class="hero-label">Punkte</span><span class="hero-val" style="color:#eab308">${data.summary.score}</span></div>
                <div class="hero-card"><span class="hero-label">Marks Total</span><span class="hero-val">${data.summary.totalMarks}</span></div>
                <div class="hero-card"><span class="hero-label">Runden</span><span class="hero-val">${data.summary.rounds}</span></div>
            </div>
            <div class="res-two-col">
                <div class="res-chart-card">
                    <div class="res-section-title">PUNKTE VERLAUF</div>
                    <canvas id="resultTrendChart"></canvas>
                </div>
                <div class="res-side-card">
                    <div class="res-section-title">TREFFER QUALITÄT</div>
                    <div class="res-power-list">
                        <div class="res-power-row"><span>Singles (1 M)</span><strong>${data.distribution.singles}</strong></div>
                        <div class="res-power-row"><span>Doubles (2 M)</span><strong>${data.distribution.doubles}</strong></div>
                        <div class="res-power-row gold"><span>Triples (3 M)</span><strong>${data.distribution.triples}</strong></div>
                    </div>
                    <div class="res-section-title" style="margin-top:20px;">HEATMAP</div>
                    <div class="heatmap-container res-heatmap" id="result-heatmap-box">${StatsBoard.generateSVG(200)}</div>
                </div>
            </div>
        `;
        setTimeout(() => { this.renderChart(data.chart, 'Punkte Verlauf'); this.applyHeatmap(data.heatmap); }, 0);
    },

    // ── SINGLE TRAINING ───────────────────────────────────────────────────────
    // Neue Treffermatrix: 21 Felder (1-20 + Bull), Farbe = best. Multiplier
    _renderSingleTrainingDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        // Pro Ziel: besten Treffer aus turns[i].darts heraussuchen
        const matrixItems = session.targets.map((targetVal, i) => {
            const turn = player.turns[i];
            const label = targetVal === 25 ? 'B' : String(targetVal);
            if (!turn) return { label, best: 0, score: 0 };
            const score = turn.score ?? 0;
            // bester Multiplier der Runde auf diesem Ziel
            let best = 0;
            (turn.darts || []).forEach(d => {
                if (!d.isMiss && d.base === targetVal && d.multiplier > best) best = d.multiplier;
            });
            return { label, best, score };
        });

        // Farb-Logik: Triple=gold, Double=accent, Single=neutral, Miss=red
        const matrixHTML = `
            <div class="res-target-matrix">
                ${matrixItems.map(item => {
                    let cls = 'rtm-miss';
                    if (item.best === 3) cls = 'rtm-triple';
                    else if (item.best === 2) cls = 'rtm-double';
                    else if (item.best === 1) cls = 'rtm-single';
                    return `
                        <div class="rtm-cell ${cls}">
                            <span class="rtm-label">${item.label}</span>
                            <span class="rtm-score">${item.score > 0 ? '+' + item.score : '—'}</span>
                        </div>`;
                }).join('')}
            </div>
        `;

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent"><span class="hero-label">Gesamtpunkte</span><span class="hero-val">${data.summary.score}</span></div>
                <div class="hero-card"><span class="hero-label">Trefferquote</span><span class="hero-val">${data.summary.hitRate}</span></div>
                <div class="hero-card"><span class="hero-label">Treffer</span><span class="hero-val">${data.summary.hits}</span></div>
                <div class="hero-card"><span class="hero-label">Fehlwürfe</span><span class="hero-val" style="color:var(--miss-color)">${data.summary.misses}</span></div>
            </div>

            <div class="res-section-title" style="margin:16px 0 8px;">TREFFER PRO ZIEL</div>
            <div class="res-matrix-legend">
                <span class="rtm-cell rtm-triple" style="padding:3px 10px; font-size:0.7rem;">Triple</span>
                <span class="rtm-cell rtm-double" style="padding:3px 10px; font-size:0.7rem;">Double</span>
                <span class="rtm-cell rtm-single" style="padding:3px 10px; font-size:0.7rem;">Single</span>
                <span class="rtm-cell rtm-miss"   style="padding:3px 10px; font-size:0.7rem;">Miss</span>
            </div>
            ${matrixHTML}

            <div class="res-two-col" style="margin-top:20px;">
                <div class="res-chart-card">
                    <div class="res-section-title">PUNKTE PRO ZIEL</div>
                    <canvas id="resultTrendChart"></canvas>
                </div>
                <div class="res-side-card">
                    <div class="res-section-title">VERTEILUNG</div>
                    <div class="res-power-list">
                        <div class="res-power-row"><span>Singles (1 Pkt)</span><strong>${data.distribution.singles}</strong></div>
                        <div class="res-power-row accent"><span>Doubles (2 Pkt)</span><strong>${data.distribution.doubles}</strong></div>
                        <div class="res-power-row gold"><span>Triples (3 Pkt)</span><strong>${data.distribution.triples}</strong></div>
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => this.renderChart(data.chart, 'Punkte pro Ziel'), 0);
    },

    // ── SHANGHAI ──────────────────────────────────────────────────────────────
    _renderShanghaiDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        // Pro Runde: Ziel, Score, beste Dart-Qualität
        const roundItems = player.turns.map((turn, i) => {
            const target = session.targets[i] ?? (i + 1);
            const label = target === 25 ? 'B' : String(target);
            const score = turn.score ?? 0;
            let best = 0;
            (turn.darts || []).forEach(d => {
                if (!d.isMiss && d.multiplier > best) best = d.multiplier;
            });
            return { label, score, best };
        });

        const roundsHTML = `
            <div class="res-rounds-grid">
                ${roundItems.map(r => {
                    let cls = 'rrg-miss';
                    if (r.best === 3) cls = 'rrg-triple';
                    else if (r.best === 2) cls = 'rrg-double';
                    else if (r.best === 1) cls = 'rrg-single';
                    return `
                        <div class="rrg-cell ${cls}">
                            <span class="rrg-label">${r.label}</span>
                            <span class="rrg-score">${r.score > 0 ? r.score : '—'}</span>
                        </div>`;
                }).join('')}
            </div>
        `;

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent"><span class="hero-label">Gesamtpunkte</span><span class="hero-val">${data.summary.score}</span></div>
                <div class="hero-card"><span class="hero-label">Trefferquote</span><span class="hero-val">${data.summary.hitRate}</span></div>
                <div class="hero-card"><span class="hero-label">Runden</span><span class="hero-val">${player.turns.length}</span></div>
                <div class="hero-card"><span class="hero-label">Fehlwürfe</span><span class="hero-val" style="color:var(--miss-color)">${data.summary.misses}</span></div>
            </div>

            <div class="res-section-title" style="margin:16px 0 8px;">RUNDENERGEBNIS</div>
            ${roundsHTML}

            <div class="res-two-col" style="margin-top:20px;">
                <div class="res-chart-card">
                    <div class="res-section-title">SCORE PRO RUNDE</div>
                    <canvas id="resultTrendChart"></canvas>
                </div>
                <div class="res-side-card">
                    <div class="res-section-title">VERTEILUNG</div>
                    <div class="res-power-list">
                        <div class="res-power-row"><span>Singles</span><strong>${data.distribution.singles}</strong></div>
                        <div class="res-power-row accent"><span>Doubles</span><strong>${data.distribution.doubles}</strong></div>
                        <div class="res-power-row gold"><span>Triples</span><strong>${data.distribution.triples}</strong></div>
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => this.renderChart(data.chart, 'Score pro Runde'), 0);
    },

    // ── AROUND THE BOARD ──────────────────────────────────────────────────────
    _renderAtbDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        const matrixHTML = `
            <div class="res-atb-matrix">
                ${(data.matrix || []).map(item => {
                    let cls = '';
                    if (item.heatClass === 'heat-high')   cls = 'atb-heat-high';
                    else if (item.heatClass === 'heat-medium') cls = 'atb-heat-mid';
                    else cls = 'atb-heat-low';
                    return `
                        <div class="res-atb-cell ${cls}">
                            <span class="res-atb-label">${item.label}</span>
                            <span class="res-atb-val">${item.val}</span>
                        </div>`;
                }).join('')}
            </div>
        `;

        const statusIcon = player.finished ? '✅' : '⛔';
        const statusText = player.finished ? 'Kurs komplett' : 'Vorzeitig beendet';

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent"><span class="hero-label">Darts Total</span><span class="hero-val">${data.summary.score}</span></div>
                <div class="hero-card"><span class="hero-label">Trefferquote</span><span class="hero-val">${data.summary.hitRate}</span></div>
                <div class="hero-card"><span class="hero-label">Treffer</span><span class="hero-val">${data.summary.hits}</span></div>
                <div class="hero-card">
                    <span class="hero-label">Status</span>
                    <span class="hero-val" style="font-size:1.4rem">${statusIcon}</span>
                    <span style="font-size:0.7rem;color:#666">${statusText}</span>
                </div>
            </div>
            <div class="res-section-title" style="margin:16px 0 8px;">DARTS PRO ZIEL <small style="color:#555;font-size:0.7rem;font-weight:400;">(grün = 1 Dart, gelb = 2-3, rot = 4+)</small></div>
            ${matrixHTML}
        `;
    },

    // ── BOB'S 27 ──────────────────────────────────────────────────────────────
    _renderBobsDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);
        if (!data) return;
        const sum = data.summary;

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent">
                    <span class="hero-label">Final Score</span>
                    <span class="hero-val" style="color:${sum.statusClass === 'res-win' ? 'var(--accent-color)' : 'var(--miss-color)'}">${sum.finalScore}</span>
                </div>
                <div class="hero-card"><span class="hero-label">Max Score</span><span class="hero-val" style="color:#eab308">${sum.maxScore}</span></div>
                <div class="hero-card"><span class="hero-label">Treffer</span><span class="hero-val">${sum.totalHits}</span></div>
                <div class="hero-card"><span class="hero-label">Runden</span><span class="hero-val">${sum.roundsPlayed} / 21</span></div>
            </div>
            <div class="res-two-col">
                <div class="res-chart-card">
                    <div class="res-section-title">SCORE VERLAUF</div>
                    <canvas id="bobsResultChart"></canvas>
                </div>
                <div class="res-side-card res-bobs-rounds">
                    <div class="res-section-title">RUNDENVERLAUF</div>
                    <div class="res-bobs-list">
                        ${data.history.map(row => `
                            <div class="res-bobs-row">
                                <span class="rbl-target">${row.target}</span>
                                <span class="rbl-result ${row.hits > 0 ? 'rbl-hit' : 'rbl-miss'}">${row.hits > 0 ? row.hits + '×' : '—'}</span>
                                <span class="rbl-change" style="color:${row.change > 0 ? 'var(--accent-color)' : 'var(--miss-color)'}">${row.change > 0 ? '+' : ''}${row.change}</span>
                                <span class="rbl-total" style="color:${row.scoreAfter >= 0 ? '#ccc' : 'var(--miss-color)'}">${row.scoreAfter}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;

        setTimeout(() => {
            const ctx = document.getElementById('bobsResultChart');
            if (ctx) {
                new Chart(ctx.getContext('2d'), {
                    type: 'line',
                    data: {
                        labels: data.chart.labels,
                        datasets: [{
                            data: data.chart.values,
                            borderColor: '#00d26a',
                            backgroundColor: 'rgba(0,210,106,0.1)',
                            borderWidth: 2, tension: 0.3, fill: true,
                            pointRadius: 3
                        }]
                    },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                            x: { display: false }
                        }
                    }
                });
            }
        }, 0);
    },

    // ── HALVE IT ──────────────────────────────────────────────────────────────
    // Timeline: jede Runde als Balken (grün = getroffen, rot = halbiert)
    _renderHalveItDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        // Timeline aus player.turns aufbauen
        const timelineHTML = `
            <div class="res-halve-timeline">
                ${player.turns.map((turn, i) => {
                    const target = session.targets[i];
                    const targetLabel = this._formatHalveTarget(target);
                    const halved = turn.wasHalved;
                    const score  = turn.totalScoreAfter ?? turn.score ?? 0;
                    const added  = turn.score ?? 0;
                    return `
                        <div class="rht-cell ${halved ? 'rht-halved' : 'rht-ok'}">
                            <span class="rht-target">${targetLabel}</span>
                            <span class="rht-delta">${halved ? '½' : (added > 0 ? '+' + added : '—')}</span>
                            <span class="rht-total">${score}</span>
                        </div>`;
                }).join('')}
            </div>
        `;

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent"><span class="hero-label">Endstand</span><span class="hero-val">${data.summary.totalScore}</span></div>
                <div class="hero-card"><span class="hero-label">Halbiert</span><span class="hero-val" style="color:var(--miss-color)">${data.summary.halvings}×</span></div>
                <div class="hero-card"><span class="hero-label">Perfekte Runden</span><span class="hero-val" style="color:#eab308">${data.summary.perfectRounds}</span></div>
                <div class="hero-card"><span class="hero-label">Trefferquote</span><span class="hero-val">${data.summary.hitRate}</span></div>
            </div>
            <div class="res-section-title" style="margin:16px 0 8px;">RUNDENVERLAUF <small style="color:#555;font-size:0.7rem;font-weight:400;">grün = Ziel getroffen · rot = halbiert</small></div>
            ${timelineHTML}
            <div class="res-chart-card" style="margin-top:20px;">
                <div class="res-section-title">SCORE VERLAUF</div>
                <canvas id="halveItChart"></canvas>
            </div>
        `;

        setTimeout(() => {
            const ctx = document.getElementById('halveItChart');
            if (ctx && data.chart) {
                new Chart(ctx, {
                    type: 'line',
                    data: { labels: data.chart.labels, datasets: data.chart.datasets },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                            x: { ticks: { color: '#888', font: { size: 9 }, maxTicksLimit: 16 } }
                        }
                    }
                });
            }
        }, 0);
    },

    _formatHalveTarget(t) {
        if (t === 'ANY_DOUBLE') return 'D';
        if (t === 'ANY_TRIPLE') return 'T';
        if (t === 'BULL') return 'B';
        if (t === 'ALL') return 'A';
        return String(t ?? '?');
    },

    // ── SCORING DRILL ─────────────────────────────────────────────────────────
    _renderScoringDrillDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent"><span class="hero-label">Total Score</span><span class="hero-val">${data.summary.totalScore}</span></div>
                <div class="hero-card"><span class="hero-label">Average</span><span class="hero-val">${data.summary.avg}</span></div>
                <div class="hero-card"><span class="hero-label">Darts</span><span class="hero-val">${data.summary.dartsThrown} / ${data.summary.limit}</span></div>
            </div>
            <div class="res-two-col">
                <div class="res-chart-card">
                    <div class="res-section-title">SCORE VERLAUF</div>
                    <canvas id="scoringDrillChart"></canvas>
                </div>
                <div class="res-side-card">
                    <div class="res-section-title">POWER SCORES</div>
                    <div class="res-power-list">
                        <div class="res-power-row"><span>100+</span><strong>${data.powerScores.ton}</strong></div>
                        <div class="res-power-row"><span>140+</span><strong>${data.powerScores.ton40}</strong></div>
                        <div class="res-power-row gold"><span>180</span><strong>${data.powerScores.max}</strong></div>
                    </div>
                    <div class="res-section-title" style="margin-top:20px;">HEATMAP</div>
                    <div class="heatmap-container res-heatmap" id="result-heatmap-box">${StatsBoard.generateSVG(200)}</div>
                </div>
            </div>
        `;
        setTimeout(() => {
            this.applyHeatmap(data.heatmap);
            const ctx = document.getElementById('scoringDrillChart');
            if (ctx && data.chart) {
                new Chart(ctx, {
                    type: 'line',
                    data: { labels: data.chart.labels, datasets: data.chart.datasets },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                            x: { ticks: { color: '#888', font: { size: 10 } } }
                        }
                    }
                });
            }
        }, 0);
    },

    // ── CHECKOUT CHALLENGE ────────────────────────────────────────────────────
    _renderCheckoutChallengeDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data = GameEngine.getResultData(session, player);

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent"><span class="hero-label">Gesamtpunkte</span><span class="hero-val">${data.summary.totalScore}</span></div>
                <div class="hero-card"><span class="hero-label">Checkout-Rate</span><span class="hero-val">${data.summary.checkoutRate}</span></div>
                <div class="hero-card"><span class="hero-label">Checkouts</span><span class="hero-val">${data.summary.checkoutsHit} / ${data.summary.checkoutsTotal}</span></div>
            </div>
            <div class="res-two-col">
                <div class="res-chart-card">
                    <div class="res-section-title">CHECKOUT VERLAUF</div>
                    <canvas id="checkoutResultChart"></canvas>
                </div>
                <div class="res-side-card">
                    <div class="res-section-title">HEATMAP</div>
                    <div class="heatmap-container res-heatmap" id="result-heatmap-box">${StatsBoard.generateSVG(200)}</div>
                </div>
            </div>
        `;
        setTimeout(() => {
            this.applyHeatmap(data.heatmap);
            const ctx = document.getElementById('checkoutResultChart');
            if (ctx && data.chart) {
                new Chart(ctx, {
                    type: 'line',
                    data: { labels: data.chart.labels, datasets: data.chart.datasets },
                    options: {
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                            x: { ticks: { color: '#888', font: { size: 10 } } }
                        }
                    }
                });
            }
        }, 0);
    },

    // ══════════════════════════════════════════════════════════════════════════
    //  SHARED HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    renderChart: function(chartData, label) {
        const ctx = document.getElementById('resultTrendChart');
        if (!ctx) return;
        if (resultChartInstance) { resultChartInstance.destroy(); resultChartInstance = null; }
        resultChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.labels,
                datasets: [{
                    label: label || 'Verlauf',
                    data: chartData.values,
                    borderColor: '#00d26a',
                    backgroundColor: 'rgba(0,210,106,0.08)',
                    fill: true, tension: 0.3, pointRadius: 3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
                    x: { ticks: { color: '#888', font: { size: 10 } } }
                },
                plugins: { legend: { display: false } }
            }
        });
    },

    applyHeatmap: function(heatmapData) {
        if (!heatmapData) return;
        const values = Object.values(heatmapData);
        if (!values.length) return;
        const maxHits = Math.max(...values);
        const svg = document.getElementById('result-heatmap-box');
        if (!svg) return;
        Object.entries(heatmapData).forEach(([segId, hits]) => {
            const elementId = `seg-${segId}`;
            const elements = [];
            if (segId.startsWith('S')) {
                const elO = svg.querySelector(`#${elementId}-O`);
                const elI = svg.querySelector(`#${elementId}-I`);
                if (elO) elements.push(elO);
                if (elI) elements.push(elI);
            } else {
                const el = svg.querySelector(`#${elementId}`);
                if (el) elements.push(el);
            }
            const intensity = hits / maxHits;
            const heatClass = intensity > 0.7 ? 'heat-high' : intensity > 0.3 ? 'heat-medium' : 'heat-low';
            elements.forEach(el => el.classList.add(heatClass));
        });
    }
};
