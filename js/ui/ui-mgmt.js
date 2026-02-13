import { State } from '../core/state.js';
import { Store } from '../core/store.js';
import { UI } from './ui-core.js';
import { HueService } from '../core/hue-service.js';
import { AutodartsService } from '../core/autodarts-service.js';

// ═══════════════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'dc_app_settings';

const TABS = [
    { id: 'settings',  icon: '⚙️',  label: 'Einstellungen' },
    { id: 'database',  icon: '💾',  label: 'Datenbank' },
    { id: 'hue',       icon: '💡',  label: 'Lichtsteuerung' },
    { id: 'autodarts', icon: '📡',  label: 'Autodarts' },
];

const GAME_META = {
    'x01':              { label: 'X01',              accent: '#3b82f6' },
    'cricket':          { label: 'Cricket',          accent: '#8b5cf6' },
    'single-training':  { label: 'Single Training',  accent: '#10b981' },
    'shanghai':         { label: 'Shanghai',         accent: '#f59e0b' },
    'bobs27':           { label: "Bob's 27",         accent: '#ef4444' },
    'around-the-board': { label: 'Around the Board', accent: '#06b6d4' },
};

const DEFAULT_SETTINGS = {
    overlayDuration: 1200,
    speechEnabled: false,
    defaults: {
        x01: { startScore: 501, doubleIn: false, doubleOut: true, mode: 'legs', bestOf: 3 },
        cricket: { mode: 'standard', spRounds: 20 },
        shanghai: { mode: 'ascending', length: 'standard' },
        'single-training': { mode: 'ascending' },
        'around-the-board': { direction: 'ascending', variant: 'full' },
    },
    hue: {
        effectDuration: {
            hit: 500,
            miss: 500,
            highScore: 4000,
            oneEighty: 8000,
        }
    }
};

// ═══════════════════════════════════════════════════════════════
//  PRIVATE STATE
// ═══════════════════════════════════════════════════════════════

let activeTab = 'settings';
let selectedPlayerId = null;
let activeFilter = 'all';
let appSettings = null;

// ═══════════════════════════════════════════════════════════════
//  SETTINGS PERSISTENCE
// ═══════════════════════════════════════════════════════════════

function _loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            appSettings = _deepMerge(DEFAULT_SETTINGS, parsed);
        } else {
            appSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
        }
    } catch (e) {
        appSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
}

function _saveSettings() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appSettings));
    } catch (e) {
        console.error('Settings save failed', e);
    }
}

function _deepMerge(target, source) {
    const out = { ...target };
    for (const key of Object.keys(source)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
            out[key] = _deepMerge(target[key] || {}, source[key]);
        } else {
            out[key] = source[key];
        }
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════

function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════

export const Management = {

    init() {
        _loadSettings();
        this.render();
    },

    render() {
        const root = document.getElementById('management-container');
        if (!root) return;

        root.innerHTML = `
            <nav class="mgmt-tabs">${TABS.map(t => `
                <button class="mgmt-tab ${activeTab === t.id ? 'active' : ''}" data-tab="${t.id}">
                    <span class="mgmt-tab-icon">${t.icon}</span>
                    <span class="mgmt-tab-label">${t.label}</span>
                </button>
            `).join('')}</nav>
            <div id="mgmt-tab-content" class="mgmt-tab-content"></div>
        `;

        root.querySelectorAll('.mgmt-tab').forEach(btn => {
            btn.onclick = () => {
                activeTab = btn.dataset.tab;
                this.render();
            };
        });

        const content = root.querySelector('#mgmt-tab-content');
        switch (activeTab) {
            case 'settings':  this._renderSettings(content);  break;
            case 'database':  this._renderDatabase(content);  break;
            case 'hue':       this._renderHue(content);       break;
            case 'autodarts': this._renderAutodarts(content);  break;
        }
    },

    // ═══════════════════════════════════════════════════════════
    //  TAB 1: EINSTELLUNGEN
    // ═══════════════════════════════════════════════════════════

    _renderSettings(el) {
        const s = appSettings;
        el.innerHTML = `
            ${this._section('Allgemein', `
                <div class="mgmt-field">
                    <label class="mgmt-lbl">Overlay-Dauer</label>
                    <div class="mgmt-range-row">
                        <input type="range" id="set-overlay" class="mgmt-range" min="400" max="3000" step="100" value="${s.overlayDuration}">
                        <span id="set-overlay-val" class="mgmt-range-val">${s.overlayDuration} ms</span>
                    </div>
                    <div class="mgmt-hint">Wie lange Score-Overlays sichtbar bleiben (400–3000 ms)</div>
                </div>
                <div class="mgmt-field">
                    <label class="mgmt-lbl">Sprachausgabe</label>
                    <div class="mgmt-toggle-row">
                        <button id="set-speech" class="mgmt-toggle ${s.speechEnabled ? 'on' : ''}">${s.speechEnabled ? 'AN' : 'AUS'}</button>
                        <span class="mgmt-hint" style="margin:0;">Scores laut vorlesen (experimentell)</span>
                    </div>
                </div>
            `)}

            ${this._section('Spielvorgaben: X01', `
                <div class="mgmt-field">
                    <label class="mgmt-lbl">Start-Punkte</label>
                    <div class="mgmt-chips">
                        ${[301,501,701].map(v => `<button class="mgmt-chip ${s.defaults.x01.startScore===v?'active':''}" data-g="x01-sc" data-v="${v}">${v}</button>`).join('')}
                    </div>
                </div>
                <div class="mgmt-field">
                    <label class="mgmt-lbl">Checkout</label>
                    <div class="mgmt-chips">
                        <button class="mgmt-chip ${s.defaults.x01.doubleOut?'active':''}" data-g="x01-do" data-v="true">Double Out</button>
                        <button class="mgmt-chip ${!s.defaults.x01.doubleOut?'active':''}" data-g="x01-do" data-v="false">Single Out</button>
                    </div>
                </div>
                <div class="mgmt-field">
                    <label class="mgmt-lbl">Format</label>
                    <div class="mgmt-chips">
                        ${[1,3,5,7].map(v => `<button class="mgmt-chip ${s.defaults.x01.bestOf===v?'active':''}" data-g="x01-bo" data-v="${v}">Best of ${v}</button>`).join('')}
                    </div>
                </div>
            `)}

            ${this._section('Spielvorgaben: Cricket', `
                <div class="mgmt-field">
                    <label class="mgmt-lbl">Rundenlimit (Singleplayer)</label>
                    <div class="mgmt-chips">
                        ${[{v:0,l:'∞ Unbegrenzt'},{v:10,l:'10 Runden'},{v:20,l:'20 Runden'}].map(o =>
                            `<button class="mgmt-chip ${s.defaults.cricket.spRounds===o.v?'active':''}" data-g="cr-rnd" data-v="${o.v}">${o.l}</button>`
                        ).join('')}
                    </div>
                </div>
            `)}

            ${this._section('Spielvorgaben: Training', `
                <div class="mgmt-field">
                    <label class="mgmt-lbl">Single Training – Reihenfolge</label>
                    <div class="mgmt-chips">
                        ${[{v:'ascending',l:'📈 Aufsteigend'},{v:'descending',l:'📉 Absteigend'},{v:'random',l:'🎲 Zufall'}].map(o =>
                            `<button class="mgmt-chip ${s.defaults['single-training'].mode===o.v?'active':''}" data-g="st-m" data-v="${o.v}">${o.l}</button>`
                        ).join('')}
                    </div>
                </div>
                <div class="mgmt-field">
                    <label class="mgmt-lbl">Shanghai – Reihenfolge</label>
                    <div class="mgmt-chips">
                        ${[{v:'ascending',l:'📈 Auf'},{v:'descending',l:'📉 Ab'},{v:'random',l:'🎲 Zufall'}].map(o =>
                            `<button class="mgmt-chip ${s.defaults.shanghai.mode===o.v?'active':''}" data-g="sh-m" data-v="${o.v}">${o.l}</button>`
                        ).join('')}
                    </div>
                </div>
                <div class="mgmt-field">
                    <label class="mgmt-lbl">Shanghai – Länge</label>
                    <div class="mgmt-chips">
                        <button class="mgmt-chip ${s.defaults.shanghai.length==='standard'?'active':''}" data-g="sh-l" data-v="standard">Standard (1–7)</button>
                        <button class="mgmt-chip ${s.defaults.shanghai.length==='full'?'active':''}" data-g="sh-l" data-v="full">Komplett (1–20)</button>
                    </div>
                </div>
                <div class="mgmt-field">
                    <label class="mgmt-lbl">Around the Board – Variante</label>
                    <div class="mgmt-chips">
                        ${[{v:'full',l:'Gesamt'},{v:'single-inner',l:'Inner'},{v:'single-outer',l:'Outer'},{v:'double',l:'Doubles'},{v:'triple',l:'Triples'}].map(o =>
                            `<button class="mgmt-chip ${s.defaults['around-the-board'].variant===o.v?'active':''}" data-g="atb-v" data-v="${o.v}">${o.l}</button>`
                        ).join('')}
                    </div>
                </div>
            `)}
        `;

        // ── Slider ──
        const slider = el.querySelector('#set-overlay');
        const valEl = el.querySelector('#set-overlay-val');
        if (slider) {
            slider.oninput = () => { valEl.textContent = slider.value + ' ms'; };
            slider.onchange = () => { appSettings.overlayDuration = parseInt(slider.value); _saveSettings(); this._flash(slider.parentElement); };
        }

        // ── Speech ──
        const btnSpeech = el.querySelector('#set-speech');
        if (btnSpeech) btnSpeech.onclick = () => {
            appSettings.speechEnabled = !appSettings.speechEnabled; _saveSettings();
            btnSpeech.classList.toggle('on', appSettings.speechEnabled);
            btnSpeech.textContent = appSettings.speechEnabled ? 'AN' : 'AUS';
        };

        // ── Chips ──
        el.querySelectorAll('.mgmt-chip').forEach(chip => {
            chip.onclick = () => {
                el.querySelectorAll(`.mgmt-chip[data-g="${chip.dataset.g}"]`).forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                this._applyChip(chip.dataset.g, chip.dataset.v);
                _saveSettings();
                this._flash(chip);
            };
        });
    },

    _applyChip(g, v) {
        const d = appSettings.defaults;
        switch (g) {
            case 'x01-sc':  d.x01.startScore = parseInt(v); break;
            case 'x01-do':  d.x01.doubleOut = v === 'true'; break;
            case 'x01-bo':  d.x01.bestOf = parseInt(v); break;
            case 'cr-rnd':  d.cricket.spRounds = parseInt(v); break;
            case 'st-m':    d['single-training'].mode = v; break;
            case 'sh-m':    d.shanghai.mode = v; break;
            case 'sh-l':    d.shanghai.length = v; break;
            case 'atb-v':   d['around-the-board'].variant = v; break;
        }
    },

    // ═══════════════════════════════════════════════════════════
    //  TAB 2: DATENBANK
    // ═══════════════════════════════════════════════════════════

    _renderDatabase(el) {
        const players = State.getAvailablePlayers() || [];

        el.innerHTML = `
            <div class="mgmt-db-layout">
                <div class="mgmt-db-sidebar">
                    <div class="mgmt-db-add">
                        <input type="text" id="inp-new-player" class="mgmt-input" placeholder="Neuer Spieler…">
                        <button id="btn-add-player" class="mgmt-btn-add">+</button>
                    </div>
                    <div id="mgmt-player-list" class="mgmt-player-scroll">
                        ${players.length === 0
                            ? '<div class="mgmt-empty">Keine Spieler angelegt</div>'
                            : players.map(p => `
                                <div class="mgmt-pcard ${selectedPlayerId===p.id?'active':''}" data-pid="${p.id}">
                                    <span class="mgmt-pcard-name">${_esc(p.name)}</span>
                                    <span class="mgmt-pcard-cnt">${(p.history||[]).length}</span>
                                </div>
                            `).join('')}
                    </div>
                </div>
                <div id="mgmt-detail" class="mgmt-db-detail"></div>
            </div>
        `;

        // Add player
        const btnAdd = el.querySelector('#btn-add-player');
        const inpAdd = el.querySelector('#inp-new-player');
        if (btnAdd) {
            const doAdd = () => {
                const name = inpAdd.value.trim();
                if (!name) return;
                State.addPlayer(name).then(() => { inpAdd.value = ''; this._renderDatabase(el); });
            };
            btnAdd.onclick = doAdd;
            inpAdd.onkeydown = (e) => { if (e.key === 'Enter') doAdd(); };
        }

        // Select player
        el.querySelectorAll('.mgmt-pcard').forEach(card => {
            card.onclick = () => {
                if (selectedPlayerId !== card.dataset.pid) activeFilter = 'all';
                selectedPlayerId = card.dataset.pid;
                this._renderDatabase(el);
            };
        });

        this._renderPlayerDetail(el.querySelector('#mgmt-detail'));
    },

    _renderPlayerDetail(area) {
        if (!area) return;

        // No player selected → show Firebase info
        if (!selectedPlayerId) {
            const user = Store.getCurrentUser();
            area.innerHTML = `
                <div class="mgmt-empty-detail">
                    <div style="font-size:2.5rem; margin-bottom:12px;">💾</div>
                    <h3>Datenbank</h3>
                    <p style="color:#666; margin-bottom:20px;">Spieler links auswählen, um die Historie zu sehen.</p>
                    <div class="mgmt-info-table">
                        <div class="mgmt-info-row"><span class="mgmt-info-k">Firebase</span><span class="mgmt-info-v mgmt-ok">● Verbunden</span></div>
                        <div class="mgmt-info-row"><span class="mgmt-info-k">Benutzer</span><span class="mgmt-info-v">${user ? _esc(user.email) : 'Gast'}</span></div>
                        <div class="mgmt-info-row"><span class="mgmt-info-k">Spieler</span><span class="mgmt-info-v">${(State.getAvailablePlayers()||[]).length}</span></div>
                    </div>
                </div>
            `;
            return;
        }

        const p = (State.getAvailablePlayers()||[]).find(x => x.id === selectedPlayerId);
        if (!p) { selectedPlayerId = null; this._renderPlayerDetail(area); return; }

        const history = p.history || [];
        const types = [...new Set(history.map(h => h.game || 'unknown'))];
        let items = history.map((h, i) => ({ ...h, _idx: i })).reverse();
        if (activeFilter !== 'all') items = items.filter(h => (h.game||'unknown') === activeFilter);

        area.innerHTML = `
            <div class="mgmt-dh">
                <div class="mgmt-dh-name-row">
                    <span id="p-name-show" class="mgmt-dh-name">${_esc(p.name)}</span>
                    <input id="p-name-edit" class="mgmt-dh-input" style="display:none" value="${_esc(p.name)}">
                    <button id="btn-ren" class="mgmt-ibtn" title="Umbenennen">✏️</button>
                    <button id="btn-del-p" class="mgmt-ibtn mgmt-ibtn-red" title="Spieler löschen">🗑</button>
                </div>
                <span class="mgmt-dh-sub">ID: ${p.id}</span>
            </div>

            <div class="mgmt-dh-toolbar">
                <span class="mgmt-dh-count">${items.length} Einträge</span>
                ${types.length > 1 ? `
                    <select id="mgmt-hfilt" class="mgmt-filter-select">
                        <option value="all" ${activeFilter==='all'?'selected':''}>Alle (${history.length})</option>
                        ${types.map(t => `<option value="${t}" ${activeFilter===t?'selected':''}>${GAME_META[t]?.label||t} (${history.filter(h=>h.game===t).length})</option>`).join('')}
                    </select>
                ` : ''}
            </div>

            <div id="mgmt-hist" class="mgmt-hist-scroll">
                ${items.length === 0
                    ? '<div class="mgmt-empty">Noch keine Spiele 🎯</div>'
                    : items.map(g => this._histCard(g)).join('')}
            </div>
        `;

        // ── Inline rename ──
        const nameShow = area.querySelector('#p-name-show');
        const nameEdit = area.querySelector('#p-name-edit');
        const btnRen = area.querySelector('#btn-ren');
        let editing = false;

        btnRen.onclick = () => {
            if (!editing) {
                editing = true;
                nameShow.style.display = 'none';
                nameEdit.style.display = 'inline-block';
                nameEdit.focus(); nameEdit.select();
                btnRen.textContent = '✓';
            } else {
                const n = nameEdit.value.trim();
                if (n && n !== p.name) {
                    State.renamePlayer(p.id, n).then(() => this.render());
                } else {
                    nameShow.style.display = ''; nameEdit.style.display = 'none';
                    btnRen.textContent = '✏️'; editing = false;
                }
            }
        };
        nameEdit.onkeydown = (e) => {
            if (e.key === 'Enter') btnRen.click();
            if (e.key === 'Escape') { nameEdit.value = p.name; editing = false; nameShow.style.display = ''; nameEdit.style.display = 'none'; btnRen.textContent = '✏️'; }
        };

        // ── Delete player ──
        area.querySelector('#btn-del-p').onclick = () => {
            UI.showConfirm('SPIELER LÖSCHEN', `"${_esc(p.name)}" und ALLE Statistiken unwiderruflich löschen?`, () => {
                const all = State.getAvailablePlayers();
                const idx = all.findIndex(x => x.id === p.id);
                if (idx > -1) { all.splice(idx, 1); selectedPlayerId = null; this.render(); }
            }, { confirmLabel: 'LÖSCHEN', confirmClass: 'btn-yes' });
        };

        // ── Filter ──
        const filt = area.querySelector('#mgmt-hfilt');
        if (filt) filt.onchange = (e) => { activeFilter = e.target.value; this._renderPlayerDetail(area); };

        // ── Delete game entries ──
        area.querySelectorAll('.mgmt-hdel').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                UI.showConfirm('EINTRAG LÖSCHEN', 'Diesen Spieleintrag entfernen?', () => {
                    State.deleteGameFromHistory(p.id, idx).then(() => this._renderPlayerDetail(area));
                }, { confirmLabel: 'LÖSCHEN', confirmClass: 'btn-yes' });
            };
        });
    },

    _histCard(g) {
        const m = GAME_META[g.game] || { label: g.game, accent: '#666' };
        const date = new Date(g.date).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: '2-digit' });
        const sm = g.stats?.summary || {};
        const win = g.stats?.isWinner;
        const opps = g.settings?.opponents;

        let tags = [];
        if (sm.avg) tags.push(`Avg ${sm.avg}`);
        if (sm.first9Avg) tags.push(`F9 ${sm.first9Avg}`);
        if (sm.mpr) tags.push(`MPR ${sm.mpr}`);
        if (sm.hitRate || sm.accuracy) tags.push(`${sm.hitRate || sm.accuracy}%`);
        if (g.totalScore !== undefined) tags.push(`Score: ${g.totalScore}`);

        return `
            <div class="mgmt-hcard" style="--ha: ${m.accent}">
                <div class="mgmt-hcard-bar"></div>
                <div class="mgmt-hcard-body">
                    <div class="mgmt-hcard-top">
                        <span class="mgmt-hcard-game">${m.label}</span>
                        <span class="mgmt-hcard-date">${date}</span>
                    </div>
                    ${opps?.length ? `<div class="mgmt-hcard-opp">vs. ${opps.map(o=>_esc(o)).join(', ')}</div>` : ''}
                    <div class="mgmt-hcard-tags">
                        ${tags.map(t => `<span class="mgmt-htag">${t}</span>`).join('')}
                        ${win === true ? '<span class="mgmt-htag mgmt-htag-w">✅</span>' : ''}
                        ${win === false ? '<span class="mgmt-htag mgmt-htag-l">❌</span>' : ''}
                    </div>
                </div>
                <button class="mgmt-hdel" data-idx="${g._idx}" title="Löschen">🗑</button>
            </div>
        `;
    },

    // ═══════════════════════════════════════════════════════════
    //  TAB 3: HUE LICHTSTEUERUNG
    // ═══════════════════════════════════════════════════════════

    _renderHue(el) {
        const cfg = HueService.getConfig();
        const ok = cfg.isEnabled && cfg.isConnected;

        el.innerHTML = `
            ${this._section(`<span style="display:flex;align-items:center;gap:8px;">💡 Philips Hue <span class="mgmt-badge ${ok ? 'mgmt-ok' : (cfg.isEnabled ? 'mgmt-warn' : 'mgmt-off')}">${ok ? '● Verbunden' : (cfg.isEnabled ? '● Fehler' : '○ Aus')}</span></span>`, `
                <div class="mgmt-toggle-row" style="margin-bottom:12px;">
                    <button id="hue-pwr" class="mgmt-toggle ${cfg.isEnabled ? 'on' : ''}">${cfg.isEnabled ? 'AN' : 'AUS'}</button>
                    <span>Hue Lichtsteuerung ${cfg.isEnabled ? 'aktiv' : 'deaktiviert'}</span>
                </div>
            `)}

            ${cfg.isEnabled ? `
                ${this._section('Bridge-Verbindung', `
                    <div class="mgmt-field">
                        <label class="mgmt-lbl">Bridge IP-Adresse</label>
                        <div class="mgmt-ip-row">
                            <input type="text" id="hue-ip" class="mgmt-input mgmt-input-grow" value="${cfg.bridgeIp || ''}" placeholder="192.168.178.40">
                            <button id="hue-disc" class="mgmt-btn-sm">🔍 Suchen</button>
                            <button id="hue-conn" class="mgmt-btn-sm mgmt-btn-accent">Verbinden</button>
                        </div>
                        <div class="mgmt-hint">Automatische Suche oder IP manuell eingeben (Hue App → Einstellungen → Bridge)</div>
                    </div>

                    ${cfg.isConnected ? `
                        <div class="mgmt-info-table" style="margin-top:12px;">
                            <div class="mgmt-info-row"><span class="mgmt-info-k">Leuchte</span><span class="mgmt-info-v">${cfg.lightId ? 'ID ' + cfg.lightId : '⚠ Nicht gefunden'}</span></div>
                            <div class="mgmt-info-row"><span class="mgmt-info-k">Raum/Gruppe</span><span class="mgmt-info-v">${cfg.groupId ? 'ID ' + cfg.groupId : '⚠ Nicht gefunden'}</span></div>
                            <div class="mgmt-info-row"><span class="mgmt-info-k">API-Key</span><span class="mgmt-info-v mgmt-mono">${cfg.username ? cfg.username.substring(0, 16) + '…' : '–'}</span></div>
                        </div>
                        <div class="mgmt-hint" style="margin-top:8px;">Die App sucht automatisch nach Leuchten mit "dart" oder "lightstrip" im Namen.</div>
                    ` : `
                        <details class="mgmt-help" style="margin-top:12px;">
                            <summary>❓ Verbindungsprobleme?</summary>
                            <ol class="mgmt-help-ol">
                                <li><strong>🔍 Suchen</strong> klicken — die Bridge wird im Netzwerk gesucht.</li>
                                <li>Falls die Suche fehlschlägt, IP manuell eingeben.</li>
                                <li><strong>Verbinden</strong> klicken. Falls der Browser blockiert (HTTPS), öffne <code>https://[IP]/api/config</code> in neuem Tab und akzeptiere das Zertifikat.</li>
                                <li>Danach erneut <strong>Verbinden</strong>.</li>
                            </ol>
                        </details>
                    `}
                `)}
            ` : ''}

            ${ok ? `
                ${this._section('Effekte & Dauer', `
                    ${this._hueSlider('hit', 'Treffer (grün pulsieren)', appSettings.hue.effectDuration.hit, 200, 2000)}
                    ${this._hueSlider('miss', 'Fehlwurf (rot pulsieren)', appSettings.hue.effectDuration.miss, 200, 2000)}
                    ${this._hueSlider('highScore', 'Highscore ≥100 (Party-Effekt)', appSettings.hue.effectDuration.highScore, 1000, 10000)}
                    ${this._hueSlider('oneEighty', '180 / Checkout (Colorloop)', appSettings.hue.effectDuration.oneEighty, 2000, 15000)}

                    <div class="mgmt-field" style="margin-top:16px;">
                        <label class="mgmt-lbl">Effekte testen</label>
                        <div class="mgmt-test-row">
                            <button class="mgmt-btn-test" data-fx="HIT">💚 Treffer</button>
                            <button class="mgmt-btn-test" data-fx="MISS">❤️ Miss</button>
                            <button class="mgmt-btn-test" data-fx="HIGH_SCORE">🎉 High</button>
                            <button class="mgmt-btn-test" data-fx="180">🏆 180</button>
                        </div>
                    </div>
                `)}
            ` : ''}
        `;

        // ── Toggle ──
        const btnPwr = el.querySelector('#hue-pwr');
        if (btnPwr) btnPwr.onclick = () => { HueService.toggleEnabled(); this._renderHue(el); };

        // ── Discover ──
        const btnDisc = el.querySelector('#hue-disc');
        if (btnDisc) btnDisc.onclick = async () => {
            btnDisc.textContent = '⏳ Suche…'; btnDisc.disabled = true;
            const ip = await HueService.discoverBridge();
            const inp = el.querySelector('#hue-ip');
            if (inp && ip) inp.value = ip;
            btnDisc.textContent = ip ? '✅ Gefunden' : '❌ Fehler';
            setTimeout(() => { btnDisc.textContent = '🔍 Suchen'; btnDisc.disabled = false; }, 2000);
        };

        // ── Connect ──
        const btnConn = el.querySelector('#hue-conn');
        if (btnConn) btnConn.onclick = async () => {
            const inp = el.querySelector('#hue-ip');
            const ip = inp?.value?.trim();
            if (!ip) return;
            const c = HueService.getConfig();
            c.bridgeIp = ip;
            HueService._saveConfig();
            btnConn.textContent = '⏳'; btnConn.disabled = true;
            const success = await HueService.checkConnection();
            btnConn.disabled = false;
            if (success) { this._renderHue(el); }
            else { btnConn.textContent = '❌ Fehler'; setTimeout(() => { btnConn.textContent = 'Verbinden'; }, 2000); }
        };

        // ── Effect sliders ──
        el.querySelectorAll('.hue-sl').forEach(slider => {
            const k = slider.dataset.k;
            const v = el.querySelector(`.hue-sv[data-k="${k}"]`);
            slider.oninput = () => { v.textContent = (parseInt(slider.value)/1000).toFixed(1) + 's'; };
            slider.onchange = () => { appSettings.hue.effectDuration[k] = parseInt(slider.value); _saveSettings(); this._flash(slider.parentElement); };
        });

        // ── Test buttons ──
        el.querySelectorAll('.mgmt-btn-test').forEach(btn => {
            btn.onclick = () => {
                HueService.trigger(btn.dataset.fx);
                btn.classList.add('mgmt-testing');
                setTimeout(() => btn.classList.remove('mgmt-testing'), 1500);
            };
        });
    },

    _hueSlider(key, label, val, min, max) {
        return `
            <div class="mgmt-field mgmt-field-compact">
                <label class="mgmt-lbl">${label}</label>
                <div class="mgmt-range-row">
                    <input type="range" class="mgmt-range hue-sl" data-k="${key}" min="${min}" max="${max}" step="100" value="${val}">
                    <span class="mgmt-range-val hue-sv" data-k="${key}">${(val/1000).toFixed(1)}s</span>
                </div>
            </div>
        `;
    },

    // ═══════════════════════════════════════════════════════════
    //  TAB 4: AUTODARTS
    // ═══════════════════════════════════════════════════════════

    _renderAutodarts(el) {
        const active = AutodartsService.isActive();

        el.innerHTML = `
            ${this._section(`<span style="display:flex;align-items:center;gap:8px;">📡 Autodarts <span class="mgmt-badge mgmt-off">HARDWARE ERFORDERLICH</span></span>`, `
                <p class="mgmt-desc">Autodarts erkennt Darts automatisch per Kamera und überträgt die Wurfdaten in Echtzeit an die App.</p>
                <div class="mgmt-info-table">
                    <div class="mgmt-info-row"><span class="mgmt-info-k">Status</span><span class="mgmt-info-v ${active?'mgmt-ok':''}">${active ? '● Aktiv' : '○ Inaktiv'}</span></div>
                    <div class="mgmt-info-row"><span class="mgmt-info-k">Firebase-Pfad</span><span class="mgmt-info-v mgmt-mono">autodarts_live/current_throw</span></div>
                </div>
            `)}

            ${this._section('So funktioniert es', `
                <div class="mgmt-steps">
                    <div class="mgmt-step"><span class="mgmt-step-n">1</span><div><strong>Hardware aufstellen</strong><p>Kamera am Board montieren, mit WLAN verbinden.</p></div></div>
                    <div class="mgmt-step"><span class="mgmt-step-n">2</span><div><strong>Kalibrierung</strong><p>Board-Position erkennen, Segmente kalibrieren.</p></div></div>
                    <div class="mgmt-step"><span class="mgmt-step-n">3</span><div><strong>Spiel starten</strong><p>Im Setup "📡 Autodarts: AN" aktivieren. Darts werden erkannt.</p></div></div>
                </div>
            `)}

            ${this._section('Erwartetes Datenformat', `
                <pre class="mgmt-code">{
  "segment": "T20",
  "x": 6.2,
  "y": -3.1,
  "confidence": 0.95
}</pre>
                <div class="mgmt-hint">Der Normalizer in dart-model.js erkennt dieses Format automatisch.</div>
            `)}
        `;
    },

    // ═══════════════════════════════════════════════════════════
    //  SHARED HELPERS
    // ═══════════════════════════════════════════════════════════

    _section(title, content) {
        return `<div class="mgmt-card"><h4 class="mgmt-card-title">${title}</h4>${content}</div>`;
    },

    _flash(el) {
        el.classList.add('mgmt-flash');
        setTimeout(() => el.classList.remove('mgmt-flash'), 600);
    },

    // External API: let Setup read defaults
    getSettings() {
        if (!appSettings) _loadSettings();
        return appSettings;
    },
};
