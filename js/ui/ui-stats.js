import { State }        from '../core/state.js';
import { StatsService }  from '../core/stats-service.js';
import { UI }            from './ui-core.js';
import { StatsBoard }    from './ui-stats-board.js';

// ═══════════════════════════════════════════════════════════════════════════
//  KONSTANTEN
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORIES = [
    {
        id: 'match', label: 'Wettkampf', icon: '🏆',
        games: [
            { id: 'x01',     label: 'X01',    icon: '🎯' },
            { id: 'cricket', label: 'Cricket', icon: '🏏' },
        ]
    },
    {
        id: 'target', label: 'Ziel-Training', icon: '🎪',
        games: [
            { id: 'single-training',  label: 'Single Training',  icon: '1️⃣' },
            { id: 'around-the-board', label: 'Around the Board', icon: '🔄' },
            { id: 'shanghai',         label: 'Shanghai',         icon: '🐉' },
        ]
    },
    {
        id: 'scoring', label: 'Scoring', icon: '📊',
        games: [
            { id: 'bobs27',             label: "Bob's 27",          icon: '🎲' },
            { id: 'scoring-drill',      label: 'Scoring Drill',     icon: '⚡' },
            { id: 'halve-it',           label: 'Halve It',          icon: '✂️' },
            { id: 'checkout-challenge', label: 'Checkout Challenge', icon: '✅' },
        ]
    },
];

const VARIANTS = {
    'x01':              [{ v:'all',l:'Alle' },{ v:'301',l:'301' },{ v:'501',l:'501' },{ v:'701',l:'701' }],
    'cricket':          [{ v:'all',l:'Alle' },{ v:'nolimit',l:'Kein Limit' },{ v:'20',l:'20 Runden' },{ v:'10',l:'10 Runden' }],
    'shanghai':         [{ v:'all',l:'Alle' },{ v:'7',l:'7 Runden' },{ v:'20',l:'20 Runden' }],
    'around-the-board': [{ v:'all',l:'Alle' },{ v:'full',l:'Komplett' },{ v:'double',l:'Doubles' },{ v:'triple',l:'Triples' }],
    'scoring-drill':    [{ v:'all',l:'Alle' },{ v:'33',l:'33 Darts' },{ v:'66',l:'66 Darts' },{ v:'99',l:'99 Darts' }],
};

// ═══════════════════════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════════════════════

let _playerId  = null;
let _catId     = 'match';
let _gameId    = 'x01';
let _days      = '30';
let _variant   = 'all';
let _openMatch = null;

// ═══════════════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

export const Stats = {

    init(preSelectedPlayerId) {
        const root = document.getElementById('screen-stats');
        if (!root) return;

        const players = State.getAvailablePlayers();
        if (players.length === 0) {
            root.innerHTML = `<div class="stats-empty-state"><span>👤</span><p>Noch keine Spieler angelegt.</p></div>`;
            return;
        }

        if (preSelectedPlayerId && players.find(p => p.id === preSelectedPlayerId)) {
            _playerId = preSelectedPlayerId;
        } else if (!_playerId || !players.find(p => p.id === _playerId)) {
            _playerId = players[0].id;
        }

        this._renderShell(root, players);
        this._renderContent();
    },

    updateView() { this._renderContent(); },

    // ─── SHELL ───────────────────────────────────────────────────────────────

    _renderShell(root, players) {
        root.innerHTML = `
            <div class="stats-layout">
                <aside class="stats-sidebar">
                    <div class="stats-sidebar-section">
                        <label class="stats-sidebar-label">Spieler</label>
                        <select id="st-player" class="stats-dropdown">
                            ${players.map(p =>
                                `<option value="${p.id}" ${p.id === _playerId ? 'selected' : ''}>${_esc(p.name)}</option>`
                            ).join('')}
                        </select>
                    </div>
                    <div class="stats-sidebar-section">
                        <label class="stats-sidebar-label">Zeitraum</label>
                        <select id="st-days" class="stats-dropdown">
                            <option value="today" ${_days==='today'?'selected':''}>Heute</option>
                            <option value="7"     ${_days==='7'    ?'selected':''}>7 Tage</option>
                            <option value="30"    ${_days==='30'   ?'selected':''}>30 Tage</option>
                            <option value="365"   ${_days==='365'  ?'selected':''}>1 Jahr</option>
                            <option value="all"   ${_days==='all'  ?'selected':''}>Gesamt</option>
                        </select>
                    </div>
                    <nav class="stats-nav" id="st-nav">
                        ${CATEGORIES.map(cat => `
                            <div class="stats-nav-cat ${cat.id === _catId ? 'open':''}" data-cat="${cat.id}">
                                <button class="stats-nav-cat-btn ${cat.id === _catId ? 'active':''}">
                                    <span>${cat.icon} ${cat.label}</span>
                                    <span class="stats-nav-chevron">▾</span>
                                </button>
                                <div class="stats-nav-games">
                                    ${cat.games.map(g => `
                                        <button class="stats-nav-game ${g.id === _gameId ? 'active':''}" data-game="${g.id}">
                                            ${g.icon} ${g.label}
                                        </button>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </nav>
                </aside>
                <main class="stats-content" id="st-content">
                    <div class="stats-loading">Lade…</div>
                </main>
            </div>
        `;
        this._bindShellEvents(root);
    },

    _bindShellEvents(root) {
        root.querySelector('#st-player').onchange = e => {
            _playerId = e.target.value; _openMatch = null; this._renderContent();
        };
        root.querySelector('#st-days').onchange = e => {
            _days = e.target.value; _openMatch = null; this._renderContent();
        };
        root.querySelectorAll('.stats-nav-cat-btn').forEach(btn => {
            btn.onclick = () => {
                const cat = btn.closest('.stats-nav-cat').dataset.cat;
                if (_catId === cat) return;
                _catId = cat;
                const catDef = CATEGORIES.find(c => c.id === cat);
                _gameId = catDef.games[0].id;
                _variant = 'all'; _openMatch = null;
                this._updateNav(root);
                this._renderContent();
            };
        });
        root.querySelectorAll('.stats-nav-game').forEach(btn => {
            btn.onclick = () => {
                const g = btn.dataset.game;
                if (_gameId === g) return;
                _gameId = g; _variant = 'all'; _openMatch = null;
                this._updateNav(root);
                this._renderContent();
            };
        });
    },

    _updateNav(root) {
        root.querySelectorAll('.stats-nav-cat').forEach(el => {
            const active = el.dataset.cat === _catId;
            el.classList.toggle('open', active);
            el.querySelector('.stats-nav-cat-btn').classList.toggle('active', active);
        });
        root.querySelectorAll('.stats-nav-game').forEach(el => {
            el.classList.toggle('active', el.dataset.game === _gameId);
        });
    },

    // ─── CONTENT ─────────────────────────────────────────────────────────────

    _renderContent() {
        const area = document.getElementById('st-content');
        if (!area) return;

        // Destroy existing chart BEFORE replacing DOM — Chart.js needs the canvas in the DOM to clean up
        if (window._statsChart) { window._statsChart.destroy(); window._statsChart = null; }

        const variants = VARIANTS[_gameId] || null;
        const variantBar = variants ? `
            <div class="stats-variant-bar">
                ${variants.map(v => `
                    <button class="stats-variant-btn ${v.v === _variant ? 'active':''}" data-v="${v.v}">${v.l}</button>
                `).join('')}
            </div>` : '';

        const data = this._loadData();
        if (!data) {
            area.innerHTML = variantBar + this._emptyHTML();
            this._bindVariantBar(area);
            return;
        }

        const renderer = this._getRenderer(_gameId);
        const bodyHTML = renderer ? renderer.call(this, data) : this._emptyHTML('Kein Renderer.');

        area.innerHTML = variantBar + bodyHTML;
        this._bindVariantBar(area);
        this._bindMatchExpand(area);
        setTimeout(() => this._renderCharts(data, area), 0);
    },

    _bindVariantBar(area) {
        area.querySelectorAll('.stats-variant-btn').forEach(btn => {
            btn.onclick = () => { _variant = btn.dataset.v; _openMatch = null; this._renderContent(); };
        });
    },

    _bindMatchExpand(area) {
        area.querySelectorAll('.match-row-header').forEach(row => {
            row.onclick = () => {
                const id = row.dataset.matchid;
                _openMatch = (_openMatch === id) ? null : id;
                const body = area.querySelector(`.match-row-body[data-matchid="${id}"]`);
                if (body) body.classList.toggle('open', _openMatch === id);
                row.querySelector('.match-chevron')?.classList.toggle('rotated', _openMatch === id);
            };
        });
    },

    _loadData() {
        switch (_gameId) {
            case 'x01':                return StatsService.getX01Stats(_playerId, _days, _variant);
            case 'cricket':            return StatsService.getCricketStats(_playerId, _days, _variant);
            case 'single-training':    return StatsService.getSingleTrainingStats(_playerId, _days);
            case 'around-the-board':   return StatsService.getAtcStats(_playerId, _days, _variant);
            case 'shanghai':           return StatsService.getShanghaiStats(_playerId, _days, _variant);
            case 'bobs27':             return StatsService.getBobs27Stats(_playerId, _days);
            case 'halve-it':           return StatsService.getHalveItStats(_playerId, _days);
            case 'scoring-drill':      return StatsService.getScoringDrillStats(_playerId, _days, _variant);
            case 'checkout-challenge': return StatsService.getCheckoutChallengeStats(_playerId, _days);
            default: return null;
        }
    },

    _getRenderer(gameId) {
        return {
            'x01':               this._renderX01,
            'cricket':           this._renderCricket,
            'single-training':   this._renderSingleTraining,
            'around-the-board':  this._renderAtb,
            'shanghai':          this._renderShanghai,
            'bobs27':            this._renderBobs27,
            'halve-it':          this._renderHalveIt,
            'scoring-drill':     this._renderScoringDrill,
            'checkout-challenge':this._renderCheckoutChallenge,
        }[gameId] || null;
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  SPIEL-RENDERER
    // ═══════════════════════════════════════════════════════════════════════

    _renderX01(data) {
        const s = data.summary;
        return `
            ${this._heroGrid([
                { label:'Ø Average',   val:s.lifetimeAvg, accent:true },
                { label:'Best Avg',    val:s.bestAvg },
                { label:'Höchster Check', val:s.highestCheckout },
                { label:'Best Leg',    val:s.bestLeg },
                { label:'180s',        val:s.total180s, gold:true },
                { label:'140+',        val:s.total140s },
                { label:'100+',        val:s.total100s },
                { label:'Spiele',      val:s.games },
            ])}
            ${this._dualChartSection('Ø Average', 'First 9')}
            ${this._matchHistory(data.matches, this._x01MatchRow.bind(this))}
        `;
    },

    _renderCricket(data) {
        const s = data.summary;
        return `
            ${this._heroGrid([
                { label:'Ø MPR',       val:s.avgMPR,    accent:true },
                { label:'Best MPR',    val:s.bestMPR },
                { label:'Total Marks', val:s.totalMarks },
                { label:'Spiele',      val:s.games },
            ])}
            ${this._singleChartSection('MPR Verlauf')}
            ${this._matchHistory(data.matches, this._cricketMatchRow.bind(this))}
        `;
    },

    _renderSingleTraining(data) {
        const s = data.summary;
        return `
            ${this._heroGrid([
                { label:'Ø Score',    val:s.avgScore,  accent:true },
                { label:'Best Score', val:s.bestScore, gold:true },
                { label:'Trefferquote', val:s.hitRate },
                { label:'Spiele',     val:s.games },
            ])}
            ${this._distAndChart()}
            ${this._matchHistory(data.matches, this._trainingMatchRow.bind(this))}
        `;
    },

    _renderAtb(data) {
        const s = data.summary;
        return `
            ${this._heroGrid([
                { label:'Ø Darts',    val:s.avgDarts,  accent:true },
                { label:'Best Darts', val:s.bestDarts, gold:true },
                { label:'Trefferquote', val:s.hitRate },
                { label:'Spiele',     val:s.games },
            ])}
            ${this._atbMatrixAndChart(data)}
            ${this._matchHistory(data.matches, this._atbMatchRow.bind(this))}
        `;
    },

    _renderShanghai(data) {
        const s = data.summary;
        return `
            ${this._heroGrid([
                { label:'Ø Score',    val:s.avgScore,  accent:true },
                { label:'Best Score', val:s.bestScore, gold:true },
                { label:'Trefferquote', val:s.hitRate },
                { label:'Spiele',     val:s.games },
            ])}
            ${this._distAndChart()}
            ${this._matchHistory(data.matches, this._trainingMatchRow.bind(this))}
        `;
    },

    _renderBobs27(data) {
        const s = data.summary;
        return `
            ${this._heroGrid([
                { label:'Ø Score',     val:s.avgScore,     accent:true },
                { label:'Best Score',  val:s.bestScore,    gold:true },
                { label:'Survival',    val:s.survivalRate },
                { label:'Double-Rate', val:s.hitRate },
                { label:'Spiele',      val:s.games },
            ])}
            ${this._singleChartSection('Score Verlauf')}
            ${this._matchHistory(data.matches, this._bobs27MatchRow.bind(this))}
        `;
    },

    _renderHalveIt(data) {
        const s = data.summary;
        return `
            ${this._heroGrid([
                { label:'Ø Score',        val:s.avgScore,      accent:true },
                { label:'Best Score',     val:s.bestScore,     gold:true },
                { label:'Halbierungsrate',val:s.halvingRate },
                { label:'Perfect Rounds', val:s.perfectRounds },
                { label:'Spiele',         val:s.games },
            ])}
            ${this._singleChartSection('Score Verlauf')}
            ${this._matchHistory(data.matches, this._halveItMatchRow.bind(this))}
        `;
    },

    _renderScoringDrill(data) {
        const s = data.summary;
        return `
            ${this._heroGrid([
                { label:'Ø Score',    val:s.avgScore,  accent:true },
                { label:'Best Score', val:s.bestScore, gold:true },
                { label:'Ø Average',  val:s.avgAvg },
                { label:'180s',       val:s.total180,  gold:true },
                { label:'140+',       val:s.total140 },
                { label:'100+',       val:s.total100 },
                { label:'Spiele',     val:s.games },
            ])}
            ${this._singleChartSection('Ø Average Verlauf')}
            ${this._matchHistory(data.matches, this._drillMatchRow.bind(this))}
        `;
    },

    _renderCheckoutChallenge(data) {
        const s = data.summary;
        return `
            ${this._heroGrid([
                { label:'Checkout-Rate', val:s.checkoutRate, accent:true },
                { label:'Ø Darts/Check', val:s.avgDpc },
                { label:'Best Score',    val:s.bestScore,    gold:true },
                { label:'Ø Score',       val:s.avgScore },
                { label:'Spiele',        val:s.games },
            ])}
            ${this._singleChartSection('Checkout-Rate %')}
            ${this._matchHistory(data.matches, this._checkoutMatchRow.bind(this))}
        `;
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  BLOCK-BAUSTEINE
    // ═══════════════════════════════════════════════════════════════════════

    _heroGrid(items) {
        return `<div class="stats-hero-grid">${items.map(item => `
            <div class="hero-card ${item.accent?'accent':''}">
                <span class="hero-label">${item.label}</span>
                <span class="hero-val ${item.gold?'gold-val':''}">${item.val ?? '–'}</span>
            </div>`).join('')}</div>`;
    },

    _dualChartSection(l1, l2) {
        return `<div class="stats-chart-card">
            <div class="stats-chart-header">
                <span class="stats-chart-title">${l1} / ${l2}</span>
                <div class="stats-chart-legend">
                    <span class="legend-dot green"></span>${l1}
                    <span class="legend-dot gold"></span>${l2}
                </div>
            </div>
            <div class="stats-chart-body"><canvas id="st-chart-trend"></canvas></div>
        </div>`;
    },

    _singleChartSection(label) {
        return `<div class="stats-chart-card">
            <div class="stats-chart-header"><span class="stats-chart-title">${label}</span></div>
            <div class="stats-chart-body"><canvas id="st-chart-trend"></canvas></div>
        </div>`;
    },

    _distAndChart(data) {
        const d = (data && data.distribution) ? data.distribution : {};
        return `<div class="stats-mid-grid">
            <div class="stats-chart-card stats-mid-chart">
                <div class="stats-chart-header"><span class="stats-chart-title">Score Verlauf</span></div>
                <div class="stats-chart-body"><canvas id="st-chart-trend"></canvas></div>
            </div>
            <div class="stats-dist-card">
                <h5 class="stats-dist-title">VERTEILUNG</h5>
                <div class="dist-bar"><span>Singles</span><strong>${d.singles ?? 0}</strong></div>
                <div class="dist-bar"><span>Doubles</span><strong>${d.doubles ?? 0}</strong></div>
                <div class="dist-bar gold"><span>Triples</span><strong>${d.triples ?? 0}</strong></div>
            </div>
        </div>`;
    },

    _atbMatrixAndChart(data) {
        const matrix = data.matrix || [];
        return `<div class="stats-mid-grid">
            <div class="stats-chart-card stats-mid-chart">
                <div class="stats-chart-header"><span class="stats-chart-title">Darts pro Session</span></div>
                <div class="stats-chart-body"><canvas id="st-chart-trend"></canvas></div>
            </div>
            <div class="stats-dist-card">
                <h5 class="stats-dist-title">Ø DARTS PRO FELD</h5>
                <div class="atb-matrix">
                    ${matrix.map(m => `
                        <div class="atb-cell ${m.heatClass}">
                            <span class="atb-label">${m.label}</span>
                            <span class="atb-val">${m.val}</span>
                        </div>`).join('')}
                </div>
            </div>
        </div>`;
    },

    _matchHistory(matches, rowFn) {
        if (!matches || matches.length === 0) {
            return `<div class="stats-hist-empty">Noch keine Einträge im gewählten Zeitraum.</div>`;
        }
        const gameClass = `mh-${_gameId}`;
        return `
            <div class="stats-history-card">
                <h4 class="stats-history-title">Match-Historie <span class="mh-count">${matches.length}</span></h4>
                <div class="stats-history-list">
                    ${matches.map((m, i) => {
                        const mid = `match-${i}`;
                        const breakdown = this._roundBreakdownHTML(m);
                        return `
                            <div class="match-row">
                                <div class="match-row-header ${breakdown ? 'expandable':''}" data-matchid="${mid}">
                                    <div class="match-row-inner ${gameClass}">${rowFn(m)}</div>
                                    ${breakdown ? `<span class="match-chevron">▾</span>` : ''}
                                </div>
                                ${breakdown ? `
                                    <div class="match-row-body ${_openMatch===mid?'open':''}" data-matchid="${mid}">
                                        ${breakdown}
                                    </div>` : ''}
                            </div>`;
                    }).join('')}
                </div>
            </div>`;
    },

    _roundBreakdownHTML(m) {
        if (!m.roundBreakdown || m.roundBreakdown.length === 0) return null;
        return `<div class="breakdown-table">
            ${m.roundBreakdown.map(r => {
                const dartsStr = (r.darts || [])
                    .map(d => d.isMiss ? '<span class="bd-miss">✗</span>' : `<span class="bd-hit">${d.segment || d.points || '?'}</span>`)
                    .join(' ');
                const targetLabel = r.target !== undefined ? `<span class="bd-target-val">${r.target}</span>` : '';
                const hitLabel    = r.hit !== undefined ? (r.hit ? '✅' : '❌') : '';
                const halvLabel   = r.wasHalved ? ' <span class="bd-halved">halved</span>' : '';
                const scoreStr    = r.score !== undefined ? `+${r.score}` : '';
                const totalStr    = r.totalAfter !== undefined ? `= ${r.totalAfter}` : '';
                return `
                    <div class="breakdown-row">
                        <span class="bd-idx">#${r.idx}</span>
                        <span class="bd-target">${targetLabel}${hitLabel}</span>
                        <span class="bd-darts">${dartsStr || '—'}</span>
                        <span class="bd-score">${scoreStr}${halvLabel}</span>
                        <span class="bd-total">${totalStr}</span>
                    </div>`;
            }).join('')}
        </div>`;
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  MATCH-ROW TEMPLATES
    // ═══════════════════════════════════════════════════════════════════════

    _x01MatchRow: m => `
        <span class="mh-date">${m.date}</span>
        <span class="mh-badge mh-mode">${m.mode}</span>
        <span class="mh-badge ${m.resultClass}">${m.resultLabel}</span>
        <span class="mh-opp">${m.opponents}</span>
        <span class="mh-kpi">${m.avg}<small>avg</small></span>
        <span class="mh-kpi">${m.checkout}<small>check</small></span>
        <span class="mh-kpi">${m.bestLeg}<small>leg</small></span>
        <span class="mh-powers">
            <span class="mh-power">${m.p100}<small>100</small></span>
            <span class="mh-power">${m.p140}<small>140</small></span>
            <span class="mh-power gold">${m.p180}<small>180</small></span>
        </span>`,

    _cricketMatchRow: m => `
        <span class="mh-date">${m.date}</span>
        <span class="mh-badge ${m.resultClass}">${m.resultLabel}</span>
        <span class="mh-opp">${m.opponents}</span>
        <span class="mh-kpi">${m.mpr}<small>MPR</small></span>
        <span class="mh-kpi">${m.marks}<small>marks</small></span>
        <span class="mh-kpi">${m.rounds}<small>runden</small></span>`,

    _trainingMatchRow: m => `
        <span class="mh-date">${m.date}</span>
        <span class="mh-badge ${m.resultClass}">${m.resultLabel}</span>
        <span class="mh-opp">${m.opponents}</span>
        <span class="mh-kpi">${m.score}<small>pts</small></span>
        <span class="mh-kpi">${m.hitRate}<small>quote</small></span>
        <span class="mh-sdt">S<strong>${m.s}</strong> D<strong>${m.d}</strong> T<strong>${m.t}</strong></span>`,

    _atbMatchRow: m => `
        <span class="mh-date">${m.date}</span>
        <span class="mh-badge ${m.resultClass}">${m.resultLabel}</span>
        <span class="mh-opp">${m.opponents}</span>
        <span class="mh-kpi">${m.darts}<small>darts</small></span>
        <span class="mh-kpi">${m.hitRate}<small>quote</small></span>
        <span class="mh-badge mh-mode">${m.variant}</span>`,

    _bobs27MatchRow: m => `
        <span class="mh-date">${m.date}</span>
        <span class="mh-badge ${m.resultClass}">${m.resultLabel}</span>
        <span class="mh-kpi" style="color:${m.score >= 0 ? '#fff':'var(--miss-color)'}">
            ${m.score}<small>pts</small>
        </span>
        <span class="mh-kpi">${m.hitRate}<small>double-rate</small></span>
        <span class="mh-kpi">${m.rounds}<small>runden</small></span>`,

    _halveItMatchRow: m => `
        <span class="mh-date">${m.date}</span>
        <span class="mh-badge mh-mode">${m.mode}</span>
        <span class="mh-kpi">${m.score}<small>pts</small></span>
        <span class="mh-kpi">${m.halvingRate}<small>halbiert</small></span>
        <span class="mh-kpi">${m.halvings}<small>halvings</small></span>
        <span class="mh-kpi">${m.perfect}<small>perfect</small></span>`,

    _drillMatchRow: m => `
        <span class="mh-date">${m.date}</span>
        <span class="mh-badge mh-mode">${m.limit} darts</span>
        <span class="mh-kpi">${m.score}<small>pts</small></span>
        <span class="mh-kpi">${m.avg}<small>avg</small></span>
        <span class="mh-powers">
            <span class="mh-power">${m.ton}<small>100</small></span>
            <span class="mh-power">${m.ton40}<small>140</small></span>
            <span class="mh-power gold">${m.max}<small>180</small></span>
        </span>`,

    _checkoutMatchRow: m => `
        <span class="mh-date">${m.date}</span>
        <span class="mh-badge mh-mode">${m.difficulty}</span>
        <span class="mh-kpi">${m.checkoutRate}<small>rate</small></span>
        <span class="mh-kpi">${m.hit}/${m.total}<small>checks</small></span>
        <span class="mh-kpi">${m.avgDpc}<small>darts/check</small></span>
        <span class="mh-kpi">${m.score}<small>pts</small></span>`,

    // ═══════════════════════════════════════════════════════════════════════
    //  CHARTS
    // ═══════════════════════════════════════════════════════════════════════

    _renderCharts(data, area) {
        const canvas = area.querySelector('#st-chart-trend');
        if (!canvas) return;
        if (window._statsChart) { window._statsChart.destroy(); window._statsChart = null; }

        const ctx = canvas.getContext('2d');
        let datasets = [], labels = [];

        if (_gameId === 'x01' && data.charts) {
            labels = data.charts.labels || [];
            datasets = [
                { label:'Ø Average', data: data.charts.avgTrend || [],
                  borderColor:'#00d26a', backgroundColor:'rgba(0,210,106,0.1)',
                  fill:true, tension:0.4, type:'line' },
                { label:'First 9',   data: data.charts.f9Trend || [],
                  borderColor:'#eab308', borderDash:[5,5], tension:0.4,
                  type:'line', pointRadius:0 },
            ];
        } else if (data.chart) {
            labels = data.chart.labels || [];
            const vals = data.chart.values || [];
            const trend = vals.map((_, i) => {
                const w = vals.slice(Math.max(0, i-6), i+1);
                return +(w.reduce((a,b)=>a+b,0) / w.length).toFixed(2);
            });
            datasets = [
                { label:'Einzelwert', data:vals,
                  backgroundColor:'rgba(99,102,241,0.45)', borderColor:'rgba(99,102,241,0.8)',
                  type:'bar', order:2 },
                { label:'Ø Trend',    data:trend,
                  borderColor:'#00d26a', backgroundColor:'transparent',
                  type:'line', tension:0.4, pointRadius:0, order:1 },
            ];
        }

        if (!datasets.length || !labels.length) return;

        // Calculate a sensible Y-axis minimum with 10% padding below the minimum value
        const allValues = datasets.flatMap(ds => (ds.data || []).filter(v => typeof v === 'number' && !isNaN(v)));
        const minVal = allValues.length ? Math.min(...allValues) : 0;
        const yMin = minVal > 0 ? minVal * 0.9 : minVal;

        window._statsChart = new Chart(ctx, {
            data: { labels, datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode:'index', intersect:false },
                scales: {
                    y: {
                        beginAtZero: false,
                        suggestedMin: yMin,
                        grid:{ color:'rgba(255,255,255,0.05)' },
                        ticks:{ color:'#888' }
                    },
                    x: { grid:{ display:false }, ticks:{ color:'#888', maxTicksLimit:12 } }
                },
                plugins: { legend:{ labels:{ color:'#bbb', boxWidth:12 } } }
            }
        });
    },

    // ─── Legacy heatmap (für externe Nutzung) ───────────────────────────────
    applyHeatmapData(heatmapData, containerId) {
        if (!heatmapData) return;
        const values = Object.values(heatmapData);
        if (!values.length) return;
        const maxHits = Math.max(...values);
        const container = document.getElementById(containerId);
        if (!container) return;
        Object.entries(heatmapData).forEach(([segId, hits]) => {
            const elId = `seg-${segId}`;
            const elements = [];
            if (segId.startsWith('S')) {
                const o = container.querySelector(`#${elId}-O`);
                const i2 = container.querySelector(`#${elId}-I`);
                if (o) elements.push(o); if (i2) elements.push(i2);
            } else {
                const el = container.querySelector(`#${elId}`);
                if (el) elements.push(el);
            }
            const intensity = hits / maxHits;
            const cls = intensity > 0.7 ? 'heat-high' : intensity > 0.3 ? 'heat-medium' : 'heat-low';
            elements.forEach(el => {
                el.classList.remove('heat-low','heat-medium','heat-high');
                el.classList.add(cls);
            });
        });
    },

    _emptyHTML(msg = 'Keine Daten für diese Auswahl.') {
        return `<div class="stats-empty-state"><span>📭</span><p>${msg}</p></div>`;
    },
};

function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}
