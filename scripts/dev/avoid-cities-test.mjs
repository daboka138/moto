// Banc d'essai « Éviter les villes » (note 23) : appelle le vrai code de l'app (fetchValhallaRoute)
// sur le serveur Valhalla public. Aucune donnée PasseRyder lue ni écrite.
// node --import ./scripts/dev/register.mjs scripts/dev/avoid-cities-test.mjs
import { fetchValhallaRoute } from '../../src/lib/navigation.ts';

const base = { scooter50: false, avoidHighways: true, avoidTolls: false, avoidUnpaved: true, preferTrails: false, style: 'fast' };
const CASES = [
  ['Villefranche-sur-Saône → Vienne (traverse Lyon)', [{ latitude: 45.989, longitude: 4.718 }, { latitude: 45.525, longitude: 4.874 }]],
  ['Aubagne → Aix-en-Provence', [{ latitude: 43.293, longitude: 5.566 }, { latitude: 43.529, longitude: 5.447 }]],
  ['Rambouillet → Meaux (contourne Paris ?)', [{ latitude: 48.644, longitude: 1.83 }, { latitude: 48.96, longitude: 2.878 }]],
  ['Toulouse Blagnac → Montauban avec étape à Grenade', [{ latitude: 43.629, longitude: 1.364 }, { latitude: 43.758, longitude: 1.293 }, { latitude: 44.017, longitude: 1.355 }]],
];
for (const [name, stops] of CASES) {
  const t = Date.now();
  try {
    const plain = await fetchValhallaRoute(stops, base);
    const r = await fetchValhallaRoute(stops, { ...base, avoidCities: true });
    const u = r.urban;
    console.log(
      `${name}\n  normal ${(plain.distanceM / 1000).toFixed(1)} km ${Math.round(plain.durationS / 60)} min` +
        ` | évite villes ${(r.distanceM / 1000).toFixed(1)} km ${Math.round(r.durationS / 60)} min` +
        ` | en ville ${u ? `${Math.round(u.before * 100)} % → ${Math.round(u.after * 100)} %` : '?'}` +
        ` | ${r.options?.exclude?.length ?? 0} points évités | ${((Date.now() - t) / 1000).toFixed(1)} s`,
    );
  } catch (e) {
    console.log(name, 'ERREUR', e.message);
  }
}
