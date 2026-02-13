import { State } from '../core/state.js';
import { UI } from './ui-core.js';

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
        const players = State.getAvailablePlayers() || [];

        container.innerHTML = `
            ${this._renderHeader(player, players)}
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

        // Player selector dropdown (nur wenn >1 Spieler)
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
                <div class="dash-header-top">
                    <div class="dash-greeting">
                        <span class="dash-greeting-text">${greeting},</span>
                        ${selectorHtml}
                    </div>
                </div>
                <p class="dash-subtitle">Jeder Dart zählt. Heute wirst du besser als gestern.</p>
            </div>
        `;
    },

    _renderMatchSection(player) {
        const matchGames = Object.entries(GAMES).filter(([, g]) => g.category === 'match');

        const cards = matchGames.map(([id, game]) => {
            const stat = player ? this._getQuickStat(player, id) : null;
            return this._renderMatchCard(id, game, stat);
        }).join('');

        return `
            <div class="dash-section">
                <div class="dash-section-header">
                    <span class="dash-section-icon">⚔️</span>
                    <h3 class="dash-section-title">MATCH</h3>
                </div>
                <div class="dash-match-grid">${cards}</div>
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

        return `
            <div class="dash-section">
                <div class="dash-section-header">
                    <span class="dash-section-icon">🏋️</span>
                    <h3 class="dash-section-title">TRAINING</h3>
                </div>
                <div class="dash-training-grid">${cards}</div>
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
        return `
            <div class="dash-section">
                <div class="dash-section-header">
                    <span class="dash-section-icon">📋</span>
                    <h3 class="dash-section-title">TRAININGSPLÄNE</h3>
                    <span class="dash-coming-soon">COMING SOON</span>
                </div>
                <div class="dash-plan-card">
                    <div class="dash-plan-body">
                        <div class="dash-plan-icon">📋</div>
                        <div class="dash-plan-text">
                            <strong>Kuratierte Trainingsroutinen</strong>
                            <p>Kombiniere verschiedene Übungen zu strukturierten Sessions. 
                            Double Mastery, Checkout Challenge, Warm-Up Routinen und mehr.</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    _renderQuickNav() {
        return `
            <div class="dash-quicknav">
                <button class="dash-nav-btn" id="dash-go-stats">
                    <span class="dash-nav-icon">📊</span>
                    <span>Statistik</span>
                </button>
                <button class="dash-nav-btn" id="dash-go-settings">
                    <span class="dash-nav-icon">⚙️</span>
                    <span>Verwaltung</span>
                </button>
            </div>
        `;
    },

    // ═══════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════

    _bindEvents() {
        // Player selector
        const select = document.getElementById('dash-player-select');
        if (select) {
            select.onchange = (e) => {
                activePlayerId = e.target.value;
                this.render();
            };
        }

        // Game cards → open Setup for that game
        document.querySelectorAll('.dash-card[data-game]').forEach(card => {
            card.onclick = () => {
                const gameId = card.dataset.game;
                this._openGame(gameId);
            };
        });

        // Quick nav
        const btnStats = document.getElementById('dash-go-stats');
        if (btnStats) {
            btnStats.onclick = () => {
                // Delegate to existing Stats init from ui-core
                const { Stats } = window._dashModules || {};
                if (Stats) Stats.init();
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
                const avg = latest.stats?.summary?.avg;
                return avg ? { label: `Avg ${avg}`, time } : { label: `${games.length} Spiele`, time };
            }
            case 'cricket': {
                const mpr = latest.stats?.summary?.mpr;
                return mpr ? { label: `MPR ${mpr}`, time } : { label: `${games.length} Spiele`, time };
            }
            case 'single-training': {
                const hr = latest.stats?.summary?.hitRate || latest.stats?.summary?.accuracy;
                return hr ? { label: `${hr}% Hit-Rate`, time } : { label: `Score: ${latest.totalScore || '-'}`, time };
            }
            case 'shanghai': {
                const best = Math.max(...games.map(g => g.totalScore || 0));
                return { label: `PB: ${best}`, time };
            }
            case 'bobs27': {
                const best = Math.max(...games.map(g => g.totalScore || 0));
                return { label: `PB: ${best}`, time };
            }
            case 'around-the-board': {
                const scores = games.map(g => g.totalScore).filter(Boolean);
                if (scores.length === 0) return { label: `${games.length} Spiele`, time };
                const best = Math.min(...scores);
                return { label: `⚡ ${best} Darts`, time };
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
        const players = State.getAvailablePlayers() || [];
        if (players.length > 0) activePlayerId = players[0].id;
    },

    _getActivePlayer() {
        if (!activePlayerId) return null;
        return (State.getAvailablePlayers() || []).find(p => p.id === activePlayerId) || null;
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
