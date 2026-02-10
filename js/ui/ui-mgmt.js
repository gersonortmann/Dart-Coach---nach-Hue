import { State } from '../core/state.js';
import { UI } from './ui-core.js';

// --- PRIVATE VARS ---
let selectedPlayerId = null;
let activeFilter = 'all'; 

export const Management = {
    
    init: function() {
        this.renderDashboard();
    },

    renderDashboard: function() {
        const container = document.getElementById('management-container');
        if(!container) return;
        
        container.innerHTML = `
            <div class="mgmt-grid">
                <div class="mgmt-sidebar">
                    <div class="mgmt-add-box">
                        <h4 style="margin-bottom:10px; color:#888; text-transform:uppercase; font-size:0.8rem;">Spieler hinzufügen</h4>
                        <div style="display:flex; gap:10px;">
                            <input type="text" id="inp-new-player" class="inp-mgmt" placeholder="Name...">
                            <button id="btn-add-player" class="btn-compact primary" style="padding:0 15px;">+</button>
                        </div>
                    </div>
                    <div id="mgmt-player-list" class="mgmt-player-scroll"></div>
                </div>

                <div id="mgmt-detail-area" class="mgmt-content"></div>
            </div>
        `;

        document.getElementById('btn-add-player').onclick = () => this.handleAddPlayer();
        
        this.renderPlayerList();
        this.renderDetailView();
    },

    renderPlayerList: function() {
        const list = document.getElementById('mgmt-player-list');
        if(!list) return;
        list.innerHTML = '';

        const players = State.getAvailablePlayers();
        
        if(players.length === 0) {
            list.innerHTML = '<div style="padding:20px; text-align:center; color:#666;">Keine Spieler.</div>';
            return;
        }

        players.forEach(p => {
            const card = document.createElement('div');
            card.className = `mgmt-player-card ${selectedPlayerId === p.id ? 'active' : ''}`;
            const gameCount = p.history ? p.history.length : 0;
            
            card.innerHTML = `
                <span style="font-weight:bold; font-size:1.1rem;">${p.name}</span>
                <span style="font-size:0.8rem; color:${selectedPlayerId === p.id ? '#fff' : '#666'};">${gameCount} Spiele</span>
            `;
            
            card.onclick = () => {
                if(selectedPlayerId !== p.id) {
                    activeFilter = 'all'; 
                }
                selectedPlayerId = p.id;
                this.renderPlayerList(); 
                this.renderDetailView();
            };
            list.appendChild(card);
        });
    },

    renderDetailView: function() {
        const area = document.getElementById('mgmt-detail-area');
        if(!area) return;
        area.innerHTML = '';

        // FALL A: Kein Spieler ausgewählt
        if(!selectedPlayerId) {
            this.renderSystemView(area);
            return;
        }

        // FALL B: Spieler Details
        const p = State.getAvailablePlayers().find(x => x.id === selectedPlayerId);
        if(!p) { selectedPlayerId = null; this.renderDetailView(); return; }

        let html = `
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #444; padding-bottom:20px; margin-bottom:20px;">
                <div>
                    <h2 style="margin:0; font-size:2rem;">${p.name}</h2>
                    <small style="color:#888;">Spieler ID: ${p.id}</small>
                </div>
                <div style="display:flex; gap:10px;">
                    <button id="btn-rename-player" class="btn-compact secondary">✏️ Umbenennen</button>
                    <button id="btn-delete-player" class="btn-compact secondary" style="border-color:#553333; color:#ff6666;">🗑 Löschen</button>
                </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                <h4 style="color:var(--accent-color); margin:0;">SPIELHISTORIE</h4>
        `;

        if (p.history && p.history.length > 0) {
            const uniqueTypes = [...new Set(p.history.map(h => h.game || 'unknown'))];
            
            html += `<select id="mgmt-history-filter" class="mgmt-filter-select">`;
            html += `<option value="all" ${activeFilter === 'all' ? 'selected' : ''}>Alle Spiele (${p.history.length})</option>`;
            
            uniqueTypes.forEach(type => {
                const count = p.history.filter(h => (h.game || 'unknown') === type).length;
                const label = UI.getGameLabel(type);
                const isSelected = activeFilter === type ? 'selected' : '';
                html += `<option value="${type}" ${isSelected}>${label} (${count})</option>`;
            });
            html += `</select>`;
        }

        html += `</div>
            <div id="mgmt-history-list" class="history-list"></div>
        `;
        
        area.innerHTML = html;

        // --- BUTTON LOGIK ---
        
        // Rename (Hier nutzen wir noch Prompt, da wir dafür noch kein Input-Modal haben. 
        // Prompt unterbricht Fullscreen leider auch, aber ist seltener genutzt.)
        document.getElementById('btn-rename-player').onclick = () => {
            const newName = prompt("Neuer Name für " + p.name + ":", p.name);
            if(newName && newName.trim() !== "") {
                State.renamePlayer(p.id, newName.trim()).then(() => {
                    this.renderPlayerList();
                    this.renderDetailView();
                });
            }
        };
        
        // DELETE PLAYER -> JETZT MIT MODAL
        document.getElementById('btn-delete-player').onclick = () => {
            UI.showConfirm(
                "ACHTUNG: SPIELER LÖSCHEN", 
                `Möchtest du "${p.name}" und ALLE Statistiken wirklich unwiderruflich löschen?`, 
                () => {
                    // Lösch-Logik...
                    const players = State.getAvailablePlayers();
                    const idx = players.findIndex(x => x.id === p.id);
                    if (idx > -1) {
                        players.splice(idx, 1);
                        State.saveAll(); 
                        selectedPlayerId = null;
                        this.renderPlayerList();
                        this.renderDetailView();
                    }
                },
                // OPTIONEN FÜR FARBEN:
                {
                    confirmLabel: "JA, WIRKLICH!",
                    confirmClass: "btn-danger",    // ROT
                    cancelLabel: "NEIN, DOCH NICHT!",
                    cancelClass: "btn-success"     // GRÜN
                }
            );
        };

        const filterSelect = document.getElementById('mgmt-history-filter');
        if(filterSelect) {
            filterSelect.onchange = (e) => {
                activeFilter = e.target.value;
                this.renderHistoryList(p); 
            };
        }

        this.renderHistoryList(p);
    },

    renderHistoryList: function(player) {
        const list = document.getElementById('mgmt-history-list');
        if(!list) return;
        list.innerHTML = ''; 

        if(!player.history || player.history.length === 0) {
            list.innerHTML = '<div style="text-align:center; padding:40px; color:#666; border:1px dashed #444; border-radius:10px;">Keine Spiele gefunden.<br>Zeit für ein Match! 🎯</div>';
            return;
        }

        let displayData = player.history.map((h, i) => ({...h, originalIndex: i})).reverse();

        if (activeFilter !== 'all') {
            displayData = displayData.filter(h => (h.game || 'unknown') === activeFilter);
        }

        if (displayData.length === 0) {
             list.innerHTML = '<div style="text-align:center; padding:20px; color:#888;">Keine Einträge für diesen Filter.</div>';
             return;
        }

        displayData.forEach(game => {
            const dateStr = new Date(game.date).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
            const gameLabel = UI.getGameLabel(game.game || 'Game');
            
            const item = document.createElement('div');
            item.className = 'history-item';
            
            item.innerHTML = `
                <div style="color:#888; font-size:0.8rem;">${dateStr}</div>
                <div style="font-weight:bold; color:var(--accent-color);">${gameLabel}</div>
                <div>Score: ${game.totalScore || '-'}</div>
                <button class="btn-delete-icon" title="Spiel löschen">🗑</button>
            `;

            // DELETE GAME ENTRY -> JETZT MIT MODAL
            item.querySelector('button').onclick = () => {
                UI.showConfirm(
                    "SPIEL LÖSCHEN", 
                    "Soll dieser Eintrag wirklich aus der Historie entfernt werden?", 
                    () => {
                        State.deleteGameFromHistory(player.id, game.originalIndex).then(() => {
                            this.renderPlayerList(); 
                            this.renderDetailView(); 
                        });
                    },
                    // OPTIONEN FÜR FARBEN:
                    {
                        confirmLabel: "JA, WEG DAMIT!",
                        confirmClass: "btn-danger",   // ROT
                        cancelLabel: "NEIN, BEHALTEN",
                        cancelClass: "btn-success"    // GRÜN
                    }
                );
            };

            list.appendChild(item);
        });
    },

    renderSystemView: function(container) {
        container.innerHTML = `
            <div style="text-align:center; padding-top:50px;">
                <div style="font-size:3rem; margin-bottom:20px;">⚙️</div>
                <h2 style="margin-bottom:10px;">SYSTEM & DATENBANK</h2>
                <p style="color:#888; max-width:400px; margin:0 auto 30px auto;">
                    Wähle links einen Spieler aus, um Statistiken zu bereinigen oder Spieler umzubenennen.
                </p>
            </div>
        `;
    },

    handleAddPlayer: function() {
        const inp = document.getElementById('inp-new-player');
        const name = inp.value.trim();
        if(!name) return;

        State.addPlayer(name).then(() => {
            inp.value = '';
            this.renderPlayerList();
        }).catch(err => alert(err));
    }
};