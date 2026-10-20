// Banc : limitations de vitesse le long d'un itinéraire (lib/speed-limit.ts fetchRouteLimits), en LECTURE seule
// (OSRM pour le tracé, Valhalla FOSSGIS trace_attributes). Usage :
//   node --import ./scripts/dev/register.mjs scripts/dev/route-limits-test.mjs
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const ROOT = join(import.meta.dirname, '..', '..');
const { fetchRouteLimits } = await import(pathToFileURL(join(ROOT, 'src/lib/speed-limit.ts')).href);

// Marseille Castellane → Aubagne par l'autoroute A50 (ville, voie rapide, autoroute)
const url = 'https://router.project-osrm.org/route/v1/driving/5.3834,43.2858;5.5665,43.2925?overview=full&geometries=geojson';
const json = await (await fetch(url)).json();
const points = json.routes[0].geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
const cumulative = [0];
for (let i = 1; i < points.length; i++) {
  const a = points[i - 1], b = points[i];
  const kx = 111_320 * Math.cos((a.latitude * Math.PI) / 180);
  cumulative.push(cumulative[i - 1] + Math.hypot((b.longitude - a.longitude) * kx, (b.latitude - a.latitude) * 110_540));
}
const route = { points, cumulative, distanceM: cumulative.at(-1) };
console.log(`Tracé : ${(route.distanceM / 1000).toFixed(1)} km, ${points.length} points`);
let at = 0;
while (at < route.distanceM) {
  const t0 = Date.now();
  const { runs, endM } = await fetchRouteLimits(route, at);
  console.log(`Morceau ${(at / 1000).toFixed(1)} → ${(endM / 1000).toFixed(1)} km (${Date.now() - t0} ms) :`);
  for (const r of runs) if (r.toM - r.fromM > 150) console.log(`  ${(r.fromM / 1000).toFixed(2)}-${(r.toM / 1000).toFixed(2)} km : ${r.limit ?? 'inconnue'}`);
  at = endM;
}
