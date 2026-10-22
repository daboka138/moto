// Banc d'essai de l'annonce des changements de limitation (src/lib/limit-change-rules.ts) : trajet
// simulé tout droit vers le nord, une position tous les 20 m. Aucun accès réseau ni base.
// node --import ./scripts/dev/register.mjs scripts/dev/limit-changes-test.mjs
import assert from 'node:assert/strict';

const { initialLimitState, stepLimits, stableRuns, soonDistance } = await import('../../src/lib/limit-change-rules.ts');

const M_PER_DEG = 111_195;
const at = (m) => ({ latitude: 43 + m / M_PER_DEG, longitude: 5 });

/** Roule de fromM à toM ; renvoie les annonces (texte + position) */
function ride(runs, { fromM = 0, toM, kmh = 80, live = () => null, state = initialLimitState(), t0 = 0, onRoute = true }) {
  const events = [];
  for (let m = fromM; m <= toM; m += 20) {
    const r = stepLimits(state, { runs: onRoute ? runs : [], alongM: onRoute ? m : null, position: at(m), kmh, live: live(m), now: t0 + m * 50 });
    state = r.state;
    if (r.event) events.push({ ...r.event, m });
  }
  return { events, state };
}

// 1) 80 → 50 sur l'itinéraire : « Bientôt » 100-200 m avant, puis panneau animé sans répéter la voix
let { events } = ride(
  [
    { fromM: 0, toM: 2000, limit: 80 },
    { fromM: 2000, toM: 4000, limit: 50 },
  ],
  { toM: 3000 },
);
assert.equal(events.length, 2);
assert.equal(events[0].text, 'Bientôt limitation à 50.');
assert.ok(events[0].m >= 2000 - soonDistance(80) && events[0].m < 2000, `annoncé à ${2000 - events[0].m} m`);
assert.deepEqual([events[1].type, events[1].speak, events[1].m], ['enter', false, 2000]);
console.log(`✓ 80 → 50 : « Bientôt » ${2000 - events[0].m} m avant, une seule voix, panneau animé à l'entrée`);

// 2) 50 → 80 (hausse) : pas de « Bientôt », « Limitation à 80. » en entrant
({ events } = ride(
  [
    { fromM: 0, toM: 1000, limit: 50 },
    { fromM: 1000, toM: 3000, limit: 80 },
  ],
  { toM: 2000 },
));
assert.deepEqual(
  events.map((e) => [e.type, e.text, e.speak, e.m]),
  [['enter', 'Limitation à 80.', true, 1000]],
);
console.log('✓ 50 → 80 : « Limitation à 80. » une fois en entrant');

// 3) Micro-changement (80 m à 50 au milieu du 80) et limitation inconnue : rien
({ events } = ride(
  [
    { fromM: 0, toM: 1000, limit: 80 },
    { fromM: 1000, toM: 1080, limit: 50 },
    { fromM: 1080, toM: 2000, limit: 80 },
    { fromM: 2000, toM: 2600, limit: null },
    { fromM: 2600, toM: 4000, limit: 80 },
  ],
  { toM: 3500 },
));
assert.equal(events.length, 0, JSON.stringify(events));
console.log('✓ portion de 80 m et limitation inconnue ignorées');

// 4) Inconnue puis 50 : comparée à la dernière connue (80 → ? → 50 = changement)
({ events } = ride(
  [
    { fromM: 0, toM: 1000, limit: 80 },
    { fromM: 1000, toM: 1500, limit: null },
    { fromM: 1500, toM: 3000, limit: 50 },
  ],
  { toM: 2000 },
));
assert.deepEqual(
  events.map((e) => e.text),
  ['Bientôt limitation à 50.', 'Limitation à 50.'],
);
assert.equal(events[1].speak, false);
console.log('✓ 80 → inconnue → 50 : annoncé, une seule voix');

// 5) Départ : la première limitation connue n'est pas annoncée
({ events } = ride([{ fromM: 0, toM: 3000, limit: 90 }], { toM: 2000 }));
assert.equal(events.length, 0);
console.log('✓ départ : rien à annoncer');

// 6) Recalcul : nouvelles distances le long du tracé, même endroit → pas répété (mémoire par position)
let r = ride(
  [
    { fromM: 0, toM: 1000, limit: 80 },
    { fromM: 1000, toM: 3000, limit: 50 },
  ],
  { toM: 1100 },
);
const shifted = [
  { fromM: 0, toM: 100, limit: 80 },
  { fromM: 100, toM: 2000, limit: 50 },
].map((x) => ({ ...x, fromM: x.fromM + 900, toM: x.toM + 900 })); // le même 50 au même endroit
const again = ride([{ fromM: 0, toM: 900, limit: 80 }, ...shifted], { fromM: 700, toM: 1300, state: { ...r.state, last: 80 }, t0: 60_000 });
assert.ok(again.events.every((e) => !e.speak), JSON.stringify(again.events));
console.log('✓ recalcul : même limitation au même endroit, pas répétée');

// 7) Hors itinéraire (limitation en direct) : retenue après 150 m stables, valeur éclair ignorée
({ events } = ride([], {
  toM: 3000,
  onRoute: false,
  live: (m) => (m < 1000 ? 80 : m < 1060 ? 50 : m < 2000 ? 80 : 50),
}));
assert.deepEqual(
  events.map((e) => [e.text, e.m]),
  [['Limitation à 50.', 2160]],
);
console.log('✓ en direct : valeur de 60 m ignorée, 50 annoncé après 150 m stables');

// 8) Portions voisines de même limitation (morceaux de 20 km) réunies
assert.deepEqual(
  stableRuns([
    { fromM: 0, toM: 100, limit: 70 },
    { fromM: 100, toM: 180, limit: 70 },
    { fromM: 180, toM: 250, limit: 90 },
  ]),
  [{ fromM: 0, toM: 180, limit: 70 }],
);
assert.equal(soonDistance(30), 100);
assert.equal(soonDistance(130), 200);
console.log('✓ portions réunies, anticipation 100-200 m selon la vitesse');
