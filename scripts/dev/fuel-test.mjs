// Banc : stations-service aux prix officiels le long de vrais itinéraires (lib/fuel-prices.ts), en
// LECTURE seule (clé publishable, RPC fuel_stations_along / fuel_stations_near). Itinéraires : OSRM public.
//   node --env-file=.env --import ./scripts/dev/register.mjs scripts/dev/fuel-test.mjs
const { fetchRouteStations, routeFuelSummary, sparseStationsAhead, stationOpenState, nearestFuelStations, stationPrices, formatPrice } =
  await import('@/lib/fuel-prices');

const TRIPS = [
  { label: 'Marseille → Aix-en-Provence', from: [5.3698, 43.3026], to: [5.4474, 43.5297] },
  { label: 'Castellane → Barcelonnette (montagne)', from: [6.5125, 43.8468], to: [6.6524, 44.3872] },
];

async function route([lon1, lat1], [lon2, lat2]) {
  const url = `https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=full&geometries=geojson`;
  const json = await (await fetch(url)).json();
  const points = json.routes[0].geometry.coordinates.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const kx = 111_320 * Math.cos((a.latitude * Math.PI) / 180);
    cumulative.push(cumulative[i - 1] + Math.hypot((b.longitude - a.longitude) * kx, (b.latitude - a.latitude) * 110_540));
  }
  return { points, cumulative, distanceM: cumulative.at(-1) };
}

let fails = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${msg}`);
  if (!ok) fails++;
};

for (const t of TRIPS) {
  const r = await route(t.from, t.to);
  const stations = await fetchRouteStations(r);
  console.log(`\n${t.label} : ${Math.round(r.distanceM / 1000)} km, ${stations.length} stations à < 2 km`);
  console.log('  ' + routeFuelSummary(stations, 'sp98'));
  console.log('  ' + stations.slice(0, 5).map((s) => `${Math.round(s.alongM / 1000)} km ${s.city} (${Math.round(s.offRouteM)} m)`).join(' | '));
  check(stations.every((s, i) => i === 0 || s.alongM >= stations[i - 1].alongM), 'stations dans l’ordre du trajet');
  check(stations.every((s) => s.offRouteM <= 2000), 'toutes à moins de 2 km');
  // Rappel « plein » : autonomie 80 km, à chaque station
  for (const s of stations) {
    const sp = sparseStationsAhead(stations, s.alongM - 3000, r.distanceM, 80);
    if (sp) console.log(`  ⛽ rappel à ${Math.round(s.alongM / 1000)} km : suivante à ${Math.round(sp.gapKm)} km${sp.afterIsArrival ? ' (arrivée)' : ''}`);
  }
}

// Cas purs
const st = (id, alongM) => ({ id, alongM, offRouteM: 0, latitude: 0, longitude: 0, address: null, city: null, prices: {}, shortages: [], automate24: false, hours: null });
check(sparseStationsAhead([st(1, 10_000), st(2, 90_000)], 7000, 120_000, 60)?.station.id === 1, 'portion de 83 km avec 60 km d’autonomie → rappel');
check(sparseStationsAhead([st(1, 10_000), st(2, 30_000)], 7000, 120_000, 60) === null, 'stations rapprochées → rien');
check(sparseStationsAhead([st(1, 10_000), st(2, 90_000)], 7000, 120_000, 300) === null, 'grosse autonomie → rien');
check(sparseStationsAhead([st(1, 10_000)], 7000, 60_000, 50)?.afterIsArrival === true, 'plus rien avant l’arrivée → rappel');
const mon10h = new Date(2026, 9, 19, 10, 0);
const h = { 1: [['08.00', '12.00'], ['14.00', '19.00']], 7: null };
check(stationOpenState({ ...st(1, 0), hours: h }, mon10h).state === 'open', 'ouverte lundi 10 h');
check(stationOpenState({ ...st(1, 0), hours: h }, new Date(2026, 9, 19, 13, 0)).text.includes('ouvre à 14h00'), 'fermée à midi, ouvre à 14h');
check(stationOpenState({ ...st(1, 0), hours: h, automate24: true }, new Date(2026, 9, 25, 10, 0)).state === 'open', 'dimanche fermée mais automate 24/24');

const near = await nearestFuelStations({ latitude: 43.2965, longitude: 5.3698 }, 5);
console.log(`\nMarseille Vieux-Port : ${near.length} stations à < 5 km ; 1re : ${near[0]?.address}, ${stationPrices(near[0]).map((p) => `${p.label} ${formatPrice(p.price)}`).join(', ')}`);
check(near.length > 0 && near.every((s, i) => i === 0 || s.distanceM >= near[i - 1].distanceM - 1), 'recherche Station : triée par distance');
console.log(fails ? `\n${fails} échec(s)` : '\nTout est bon');
process.exit(fails ? 1 : 0);
