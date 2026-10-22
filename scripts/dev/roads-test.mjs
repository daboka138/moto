// Banc d'essai des routes plaisir (src/lib/road-rules.ts : portion choisie, milieu, notes, classement).
// Aucun accès réseau ni base.
// node --import ./scripts/dev/register.mjs scripts/dev/roads-test.mjs
import assert from 'node:assert/strict';

const R = await import('../../src/lib/road-rules.ts');

// Tracé droit nord-sud de ~11 km (100 points)
const line = Array.from({ length: 101 }, (_, i) => ({ latitude: 44 + i * 0.001, longitude: 6 }));

// Toucher près du 30e point puis du 10e : portion dans l'ordre du tracé
const a = R.nearestIndex(line, { latitude: 44.0302, longitude: 6.0004 });
const b = R.nearestIndex(line, { latitude: 44.0099, longitude: 5.9998 });
assert.equal(a, 30);
assert.equal(b, 10);
const part = R.sliceLine(line, a, b);
assert.equal(part.length, 21);
assert.equal(part[0].latitude, line[10].latitude);

// Milieu à mi-longueur
const mid = R.midpoint(part);
assert.ok(Math.abs(mid.latitude - 44.02) < 1e-9);

// Encodage : arrondi à ~1 m, relu à l'identique
const enc = R.encodeRoadLine(part);
assert.equal(enc.length, 21);
assert.deepEqual(R.decodeRoadLine(enc)[20], { latitude: 44.03, longitude: 6 });
assert.equal(R.decodeRoadLine([[1, 2]]), null);
assert.equal(R.decodeRoadLine('x'), null);

// Zigzag de 1000 points : jamais plus de ROAD_MAX_POINTS
const zig = Array.from({ length: 1000 }, (_, i) => ({ latitude: 44 + i * 0.0005, longitude: 6 + (i % 2) * 0.001 }));
assert.ok(R.encodeRoadLine(zig).length <= R.ROAD_MAX_POINTS);

// Notes : moyenne arrondie comme le serveur (round de Postgres : 4,5 → 5)
assert.equal(R.criteriaRating({ curves: 5, surface: 4, scenery: 5, traffic: 3 }), 4);
assert.equal(R.criteriaRating({ curves: 5, surface: 5, scenery: 4, traffic: 4 }), 5);
assert.equal(R.criteriaComplete({ curves: 5, surface: 4, scenery: 5 }), false);
assert.equal(R.criteriaComplete({ curves: 5, surface: 4, scenery: 5, traffic: 6 }), false);
assert.deepEqual(R.averageCriteria([{ curves: 4, surface: 2, scenery: 5, traffic: 3 }, { curves: 2, surface: 4, scenery: 5, traffic: 5 }, {}]), {
  curves: 3,
  surface: 3,
  scenery: 5,
  traffic: 4,
});
assert.equal(R.averageCriteria([{}]), null);

// Couleurs et classement
assert.equal(R.roadTier(4.6), 'top');
assert.equal(R.roadTier(3.6), 'good');
assert.equal(R.roadTier(null), 'low');
const ranked = R.rankRoads([
  { id: 'a', rating: 4, reviewsCount: 1, distanceM: 10 },
  { id: 'b', rating: 4.5, reviewsCount: 1, distanceM: 50 },
  { id: 'c', rating: 4, reviewsCount: 3, distanceM: 90 },
  { id: 'd', rating: null, reviewsCount: 0, distanceM: 1 },
]);
assert.deepEqual(
  ranked.map((r) => r.id),
  ['b', 'c', 'a', 'd'],
);

// Jamais de critère de vitesse
assert.ok(!R.ROAD_CRITERIA.some((c) => /vitesse|chrono|rapide/i.test(c.label + c.hint)));

console.log('✓ routes plaisir : portion, milieu, encodage, notes, classement');
