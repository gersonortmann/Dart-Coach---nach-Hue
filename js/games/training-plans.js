/**
 * TRAINING PLANS
 * Definierte Abfolgen von Spielen für strukturierte Trainingseinheiten.
 */

export const TRAINING_PLANS = [
    {
        id: 'warmup-quick',
        label: 'Quick Warm-Up',
        duration: '~10 Min',
        description: 'Kurzes Aufwärmen: Erst Scoring, dann einmal um das Board.',
        blocks: [
            {
                gameId: 'scoring-drill',
                settings: { dartLimit: 33 } // 33 Aufnahmen
            },
            {
                gameId: 'around-the-board',
                settings: { direction: 'ascending', variant: 'single-outer' } // Nur große Singles
            }
        ]
    },
    {
        id: 'checkout-pro',
        label: 'Finishing School',
        duration: '~20 Min',
        description: 'Fokus auf Doppel und Checkouts. Nichts für schwache Nerven.',
        blocks: [
            {
                gameId: 'checkout-challenge',
                settings: { difficulty: 'standard', rounds: 10, doubleOut: true, turnsPerTarget: 1 }
            },
            {
                gameId: 'bobs27',
                settings: {} // Standard
            },
            {
                gameId: 'x01',
                settings: { startScore: 170, mode: 'legs', bestOf: 5, doubleIn: false, doubleOut: true } // 170er Rest üben
            }
        ]
    },
    {
        id: 'full-workout',
        label: 'The Grinder',
        duration: '~45 Min',
        description: 'Das komplette Programm: Scoring, Drucksituationen und Match-Praxis.',
        blocks: [
            {
                gameId: 'scoring-drill',
                settings: { dartLimit: 99 }
            },
            {
                gameId: 'halve-it',
                settings: { mode: 'standard' }
            },
            {
                gameId: 'cricket',
                settings: { mode: 'mark21', spRounds: 20 }
            },
            {
                gameId: 'x01',
                settings: { startScore: 501, mode: 'sets', bestOf: 3 }
            }
        ]
    },
    {
        id: 'double-trouble',
        label: 'Double Trouble',
        duration: '~25 Min',
        description: 'Alles dreht sich ums Doppel: Bob\'s 27, Checkout-Drills und ein finales 301er zum Kaltwerden.',
        blocks: [
            {
                gameId: 'bobs27',
                settings: {}
            },
            {
                gameId: 'segment-master',
                settings: { segment: 20, zone: 'double', turnLimit: 10 }
            },
            {
                gameId: 'checkout-challenge',
                settings: { difficulty: 'standard', rounds: 10, doubleOut: true, turnsPerTarget: 2 }
            },
            {
                gameId: 'x01',
                settings: { startScore: 301, mode: 'legs', bestOf: 3, doubleIn: false, doubleOut: true }
            }
        ]
    },
    {
        id: 'the-diagnostic',
        label: 'The Diagnostic',
        duration: '~30 Min',
        description: 'Ein vollständiger Querschnitt durch alle Fähigkeiten: Scoring, Doppel, Checkout, Präzision. Liefert dein persönliches Stärken-Profil.',
        diagnostic: true,   // Marker für Radar-Chart im Result-Screen
        blocks: [
            {
                // Scoring-Fähigkeit
                gameId: 'scoring-drill',
                settings: { dartLimit: 33 },
                diagnosticKey: 'scoring'
            },
            {
                // Doppel-Präzision
                gameId: 'bobs27',
                settings: {},
                diagnosticKey: 'doubles'
            },
            {
                // Checkout-Stärke
                gameId: 'checkout-challenge',
                settings: { difficulty: 'standard', rounds: 8, doubleOut: true, turnsPerTarget: 1 },
                diagnosticKey: 'checkout'
            },
            {
                // Segment-Präzision (Double + Triple Auswahl, Standard: Triple 20)
                gameId: 'segment-master',
                settings: { segment: 20, zone: 'triple', turnLimit: 10 },
                diagnosticKey: 'precision'
            },
            {
                // Matchfähigkeit – 301, 5 Runden, Double Out
                gameId: 'x01',
                settings: { startScore: 301, mode: 'legs', bestOf: 5, doubleIn: false, doubleOut: true },
                diagnosticKey: 'match'
            }
        ]
    },
];

export const TrainingPlanService = {
    getAllPlans() {
        return TRAINING_PLANS;
    },

    getPlanById(id) {
        return TRAINING_PLANS.find(p => p.id === id);
    }
};