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
        } else if (session.gameId === 'shanghai') {
            // Shanghai: Sieger ist der Shanghai-Werfer (falls vorhanden), sonst Punktebester
            if (session.shanghaiWinnerId) {
                winner = session.players.find(p => p.id === session.shanghaiWinnerId) || session.players[0];
                resultLine = winner.shanghaiWon ? '💎 Shanghai!' : winner.currentResidual + ' Pts';
            } else {
                const sorted = [...session.players].sort((a, b) => b.currentResidual - a.currentResidual);
                winner = sorted[0];
                resultLine = winner.currentResidual + ' Pts';
            }
        } else if (session.gameId === 'bobs27') {
            const sorted = [...session.players].sort((a, b) => {
                if (a.isEliminated !== b.isEliminated) return a.isEliminated ? 1 : -1;
                return b.currentResidual - a.currentResidual;
            });
            winner = sorted[0];
            resultLine = winner.currentResidual + ' Pts';
        } else if (session.gameId === 'checkout-challenge' || session.gameId === 'halve-it' || session.gameId === 'scoring-drill' || session.gameId === 'segment-master' || session.gameId === 'killer') {
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
            'scoring-drill': 'Scoring Drill', 'checkout-challenge': 'Checkout Challenge',
            'segment-master': 'Segment Master', 'killer': 'Killer'
        };
        const gameLabel = GAME_LABELS[session.gameId] || session.gameId;

        // ── 3. UNIFIED PLAYER STRIP (Winner Bar + Outcome + Tabs in einem) ──────
        const headerHtml = this._buildPlayerStrip(session, winner, isMultiplayer, gameLabel, resultLine);

        // ── 4. HTML ZUSAMMENBAUEN ─────────────────────────────────────────────
        container.innerHTML = `
            ${headerHtml}
            <div id="result-content-area" class="result-content-area"></div>
            <div style="height:40px;"></div>
        `;

        // ── 5. KLICK-HANDLER FÜR SPIELERKARTEN (nach innerHTML) ──────────────
        // Kein globaler DartApp-Bridge nötig – direkte Bindung nach DOM-Aufbau
        document.querySelectorAll('.rps-card[data-pid]').forEach(card => {
            card.onclick = () => this.renderPlayerDashboard(card.dataset.pid, session);
        });

        // ── 6. BUTTONS IN DIE STRIP EINFÜGEN ─────────────────────────────────
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
                    TrainingManager.saveBlockResult(session);
                    // Diagnostic-Plan: Radar-Chart anzeigen bevor Plan endet
                    if (TrainingManager.isDiagnosticPlan()) {
                        this._showDiagnosticChart(session);
                        return;
                    }
                    TrainingManager.finishPlan();
                };
            } else {
                btnRematch.innerHTML = 'NÄCHSTE ÜBUNG ▶';
                btnRematch.onclick = async () => {
                    if (!UI.isGuest()) await this._saveToHistory(session);
                    TrainingManager.saveBlockResult(session);
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

        // ── 8. INITIAL VIEW ───────────────────────────────────────────────────
        this.renderPlayerDashboard(winner.id, session);
        UI.showScreen('screen-result');
    },

    // ── DIAGNOSTIC RADAR-CHART ────────────────────────────────────────────────

    _showDiagnosticChart: function(lastSession) {
        const results = TrainingManager.getDiagnosticResults();

        // ── Normalisierung: Rohdaten → 0–100 ──────────────────────────────────
        const scores = this._normalizeDiagnostic(results);

        const axes = [
            { key: 'scoring',   label: 'Scoring',    emoji: '📈' },
            { key: 'doubles',   label: 'Doppel',     emoji: '🎯' },
            { key: 'checkout',  label: 'Checkout',   emoji: '✅' },
            { key: 'precision', label: 'Präzision',  emoji: '🔬' },
            { key: 'match',     label: 'Match',      emoji: '\u2694' },
        ];

        // ── Modal-Inhalt ───────────────────────────────────────────────────────
        const canvasId = 'diagnostic-radar-canvas';
        const rowsHtml = axes.map(a => {
            const val = scores[a.key] ?? 0;
            const bar = Math.round(val);
            const color = val >= 70 ? '#10b981' : val >= 40 ? '#f59e0b' : '#ef4444';
            return `
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                    <span style="width:80px; font-size:0.82rem; color:#aaa;">${a.emoji} ${a.label}</span>
                    <div style="flex:1; background:#333; border-radius:4px; height:8px; overflow:hidden;">
                        <div style="width:${bar}%; background:${color}; height:100%; border-radius:4px; transition:width 0.8s ease;"></div>
                    </div>
                    <span style="width:32px; text-align:right; font-size:0.82rem; font-weight:700; color:${color};">${bar}</span>
                </div>`;
        }).join('');

        const overallAvg = Math.round(axes.reduce((s, a) => s + (scores[a.key] ?? 0), 0) / axes.length);
        const overallColor = overallAvg >= 70 ? '#10b981' : overallAvg >= 40 ? '#f59e0b' : '#ef4444';
        const badge = `<span style="font-size:2rem; font-weight:800; color:${overallColor};">${overallAvg}</span><span style="font-size:0.8rem; color:#888; margin-left:4px;">/ 100</span>`;

        const body = `
            <div style="text-align:left; color:#ccc; font-size:0.9rem;">
                <div style="text-align:center; margin-bottom:20px;">
                    <canvas id="${canvasId}" width="260" height="260" style="max-width:260px;"></canvas>
                </div>
                <div style="margin-bottom:16px;">${rowsHtml}</div>
                <div style="text-align:center; padding:12px; background:#1a1a2e; border-radius:10px; border:1px solid #333;">
                    <div style="font-size:0.75rem; color:#888; margin-bottom:4px; letter-spacing:1px;">GESAMT-SCORE</div>
                    ${badge}
                </div>
            </div>
        `;

        if (typeof UI.showConfirm === 'function') {
            UI.showConfirm(
                '📊 DEIN STÄRKEN-PROFIL',
                body,
                () => TrainingManager.finishPlan(),
                { confirmLabel: 'ABSCHLIESSEN', confirmClass: 'btn-yes', cancelLabel: null }
            );
        }

        // Chart nach DOM-Einfügung zeichnen (kurze Verzögerung)
        setTimeout(() => this._drawRadarChart(canvasId, axes, scores), 80);
    },

    _drawRadarChart: function(canvasId, axes, scores) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx   = canvas.getContext('2d');
        const cx    = canvas.width  / 2;
        const cy    = canvas.height / 2;
        const R     = Math.min(cx, cy) - 30;
        const n     = axes.length;
        const toRad = (i) => (Math.PI * 2 * i / n) - Math.PI / 2;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // ── Hintergrund-Gitter ────────────────────────────────────────────────
        const levels = [20, 40, 60, 80, 100];
        levels.forEach(lvl => {
            ctx.beginPath();
            axes.forEach((_, i) => {
                const r = R * lvl / 100;
                const x = cx + r * Math.cos(toRad(i));
                const y = cy + r * Math.sin(toRad(i));
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.closePath();
            ctx.strokeStyle = '#333';
            ctx.lineWidth   = 1;
            ctx.stroke();
        });

        // ── Achsen ────────────────────────────────────────────────────────────
        axes.forEach((_, i) => {
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + R * Math.cos(toRad(i)), cy + R * Math.sin(toRad(i)));
            ctx.strokeStyle = '#444';
            ctx.lineWidth   = 1;
            ctx.stroke();
        });

        // ── Datenpunkte ───────────────────────────────────────────────────────
        ctx.beginPath();
        axes.forEach((a, i) => {
            const r = R * (scores[a.key] ?? 0) / 100;
            const x = cx + r * Math.cos(toRad(i));
            const y = cy + r * Math.sin(toRad(i));
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle   = 'rgba(245,158,11,0.25)';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth   = 2.5;
        ctx.fill();
        ctx.stroke();

        // ── Punkte ────────────────────────────────────────────────────────────
        axes.forEach((a, i) => {
            const r = R * (scores[a.key] ?? 0) / 100;
            const x = cx + r * Math.cos(toRad(i));
            const y = cy + r * Math.sin(toRad(i));
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b';
            ctx.fill();
        });

        // ── Achsen-Labels ─────────────────────────────────────────────────────
        ctx.font      = 'bold 11px sans-serif';
        ctx.fillStyle = '#ccc';
        ctx.textAlign = 'center';
        axes.forEach((a, i) => {
            const labelR = R + 20;
            const x = cx + labelR * Math.cos(toRad(i));
            const y = cy + labelR * Math.sin(toRad(i)) + 4;
            ctx.fillText(a.label, x, y);
        });
    },

    /** Normalisiert Rohergebnisse je Spiel auf 0–100. */
    // Public alias – auch von training-manager.js nutzbar
    normalizeDiagnostic: function(results) { return this._normalizeDiagnostic(results); },

    /**
     * Berechnet einen einzelnen Trend-Achsen-Score aus den Summary-Daten
     * eines abgeschlossenen Spiels. Gibt { axis, score } zurück oder null.
     */
    _calcTrendEntry: function(gameId, summary) {
        switch (gameId) {
            case 'x01': {
                const avg = parseFloat(summary.avg ?? 0);
                if (!avg) return null;
                return { axis: 'match', score: Math.min(100, Math.round((avg / 100) * 100)) };
            }
            case 'scoring-drill': {
                const avg = parseFloat(summary.avg ?? 0);
                if (!avg) return null;
                return { axis: 'scoring', score: Math.min(100, Math.round((avg / 100) * 100)) };
            }
            case 'bobs27': {
                const score = summary.finalScore ?? summary.score ?? 0;
                const clamped = Math.max(-27 * 15, Math.min(500, score));
                const shifted = clamped + 27 * 15;
                return { axis: 'doubles', score: Math.min(100, Math.round((shifted / (500 + 27 * 15)) * 100)) };
            }
            case 'checkout-challenge': {
                const rate = parseFloat(String(summary.checkoutRate ?? '0'));
                if (isNaN(rate)) return null;
                return { axis: 'checkout', score: Math.min(100, Math.round(rate)) };
            }
            case 'segment-master': {
                // Nur Double oder Triple Zone zählt für Präzision
                const zone = summary.zone ?? 'any';
                if (!['double','triple'].includes(zone)) return null;
                const rate = parseFloat(String(summary.hitRate ?? '0'));
                if (isNaN(rate)) return null;
                return { axis: 'precision', score: Math.min(100, Math.round(rate)) };
            }
            default: return null;
        }
    },

    // ── NORMALIZE DIAGNOSTIC ─────────────────────────────────────────────────
    _normalizeDiagnostic: function(results) {
        const out = {};

        // scoring – Scoring Drill: 3-Dart-Average, AVG 100 = Score 100
        if (results.scoring) {
            const s   = results.scoring.data?.summary ?? {};
            const avg = parseFloat(s.avg ?? 0);
            out.scoring = Math.min(100, Math.round((avg / 100) * 100));
        }

        // doubles – Bobs 27: Score kann negativ sein
        if (results.doubles) {
            const s     = results.doubles.data?.summary ?? {};
            const score = s.finalScore ?? s.totalScore ?? s.score ?? 0;
            // Normalisierung: 0 → 40, 100 → 65, 300 → 100 (log-artig)
            const clamped = Math.max(-27 * 15, Math.min(500, score));
            const shifted = clamped + 27 * 15;   // shift to always positive
            out.doubles = Math.min(100, Math.round((shifted / (500 + 27 * 15)) * 100));
        }

        // checkout – Checkout Challenge: Checkout-Quote (0–100%)
        if (results.checkout) {
            const s    = results.checkout.data?.summary ?? {};
            const rate = s.checkoutRate ?? s.hitRate ?? '0%';
            const pct  = parseFloat(String(rate));
            out.checkout = Math.min(100, Math.round(isNaN(pct) ? 0 : pct));
        }

        // precision – Segment Master Triple: Hit-Rate (0–100%)
        if (results.precision) {
            const s    = results.precision.data?.summary ?? {};
            const rate = s.hitRate ?? '0%';
            const pct  = parseFloat(String(rate));
            out.precision = Math.min(100, Math.round(isNaN(pct) ? 0 : pct));
        }

        // match – X01: 3-Darts-Average, AVG 100 = Score 100
        if (results.match) {
            const s   = results.match.data?.summary ?? {};
            const avg = parseFloat(s.avg ?? s.avg3 ?? s.average ?? 0);
            out.match = Math.min(100, Math.round((avg / 100) * 100));
        }

        return out;
    },

    // ── SAVE ──────────────────────────────────────────────────────────────────
    _saveToHistory: async function(session) {
        // ── Gewinner einmalig bestimmen (gleiche Logik wie in show()) ──────────
        const gid = session.gameId;
        let winner = session.players[0];
        if (gid === 'x01') {
            const isSets = session.settings?.mode === 'sets';
            winner = [...session.players].sort((a, b) =>
                isSets ? b.setsWon - a.setsWon : b.legsWon - a.legsWon)[0];
        } else if (gid === 'shanghai') {
            winner = session.shanghaiWinnerId
                ? (session.players.find(p => p.id === session.shanghaiWinnerId) || session.players[0])
                : [...session.players].sort((a, b) => b.currentResidual - a.currentResidual)[0];
        } else if (gid === 'bobs27') {
            // Gewinner = wer am weitesten kam (meiste Runden), bei Gleichstand höherer Score
            winner = [...session.players].sort((a, b) => {
                const aTurns = a.turns?.length ?? 0;
                const bTurns = b.turns?.length ?? 0;
                if (bTurns !== aTurns) return bTurns - aTurns;
                return b.currentResidual - a.currentResidual;
            })[0];
        } else if (['checkout-challenge','halve-it','scoring-drill','segment-master','killer'].includes(gid)) {
            winner = [...session.players].sort((a, b) => b.score - a.score)[0];
        } else {
            winner = [...session.players].sort((a, b) => b.currentResidual - a.currentResidual)[0];
        }

        // ── Score-Label je Spieltyp + Spieler ─────────────────────────────────
        const _scoreLabel = (p) => {
            if (gid === 'x01') {
                const isSets = session.settings?.mode === 'sets';
                return isSets ? `${p.setsWon ?? 0} Sets` : `${p.legsWon ?? 0} Legs`;
            }
            if (gid === 'shanghai')
                return p.shanghaiWon ? '💎 Shanghai!' : `${p.currentResidual ?? 0} Pts`;
            if (gid === 'cricket') {
                return session.settings?.mode === 'mark21'
                    ? `${p.currentResidual ?? 0} Darts`
                    : `${p.currentResidual ?? 0} Pts`;
            }
            if (gid === 'bobs27') return `${p.currentResidual ?? 0} Pts`;
            if (gid === 'killer')  return p.survived ? '🔪 Überlebt' : `${p.lives ?? 0} Leben`;
            if (['checkout-challenge','halve-it','scoring-drill','segment-master'].includes(gid))
                return `${p.score ?? 0} Pts`;
            return `${p.currentResidual ?? p.score ?? 0} Pts`;
        };

        const isMultiplayer = session.players.length > 1;

        const promises = session.players.map(async p => {
            const stats = GameEngine.getResultData(session, p);
            let totalScore = 0;
            if (stats?.summary) {
                totalScore = stats.summary.totalScore ?? stats.summary.score ?? stats.summary.finalScore ?? 0;
            }
            const opponents = session.players
                .filter(other => other.id !== p.id)
                .map(other => other.name);
            const settingsToSave = Object.assign({}, session.settings, { opponents });

            // ── Outcome-Felder ──────────────────────────────────────────────
            const isWinner = isMultiplayer && (p.id === winner.id);
            if (stats) {
                stats.isWinner   = isMultiplayer ? isWinner : null; // null = Solo/Training
                stats.scoreLabel = _scoreLabel(p);
                stats.isShanghaiWin = !!p.shanghaiWon;
            }

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

            // ── Trend-Eintrag für relevante Spiele ─────────────────────────
            if (!p.isBot && State.addTrendEntry) {
                const trendEntry = this._calcTrendEntry(session.gameId, stats?.summary ?? {});
                if (trendEntry) {
                    await State.addTrendEntry(p.id, {
                        date:   Date.now(),
                        axis:   trendEntry.axis,
                        score:  trendEntry.score,
                        gameId: session.gameId,
                    });
                }
            }
        });
        await Promise.all(promises);
    },

    handleRematch: function(oldSession) {
        const ids = oldSession.players.map(p => p.id);
        if (ids.length > 1) { const first = ids.shift(); ids.push(first); }
        GameEngine.startGame(oldSession.gameId, ids, oldSession.settings);
    },

    // ── ERGEBNIS-ÜBERSICHT ────────────────────────────────────────────────────
    // Zeigt für jeden Spieler: SIEG/NIEDERLAGE-Tag + individuellen Score.
    // Bei Solo/Training: kompakte Einzelzeile mit Score-Info.
    _buildOutcomeRow: function(session, winner, isMultiplayer) {
        const gid = session.gameId;

        // Hilfsfunktion: Score-Label je Spieltyp ermitteln
        const _scoreLabel = (p) => {
            if (gid === 'x01') {
                const isSets = session.settings?.mode === 'sets';
                return isSets ? `${p.setsWon ?? 0} Sets` : `${p.legsWon ?? 0} Legs`;
            }
            if (gid === 'shanghai') {
                if (p.shanghaiWon) return '💎 Shanghai!';
                return `${p.currentResidual ?? 0} Pts`;
            }
            if (gid === 'cricket') {
                const mode = session.settings?.mode;
                if (mode === 'mark21') return `${p.currentResidual ?? 0} Darts`;
                return `${p.currentResidual ?? 0} Pts`;
            }
            if (gid === 'bobs27') return `${p.currentResidual ?? 0} Pts`;
            if (gid === 'killer')  return p.survived ? '🔪 Überlebt' : `${p.lives ?? 0} Leben`;
            if (['checkout-challenge','halve-it','scoring-drill','segment-master'].includes(gid))
                return `${p.score ?? 0} Pts`;
            // Fallback (around-the-board, single-training etc.)
            return `${p.currentResidual ?? p.score ?? 0} Pts`;
        };

        if (!isMultiplayer) {
            // Solo: nur Score-Info, kein SIEG/NIEDERLAGE
            const p = session.players[0];
            return `
                <div style="display:flex;justify-content:center;padding:6px 0 2px;">
                    <span style="background:rgba(255,255,255,0.06);border:1px solid #333;border-radius:8px;
                                 padding:6px 18px;font-size:0.9rem;color:#aaa;">
                        ${_scoreLabel(p)}
                    </span>
                </div>`;
        }

        // Multiplayer: eine Zeile pro Spieler mit SIEG/NIEDERLAGE + Score
        const rows = session.players.map(p => {
            const isWinner = p.id === winner.id;
            const tag = isWinner
                ? `<span style="background:#16a34a;color:#fff;font-size:0.7rem;font-weight:800;
                               letter-spacing:.06em;padding:2px 8px;border-radius:4px;">SIEG</span>`
                : `<span style="background:#444;color:#aaa;font-size:0.7rem;font-weight:800;
                               letter-spacing:.06em;padding:2px 8px;border-radius:4px;">NIEDERLAGE</span>`;
            const nameStyle = isWinner ? 'color:#fff;font-weight:700;' : 'color:#aaa;font-weight:500;';
            const scoreStyle = isWinner ? 'color:var(--accent-color);font-weight:700;' : 'color:#666;';
            const botDot = p.isBot
                ? `<span style="font-size:0.7rem;color:#8b5cf6;margin-left:4px;">🤖</span>` : '';

            return `
                <div style="display:flex;align-items:center;gap:10px;padding:5px 0;
                            border-bottom:1px solid #1e1e1e;">
                    ${tag}
                    <span style="${nameStyle}flex:1;">${p.name}${botDot}</span>
                    <span style="${scoreStyle}font-size:0.95rem;">${_scoreLabel(p)}</span>
                </div>`;
        }).join('');

        return `
            <div style="background:#111;border:1px solid #2a2a2a;border-radius:10px;
                        padding:10px 16px;margin:8px 0 4px;">
                ${rows}
            </div>`;
    },

    // ── PLAYER STRIP (unified header: winner + all players + buttons) ─────────
    _buildPlayerStrip: function(session, winner, isMultiplayer, gameLabel, resultLine) {
        const gid = session.gameId;

        const _scoreLabel = (p) => {
            if (gid === 'x01') {
                const isSets = session.settings?.mode === 'sets';
                return isSets ? `${p.setsWon ?? 0} Sets` : `${p.legsWon ?? 0} Legs`;
            }
            if (gid === 'shanghai') return p.shanghaiWon ? '💎' : `${p.currentResidual ?? 0} Pts`;
            if (gid === 'cricket') return `${p.currentResidual ?? 0} Pts`;
            if (gid === 'bobs27')  return `${p.currentResidual ?? 0} Pts`;
            if (gid === 'killer')  return p.survived ? '🔪' : `${p.lives ?? 0} ❤️`;
            if (['checkout-challenge','halve-it','scoring-drill','segment-master'].includes(gid))
                return `${p.score ?? 0} Pts`;
            return `${p.currentResidual ?? p.score ?? 0} Pts`;
        };

        const sorted = isMultiplayer
            ? [winner, ...session.players.filter(p => p.id !== winner.id)]
            : session.players;

        const cardsHtml = sorted.map((p, idx) => {
            const isWinner = p.id === winner.id;

            const rankIcon = !isMultiplayer ? '' :
                idx === 0 ? '👑' :
                idx === 1 ? '🥈' :
                idx === 2 ? '🥉' :
                            String(idx + 1);

            const resultTag = isMultiplayer
                ? (isWinner
                    ? `<span class="rps-tag rps-tag-win">SIEG</span>`
                    : `<span class="rps-tag rps-tag-loss">NIEDERLAGE</span>`)
                : `<span class="rps-game-chip">${gameLabel}</span>`;

            return `
                <div class="rps-card ${isWinner && isMultiplayer ? 'rps-winner' : ''} ${isWinner ? 'active' : ''}"
                     data-pid="${p.id}">
                    <div class="rps-card-inner">
                        ${rankIcon ? `<div class="rps-rank-col">${rankIcon}</div>` : ''}
                        <div class="rps-info-col">
                            <div class="rps-card-top">
                                <span class="rps-name">${p.name}</span>
                                ${resultTag}
                            </div>
                            <div class="rps-score">${_scoreLabel(p)}</div>
                        </div>
                    </div>
                </div>`;
        }).join('');

        return `
            <div class="result-player-strip">
                <div class="rps-players">${cardsHtml}</div>
                <div class="rps-actions" id="result-actions-area"></div>
            </div>`;
    },

    // ── RENDER DISPATCHER ─────────────────────────────────────────────────────
    renderPlayerDashboard: function(playerId, session) {
        // Karten im Strip aktiv markieren (ersetzt die alten .result-tab-btn)
        document.querySelectorAll('.rps-card').forEach(c => {
            c.classList.toggle('active', c.dataset.pid === playerId);
        });
        // Legacy: alte Tabs (falls noch irgendwo vorhanden)
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
            'segment-master':     '_renderSegmentMasterDashboard',
            'killer':             '_renderKillerDashboard',
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

        // Leg-Breakdown Tabelle (alle Spieler nebeneinander)
        const legBreakdownHtml = (() => {
            const allPlayers = session.players;
            // Alle legIndices sammeln
            const legCount = Math.max(...allPlayers.map(p =>
                Math.max(...p.turns.map(t => (t.legIndex ?? 0) + 1), 1)
            ));
            if (legCount <= 1 && allPlayers.length === 1) return ''; // Solo + 1 Leg → kein Extra-Tisch

            const _legStat = (p, li) => {
                const lt  = p.turns.filter(t => (t.legIndex ?? 0) === li);
                const dts = lt.flatMap(t => t.darts || []);
                const pts = lt.reduce((a, t) => a + (t.bust ? 0 : (t.score || 0)), 0);
                const avg = dts.length > 0 ? ((pts / dts.length) * 3).toFixed(1) : '-';
                const f9d = dts.slice(0, 9);
                const f9  = f9d.length > 0 ? ((f9d.reduce((a, d) => a + (d.points || 0), 0) / f9d.length) * 3).toFixed(1) : '-';
                const won = lt.some(t => t.isLegFinish);
                return { avg, f9, darts: dts.length, won };
            };

            const colorFor = (val, all) => {
                const nums = all.map(v => parseFloat(v)).filter(v => !isNaN(v));
                if (nums.length < 2) return 'var(--text-main)';
                const v = parseFloat(val);
                if (isNaN(v)) return '#555';
                if (v === Math.max(...nums)) return '#10b981';
                if (v === Math.min(...nums)) return '#ef4444';
                return 'var(--text-main)';
            };

            const legHeaders = Array.from({ length: legCount }, (_, i) =>
                `<th class="lbt-leg">Leg ${i + 1}</th>`).join('');

            const rows = allPlayers.map(p => {
                const isActive = p.id === playerId;
                const stats = Array.from({ length: legCount }, (_, i) => _legStat(p, i));
                const avgs  = stats.map(s => s.avg);
                const cells = stats.map((s, i) => {
                    const color = colorFor(s.avg, avgs);
                    const wonBadge = s.won ? ' 🏆' : '';
                    return `<td class="lbt-cell">
                        <span style="color:${color};font-weight:700;">${s.avg}${wonBadge}</span>
                        <span class="lbt-f9">f9: ${s.f9}</span>
                        <span class="lbt-darts">${s.darts} darts</span>
                    </td>`;
                }).join('');
                return `<tr class="${isActive ? 'lbt-active' : ''}">
                    <td class="lbt-name">${p.name}${p.isBot ? ' 🤖' : ''}</td>
                    ${cells}
                </tr>`;
            }).join('');

            return `
                <div class="res-chart-card" style="margin-top:12px;">
                    <div class="res-section-title">LEG-FÜR-LEG ANALYSE</div>
                    <div style="overflow-x:auto;">
                        <table class="leg-breakdown-table">
                            <thead><tr><th class="lbt-name"></th>${legHeaders}</tr></thead>
                            <tbody>${rows}</tbody>
                        </table>
                    </div>
                </div>`;
        })();

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent"><span class="hero-label">Average</span><span class="hero-val">${data.summary.avg}</span></div>
                <div class="hero-card"><span class="hero-label">First 9 Ø</span><span class="hero-val">${data.summary.first9}</span></div>
                <div class="hero-card"><span class="hero-label">Best Leg</span><span class="hero-val">${data.summary.bestLeg}</span></div>
                <div class="hero-card"><span class="hero-label">Checkout</span><span class="hero-val">${data.summary.checkout}</span></div>
            </div>
            ${legBreakdownHtml}
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

    // ── SEGMENT MASTER ────────────────────────────────────────────────────────
    _renderSegmentMasterDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data   = GameEngine.getResultData(session, player);
        const s      = data.summary;
        const zonePrefix = { double:'D', triple:'T' }[s.zone ?? 'any'] ?? '';
        const segLabel = zonePrefix + (s.target === 25 ? 'Bull' : String(s.target));
        const totalHits = (s.hits.single || 0) + (s.hits.double || 0) + (s.hits.triple || 0);

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card accent"><span class="hero-label">Score</span><span class="hero-val">${s.score}</span></div>
                <div class="hero-card"><span class="hero-label">Hit-Rate</span><span class="hero-val">${s.hitRate}</span></div>
                <div class="hero-card"><span class="hero-label">Segment</span><span class="hero-val">${segLabel}</span></div>
                <div class="hero-card"><span class="hero-label">Darts</span><span class="hero-val">${s.dartLimit}</span></div>
            </div>
            <div class="res-two-col">
                <div class="res-chart-card">
                    <div class="res-section-title">SCORE VERLAUF</div>
                    <canvas id="segmentMasterChart"></canvas>
                </div>
                <div class="res-side-card">
                    <div class="res-section-title">TREFFER-VERTEILUNG</div>
                    <div class="res-power-list">
                        <div class="res-power-row gold"><span>Triple (3 Pkt)</span><strong>${s.hits.triple}</strong></div>
                        <div class="res-power-row"><span>Double (2 Pkt)</span><strong>${s.hits.double}</strong></div>
                        <div class="res-power-row"><span>Single (1 Pkt)</span><strong>${s.hits.single}</strong></div>
                        <div class="res-power-row" style="opacity:0.5"><span>Miss (0 Pkt)</span><strong>${s.dartLimit - totalHits}</strong></div>
                    </div>
                </div>
            </div>
        `;
        setTimeout(() => {
            const ctx = document.getElementById('segmentMasterChart');
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

    // ── KILLER ────────────────────────────────────────────────────────────────
    _renderKillerDashboard: function(container, playerId, session) {
        const player = session.players.find(p => p.id === playerId);
        const data   = GameEngine.getResultData(session, player);
        const s      = data.summary;
        const dtk    = s.dartsToKiller > 0 ? s.dartsToKiller : '–';
        const segLabel = data.killerNumber === 25 ? 'Bull' : `D${data.killerNumber}`;

        // Standings-Tabelle
        const rows = data.allPlayers.map(p => {
            const statusIcon  = p.survived ? '👑' : (p.isKiller ? '🔪' : '💀');
            const killerLabel = p.killerNumber === 25 ? 'Bull' : `D${p.killerNumber}`;
            const dtkText     = p.dartsToKiller > 0 ? p.dartsToKiller : '–';
            return `
                <tr style="opacity:${p.survived ? 1 : 0.6}">
                    <td>${statusIcon} ${p.name}</td>
                    <td style="text-align:center">${killerLabel}</td>
                    <td style="text-align:center">${dtkText}</td>
                    <td style="text-align:center">${p.kills}</td>
                    <td style="text-align:center">${'\u2665'.repeat(Math.max(0, p.lives))}${'\u2022'.repeat(Math.max(0, (session.settings?.lives ?? 3) - p.lives))}</td>
                </tr>`;
        }).join('');

        container.innerHTML = `
            <div class="stats-hero-grid res-hero">
                <div class="hero-card ${s.survived ? 'accent' : ''}">
                    <span class="hero-label">Status</span>
                    <span class="hero-val">${s.survived ? '\uD83D\uDC51 SIEG' : '\u2620 OUT'}</span>
                </div>
                <div class="hero-card"><span class="hero-label">Meine Zahl</span><span class="hero-val">${segLabel}</span></div>
                <div class="hero-card"><span class="hero-label">Killer nach</span><span class="hero-val">${dtk} Darts</span></div>
                <div class="hero-card"><span class="hero-label">Kills</span><span class="hero-val">${s.kills}</span></div>
            </div>
            <div class="res-two-col">
                <div class="res-chart-card">
                    <div class="res-section-title">STANDINGS</div>
                    <table style="width:100%;font-size:0.9rem;color:#ccc;border-collapse:collapse">
                        <thead><tr style="color:#888;font-size:0.75rem">
                            <th style="text-align:left;padding:4px 0">Spieler</th>
                            <th>Zahl</th><th>Darts→K</th><th>Kills</th><th>Leben</th>
                        </tr></thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
                <div class="res-side-card">
                    <div class="res-section-title">HEATMAP</div>
                    <div class="heatmap-container res-heatmap" id="result-heatmap-box">${StatsBoard.generateSVG(200)}</div>
                </div>
            </div>
        `;
        setTimeout(() => { this.applyHeatmap(data.heatmap); }, 0);
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