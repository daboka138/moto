// Parkings moto de France (OpenStreetMap, amenity=motorcycle_parking UNIQUEMENT) → public/data/parkings/
// Source : QLever (qlever.dev, OSM complet, rapide et fiable) au lieu d'Overpass, souvent saturé.
// Une case par 0,5° (« <floor(lat×2)>_<floor(lon×2)>.json »), servie par app.passeryder.fr : la carte et
// la recherche « Parking moto » lisent ces fichiers (< 1 s), Overpass ne sert plus qu'en dehors de la France.
// Relancer de temps en temps (données OSM © contributeurs OpenStreetMap, ODbL), puis npm run web:build + déploiement :
//   node scripts/build-parkings.mjs
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'public', 'data', 'parkings');
const K = (k) => `<https://www.openstreetmap.org/wiki/Key:${k}>`;
const QUERY = `PREFIX geo: <http://www.opengis.net/ont/geosparql#>
PREFIX ogc: <http://www.opengis.net/rdf#>
PREFIX osmrel: <https://www.openstreetmap.org/relation/>
SELECT ?osm ?wkt ?name ?cap ?capm ?fee ?covered ?hn ?street ?city WHERE {
  ?osm ${K('amenity')} "motorcycle_parking" ; ogc:sfIntersects osmrel:2202162 ; geo:hasGeometry/geo:asWKT ?wkt .
  OPTIONAL { ?osm ${K('name')} ?name } OPTIONAL { ?osm ${K('capacity')} ?cap } OPTIONAL { ?osm ${K('capacity:motorcycle')} ?capm }
  OPTIONAL { ?osm ${K('fee')} ?fee } OPTIONAL { ?osm ${K('covered')} ?covered }
  OPTIONAL { ?osm ${K('addr:housenumber')} ?hn } OPTIONAL { ?osm ${K('addr:street')} ?street } OPTIONAL { ?osm ${K('addr:city')} ?city }
}`;

const res = await fetch('https://qlever.dev/api/osm-planet', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/sparql-results+json',
    'User-Agent': 'PasseRyder/1.0 (https://passeryder.fr)',
  },
  body: new URLSearchParams({ query: QUERY }),
});
if (!res.ok) throw new Error(`QLever ${res.status} : ${(await res.text()).slice(0, 300)}`);
const rows = (await res.json()).results.bindings;
if (rows.length < 3000) throw new Error(`Seulement ${rows.length} parkings : réponse incomplète, rien n'est écrit`);

const v = (r, k) => r[k]?.value;
/** Centre d'un POINT / POLYGON WKT (moyenne des sommets : largement assez pour un parking) */
function center(wkt) {
  const nums = wkt.match(/-?\d+(\.\d+)?/g).map(Number);
  let lat = 0;
  let lon = 0;
  const n = nums.length / 2;
  for (let i = 0; i < nums.length; i += 2) {
    lon += nums[i];
    lat += nums[i + 1];
  }
  return [Math.round((lat / n) * 1e5) / 1e5, Math.round((lon / n) * 1e5) / 1e5];
}

const tiles = new Map();
const seen = new Set();
for (const r of rows) {
  const url = v(r, 'osm');
  const id = url.replace(/^.*\/(node|way|relation)\/(\d+)$/, (_, t, n) => t[0] + n);
  if (seen.has(id)) continue;
  seen.add(id);
  const [lat, lon] = center(v(r, 'wkt'));
  const capRaw = v(r, 'capm') ?? v(r, 'cap');
  const street = [v(r, 'hn'), v(r, 'street')].filter(Boolean).join(' ');
  const address = [street, v(r, 'city')].filter(Boolean).join(', ') || null;
  const fee = v(r, 'fee') === 'yes' ? 1 : v(r, 'fee') === 'no' ? 0 : null;
  // [lat, lon, id, nom, adresse, payant 1/0/null, places, couvert 1/0]
  const rec = [lat, lon, id, v(r, 'name') ?? null, address, fee, capRaw && /^\d+$/.test(capRaw) ? Number(capRaw) : null, v(r, 'covered') === 'yes' ? 1 : 0];
  const key = `${Math.floor(lat * 2)}_${Math.floor(lon * 2)}`;
  if (!tiles.has(key)) tiles.set(key, []);
  tiles.get(key).push(rec);
}

mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) rmSync(join(OUT, f));
// France métropolitaine : toutes les cases, même vides (une case vide = « aucun parking », pas une erreur)
for (let i = Math.floor(41.3 * 2); i <= Math.floor(51.2 * 2); i++)
  for (let j = Math.floor(-5.3 * 2); j <= Math.floor(9.7 * 2); j++) if (!tiles.has(`${i}_${j}`)) tiles.set(`${i}_${j}`, []);
for (const [key, list] of tiles) writeFileSync(join(OUT, `${key}.json`), JSON.stringify(list));
const updated = new Date().toISOString().slice(0, 10);
writeFileSync(join(OUT, 'meta.json'), JSON.stringify({ updated, count: seen.size, source: 'OpenStreetMap (ODbL) via QLever' }));
console.log(`${seen.size} parkings moto, ${tiles.size} cases → public/data/parkings (${updated})`);
