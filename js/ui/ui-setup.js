import { State } from '../core/state.js';
import { GameEngine } from '../games/game-engine.js';
import { UI } from './ui-core.js';
import { HueService } from '../core/hue-service.js';
import { AutodartsService } from '../core/autodarts-service.js';
import { Management } from './ui-mgmt.js';
import { TrainingManager } from '../core/training-manager.js';

// --- PRIVATE STATUS-VARIABLEN ---
const STORAGE_KEY_SETTINGS = 'dart_coach_settings_v2';
const STORAGE_KEY_LINEUP = 'dart_coach_global_lineup';

let selectedGameType = 'x01';
let useAutodarts = false;
let setupLineup = []; 

// Basis-Werte (werden durch Management-Defaults überschrieben)
let x01Settings = { startScore: 501, doubleIn: false, doubleOut: true, mode: 'legs', bestOf: 3 };
let singleTrainingSettings = { mode: 'ascending' };
let shanghaiSettings = { mode: 'ascending', length: 'standard' };
let atbSettings = { direction: 'ascending', variant: 'full' };
let cricketSettings = { mode: 'standard', spRounds: 20 };
let checkoutSettings = { difficulty: 'standard', rounds: 10, doubleOut: true, turnsPerTarget: 1 };
let halveItSettings = { mode: 'standard', direction: 'descending', useSpecials: true };
let scoringSettings = { dartLimit: 99 };
let segmentMasterSettings = { segment: 20, turnLimit: 10, zone: 'any' };
let killerSettings = { lives: 3, zone: 'double', shield: false };

// --- PRIVATE HELPER: SPEICHERN & LADEN ---

function _getDefaultSettings(gameId) {
    try {
        const defaults = Management.getSettings().defaults;
        return defaults && defaults[gameId] ? defaults[gameId] : {};
    } catch (e) {
        console.warn("Konnte Management Defaults nicht laden", e);
        return {};
    }
}

function _loadSettings() {
    try {
        // 1. Browser-Storage laden (NUR für Spielauswahl & Lineup, NICHT für Regeln)
        const rawSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
        if (rawSettings) {
            const data = JSON.parse(rawSettings);
            // Wir merken uns nur, welches Spiel zuletzt offen war
            if (data.gameType) selectedGameType = data.gameType;
            
            // HIER WURDE GEÄNDERT: Wir laden NICHT mehr die alten Regel-Einstellungen (data.x01 etc.)
            // Damit verhindern wir, dass alte "Last Played"-Settings die Management-Vorgaben überschreiben.
        }

        // 2. Management-Defaults strikt anwenden (Source of Truth)
        const defX01 = _getDefaultSettings('x01');
        const defCricket = _getDefaultSettings('cricket');
        const defShanghai = _getDefaultSettings('shanghai');
        const defATB = _getDefaultSettings('around-the-board');
        const defSingle = _getDefaultSettings('single-training');
		const defCheckout = _getDefaultSettings('checkout-challenge');
		const defHalveIt = _getDefaultSettings('halveIt');
		const defScoring = _getDefaultSettings('scoring-drill');

        // Defaults drüberbügeln (Deep Merge ist hier nicht nötig, flaches Merge reicht für Settings-Objekte)
        if(Object.keys(defX01).length) x01Settings = { ...x01Settings, ...defX01 };
        if(Object.keys(defCricket).length) cricketSettings = { ...cricketSettings, ...defCricket };
        if(Object.keys(defShanghai).length) shanghaiSettings = { ...shanghaiSettings, ...defShanghai };
        if(Object.keys(defATB).length) atbSettings = { ...atbSettings, ...defATB };
        if(Object.keys(defSingle).length) singleTrainingSettings = { ...singleTrainingSettings, ...defSingle };
		if(Object.keys(defCheckout).length) checkoutSettings = { ...checkoutSettings, ...defCheckout };
		if(Object.keys(defHalveIt).length) halveItSettings = { ...halveItSettings, ...defHalveIt };
		if(Object.keys(defScoring).length) scoringSettings = { ...scoringSettings, ...defScoring };
		
        // 3. Lineup laden (Spieler sollen erhalten bleiben)
        const rawLineup = localStorage.getItem(STORAGE_KEY_LINEUP);
        if (rawLineup) {
            const savedLineup = JSON.parse(rawLineup);
            const allAvailableIds = State.getAvailablePlayers().map(p => p.id);
            setupLineup = savedLineup.filter(id => allAvailableIds.includes(id));
        }
    } catch (e) {
        console.warn("Konnte Einstellungen nicht vollständig laden", e);
    }
}

function _saveSettings() {
    try {
        // Wir speichern weiterhin alles, damit der Reload (F5) theoretisch den State kennt,
        // aber _loadSettings ignoriert die Details beim nächsten Start bewusst.
        const settingsData = {
            gameType: selectedGameType,
            x01: x01Settings,
			cricket: cricketSettings,
			atb: atbSettings,
			checkout: checkoutSettings,
			halveIt: halveItSettings,
			scoring: scoringSettings
        };
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settingsData));
        localStorage.setItem(STORAGE_KEY_LINEUP, JSON.stringify(setupLineup));
    } catch (e) {
        console.error("Speichern fehlgeschlagen", e);
    }
}

// --- PRIVATE RENDER-FUNKTIONEN ---

function _initMatchSetup() {
    _renderSetupLists();
    
    const optWrapper = document.getElementById('setup-options-wrapper');
    if(optWrapper) {
        optWrapper.style.display = 'block';
        _renderSetupOptions(); 
    }
}

function _renderSetupOptions() {
    const c = document.getElementById('setup-options-container');
    if(!c) return;

    const startBtn = document.getElementById('btn-start-match');
    if (startBtn && startBtn.parentElement) {
        startBtn.parentElement.removeChild(startBtn);
    }
    
    const footer = document.querySelector('.setup-footer');
    if(footer) footer.style.display = 'none';

    c.innerHTML = '';

    // --- 1. HEADER TOOLBAR ---
    const headerRow = document.createElement('div');
    headerRow.style.display = 'flex';
    headerRow.style.justifyContent = 'space-between';
    headerRow.style.alignItems = 'center';
    headerRow.style.marginBottom = '25px';
    headerRow.style.paddingBottom = '15px';
    headerRow.style.borderBottom = '1px solid #444';
    headerRow.style.flexWrap = 'wrap'; 
    headerRow.style.gap = '15px';

    const leftGrp = document.createElement('div');
    leftGrp.style.display = 'flex';
    leftGrp.style.alignItems = 'center';
    leftGrp.style.gap = '15px';

    if(startBtn) {
        startBtn.style.width = 'auto';
        startBtn.style.margin = '0';
        startBtn.style.padding = '10px 25px'; 
        startBtn.style.fontSize = '1rem';
        startBtn.style.minWidth = '140px';
        startBtn.innerHTML = "SET THE STAGE! 🎭";
        leftGrp.appendChild(startBtn);
    }

    const gameLabel = UI.getGameLabel(selectedGameType);
    const title = document.createElement('span');
    title.style.fontSize = '1.3rem';
    title.style.fontWeight = '800';
    title.style.color = 'var(--text-color)';
    title.style.textTransform = 'uppercase';
    title.innerText = gameLabel;
    leftGrp.appendChild(title);

    headerRow.appendChild(leftGrp);

    const rightGrp = document.createElement('div');
    rightGrp.style.display = 'flex';
    rightGrp.style.alignItems = 'center';
    rightGrp.style.gap = '10px';

    const btnAuto = document.createElement('button');
    btnAuto.className = 'opt-btn-big'; 
    btnAuto.style.width = 'auto';
    btnAuto.style.minWidth = 'auto';
    btnAuto.style.padding = '10px 20px';
    btnAuto.style.fontSize = '0.9rem';
    btnAuto.style.flex = 'none'; 
    
    if(useAutodarts) {
        btnAuto.innerHTML = "📡 Autodarts: <b>AN</b>";
        btnAuto.classList.add('active');
        btnAuto.style.borderColor = 'var(--accent-color)';
        btnAuto.style.color = 'white';
    } else {
        btnAuto.innerHTML = "📡 Autodarts: AUS";
        btnAuto.classList.remove('active');
        btnAuto.style.borderColor = '#444';
        btnAuto.style.color = '#aaa';
    }
    
    btnAuto.onclick = () => {
        useAutodarts = !useAutodarts;
        _renderSetupOptions(); 
    };
    rightGrp.appendChild(btnAuto);

    const config = GameEngine.getGameConfig(selectedGameType);
    const descText = (config && config.description) ? config.description : "Keine Beschreibung verfügbar.";
    
    const btnInfo = document.createElement('button');
    btnInfo.className = 'icon-btn-square';
    btnInfo.style.width = '44px';
    btnInfo.style.height = '44px';
    btnInfo.style.fontSize = '1.2rem';
    btnInfo.style.background = '#333';
    btnInfo.style.color = '#ccc';
    btnInfo.style.border = '1px solid #444';
    btnInfo.innerText = "ℹ️";
    btnInfo.onclick = () => {
        UI.showMatchModal("SPIELREGELN", descText, "ALLES KLAR");
    };
    rightGrp.appendChild(btnInfo);

    headerRow.appendChild(rightGrp);
    c.appendChild(headerRow);


    // --- 2. SPIEL-OPTIONEN RENDERN ---
    if (selectedGameType === 'x01') {
        _renderX01OptionsBig(c); 
    } 
	else if (selectedGameType === 'single-training') {
        _renderSingleTrainingOptions(c);
    }
	else if (selectedGameType === 'shanghai') {
        _renderShanghaiOptions(c);
    }
	else if (selectedGameType === 'bobs27') {
		const info = document.createElement('div');
		info.className = 'opt-group-big';
		info.innerHTML = '<p style="color:#888; text-align:center;">Starte mit 27 Punkten.<br>Triff die Doppel. Fehlwürfe kosten Punkte.<br>Fall nicht unter 0!</p>';
		c.appendChild(info);
	}
	else if (selectedGameType === 'cricket') {
        _renderCricketOptions(c);
    }
	else if (selectedGameType === 'around-the-board') {
        _renderAtbOptions(c);
    }
	else if (selectedGameType === 'checkout-challenge') {
        _renderCheckoutChallengeOptions(c);
    }
	else if (selectedGameType === 'halve-it') {
        _renderHalveItOptions(c);
    }
	else if (selectedGameType === 'scoring-drill') {
    _renderScoringDrillOptions(c);
	}
	else if (selectedGameType === 'segment-master') {
        _renderSegmentMasterOptions(c);
    }
    else if (selectedGameType === 'killer') {
        _renderKillerOptions(c);
    }

    // ── BOT-DIFFICULTY: immer anzeigen wenn Bot im Lineup ist ────────────────
    const allPlayers = State.getAvailablePlayers();
    const botsInLineup = setupLineup
        .map(id => allPlayers.find(p => p.id === id))
        .filter(p => p?.isBot);

    if (botsInLineup.length > 0) {
        const bot = botsInLineup[0];
        const currentDiff = bot.botDifficulty ?? 60;

        const grp = document.createElement('div');
        grp.className = 'opt-group-big';
        grp.innerHTML = `<span class="opt-label-big">🤖 Bot-Spielstärke</span>`;

        const sel = document.createElement('select');
        sel.className = 'opt-select';
        sel.style.cssText = 'width:100%;padding:10px 14px;background:#1a1a2e;color:#fff;border:1px solid #444;border-radius:8px;font-size:1rem;margin-top:6px;';
        const steps = [30,35,40,45,50,55,60,65,70,75,80,85,90,95,100];
        steps.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v;
            opt.textContent = `${v}er Average`;
            if (v === currentDiff) opt.selected = true;
            sel.appendChild(opt);
        });
        sel.onchange = () => {
            bot.botDifficulty = parseInt(sel.value);
            _saveSettings();
            _renderSetupLists(); // Badge im Lineup sofort aktualisieren
        };
        grp.appendChild(sel);
        c.appendChild(grp);
    }
}

function _renderScoringDrillOptions(container) {
    const grp = document.createElement('div'); 
    grp.className = 'opt-group-big';
    grp.innerHTML = '<span class="opt-label-big">Anzahl Darts</span>';
    
    const row = document.createElement('div'); 
    row.className = 'opt-row-big';

    const limits = [
        { val: 33, label: '33 (Sprint)' },
        { val: 66, label: '66 (Medium)' },
        { val: 99, label: '99 (Classic)' }
    ];

    limits.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (scoringSettings.dartLimit === opt.val ? 'active' : '');
        b.innerText = opt.label;
        b.onclick = () => { 
            scoringSettings.dartLimit = opt.val; 
            _saveSettings();
            _renderSetupOptions(); 
        };
        row.appendChild(b);
    });
    grp.appendChild(row);
    container.appendChild(grp);
}

function _renderSegmentMasterOptions(container) {
    const isBull = segmentMasterSettings.segment === 25;

    // ── 1. Segment-Auswahl ─────────────────────────────────────
    const grpSeg = document.createElement('div');
    grpSeg.className = 'opt-group-big';
    grpSeg.innerHTML = '<span class="opt-label-big">Ziel-Segment</span>';

    const rowSeg = document.createElement('div');
    rowSeg.className = 'opt-row-big';
    rowSeg.style.cssText = 'flex-wrap:wrap; gap:6px;';

    const segments = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,'Bull'];
    segments.forEach(s => {
        const val = s === 'Bull' ? 25 : s;
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (segmentMasterSettings.segment === val ? 'active' : '');
        b.style.cssText = 'min-width:44px; padding:8px 6px; font-size:0.9rem;';
        b.innerText = String(s);
        b.onclick = () => {
            segmentMasterSettings.segment = val;
            // Zone-Reset wenn Bull ↔ Zahl wechsel
            if (val === 25 && !['single','double'].includes(segmentMasterSettings.zone)) {
                segmentMasterSettings.zone = 'any';
            }
            _saveSettings();
            _renderSetupOptions();
        };
        rowSeg.appendChild(b);
    });
    grpSeg.appendChild(rowSeg);
    container.appendChild(grpSeg);

    // ── 2. Zonen-Auswahl ───────────────────────────────────────
    const grpZone = document.createElement('div');
    grpZone.className = 'opt-group-big';
    grpZone.innerHTML = '<span class="opt-label-big">Ziel-Zone</span>';

    const rowZone = document.createElement('div');
    rowZone.className = 'opt-row-big';
    rowZone.style.flexWrap = 'wrap';

    const zoneOpts = isBull
        ? [ { val:'any', l:'Alle (S+D)' }, { val:'single', l:'Single (25)' }, { val:'double', l:'Double (Bull)' } ]
        : [ { val:'any', l:'Alle Zonen' }, { val:'single', l:'Single (I+O)' }, { val:'inner', l:'Inner Single' }, { val:'outer', l:'Outer Single' }, { val:'double', l:'Double' }, { val:'triple', l:'Triple' } ];

    zoneOpts.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (segmentMasterSettings.zone === opt.val ? 'active' : '');
        b.innerText = opt.l;
        if (['inner','outer'].includes(opt.val)) {
            b.title = 'Mit manuellem Keypad nicht unterscheidbar – nur mit Autodarts';
            b.style.opacity = '0.75';
        }
        b.onclick = () => {
            segmentMasterSettings.zone = opt.val;
            _saveSettings();
            _renderSetupOptions();
        };
        rowZone.appendChild(b);
    });
    grpZone.appendChild(rowZone);

    // Hinweis bei Inner/Outer
    if (['inner','outer'].includes(segmentMasterSettings.zone)) {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-size:0.75rem;color:#f59e0b;margin-top:6px;';
        hint.innerText = '⚠️ Inner/Outer nur mit Autodarts unterscheidbar. Manuell wird jede Single gezählt.';
        grpZone.appendChild(hint);
    }
    container.appendChild(grpZone);

    // ── 3. Aufnahmen-Limit ─────────────────────────────────────
    const grpLimit = document.createElement('div');
    grpLimit.className = 'opt-group-big';
    grpLimit.innerHTML = '<span class="opt-label-big">Anzahl Aufnahmen</span>';

    const rowLimit = document.createElement('div');
    rowLimit.className = 'opt-row-big';
    [
        { val: 5,  label: '5 (15 Darts)' },
        { val: 10, label: '10 (30 Darts)' },
        { val: 15, label: '15 (45 Darts)' },
    ].forEach(opt => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (segmentMasterSettings.turnLimit === opt.val ? 'active' : '');
        b.innerText = opt.label;
        b.onclick = () => {
            segmentMasterSettings.turnLimit = opt.val;
            _saveSettings();
            _renderSetupOptions();
        };
        rowLimit.appendChild(b);
    });
    grpLimit.appendChild(rowLimit);
    container.appendChild(grpLimit);
}

function _renderKillerOptions(container) {
    // ── 1. Leben pro Spieler ──────────────────────────────────────────────
    const grpLives = document.createElement('div');
    grpLives.className = 'opt-group-big';
    grpLives.innerHTML = '<span class="opt-label-big">Leben pro Spieler</span>';
    const rowLives = document.createElement('div');
    rowLives.className = 'opt-row-big';
    [
        { val: 3, label: '❤️❤️❤️ 3' },
        { val: 5, label: '❤️ 5' },
        { val: 7, label: '❤️ 7' },
    ].forEach(opt => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (killerSettings.lives === opt.val ? 'active' : '');
        b.innerText = opt.label;
        b.onclick = () => { killerSettings.lives = opt.val; _saveSettings(); _renderSetupOptions(); };
        rowLives.appendChild(b);
    });
    grpLives.appendChild(rowLives);
    container.appendChild(grpLives);

    // ── 2. Zone (wie ATB) ─────────────────────────────────────────────────
    const grpZone = document.createElement('div');
    grpZone.className = 'opt-group-big';
    grpZone.innerHTML = '<span class="opt-label-big">Trefferzone</span>';
    const rowZone = document.createElement('div');
    rowZone.className = 'opt-row-big';
    [
        { val: 'any',    label: 'Any' },
        { val: 'single', label: 'Single' },
        { val: 'double', label: 'Double' },
        { val: 'triple', label: 'Triple' },
    ].forEach(opt => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (killerSettings.zone === opt.val ? 'active' : '');
        b.innerText = opt.label;
        b.onclick = () => { killerSettings.zone = opt.val; _saveSettings(); _renderSetupOptions(); };
        rowZone.appendChild(b);
    });
    grpZone.appendChild(rowZone);
    container.appendChild(grpZone);

    // ── 3. Shield (an/aus) ────────────────────────────────────────────────
    const grpShield = document.createElement('div');
    grpShield.className = 'opt-group-big';
    grpShield.innerHTML = '<span class="opt-label-big">🛡️ Shield – eigenes Feld = +1 Leben</span>';
    const rowShield = document.createElement('div');
    rowShield.className = 'opt-row-big';
    [
        { val: false, label: 'Aus' },
        { val: true,  label: 'An' },
    ].forEach(opt => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (killerSettings.shield === opt.val ? 'active' : '');
        b.innerText = opt.label;
        b.onclick = () => { killerSettings.shield = opt.val; _saveSettings(); _renderSetupOptions(); };
        rowShield.appendChild(b);
    });
    grpShield.appendChild(rowShield);
    container.appendChild(grpShield);
}

function _renderHalveItOptions(container) {
    // 1. Modus (Länge)
    const grpMode = document.createElement('div'); 
    grpMode.className = 'opt-group-big';
    grpMode.innerHTML = '<span class="opt-label-big">Länge</span>';
    const rowMode = document.createElement('div'); rowMode.className = 'opt-row-big';

    const modes = [
        { id: 'short',    label: 'Short (8)' },
        { id: 'standard', label: 'Standard (13)' },
        { id: 'long',     label: 'Long (22) 🥵' }
    ];

    modes.forEach(m => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (halveItSettings.mode === m.id ? 'active' : '');
        b.innerText = m.label;
        b.onclick = () => { 
            halveItSettings.mode = m.id; 
            _saveSettings();
            _renderSetupOptions(); 
        };
        rowMode.appendChild(b);
    });
    grpMode.appendChild(rowMode);
    container.appendChild(grpMode);

    // 2. Reihenfolge
    const grpDir = document.createElement('div'); 
    grpDir.className = 'opt-group-big';
    grpDir.innerHTML = '<span class="opt-label-big">Reihenfolge</span>';
    const rowDir = document.createElement('div'); rowDir.className = 'opt-row-big';

    const dirs = [
        { id: 'descending', label: 'Absteigend ⬇' },
        { id: 'ascending',  label: 'Aufsteigend ⬆' },
        { id: 'random',     label: 'Zufällig 🎲' }
    ];

    dirs.forEach(d => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (halveItSettings.direction === d.id ? 'active' : '');
        b.innerText = d.label;
        b.onclick = () => { 
            halveItSettings.direction = d.id; 
            _saveSettings();
            _renderSetupOptions(); 
        };
        rowDir.appendChild(b);
    });
    grpDir.appendChild(rowDir);
    container.appendChild(grpDir);
    
    // 3. NEU: Sonderfelder (Specials)
    const grpSpec = document.createElement('div');
    grpSpec.className = 'opt-group-big';
    grpSpec.innerHTML = '<span class="opt-label-big">Sonderfelder (Double/Triple)</span>';
    const rowSpec = document.createElement('div'); 
    rowSpec.className = 'opt-switch-row-big'; // Switch Style

    const btnYes = document.createElement('button');
    btnYes.className = 'opt-btn-big ' + (halveItSettings.useSpecials !== false ? 'active' : ''); // Default true
    btnYes.innerText = "Ein";
    btnYes.onclick = () => {
        halveItSettings.useSpecials = true;
        _saveSettings();
        _renderSetupOptions();
    };

    const btnNo = document.createElement('button');
    btnNo.className = 'opt-btn-big ' + (halveItSettings.useSpecials === false ? 'active' : '');
    btnNo.innerText = "Aus";
    btnNo.onclick = () => {
        halveItSettings.useSpecials = false;
        _saveSettings();
        _renderSetupOptions();
    };

    rowSpec.appendChild(btnYes);
    rowSpec.appendChild(btnNo);
    grpSpec.appendChild(rowSpec);
    container.appendChild(grpSpec);
}

function _renderCheckoutChallengeOptions(container) {
    // 1. SCHWIERIGKEIT
    const grpDiff = document.createElement('div'); 
    grpDiff.className = 'opt-group-big';
    grpDiff.innerHTML = '<span class="opt-label-big">Schwierigkeit</span>';
    const rowDiff = document.createElement('div'); rowDiff.className = 'opt-row-big';
    
    const diffs = [
		{ id: 'easy',     label: '🟢 Easy (40-80)' },
		{ id: 'standard', label: '🟡 Normal (60-120)' },
		{ id: 'hard',     label: '🔴 Hard (100-170)' }
	];

    diffs.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (checkoutSettings.difficulty === opt.id ? 'active' : '');
        b.innerText = opt.label;
        b.onclick = () => { 
            checkoutSettings.difficulty = opt.id; 
            _saveSettings(); // Optional, wenn du es persistieren willst
            _renderSetupOptions(); 
        };
        rowDiff.appendChild(b);
    });
    grpDiff.appendChild(rowDiff);
    container.appendChild(grpDiff);

    // 2. ANZAHL RUNDEN
    const grpLen = document.createElement('div'); 
    grpLen.className = 'opt-group-big';
    grpLen.innerHTML = '<span class="opt-label-big">Anzahl Checkouts</span>';
    const rowLen = document.createElement('div'); rowLen.className = 'opt-row-big';
    
    [10, 20, 30].forEach(num => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (checkoutSettings.rounds === num ? 'active' : '');
        b.innerText = num + " Stück";
        b.onclick = () => { 
            checkoutSettings.rounds = num; 
            _saveSettings();
            _renderSetupOptions(); 
        };
        rowLen.appendChild(b);
    });
    grpLen.appendChild(rowLen);
    container.appendChild(grpLen);

    // 2b. AUFNAHMEN PRO ZIEL
    const grpTurns = document.createElement('div');
    grpTurns.className = 'opt-group-big';
    grpTurns.innerHTML = '<span class="opt-label-big">Aufnahmen pro Ziel</span>';
    const rowTurns = document.createElement('div'); rowTurns.className = 'opt-row-big';

    [1, 2, 3].forEach(num => {
        const b = document.createElement('button');
        const tpt = checkoutSettings.turnsPerTarget || 1;
        b.className = 'opt-btn-big ' + (tpt === num ? 'active' : '');
        b.innerText = num === 1 ? '1 (3 Darts)' : num === 2 ? '2 (6 Darts)' : '3 (9 Darts)';
        b.onclick = () => {
            checkoutSettings.turnsPerTarget = num;
            _saveSettings();
            _renderSetupOptions();
        };
        rowTurns.appendChild(b);
    });
    grpTurns.appendChild(rowTurns);
    container.appendChild(grpTurns);
	
	// 3. NEU: MODUS (Double Out / Single Out)
    const grpMode = document.createElement('div'); 
    grpMode.className = 'opt-group-big';
    grpMode.innerHTML = '<span class="opt-label-big">Check Modus</span>';
    const rowMode = document.createElement('div'); rowMode.className = 'opt-switch-row-big'; // Switch Style
    
    const btnDouble = document.createElement('button');
    btnDouble.className = 'opt-btn-big ' + (checkoutSettings.doubleOut ? 'active' : '');
    btnDouble.innerText = "Double Out";
    btnDouble.onclick = () => { 
        checkoutSettings.doubleOut = true; 
        _saveSettings(); 
        _renderSetupOptions(); 
    };
    
    const btnSingle = document.createElement('button');
    btnSingle.className = 'opt-btn-big ' + (!checkoutSettings.doubleOut ? 'active' : '');
    btnSingle.innerText = "Single Out";
    btnSingle.onclick = () => { 
        checkoutSettings.doubleOut = false; 
        _saveSettings(); 
        _renderSetupOptions(); 
    };
    
    rowMode.appendChild(btnDouble);
    rowMode.appendChild(btnSingle);
    grpMode.appendChild(rowMode);
    container.appendChild(grpMode);
}

function _renderAtbOptions(container) {
    const grpDir = document.createElement('div'); 
    grpDir.className = 'opt-group-big';
    grpDir.innerHTML = '<span class="opt-label-big">Reihenfolge</span>';
    const rowDir = document.createElement('div'); 
    rowDir.className = 'opt-row-big';
    
    const dirs = [
        { id: 'ascending', label: '📈 1 - 20' },
        { id: 'descending', label: '📉 20 - 1' },
        { id: 'random', label: '🎲 Zufall' }
    ];

    dirs.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (atbSettings.direction === opt.id ? 'active' : '');
        b.innerText = opt.label;
        b.onclick = () => { 
            atbSettings.direction = opt.id; 
            _saveSettings(); 
            _renderSetupOptions(); 
        };
        rowDir.appendChild(b);
    });
    grpDir.appendChild(rowDir);
    container.appendChild(grpDir);

    const grpVar = document.createElement('div'); 
    grpVar.className = 'opt-group-big';
    grpVar.innerHTML = '<span class="opt-label-big">Ziel-Segment</span>';
    const rowVar = document.createElement('div'); 
    rowVar.className = 'opt-row-big'; 
    rowVar.style.flexWrap = 'wrap'; 

    const variants = [
        { id: 'full', label: 'Gesamtes Feld' },
        { id: 'single-inner', label: 'Single Inner' },
        { id: 'single-outer', label: 'Single Outer' },
        { id: 'double', label: 'Double' },
        { id: 'triple', label: 'Triple' }
    ];

    variants.forEach(opt => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (atbSettings.variant === opt.id ? 'active' : '');
        b.innerText = opt.label;
        b.style.fontSize = '0.9rem';
        b.onclick = () => { 
            atbSettings.variant = opt.id; 
            _saveSettings();
            _renderSetupOptions(); 
        };
        rowVar.appendChild(b);
    });
    grpVar.appendChild(rowVar);
    container.appendChild(grpVar);
}

function _renderCricketOptions(container) {
    const grpMode = document.createElement('div'); 
    grpMode.className = 'opt-group-big';
    grpMode.innerHTML = '<span class="opt-label-big">Spielmodus</span>';
    
    const rowMode = document.createElement('div'); 
    rowMode.className = 'opt-row-big';
    
    const isM21 = cricketSettings.mode === 'mark21';

    const btnStd = document.createElement('button');
    btnStd.className = 'opt-btn-big ' + (cricketSettings.mode === 'standard' ? 'active' : '');
    btnStd.innerText = 'Standard';
    btnStd.onclick = () => { 
        cricketSettings.mode = 'standard'; 
        _renderSetupOptions(); 
    };
    rowMode.appendChild(btnStd);

    const btnM21 = document.createElement('button');
    btnM21.className = 'opt-btn-big ' + (isM21 ? 'active' : '');
    btnM21.innerText = '🎯 Mark 21';
    btnM21.title = 'Alle 7 Felder in so wenig Darts wie möglich schließen';
    btnM21.onclick = () => { 
        cricketSettings.mode = 'mark21';
        _renderSetupOptions(); 
    };
    rowMode.appendChild(btnM21);

    grpMode.appendChild(rowMode);
    container.appendChild(grpMode);

    // Rundenlimit nur im Standard-Modus verfügbar
    const grpRounds = document.createElement('div'); 
    grpRounds.className = 'opt-group-big';
    grpRounds.innerHTML = `<span class="opt-label-big">Rundenlimit (1 Player)</span>`;
    
    const rowRounds = document.createElement('div'); 
    rowRounds.className = 'opt-row-big';
    
    const roundOptions = [
        { val: 0, label: '∞ Kein Limit' }, 
        { val: 10, label: '⚡ 10 (Turbo)' },
        { val: 20, label: 'Standard (20)' },
    ];

    rowRounds.style.opacity = isM21 ? '0.35' : '1';
    rowRounds.style.pointerEvents = isM21 ? 'none' : '';

    roundOptions.forEach(opt => {
        const b = document.createElement('button');
        const current = cricketSettings.spRounds !== undefined ? cricketSettings.spRounds : 20;
        
        b.className = 'opt-btn-big ' + (current === opt.val ? 'active' : '');
        b.innerText = opt.label;
        b.disabled = isM21;
        b.onclick = () => { 
            cricketSettings.spRounds = opt.val; 
            _renderSetupOptions(); 
        };
        rowRounds.appendChild(b);
    });

    grpRounds.appendChild(rowRounds);
    container.appendChild(grpRounds);
}

function _renderX01OptionsBig(container) {
    const is170 = x01Settings.startScore === 170;

    const grpScore = document.createElement('div'); grpScore.className = 'opt-group-big';
    grpScore.innerHTML = '<span class="opt-label-big">Start Punkte</span>';
    const rowScore = document.createElement('div'); rowScore.className = 'opt-row-big';
    
    [170, 301, 501, 701].forEach(val => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (x01Settings.startScore === val ? 'active' : '');
        b.innerText = val;
        b.onclick = () => { 
            x01Settings.startScore = val;
            // Bei 170: sinnvolle Defaults setzen
            if (val === 170) {
                x01Settings.mode = 'legs';
                x01Settings.doubleOut = true;
                x01Settings.doubleIn = false;
                if (![5, 10, 20].includes(x01Settings.bestOf)) x01Settings.bestOf = 5;
            }
            _saveSettings(); 
            _renderSetupOptions(); 
        };
        rowScore.appendChild(b);
    });
    grpScore.appendChild(rowScore);
    container.appendChild(grpScore);

    if (is170) {
        // ── 170-Modus: Runden-Auswahl statt Legs/Sets ──
        const grpRounds = document.createElement('div'); grpRounds.className = 'opt-group-big';
        grpRounds.innerHTML = '<span class="opt-label-big">Runden (Checkout-Training)</span>';
        const rowRounds = document.createElement('div'); rowRounds.className = 'opt-row-big';
        
        [5, 10, 20].forEach(val => {
            const b = document.createElement('button');
            b.className = 'opt-btn-big ' + (x01Settings.bestOf === val ? 'active' : '');
            b.innerText = val + ' Runden';
            b.onclick = () => { 
                x01Settings.bestOf = val; 
                _saveSettings(); 
                _renderSetupOptions(); 
            };
            rowRounds.appendChild(b);
        });
        grpRounds.appendChild(rowRounds);
        container.appendChild(grpRounds);

        // Double Out ist immer an → nur Info anzeigen
        const grpInfo = document.createElement('div'); grpInfo.className = 'opt-group-big';
        grpInfo.innerHTML = '<span class="opt-label-big" style="color:#888;">Double Out · Single Player</span>';
        container.appendChild(grpInfo);

    } else {
        // ── Standard X01-Optionen ──
        const grpFmt = document.createElement('div'); grpFmt.className = 'opt-group-big';
        grpFmt.innerHTML = '<span class="opt-label-big">Modus & Länge</span>';
        const rowFmt = document.createElement('div'); rowFmt.className = 'opt-row-big';
        
        ['Legs', 'Sets'].forEach(m => {
            const b = document.createElement('button');
            b.className = 'opt-btn-big ' + (x01Settings.mode === m.toLowerCase() ? 'active' : '');
            b.innerText = m;
            b.onclick = () => { 
                x01Settings.mode = m.toLowerCase(); 
                _saveSettings(); 
                _renderSetupOptions(); 
            };
            rowFmt.appendChild(b);
        });
        grpFmt.appendChild(rowFmt);
        
        const rowLen = document.createElement('div'); rowLen.className = 'opt-row-big'; rowLen.style.marginTop = '10px';
        const lengths = x01Settings.mode === 'sets' ? [1, 3, 5] : [1, 3, 5, 7, 9, 11];
        
        lengths.forEach(val => {
            const b = document.createElement('button');
            b.className = 'opt-btn-big ' + (x01Settings.bestOf === val ? 'active' : '');
            b.innerText = "Best of " + val;
            b.onclick = () => { 
                x01Settings.bestOf = val; 
                _saveSettings(); 
                _renderSetupOptions(); 
            };
            rowLen.appendChild(b);
        });
        grpFmt.appendChild(rowLen);
        container.appendChild(grpFmt);

        const grpMode = document.createElement('div'); grpMode.className = 'opt-group-big';
        grpMode.innerHTML = '<span class="opt-label-big">Check In / Out</span>';
        const rowMode = document.createElement('div'); rowMode.className = 'opt-switch-row-big';
        
        const btnIn = document.createElement('button');
        btnIn.className = 'opt-btn-big ' + (x01Settings.doubleIn ? 'active' : '');
        btnIn.innerText = "Double In";
        btnIn.onclick = () => { 
            x01Settings.doubleIn = !x01Settings.doubleIn; 
            _saveSettings(); 
            _renderSetupOptions(); 
        };
        
        const btnOut = document.createElement('button');
        btnOut.className = 'opt-btn-big ' + (x01Settings.doubleOut ? 'active' : '');
        btnOut.innerText = "Double Out";
        btnOut.onclick = () => { 
            x01Settings.doubleOut = !x01Settings.doubleOut; 
            _saveSettings(); 
            _renderSetupOptions(); 
        };
        
        rowMode.appendChild(btnIn); rowMode.appendChild(btnOut);
        grpMode.appendChild(rowMode);
        container.appendChild(grpMode);
    }
}

function _renderSingleTrainingOptions(container) {
    const grp = document.createElement('div'); 
    grp.className = 'opt-group-big';
    grp.innerHTML = '<span class="opt-label-big">Ziel-Reihenfolge</span>';
    
    const row = document.createElement('div'); 
    row.className = 'opt-row-big';
    
    const modes = [
        { id: 'ascending', label: '📈 1 - 20' },
        { id: 'descending', label: '📉 20 - 1' },
        { id: 'random', label: '🎲 Zufall' }
    ];
    
    modes.forEach(m => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (singleTrainingSettings.mode === m.id ? 'active' : '');
        b.innerText = m.label;
        
        b.onclick = () => { 
            singleTrainingSettings.mode = m.id; 
            _renderSetupOptions(); 
        };
        row.appendChild(b);
    });
    
    grp.appendChild(row);
    container.appendChild(grp);
}

function _renderShanghaiOptions(container) {
    const grpMode = document.createElement('div'); 
    grpMode.className = 'opt-group-big';
    grpMode.innerHTML = '<span class="opt-label-big">Reihenfolge</span>';
    const rowMode = document.createElement('div'); rowMode.className = 'opt-row-big';
    
    const modes = [
        { id: 'ascending', label: '📈 Auf' },
        { id: 'descending', label: '📉 Ab' },
        { id: 'random', label: '🎲 Zufall' }
    ];
    
    modes.forEach(m => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (shanghaiSettings.mode === m.id ? 'active' : '');
        b.innerText = m.label;
        b.onclick = () => { 
            shanghaiSettings.mode = m.id; 
            _renderSetupOptions(); 
        };
        rowMode.appendChild(b);
    });
    grpMode.appendChild(rowMode);
    container.appendChild(grpMode);

    const grpLen = document.createElement('div'); 
    grpLen.className = 'opt-group-big';
    grpLen.innerHTML = '<span class="opt-label-big">Länge</span>';
    const rowLen = document.createElement('div'); rowLen.className = 'opt-row-big';
    
    const lengths = [
        { id: 'standard', label: 'Standard (1-7)' },
        { id: 'full', label: 'Full (1-20)' }
    ];
    
    lengths.forEach(l => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (shanghaiSettings.length === l.id ? 'active' : '');
        b.innerText = l.label;
        b.onclick = () => { 
            shanghaiSettings.length = l.id; 
            _renderSetupOptions(); 
        };
        rowLen.appendChild(b);
    });
    grpLen.appendChild(rowLen);
    container.appendChild(grpLen);
}

function _renderSetupLists() {
    const poolList = document.getElementById('setup-pool-list');
    const lineupList = document.getElementById('setup-lineup-list');
    if(!poolList || !lineupList) return;

    poolList.innerHTML = '';
    lineupList.innerHTML = '';

    const allPlayers = State.getAvailablePlayers();

    if(setupLineup.length === 0) {
        lineupList.innerHTML = '<div class="empty-state" style="color:#666; text-align:center; padding:20px; font-style:italic;">Leer</div>';
    } else {
        setupLineup.forEach((pId, index) => {
            const p = allPlayers.find(x => x.id === pId);
            if(!p) return; 

            const item = document.createElement('div');
            item.className = 'player-setup-card'; 
            const botBadge = p.isBot ? `<span style="font-size:0.7rem;color:#8b5cf6;margin-left:6px;">${p.botDifficulty ?? 60}er</span>` : '';
            item.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <span class="rank-badge">${index + 1}</span>
                    <span>${p.name}${botBadge}</span>
                </div>
                <span class="action-icon icon-remove">✕</span>
            `;
            item.onclick = () => {
                setupLineup.splice(index, 1);
                _renderSetupLists();
                _renderSetupOptions();
            };
            lineupList.appendChild(item);
        });
    }

    const available = allPlayers.filter(p => !setupLineup.includes(p.id));
    if(available.length === 0) {
        poolList.innerHTML = '<div class="empty-state" style="color:#666; text-align:center; padding:20px; font-style:italic;">Alle gewählt</div>';
    }
    available.forEach(p => {
        const item = document.createElement('div');
        item.className = 'player-setup-card';
        const botBadge = p.isBot ? `<span style="font-size:0.7rem;color:#8b5cf6;margin-left:6px;">${p.botDifficulty ?? 60}er</span>` : '';
        item.innerHTML = `
            <span>${p.name}${botBadge}</span>
            <span class="action-icon icon-add">+</span>
        `;
        item.onclick = () => {
            setupLineup.push(p.id);
            _renderSetupLists();
            _renderSetupOptions();
        };
        poolList.appendChild(item);
    });
}

function _shuffleLineup() {
    if(setupLineup.length < 2) return;
    for (let i = setupLineup.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [setupLineup[i], setupLineup[j]] = [setupLineup[j], setupLineup[i]];
    }
    _saveSettings();
    _renderSetupLists();
}

export const Setup = {
    init: function() {
        console.log("🛠 Setup Init");
        _loadSettings();
    },

    openSetupForCurrent: function() {
		HueService.setMood('match-setup');
        const session = State.getActiveSession();
        if (session) {
            selectedGameType = session.gameId;
        } 
        
        _initMatchSetup(); 
        UI.showScreen('screen-match-setup');
    },
	
	selectGameAndOpenSetup: function(gameId) {
        console.log("Dashboard wählt Spiel:", gameId);
        selectedGameType = gameId;
        _saveSettings();
        UI.showScreen('screen-match-setup');
        _initMatchSetup();
    },
	
    handleStartMatch: function() {
        if(setupLineup.length === 0) { 
            UI.showMatchModal("KEINE SPIELER", "Bitte wähle mindestens einen Spieler für das Match aus.", "Oki doki."); 
            return;
        }

        // Mindestens ein menschlicher Spieler muss dabei sein
        const allPlayers = State.getAvailablePlayers();
        const hasHuman = setupLineup.some(id => {
            const p = allPlayers.find(x => x.id === id);
            return p && !p.isBot;
        });
        if (!hasHuman) {
            UI.showMatchModal("KEIN SPIELER", "Es muss mindestens ein menschlicher Spieler im Match sein.", "Verstanden.");
            return;
        }

        // ── Settings zusammenstellen (schon jetzt, für Modal-Anzeige) ──────
        let gameSettings = this.getCurrentSettings();
        if (!gameSettings) gameSettings = {};

        // ── Pre-Game Modal ────────────────────────────────────────────────
        this._showPreGameModal(selectedGameType, setupLineup, gameSettings, () => {
            if (useAutodarts) {
                AutodartsService.enable((val) => GameEngine.onInput(val));
            } else {
                AutodartsService.disable();
            }
            console.log(`🚀 Starting Game: ${selectedGameType}`);
            GameEngine.startGame(selectedGameType, setupLineup, gameSettings);
        });
    },

    _showPreGameModal: function(gameId, lineup, settings, onStart) {
        const allPlayers = State.getAvailablePlayers();
        const GAME_LABELS = {
            'x01':'X01', 'cricket':'Cricket', 'bobs27':"Bob's 27",
            'single-training':'Single Training', 'around-the-board':'Around the Board',
            'shanghai':'Shanghai', 'halve-it':'Halve It', 'scoring-drill':'Scoring Drill',
            'checkout-challenge':'Checkout Challenge', 'segment-master':'Segment Master',
            'killer':'Killer'
        };
        const GAME_ICONS = {
            'x01':'🎯','cricket':'🏏','bobs27':'🔴','single-training':'🎓',
            'around-the-board':'🔄','shanghai':'🀄','halve-it':'✂️',
            'scoring-drill':'📈','checkout-challenge':'🔥','segment-master':'🎯','killer':'🔪'
        };
        const gameLabel = GAME_LABELS[gameId] || gameId;
        const gameIcon  = GAME_ICONS[gameId] || '🎯';

        // ── Pro Spieler: Statistiken berechnen ────────────────────────────
        const _playerStats = (player) => {
            if (!player) return { last: '–', best: null, bestLabel: '', avg4w: null, avg4wLabel: '' };
            const hist = (player.history || []).filter(h => h.game === gameId);
            if (!hist.length) return { last: 'Erstes Spiel! 🎉', best: null, bestLabel: '', avg4w: null, avg4wLabel: '' };

            const last    = hist[hist.length - 1];
            const lastDate = new Date(last.date).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' });
            const MS_4W   = 28 * 24 * 60 * 60 * 1000;
            const recent  = hist.filter(h => h.date >= Date.now() - MS_4W);

            let best = null, bestLabel = '', avg4w = null, avg4wLabel = '';
            let lastVal = '–';

            if (gameId === 'x01') {
                const avgs = hist.map(h => parseFloat(h.stats?.summary?.avg)).filter(v => !isNaN(v) && v > 0);
                if (avgs.length) { best = Math.max(...avgs).toFixed(1); bestLabel = 'Best AVG'; }
                const recAvgs = recent.map(h => parseFloat(h.stats?.summary?.avg)).filter(v => !isNaN(v) && v > 0);
                if (recAvgs.length) { avg4w = (recAvgs.reduce((a,v)=>a+v,0)/recAvgs.length).toFixed(1); avg4wLabel = 'Ø AVG 4W'; }
                lastVal = last.stats?.summary?.avg ? `AVG ${last.stats.summary.avg}` : '–';
            } else if (gameId === 'cricket') {
                const mprs = hist.map(h => parseFloat(h.stats?.summary?.mpr ?? 0)).filter(v => v > 0);
                if (mprs.length) { best = Math.max(...mprs).toFixed(2); bestLabel = 'Best MPR'; }
                const recMprs = recent.map(h => parseFloat(h.stats?.summary?.mpr ?? 0)).filter(v => v > 0);
                if (recMprs.length) { avg4w = (recMprs.reduce((a,v)=>a+v,0)/recMprs.length).toFixed(2); avg4wLabel = 'Ø MPR 4W'; }
                lastVal = last.stats?.summary?.mpr ? `MPR ${last.stats.summary.mpr}` : '–';
            } else if (gameId === 'bobs27') {
                const scores = hist.map(h => h.stats?.summary?.finalScore ?? null).filter(v => v !== null);
                if (scores.length) { best = Math.max(...scores); bestLabel = 'Best Score'; }
                const recS = recent.map(h => h.stats?.summary?.finalScore ?? null).filter(v => v !== null);
                if (recS.length) { avg4w = Math.round(recS.reduce((a,v)=>a+v,0)/recS.length); avg4wLabel = 'Ø Score 4W'; }
                lastVal = scores.length ? `${scores[scores.length-1]} Pts` : '–';
            } else if (gameId === 'scoring-drill') {
                const avgs = hist.map(h => parseFloat(h.stats?.summary?.avg ?? 0)).filter(v => v > 0);
                if (avgs.length) { best = Math.max(...avgs).toFixed(1); bestLabel = 'Best AVG'; }
                const recAvgs = recent.map(h => parseFloat(h.stats?.summary?.avg ?? 0)).filter(v => v > 0);
                if (recAvgs.length) { avg4w = (recAvgs.reduce((a,v)=>a+v,0)/recAvgs.length).toFixed(1); avg4wLabel = 'Ø AVG 4W'; }
                lastVal = last.stats?.summary?.avg ? `AVG ${last.stats.summary.avg}` : '–';
            } else if (gameId === 'checkout-challenge') {
                const rates = hist.map(h => parseFloat(h.stats?.summary?.checkoutRate ?? '0')).filter(v => !isNaN(v));
                if (rates.length) { best = Math.max(...rates).toFixed(0) + '%'; bestLabel = 'Best Rate'; }
                const recR = recent.map(h => parseFloat(h.stats?.summary?.checkoutRate ?? '0')).filter(v => !isNaN(v));
                if (recR.length) { avg4w = (recR.reduce((a,v)=>a+v,0)/recR.length).toFixed(0) + '%'; avg4wLabel = 'Ø Rate 4W'; }
                lastVal = last.stats?.summary?.checkoutRate ? last.stats.summary.checkoutRate : '–';
            } else if (gameId === 'halve-it') {
                const scores = hist.map(h => h.stats?.summary?.score ?? h.totalScore ?? 0).filter(v => v > 0);
                if (scores.length) { best = Math.max(...scores); bestLabel = 'Best Score'; }
                const recS = recent.map(h => h.stats?.summary?.score ?? h.totalScore ?? 0).filter(v => v > 0);
                if (recS.length) { avg4w = Math.round(recS.reduce((a,v)=>a+v,0)/recS.length); avg4wLabel = 'Ø Score 4W'; }
                lastVal = scores.length ? `${scores[scores.length-1]} Pts` : '–';
            } else if (gameId === 'around-the-board') {
                const dts = hist.map(h => h.stats?.summary?.totalDarts ?? null).filter(v => v !== null && v > 0);
                if (dts.length) { best = Math.min(...dts); bestLabel = 'Best Darts'; }
                const recD = recent.map(h => h.stats?.summary?.totalDarts ?? null).filter(v => v !== null && v > 0);
                if (recD.length) { avg4w = Math.round(recD.reduce((a,v)=>a+v,0)/recD.length); avg4wLabel = 'Ø Darts 4W'; }
                lastVal = dts.length ? `${dts[dts.length-1]} Darts` : '–';
            } else if (gameId === 'shanghai') {
                const scores = hist.map(h => h.stats?.summary?.score ?? h.totalScore ?? 0).filter(v => v > 0);
                if (scores.length) { best = Math.max(...scores); bestLabel = 'Best Score'; }
                const recS = recent.map(h => h.stats?.summary?.score ?? h.totalScore ?? 0).filter(v => v > 0);
                if (recS.length) { avg4w = Math.round(recS.reduce((a,v)=>a+v,0)/recS.length); avg4wLabel = 'Ø Score 4W'; }
                lastVal = scores.length ? `${scores[scores.length-1]} Pts` : '–';
            } else if (gameId === 'segment-master') {
                const rates = hist.map(h => parseFloat(h.stats?.summary?.hitRate ?? '0')).filter(v => !isNaN(v) && v > 0);
                if (rates.length) { best = Math.max(...rates).toFixed(1) + '%'; bestLabel = 'Best Hit'; }
                const recR = recent.map(h => parseFloat(h.stats?.summary?.hitRate ?? '0')).filter(v => !isNaN(v) && v > 0);
                if (recR.length) { avg4w = (recR.reduce((a,v)=>a+v,0)/recR.length).toFixed(1) + '%'; avg4wLabel = 'Ø Hit 4W'; }
                lastVal = last.stats?.summary?.hitRate ? last.stats.summary.hitRate : '–';
            } else if (gameId === 'single-training') {
                const rates = hist.map(h => parseFloat(h.stats?.summary?.hitRate ?? '0')).filter(v => !isNaN(v) && v > 0);
                if (rates.length) { best = Math.max(...rates).toFixed(1) + '%'; bestLabel = 'Best Quote'; }
                const recR = recent.map(h => parseFloat(h.stats?.summary?.hitRate ?? '0')).filter(v => !isNaN(v) && v > 0);
                if (recR.length) { avg4w = (recR.reduce((a,v)=>a+v,0)/recR.length).toFixed(1) + '%'; avg4wLabel = 'Ø Quote 4W'; }
                lastVal = last.stats?.summary?.hitRate ? last.stats.summary.hitRate : '–';
            } else if (gameId === 'killer') {
                const kills = hist.map(h => h.stats?.summary?.kills ?? 0);
                if (kills.length) { best = Math.max(...kills); bestLabel = 'Most Kills'; }
                lastVal = kills.length ? `${kills[kills.length-1]} Kills` : '–';
            }

            return { last: `${lastDate} · ${lastVal}`, best, bestLabel, avg4w, avg4wLabel, games: hist.length };
        };

        // ── Spieler-Tabelle ───────────────────────────────────────────────
        const humanPlayers = lineup.map(id => allPlayers.find(p => p.id === id)).filter(Boolean);
        const statsPerPlayer = humanPlayers.map(p => ({ player: p, stats: _playerStats(p) }));

        const hasAny4w   = statsPerPlayer.some(sp => sp.stats.avg4w !== null);
        const hasBest    = statsPerPlayer.some(sp => sp.stats.best !== null);
        const colCount   = 1 + (hasBest ? 1 : 0) + (hasAny4w ? 1 : 0) + 1; // Name + Best + 4W + Letzte

        const tableHeader = `
            <tr class="pgm-th-row">
                <th class="pgm-th pgm-th-name"></th>
                ${hasBest  ? `<th class="pgm-th">🏆 Best</th>` : ''}
                ${hasAny4w ? `<th class="pgm-th">📊 Ø 4 Wochen</th>` : ''}
                <th class="pgm-th">Letztes Spiel</th>
            </tr>`;

        const tableRows = statsPerPlayer.map(({ player, stats }) => `
            <tr class="pgm-td-row">
                <td class="pgm-td pgm-td-name">${player.isBot ? '🤖' : '👤'} ${player.name}</td>
                ${hasBest  ? `<td class="pgm-td pgm-td-val ${stats.best ? 'pgm-gold' : ''}">${stats.best ?? '–'}</td>` : ''}
                ${hasAny4w ? `<td class="pgm-td pgm-td-val">${stats.avg4w ?? '–'}</td>` : ''}
                <td class="pgm-td pgm-td-last">${stats.last}</td>
            </tr>`).join('');

        const tableHtml = humanPlayers.length > 0 ? `
            <div class="pgm-table-wrap">
                <table class="pgm-table">
                    <thead>${tableHeader}</thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>` : '';

        // ── Regeln ────────────────────────────────────────────────────────
        const optLines = this._summarizeSettings(gameId, settings);
        const rulesHtml = optLines.length ? `
            <div class="pgm-rules">
                <span class="pgm-rules-title">📋 Regeln</span>
                ${optLines.map(l => `<span class="pgm-rule">${l}</span>`).join('')}
            </div>` : '';

        // ── Modal DOM bauen ───────────────────────────────────────────────
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay pregame-overlay';
        overlay.innerHTML = `
            <div class="modal-content pregame-content">
                <div class="pgm-header">
                    <div class="pgm-header-accent"></div>
                    <div class="pgm-header-inner">
                        <span class="pgm-header-icon">${gameIcon}</span>
                        <div>
                            <div class="pgm-header-title">BEREIT FÜR DAS MATCH?</div>
                            <div class="pgm-header-game">${gameLabel}</div>
                        </div>
                    </div>
                </div>
                <div class="pgm-body">
                    ${tableHtml}
                    ${rulesHtml}
                </div>
                <div class="pgm-footer">
                    <button class="modal-btn btn-no pgm-btn-back">← Zurück</button>
                    <button class="modal-btn btn-yes pgm-btn-start">GAME ON! 🚀</button>
                </div>
            </div>`;

        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('active'), 10);

        const close = () => {
            overlay.classList.remove('active');
            setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
        };

        overlay.querySelector('.pgm-btn-back').onclick  = close;
        overlay.querySelector('.pgm-btn-start').onclick = () => { close(); onStart(); };
    },

    _summarizeSettings: function(gameId, s) {
        const lines = [];
        if (!s) return lines;
        if (gameId === 'x01') {
            if (s.startScore) lines.push(`${s.startScore} Punkte`);
            lines.push(s.doubleOut ? 'Double Out' : 'Single Out');
            if (s.bestOf > 1) lines.push(`Best of ${s.bestOf}`);
        } else if (gameId === 'cricket') {
            lines.push(s.mode === 'mark21' ? 'Mark 21' : 'Standard Cricket');
            if (s.spRounds) lines.push(`${s.spRounds} Runden Limit`);
        } else if (gameId === 'around-the-board') {
            const v = { full:'Alle Felder', double:'Nur Doubles', triple:'Nur Triples', 'single-inner':'Inner Singles', 'single-outer':'Outer Singles' };
            if (s.variant) lines.push(v[s.variant] || s.variant);
        } else if (gameId === 'checkout-challenge') {
            const d = { easy:'Easy', standard:'Standard', hard:'Hard' };
            if (s.difficulty) lines.push(d[s.difficulty] || s.difficulty);
            if (s.rounds) lines.push(`${s.rounds} Checkouts`);
            lines.push(s.doubleOut ? 'Double Out' : 'Single Out');
        } else if (gameId === 'halve-it') {
            const m = { short:'Short (8)', standard:'Standard (13)', long:'Long (22)' };
            if (s.mode) lines.push(m[s.mode] || s.mode);
        } else if (gameId === 'scoring-drill') {
            if (s.dartLimit) lines.push(`${s.dartLimit} Darts`);
        } else if (gameId === 'segment-master') {
            const seg = s.segment === 25 ? 'Bull' : `${s.segment}`;
            const z   = { any:'Alle', single:'Single', double:'Double', triple:'Triple' };
            lines.push(`Segment ${seg} · ${z[s.zone] || s.zone}`);
            if (s.turnLimit) lines.push(`${s.turnLimit} Aufnahmen`);
        } else if (gameId === 'killer') {
            lines.push(`${s.lives ?? 3} Leben`);
            const z = { any:'Any', single:'Single', double:'Double', triple:'Triple' };
            if (s.zone) lines.push(z[s.zone] || s.zone);
            if (s.shield) lines.push('🛡️ Shield aktiv');
        } else if (gameId === 'shanghai') {
            lines.push(s.mode === 'full' ? '20 Runden' : '7 Runden');
        }
        return lines;
    },
	
	// --- NEU: Temporärer Speicher für den modifizierten Plan ---
    tempPlan: null,

    showPlanPreview: function(originalPlan, preSelectedPlayerId) {
        this.tempPlan = JSON.parse(JSON.stringify(originalPlan));
        const plan = this.tempPlan;

        const allPlayers = State.getAvailablePlayers();
        let playerName = 'Gast';
        if (preSelectedPlayerId) {
            const found = allPlayers.find(p => p.id === preSelectedPlayerId);
            if (found) playerName = found.name;
        }

        // Bot-Status aus Management-Settings
        let botSettings = null;
        try { botSettings = Management.getSettings()?.bot; } catch(e) {}
        const botInPlans = botSettings?.inTrainingPlans ?? false;
        const botPlayer  = allPlayers.find(p => p.isBot);
        const BOT_GAMES  = ['x01','cricket','killer','shanghai','checkout-challenge'];
        const planHasBotGame = plan.blocks.some(b => BOT_GAMES.includes(b.gameId));

        const botInfoHtml = (botInPlans && botPlayer && planHasBotGame)
            ? `<div style="margin-top:10px;padding:8px 12px;background:#1a1030;border:1px solid #8b5cf6;border-radius:8px;font-size:0.82rem;color:#a78bfa;display:flex;align-items:center;gap:8px;">
                   <span>🤖</span>
                   <span>Bot spielt in Match-Spielen mit &middot; ${botPlayer.botDifficulty ?? 60}er Average</span>
               </div>`
            : '';

        const title = `PLAN: ${plan.label.toUpperCase()}`;
        const body = `
            <div style="text-align:left; color:#ccc; font-size:0.95rem;">
                <div style="margin-bottom:20px; padding-bottom:15px; border-bottom:1px solid #333;">
                    <span style="font-size:1.1rem; color:var(--text-main);">Hi <strong>${playerName}</strong>, bereit für dein Training?</span>
                </div>
                <p style="margin-bottom:15px; font-style:italic; color:#888;">${plan.description}</p>
                <div id="plan-blocks-container" style="background:#222; padding:10px; border-radius:8px; max-height:350px; overflow-y:auto;">
                    ${this._renderPlanBlocks(plan)}
                </div>
                <p style="margin-top:10px; font-size:0.8rem; color:#666;">Dauer: ca. ${plan.duration}</p>
                ${botInfoHtml}
            </div>
        `;

        if (typeof UI.showConfirm === 'function') {
            UI.showConfirm(
                title,
                body,
                () => {
                    let playersToUse = [];
                    if (preSelectedPlayerId) {
                        playersToUse = [preSelectedPlayerId];
                    } else if (setupLineup && setupLineup.length > 0) {
                        playersToUse = setupLineup.filter(id => {
                            const p = allPlayers.find(x => x.id === id);
                            return p && !p.isBot;
                        });
                    }
                    if (playersToUse.length === 0) {
                        const first = allPlayers.find(p => !p.isBot);
                        if (first) playersToUse.push(first.id);
                    }
                    if (playersToUse.length === 0) { alert('Kein Spieler gefunden.'); return; }

                    // Bot für Match-Spiele anfügen wenn aktiviert
                    if (botInPlans && botPlayer && planHasBotGame) {
                        playersToUse.push(botPlayer.id);
                    }

                    TrainingManager.startPlan(this.tempPlan, playersToUse);
                },
                { confirmLabel: 'STARTEN ▶', confirmClass: 'btn-yes', cancelLabel: 'ZURÜCK', cancelClass: 'btn-no' }
            );
        }
    },

    // --- HELPER: Rendert die Liste der Blöcke inkl. Optionen ---
    _renderPlanBlocks: function(plan) {
        let html = '';
        plan.blocks.forEach((block, index) => {
            let gameName = block.gameId;
            const map = {
                'scoring-drill':      '📈 Scoring Drill',
                'halve-it':           '✂️ Halve It',
                'checkout-challenge': '🎯 Checkout Challenge',
                'around-the-board':   '🔄 Around The Board',
                'bobs27':             '🔴 Bobs 27',
                'x01':                '🎯 X01',
                'cricket':            '🏏 Cricket',
                'single-training':    '🎓 Single Training',
                'shanghai':           '🀄 Shanghai',
                'segment-master':     '🎯 Segment Master',
                'killer':             '🔪 Killer',
            };
            if(map[block.gameId]) gameName = map[block.gameId];

            html += `
                <div style="margin-bottom:12px; border-bottom:1px solid #333; padding-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:bold; color:#eee;">${index + 1}. ${gameName}</span>
                    </div>
                    ${this._renderBlockOptions(block, index)}
                </div>
            `;
        });
        return html;
    },

    // --- HELPER: Rendert die Chips für spezifische Spiele ---
    _renderBlockOptions: function(block, index) {
        const s = block.settings || {};
        let optsHtml = '';

        // Helper für Chip-Generierung
        // type: 'val' (Wert direkt setzen) oder 'bool' (true/false)
        const renderChips = (key, options, type = 'val') => {
            let btns = '';
            options.forEach(opt => {
                // Prüfen, ob dieser Wert gerade aktiv ist
                let isActive = false;
                if (type === 'val') isActive = (s[key] === opt.val);
                if (type === 'bool') isActive = (s[key] === opt.val);

                // Onclick Handler string bauen
                // Wir rufen Setup.setPlanOption(blockIndex, key, value, type) auf
                const valStr = (typeof opt.val === 'string') ? `'${opt.val}'` : opt.val;
                
                btns += `<button class="plan-opt-chip ${isActive ? 'active' : ''}" 
                    onclick="Setup.setPlanOption(${index}, '${key}', ${valStr}, '${type}')">
                    ${opt.label}
                </button>`;
            });
            return `<div class="plan-opt-row">${btns}</div>`;
        };

        // WEICHE FÜR SPIELE
        if (block.gameId === 'scoring-drill') {
            optsHtml = renderChips('dartLimit', [
                { val: 33, label: 'Sprint (33)' },
                { val: 66, label: 'Medium (66)' },
                { val: 99, label: 'Classic (99)' }
            ]);
        }
        else if (block.gameId === 'around-the-board') {
            optsHtml = renderChips('variant', [
                { val: 'full', label: 'Gesamt' },
                { val: 'single-inner', label: 'Inner Single' },
                { val: 'single-outer', label: 'Outer Single' }
            ]);
        }
        else if (block.gameId === 'checkout-challenge') {
            optsHtml = renderChips('difficulty', [
                { val: 'easy', label: 'Easy' },
                { val: 'standard', label: 'Normal' },
                { val: 'hard', label: 'Hard' }
            ]);
            optsHtml += renderChips('turnsPerTarget', [
                { val: 1, label: '1 Aufn.' },
                { val: 2, label: '2 Aufn.' },
                { val: 3, label: '3 Aufn.' }
            ]);
        }
        else if (block.gameId === 'x01') {
            optsHtml = renderChips('bestOf', [
                { val: 5,  label: '5 Runden' },
                { val: 10, label: '10 Runden' },
            ]);
            optsHtml += renderChips('doubleOut', [
                { val: true,  label: 'Double Out' },
                { val: false, label: 'Single Out' }
            ], 'bool');
        }
        else if (block.gameId === 'cricket') {
            optsHtml = renderChips('mode', [
                { val: 'mark21', label: 'Mark 21' },
                { val: 'standard', label: 'Standard' }
            ]);
        }
        else if (block.gameId === 'halve-it') {
            optsHtml = renderChips('mode', [
                { val: 'standard', label: 'Standard' },
                { val: 'long', label: 'Long' }
            ]);
        }
        else if (block.gameId === 'segment-master') {
            optsHtml = renderChips('zone', [
                { val: 'double', label: 'Double' },
                { val: 'triple', label: 'Triple' },
            ]);
            optsHtml += renderChips('turnLimit', [
                { val: 10, label: '10 Aufn.' },
                { val: 15, label: '15 Aufn.' },
            ]);
        }
        else if (block.gameId === 'killer') {
            optsHtml = renderChips('lives', [
                { val: 3, label: '3 Leben' },
                { val: 5, label: '5 Leben' },
                { val: 7, label: '7 Leben' },
            ]);
        }
        // Bob's 27 und single-training haben keine Optionen

        return optsHtml;
    },

    // --- ACTION: Wird aufgerufen, wenn man auf einen Chip klickt ---
    setPlanOption: function(blockIndex, key, value, type) {
        if (!this.tempPlan) return;

        // Wert im temporären Plan aktualisieren
        if (!this.tempPlan.blocks[blockIndex].settings) {
            this.tempPlan.blocks[blockIndex].settings = {};
        }
        this.tempPlan.blocks[blockIndex].settings[key] = value;

        // UI Aktualisieren (Re-Render des Containers)
        const container = document.getElementById('plan-blocks-container');
        if (container) {
            container.innerHTML = this._renderPlanBlocks(this.tempPlan);
        }
    },

    shuffle: _shuffleLineup,
    
    getCurrentGameType: () => selectedGameType,
    
    getCurrentSettings: () => {
        if (selectedGameType === 'x01') return x01Settings;
        if (selectedGameType === 'cricket') return cricketSettings;
        if (selectedGameType === 'shanghai') return shanghaiSettings;
        if (selectedGameType === 'single-training') return singleTrainingSettings;
		if (selectedGameType === 'around-the-board') return atbSettings;
		if (selectedGameType === 'checkout-challenge') return checkoutSettings;
		if (selectedGameType === 'halve-it') return halveItSettings;
		if (selectedGameType === 'scoring-drill') return scoringSettings;
		if (selectedGameType === 'segment-master') return segmentMasterSettings;
		if (selectedGameType === 'killer') return killerSettings;
        return {};
    },
    
    loadNextTrainingBlock: function() { console.warn("Training disabled"); },
    isTrainingActive: () => false
};

window.Setup = Setup;