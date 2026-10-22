// Banc d'essai de la boussole lissée (src/lib/compass-filter.ts) : téléphone posé dans une voiture
// (oscillations ±10°), je tourne sur ma chaise (suivi CONTINU, sans paliers), boussole affolée, mal
// calibrée ou téléphone debout sur un support, 359° → 0°.
// Aucun accès réseau ni base. node --import ./scripts/dev/register.mjs scripts/dev/compass-filter-test.mjs
import assert from 'node:assert/strict';

const { initialCompass, stepCompass, headingFromRotation } = await import('../../src/lib/compass-filter.ts');

let seed = 11;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
let t = 0;
const HZ = 30;
function feed(s, seconds, value, { jitter = 0, accuracy = 3, tilt = 20, turnDegPerS = 0 } = {}) {
  const shown = [];
  for (let i = 0; i < seconds * HZ; i++) {
    t += 1000 / HZ;
    const v = value + (turnDegPerS * i) / HZ;
    s = stepCompass(s, { value: (v + rand() * jitter + 3600) % 360, accuracy, tilt, time: t });
    shown.push(s.shown);
  }
  return { s, shown };
}
const near = (a, b, tol) => a !== null && Math.abs(((a - b + 540) % 360) - 180) <= tol;

// 1) Voiture à l'arrêt : ±10° d'oscillation → la valeur ne bouge jamais après être apparue
let { s, shown } = feed(initialCompass(), 1, 40);
assert.ok(near(s.shown, 40, 2), 'apparaît après 0,5 s de mesures calmes');
({ s, shown } = feed(s, 20, 40, { jitter: 10 }));
assert.equal(new Set(shown).size, 1, 'aucun tremblement');
console.log('✓ voiture à l’arrêt : immobile malgré ±10°');

// 2) Je tourne sur ma chaise à 90°/s pendant 2 s : suivi continu, pas par paliers
({ s, shown } = feed(s, 2, 40, { turnDegPerS: 90 }));
const steps = shown.slice(1).map((v, i) => Math.abs(((v - shown[i] + 540) % 360) - 180));
const moving = steps.filter((d) => d > 0.01).length;
assert.ok(moving > shown.length * 0.7, `suit à chaque mesure (${moving}/${shown.length})`);
assert.ok(Math.max(...steps) < 8, `aucun saut (${Math.max(...steps).toFixed(1)}°)`);
assert.ok(near(s.shown, 220, 25), `suit avec un léger retard (${s.shown?.toFixed(0)}°)`);
({ s } = feed(s, 1, 220));
assert.ok(near(s.shown, 220, 2), 'puis se pose');
console.log(`✓ tourner sur soi : suivi continu (plus grand pas ${Math.max(...steps).toFixed(1)}° à 30 mesures/s)`);

// 3) Boussole affolée, mal calibrée, téléphone debout sur un support : masquée, puis revient
({ s } = feed(s, 2, 220, { jitter: 90 }));
assert.equal(s.shown, null, 'affolée : masquée');
({ s } = feed(s, 2, 220));
assert.ok(near(s.shown, 220, 3), 'revient');
({ s } = feed(s, 2, 220, { accuracy: 1 }));
assert.equal(s.shown, null, 'calibration faible : masquée');
({ s } = feed(s, 2, 220));
({ s } = feed(s, 2, 220, { tilt: 85 }));
assert.equal(s.shown, null, 'téléphone vertical : masquée');
console.log('✓ affolée, mal calibrée ou téléphone vertical : masquée');

// 4) 359° → 0° : pas de demi-tour
({ s } = feed(initialCompass(), 2, 0, { jitter: 4 }));
assert.ok(near(s.shown, 0, 3));
console.log('✓ autour du nord sans demi-tour');

// 5) DeviceMotion Android : alpha = -azimut (rad)
assert.equal(Math.round(headingFromRotation(-Math.PI / 2, 0).value), 90, 'est');
assert.equal(Math.round(headingFromRotation(Math.PI / 2, 0).value), 270, 'ouest');
assert.equal(Math.round(headingFromRotation(0, -Math.PI / 4).tilt), 45, 'inclinaison');
console.log('✓ cap depuis la rotation du téléphone');
console.log('Tout est bon.');
