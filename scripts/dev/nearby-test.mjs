// Banc d'essai des catégories « autour de moi » (src/lib/nearby.ts) : temps avant la 1re liste et
// liste finale, par ville. Interroge seulement Photon / Overpass (lecture), jamais la base (spots remplacés).
// node --import ./scripts/dev/register.mjs scripts/dev/nearby-test.mjs [fuel|food|parking|moto_garage]
import { register } from 'node:module';

const STUBS = {
  'react-native': 'export const Platform = { OS: "android" };',
  '@/lib/places': 'export const fetchPlacesAround = async () => [];',
  '@/lib/navigation': 'export const projectOnRoute = () => null;',
  react: 'export const useEffect = () => {}; export const useState = (v) => [v, () => {}];',
};
const S = Object.fromEntries(Object.entries(STUBS).map(([k, v]) => [k, 'data:text/javascript,' + encodeURIComponent(v)]));
register(
  'data:text/javascript,' +
    encodeURIComponent(`const S = ${JSON.stringify(S)};
      export async function resolve(spec, ctx, next) { return S[spec] ? { url: S[spec], shortCircuit: true } : next(spec, ctx); }`),
);
const mem = new Map();
globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };

const { searchNearby } = await import('../../src/lib/nearby.ts');
const CITIES = {
  Paris: { latitude: 48.8566, longitude: 2.3522 },
  Lyon: { latitude: 45.764, longitude: 4.8357 },
  Marseille: { latitude: 43.2965, longitude: 5.3698 },
  'Les Vans (campagne)': { latitude: 44.405, longitude: 4.132 },
};
const cats = process.argv[2] ? [process.argv[2]] : ['fuel', 'food', 'parking', 'moto_garage'];
for (const cat of cats) {
  for (const [city, near] of Object.entries(CITIES)) {
    const t0 = Date.now();
    let first = null;
    try {
      const res = await searchNearby(cat, near, (r) => {
        if (first == null && r.length) first = Date.now() - t0;
      });
      const total = Date.now() - t0;
      console.log(
        `${cat.padEnd(11)} ${city.padEnd(20)} 1re liste ${first == null ? '  -  ' : (first / 1000).toFixed(1) + ' s'}  finale ${(total / 1000).toFixed(1)} s  ${res.length} lieux :`,
        res.slice(0, 3).map((r) => `${r.label} (${Math.round(r.distanceM)} m)`).join(' | '),
      );
    } catch (e) {
      console.log(`${cat.padEnd(11)} ${city.padEnd(20)} ÉCHEC ${((Date.now() - t0) / 1000).toFixed(1)} s ${e.message}`);
    }
    const t1 = Date.now();
    await searchNearby(cat, near);
    if (Date.now() - t1 > 50) console.log('  ⚠ cache non utilisé');
  }
}
