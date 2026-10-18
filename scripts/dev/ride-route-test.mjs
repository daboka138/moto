// Banc d'essai du tracé des balades avec étapes (note 25) : appelle le vrai code de l'app
// (computeRoute de ride/new) sur les serveurs publics OSRM / Valhalla. Aucune donnée PasseRyder lue ni écrite.
// node --import ./scripts/dev/register.mjs scripts/dev/ride-route-test.mjs
import { computeRoute, ROUTE_FAILED } from '../../src/lib/routing.ts';

const P = (latitude, longitude) => ({ latitude, longitude });
const marseille = P(43.2965, 5.3698);
const gineste = P(43.2286, 5.5156);
const cassis = P(43.2148, 5.5385);
const aubagne = P(43.2927, 5.5708);
const gemenos = P(43.2711, 5.6283);
const espigoulier = P(43.2926, 5.6922);
const plan = P(43.3121, 5.7262);
const baume = P(43.3326, 5.7556);
const TRIPS = [
  ['Marseille → Col de la Gineste → Cassis (1 étape)', [marseille, gineste, cassis]],
  ['Aubagne → Gémenos → Sainte-Baume (1 étape)', [aubagne, gemenos, baume]],
  ['Aubagne → Gémenos, Espigoulier, Plan-d’Aups → Sainte-Baume (3 étapes)', [aubagne, gemenos, espigoulier, plan, baume]],
];
const base = { scooter50: false, avoidHighways: false, avoidTolls: false, avoidUnpaved: true, preferTrails: false, style: 'fast' };
const OPTIONS = [
  ['aucune option', undefined],
  ['sans autoroute', { ...base, avoidHighways: true }],
  ['sans péage', { ...base, avoidTolls: true }],
  ['évite les villes', { ...base, avoidCities: true }],
  ['les trois', { ...base, avoidHighways: true, avoidTolls: true, avoidCities: true }],
];
let failed = 0;
for (const [name, stops] of TRIPS) {
  console.log(name);
  for (const [label, options] of OPTIONS) {
    const t = Date.now();
    try {
      const r = await computeRoute(stops, options);
      const straight = r.points.length <= stops.length;
      if (straight) failed++;
      console.log(
        `  ${label.padEnd(16)} ${(r.distanceM / 1000).toFixed(1).padStart(5)} km ${String(Math.round(r.durationS / 60)).padStart(3)} min` +
          ` · ${r.points.length} points${straight ? ' · LIGNE DROITE' : ''}${r.options ? ' · Valhalla' : ''} · ${((Date.now() - t) / 1000).toFixed(1)} s`,
      );
    } catch (e) {
      console.log(`  ${label.padEnd(16)} ERREUR ${e.message} · ${((Date.now() - t) / 1000).toFixed(1)} s`);
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}
// Serveurs injoignables : erreur claire, jamais de tracé en ligne droite
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new TypeError('Failed to fetch');
};
for (const [label, options] of [OPTIONS[0], OPTIONS[1], ['50 cm³', { ...base, scooter50: true, avoidHighways: true }]]) {
  try {
    const r = await computeRoute(TRIPS[0][1], options);
    failed++;
    console.log(`  serveurs coupés, ${label} : tracé renvoyé (${r.points.length} points) au lieu d'une erreur`);
  } catch (e) {
    if (e.message !== ROUTE_FAILED) failed++;
    console.log(`  serveurs coupés, ${label} : « ${e.message} »`);
  }
}
globalThis.fetch = realFetch;
console.log(failed ? `${failed} tracé(s) en ligne droite` : 'OK : tous les tracés suivent les routes');
process.exit(failed ? 1 : 0);
