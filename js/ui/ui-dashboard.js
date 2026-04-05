import { State } from '../core/state.js';
import { UI } from './ui-core.js';
import { TRAINING_PLANS } from '../games/training-plans.js';
import { Setup } from './ui-setup.js';
import { StatsService } from '../core/stats-service.js';

// ─── GAME METADATA ─────────────────────────────────────────────
const GAMES = {
    // ── MATCH ──
    'x01':              { label: 'X01',              category: 'match',    accent: '#3b82f6', icon: '🎯', desc: '301 / 501 / 701 · Double-Out' },
    'cricket':          { label: 'Cricket',          category: 'match',    accent: '#8b5cf6', icon: '🏏', desc: '15–20 + Bull · Marks & Points' },

    // ── TRAINING ──
    'single-training':  { label: 'Single Training',  category: 'training', accent: '#10b981', icon: '🎓', desc: '21 Ziele · Hit-Rate messen' },
    'shanghai':         { label: 'Shanghai',         category: 'training', accent: '#f59e0b', icon: '🀄', desc: 'S+D+T = Sofort-Sieg!' },
    'bobs27':           { label: "Bob's 27",         category: 'training', accent: '#ef4444', icon: '🔴', desc: 'Doubles unter Druck' },
    'around-the-board': { label: 'Around the Board', category: 'training', accent: '#06b6d4', icon: '🔄', desc: '1–20 + Bull · Darts zählen' },
	'checkout-challenge': { label: 'Checkout Challenge', category: 'training', accent: '#e11d48', icon: '🔥', desc: 'Checke 80, 130, 170... in 9 Darts!' },
	'halve-it': { label: 'Halve It', category: 'training', accent: '#f59e0b', icon: '✂️', desc: 'Triff oder dein Score wird halbiert!' },
	'scoring-drill': { label: 'Scoring Drill', category: 'training', accent: '#0ea5e9', icon: '📈', desc: '99 Darts Highscore Jagd' },
	'segment-master': { label: 'Segment Master', category: 'training', accent: '#8b5cf6', icon: '🎯', desc: 'Beherrsche ein Segment in 30 Darts' },
    'killer': { label: 'Killer', category: 'match', accent: '#dc2626', icon: '🔪', desc: 'Letzter Überlebender gewinnt' },
	
	// ── PLÄNE ──
    'warmup-quick':    { label: 'Quick Warm-Up',     category: 'plan', accent: '#8b5cf6', icon: '🔥', desc: '10 Min · Scoring & ATB' },
    'checkout-pro':    { label: 'Finishing School',   category: 'plan', accent: '#10b981', icon: '🎯', desc: '20 Min · Checkouts & Bobs' },
    'full-workout':    { label: 'The Grinder',        category: 'plan', accent: '#6366f1', icon: '💪', desc: '45 Min · Das Komplettprogramm' },
    'double-trouble':  { label: 'Double Trouble',     category: 'plan', accent: '#ef4444', icon: '🔴', desc: '25 Min · Bobs, Doppel & Checkout' },
    'the-diagnostic':  { label: 'The Diagnostic',     category: 'plan', accent: '#f59e0b', icon: '📊', desc: '30 Min · Dein Stärken-Profil' },
};

// ─── PRIVATE STATE ─────────────────────────────────────────────
let activePlayerId = null;

// ═══════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════

export const Dashboard = {

    init() {
        this._ensureActivePlayer();
        this.render();
    },

    render() {
        const container = document.getElementById('dashboard-content');
        if (!container) return;

        const player = this._getActivePlayer();
        const allPlayers = State.getAvailablePlayers() || [];
        const players = allPlayers.filter(p => !p.isBot);

        container.innerHTML = `
            ${this._renderHeader(player, players)}
            ${this._renderDiagnosticProfile(player)}
            ${this._renderMatchSection(player)}
            ${this._renderTrainingSection(player)}
            ${this._renderTrainingPlanSection()}
            ${this._renderQuickNav()}
        `;

        this._bindEvents();
    },

    getActivePlayerId() {
        return activePlayerId;
    },

    // ═══════════════════════════════════════════════════════════
    //  SECTIONS
    // ═══════════════════════════════════════════════════════════

    _renderHeader(player, players) {
        const greeting = this._getGreeting();
        const playerName = player ? player.name : 'Gast';

        // Player selector dropdown
        let selectorHtml = '';
        if (players.length > 1) {
            const opts = players.map(p =>
                `<option value="${p.id}" ${p.id === activePlayerId ? 'selected' : ''}>${this._esc(p.name)}</option>`
            ).join('');
            selectorHtml = `
                <select id="dash-player-select" class="dash-player-select">${opts}</select>
            `;
        } else if (players.length === 1) {
            selectorHtml = `<span class="dash-player-name">${this._esc(playerName)}</span>`;
        }

        return `
            <div class="dash-header">
                <div class="dash-header-grid">
                    
                    <div></div>

                    <div class="dash-greeting" style="display: flex; align-items: baseline; gap: 8px; justify-content: center;">
                        <span class="dash-greeting-text" style="white-space: nowrap;">${greeting},</span>
                        ${selectorHtml}
                    </div>

                    <div class="dash-header-actions">
                        <button id="dash-go-stats" class="header-btn" style="width: auto; padding: 0 15px; display: flex; align-items: center; gap: 8px; ">
                            <span style="font-size: 1.1rem;">📊</span>
                            <span style="font-weight: 600; font-size: 0.9rem;">Statistik öffnen</span>
                        </button>
                    </div>
                </div>
                
                <p class="dash-subtitle">Jeder Dart zählt. Heute wirst du besser als gestern.</p>
            </div>
        `;
    },

    _renderDiagnosticProfile(player) {
        const profile = player?.diagnosticProfile;
        if (!profile?.scores) return '';

        const scores     = profile.scores;
        const date       = profile.date ? new Date(profile.date).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '';
        const trendScores = StatsService.getLatestTrendScores(player.id);

        const axes = [
            { key: 'scoring',   label: 'Scoring',   emoji: '📈', color: '#0ea5e9' },
            { key: 'doubles',   label: 'Doppel',    emoji: '🎯', color: '#10b981' },
            { key: 'checkout',  label: 'Checkout',  emoji: '✅', color: '#f59e0b' },
            { key: 'precision', label: 'Präzision', emoji: '🔬', color: '#8b5cf6' },
            { key: 'match',     label: 'Match',     emoji: '⚔️', color: '#ef4444' },
        ];

        const overall      = Math.round(axes.reduce((s, a) => s + (scores[a.key] ?? 0), 0) / axes.length);
        const overallColor = overall >= 70 ? '#10b981' : overall >= 40 ? '#f59e0b' : '#ef4444';

        const barsHtml = axes.map(a => {
            const val   = scores[a.key] ?? 0;
            const hint  = val >= 70 ? 'Stärke' : val >= 40 ? 'Solide' : 'Üben';
            const t     = trendScores[a.key];
            const trendHtml = t
                ? `<span class="diag-trend diag-trend-${t.trend === '↑' ? 'up' : t.trend === '↓' ? 'down' : 'flat'}">${t.trend}${t.delta !== null ? (t.delta > 0 ? '+' : '') + t.delta : ''}</span>`
                : '';
            return `
                <div class="diag-bar-row">
                    <span class="diag-bar-label">${a.emoji} ${a.label}</span>
                    <div class="diag-bar-track">
                        <div class="diag-bar-fill" style="width:${val}%; background:${a.color};"></div>
                    </div>
                    <span class="diag-bar-val" style="color:${a.color}">${val}</span>
                    <span class="diag-bar-hint">${hint}</span>
                    ${trendHtml}
                </div>`;
        }).join('');

        const canvasId = 'dash-diag-radar';

        return `
            <div class="diag-profile-card dash-acc-item" id="diag-acc-item">
                <div class="diag-acc-header" id="diag-acc-toggle">
                    <div class="diag-header-left">
                        <span class="diag-acc-icon">📊</span>
                        <div>
                            <div class="diag-title">STÄRKEN-PROFIL</div>
                            <div class="diag-subtitle">The Diagnostic · ${date}</div>
                        </div>
                    </div>
                    <div class="diag-header-right">
                        <div class="diag-overall" style="color:${overallColor}">${overall}<span class="diag-overall-sub">/100</span></div>
                        <span class="dash-acc-arrow">▼</span>
                    </div>
                </div>
                <div class="diag-acc-content">
                    <div class="diag-body">
                        <canvas id="${canvasId}" class="diag-radar-canvas" width="200" height="200"></canvas>
                        <div class="diag-bars">${barsHtml}</div>
                    </div>
                    <div class="diag-footer">
                        Starte <strong>The Diagnostic</strong> erneut um dein Profil zu aktualisieren.
                    </div>
                </div>
            </div>`;
    },

    _drawDashDiagRadar(canvasId, axes, scores) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2, cy = canvas.height / 2;
        const R  = Math.min(cx, cy) - 20;
        const n  = axes.length;
        const toRad = i => (Math.PI * 2 * i / n) - Math.PI / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Gitter
        [20, 40, 60, 80, 100].forEach(lvl => {
            ctx.beginPath();
            axes.forEach((_, i) => {
                const r = R * lvl / 100;
                const x = cx + r * Math.cos(toRad(i)), y = cy + r * Math.sin(toRad(i));
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1; ctx.stroke();
        });

        // Achsen
        axes.forEach((_, i) => {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + R * Math.cos(toRad(i)), cy + R * Math.sin(toRad(i)));
            ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.stroke();
        });

        // Fläche
        ctx.beginPath();
        axes.forEach((a, i) => {
            const r = R * (scores[a.key] ?? 0) / 100;
            const x = cx + r * Math.cos(toRad(i)), y = cy + r * Math.sin(toRad(i));
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle   = 'rgba(234,179,8,0.15)';
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth   = 2; ctx.fill(); ctx.stroke();

        // Punkte
        axes.forEach((a, i) => {
            const r = R * (scores[a.key] ?? 0) / 100;
            ctx.beginPath();
            ctx.arc(cx + r * Math.cos(toRad(i)), cy + r * Math.sin(toRad(i)), 3, 0, Math.PI * 2);
            ctx.fillStyle = '#eab308'; ctx.fill();
        });
    },

    _renderMatchSection(player) {
        const matchGames = Object.entries(GAMES).filter(([, g]) => g.category === 'match');
        
        const cards = matchGames.map(([id, game]) => {
            const stat = player ? this._getQuickStat(player, id) : null;
            return this._renderMatchCard(id, game, stat);
        }).join('');

        // MATCH ist standardmäßig offen ("open" Klasse)
        return `
            <div class="dash-acc-item" data-acc-id="match">
                <div class="dash-acc-header">
                    <div class="dash-acc-title-group">
                        <span class="dash-acc-icon">⚔️</span>
                        <span class="dash-acc-text">MATCH</span>
                    </div>
                    <span class="dash-acc-arrow">▼</span>
                </div>
                <div class="dash-acc-content">
                    <div class="dash-match-grid">${cards}</div>
                </div>
            </div>
        `;
    },

    _renderMatchCard(gameId, game, stat) {
        const statLine = stat
            ? `<div class="dash-card-stat">${stat.label} <span class="dash-stat-time">· ${stat.time}</span></div>`
            : `<div class="dash-card-stat dash-stat-empty">Noch kein Spiel</div>`;

        return `
            <div class="dash-card dash-card-match" data-game="${gameId}" style="--card-accent: ${game.accent}">
                <div class="dash-card-accent"></div>
                <div class="dash-card-body">
                    <div class="dash-card-top">
                        <span class="dash-card-icon">${game.icon}</span>
                        <span class="dash-card-label">${game.label}</span>
                    </div>
                    <div class="dash-card-desc">${game.desc}</div>
                    ${statLine}
                    <div class="dash-card-action">
                        <span class="dash-play-btn">SPIELEN →</span>
                    </div>
                </div>
            </div>
        `;
    },

    _renderTrainingSection(player) {
        const trainingGames = Object.entries(GAMES).filter(([, g]) => g.category === 'training');

        const cards = trainingGames.map(([id, game]) => {
            const stat = player ? this._getQuickStat(player, id) : null;
            return this._renderTrainingCard(id, game, stat);
        }).join('');

        // TRAINING ist standardmäßig zu (keine "open" Klasse)
        return `
            <div class="dash-acc-item open" data-acc-id="training">
                <div class="dash-acc-header">
                    <div class="dash-acc-title-group">
                        <span class="dash-acc-icon">🏋️</span>
                        <span class="dash-acc-text">TRAINING</span>
                    </div>
                    <span class="dash-acc-arrow">▼</span>
                </div>
                <div class="dash-acc-content">
                    <div class="dash-training-grid">${cards}</div>
                </div>
            </div>
        `;
    },

    _renderTrainingCard(gameId, game, stat) {
        const statLine = stat
            ? `<div class="dash-tcard-stat">${stat.label}</div>`
            : '';

        return `
            <div class="dash-card dash-card-training" data-game="${gameId}" style="--card-accent: ${game.accent}">
                <div class="dash-tcard-icon">${game.icon}</div>
                <div class="dash-tcard-label">${game.label}</div>
                <div class="dash-tcard-desc">${game.desc}</div>
                ${statLine}
            </div>
        `;
    },

    _renderTrainingPlanSection() {
        const planGames = Object.entries(GAMES).filter(([, g]) => g.category === 'plan');
        if (planGames.length === 0) return '';

        const cards = planGames.map(([id, game]) => {
            return this._renderTrainingPlanCard(id, game);
        }).join('');

        // PLÄNE sind standardmäßig zu
        return `
            <div class="dash-acc-item" data-acc-id="plans">
                <div class="dash-acc-header">
                    <div class="dash-acc-title-group">
                        <span class="dash-acc-icon">📋</span>
                        <span class="dash-acc-text">TRAININGSPLÄNE</span>
                    </div>
                    <span class="dash-acc-arrow">▼</span>
                </div>
                <div class="dash-acc-content">
                    <div class="dash-training-grid">${cards}</div>
                </div>
            </div>
        `;
    },
	
	_renderTrainingPlanCard(planId, game) {
        return `
            <div class="dash-card dash-card-training dash-card-plan" data-plan="${planId}" style="--card-accent: ${game.accent}">
                <div class="dash-tcard-icon">${game.icon}</div>
                <div class="dash-tcard-label">${game.label}</div>
                <div class="dash-tcard-desc">${game.desc}</div>
                <div class="dash-tcard-stat" style="margin-top:auto; font-size:0.8rem; opacity:0.8;">
                    Kuratierter Plan
                </div>
            </div>
        `;
    },

    _renderQuickNav() {
        return `
            <div class="dash-quicknav" style="display:flex; justify-content:center; padding: 20px 0; color: #444; font-size: 1.2rem; font-style: italic;">
                Mit ♥️ und Claude entwickelt.
            </div>
        `;
    },

    // ═══════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════

    _bindEvents() {
        // 1. Player selector
        const select = document.getElementById('dash-player-select');
        if (select) {
            select.onchange = (e) => {
                activePlayerId = e.target.value;
                this.render();
            };
        }
		
		const accHeaders = document.querySelectorAll('.dash-acc-header');
        accHeaders.forEach(header => {
            header.onclick = () => {
                const item = header.closest('.dash-acc-item');
                const wasOpen = item.classList.contains('open');

                // 1. Alle schließen (Exklusives Verhalten)
                document.querySelectorAll('.dash-acc-item').forEach(i => i.classList.remove('open'));

                // 2. Geklicktes öffnen (wenn es vorher zu war)
                if (!wasOpen) {
                    item.classList.add('open');
                    
                    // Optional: Sanft zum geöffneten Element scrollen, falls es außerhalb liegt
                    setTimeout(() => {
                        item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 100);
                }
            };
        });

        // 2. REGULÄRE SPIELE (Match & Training) - DAS FEHLTE
        document.querySelectorAll('.dash-card[data-game]').forEach(card => {
            card.onclick = () => {
                const gameId = card.dataset.game;
                this._openGame(gameId);
            };
        });

        // 3. TRAININGSPLÄNE (Neu)
        document.querySelectorAll('.dash-card[data-plan]').forEach(card => {
            card.onclick = () => {
                const planId = card.dataset.plan;
                // Den echten Plan aus der Import-Datei suchen
                const plan = TRAINING_PLANS.find(p => p.id === planId);
				const currentPlayerId = activePlayerId || this.getActivePlayerId();
                
                if (plan && Setup.showPlanPreview) {
                    Setup.showPlanPreview(plan, currentPlayerId);
                } else {
                    console.warn("Plan Preview not available or plan not found");
                }
            };
        });

        // 4. Quick nav Buttons
        const btnStats = document.getElementById('dash-go-stats');
        if (btnStats) {
            btnStats.onclick = () => {
                // Delegate to existing Stats init from ui-core
                const { Stats } = window._dashModules || {};
                if (Stats) Stats.init(activePlayerId);
                UI.showScreen('screen-stats');
            };
        }

        const btnSettings = document.getElementById('dash-go-settings');
        if (btnSettings) {
            btnSettings.onclick = () => {
                const { Management } = window._dashModules || {};
                if (Management) Management.init();
                UI.showScreen('screen-management');
            };
        }

        // 5. Diagnostic Radar zeichnen (nach DOM-Aufbau)
        const player = this._getActivePlayer();
        if (player?.diagnosticProfile?.scores) {
            const axes = [
                { key: 'scoring' }, { key: 'doubles' }, { key: 'checkout' },
                { key: 'precision' }, { key: 'match' }
            ];

            // Toggle-Handler
            const toggle = document.getElementById('diag-acc-toggle');
            const item   = document.getElementById('diag-acc-item');
            if (toggle && item) {
                toggle.onclick = () => {
                    const opening = !item.classList.contains('open');
                    item.classList.toggle('open', opening);
                    // Radar erst zeichnen wenn sichtbar
                    if (opening) {
                        setTimeout(() => this._drawDashDiagRadar('dash-diag-radar', axes, player.diagnosticProfile.scores), 50);
                    }
                };
            }

            // Standardmäßig zugeklappt – kein Radar-Zeichnen beim Start nötig
        }
    },

    _openGame(gameId) {
        // Integration point: Tell Setup which game to open
        // Option A: If Setup has a direct openSetupFor(gameId) method
        // Option B: Fallback to showGameSelector() and let user pick
        //
        // We try to use window.DartApp if it exposes Setup, 
        // or fall back to the existing flow.

        if (window.DartApp && typeof window.DartApp.openGameSetup === 'function') {
            window.DartApp.openGameSetup(gameId);
        } else if (window._dashModules?.Setup) {
            const Setup = window._dashModules.Setup;
            // Try direct game selection if available
            if (typeof Setup.selectGameAndOpenSetup === 'function') {
                Setup.selectGameAndOpenSetup(gameId);
            } else if (typeof Setup.showGameSelector === 'function') {
                Setup.showGameSelector();
            }
        }
    },

    // ═══════════════════════════════════════════════════════════
    //  QUICK STATS
    // ═══════════════════════════════════════════════════════════

    _getQuickStat(player, gameId) {
        const games = (player.history || []).filter(g => g.game === gameId);
        if (games.length === 0) return null;

        const latest = games[games.length - 1];
        const time = this._timeAgo(latest.date);

        switch (gameId) {
            case 'x01': {
                // Bestes (niedrigstes) Average
                const avgs = games.map(g => parseFloat(g.stats?.summary?.avg)).filter(v => !isNaN(v) && v > 0);
                const best = avgs.length > 0 ? Math.max(...avgs).toFixed(1) : null;
                return best ? { label: `Best Avg ${best}`, time } : { label: `${games.length} Spiele`, time };
            }
            case 'cricket': {
                const mprs = games.map(g => parseFloat(g.stats?.summary?.mpr)).filter(v => !isNaN(v) && v > 0);
                const best = mprs.length > 0 ? Math.max(...mprs).toFixed(2) : null;
                return best ? { label: `Best MPR ${best}`, time } : { label: `${games.length} Spiele`, time };
            }
            case 'single-training': {
                // Beste (höchste) Hit-Rate
                const rates = games.map(g => {
                    const hr = g.stats?.summary?.hitRate ?? g.stats?.hitRate ?? g.stats?.accuracy;
                    return parseFloat(hr);
                }).filter(v => !isNaN(v));
                const best = rates.length > 0 ? Math.max(...rates).toFixed(1) : null;
                return best ? { label: `Best ${best}% Quote`, time } : { label: `Score: ${latest.totalScore || '-'}`, time };
            }
            case 'shanghai': {
                const best = Math.max(...games.map(g => g.totalScore || 0));
                return { label: `PB: ${best}`, time };
            }
            case 'bobs27': {
                // Beste erreichte Runde + bester Score
                const bestRounds = Math.max(...games.map(g => g.turns?.length || 0));
                const bestScore = Math.max(...games.map(g => g.totalScore || 0));
                return { label: `R${bestRounds} · ${bestScore}pts`, time };
            }
            case 'around-the-board': {
                const scores = games.map(g => g.totalScore).filter(Boolean);
                if (scores.length === 0) return { label: `${games.length} Spiele`, time };
                const best = Math.min(...scores);
                return { label: `⚡ ${best} Darts`, time };
            }
			case 'checkout-challenge': {
                // Beste Checkout-Rate
                const rates = games.map(g => parseInt(g.stats?.summary?.checkoutRate)).filter(v => !isNaN(v));
                const best = rates.length > 0 ? Math.max(...rates) : 0;
                return { label: `Best: ${best}%`, time };
            }
            case 'halve-it': {
                const best = Math.max(...games.map(g => g.stats?.summary?.score ?? g.totalScore ?? 0));
                return { label: `PB: ${best}`, time };
            }
            case 'scoring-drill': {
                const avgs = games.map(g => parseFloat(g.stats?.summary?.avg ?? g.stats?.avg)).filter(v => !isNaN(v) && v > 0);
                const best = avgs.length > 0 ? Math.max(...avgs).toFixed(1) : null;
                return best ? { label: `Best PPT: ${best}`, time } : { label: `${games.length} Spiele`, time };
            }
            case 'segment-master': {
                const best = Math.max(...games.map(g => g.stats?.summary?.score ?? g.totalScore ?? 0));
                return { label: `PB: ${best} Pkt`, time };
            }
            case 'killer': {
                const wins   = games.filter(g => g.stats?.summary?.survived).length;
                const rate   = Math.round((wins / games.length) * 100);
                return { label: `Survival: ${rate}%`, time };
            }
            default:
                return { label: `${games.length} Spiele`, time };
        }
    },

    // ═══════════════════════════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════════════════════════

    _ensureActivePlayer() {
        if (activePlayerId) return;
        const players = (State.getAvailablePlayers() || []).filter(p => !p.isBot);
        if (players.length > 0) activePlayerId = players[0].id;
    },

    _getActivePlayer() {
        if (!activePlayerId) return null;
        return (State.getAvailablePlayers() || []).find(p => p.id === activePlayerId && !p.isBot) || null;
    },

    _getGreeting() {
        const h = new Date().getHours();
        if (h < 6) return 'Nachtschicht';
        if (h < 12) return 'Guten Morgen';
        if (h < 18) return 'Guten Tag';
        return 'Guten Abend';
    },

    _timeAgo(timestamp) {
        if (!timestamp) return '';
        const days = Math.floor((Date.now() - timestamp) / 86400000);
        if (days === 0) return 'heute';
        if (days === 1) return 'gestern';
        if (days < 7) return `vor ${days}d`;
        if (days < 30) return `vor ${Math.floor(days / 7)}w`;
        return `vor ${Math.floor(days / 30)}m`;
    },

    _esc(str) {
        const d = document.createElement('div');
        d.textContent = str || '';
        return d.innerHTML;
    }
};