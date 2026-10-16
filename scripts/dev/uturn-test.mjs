// Usage : node --import ./scripts/dev/register.mjs scripts/dev/uturn-test.mjs
// Détection des demi-tours et coupe des culs-de-sac sur des tracés fictifs.
import assert from 'node:assert/strict';
const { findUTurns, cutSpurs } = await import('../../src/lib/loop.ts');
const { distanceM } = await import('../../src/lib/geo.ts');
const M = 1 / 111320; // degré de latitude par mètre (à peu près)
const P = (x, y) => ({ latitude: 43.3 + y * M, longitude: 5.4 + (x * M) / Math.cos((43.3 * Math.PI) / 180) });
const line = (from, to, step = 10) => {
  const n = Math.round(distanceM(from, to) / step);
  return Array.from({ length: n + 1 }, (_, i) => ({ latitude: from.latitude + ((to.latitude - from.latitude) * i) / n, longitude: from.longitude + ((to.longitude - from.longitude) * i) / n }));
};
const route = (points) => ({ points, cumulative: [], distanceM: 1, durationS: 1, steps: [], engine: 'valhalla', options: null });

// 1) Route droite 2 km avec une impasse de 400 m au milieu (aller-retour)
const a = P(0, 0), b = P(1000, 0), dead = P(1000, 400), c = P(2000, 0);
const withSpur = [...line(a, b), ...line(b, dead).slice(1), ...line(dead, b).slice(1), ...line(b, c).slice(1)];
assert.equal(findUTurns(withSpur).length, 1, 'impasse : 1 demi-tour');
const cut = cutSpurs(route(withSpur));
assert.equal(findUTurns(cut.points).length, 0, 'impasse coupée');
assert.ok(Math.abs(cut.distanceM - 2000) < 60, `longueur après coupe ≈ 2000 m (${Math.round(cut.distanceM)})`);

// 2) Crochet au départ : on part dans une impasse de 300 m, on revient, puis la boucle
const s0 = P(0, 0), hook = P(-300, 0), far = P(0, 1500);
const startHook = [...line(s0, hook), ...line(hook, s0).slice(1), ...line(s0, far).slice(1), ...line(far, P(800, 800)).slice(1), ...line(P(800, 800), s0).slice(1)];
assert.equal(findUTurns(startHook).length, 1, 'crochet au départ : 1 demi-tour');
assert.equal(findUTurns(cutSpurs(route(startHook)).points).length, 0, 'crochet coupé');

// 3) Lacet de montagne : virage en épingle, branches à 40 m l'une de l'autre → pas un demi-tour
const h1 = P(0, 0), h2 = P(0, 300), h3 = P(40, 330), h4 = P(80, 300), h5 = P(80, 0);
const hairpin = [...line(h1, h2), ...line(h2, h3).slice(1), ...line(h3, h4).slice(1), ...line(h4, h5).slice(1)];
assert.equal(findUTurns(hairpin).length, 0, 'lacet : pas un demi-tour');

// 4) Boucle propre : rien à couper
const clean = [...line(P(0, 0), P(1000, 0)), ...line(P(1000, 0), P(1000, 1000)).slice(1), ...line(P(1000, 1000), P(0, 0)).slice(1)];
assert.equal(findUTurns(clean).length, 0);
assert.equal(cutSpurs(route(clean)), null);
console.log('demi-tours : 4 cas OK');
