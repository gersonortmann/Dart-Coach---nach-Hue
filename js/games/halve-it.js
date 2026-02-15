/**
 * Halve It Strategy
 * "Split Score"
 */

export const HalveIt = {

    config: {
        hasOptions: true,
        description: "Das Risiko-Spiel. Triff das Ziel oder dein Punktestand wird halbiert! Start: 40 Punkte.",
        mode: 'pro',
        defaultProInput: true
    },

    // ── ZIELE DEFINIEREN ──
    generateTargets(options) {
        const opts = options || {};
        const mode = opts.mode || 'standard';
        const direction = opts.direction || 'descending'; // Standard: Absteigend (20 -> 1)
        
        let targets = [];

        // 1. Basis-Liste generieren
        if (mode === 'short') {
            // Short (6 Runden)
            targets = ['20', 'ANY_DOUBLE', '19', 'ANY_TRIPLE', 'BULL', 'ALL'];
        } 
        else if (mode === 'long') {
            // Long (21 Runden - Full Board 20 bis 1 + Bull + All)
            // Wir generieren 20..1
            targets = Array.from({length: 20}, (_, i) => String(20 - i)); 
            targets.push('BULL');
            // Bei Long (Marathon) fügen wir im Code auch 'ALL' an, falls gewünscht, 
            // oder lassen es wie im vorherigen Code. 
            // Dein vorheriger Code hatte bei Long KEIN 'ALL' explizit, aber im Marathon-Code
            // hatten wir "ALL" am Ende hinzugefügt. Wir bleiben konsistent:
            targets.push('ALL'); 
        } 
        else {
            // Standard (10 Runden)
            targets = ['20', '19', '18', 'ANY_DOUBLE', '17', '16', 'ANY_TRIPLE', '15', 'BULL', 'ALL'];
        }

        // 2. Sortierung anwenden
        
        // Wir nehmen "ALL" kurz raus, damit es nicht irgendwo in die Mitte gemischt wird
        const hasAll = targets.includes('ALL');
        let mainList = targets.filter(t => t !== 'ALL');

        if (direction === 'ascending') {
            // Aufsteigend: Einfach umdrehen
            mainList.reverse();
        } 
        else if (direction === 'random') {
            // Zufällig mischen (Fisher-Yates Shuffle)
            for (let i = mainList.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [mainList[i], mainList[j]] = [mainList[j], mainList[i]];
            }
        }
        // bei 'descending' passiert nichts, das ist die Standard-Reihenfolge der Arrays oben

        // "ALL" wieder anhängen
        if (hasAll) mainList.push('ALL');

        return mainList;
    },

    // ── SPIELER STARTWERTE ──
    initPlayer(player, options, targets) {
        player.score = 40;          
        player.halvedCount = 0;     
        player.perfectRounds = 0;   
        player.turns = [];
    },

    // ── WURF LOGIK ──
    handleInput(session, player, dart) {
        const roundIdx = player.turns.length;
        const targetId = session.targets[roundIdx];
        
        const isHit = this._checkHit(targetId, dart);
        
        // Speichern (mit Hit-Flag)
        session.tempDarts.push({ ...dart, isTargetHit: isHit });

        // A) Wurf 1 oder 2: RUHE (Kein Overlay)
        if (session.tempDarts.length < 3) {
            return { 
                action: 'CONTINUE', 
                overlay: null 
            };
        }

        // B) Aufnahme beendet (3 Darts): Abrechnung & Overlay
        const hits = session.tempDarts.filter(d => d.isTargetHit).length;
        const roundScore = session.tempDarts.reduce((sum, d) => sum + (d.isTargetHit ? d.points : 0), 0);
        
        let overlayText = "";
        let overlayType = "";

        if (hits > 0) {
            // ERFOLG
            player.score += roundScore;
            if (hits === 3) player.perfectRounds++;
            
            // Grün / Check (Punkte)
            overlayText = `+${roundScore}`;
            overlayType = 'hit'; // check = Grün/Positiv in Hue
        } else {
            // VERSAGEN
            player.score = Math.floor(player.score / 2);
            player.halvedCount++;
            
            // Rot / Bust (Halbiert)
            overlayText = "HALBIERT";
            overlayType = 'bust'; // bust = Rot/Negativ in Hue
        }

        this._saveTurn(player, session.tempDarts, roundIdx, roundScore, hits === 0);

        // Spielende?
        if (roundIdx + 1 >= session.targets.length) {
            player.finished = true;

            // MULTIPLAYER CHECK: Sind ALLE fertig?
            const allFinished = session.players.every(p => p.finished);

            if (allFinished) {
                return { 
                    action: 'WIN_MATCH', 
                    overlay: { text: overlayText, type: overlayType },
                    delay: 2000
                };
            } else {
                // Nur dieser Spieler ist fertig, andere müssen noch werfen
                return { 
                    action: 'NEXT_TURN', 
                    overlay: { text: overlayText, type: overlayType },
                    delay: 2000
                };
            }
        }

        return { 
            action: 'NEXT_TURN', 
            overlay: { text: overlayText, type: overlayType },
            delay: 2500
        };
    },

    // ── HELPER ──
    _checkHit(targetId, dart) {
        if (dart.isMiss) return false;

        switch (targetId) {
            case 'ANY_DOUBLE': return dart.multiplier === 2;
            case 'ANY_TRIPLE': return dart.multiplier === 3;
            case 'BULL':       return dart.base === 25; 
            case 'ALL':        return true; 
            default:           return dart.base === parseInt(targetId);
        }
    },

    _saveTurn(player, darts, roundIndex, scoreAdded, wasHalved) {
        player.turns.push({
            roundIndex: roundIndex,
            score: scoreAdded,
            wasHalved: wasHalved,
            totalScoreAfter: player.score,
            darts: [...darts]
        });
    },

    handleWinLogik(session, player, result) {
        return {
            messageTitle: "SPIEL BEENDET",
            messageBody: `${player.name} beendet mit ${player.score} Punkten.`,
            nextActionText: "STATISTIK"
        };
    },

    getResultData(session, player) {
        const chartValues = [40]; 
        player.turns.forEach(t => chartValues.push(t.totalScoreAfter));
        const chartLabels = ['Start', ...session.targets.map(this._formatTargetName)];

        const allThrows = player.turns.flatMap(t => t.darts || []);
        const heatmap = {};
        allThrows.forEach(d => {
            if (!d.isMiss && d.segment) {
                heatmap[d.segment] = (heatmap[d.segment] || 0) + 1;
            }
        });

        const totalDarts = allThrows.length;
        const validHits = allThrows.filter(d => d.isTargetHit).length;
        const hitRate = totalDarts > 0 ? Math.round((validHits / totalDarts) * 100) : 0;

        return {
            summary: {
                totalScore: player.score,
                avg: "-", // Halve It hat keinen klassischen Average
                checkoutRate: hitRate + "%", // Wir "missbrauchen" das Checkout Feld für die Hit-Rate (Quote)
                hitRate: hitRate + "%",
                halvings: player.halvedCount,
                perfectRounds: player.perfectRounds
            },
            heatmap: heatmap,
            chart: {
                labels: chartLabels,
                datasets: [{
                    label: 'Score Verlauf',
                    data: chartValues,
                    borderColor: '#f59e0b',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    fill: true,
                    stepped: true
                }]
            }
        };
    },

    _formatTargetName(t) {
        if (t === 'ANY_DOUBLE') return 'D';
        if (t === 'ANY_TRIPLE') return 'T';
        if (t === 'BULL') return 'B';
        if (t === 'ALL') return 'A';
        return t;
    }
};