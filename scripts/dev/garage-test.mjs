// Banc d'essai du carnet d'entretien (src/lib/garage.ts : échéances des rappels, totaux par an).
// Aucun accès réseau ni base.
// node --env-file=.env --import ./scripts/dev/register.mjs scripts/dev/garage-test.mjs
import assert from 'node:assert/strict';

const { planStatus, dueText, spentByYear, soonDays, PLAN_KINDS, RECORD_KINDS, kindInfo } = await import('../../src/lib/garage.ts');

const today = new Date('2026-10-22T12:00:00');
const plan = (p) => ({ id: 'x', motorcycleId: 'm', baseKm: null, baseOn: '2026-01-01', dueOn: null, everyKm: null, everyMonths: null, ...p });

// Vidange 6 000 km : 300 km restants → bientôt, « dans 300 km »
let s = planStatus(plan({ kind: 'oil', everyKm: 6000, baseKm: 10000, everyMonths: 12 }), 15700, today);
assert.equal(s.kmLeft, 300);
assert.equal(s.level, 'soon');
assert.match(dueText(s, 'oil'), /dans 300 km/);

// Dépassée en km
s = planStatus(plan({ kind: 'oil', everyKm: 6000, baseKm: 10000 }), 16100, today);
assert.equal(s.level, 'due');
assert.equal(dueText(s, 'oil'), 'À faire maintenant');

// Par date : 12 mois depuis le 1er janvier 2026 → ok le 22 octobre (71 j)
s = planStatus(plan({ kind: 'brake_fluid', everyMonths: 12 }), null, today);
assert.equal(s.level, 'ok');

// Assurance : échéance saisie dans 20 jours → bientôt (seuil 30 j), texte par date
s = planStatus(plan({ kind: 'insurance', everyMonths: 12, dueOn: '2026-11-11' }), null, today);
assert.equal(s.daysLeft, 20);
assert.equal(s.level, 'soon');
assert.match(dueText(s, 'insurance'), /^Échéance le 11 nov/);
assert.equal(soonDays('insurance'), 30);
assert.equal(soonDays('oil'), 15);

// Contrôle technique dépassé
s = planStatus(plan({ kind: 'inspection', everyMonths: 36, dueOn: '2026-10-01' }), null, today);
assert.equal(s.level, 'due');
assert.equal(dueText(s, 'inspection'), 'Échéance dépassée');

// Totaux par an (coûts vides ignorés)
assert.deepEqual(
  spentByYear([
    { doneOn: '2026-03-01', costEur: 89.9 },
    { doneOn: '2026-07-01', costEur: 210.1 },
    { doneOn: '2025-05-01', costEur: 45 },
    { doneOn: '2025-06-01', costEur: null },
  ]),
  [
    { year: 2026, total: 300, count: 2 },
    { year: 2025, total: 45, count: 1 },
  ],
);

// Types : anciens codes affichés mais plus proposés
assert.ok(!PLAN_KINDS.includes('tires') && !RECORD_KINDS.some((k) => k.value === 'brakes'));
assert.equal(kindInfo('chain').label, 'Chaîne');
assert.equal(PLAN_KINDS.length, 15);

console.log('garage-test : OK');
