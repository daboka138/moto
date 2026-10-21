// Banc d'essai du cap de ma flèche (src/lib/heading-filter.ts) et de la vue conduite (src/lib/nav-view.ts) :
// arrêt avec cap GPS / position bruités, passage 359° → 0°, saut improbable, virage réel, zoom selon la vitesse.
// Aucun accès réseau ni base.
// node --import ./scripts/dev/register.mjs scripts/dev/heading-filter-test.mjs
import assert from 'node:assert/strict';

const { initialHeadingFilter, stepHeadingFilter, angleDelta, circularMean, FROZEN_MAX_MS } = await import('../../src/lib/heading-filter.ts');
const { initialNavZoom, stepNavZoom, navZoomOf, routeBearingAt } = await import('../../src/lib/nav-view.ts');

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
const kmh = (v) => v / 3.6;

function run(fixes, keepFrozen = true) {
  let s = initialHeadingFilter();
  return fixes.map((f) => {
    const r = stepHeadingFilter(s, f, keepFrozen);
    s = r.state;
    return r;
  });
}

// 1) Je roule cap 90°, puis arrêt complet 60 s : cap GPS aléatoire, position qui saute de 0-5 m
{
  const fixes = [];
  let t = 0;
  for (let i = 0; i < 10; i++) fixes.push({ latitude: 43.3, longitude: 5.37 + i * 0.0001, accuracy: 5, speed: kmh(40), heading: 90 + rand() * 4, time: (t += 500) });
  for (let i = 0; i < 120; i++)
    fixes.push({ latitude: 43.3 + rand() * 0.00003, longitude: 5.371 + rand() * 0.00003, accuracy: 8, speed: kmh(Math.abs(rand()) * 4), heading: Math.abs(rand()) * 360, time: (t += 500) });
  const out = run(fixes);
  const still = out.slice(10);
  const headings = new Set(still.map((r) => r.heading));
  assert.equal(headings.size, 1, 'à l’arrêt, le cap ne bouge plus');
  assert.ok(Math.abs(angleDelta(90, still[0].heading)) < 4, 'figé sur le dernier cap fiable');
  const positions = new Set(still.map((r) => `${r.position.latitude},${r.position.longitude}`));
  assert.ok(positions.size <= 2, `position tenue à l’arrêt (${positions.size} positions)`);
  console.log('✓ arrêt : cap figé à', Math.round(still[0].heading), '°, position tenue');
}

// 2) Passage 359° → 0° : la moyenne ne passe pas par 180°
{
  assert.ok(Math.abs(angleDelta(0, circularMean([358, 359, 1, 2]))) < 1);
  const out = run([356, 358, 359, 1, 2, 3].map((h, i) => ({ latitude: 43.3, longitude: 5.37 + i * 0.0001, accuracy: 5, speed: kmh(50), heading: h, time: i * 500 })));
  for (const r of out) assert.ok(Math.abs(angleDelta(0, r.heading)) < 6, `cap ${r.heading} proche du nord`);
  console.log('✓ 359° → 0° sans demi-tour de la flèche');
}

// 3) Saut improbable isolé (cap 90 → 270 sur une mesure) : ignoré ; virage réel confirmé : suivi
{
  const base = (h, i) => ({ latitude: 43.3, longitude: 5.37 + i * 0.0001, accuracy: 5, speed: kmh(50), heading: h, time: i * 500 });
  let out = run([90, 90, 90, 270, 90, 90].map(base));
  assert.ok(out.every((r) => Math.abs(angleDelta(90, r.heading)) < 1), 'saut isolé ignoré');
  out = run([90, 90, 90, 180, 182, 184, 185].map(base));
  assert.ok(Math.abs(angleDelta(184, out.at(-1).heading)) < 5, 'demi-virage confirmé suivi');
  out = run([90, 110, 130, 150, 170].map(base));
  assert.ok(Math.abs(angleDelta(150, out.at(-1).heading)) < 25, 'virage progressif suivi (lissé)');
  console.log('✓ saut isolé ignoré, vrais virages suivis');
}

// 4) Mesure imprécise (60 m) : son cap n'est pas pris ; hors navigation, cap figé oublié après 10 min
{
  const out = run([
    { latitude: 43.3, longitude: 5.37, accuracy: 5, speed: kmh(30), heading: 45, time: 0 },
    { latitude: 43.3, longitude: 5.3701, accuracy: 60, speed: kmh(30), heading: 200, time: 500 },
  ]);
  assert.equal(Math.round(out[1].heading), 45);
  const late = { latitude: 43.3, longitude: 5.37, accuracy: 5, speed: 0, heading: null, time: FROZEN_MAX_MS + 1000 };
  const first = { latitude: 43.3, longitude: 5.37, accuracy: 5, speed: kmh(30), heading: 45, time: 0 };
  assert.equal(run([first, late], false)[1].heading, null, 'hors navigation : oublié');
  assert.equal(Math.round(run([first, late], true)[1].heading), 45, 'en navigation : gardé');
  console.log('✓ mesure imprécise ignorée, cap figé oublié hors navigation seulement');
}

// 5) Zoom de navigation : ville 17, route rapide 15,5 / 15, pas d'aller-retour autour d'un seuil
{
  let s = initialNavZoom();
  let t = 0;
  const drive = (v, seconds) => {
    const zooms = new Set();
    for (let i = 0; i < seconds; i++) {
      s = stepNavZoom(s, v + rand() * 3, (t += 1000));
      zooms.add(navZoomOf(s));
    }
    return zooms;
  };
  drive(25, 30);
  assert.equal(navZoomOf(s), 17, 'ville');
  drive(110, 60);
  assert.equal(navZoomOf(s), 15, 'autoroute');
  drive(50, 60);
  const around = drive(50, 120);
  assert.equal(around.size, 1, 'stable à 50 km/h');
  const before = navZoomOf(s);
  drive(5, 2);
  assert.equal(navZoomOf(s), before, 'un coup de frein ne change pas le zoom');
  console.log('✓ zoom : 17 en ville, 15 sur voie rapide, stable autour d’un seuil');
}

// 6) Cap de l'itinéraire au départ (avant le 1er cap GPS)
{
  const pts = [
    { latitude: 43.3, longitude: 5.37 },
    { latitude: 43.3001, longitude: 5.37 },
    { latitude: 43.3005, longitude: 5.37 },
  ];
  const cum = [0, 11, 55];
  assert.ok(Math.abs(angleDelta(0, routeBearingAt(pts, cum, 0))) < 1, 'itinéraire vers le nord');
  console.log('✓ cap de l’itinéraire au départ');
}

console.log('Tout est bon.');
