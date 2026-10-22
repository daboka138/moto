// Banc d'essai du faisceau de boussole (src/lib/compass-filter.ts) : téléphone posé dans une voiture
// (oscillations ±10°), je tourne sur ma chaise (90° stables), boussole affolée ou mal calibrée, 359° → 0°.
// Aucun accès réseau ni base. node --import ./scripts/dev/register.mjs scripts/dev/compass-filter-test.mjs
import assert from 'node:assert/strict';

const { initialCompass, stepCompass } = await import('../../src/lib/compass-filter.ts');

let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
let t = 0;
function feed(s, seconds, value, { jitter = 0, accuracy = 3, hz = 20 } = {}) {
  const shown = [];
  for (let i = 0; i < seconds * hz; i++) {
    t += 1000 / hz;
    s = stepCompass(s, { value: (value + rand() * jitter + 360) % 360, accuracy, time: t });
    shown.push(s.shown);
  }
  return { s, shown };
}
const near = (a, b, tol) => Math.abs(((a - b + 540) % 360) - 180) <= tol;

// 1) Voiture à l'arrêt : ±10° d'oscillation → le faisceau ne bouge jamais après être apparu
let { s, shown } = feed(initialCompass(), 1, 40);
assert.ok(near(s.shown, 40, 2), 'apparaît après 0,5 s de mesures calmes');
({ s, shown } = feed(s, 20, 40, { jitter: 10 }));
assert.equal(new Set(shown).size, 1, 'aucun tremblement');
console.log('✓ voiture à l’arrêt : faisceau immobile malgré ±10°');

// 2) Je tourne sur ma chaise : +90°, le faisceau suit en ~0,5 s
({ s, shown } = feed(s, 1.5, 130, { jitter: 3 }));
assert.ok(near(s.shown, 130, 4), 'suit un vrai changement');
const at = shown.findIndex((v) => near(v, 130, 6));
assert.ok(at >= 9 && at <= 25, `suivi après ~0,5-1 s (${at / 20} s)`);
console.log(`✓ tourner sur soi : suivi en ${at / 20} s`);

// 3) À-coup bref (0,3 s) : ignoré
({ s, shown } = feed(s, 0.3, 220));
({ s, shown } = feed(s, 1, 130));
assert.ok(near(s.shown, 130, 4), 'à-coup ignoré');
console.log('✓ à-coup de 0,3 s ignoré');

// 4) Boussole affolée (sauts de ±90°) ou mal calibrée : masquée, puis revient une fois calme
({ s } = feed(s, 2, 130, { jitter: 90 }));
assert.equal(s.shown, null, 'affolée : masquée');
({ s } = feed(s, 1, 130));
assert.ok(near(s.shown, 130, 4), 'revient');
({ s } = feed(s, 2, 130, { accuracy: 1 }));
assert.equal(s.shown, null, 'calibration faible : masquée');
console.log('✓ boussole affolée ou mal calibrée : faisceau masqué');

// 5) 359° → 0° : pas de demi-tour
({ s } = feed(initialCompass(), 2, 0, { jitter: 4 }));
assert.ok(near(s.shown, 0, 3));
console.log('✓ autour du nord sans demi-tour');
console.log('Tout est bon.');
