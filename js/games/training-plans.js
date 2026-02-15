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
                settings: { difficulty: 'standard', rounds: 10, doubleOut: true }
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
                settings: { mode: 'standard', spRounds: 20 }
            },
            {
                gameId: 'x01',
                settings: { startScore: 501, mode: 'sets', bestOf: 3 }
            }
        ]
    }
];

export const TrainingPlanService = {
    getAllPlans() {
        return TRAINING_PLANS;
    },

    getPlanById(id) {
        return TRAINING_PLANS.find(p => p.id === id);
    }
};