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
let checkoutSettings = { difficulty: 'standard', rounds: 10, doubleOut: true };
let halveItSettings = { mode: 'standard', direction: 'descending', useSpecials: true };
let scoringSettings = { dartLimit: 99 };

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
        startBtn.innerHTML = "GAME ON 🚀"; 
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
    
    const btnStd = document.createElement('button');
    btnStd.className = 'opt-btn-big ' + (cricketSettings.mode === 'standard' ? 'active' : '');
    btnStd.innerText = 'Standard';
    btnStd.onclick = () => { 
        cricketSettings.mode = 'standard'; 
        _renderSetupOptions(); 
    };
    rowMode.appendChild(btnStd);

    const btnCut = document.createElement('button');
    btnCut.className = 'opt-btn-big';
    btnCut.innerText = 'Cut Throat';
    btnCut.disabled = true;
    btnCut.style.opacity = '0.5';
    btnCut.title = 'Kommt in Version 2.1';
    rowMode.appendChild(btnCut);

    grpMode.appendChild(rowMode);
    container.appendChild(grpMode);

    const grpRounds = document.createElement('div'); 
    grpRounds.className = 'opt-group-big';
    grpRounds.innerHTML = '<span class="opt-label-big">Rundenlimit (1 Player)</span>';
    
    const rowRounds = document.createElement('div'); 
    rowRounds.className = 'opt-row-big';
    
    const roundOptions = [
        { val: 0, label: '∞ Kein Limit' }, 
        { val: 10, label: '⚡ 10 (Turbo)' },
        { val: 20, label: 'Standard (20)' },
    ];

    roundOptions.forEach(opt => {
        const b = document.createElement('button');
        const current = cricketSettings.spRounds !== undefined ? cricketSettings.spRounds : 20;
        
        b.className = 'opt-btn-big ' + (current === opt.val ? 'active' : '');
        b.innerText = opt.label;
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
    const grpScore = document.createElement('div'); grpScore.className = 'opt-group-big';
    grpScore.innerHTML = '<span class="opt-label-big">Start Punkte</span>';
    const rowScore = document.createElement('div'); rowScore.className = 'opt-row-big';
    
    [301, 501, 701].forEach(val => {
        const b = document.createElement('button');
        b.className = 'opt-btn-big ' + (x01Settings.startScore === val ? 'active' : '');
        b.innerText = val;
        b.onclick = () => { 
            x01Settings.startScore = val; 
            _saveSettings(); 
            _renderSetupOptions(); 
        };
        rowScore.appendChild(b);
    });
    grpScore.appendChild(rowScore);
    container.appendChild(grpScore);

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
            item.innerHTML = `
                <div style="display:flex; align-items:center;">
                    <span class="rank-badge">${index + 1}</span>
                    <span>${p.name}</span>
                </div>
                <span class="action-icon icon-remove">✕</span>
            `;
            item.onclick = () => {
                setupLineup.splice(index, 1);
                _renderSetupLists();
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
        item.innerHTML = `
            <span>${p.name}</span>
            <span class="action-icon icon-add">+</span>
        `;
        item.onclick = () => {
            setupLineup.push(p.id);
            _renderSetupLists();
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
        
        if (useAutodarts) {
            console.log("📡 Starting with Autodarts enabled.");
            AutodartsService.enable((val) => GameEngine.onInput(val));
        } else {
            AutodartsService.disable();
        }
        
        let gameSettings = null;

        if (selectedGameType === 'x01') {
            gameSettings = x01Settings;
        }
        else if (selectedGameType === 'single-training') {
            gameSettings = singleTrainingSettings;
        }
        else if (selectedGameType === 'shanghai') {
            gameSettings = shanghaiSettings;
        }
        else if (selectedGameType === 'cricket') {
            gameSettings = cricketSettings;
        }
		else if (selectedGameType === 'around-the-board') {
            gameSettings = atbSettings;
        }
		else if (selectedGameType === 'checkout-challenge') {
            gameSettings = checkoutSettings;
        }
		else if (selectedGameType === 'halve-it') {
            gameSettings = halveItSettings;
        }
		else if (selectedGameType === 'scoring-drill') {
			gameSettings = scoringSettings;
		}
        else if (GameEngine.hasOptions(selectedGameType)) {
            if (typeof selectedGameOption !== 'undefined') {
                gameSettings = selectedGameOption;
            }
        }

        console.log(`🚀 Starting Game: ${selectedGameType}`);
        GameEngine.startGame(selectedGameType, setupLineup, gameSettings);
    },
	
	// --- NEU: Temporärer Speicher für den modifizierten Plan ---
    tempPlan: null,

    showPlanPreview: function(originalPlan, preSelectedPlayerId) {
        // 1. Tiefe Kopie des Plans erstellen, damit wir Settings ändern können,
        // ohne das Original (TRAINING_PLANS) dauerhaft zu verändern.
        this.tempPlan = JSON.parse(JSON.stringify(originalPlan));
        
        const plan = this.tempPlan; // Ab jetzt arbeiten wir mit der Kopie

        let playerName = "Gast";
        if (preSelectedPlayerId) {
            const allPlayers = State.getAvailablePlayers();
            const found = allPlayers.find(p => p.id === preSelectedPlayerId);
            if (found) playerName = found.name;
        }
        
        // Titel zusammenbauen
        const title = `PLAN: ${plan.label.toUpperCase()}`;
        
        // Begrüßung
        let body = `
            <div style="text-align:left; color:#ccc; font-size:0.95rem;">
                <div style="margin-bottom: 20px; padding-bottom:15px; border-bottom:1px solid #333;">
                    <span style="font-size:1.1rem; color:var(--text-main);">Hi <strong>${playerName}</strong>, bereit für dein Training?</span>
                </div>
                <p style="margin-bottom:15px; font-style:italic; color:#888;">${plan.description}</p>
                <div id="plan-blocks-container" style="background:#222; padding:10px; border-radius:8px; max-height: 350px; overflow-y: auto;">
                    ${this._renderPlanBlocks(plan)}
                </div>
                <p style="margin-top:10px; font-size:0.8rem; color:#666;">Dauer: ca. ${plan.duration}</p>
            </div>
        `;

        if (typeof UI.showConfirm === 'function') {
            UI.showConfirm(
                title, 
                body, 
                () => {
                    // START LOGIK (Nutzt jetzt this.tempPlan)
                    let playersToUse = [];

                    if (preSelectedPlayerId) {
                        playersToUse = [preSelectedPlayerId];
                    } else if (setupLineup && setupLineup.length > 0) {
                        playersToUse = [...setupLineup];
                    } else {
                        const all = State.getAvailablePlayers();
                        if(all.length > 0) playersToUse.push(all[0].id);
                    }

                    if (playersToUse.length === 0) {
                        alert("Kein Spieler gefunden.");
                        return;
                    }

                    // WICHTIG: Wir starten den modifizierten Plan!
                    TrainingManager.startPlan(this.tempPlan, playersToUse);
                },
                {
                    confirmLabel: "STARTEN ▶",
                    confirmClass: "btn-yes", 
                    cancelLabel: "ZURÜCK",
                    cancelClass: "btn-no" 
                }
            );
        } else {
            console.warn("UI.showConfirm nicht verfügbar");
        }
    },

    // --- HELPER: Rendert die Liste der Blöcke inkl. Optionen ---
    _renderPlanBlocks: function(plan) {
        let html = '';
        plan.blocks.forEach((block, index) => {
            let gameName = block.gameId;
            const map = {
                'scoring-drill': '📈 Scoring Drill',
                'halve-it': '✂️ Halve It',
                'checkout-challenge': '🎯 Checkout Challenge',
                'around-the-board': '🔄 Around The Board',
                'bobs27': '🔴 Bobs 27',
                'x01': '🎯 X01',
                'cricket': '🏏 Cricket',
                'single-training': '🎓 Single Training',
                'shanghai': '🀄 Shanghai'
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
        }
        else if (block.gameId === 'x01') {
            optsHtml = renderChips('doubleOut', [
                { val: true, label: 'Double Out' },
                { val: false, label: 'Single Out' }
            ], 'bool');
        }
        else if (block.gameId === 'halve-it') {
            optsHtml = renderChips('mode', [
                { val: 'standard', label: 'Standard' },
                { val: 'long', label: 'Long' }
            ]);
        }
        // Bob und Cricket haben keine Auswahl -> optsHtml bleibt leer

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
        return {};
    },
    
    loadNextTrainingBlock: function() { console.warn("Training disabled"); },
    isTrainingActive: () => false
};

window.Setup = Setup;