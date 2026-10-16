// Usage : node --import ./scripts/dev/register.mjs scripts/dev/rank-test.mjs
// Vérifie le choix final des boucles (pickLoops) : marge -15 % / +20 %, jamais de « hors durée » en tête.
import assert from 'node:assert/strict';
const { pickLoops } = await import('../../src/lib/loop.ts');
const loop = (id, durationMin, { score = 6, urban = 0.2, overlap = 0.05 } = {}) => ({
  id, durationMin, score, urban, overlap, degPerKm: score * 30, exitKm: 2, via: [], offTarget: false,
  route: { points: [], cumulative: [], distanceM: durationMin * 700, durationS: durationMin * 60, steps: [], engine: 'valhalla', options: null },
});
const T90 = { kind: 'duration', minutes: 90 };
let r;

// 1) Le cas signalé : 2 h 19 (139 min) très sinueuse + une boucle à 85 min dans la marge
r = pickLoops([loop('a', 139, { score: 10, urban: 0 }), loop('b', 85)], T90, 'twisty');
assert.deepEqual(r.map((l) => l.id), ['b'], '139 min ne doit pas être proposée quand 85 min est dans la marge');

// 2) Bornes : 76,5 min (-15 %) et 108 min (+20 %) acceptées, 76 et 109 refusées
r = pickLoops([loop('lo', 76.5), loop('hi', 108), loop('x', 76), loop('y', 109)], T90, 'twisty');
assert.deepEqual(r.map((l) => l.id).sort(), ['hi', 'lo']);
assert.ok(r.every((l) => !l.offTarget));

// 3) Aucune dans la marge : les plus proches, toutes marquées offTarget, la plus proche en tête
r = pickLoops([loop('a', 139), loop('b', 120), loop('c', 60)], T90, 'twisty');
assert.equal(r[0].id, 'b');
assert.ok(r.every((l) => l.offTarget), 'hors durée doit être signalé sur chaque boucle');

// 4) Un offTarget « faux » venant du calcul n'est pas cru : recalculé sur la durée affichée
r = pickLoops([{ ...loop('a', 139), offTarget: false }, { ...loop('b', 90), offTarget: true }], T90, 'twisty');
assert.deepEqual(r.map((l) => [l.id, l.offTarget]), [['b', false]]);

// 5) Distance : 80 km demandés, marge 68 à 96 km
const k = (id, km) => ({ ...loop(id, 90), route: { ...loop(id, 90).route, distanceM: km * 1000 } });
r = pickLoops([k('a', 100), k('b', 70)], { kind: 'distance', km: 80 }, 'twisty');
assert.deepEqual(r.map((l) => l.id), ['b']);

console.log('pickLoops : 5 cas OK');
